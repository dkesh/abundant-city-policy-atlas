#!/usr/bin/env python3
"""
Shared database utilities for ingestion scripts.
Provides connection helpers, bulk upserts for places and reforms,
citation insertion, and ingestion logging aligned with the schema.
"""

import csv
import logging
import os
import zipfile
from datetime import datetime
from pathlib import Path
from time import sleep
from typing import Dict, List, Optional, Tuple

import psycopg2
import requests
from psycopg2.extras import execute_values

PlaceKey = Tuple[str, str, str]  # (state_code, name_lower, place_type)

# User-Agent string for HTTP requests
USER_AGENT = 'urbanist-reform-map/1.0 (+https://github.com/dkesh/urbanist-reform-map)'


def place_key(name: str, state_code: str, place_type: str) -> PlaceKey:
    """Normalized key for place lookups and maps."""
    return (state_code or '', (name or '').strip().lower(), place_type)


def geocode_place(place_name: str, state_code: Optional[str] = None, place_type: str = 'city') -> Tuple[Optional[float], Optional[float]]:
    """
    Geocode a place using OpenStreetMap Nominatim API.
    Returns (latitude, longitude) or (None, None) if geocoding fails.
    
    Args:
        place_name: Name of the place (e.g., "Berkeley")
        state_code: US state code (e.g., "CA")
        place_type: Type of place ('city', 'state', 'county')
    
    Returns:
        Tuple of (latitude, longitude) or (None, None)
    """
    try:
        # Build query
        if place_type == 'state' and state_code:
            query = f"{state_code}, USA"
        elif state_code:
            query = f"{place_name}, {state_code}, USA"
        else:
            query = f"{place_name}, USA"
        
        # Nominatim API
        url = 'https://nominatim.openstreetmap.org/search'
        params = {
            'q': query,
            'format': 'json',
            'limit': 1
        }
        headers = {
            'User-Agent': USER_AGENT
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        results = response.json()
        if results:
            lat = float(results[0]['lat'])
            lon = float(results[0]['lon'])
            return (lat, lon)
        
        return (None, None)
    
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Geocoding failed for '{place_name}' ({state_code}): {e}")
        return (None, None)
    finally:
        # Be respectful to Nominatim - small delay between requests
        sleep(1)


def bulk_update_place_coordinates(conn, cursor, places: List[Dict]) -> int:
    """
    Update coordinates for places that are missing them using Nominatim geocoding.
    
    Args:
        conn: Database connection
        cursor: Database cursor
        places: List of dicts with 'id', 'name', 'state_code', 'place_type'
    
    Returns:
        Number of places updated
    """
    import logging
    logger = logging.getLogger(__name__)
    
    updated = 0
    
    for place in places:
        place_id = place.get('id')
        name = place.get('name')
        state_code = place.get('state_code')
        place_type = place.get('place_type', 'city')
        
        if not name or not place_id:
            continue
        
        lat, lon = geocode_place(name, state_code, place_type)
        
        if lat is not None and lon is not None:
            cursor.execute("""
                UPDATE places
                SET latitude = %s, longitude = %s
                WHERE id = %s
            """, (lat, lon, place_id))
            updated += 1
            logger.info(f"  ✓ {name}, {state_code}: ({lat:.4f}, {lon:.4f})")
        else:
            logger.warning(f"  ✗ {name}, {state_code}: geocoding failed")
    
    conn.commit()
    return updated


def geocode_missing_places(conn, cursor, limit: int = 500) -> int:
    """
    Find and geocode all places missing both latitude and longitude.
    
    Args:
        conn: Database connection
        cursor: Database cursor
        limit: Maximum number of places to geocode in one call
    
    Returns:
        Number of places successfully geocoded
    """
    logger = logging.getLogger(__name__)
    
    logger.info("Geocoding places without coordinates...")
    cursor.execute("""
        SELECT id, name, state_code, place_type
        FROM places
        WHERE latitude IS NULL AND longitude IS NULL
        AND state_code IS NOT NULL
        LIMIT %s
    """, (limit,))
    
    places_to_geocode = [
        dict(zip([d[0] for d in cursor.description], row))
        for row in cursor.fetchall()
    ]
    
    if not places_to_geocode:
        logger.info("No places need geocoding")
        return 0
    
    geocoded = bulk_update_place_coordinates(conn, cursor, places_to_geocode)
    logger.info(f"Geocoded {geocoded}/{len(places_to_geocode)} places")
    return geocoded


# ============================================================================
# STATE CODE UTILITIES
# ============================================================================

STATE_CODE_TO_NAME: Dict[str, str] = {
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

STATE_NAME_TO_CODE: Dict[str, str] = {name: code for code, name in STATE_CODE_TO_NAME.items()}


def get_state_name(state_code: str) -> Optional[str]:
    """Get full state name from state code."""
    return STATE_CODE_TO_NAME.get(state_code.upper())


def get_state_code(state_name: str) -> Optional[str]:
    """Get state code from full state name."""
    return STATE_NAME_TO_CODE.get(state_name)


# ============================================================================
# DATE PARSING UTILITIES
# ============================================================================

def parse_flexible_date(date_str: Optional[str]) -> Optional[str]:
    """
    Parse dates in flexible formats and return YYYY-MM-DD format.
    
    Supported formats:
    - YYYY (year only) -> YYYY-01-01
    - YYYY-MM (year-month) -> YYYY-MM-01
    - YYYY-MM-DD (full date) -> YYYY-MM-DD
    - M/D/YYYY (US format) -> YYYY-MM-DD
    
    Returns:
        Date string in YYYY-MM-DD format, or None if invalid/unparseable
    """
    logger = logging.getLogger(__name__)
    
    if not date_str:
        return None
    
    date_str = str(date_str).strip()
    
    if not date_str:
        return None
    
    # Remove time component if present (T separator)
    if 'T' in date_str:
        date_str = date_str.split('T')[0]
    
    # Try M/D/YYYY format first (for Mercatus data)
    if '/' in date_str and not date_str.startswith('/'):
        try:
            dt = datetime.strptime(date_str, '%m/%d/%Y')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass  # Fall through to other formats
    
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
                        # Validate actual date
                        datetime.strptime(date_str, '%Y-%m-%d')
                        return date_str
            return None
        
        else:
            return None
    
    except (ValueError, IndexError) as e:
        logger.debug(f"Failed to parse date '{date_str}': {e}")
        return None


# ============================================================================
# STATUS NORMALIZATION UTILITIES
# ============================================================================

def normalize_reform_status(raw_status: Optional[str]) -> str:
    """
    Normalize reform status to standardized values: 'Adopted', 'Failed', 'Proposed'.
    
    Maps various status formats to standardized values with case-insensitive matching.
    Defaults to 'Proposed' for unknown statuses.
    
    Args:
        raw_status: Raw status string from source data
    
    Returns:
        Normalized status string: 'Adopted', 'Failed', or 'Proposed'
    """
    logger = logging.getLogger(__name__)
    
    if not raw_status:
        return 'Proposed'
    
    status_lower = str(raw_status).lower().strip()
    
    # Adopted statuses
    if status_lower in ['approved', 'enacted', 'effective', 'signed', 'signed by governor']:
        return 'Adopted'
    
    # Failed statuses
    if status_lower in ['denied/rejected', 'denied', 'rejected', 'vetoed', 'failed', 'died', 'defeat']:
        return 'Failed'
    
    # Proposed/in-process statuses
    if status_lower in ['early process', 'late process', 'introduced', 'in committee', 'passed chamber',
                        'introduced or prefiled', 'passed original chamber', 'passed second chamber',
                        'out of committee']:
        return 'Proposed'
    
    # Heuristic matching for partial matches
    if 'effective' in status_lower or 'signed' in status_lower or 'enacted' in status_lower:
        return 'Adopted'
    if 'fail' in status_lower or 'veto' in status_lower or 'died' in status_lower or 'defeat' in status_lower:
        return 'Failed'
    
    # Default to Proposed for unknown statuses
    logger.warning(f"Unknown status '{raw_status}', defaulting to 'Proposed'")
    return 'Proposed'


# ============================================================================
# FILE DOWNLOAD UTILITIES
# ============================================================================

def download_file(url: str, output_path: str, headers: Optional[Dict] = None, timeout: int = 60) -> str:
    """
    Download a file from URL to local path with streaming support.
    
    Args:
        url: URL to download from
        output_path: Local path to save file
        headers: Optional custom headers (User-Agent will be added if not present)
        timeout: Request timeout in seconds
    
    Returns:
        Path to downloaded file
    """
    logger = logging.getLogger(__name__)
    
    if headers is None:
        headers = {}
    
    if 'User-Agent' not in headers:
        headers['User-Agent'] = USER_AGENT
    
    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with requests.get(url, headers=headers, timeout=timeout, stream=True) as r:
            r.raise_for_status()
            with open(output_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        logger.info(f"✓ Downloaded file to {output_path}")
        return output_path
    except Exception as e:
        logger.error(f"✗ Failed to download file from {url}: {e}")
        raise


def download_zip_and_extract(url: str, extract_to: str) -> str:
    """
    Download a zip file and extract it to a directory.
    
    Args:
        url: URL to download zip file from
        extract_to: Directory to extract zip contents to
    
    Returns:
        Path to extraction directory
    """
    logger = logging.getLogger(__name__)
    
    logger.info(f"Downloading zip from {url}")
    
    # Download to temporary zip file
    zip_path = os.path.join(extract_to, 'temp_download.zip')
    download_file(url, zip_path)
    
    # Extract
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    
    # Remove temporary zip file
    try:
        os.remove(zip_path)
    except Exception:
        pass
    
    logger.info(f"Extracted to {extract_to}")
    return extract_to


# ============================================================================
# CSV READING UTILITIES
# ============================================================================

def read_csv_file(filepath: str, encoding: str = 'utf-8-sig') -> List[Dict]:
    """
    Read and parse a CSV file into a list of dictionaries.
    
    Args:
        filepath: Path to CSV file
        encoding: File encoding (default: 'utf-8-sig' to handle BOM)
    
    Returns:
        List of dictionaries, one per row
    
    Raises:
        FileNotFoundError: If file doesn't exist
        Exception: For other read errors
    """
    logger = logging.getLogger(__name__)
    
    rows = []
    try:
        with open(filepath, 'r', encoding=encoding) as f:
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
# DATABASE CONNECTION UTILITIES
# ============================================================================

def get_db_connection(database_url: Optional[str] = None) -> Tuple[psycopg2.extensions.connection, psycopg2.extensions.cursor]:
    """Create a database connection and cursor using DATABASE_URL if not provided."""
    db_url = database_url or os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL is not set")

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    return conn, cursor


def close_db_connection(conn, cursor) -> None:
    """Close cursor and connection if present."""
    if cursor:
        cursor.close()
    if conn:
        conn.close()


def load_reform_type_map(cursor, include_short_codes: bool = True) -> Dict[str, int]:
    """Return mapping of reform code -> id, optionally adding short codes without source prefix."""
    cursor.execute("SELECT id, code FROM reform_types")
    mapping: Dict[str, int] = {}
    for reform_id, code in cursor.fetchall():
        mapping[code] = reform_id
        if include_short_codes and isinstance(code, str) and ':' in code:
            short = code.split(':', 1)[1]
            mapping.setdefault(short, reform_id)
    return mapping


def _dedupe_places(places: List[Dict]) -> List[Dict]:
    deduped: Dict[PlaceKey, Dict] = {}
    for place in places:
        key = place_key(place['name'], place['state_code'], place['place_type'])
        deduped[key] = place
    return list(deduped.values())


def bulk_upsert_places(conn, cursor, places: List[Dict]) -> Tuple[int, int, Dict[PlaceKey, int]]:
    """
    Upsert places and return (created_count, updated_count, place_id_map).
    place_id_map uses place_key(name, state_code, place_type).
    """
    deduped = _dedupe_places(places)
    if not deduped:
        return 0, 0, {}

    rows = [
        (
            p['name'], p['place_type'], p['state_code'],
            p.get('population'), p.get('latitude'), p.get('longitude'),
            p.get('encoded_name'), p.get('source_url')
        )
        for p in deduped
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
        RETURNING id, name, state_code, place_type, (xmax = 0)::int AS is_insert
    """

    results = execute_values(cursor, sql, rows, page_size=1000, fetch=True)
    conn.commit()

    created = sum(1 for _, _, _, _, is_insert in results if is_insert)
    updated = len(results) - created

    place_id_map: Dict[PlaceKey, int] = {}
    for pid, name, state_code, place_type, _ in results:
        place_id_map[place_key(name, state_code, place_type)] = pid

    return created, updated, place_id_map


def bulk_upsert_policy_documents(conn, cursor, documents: List[Dict]) -> Tuple[int, int, Dict[Tuple[str, str], int]]:
    """
    Upsert policy documents and return (created_count, updated_count, doc_id_map).
    doc_id_map uses (state_code, reference_number) as key -> id.
    """
    # Dedupe based on state_code + reference_number
    deduped = {}
    for doc in documents:
        key = (doc.get('state_code'), doc.get('reference_number'))
        if key[0] and key[1]: # Only include if we have both keys
            deduped[key] = doc
    
    if not deduped:
        return 0, 0, {}

    rows = [
        (
            d.get('reference_number'), d.get('state_code'), d.get('place_id'),
            d.get('title'), d.get('key_points'), d.get('analysis'),
            d.get('document_url'), d.get('status'), d.get('last_action_date')
        )
        for d in deduped.values()
    ]

    sql = """
        INSERT INTO policy_documents (
            reference_number, state_code, place_id,
            title, key_points, analysis,
            document_url, status, last_action_date
        )
        VALUES %s
        ON CONFLICT (state_code, reference_number) DO UPDATE
        SET title = EXCLUDED.title,
            key_points = EXCLUDED.key_points,
            analysis = EXCLUDED.analysis,
            document_url = EXCLUDED.document_url,
            status = EXCLUDED.status,
            last_action_date = EXCLUDED.last_action_date,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, state_code, reference_number, (xmax = 0)::int AS is_insert
    """

    results = execute_values(cursor, sql, rows, page_size=1000, fetch=True)
    conn.commit()

    created = sum(1 for _, _, _, is_insert in results if is_insert)
    updated = len(results) - created
    
    id_map = {}
    for row in results:
        doc_id, state, ref, _ = row
        id_map[(state, ref)] = doc_id
        
    return created, updated, id_map


def _dedupe_reforms(reforms: List[Dict]) -> List[Dict]:
    deduped: Dict[Tuple, Dict] = {}
    for reform in reforms:
        key = (
            reform['place_id'],
            reform['reform_type_id'],
            reform.get('adoption_date'),
            reform.get('status')
        )
        deduped[key] = reform
    return list(deduped.values())


def bulk_upsert_reforms(conn, cursor, reforms: List[Dict]) -> Tuple[int, int, List[int], List[Dict]]:
    """
    Upsert reforms and return (created_count, updated_count, reform_ids, deduped_records).
    The order of reform_ids matches deduped_records for downstream citation handling.
    """
    deduped = _dedupe_reforms(reforms)
    if not deduped:
        return 0, 0, [], []

    rows = [
        (
            r['place_id'],
            r['reform_type_id'],
            r.get('policy_document_id'),
            r.get('status'),
            r.get('scope'),
            r.get('land_use'),
            r.get('adoption_date'),
            r.get('summary'),
            r.get('requirements'),
            r.get('notes'),
            r.get('reform_mechanism'),
            r.get('reform_phase'),
            r.get('legislative_number')
        )
        for r in deduped
    ]

    sql = """
        INSERT INTO reforms (
            place_id, reform_type_id, policy_document_id, status, scope, land_use,
            adoption_date, summary, requirements, notes,
            reform_mechanism, reform_phase, legislative_number
        )
        VALUES %s
        ON CONFLICT (place_id, reform_type_id, adoption_date, status)
        DO UPDATE SET
            policy_document_id = EXCLUDED.policy_document_id,
            scope = EXCLUDED.scope,
            land_use = EXCLUDED.land_use,
            summary = EXCLUDED.summary,
            requirements = EXCLUDED.requirements,
            notes = EXCLUDED.notes,
            reform_mechanism = EXCLUDED.reform_mechanism,
            reform_phase = EXCLUDED.reform_phase,
            legislative_number = EXCLUDED.legislative_number,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, (xmax = 0)::int AS is_insert
    """

    results = execute_values(cursor, sql, rows, page_size=1000, fetch=True)
    conn.commit()

    created = sum(1 for _, is_insert in results if is_insert)
    updated = len(results) - created
    reform_ids = [rid for rid, _ in results]

    return created, updated, reform_ids, deduped


def build_citation_rows(reform_ids: List[int], reforms: List[Dict]) -> List[Tuple]:
    """Pair reform IDs with their citations to produce rows for insertion."""
    rows: List[Tuple] = []
    for reform_id, reform in zip(reform_ids, reforms):
        for citation in reform.get('citations') or []:
            rows.append(
                (
                    reform_id,
                    citation.get('description'),
                    citation.get('url'),
                    citation.get('notes')
                )
            )
    return rows


def bulk_insert_citations(conn, cursor, citation_rows: List[Tuple]) -> int:
    """Insert citations with ON CONFLICT DO NOTHING. Returns number attempted."""
    if not citation_rows:
        return 0

    sql = """
        INSERT INTO reform_citations (
            reform_id, citation_description, citation_url, citation_notes
        )
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    execute_values(cursor, sql, citation_rows, page_size=1000)
    conn.commit()
    return len(citation_rows)


def bulk_link_reform_sources(
    conn, cursor, reform_ids: List[int], reforms: List[Dict], source_short_name: str
) -> int:
    """Link reforms to a data source via reform_sources junction table."""
    if not reform_ids or not reforms:
        return 0
    
    # Get source ID
    cursor.execute("SELECT id FROM sources WHERE short_name = %s", (source_short_name,))
    result = cursor.fetchone()
    if not result:
        raise ValueError(f"Source '{source_short_name}' not found in sources table")
    
    source_id = result[0]
    
    # Build rows for reform_sources
    rows = []
    for reform_id, reform in zip(reform_ids, reforms):
        rows.append((
            reform_id,
            source_id,
            reform.get('reporter'),
            reform.get('source_url'),
            reform.get('source_notes'),
            reform.get('is_primary', True)  # Default to primary
        ))
    
    sql = """
        INSERT INTO reform_sources (
            reform_id, source_id, reporter, source_url, notes, is_primary
        )
        VALUES %s
        ON CONFLICT (reform_id, source_id) 
        DO UPDATE SET
            reporter = COALESCE(EXCLUDED.reporter, reform_sources.reporter),
            source_url = COALESCE(EXCLUDED.source_url, reform_sources.source_url),
            notes = COALESCE(EXCLUDED.notes, reform_sources.notes),
            is_primary = EXCLUDED.is_primary
    """
    
    execute_values(cursor, sql, rows, page_size=1000)
    conn.commit()
    return len(rows)


def log_ingestion(
    conn,
    cursor,
    *,
    source_name: str,
    records_processed: int,
    places_created: int,
    places_updated: int,
    reforms_created: int,
    reforms_updated: int,
    status: str,
    start_time: Optional[datetime] = None,
    source_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """Write a row to data_ingestion with optional duration and source URL."""
    duration = None
    if start_time:
        duration = int((datetime.now() - start_time).total_seconds())

    cursor.execute(
        """
        INSERT INTO data_ingestion (
            source_name, source_url, records_processed,
            places_created, places_updated,
            reforms_created, reforms_updated,
            status, error_message, duration_seconds
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            source_name,
            source_url,
            records_processed,
            places_created,
            places_updated,
            reforms_created,
            reforms_updated,
            status,
            error_message,
            duration,
        ),
    )
    conn.commit()
