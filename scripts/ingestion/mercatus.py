#!/usr/bin/env python3
"""
Ingestion script for Mercatus Center 2025 Housing Bills.
Source: CSV File (database/testdata/mercatus-2025-housing-bills.csv)
"""

import logging
import os
import sys
import argparse
from datetime import datetime
from typing import Dict, List, Set, Tuple

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db_utils import (
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_policy_documents,
    bulk_upsert_reforms,
    close_db_connection,
    download_file,
    geocode_missing_places,
    get_db_connection,
    get_state_name,
    initialize_environment,
    log_ingestion,
    normalize_reform_status,
    parse_flexible_date,
    place_key,
    read_csv_file
)

# Load environment variables
initialize_environment()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MERCATUS_SOURCE = 'Mercatus (2025 Housing Bills)'
MERCATUS_REFORM_TRACKER_URL = 'https://www.quorum.us/spreadsheet/external/vehiYnJcriswPJrHpUKe/'
MERCATUS_CSV_URL = (
    MERCATUS_REFORM_TRACKER_URL +
    '?format=csv&exclude=%7B%7D&is_public_sheet_download=true&searchingValue=%7B%7D&sortType=2'
)

# Mapping from Mercatus Issue tags to Universal Reform Codes
# Note: anti-investor and anti-trust are discarded and not recorded
MERCATUS_TYPE_MAPPING = {
    'adu': 'housing:adu',
    'adus': 'housing:adu',
    'building code': 'building:unspecified',
    'permitting': 'process:permitting',
    'urbanity': 'other:urbanity',
    'parking': 'parking:unspecified',
    'minimum lot size': 'physical:lot_size',
    'tod': 'zoning:tod',
    'far': 'physical:far',
    'floor area ratio': 'physical:far',
    'height limit': 'physical:height',
    'missing middle': 'housing:plex',
    'shot clock': 'process:permitting',
    'shot clocks': 'process:permitting',
    'vesting': 'process:permitting',
    'townhouses': 'housing:plex',
    'ricz': 'zoning:ricz',
    'yigby': 'zoning:yigby',
    'courts': 'process:courts_appeals',
    'appeals': 'process:courts_appeals',
    'planning': 'process:planning_obligations',
    'obligations': 'process:planning_obligations',
    'other': 'other:general'
}

# Status mapping
STATUS_MAP = {
    'Effective': 'Adopted',
    'Enacted': 'Adopted',
    'Signed by Governor': 'Adopted',
    'Passed Original Chamber': 'Proposed',
    'Passed Second Chamber': 'Proposed',
    'Introduced or Prefiled': 'Proposed',
    'In Committee': 'Proposed',
    'Out of Committee': 'Proposed',
    'Failed': 'Failed',
    'Vetoed': 'Failed',
    'Died': 'Failed',
}


def parse_bill_field(text: str) -> Tuple[str, str]:
    """Splits 'Ref: Title' into (Ref, Title)."""
    if ':' in text:
        parts = text.split(':', 1)
        return parts[0].strip(), parts[1].strip()
    return text.strip(), ""


