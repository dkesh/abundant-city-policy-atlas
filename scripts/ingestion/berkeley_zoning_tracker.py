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
import csv
import json
import logging
import argparse
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple
import urllib.request
import urllib.error

import psycopg2
from psycopg2.extras import execute_values

from dotenv import load_dotenv
from helpers import normalize_place_name

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
# DATABASE CLASS
# ============================================================================

class ZoningTrackerDB:
    """Handles all database operations for Zoning Reform Tracker data"""
    
    def __init__(self, database_url: Optional[str] = None):
        """Initialize database connection"""
        self.database_url = database_url or os.getenv('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL not set and not provided")
        
        self.conn = None
        self.cursor = None
        self.place_id_map = {}  # (state_code, municipality_name_lower) -> id
        self.reform_type_map = {}  # code -> id
        
    def connect(self):
        """Establish database connection"""
        try:
            self.conn = psycopg2.connect(self.database_url)
            self.cursor = self.conn.cursor()
            logger.info("✓ Connected to database")
        except psycopg2.Error as e:
            logger.error(f"✗ Database connection failed: {e}")
            raise
    
    def disconnect(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("✓ Disconnected from database")
    
    def load_lookup_tables(self):
        """Load state IDs and reform type IDs into memory"""
        try:
            # Load place IDs (by state_code + municipality name lowercased)
            self.cursor.execute("SELECT id, name, state_code FROM places")
            for place_id, name, state_code in self.cursor.fetchall():
                key = (state_code, (name or '').strip().lower())
                self.place_id_map[key] = place_id

            # Load reform type IDs
            self.cursor.execute("SELECT id, code FROM reform_types")
            for reform_type_id, code in self.cursor.fetchall():
                self.reform_type_map[code] = reform_type_id

            logger.info(f"✓ Loaded {len(self.place_id_map)} places and {len(self.reform_type_map)} reform types")
        except psycopg2.Error as e:
            logger.error(f"✗ Failed to load lookup tables: {e}")
            raise
    
    def bulk_upsert_places(self, place_records: List[Dict]) -> int:
        """
        Bulk upsert places and update place_id_map.
        
        Args:
            place_records: List of dicts with keys (state_short, municipality_name)
            
        Returns:
            Number of places created
        """
        if not place_records:
            return 0
        
        # Deduplicate by (state_code, name)
        seen = {}
        for rec in place_records:
            key = (rec['state_short'], rec['municipality_name'].lower())
            if key not in seen:
                seen[key] = rec
        
        deduped = list(seen.values())
        if len(deduped) != len(place_records):
            logger.info(f"  ⚐ Deduplicated places: {len(place_records)} -> {len(deduped)}")
        
        # Filter out places that already exist
        new_places = []
        for rec in deduped:
            key = (rec['state_short'], rec['municipality_name'].lower())
            if key not in self.place_id_map:
                new_places.append(rec)
        
        if not new_places:
            logger.info(f"  ⚐ All {len(deduped)} places already exist")
            return 0
        
        # Insert new places
        rows = [
            (
                rec['municipality_name'],
                'city',  # Default place_type for ZRT municipalities
                rec['state_short'],
                None,  # population
                None,  # latitude
                None,  # longitude
                None,  # encoded_name
                None   # source_url
            )
            for rec in new_places
        ]
        
        sql = """
            INSERT INTO places (
                name, place_type, state_code,
                population, latitude, longitude, encoded_name, source_url
            )
            VALUES %s
            ON CONFLICT (name, state_code, place_type) DO NOTHING
            RETURNING id, name, state_code
        """
        
        try:
            execute_values(self.cursor, sql, rows, page_size=1000, fetch=True)
            results = self.cursor.fetchall()
            self.conn.commit()
            
            # Update place_id_map with newly created places
            for place_id, name, state_code in results:
                key = (state_code, name.lower())
                self.place_id_map[key] = place_id
            
            logger.info(f"  ✓ Created {len(results)} new places")
            return len(results)
        
        except psycopg2.Error as e:
            self.conn.rollback()
            logger.error(f"  ✗ Error upserting places: {e}")
            raise
    
    def bulk_upsert_reforms(self, reform_rows: List[Tuple]) -> Tuple[int, int]:
        """
        Bulk upsert reforms using ON CONFLICT DO UPDATE
        
        Args:
            reform_rows: List of tuples with reform data
            
        Returns:
            (reforms_created, reforms_updated)
        """
        if not reform_rows:
            return 0, 0

        # Deduplicate by (place_id, reform_type_id, adoption_date, status)
        seen = {}
        for row in reform_rows:
            key = (row[0], row[1], row[5], row[2])
            seen[key] = row
        deduped_rows = list(seen.values())
        if len(deduped_rows) != len(reform_rows):
            logger.info(f"  ⚐ Deduplicated batch: {len(reform_rows)} -> {len(deduped_rows)}")

        sql = """
        INSERT INTO reforms (
            place_id, reform_type_id, status, scope, land_use,
            adoption_date, summary, reporter, requirements, notes, source_url,
            reform_mechanism, reform_phase, legislative_number, primary_source, secondary_source
        ) VALUES %s
        ON CONFLICT (place_id, reform_type_id, adoption_date, status)
        DO UPDATE SET
            scope = EXCLUDED.scope,
            land_use = EXCLUDED.land_use,
            summary = EXCLUDED.summary,
            reporter = EXCLUDED.reporter,
            requirements = EXCLUDED.requirements,
            notes = EXCLUDED.notes,
            source_url = EXCLUDED.source_url,
            reform_mechanism = EXCLUDED.reform_mechanism,
            reform_phase = EXCLUDED.reform_phase,
            legislative_number = EXCLUDED.legislative_number,
            primary_source = EXCLUDED.primary_source,
            secondary_source = EXCLUDED.secondary_source,
            updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0)::int as is_insert
        """

        try:
            execute_values(self.cursor, sql, deduped_rows, page_size=1000, fetch=True)
            results = self.cursor.fetchall()
            self.conn.commit()

            inserts = sum(1 for r in results if r[0])
            updates = len(results) - inserts

            logger.info(f"  ✓ Bulk upserted: {inserts} new, {updates} updated")
            return inserts, updates

        except psycopg2.Error as e:
            self.conn.rollback()
            logger.error(f"  ✗ Error upserting reforms: {e}")
            raise
    
    def log_ingestion(self, records_processed: int, places_created: int, places_updated: int,
                      reforms_created: int, reforms_updated: int, status: str,
                      error_message: Optional[str] = None):
        """Log ingestion metadata matching data_ingestion schema."""
        try:
            duration = int((datetime.now() - self.start_time).total_seconds())
            self.cursor.execute("""
                INSERT INTO data_ingestion (
                    source_name, records_processed,
                    places_created, places_updated,
                    reforms_created, reforms_updated,
                    status, error_message, duration_seconds
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, ('ZRT', records_processed, places_created, places_updated,
                  reforms_created, reforms_updated, status, error_message, duration))
            self.conn.commit()
            logger.info(
                f"✓ Logged ingestion: {records_processed} processed, "
                f"{places_created} places created, {places_updated} places updated, "
                f"{reforms_created} reforms created, {reforms_updated} reforms updated"
            )
        except psycopg2.Error as e:
            logger.error(f"✗ Error logging ingestion: {e}")

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
        'ADU Reform': 'zrt:adu',
        'Plex Reform': 'zrt:plex',
        'TOD Reform': 'zrt:tod',
        'Other Reform': 'zrt:other',
    }
    
    # Return the first matching type
    for t in types:
        if t in mapping:
            return mapping[t]
    
    # Default to other if no match
    return 'zrt:other'

def parse_csv_row(row: Dict, state_id_map: Dict, reform_type_map: Dict) -> Optional[Tuple]:
    """
    Parse a single CSV row and return reform tuple for insertion
    
    Returns None if row is invalid or missing required fields
    """
    try:
        # Required fields
        state_short = (row.get('state_short') or '').strip()
        municipality_name = normalize_place_name((row.get('municipality_name') or '').strip())
        reform_type_str = (row.get('reform_type') or '').strip()
        reform_phase = (row.get('reform_phase') or '').strip()

        # Validate required fields
        if not all([state_short, municipality_name, reform_type_str]):
            return None

        # Find place_id by (state_code, municipality_name)
        place_key = (state_short, municipality_name.lower())
        place_id = state_id_map.get(place_key)
        if place_id is None:
            logger.debug(f"  ⚠ Unknown place: {place_key} (will be created)")
            return None

        # Map reform type to ID
        reform_code = normalize_reform_type(reform_type_str)
        if not reform_code or reform_code not in reform_type_map:
            logger.warning(f"  ⚠ Unknown reform type: {reform_type_str} -> {reform_code}")
            return None
        reform_type_id = reform_type_map[reform_code]

        # Parse optional fields
        adoption_date = parse_flexible_date(row.get('time_R'))

        # Scope -> text[] (split on comma)
        raw_scope = row.get('scope') or row.get('category') or ''
        scope = [s.strip() for s in str(raw_scope).split(',') if s.strip()] if raw_scope else None

        land_use = None

        summary = row.get('reform_name') or row.get('legislative_number_policy_name') or row.get('title') or ''
        reporter = row.get('reporter')
        requirements = None
        notes = f"From ZRT: {row.get('time_status', '')}"
        source_url = row.get('primary_source')

        reform_mechanism = row.get('reform_mechanism')
        reform_phase_val = reform_phase
        legislative_number = row.get('legislative_number_policy_name')
        primary_source = row.get('primary_source')
        secondary_source = row.get('secondary_source')

        # Build tuple matching INSERT order in bulk_upsert_reforms
        return (
            place_id,             # place_id
            reform_type_id,       # reform_type_id
            reform_phase_val,     # status
            scope,                # scope (text[])
            land_use,             # land_use (text[])
            adoption_date,        # adoption_date
            summary,              # summary
            reporter,             # reporter
            requirements,         # requirements
            notes,                # notes
            source_url,           # source_url
            reform_mechanism,     # reform_mechanism
            reform_phase_val,     # reform_phase
            legislative_number,   # legislative_number
            primary_source,       # primary_source
            secondary_source      # secondary_source
        )

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
    
    # Initialize database
    db = ZoningTrackerDB(database_url)
    db.start_time = datetime.now()
    
    try:
        # Connect and load lookup tables
        db.connect()
        db.load_lookup_tables()
        
        # Read CSV file
        if not csv_file:
            csv_file = 'zoning-tracker-spreadsheet.csv'
            if not Path(csv_file).exists():
                download_zoning_tracker_data()
        
        rows = read_csv_file(csv_file)
        
        # First pass: collect all unique places and upsert them
        logger.info("Collecting places from CSV...")
        place_records = []
        for row in rows:
            state_short = (row.get('state_short') or '').strip()
            municipality_name = normalize_place_name((row.get('municipality_name') or '').strip())
            if state_short and municipality_name:
                place_records.append({
                    'state_short': state_short,
                    'municipality_name': municipality_name
                })
        
        # Upsert all places (creates missing ones)
        places_created = 0
        places_updated = 0  # Not tracked separately (ON CONFLICT DO NOTHING)
        if place_records:
            logger.info(f"Upserting {len(place_records)} places...")
            places_created = db.bulk_upsert_places(place_records)
            # Reload place_id_map to include newly created places
            db.load_lookup_tables()
        
        # Process in batches
        total_created = 0
        total_updated = 0
        reform_rows = []
        
        for i, row in enumerate(rows, 1):
            parsed = parse_csv_row(row, db.place_id_map, db.reform_type_map)
            if parsed:
                reform_rows.append(parsed)
            
            # Batch insert every BATCH_SIZE rows
            if len(reform_rows) >= BATCH_SIZE or i == len(rows):
                if reform_rows:
                    logger.info(f"Processing batch {(i-1)//BATCH_SIZE + 1} ({len(reform_rows)} reforms)...")
                    created, updated = db.bulk_upsert_reforms(reform_rows)
                    total_created += created
                    total_updated += updated
                    reform_rows = []
        
        # Log ingestion
        db.log_ingestion(
            records_processed=len(rows),
            places_created=places_created,
            places_updated=places_updated,
            reforms_created=total_created,
            reforms_updated=total_updated,
            status='success'
        )
        
        # Summary
        logger.info("\n" + "="*60)
        logger.info("✓ Ingestion complete!")
        logger.info(f"  Total records processed: {len(rows)}")
        logger.info(f"  Reforms created: {total_created}")
        logger.info(f"  Reforms updated: {total_updated}")
        logger.info("="*60 + "\n")
        
        return len(rows), total_created, total_updated
        
    except Exception as e:
        logger.error(f"✗ Ingestion failed: {e}")
        traceback.print_exc()
        db.log_ingestion(
            records_processed=0,
            places_created=0,
            places_updated=0,
            reforms_created=0,
            reforms_updated=0,
            status='failed',
            error_message=str(e)
        )
        raise
        
    finally:
        db.disconnect()

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
