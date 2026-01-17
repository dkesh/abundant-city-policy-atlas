#!/usr/bin/env python3

"""
Urbanist Reform Map
Fetches PRN data on cities and counties and ingests into PostgreSQL database.

Usage:
python prn_municipalities.py [--file /path/to/complete-data.json]

Environment Variables:
DATABASE_URL: PostgreSQL connection string (from Neon)
PRN_DATA_URL: URL to PRN data zip file (optional if using --file)
"""

import os
import json
import argparse
import logging
from datetime import datetime
from typing import List, Dict, Tuple, Optional
import tempfile

from helpers import normalize_place_name
from db_utils import (
    build_citation_rows,
    bulk_insert_citations,
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_reforms,
    close_db_connection,
    download_zip_and_extract,
    geocode_missing_places,
    get_db_connection,
    get_state_code,
    load_reform_type_map,
    log_ingestion,
    parse_flexible_date,
    place_key,
    initialize_environment
)

# Load environment variables from .env file
initialize_environment()

# ============================================================================
# LOGGING SETUP
# ============================================================================

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

DATABASE_URL = os.getenv('DATABASE_URL')
PRN_DATA_URL = os.getenv(
    'PRN_DATA_URL',
    'https://parkingreform.org/mandates-map/data/mandates-map-data.zip'
)

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

# Map JSON keys to Universal DB Codes
# Note: add_max reforms are discarded and not recorded
DB_TYPE_MAPPING = {
    'rm_min': 'parking:eliminated',
    'reduce_min': 'parking:reduced'
}

BATCH_SIZE = 500  # Upsert in batches to reduce transaction size

# ============================================================================
# DOWNLOAD & EXTRACT
# ============================================================================


def find_json_file(directory: str) -> str:
    """Find the main JSON data file in extracted directory."""
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.json') and 'complete' in file.lower():
                return os.path.join(root, file)

    raise FileNotFoundError("Could not find JSON data file in extracted directory")


# ============================================================================
# DATA PARSING
# ============================================================================