def ensure_reform_types(conn, cursor, issues: Set[str]) -> Dict[str, int]:
    """
    Maps Mercatus issues to Universal Reform Types.
    Returns mapping of lowercase issue name -> reform_type_id.
    """
    # 1. Load Universal Map (code -> id)
    cursor.execute("SELECT id, code FROM reform_types")
    code_to_id = {code: rid for rid, code in cursor.fetchall()}
    
    mapping = {}
    
    for issue in issues:
        issue_lower = issue.lower().strip()
        
        # Try mapped lookup
        universal_code = MERCATUS_TYPE_MAPPING.get(issue_lower)
        
        # Skip anti-investor and anti-trust (discard)
        if issue_lower in ['anti-investor', 'anti-trust', 'anti investor', 'anti trust']:
            continue
        
        # Heuristics/Fallbacks
        if not universal_code:
            if 'adu' in issue_lower: universal_code = 'housing:adu'
            elif 'parking' in issue_lower: universal_code = 'parking:unspecified'
            elif 'permit' in issue_lower or 'shot clock' in issue_lower or 'vesting' in issue_lower: universal_code = 'process:permitting'
            elif 'courts' in issue_lower or 'appeals' in issue_lower: universal_code = 'process:courts_appeals'
            elif 'planning' in issue_lower or 'obligations' in issue_lower: universal_code = 'process:planning_obligations'
            elif 'ricz' in issue_lower: universal_code = 'zoning:ricz'
            elif 'yigby' in issue_lower: universal_code = 'zoning:yigby'
            elif 'tod' in issue_lower: universal_code = 'zoning:tod'
            elif 'lot size' in issue_lower: universal_code = 'physical:lot_size'
            elif 'height' in issue_lower and 'limit' in issue_lower: universal_code = 'physical:height'
            elif 'far' in issue_lower or 'floor area ratio' in issue_lower: universal_code = 'physical:far'
            elif 'stair' in issue_lower: universal_code = 'building:stairwells'
            elif 'elevator' in issue_lower: universal_code = 'building:elevators'
            elif 'building' in issue_lower: universal_code = 'building:unspecified'
            elif 'urbanity' in issue_lower: universal_code = 'other:urbanity'
            else: universal_code = 'other:general'
        
        if universal_code in code_to_id:
            mapping[issue.lower()] = code_to_id[universal_code]
        else:
            logger.warning(f"  ⚠ Could not map issue '{issue}' to universal code '{universal_code}' (ID not found in DB)")
            # Fallback to 'other:general' if valid
            if 'other:general' in code_to_id:
                mapping[issue.lower()] = code_to_id['other:general']
            
    return mapping

