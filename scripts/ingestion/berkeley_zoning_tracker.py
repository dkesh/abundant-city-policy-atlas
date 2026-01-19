#!/usr/bin/env python3
"""
Zoning Reform Tracker Ingestion Script
Loads zoning reform data from Othering & Belonging Institute's Zoning Reform Tracker

Data source: https://belonging.berkeley.edu/zoning-reform-tracker
CSV download: https://belonging.berkeley.edu/zoning-reform-tracker (Download Data button)

Usage:
    # Download and ingest from URL
    python ingest_zoning_tracker.py
    
    # Ingest from local CSV file
    python ingest_zoning_tracker.py --file zoning-tracker-spreadsheet-02-28-2025.csv
    
    # Ingest with custom database URL
    python ingest_zoning_tracker.py --file data.csv --database postgresql://user:pass@localhost/db
"""

import os
import sys
import logging
import argparse
import traceback
import re
from datetime import datetime
from typing import Optional, Dict, List, Tuple

import requests

from helpers import normalize_place_name
from db_utils import (
    build_citation_rows,
    bulk_insert_citations,
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_reforms,
    close_db_connection,
    download_file,
    geocode_missing_places,
    get_db_connection,
    initialize_environment,
    load_reform_type_map,
    log_ingestion,
    normalize_reform_status,
    parse_flexible_date,
    place_key,
    read_csv_file,
    USER_AGENT
)

# Load environment variables from .env file
initialize_environment()

# ============================================================================
# CONFIGURATION
# ============================================================================

# URL for Zoning Reform Tracker (used for both data download and reform links)
ZONING_TRACKER_URL = "https://belonging.berkeley.edu/zoning-reform-tracker"

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Batch size for bulk inserts
BATCH_SIZE = 100

# ============================================================================
# HELPERS
# ============================================================================


def collect_place_records(rows: List[Dict]) -> List[Dict]:
    """Build place payloads from CSV rows."""
    records: List[Dict] = []
    for row in rows:
        state_short = (row.get('state_short') or '').strip()
        municipality_name = normalize_place_name((row.get('municipality_name') or '').strip())
        if state_short and municipality_name:
            records.append({
                'name': municipality_name,
                'place_type': 'city',
                'state_code': state_short,
                'population': None,
                'latitude': None,
                'longitude': None,
                'encoded_name': None,
            })
    return records

# ============================================================================
# DATA PARSING & NORMALIZATION
# ============================================================================

def normalize_reform_type(zrt_type: str) -> Optional[str]:
    """
    Map Zoning Reform Tracker reform type strings to our codes
    
    The ZRT CSV has format like "Plex Reform, ADU Reform" (multiple types separated by comma)
    We'll parse the first primary type or handle multiple
    """
    if not zrt_type:
        return None
    
    # Split by comma for multiple types and take the primary one
    types = [t.strip() for t in str(zrt_type).split(',')]
    
    mapping = {
        'ADU Reform': 'housing:adu',
        'Plex Reform': 'housing:plex',
        'TOD Reform': 'zoning:tod',
        'Other Reform': 'other:general',
    }
    
    # Return the first matching type
    for t in types:
        if t in mapping:
            return mapping[t]
    
    # Default to other if no match
    return 'other:general'


def parse_csv_row(row: Dict, place_id_map: Dict, reform_type_map: Dict) -> Optional[Dict]:
    """Parse a single CSV row into a reform payload for upsert."""
    try:
        state_short = (row.get('state_short') or '').strip()
        municipality_name = normalize_place_name((row.get('municipality_name') or '').strip())
        reform_type_str = (row.get('reform_type') or '').strip()
        reform_phase = (row.get('reform_phase') or '').strip()

        if not all([state_short, municipality_name, reform_type_str]):
            return None

        pid = place_id_map.get(place_key(municipality_name, state_short, 'city'))
        if pid is None:
            logger.debug(f"  ⚠ Unknown place: {(state_short, municipality_name)}")
            return None

        reform_code = normalize_reform_type(reform_type_str)
        if not reform_code or reform_code not in reform_type_map:
            logger.warning(f"  ⚠ Unknown reform type: {reform_type_str} -> {reform_code}")
            return None

        adoption_date = parse_flexible_date(row.get('time_R'))
        raw_scope = row.get('scope') or row.get('category') or ''
        scope = [s.strip() for s in str(raw_scope).split(',') if s.strip()] if raw_scope else None
        land_use = None
        summary = row.get('reform_name') or row.get('legislative_number_policy_name') or row.get('title') or ''
        reporter = row.get('reporter')
        requirements = None
        notes = f"From ZRT: {row.get('time_status', '')}"
        source_url = row.get('primary_source')
        secondary_source = row.get('secondary_source')
        source_notes = f"Secondary: {secondary_source}" if secondary_source else None

        return {
            'place_id': pid,
            'reform_type_ids': [reform_type_map[reform_code]],  # Convert to list for new schema
            'status': normalize_reform_status(reform_phase),
            'scope': scope,
            'land_use': land_use,
            'adoption_date': adoption_date,
            'summary': summary,
            'requirements': requirements,
            'notes': notes,
            'reform_mechanism': row.get('reform_mechanism'),
            'reform_phase': reform_phase,
            'legislative_number': row.get('legislative_number_policy_name'),
            'link_url': ZONING_TRACKER_URL,
            'citations': [],
            # Source-specific fields (for reform_sources table)
            'reporter': reporter,
            'source_url': source_url,
            'source_notes': source_notes,
            'is_primary': True
        }

    except Exception as e:
        logger.error(f"  ✗ Error parsing row: {e}")
        return None

# ============================================================================
# FILE HANDLING
# ============================================================================