def parse_prn_data(json_path: str) -> Dict:
    """Parse PRN JSON data. Returns dict with place names as keys."""
    logger.info(f"Parsing data from {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    logger.info(f"Parsed {len(data)} place records")
    return data


def normalize_place_data(raw_data: Dict) -> List[Dict]:
    """
    Normalize PRN place data into flat list of places with embedded reforms.
    Each record in the JSON is a place with potential reforms.
    Reforms are organized by type (rm_min, reduce_min, add_max).
    
    Returns list of normalized place records with embedded reforms.
    """
    normalized = []
    skipped = 0

    for place_key, place_data in raw_data.items():
        # Extract place metadata
        place_info = place_data.get('place', {})
        country = (place_info.get('country') or '').strip()

        # Only process US places
        if country != 'United States':
            continue

        place_type = (place_info.get('type') or 'city').lower()
        place_name = normalize_place_name((place_info.get('name') or '').strip())
        raw_state = (place_info.get('state') or '').strip()
        
        # If this is a state-level record, the place name IS the state name
        if place_type == 'state':
            raw_state = place_name
        
        # Map full state name to state code (e.g. 'Washington' -> 'WA')
        state_code = get_state_code(raw_state)

        # Skip if missing required fields or unknown state
        if not place_name or not raw_state or not state_code:
            skipped += 1
            logger.debug(f"Skipping place due to missing/unknown state: '{raw_state}' for place '{place_name}'")
            continue

        place_record = {
            'name': place_name,
            'state_code': state_code,
            'place_type': place_type,
            'population': place_info.get('pop') or 0,
            'latitude': None,
            'longitude': None,
            'encoded_name': place_info.get('encoded'),
            'reforms': [],
            'place_source_url': place_info.get('url')  # Store for use in reform link_url
        }

        # Parse coordinates
        coord = place_info.get('coord')
        if coord and len(coord) >= 2:
            try:
                place_record['longitude'] = float(coord[0])
                place_record['latitude'] = float(coord[1])
            except (ValueError, TypeError):
                pass

        # Extract reforms by type
        for reform_type in DB_TYPE_MAPPING.keys():
            if reform_type in place_data and place_data[reform_type]:
                for reform in place_data[reform_type]:
                    if not isinstance(reform, dict):
                        continue

                    # Parse adoption date with flexible format handling
                    adoption_date = None
                    date_info = reform.get('date', {})
                    
                    if isinstance(date_info, dict):
                        date_str = date_info.get('raw') or date_info.get('parsed')
                    else:
                        date_str = reform.get('date')
                    
                    if date_str:
                        adoption_date = parse_flexible_date(date_str)
                        if adoption_date is None:
                            logger.debug(f"Could not parse date for reform in {place_name}: {date_str}")

                    # Normalize scope and land use arrays
                    scope = reform.get('scope', [])
                    if isinstance(scope, str):
                        scope = [scope]
                    scope = [s.strip() for s in scope if isinstance(s, str) and s.strip()]

                    land_use = reform.get('land', [])
                    if isinstance(land_use, str):
                        land_use = [land_use]
                    land_use = [l.strip() for l in land_use if isinstance(l, str) and l.strip()]

                    requirements = reform.get('requirements', [])
                    if isinstance(requirements, str):
                        requirements = [requirements]
                    requirements = [r.strip() for r in requirements if isinstance(r, str) and r.strip()]

                    # Extract citations
                    citations = reform.get('citations', [])

                    reform_record = {
                        'reform_type': reform_type,
                        'status': reform.get('status', 'adopted').lower(),
                        'scope': scope,
                        'land_use': land_use,
                        'adoption_date': adoption_date,
                        'summary': reform.get('summary', ''),
                        'reporter': reform.get('reporter', ''),
                        'requirements': requirements,
                        'notes': reform.get('notes', ''),
                        'source_url': reform.get('source_url', ''),
                        'citations': citations,
                        'link_url': place_info.get('url')  # Use place's source_url as link_url
                    }

                    place_record['reforms'].append(reform_record)

        if place_record['reforms']:  # Only add if has reforms
            normalized.append(place_record)

    logger.info(f"Normalized {len(normalized)} places with reforms (skipped {skipped})")
    return normalized


# ============================================================================
def _build_reform_records(
    places_batch: List[Dict],
    place_id_map: Dict[Tuple[str, str, str], int],
    reform_type_map: Dict[str, int],
) -> List[Dict]:
    """Transform normalized place data into reform payloads for upsert."""
    reform_records: List[Dict] = []

    for place in places_batch:
        key = place_key(place['name'], place['state_code'], place['place_type'])
        place_id = place_id_map.get(key)
        if place_id is None:
            logger.warning(f"Place not found after upsert: {key}")
            continue

        for reform in place['reforms']:
            # Map JSON code (rm_min) -> Universal Code (parking:eliminated) -> DB ID
            universal_code = DB_TYPE_MAPPING.get(reform['reform_type'])
            reform_type_id = reform_type_map.get(universal_code)
            
            if reform_type_id is None:
                logger.warning(f"Unknown reform type: {reform['reform_type']} -> {universal_code}")
                continue

            reform_records.append({
                'place_id': place_id,
                'reform_type_ids': [reform_type_id],  # Convert to list for new schema
                'status': reform['status'],
                'scope': reform['scope'],
                'land_use': reform['land_use'],
                'adoption_date': reform['adoption_date'],
                'summary': reform['summary'],
                'requirements': reform['requirements'],
                'notes': reform['notes'],
                'citations': reform.get('citations', []),
                'reform_mechanism': None,
                'reform_phase': None,
                'legislative_number': None,
                'link_url': reform.get('link_url'),  # Set from place's source_url
                # Source-specific fields (for reform_sources table)
                'reporter': reform['reporter'],
                'source_url': reform['source_url'],
                'source_notes': None,
                'is_primary': True
            })

    return reform_records


def ingest_places_batch(
    conn,
    cursor,
    places_batch: List[Dict],
    reform_type_map: Dict[str, int],
) -> Tuple[int, int, int, int]:
    """Upsert places, then reforms and citations for a batch."""
    places_created, places_updated, place_id_map = bulk_upsert_places(conn, cursor, places_batch)
    reform_records = _build_reform_records(places_batch, place_id_map, reform_type_map)

    reforms_created, reforms_updated, reform_ids, deduped_reforms = bulk_upsert_reforms(
        conn, cursor, reform_records
    )

    # Link reforms to PRN source
    bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'PRN')

    # Insert citations
    citation_rows = build_citation_rows(reform_ids, deduped_reforms)
    bulk_insert_citations(conn, cursor, citation_rows)

    return places_created, places_updated, reforms_created, reforms_updated


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Main ingestion process."""
    parser = argparse.ArgumentParser(description='Ingest PRN parking reform data')
    parser.add_argument('--file', help='Path to local JSON data file')
    args = parser.parse_args()

    start_time = datetime.now()
    conn = cursor = None
    temp_dir = None

    try:
        # Get JSON data
        if args.file:
            json_file = args.file
            logger.info(f"Using local file: {json_file}")
        else:
            temp_dir = tempfile.mkdtemp()
            download_zip_and_extract(PRN_DATA_URL, temp_dir)
            json_file = find_json_file(temp_dir)

        # Parse & normalize
        logger.info("Parsing and normalizing data...")
        raw_data = parse_prn_data(json_file)
        normalized_data = normalize_place_data(raw_data)

        # Connect to database and load reform type map
        conn, cursor = get_db_connection(DATABASE_URL)
        reform_type_map = load_reform_type_map(cursor)

        # Ingest in batches
        logger.info(f"Ingesting {len(normalized_data)} places in batches of {BATCH_SIZE}...")

        total_places_created = 0
        total_places_updated = 0
        total_reforms_created = 0
        total_reforms_updated = 0

        for batch_idx in range(0, len(normalized_data), BATCH_SIZE):
            batch = normalized_data[batch_idx:batch_idx + BATCH_SIZE]
            batch_num = batch_idx // BATCH_SIZE + 1

            try:
                places_created, places_updated, reforms_created, reforms_updated = ingest_places_batch(
                    conn, cursor, batch, reform_type_map
                )
                places_count = len(batch)
                total_places_created += places_created
                total_places_updated += places_updated
                total_reforms_created += reforms_created
                total_reforms_updated += reforms_updated

                logger.info(
                    f"Batch {batch_num}: {places_count} places, "
                    f"{reforms_created} new reforms, {reforms_updated} updated"
                )

            except Exception as e:
                logger.error(f"Error ingesting batch {batch_num}: {e}")
                raise

        # Geocode places without coordinates
        geocode_missing_places(conn, cursor)

        # Log
        log_ingestion(
            conn,
            cursor,
            source_name='PRN',
            records_processed=len(normalized_data),
            places_created=total_places_created,
            places_updated=total_places_updated,
            reforms_created=total_reforms_created,
            reforms_updated=total_reforms_updated,
            status='success',
            start_time=start_time,
            source_url=PRN_DATA_URL,
        )

        duration = int((datetime.now() - start_time).total_seconds())

        logger.info(
            f"\n{'='*60}\n"
            f"✓ Ingestion complete in {duration}s\n"
            f" Places: {len(normalized_data)}\n"
            f" Reforms created: {total_reforms_created}\n"
            f" Reforms updated: {total_reforms_updated}\n"
            f"{'='*60}"
        )

    except Exception as e:
        logger.error(f"✗ Ingestion failed: {e}")
        try:
            if conn and cursor:
                log_ingestion(
                    conn,
                    cursor,
                    source_name='PRN',
                    records_processed=0,
                    places_created=0,
                    places_updated=0,
                    reforms_created=0,
                    reforms_updated=0,
                    status='failed',
                    start_time=start_time,
                    source_url=PRN_DATA_URL,
                    error_message=str(e),
                )
        except Exception:
            pass

        raise

    finally:
        close_db_connection(conn, cursor)

        # Cleanup
        if temp_dir:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
