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
import zipfile
import psycopg2
from psycopg2.extras import execute_values
import requests

from dotenv import load_dotenv
from helpers import normalize_place_name

# Load environment variables from .env file
load_dotenv()

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

# Reform type mapping (codes used in JSON)
REFORM_TYPE_MAP = {
    'rm_min': 'Parking Mandates Eliminated',
    'reduce_min': 'Parking Mandates Reduced',
    'add_max': 'Parking Maximums'
}

# State name to state code mapping
STATE_CODES = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
}

BATCH_SIZE = 500  # Upsert in batches to reduce transaction size

# ============================================================================
# DATE PARSING - FLEXIBLE FORMAT HANDLING
# ============================================================================

def parse_flexible_date(date_str: Optional[str]) -> Optional[str]:
    """
    Parse dates in flexible formats:
    - YYYY (year only) -> YYYY-01-01
    - YYYY-MM (year-month) -> YYYY-MM-01
    - YYYY-MM-DD (full date) -> YYYY-MM-DD
    - Other formats -> try parsing, return None if fails
    
    Returns: date string in YYYY-MM-DD format, or None if invalid/unparseable
    """
    if not date_str:
        return None
    
    date_str = str(date_str).strip()
    
    if not date_str:
        return None
    
    # Remove time component if present (T separator)
    if 'T' in date_str:
        date_str = date_str.split('T')[0]
    
    # Count hyphens to determine format
    hyphen_count = date_str.count('-')
    
    try:
        if hyphen_count == 0:
            # Format: YYYY (4 digits)
            if len(date_str) == 4 and date_str.isdigit():
                return f"{date_str}-01-01"
            else:
                return None
        
        elif hyphen_count == 1:
            # Format: YYYY-MM
            parts = date_str.split('-')
            if len(parts) == 2 and len(parts[0]) == 4 and len(parts[1]) == 2:
                year, month = parts[0], parts[1]
                if year.isdigit() and month.isdigit():
                    return f"{year}-{month}-01"
            return None
        
        elif hyphen_count == 2:
            # Format: YYYY-MM-DD
            parts = date_str.split('-')
            if len(parts) == 3 and len(parts[0]) == 4 and len(parts[1]) == 2 and len(parts[2]) == 2:
                # Validate numeric parts
                if all(p.isdigit() for p in parts):
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                    # Basic validation
                    if 1 <= month <= 12 and 1 <= day <= 31:
                        return date_str
            return None
        
        else:
            return None
    
    except Exception as e:
        logger.debug(f"Failed to parse date '{date_str}': {e}")
        return None

# ============================================================================
# DOWNLOAD & EXTRACT
# ============================================================================

def download_prn_data(url: str, extract_to: str) -> str:
    """Download PRN data zip and extract to directory."""
    logger.info(f"Downloading PRN data from {url}")
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Failed to download: {e}")
        raise

    zip_path = os.path.join(extract_to, 'prn_data.zip')
    with open(zip_path, 'wb') as f:
        f.write(response.content)

    logger.info(f"Downloaded {len(response.content) / 1024 / 1024:.2f} MB")

    # Extract
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)

    logger.info(f"Extracted to {extract_to}")
    return extract_to


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
        state_code = STATE_CODES.get(raw_state)

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
            'source_url': place_info.get('url'),
            'reforms': []
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
        for reform_type in REFORM_TYPE_MAP.keys():
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
                        'citations': citations
                    }

                    place_record['reforms'].append(reform_record)

        if place_record['reforms']:  # Only add if has reforms
            normalized.append(place_record)

    logger.info(f"Normalized {len(normalized)} places with reforms (skipped {skipped})")
    return normalized


# ============================================================================
# DATABASE OPERATIONS (OPTIMIZED)
# ============================================================================

