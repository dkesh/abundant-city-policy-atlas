#!/usr/bin/env python3
"""
PRN State Legislation Tracker Ingestion Script
Loads state-level parking reform legislation data from PRN's Google Sheets tracker

Data source: https://docs.google.com/spreadsheets/d/1tWf5uOA0ly_Izt8whVnYkPysO3GsQhceqtEBWKwZL1c/edit?usp=sharing

Usage:
    # Download and ingest from Google Sheets
    python prn_state_legislation.py
    
    # Ingest from local CSV file
    python prn_state_legislation.py --file prn-state-legislation.csv
    
    # Ingest with custom database URL
    python prn_state_legislation.py --file data.csv --database postgresql://user:pass@localhost/db
"""

import os
import sys
import logging
import argparse
import traceback
from datetime import datetime
from typing import Optional, Dict, List, Tuple

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
    place_key,
    read_csv_file,
    USER_AGENT,
    initialize_environment
)

# Load environment variables from .env file
initialize_environment()

# ============================================================================
# CONFIGURATION
# ============================================================================

# Google Sheets URL for PRN State Legislation Tracker
# Note: The sheet must be "Published to the web" (File > Share > Publish to web) for CSV export to work
GOOGLE_SHEETS_ID = '1tWf5uOA0ly_Izt8whVnYkPysO3GsQhceqtEBWKwZL1c'
# Try without gid parameter first (exports first sheet), fallback to gid=0 if needed
PRN_STATE_LEGISLATION_CSV_URL = f'https://docs.google.com/spreadsheets/d/{GOOGLE_SHEETS_ID}/export?format=csv'

# Source identifier
SOURCE_NAME = 'PRN State Legislation'

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Batch size for bulk inserts
BATCH_SIZE = 100

# ============================================================================
# DATA PARSING & NORMALIZATION
# ============================================================================

def infer_parking_reform_type(summary: str, title: str) -> str:
    """
    Infer parking reform type from bill summary/title.
    Returns 'parking:eliminated', 'parking:reduced', or 'parking:unspecified'
    """
    if not summary and not title:
        return 'parking:unspecified'
    
    text = f"{summary or ''} {title or ''}".lower()
    
    # Keywords for elimination (complete)
    if any(word in text for word in ['eliminate', 'elimination', 'repeal', 'remove', 'no parking required', 
                                      'zero parking', 'no minimum', 'eliminated']):
        return ('parking:off-street_mandates', 'complete')
    
    # Keywords for reduction (partial)
    if any(word in text for word in ['reduce', 'reduction', 'lower', 'decrease', 'reduced', 'lowered']):
        return ('parking:off-street_mandates', 'partial')
    
    # Default to unspecified
    return ('parking:unspecified', None)


