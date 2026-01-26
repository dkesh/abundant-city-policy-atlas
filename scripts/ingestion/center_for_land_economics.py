#!/usr/bin/env python3
"""
Center for Land Economics Tracker Ingestion Script
Loads land value tax reform data from CLE's Google Sheets tracker

Data source: https://docs.google.com/spreadsheets/d/1sHQlqLK68wM8ODKd8H2xU3SuuTw9Yc2fMBZ7l2fjsdg/edit?gid=0#gid=0

Usage:
    # Download and ingest from Google Sheets
    python center_for_land_economics.py
    
    # Ingest from local CSV file
    python center_for_land_economics.py --file cle-land-value-tax.csv
    
    # Ingest with custom database URL
    python center_for_land_economics.py --file data.csv --database postgresql://user:pass@localhost/db
"""

import os
import sys
import logging
import argparse
import traceback
from datetime import datetime
from typing import Optional, Dict, List, Tuple

from helpers import normalize_place_name
from db_utils import (
    build_citation_rows,
    bulk_insert_citations,
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_policy_documents,
    bulk_upsert_reforms,
    close_db_connection,
    download_file,
    geocode_missing_places,
    get_db_connection,
    get_state_code,
    get_state_name,
    load_reform_type_map,
    log_ingestion,
    normalize_reform_status,
    parse_flexible_date,
    place_key,
    read_csv_file,
    USER_AGENT,
    initialize_environment
)
from scripts.utils.logging_config import setup_database_logging

# Load environment variables from .env file
initialize_environment()

# ============================================================================
# CONFIGURATION
# ============================================================================

# Google Sheets URL for Center for Land Economics Tracker
# Note: The sheet must be "Published to the web" (File > Share > Publish to web) for CSV export to work
GOOGLE_SHEETS_ID = '1sHQlqLK68wM8ODKd8H2xU3SuuTw9Yc2fMBZ7l2fjsdg'
# Use gid=0 to export the first sheet
CLE_CSV_URL = f'https://docs.google.com/spreadsheets/d/{GOOGLE_SHEETS_ID}/export?format=csv&gid=0'

# Source identifier
SOURCE_NAME = 'CLE'

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Setup database logging for activity logs
setup_database_logging()

# Batch size for bulk inserts
BATCH_SIZE = 100

# Reform type code - all CLE reforms are land value tax
REFORM_TYPE_CODE = 'other:land_value_tax'

# ============================================================================
# DATA PARSING & NORMALIZATION
# ============================================================================

def find_column(row: Dict, possible_names: List[str]) -> Optional[str]:
    """
    Find a column value by trying multiple possible column names.
    Returns the first non-empty value found, or None.
    """
    for name in possible_names:
        value = row.get(name, '').strip()
        if value:
            return value
    return None