def download_zoning_tracker_data(output_file: str = 'zoning-tracker-spreadsheet.csv') -> str:
    """
    Attempt to automatically download the ZRT CSV.
    1) Try to fetch the ZRT page and locate a CSV link.
    2) If not found or request fails, fall back to a known CSV URL.

    Returns the local file path of the downloaded CSV.
    """
    headers = {'User-Agent': USER_AGENT}
    fallback_url = (
        'https://belonging.berkeley.edu/sites/default/files/2025-04/'
        'zoning%20tracker%20spreadsheet%2002-28-2025.csv'
    )

    csv_url: Optional[str] = None

    try:
        resp = requests.get(ZONING_TRACKER_URL, headers=headers, timeout=20)
        resp.raise_for_status()
        html = resp.text

        # Look for a direct CSV link in the page content
        # Common pattern: /sites/default/files/...csv
        match = re.search(r"href=[\"']([^\"']*sites/default/files/[^\"']*\.csv)[\"']", html, re.IGNORECASE)
        if match:
            csv_url = match.group(1)
            # Normalize to absolute URL if needed
            if csv_url.startswith('/'):
                csv_url = 'https://belonging.berkeley.edu' + csv_url
            logger.info(f"Found CSV link on page: {csv_url}")
        else:
            logger.warning("CSV link not found on page; using fallback URL.")
    except Exception as e:
        logger.warning(f"Failed to fetch ZRT page ({e}); using fallback URL.")

    if not csv_url:
        csv_url = fallback_url

    # Download the CSV using generic utility
    return download_file(csv_url, output_file, headers=headers)

# ============================================================================
# MAIN INGESTION
# ============================================================================

def ingest_zoning_tracker(csv_file: Optional[str] = None, database_url: Optional[str] = None) -> Tuple[int, int, int]:
    """
    Main ingestion function
    
    Returns:
        (records_processed, reforms_created, reforms_updated)
    """
    
    start_time = datetime.now()
    conn = cursor = None

    try:
        conn, cursor = get_db_connection(database_url)
        reform_type_map = load_reform_type_map(cursor)

        if not csv_file:
            csv_file = 'zoning-tracker-spreadsheet.csv'
            if not os.path.exists(csv_file):
                csv_file = download_zoning_tracker_data(csv_file)

        rows = read_csv_file(csv_file)

        logger.info("Collecting places from CSV...")
        place_records = collect_place_records(rows)
        places_created, places_updated, place_id_map = bulk_upsert_places(conn, cursor, place_records)
        if place_records:
            logger.info(
                f"Upserted {len(place_records)} places (created {places_created}, updated {places_updated})"
            )

        total_created = 0
        total_updated = 0
        reform_rows: List[Dict] = []

        for i, row in enumerate(rows, 1):
            parsed = parse_csv_row(row, place_id_map, reform_type_map)
            if parsed:
                reform_rows.append(parsed)

            if len(reform_rows) >= BATCH_SIZE or i == len(rows):
                if reform_rows:
                    logger.info(
                        f"Processing batch {(i - 1)//BATCH_SIZE + 1} ({len(reform_rows)} reforms)..."
                    )
                    created, updated, reform_ids, deduped_reforms = bulk_upsert_reforms(
                        conn, cursor, reform_rows
                    )
                    
                    # Link reforms to ZRT source
                    bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'ZRT')
                    
                    citation_rows = build_citation_rows(reform_ids, deduped_reforms)
                    bulk_insert_citations(conn, cursor, citation_rows)
                    total_created += created
                    total_updated += updated
                    reform_rows = []

        # Geocode places without coordinates
        geocode_missing_places(conn, cursor)

        log_ingestion(
            conn,
            cursor,
            source_name='ZRT',
            records_processed=len(rows),
            places_created=places_created,
            places_updated=places_updated,
            reforms_created=total_created,
            reforms_updated=total_updated,
            status='success',
            start_time=start_time,
            source_url=ZONING_TRACKER_URL,
        )

        duration = int((datetime.now() - start_time).total_seconds())
        logger.info("\n" + "="*60)
        logger.info("✓ Ingestion complete!")
        logger.info(f"  Total records processed: {len(rows)}")
        logger.info(f"  Reforms created: {total_created}")
        logger.info(f"  Reforms updated: {total_updated}")
        logger.info(f"  Duration: {duration}s")
        logger.info("="*60 + "\n")


        return len(rows), total_created, total_updated

    except Exception as e:
        logger.error(f"✗ Ingestion failed: {e}")
        traceback.print_exc()
        try:
            if conn and cursor:
                log_ingestion(
                    conn,
                    cursor,
                    source_name='ZRT',
                    records_processed=0,
                    places_created=0,
                    places_updated=0,
                    reforms_created=0,
                    reforms_updated=0,
                    status='failed',
                    start_time=start_time,
                    source_url=ZONING_TRACKER_URL,
                    error_message=str(e),
                )
        except Exception:
            pass
        raise

    finally:
        close_db_connection(conn, cursor)

# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Ingest Zoning Reform Tracker data from Berkeley',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Ingest from local CSV file
  python ingest_zoning_tracker.py --file zoning-tracker-spreadsheet.csv
  
  # Use custom database URL
  python ingest_zoning_tracker.py --file data.csv --database postgresql://user:pass@host/db
        """
    )
    
    parser.add_argument(
        '--file',
        type=str,
        help='Path to CSV file (default: zoning-tracker-spreadsheet.csv)',
        default=None
    )
    
    parser.add_argument(
        '--database',
        type=str,
        help='Database URL (default: $DATABASE_URL)',
        default=None
    )
    
    args = parser.parse_args()
    
    try:
        ingest_zoning_tracker(args.file, args.database)
    except Exception as e:
        sys.exit(1)

if __name__ == '__main__':
    main()