def parse_csv_row(row: Dict, reform_type_map: Dict[str, int]) -> Optional[Tuple[Dict, Dict, Dict]]:
    """
    Parse a single CSV row into (place_record, policy_doc_record, reform_record).
    Returns None if row is invalid or missing required fields.
    """
    try:
        # Extract fields (CSV headers may vary, trying common variations)
        state_name = (row.get('State') or '').strip()
        bill_ref = (row.get('Bill Supported') or row.get('Bill') or '').strip()
        session = (row.get('Legislative Session') or row.get('Session') or '').strip()
        bill_status = (row.get('Bill Status') or row.get('Status') or '').strip()
        status_notes = (row.get('Status Notes') or '').strip()
        update_link = (row.get('Link to Most Recent Update') or row.get('Update Link') or '').strip()
        bill_title = (row.get('Bill Title') or row.get('Title') or '').strip()
        bill_summary = (row.get('Bill Summary') or row.get('Summary') or '').strip()
        media_coverage = (row.get('Links to media coverage') or row.get('Media Coverage') or '').strip()
        testimony_links = (row.get('Links to submitted testimony') or row.get('Testimony Links') or '').strip()
        
        # Skip rows missing critical fields
        if not state_name or not bill_ref:
            return None
        
        # Get state code
        state_code = get_state_code(state_name)
        if not state_code:
            logger.warning(f"Unknown state: {state_name}")
            return None
        
        # Create place record (state-level)
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
        
        # Create policy document record
        # Build full reference number (e.g., "SB 5184 (2025)")
        reference_number = bill_ref
        if session:
            reference_number = f"{bill_ref} ({session})"
        
        policy_doc_record = {
            'reference_number': reference_number,
            'state_code': state_code,
            'place_id': None,  # State-level bills don't have place_id
            'title': bill_title or bill_ref,
            'key_points': [bill_summary] if bill_summary else [],
            'analysis': status_notes if status_notes else None,
            'document_url': update_link if update_link else None,
            'status': normalize_reform_status(bill_status),
            'last_action_date': None,  # Could parse from status notes if available
        }
        
        # Determine parking reform type and intensity
        reform_code, intensity = infer_parking_reform_type(bill_summary, bill_title)
        reform_type_id = reform_type_map.get(reform_code)
        
        if not reform_type_id:
            logger.warning(f"Unknown reform type code: {reform_code}")
            return None
        
        # Build citations from media coverage and testimony links
        citations = []
        if media_coverage:
            # Split by common delimiters (newline, comma, semicolon)
            for url in media_coverage.replace('\n', ',').replace(';', ',').split(','):
                url = url.strip()
                if url and url.startswith('http'):
                    citations.append({
                        'description': 'Media coverage',
                        'url': url,
                        'notes': None
                    })
        
        if testimony_links:
            for url in testimony_links.replace('\n', ',').replace(';', ',').split(','):
                url = url.strip()
                if url and url.startswith('http'):
                    citations.append({
                        'description': 'Submitted testimony',
                        'url': url,
                        'notes': None
                    })
        
        # Create reform record (place_id will be set after place upsert)
        reform_record = {
            'place_id': None,  # Will be set after place upsert
            'reform_type_ids': [reform_type_id],  # Convert to list for new schema
            'policy_document_id': None,  # Will be set after policy_doc upsert
            'status': normalize_reform_status(bill_status),
            'scope': None,
            'land_use': None,
            'adoption_date': None,  # Could parse from status if available
            'summary': bill_summary,
            'requirements': None,
            'notes': status_notes if status_notes else None,
            'reform_mechanism': 'Legislation',
            'reform_phase': session if session else None,
            'legislative_number': bill_ref,
            'link_url': 'https://parkingreform.org/resources/state-legislation-map/',
            'intensity': intensity,  # Set intensity for parking reforms
            'citations': citations,
            # Source-specific fields (for reform_sources table)
            'reporter': None,
            'source_url': update_link if update_link else None,
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

def download_prn_state_legislation_data(output_file: str = 'prn-state-legislation.csv') -> str:
    """
    Download the PRN State Legislation Tracker Google Sheet as CSV.
    
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
    return download_file(PRN_STATE_LEGISLATION_CSV_URL, output_file, headers=headers)


# ============================================================================
# MAIN INGESTION
# ============================================================================

def ingest_prn_state_legislation(csv_file: Optional[str] = None, database_url: Optional[str] = None) -> Tuple[int, int, int]:
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
            csv_file = 'prn-state-legislation.csv'
            if not os.path.exists(csv_file):
                csv_file = download_prn_state_legislation_data(csv_file)
        
        rows = read_csv_file(csv_file)
        
        # Parse rows into place, policy_doc, and reform records
        place_records = []
        policy_doc_records = []
        reform_records = []
        state_to_place = {}  # Track state_code -> place_record
        
        logger.info("Parsing CSV rows...")
        for row in rows:
            parsed = parse_csv_row(row, reform_type_map)
            if parsed:
                place_rec, policy_doc_rec, reform_rec = parsed
                
                # Dedupe places by state_code
                state_code = place_rec['state_code']
                if state_code not in state_to_place:
                    state_to_place[state_code] = place_rec
                    place_records.append(place_rec)
                
                policy_doc_records.append(policy_doc_rec)
                reform_records.append((reform_rec, state_code, policy_doc_rec['reference_number']))
        
        # Upsert places (states)
        logger.info(f"Upserting {len(place_records)} places (states)...")
        places_created, places_updated, place_id_map = bulk_upsert_places(conn, cursor, place_records)
        logger.info(f"Places: {places_created} created, {places_updated} updated")
        
        # Upsert policy documents
        logger.info(f"Upserting {len(policy_doc_records)} policy documents...")
        docs_created, docs_updated, doc_id_map = bulk_upsert_policy_documents(conn, cursor, policy_doc_records)
        logger.info(f"Policy documents: {docs_created} created, {docs_updated} updated")
        
        # Build reform records with place_id and policy_document_id
        final_reform_records = []
        for reform_rec, state_code, ref_number in reform_records:
            # Get place_id
            state_name = get_state_name(state_code) or state_code
            place_key_val = place_key(state_name, state_code, 'state')
            place_id = place_id_map.get(place_key_val)
            
            if not place_id:
                logger.warning(f"Place ID not found for {state_code}")
                continue
            
            # Get policy_document_id
            doc_id = doc_id_map.get((state_code, ref_number))
            
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
            
            # Link reforms to PRN source
            bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'PRN')
            
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
            source_url=PRN_STATE_LEGISLATION_CSV_URL,
        )
        
        duration = int((datetime.now() - start_time).total_seconds())
        logger.info("\n" + "="*60)
        logger.info("✓ Ingestion complete!")
        logger.info(f"  Total records processed: {len(rows)}")
        logger.info(f"  Policy documents: {docs_created} created, {docs_updated} updated")
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
                    source_name=SOURCE_NAME,
                    records_processed=0,
                    places_created=0,
                    places_updated=0,
                    reforms_created=0,
                    reforms_updated=0,
                    status='failed',
                    start_time=start_time,
                    source_url=PRN_STATE_LEGISLATION_CSV_URL,
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
        description='Ingest PRN State Legislation Tracker data from Google Sheets',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Ingest from Google Sheets (downloads CSV automatically)
  python prn_state_legislation.py
  
  # Ingest from local CSV file
  python prn_state_legislation.py --file prn-state-legislation.csv
  
  # Use custom database URL
  python prn_state_legislation.py --file data.csv --database postgresql://user:pass@host/db
        """
    )
    
    parser.add_argument(
        '--file',
        type=str,
        help='Path to CSV file (default: prn-state-legislation.csv)',
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
        ingest_prn_state_legislation(args.file, args.database)
    except Exception as e:
        sys.exit(1)


if __name__ == '__main__':
    main()