class DatabaseManager:
    def __init__(self, connection_string: str):
        self.conn_string = connection_string
        self.conn = None
        self.cursor = None
        self.reform_type_ids = {}  # Cache of code -> id

    def connect(self):
        """Connect to database."""
        try:
            self.conn = psycopg2.connect(self.conn_string)
            self.cursor = self.conn.cursor()
            logger.info("Connected to database")
        except psycopg2.Error as e:
            logger.error(f"Database connection failed: {e}")
            raise

    def disconnect(self):
        """Close database connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Disconnected from database")

    def load_reform_type_ids(self):
        """Load all reform type IDs in a single query and accept both 'prn:code' and 'code'."""
        self.cursor.execute("SELECT code, id FROM reform_types")
        rows = self.cursor.fetchall()
        mapping = {}
        for code, rid in rows:
            mapping[code] = rid
            if isinstance(code, str) and code.startswith('prn:'):
                short = code.split(':', 1)[1]
                mapping[short] = rid
        self.reform_type_ids = mapping
        logger.info(f"Loaded {len(rows)} reform types")

    def bulk_upsert_places(self, places: List[Dict]) -> Dict[Tuple, int]:
        """
        Bulk upsert places with ON CONFLICT.
        Returns mapping of (name, state_code, place_type) -> place_id.
        """
        if not places:
            return {}
        rows = [
            (
                p['name'], p['place_type'], p['state_code'],
                p.get('population'), p.get('latitude'), p.get('longitude'),
                p.get('encoded_name'), p.get('source_url')
            )
            for p in places
        ]

        sql = """
            INSERT INTO places (
                name, place_type, state_code,
                population, latitude, longitude, encoded_name, source_url
            )
            VALUES %s
            ON CONFLICT (name, state_code, place_type) DO UPDATE
            SET population = EXCLUDED.population,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                encoded_name = EXCLUDED.encoded_name,
                source_url = EXCLUDED.source_url,
                updated_at = CURRENT_TIMESTAMP
        """

        try:
            execute_values(self.cursor, sql, rows, page_size=1000)
            self.conn.commit()
            logger.debug(f"Upserted {len(places)} places")
        except psycopg2.Error as e:
            logger.error(f"Error upserting places: {e}")
            self.conn.rollback()
            raise

        # Build parallel arrays for unnest
        names = [p['name'] for p in places]
        state_codes = [p['state_code'] for p in places]
        types = [p['place_type'] for p in places]

        self.cursor.execute("""
            SELECT id, name, state_code, place_type
            FROM places
            WHERE (name, state_code, place_type) IN (
                SELECT n, s, t
                FROM unnest(%s::text[], %s::text[], %s::place_type[]) AS u(n, s, t)
            )
        """, (names, state_codes, types))

        place_id_map = {}
        for row in self.cursor.fetchall():
            key = (row[1], row[2], row[3])
            place_id_map[key] = row[0]

        return place_id_map

    def bulk_upsert_reforms(self, reform_rows: List[Tuple]) -> Tuple[int, int]:
        """
        Bulk upsert reforms with ON CONFLICT.
        Returns (inserts, updates).
        """
        if not reform_rows:
            return (0, 0)

        sql = """
            INSERT INTO reforms (
                place_id, reform_type_id, status, scope, land_use,
                adoption_date, summary, reporter, requirements, notes, source_url
            )
            VALUES %s
            ON CONFLICT (place_id, reform_type_id, adoption_date, status)
            DO UPDATE SET
                scope = EXCLUDED.scope,
                land_use = EXCLUDED.land_use,
                summary = EXCLUDED.summary,
                reporter = EXCLUDED.reporter,
                requirements = EXCLUDED.requirements,
                notes = EXCLUDED.notes,
                source_url = EXCLUDED.source_url,
                updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0)::int as is_insert
        """

        try:
            results = execute_values(self.cursor, sql, reform_rows, page_size=1000, fetch=True)
            self.conn.commit()

            inserts = sum(1 for row in results if row[0])
            updates = len(results) - inserts

            logger.debug(f"Upserted {len(reform_rows)} reforms ({inserts} new, {updates} updated)")
            return (inserts, updates)

        except psycopg2.Error as e:
            logger.error(f"Error upserting reforms: {e}")
            self.conn.rollback()
            raise

    def bulk_insert_citations(self, citation_rows: List[Tuple]):
        """Bulk insert citations with ON CONFLICT DO NOTHING."""
        if not citation_rows:
            return

        sql = """
            INSERT INTO reform_citations (
                reform_id, citation_description, citation_url, citation_notes
            )
            VALUES %s
            ON CONFLICT DO NOTHING
        """

        try:
            execute_values(self.cursor, sql, citation_rows, page_size=1000)
            self.conn.commit()
            logger.debug(f"Inserted {len(citation_rows)} citations")
        except psycopg2.Error as e:
            logger.error(f"Error inserting citations: {e}")
            self.conn.rollback()

    def ingest_places_batch(self, places_batch: List[Dict]) -> Tuple[int, int, int]:
        """
        Ingest a batch of places and their reforms.
        Returns (places_count, reforms_created, reforms_updated).
        """
        # Bulk upsert places
        place_id_map = self.bulk_upsert_places(places_batch)

        reform_rows = []
        citation_rows = []
        reform_to_citations = {}  # Track which citations go with which reform (temp)

        # Prepare reform and citation rows
        for place in places_batch:
            place_key = (place['name'], place['state_code'], place['place_type'])
            place_id = place_id_map.get(place_key)

            if place_id is None:
                logger.warning(f"Place not found after upsert: {place_key}")
                continue

            for reform_idx, reform in enumerate(place['reforms']):
                reform_type_code = reform['reform_type']
                reform_type_id = self.reform_type_ids.get(reform_type_code)

                if reform_type_id is None:
                    logger.warning(f"Unknown reform type: {reform_type_code}")
                    continue

                reform_row = (
                    place_id, reform_type_id, reform['status'],
                    reform['scope'], reform['land_use'],
                    reform['adoption_date'], reform['summary'],
                    reform['reporter'], reform['requirements'],
                    reform['notes'], reform['source_url']
                )

                reform_rows.append(reform_row)

                # Track citations for this reform
                temp_reform_key = (place_id, reform_type_id, reform_idx)
                if reform.get('citations'):
                    reform_to_citations[temp_reform_key] = reform['citations']

        # Bulk upsert reforms
        reforms_created, reforms_updated = self.bulk_upsert_reforms(reform_rows)

        # Insert citations
        for (place_id, reform_type_id, _), citations in reform_to_citations.items():
            # Get the reform ID we just inserted
            self.cursor.execute(
                "SELECT id FROM reforms WHERE place_id = %s AND reform_type_id = %s LIMIT 1",
                (place_id, reform_type_id)
            )

            result = self.cursor.fetchone()
            if result:
                reform_id = result[0]
                for citation in citations:
                    if isinstance(citation, dict):
                        citation_rows.append((
                            reform_id,
                            citation.get('description'),
                            citation.get('url'),
                            citation.get('notes')
                        ))

        self.bulk_insert_citations(citation_rows)

        return (len(places_batch), reforms_created, reforms_updated)

    def log_ingestion(self, total_places: int, reforms_created: int,
                      reforms_updated: int, duration: int, status: str,
                      error_msg: Optional[str] = None):
        """Log ingestion metadata."""
        self.cursor.execute(
            """INSERT INTO data_ingestion
            (source_url, records_processed, places_created, places_updated,
            reforms_created, reforms_updated, status, error_message, duration_seconds)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (PRN_DATA_URL, total_places, 0, total_places, reforms_created,
             reforms_updated, status, error_msg, duration)
        )

        self.conn.commit()
        logger.info(f"Logged ingestion: {reforms_created} new reforms, {reforms_updated} updated")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Main ingestion process."""
    parser = argparse.ArgumentParser(description='Ingest PRN parking reform data')
    parser.add_argument('--file', help='Path to local JSON data file')
    args = parser.parse_args()

    start_time = datetime.now()
    db = DatabaseManager(DATABASE_URL)
    temp_dir = None

    try:
        # Get JSON data
        if args.file:
            json_file = args.file
            logger.info(f"Using local file: {json_file}")
        else:
            temp_dir = tempfile.mkdtemp()
            download_prn_data(PRN_DATA_URL, temp_dir)
            json_file = find_json_file(temp_dir)

        # Parse & normalize
        logger.info("Parsing and normalizing data...")
        raw_data = parse_prn_data(json_file)
        normalized_data = normalize_place_data(raw_data)

        # Connect to database
        db.connect()
        db.load_reform_type_ids()

        # Ingest in batches
        logger.info(f"Ingesting {len(normalized_data)} places in batches of {BATCH_SIZE}...")

        total_reforms_created = 0
        total_reforms_updated = 0

        for batch_idx in range(0, len(normalized_data), BATCH_SIZE):
            batch = normalized_data[batch_idx:batch_idx + BATCH_SIZE]
            batch_num = batch_idx // BATCH_SIZE + 1

            try:
                places_count, reforms_created, reforms_updated = db.ingest_places_batch(batch)
                total_reforms_created += reforms_created
                total_reforms_updated += reforms_updated

                logger.info(
                    f"Batch {batch_num}: {places_count} places, "
                    f"{reforms_created} new reforms, {reforms_updated} updated"
                )

            except Exception as e:
                logger.error(f"Error ingesting batch {batch_num}: {e}")
                raise

        # Log
        duration = int((datetime.now() - start_time).total_seconds())
        db.log_ingestion(len(normalized_data), total_reforms_created, total_reforms_updated,
                         duration, 'success')

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
        duration = int((datetime.now() - start_time).total_seconds())

        try:
            if not db.conn:
                db.connect()
            db.log_ingestion(0, 0, 0, duration, 'failed', str(e))
        except Exception:
            pass

        raise

    finally:
        db.disconnect()

        # Cleanup
        if temp_dir:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == '__main__':
    main()
