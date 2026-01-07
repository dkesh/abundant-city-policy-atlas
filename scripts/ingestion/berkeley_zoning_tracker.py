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

import sys
import csv
import logging
import argparse
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple

from dotenv import load_dotenv
from helpers import normalize_place_name
from db_utils import (
    build_citation_rows,
    bulk_insert_citations,
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_reforms,
    close_db_connection,
    get_db_connection,
    load_reform_type_map,
    log_ingestion,
    place_key,
)

# Load environment variables from .env file
load_dotenv()

# ============================================================================
# CONFIGURATION
# ============================================================================

# Download URL for Zoning Reform Tracker data
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
                'source_url': None,
            })
    return records

# ============================================================================
# DATA PARSING & NORMALIZATION
# ============================================================================

def parse_flexible_date(date_str: Optional[str]) -> Optional[str]:
    """
    Parse flexible date formats:
    - Year only: 2025 → 2025-01-01
    - Year-month: 2025-10 → 2025-10-01
    - Full date: 2025-10-15 → 2025-10-15
    """
    if not date_str or not str(date_str).strip():
        return None
    
    date_str = str(date_str).strip()
    hyphen_count = date_str.count('-')
    
    try:
        if hyphen_count == 0:
            # Format: YYYY
            if len(date_str) == 4 and date_str.isdigit():
                return f"{date_str}-01-01"
        elif hyphen_count == 1:
            # Format: YYYY-MM
            parts = date_str.split('-')
            if len(parts[0]) == 4 and len(parts[1]) == 2:
                return f"{parts[0]}-{parts[1]}-01"
        elif hyphen_count == 2:
            # Format: YYYY-MM-DD (validate by parsing)
            datetime.strptime(date_str, '%Y-%m-%d')
            return date_str
    except (ValueError, IndexError):
        pass
    
    logger.warning(f"  ⚠ Could not parse date: {date_str}")
    return None

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
        'TOD Reform': 'landuse:tod',
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
            'reform_type_id': reform_type_map[reform_code],
            'status': reform_phase,
            'scope': scope,
            'land_use': land_use,
            'adoption_date': adoption_date,
            'summary': summary,
            'requirements': requirements,
            'notes': notes,
            'reform_mechanism': row.get('reform_mechanism'),
            'reform_phase': reform_phase,
            'legislative_number': row.get('legislative_number_policy_name'),
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

def download_zoning_tracker_data(output_file: str = 'zoning-tracker-data.csv') -> str:
    """
    Download Zoning Reform Tracker data from Berkeley
    
    Note: The actual download link may need to be obtained by inspecting
    the website. This is a placeholder that will need manual configuration.
    """
    logger.info(f"Attempting to download Zoning Reform Tracker data...")
    logger.info(f"Visit: {ZONING_TRACKER_URL}")
    logger.info(f"Click 'Download Data' and save to a local file")
    logger.info(f"Then run: python ingest_zoning_tracker.py --file <filename>")
    
    raise ValueError(
        "Automatic download not implemented. "
        "Please manually download the CSV from the Berkeley website and use --file option."
    )

def read_csv_file(filepath: str) -> List[Dict]:
    """Read and parse CSV file"""
    rows = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
        logger.info(f"✓ Read {len(rows)} rows from {filepath}")
        return rows
    except FileNotFoundError:
        logger.error(f"✗ File not found: {filepath}")
        raise
    except Exception as e:
        logger.error(f"✗ Error reading CSV: {e}")
        raise

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
            if not Path(csv_file).exists():
                download_zoning_tracker_data()

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
