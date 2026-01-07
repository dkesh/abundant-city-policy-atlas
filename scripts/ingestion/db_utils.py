#!/usr/bin/env python3
"""
Shared database utilities for ingestion scripts.
Provides connection helpers, bulk upserts for places and reforms,
citation insertion, and ingestion logging aligned with the schema.
"""

import os
import re
from datetime import datetime
from time import sleep
from typing import Dict, List, Optional, Tuple

import psycopg2
import requests
from psycopg2.extras import execute_values

PlaceKey = Tuple[str, str, str]  # (state_code, name_lower, place_type)


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
            'User-Agent': 'urbanist-reform-map/1.0 (+https://github.com/dkesh/urbanist-reform-map)'
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
        import logging
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
    import logging
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


def place_key(name: str, state_code: str, place_type: str) -> PlaceKey:
    """Normalized key for place lookups and maps."""
    return (state_code or '', (name or '').strip().lower(), place_type)


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
