#!/usr/bin/env python3
"""
Ingestion script for Mercatus Center 2025 Housing Bills.
Source: CSV File (database/testdata/mercatus-2025-housing-bills.csv)
"""

import csv
import logging
import os
import re
import sys
import argparse
from datetime import datetime
from typing import Dict, List, Set, Tuple

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure we can import from local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import db_utils

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MERCATUS_SOURCE = 'Mercatus (2025 Housing Bills)'

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

STATE_CODE_TO_NAME = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'DC': 'District of Columbia'
}

def parse_date(date_str: str) -> str:
    """Parses M/D/YYYY to YYYY-MM-DD."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str.strip(), '%m/%d/%Y')
        return dt.strftime('%Y-%m-%d')
    except ValueError:
        return None

def parse_bill_field(text: str) -> Tuple[str, str]:
    """Splits 'Ref: Title' into (Ref, Title)."""
    if ':' in text:
        parts = text.split(':', 1)
        return parts[0].strip(), parts[1].strip()
    return text.strip(), ""

def get_normalized_status(mercatus_status: str) -> str:
    if not mercatus_status:
        return 'Proposed' # Default
        
    status = STATUS_MAP.get(mercatus_status)
    if status:
        return status
    
    status_lower = mercatus_status.lower()
    if 'effective' in status_lower or 'signed' in status_lower or 'enacted' in status_lower:
        return 'Adopted'
    if 'fail' in status_lower or 'veto' in status_lower or 'died' in status_lower or 'defeat' in status_lower:
        return 'Failed'
    
    return 'Proposed'

def ensure_reform_types(conn, cursor, issues: Set[str]) -> Dict[str, int]:
    """
    Ensures Compass/Mercatus reform types exist.
    Returns mapping of lowercase issue name -> reform_type_id.
    """
    # 1. Fetch existing 'Mercatus' source types
    cursor.execute("SELECT id, name FROM reform_types WHERE source = 'Mercatus'")
    # Map name.lower() -> id
    existing = {name.lower(): rid for rid, name in cursor.fetchall()}
    
    mapping = existing.copy()
    
    # 2. Identify missing
    missing = [i for i in issues if i and i.lower() not in existing]
    
    if missing:
        logger.info(f"Creating {len(missing)} new reform types using Mercatus issues.")
        rows = []
        for issue in missing:
            # Generate code: mercatus:permitting_urbanity -> mercatus:permitting_urbanity
            slug = re.sub(r'[^a-z0-9]+', '_', issue.lower()).strip('_')
            code = f"mercatus:{slug}"
            # Name: Issue string
            rows.append((code, 'Mercatus', issue, '#8FBC8F')) # DarkSeaGreen for Mercatus
            
        sql = """
            INSERT INTO reform_types (code, source, name, color_hex)
            VALUES %s
            ON CONFLICT (code) DO NOTHING
            RETURNING id, name
        """
        execute_values(cursor, sql, rows)
        
        # 3. Fetch again to get new IDs (since ON CONFLICT DO NOTHING might skip, we must query)
        cursor.execute("SELECT id, name FROM reform_types WHERE source = 'Mercatus'")
        for rid, name in cursor.fetchall():
            mapping[name.lower()] = rid
            
    return mapping

def main():
    parser = argparse.ArgumentParser(description='Ingest Mercatus housing bills CSV.')
    parser.add_argument('--file', required=True, help='Path to the Mercatus CSV file')
    args = parser.parse_args()
    
    csv_path = args.file

    if not os.path.exists(csv_path):
        logger.error(f"CSV file not found at {csv_path}")
        sys.exit(1)

    conn, cursor = db_utils.get_db_connection()
    
    try:
        # 1. Read CSV and Collect Data
        raw_places = [] # For 'state' places
        policy_docs = []
        bill_data = [] # Temporary storage
        all_issues = set()
        
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
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
                status = get_normalized_status(status_text)
                
                # Collect Place (State)
                state_name = STATE_CODE_TO_NAME.get(state_code, state_code)
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
                    'last_action_date': parse_date(last_action)
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
                    'date': parse_date(date_intro),
                    'status': status,
                    'desc': desc
                })

        # 2. Upsert Places (States)
        logger.info(f"Upserting {len(raw_places)} places...")
        p_created, p_updated, place_map = db_utils.bulk_upsert_places(conn, cursor, raw_places)
        logger.info(f"Places: {p_created} created, {p_updated} updated.")
        
        # 3. Upsert Policy Documents
        logger.info(f"Upserting {len(policy_docs)} policy documents...")
        d_created, d_updated, doc_map = db_utils.bulk_upsert_policy_documents(conn, cursor, policy_docs)
        logger.info(f"Documents: {d_created} created, {d_updated} updated.")
        
        # 4. Upsert Reform Types
        logger.info("Syncing reform types...")
        reform_type_map = ensure_reform_types(conn, cursor, all_issues)
        
        # 5. Construct Reforms
        reforms_to_insert = []
        for bill in bill_data:
            # Reform needs: place_id, reform_type_id, status, etc.
            # place_id: from place_map using state
            state_name = STATE_CODE_TO_NAME.get(bill['state_code'], bill['state_code'])
            place_key = db_utils.place_key(state_name, bill['state_code'], 'state')
            place_id = place_map.get(place_key)
            
            if not place_id:
                logger.warning(f"Place ID not found for {place_key}")
                continue
                
            doc_id = doc_map.get((bill['state_code'], bill['ref']))
            
            for issue in bill['issues']:
                rt_id = reform_type_map.get(issue.lower())
                if not rt_id:
                    continue # Should not happen
                
                reform = {
                    'place_id': place_id,
                    'reform_type_id': rt_id,
                    'policy_document_id': doc_id,
                    'status': bill['status'],
                    'adoption_date': bill['date'], # Use intro date as base date? Or last_action?
                    # Schema has 'adoption_date'. For Proposed bills, this is ambiguous.
                    # Maybe null if not adopted? 
                    # Constraint: UNIQUE(place_id, reform_type_id, adoption_date, status)
                    # If adoption_date is part of unique key, we need it. 
                    # If we change status, we might insert a new row? Ideally updates existing.
                    # Let's use Date Introduced as 'adoption_date' (event date) for now, or NULL?
                    # If NULL, we can't use it in Unique Key easily if DB doesn't support NULLS NOT DISTINCT (Postgres 15+ does).
                    # 'adoption_date' implies when the reform was enacted.
                    # For proposed bills, it's just the date of the record.
                    'summary': bill['desc'],
                    'legislative_number': bill['ref'],
                    'source_url': None, # In policy doc
                    'source_notes': 'Mercatus 2025 Housing Bills',
                    'citations': []
                    # TODO: Citations?
                }
                reforms_to_insert.append(reform)
        
        # 6. Upsert Reforms
        logger.info(f"Upserting {len(reforms_to_insert)} reforms...")
        r_created, r_updated, r_ids, _ = db_utils.bulk_upsert_reforms(conn, cursor, reforms_to_insert)
        logger.info(f"Reforms: {r_created} created, {r_updated} updated.")
        
        # 7. Log Ingestion
        db_utils.log_ingestion(
            conn, cursor,
            source_name=MERCATUS_SOURCE,
            records_processed=len(bill_data),
            places_created=p_created,
            places_updated=p_updated,
            reforms_created=r_created,
            reforms_updated=r_updated,
            status='Success',
            start_time=datetime.now()
        )
        
        logger.info("Ingestion complete.")
        
    except Exception as e:
        conn.rollback()
        logger.exception("Ingestion failed")
        sys.exit(1)
    finally:
        db_utils.close_db_connection(conn, cursor)

if __name__ == '__main__':
    main()