def parse_csv_row(row: Dict, reform_type_map: Dict[str, int]) -> Optional[Tuple[Dict, Optional[Dict], Dict]]:
    """
    Parse a single CSV row into (place_record, optional_policy_doc_record, reform_record).
    Returns None if row is invalid or missing required fields.
    
    Expected column names from CLE spreadsheet:
    - Place, State, Place Type, Status, Note, Link1 Text, Link1 URL, Link2 Text, Link2 URL
    """
    try:
        # Extract fields (with flexible fallbacks for common variations)
        place_name = find_column(row, [
            'Place', 'Location', 'City', 'Municipality', 'Jurisdiction',
            'City/Place', 'Place Name', 'City Name'
        ])
        
        # Extract state fields
        state_name = find_column(row, [
            'State', 'State Code', 'State/Province', 'State Name',
            'Province', 'Province/State'
        ])
        
        # Extract place type (State, City, etc.)
        place_type_str = find_column(row, [
            'Place Type', 'Type', 'Location Type'
        ])
        
        # Extract status
        status = find_column(row, [
            'Status', 'Bill Status', 'Reform Status', 'Current Status'
        ])
        
        # Extract note/description
        note = find_column(row, [
            'Note', 'Notes', 'Description', 'Summary', 'Details', 'Bill Summary',
            'Reform Description', 'Overview'
        ])
        
        # Extract URLs (Link1 URL is primary, Link2 URL is secondary)
        link1_url = find_column(row, [
            'Link1 URL', 'Link 1 URL', 'URL', 'Link', 'Source URL', 'Document URL', 
            'Bill URL', 'Reference URL'
        ])
        link2_url = find_column(row, [
            'Link2 URL', 'Link 2 URL', 'Secondary URL'
        ])
        
        # Extract link text (for policy document title/reference)
        link1_text = find_column(row, [
            'Link1 Text', 'Link 1 Text', 'Title', 'Bill', 'Bill Number', 
            'Reference', 'Bill Reference', 'Legislative Number'
        ])
        link2_text = find_column(row, [
            'Link2 Text', 'Link 2 Text', 'Secondary Link Text'
        ])
        
        # Use Link1 URL as primary URL
        url = link1_url or link2_url
        
        # Skip rows missing critical fields (need at least place or state)
        if not place_name and not state_name:
            return None
        
        # Determine if this is a state-level or city-level reform
        state_code = None
        municipality_name = None
        
        # Get state code from State column
        if state_name:
            state_code = get_state_code(state_name)
            if not state_code:
                logger.warning(f"Unknown state: {state_name}")
                return None
        
        # Determine place type based on Place Type column or by checking if Place is a state name
        place_type_lower = (place_type_str or '').lower() if place_type_str else ''
        
        # Check if Place is a state name
        if place_name:
            place_state_code = get_state_code(place_name)
            if place_state_code:
                # Place is a state name, use it as state-level reform
                if not state_code:
                    state_code = place_state_code
                municipality_name = None
            elif place_type_lower == 'city' or (not place_type_str and place_name and state_code):
                # Place is a city
                municipality_name = normalize_place_name(place_name)
            elif place_type_lower == 'state':
                # Place Type explicitly says "State", so treat Place as state name
                if not state_code:
                    state_code = get_state_code(place_name)
                    if not state_code:
                        logger.warning(f"Place Type is 'State' but Place '{place_name}' is not a recognized state")
                        return None
                municipality_name = None
            else:
                # Try to infer - if we have both Place and State, assume Place is city
                if state_code:
                    municipality_name = normalize_place_name(place_name)
                else:
                    # Only Place, no State - try to treat as state name
                    state_code = get_state_code(place_name)
                    if not state_code:
                        logger.warning(f"Could not determine if '{place_name}' is a state or city")
                        return None
        
        # Require at least state_code for place creation
        if not state_code:
            logger.warning(f"Could not determine state for row: {row}")
            return None
        
        # Create place record based on whether we have a municipality
        if municipality_name and state_code:
            # City-level reform
            place_record = {
                'name': municipality_name,
                'place_type': 'city',
                'state_code': state_code,
                'population': None,
                'latitude': None,
                'longitude': None,
                'encoded_name': None,
            }
        else:
            # State-level reform
            state_full_name = get_state_name(state_code) or state_name
            place_record = {
                'name': state_full_name,
                'place_type': 'state',
                'state_code': state_code,
                'population': None,
                'latitude': None,
                'longitude': None,
                'encoded_name': None,
            }
        
        # Create optional policy document record if we have a bill reference (Link1 Text)
        policy_doc_record = None
        if link1_text:
            reference_number = link1_text
            policy_doc_record = {
                'reference_number': reference_number,
                'state_code': state_code,
                'place_id': None,  # Will be set after place upsert
                'title': link1_text,
                'key_points': [note] if note else [],
                'analysis': None,
                'document_url': link1_url if link1_url else None,
                'status': normalize_reform_status(status) if status else None,
                'last_action_date': None,
            }
        
        # Get reform type ID (always land value tax for CLE)
        reform_type_id = reform_type_map.get(REFORM_TYPE_CODE)
        if not reform_type_id:
            logger.error(f"Reform type '{REFORM_TYPE_CODE}' not found in database")
            return None
        
        # Build citations from multiple links if available
        citations = []
        if link1_url and link1_url.startswith('http'):
            citations.append({
                'description': link1_text if link1_text else 'Primary source',
                'url': link1_url,
                'notes': None
            })
        if link2_url and link2_url.startswith('http'):
            citations.append({
                'description': link2_text if link2_text else 'Secondary source',
                'url': link2_url,
                'notes': None
            })
        
        # Create reform record
        reform_record = {
            'place_id': None,  # Will be set after place upsert
            'reform_type_id': reform_type_id,
            'policy_document_id': None,  # Will be set after policy_doc upsert if applicable
            'status': normalize_reform_status(status) if status else None,
            'scope': None,
            'land_use': None,
            'adoption_date': None,  # No date column in spreadsheet
            'summary': note if note else None,
            'requirements': None,
            'notes': None,
            'reform_mechanism': None,
            'reform_phase': None,
            'legislative_number': link1_text if link1_text else None,
            'link_url': 'https://landeconomics.org/problem#legislation',
            'citations': citations,
            # Source-specific fields (for reform_sources table)
            'reporter': None,
            'source_url': link1_url if link1_url else link2_url,
            'source_notes': None,
            'is_primary': True
        }
        
        return (place_record, policy_doc_record, reform_record)
        
    except Exception as e:
        logger.error(f"  ✗ Error parsing row: {e}")
        traceback.print_exc()
        return None