def main():
    parser = argparse.ArgumentParser(description='Ingest Mercatus housing bills CSV.')
    parser.add_argument('--file', required=False, help='Path to the Mercatus CSV file')
    parser.add_argument('--url', required=False, default=MERCATUS_CSV_URL,
                        help='CSV URL to download if --file is not provided or missing')
    parser.add_argument('--out', required=False, default='mercatus-2025-housing-bills.csv',
                        help='Output filename when downloading the CSV')
    args = parser.parse_args()

    csv_path = args.file
    if not csv_path or not os.path.exists(csv_path):
        logger.info("No local CSV provided or file not found; fetching from web...")
        csv_path = download_file(args.url, args.out)

    conn, cursor = get_db_connection()
    
    try:
        # 1. Read CSV and Collect Data
        raw_places = [] # For 'state' places
        policy_docs = []
        bill_data = [] # Temporary storage
        all_issues = set()
        
        rows = read_csv_file(csv_path)
        for row in rows:
                # Headers: '2025 Housing Bills', 'Region Abbreviation ', 'Issues', 'Custom Description', 
                # 'Status Text', 'Sponsors List', 'Date Introduced', 'Last Timeline Action Date', 
                # 'Future Hearing Dates', 'Source Link'
                
                # Careful with trailing spaces in headers
                ref_title = row.get('2025 Housing Bills')
                state_code = row.get('Region Abbreviation ', '').strip()
                issues_str = row.get('Issues')
                desc = row.get('Custom Description')
                status_text = row.get('Status Text')
                date_intro = row.get('Date Introduced')
                last_action = row.get('Last Timeline Action Date')
                source_link = row.get('Source Link')
                
                if not ref_title or not state_code:
                    continue
                    
                ref, title = parse_bill_field(ref_title)
                status = normalize_reform_status(status_text)
                
                # Collect Place (State)
                state_name = get_state_name(state_code) or state_code
                raw_places.append({
                    'name': state_name,
                    'place_type': 'state',
                    'state_code': state_code
                })
                
                # Collect Policy Doc
                # Determine place_id placeholder? No, policy doc links to state_code directly if it's a state bill.
                # If local, we need place_id. Mercatus seems to be State bills mostly?
                # Looking at "Region Abbreviation": "NJ", "DC", "MA". These are states (and DC).
                
                doc = {
                    'reference_number': ref,
                    'state_code': state_code,
                    'place_id': None, # Linked later if needed, but schema uses state_code OR place_id.
                    'title': title,
                    'key_points': [desc] if desc else [],
                    'analysis': None,
                    'document_url': source_link,
                    'status': status,
                    'last_action_date': parse_flexible_date(last_action)
                }
                policy_docs.append(doc)
                
                # Collect Issues
                issues_list = [i.strip() for i in issues_str.split(',')] if issues_str else []
                for i in issues_list:
                    all_issues.add(i)
                    
                bill_data.append({
                    'ref': ref,
                    'state_code': state_code,
                    'issues': issues_list,
                    'date': parse_flexible_date(date_intro),
                    'status': status,
                    'desc': desc
                })

        # 2. Upsert Places (States)
        logger.info(f"Upserting {len(raw_places)} places...")
        p_created, p_updated, place_map = bulk_upsert_places(conn, cursor, raw_places)
        logger.info(f"Places: {p_created} created, {p_updated} updated.")
        
        # 3. Upsert Policy Documents
        logger.info(f"Upserting {len(policy_docs)} policy documents...")
        d_created, d_updated, doc_map = bulk_upsert_policy_documents(conn, cursor, policy_docs)
        logger.info(f"Documents: {d_created} created, {d_updated} updated.")
        
        # 4. Upsert Reform Types
        logger.info("Syncing reform types...")
        reform_type_map = ensure_reform_types(conn, cursor, all_issues)
        
        # 5. Construct Reforms
        reforms_to_insert = []
        for bill in bill_data:
            # Reform needs: place_id, reform_type_ids (list), status, etc.
            # place_id: from place_map using state
            state_name = get_state_name(bill['state_code']) or bill['state_code']
            place_key_val = place_key(state_name, bill['state_code'], 'state')
            place_id = place_map.get(place_key_val)
            
            if not place_id:
                logger.warning(f"Place ID not found for {place_key_val}")
                continue
                
            doc_id = doc_map.get((bill['state_code'], bill['ref']))
            
            # Get source URL from policy doc
            source_url = None
            for doc in policy_docs:
                if doc['reference_number'] == bill['ref'] and doc['state_code'] == bill['state_code']:
                    source_url = doc.get('document_url')
                    break
            
            # Collect all reform_type_ids for this bill (one reform with multiple types)
            reform_type_ids = []
            for issue in bill['issues']:
                issue_lower = issue.lower().strip()
                # Skip anti-investor and anti-trust (discard)
                if issue_lower in ['anti-investor', 'anti-trust', 'anti investor', 'anti trust']:
                    continue
                
                rt_id = reform_type_map.get(issue_lower)
                if rt_id:
                    reform_type_ids.append(rt_id)
                else:
                    logger.debug(f"Skipping unmapped issue: {issue}")
            
            # Only create reform if we have at least one reform_type
            if not reform_type_ids:
                logger.debug(f"No valid reform types for bill {bill['ref']}, skipping")
                continue
            
            reform = {
                'place_id': place_id,
                'reform_type_ids': reform_type_ids,
                'policy_document_id': doc_id,
                'status': bill['status'],
                'adoption_date': bill['date'],
                'summary': bill['desc'],
                'legislative_number': bill['ref'],
                'link_url': MERCATUS_REFORM_TRACKER_URL,
                'source_url': source_url,
                'source_notes': 'Mercatus 2025 Housing Bills',
                'citations': []
            }
            reforms_to_insert.append(reform)
        
        # 6. Upsert Reforms
        logger.info(f"Upserting {len(reforms_to_insert)} reforms...")
        r_created, r_updated, reform_ids, deduped_reforms = bulk_upsert_reforms(conn, cursor, reforms_to_insert)
        logger.info(f"Reforms: {r_created} created, {r_updated} updated.")
        
        # 7. Link Reforms to Mercatus Source
        logger.info(f"Linking {len(reform_ids)} reforms to Mercatus source...")
        links_created = bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'Mercatus')
        logger.info(f"Source links created: {links_created}")
        
        # 8. Geocode places without coordinates
        geocode_missing_places(conn, cursor)
        
        # 9. Log Ingestion
        log_ingestion(
            conn, cursor,
            source_name=MERCATUS_SOURCE,
            records_processed=len(bill_data),
            places_created=p_created,
            places_updated=p_updated,
            reforms_created=r_created,
            reforms_updated=r_updated,
            status='success',
            start_time=datetime.now()
        )
        
        logger.info("Ingestion complete.")
        
    except Exception as e:
        conn.rollback()
        logger.exception("Ingestion failed")
        sys.exit(1)
    finally:
        close_db_connection(conn, cursor)

if __name__ == '__main__':
    main()
