#!/usr/bin/env python3
"""
Shared database utilities for ingestion scripts.
Provides connection helpers, bulk upserts for places and reforms,
citation insertion, and ingestion logging aligned with the schema.
"""

import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import psycopg2
from psycopg2.extras import execute_values

PlaceKey = Tuple[str, str, str]  # (state_code, name_lower, place_type)


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