# ============================================================================
# FILE HANDLING
# ============================================================================

def download_cle_data(output_file: str = 'cle-land-value-tax.csv') -> str:
    """
    Download the Center for Land Economics Google Sheet as CSV.
    
    IMPORTANT: The Google Sheet must be "Published to the web" for CSV export to work.
    This is different from "Anyone with the link can view":
    - Go to File > Share > Publish to web
    - Select "Web page" or "CSV" format
    - Click "Publish"
    
    Returns the local file path of the downloaded CSV.
    
    Raises:
        HTTPError: If the sheet is not published to the web (400 error)
    """
    headers = {'User-Agent': USER_AGENT}
    return download_file(CLE_CSV_URL, output_file, headers=headers)


# ============================================================================
# MAIN INGESTION
# ============================================================================

def ingest_cle_data(csv_file: Optional[str] = None, database_url: Optional[str] = None) -> Tuple[int, int, int]:
    """
    Main ingestion function
    
    Returns:
        (records_processed, reforms_created, reforms_updated)
    """
    
    start_time = datetime.now()
    conn = cursor = None
    
    # Log start of ingestion
    logger.info(
        "Starting CLE ingestion",
        extra={
            "log_type": "ingestion",
            "action": "center_for_land_economics",
            "status": "running"
        }
    )
    
    try:
        conn, cursor = get_db_connection(database_url)
        reform_type_map = load_reform_type_map(cursor)
        
        # Verify reform type exists
        if REFORM_TYPE_CODE not in reform_type_map:
            raise ValueError(f"Reform type '{REFORM_TYPE_CODE}' not found in database. Please ensure it exists in reform_types table.")
        
        if not csv_file:
            csv_file = 'cle-land-value-tax.csv'
            if not os.path.exists(csv_file):
                csv_file = download_cle_data(csv_file)
        
        rows = read_csv_file(csv_file)
        
        # Parse rows into place, policy_doc, and reform records
        place_records = []
        policy_doc_records = []
        reform_records = []
        place_key_to_record = {}  # Track place_key -> place_record for deduplication
        
        logger.info("Parsing CSV rows...")
        for row in rows:
            parsed = parse_csv_row(row, reform_type_map)
            if parsed:
                place_rec, policy_doc_rec, reform_rec = parsed
                
                # Dedupe places by place_key
                place_key_val = place_key(
                    place_rec['name'],
                    place_rec['state_code'],
                    place_rec['place_type']
                )
                if place_key_val not in place_key_to_record:
                    place_key_to_record[place_key_val] = place_rec
                    place_records.append(place_rec)
                
                if policy_doc_rec:
                    policy_doc_records.append(policy_doc_rec)
                
                # Store reform with place_key and optional policy doc reference
                reform_records.append((
                    reform_rec,
                    place_key_val,
                    policy_doc_rec['reference_number'] if policy_doc_rec else None
                ))
        
        # Upsert places
        logger.info(f"Upserting {len(place_records)} places...")
        places_created, places_updated, place_id_map = bulk_upsert_places(conn, cursor, place_records)
        logger.info(f"Places: {places_created} created, {places_updated} updated")
        
        # Upsert policy documents (if any)
        docs_created = 0
        docs_updated = 0
        doc_id_map = {}
        if policy_doc_records:
            logger.info(f"Upserting {len(policy_doc_records)} policy documents...")
            docs_created, docs_updated, doc_id_map = bulk_upsert_policy_documents(conn, cursor, policy_doc_records)
            logger.info(f"Policy documents: {docs_created} created, {docs_updated} updated")
        
        # Build reform records with place_id and policy_document_id
        final_reform_records = []
        for reform_rec, place_key_val, ref_number in reform_records:
            # Get place_id
            place_id = place_id_map.get(place_key_val)
            if not place_id:
                logger.warning(f"Place ID not found for {place_key_val}")
                continue
            
            # Get policy_document_id if applicable
            doc_id = None
            if ref_number:
                # Find policy doc by state_code and reference_number
                for (state_code, ref), doc_id_val in doc_id_map.items():
                    if ref == ref_number:
                        doc_id = doc_id_val
                        break
            
            reform_rec['place_id'] = place_id
            reform_rec['policy_document_id'] = doc_id
            final_reform_records.append(reform_rec)
        
        # Upsert reforms in batches
        total_created = 0
        total_updated = 0
        
        for batch_idx in range(0, len(final_reform_records), BATCH_SIZE):
            batch = final_reform_records[batch_idx:batch_idx + BATCH_SIZE]
            batch_num = batch_idx // BATCH_SIZE + 1
            
            logger.info(f"Processing batch {batch_num} ({len(batch)} reforms)...")
            
            created, updated, reform_ids, deduped_reforms = bulk_upsert_reforms(
                conn, cursor, batch
            )
            
            # Link reforms to CLE source
            bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'CLE')
            
            # Insert citations
            citation_rows = build_citation_rows(reform_ids, deduped_reforms)
            bulk_insert_citations(conn, cursor, citation_rows)
            
            total_created += created
            total_updated += updated
        
        # Geocode places without coordinates
        geocode_missing_places(conn, cursor)
        
        # Log ingestion
        log_ingestion(
            conn,
            cursor,
            source_name=SOURCE_NAME,
            records_processed=len(rows),
            places_created=places_created,
            places_updated=places_updated,
            reforms_created=total_created,
            reforms_updated=total_updated,
            status='success',
            start_time=start_time,
            source_url=CLE_CSV_URL,
        )
        
        duration = int((datetime.now() - start_time).total_seconds())
        logger.info("\n" + "="*60)
        logger.info("✓ Ingestion complete!")
        logger.info(f"  Total records processed: {len(rows)}")
        if policy_doc_records:
            logger.info(f"  Policy documents: {docs_created} created, {docs_updated} updated")
        logger.info(f"  Reforms created: {total_created}")
        logger.info(f"  Reforms updated: {total_updated}")
        logger.info(f"  Duration: {duration}s")
        logger.info("="*60 + "\n")
        
        return len(rows), total_created, total_updated
        
    except Exception as e:
        logger.error(f"✗ Ingestion failed: {e}")
        traceback.print_exc()
        duration = int((datetime.now() - start_time).total_seconds())
        
        # Log to activity_logs table
        logger.error(
            "CLE ingestion failed",
            extra={
                "log_type": "ingestion",
                "action": "center_for_land_economics",
                "status": "failed",
                "error_message": str(e),
                "duration_seconds": duration
            }
        )
        
        try:
            if conn and cursor:
                log_ingestion(
                    conn,
                    cursor,
                    source_name=SOURCE_NAME,
                    records_processed=0,
                    places_created=0,
                    places_updated=0,
                    reforms_created=0,
                    reforms_updated=0,
                    status='failed',
                    start_time=start_time,
                    source_url=CLE_CSV_URL,
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
        description='Ingest Center for Land Economics Tracker data from Google Sheets',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Ingest from Google Sheets (downloads CSV automatically)
  python center_for_land_economics.py
  
  # Ingest from local CSV file
  python center_for_land_economics.py --file cle-land-value-tax.csv
  
  # Use custom database URL
  python center_for_land_economics.py --file data.csv --database postgresql://user:pass@host/db
        """
    )
    
    parser.add_argument(
        '--file',
        type=str,
        help='Path to CSV file (default: cle-land-value-tax.csv)',
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
        ingest_cle_data(args.file, args.database)
    except Exception as e:
        sys.exit(1)


if __name__ == '__main__':
    main()
