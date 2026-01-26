#!/usr/bin/env python3
"""
AI Enrichment Service for Urbanist Reform Map
Enriches reform records with AI-generated data from bill text.
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import errors as psycopg2_errors
# Add project root to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import get_db_connection, close_db_connection, initialize_environment

# Load environment variables from .env file
initialize_environment()
from scripts.enrichment.ai_providers import get_ai_provider, parse_json_response
from scripts.enrichment.prompts import build_enrichment_prompt, SYSTEM_PROMPT
from scripts.utils.logging_config import setup_database_logging

# Setup database logging for activity logs
setup_database_logging()

# Configuration
ENRICHMENT_VERSION = int(os.getenv('ENRICHMENT_VERSION', '1'))
AI_PROVIDER = os.getenv('AI_PROVIDER', 'anthropic')
AI_MODEL = os.getenv('AI_MODEL', None)  # None uses provider default

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_unenriched_reforms(cursor, version: int, limit: int = 100, reform_id: Optional[int] = None) -> List[Dict]:
    """
    Find reforms that haven't been enriched at current version.
    Only returns reforms that have bill text already scraped and saved in the database.
    
    Args:
        cursor: Database cursor
        version: Current enrichment version
        limit: Maximum number of reforms to return
        reform_id: Optional specific reform ID to enrich
    
    Returns:
        List of reform records
    """
    if reform_id:
        cursor.execute("""
            SELECT DISTINCT ON (r.id) r.id, r.link_url, r.legislative_number, r.summary,
                   r.scope, r.land_use, r.requirements,
                   p.name as place_name, tld.state_name,
                   rt.code as reform_type_code,
                   pd.id as policy_doc_id,
                   pd.document_url, pd.reference_number, pd.title as policy_doc_title,
                   pd.bill_text
            FROM reforms r
            JOIN places p ON r.place_id = p.id
            JOIN top_level_division tld ON p.state_code = tld.state_code
            LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
            LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
            LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
            WHERE r.id = %s
              AND pd.bill_text IS NOT NULL
              AND pd.bill_text != ''
            ORDER BY r.id, rt.id NULLS LAST
        """, (reform_id,))
    else:
        cursor.execute("""
            WITH ranked_reforms AS (
                SELECT r.id
                FROM reforms r
                LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
                WHERE (r.ai_enrichment_version IS NULL OR r.ai_enrichment_version < %s)
                  AND pd.bill_text IS NOT NULL
                  AND pd.bill_text != ''
                ORDER BY r.created_at DESC
                LIMIT %s
            )
            SELECT DISTINCT ON (r.id) r.id, r.link_url, r.legislative_number, r.summary,
                   r.scope, r.land_use, r.requirements,
                   p.name as place_name, tld.state_name,
                   rt.code as reform_type_code,
                   pd.id as policy_doc_id,
                   pd.document_url, pd.reference_number, pd.title as policy_doc_title,
                   pd.bill_text
            FROM ranked_reforms rf
            JOIN reforms r ON rf.id = r.id
            JOIN places p ON r.place_id = p.id
            JOIN top_level_division tld ON p.state_code = tld.state_code
            LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
            LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
            LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
            ORDER BY r.id, rt.id NULLS LAST
        """, (version, limit))
    
    return cursor.fetchall()


def get_bill_url(reform: Dict) -> Optional[str]:
    """Get the best available bill URL from reform record."""
    # Prefer policy document URL, then reform link_url
    if reform.get('document_url'):
        return reform['document_url']
    elif reform.get('link_url'):
        return reform['link_url']
    return None


def enrich_reform(ai_provider, reform: Dict) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Enrich a single reform using AI.
    Uses pre-scraped bill text from the database.
    
    Args:
        ai_provider: AI provider instance
        reform: Reform record dict (must include bill_text from policy_documents)
    
    Returns:
        Tuple of (enrichment_data, error_message)
    """
    try:
        # Use pre-scraped bill text from database
        document_text = reform.get('bill_text')
        if not document_text:
            return None, "No bill text available in database (bill must be scraped first)"
        
        bill_url = get_bill_url(reform)
        logger.info(f"Using pre-scraped bill text for reform {reform['id']} from {bill_url or 'policy document'}")
        logger.info(f"Bill text length: {len(document_text)} characters")
        
        # Build prompt
        prompt = build_enrichment_prompt(
            place_name=reform['place_name'] or '',
            state_name=reform['state_name'] or '',
            current_reform_type=reform['reform_type_code'] or '',
            legislative_number=reform['legislative_number'] or reform.get('reference_number') or '',
            link_url=bill_url,
            document_text=document_text
        )
        
        # Call AI
        logger.info(f"Calling AI provider for reform {reform['id']}")
        response = ai_provider.complete(prompt, system_prompt=SYSTEM_PROMPT, max_tokens=4096)
        
        # Parse response
        enrichment_data = parse_json_response(response['content'])
        
        if not enrichment_data:
            return None, "Failed to parse AI response as JSON"
        
        # Build enrichment record
        enriched_fields = {}
        
        # Map AI response fields to our schema
        field_mappings = {
            'summary': 'summary',
            'scope': 'scope',
            'land_use': 'land_use',
            'requirements': 'requirements',
            'key_points': 'key_points',
            'analysis': 'analysis'
        }
        
        for ai_key, db_key in field_mappings.items():
            if ai_key in enrichment_data:
                enriched_fields[db_key] = enrichment_data[ai_key]
        
        # Handle reform_type_suggestion separately (we'll update reform_type_id if needed)
        if 'reform_type_suggestion' in enrichment_data:
            enriched_fields['reform_type_suggestion'] = enrichment_data['reform_type_suggestion']
        
        # Build full enrichment record
        enrichment_record = {
            'version': ENRICHMENT_VERSION,
            'model': ai_provider.get_model_name(),
            'provider': AI_PROVIDER,
            'enriched_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'fields': enriched_fields,
            'source_documents': [{
                'url': bill_url,
                'fetched_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                'content_length': len(document_text)
            }]
        }
        
        return enrichment_record, None
        
    except Exception as e:
        logger.error(f"Error enriching reform {reform.get('id')}: {e}", exc_info=True)
        return None, str(e)


def merge_duplicate_reforms(cursor, duplicate_reform_id: int, target_reform_id: int, enrichment_data: Dict, reform_type_id: Optional[int] = None) -> bool:
    """
    Merge a duplicate reform into an existing reform.
    
    When a duplicate key violation occurs, this function:
    1. Merges data from the duplicate reform into the target reform
    2. Merges sources from both reforms (ensuring both are linked)
    3. Deletes the duplicate reform
    
    Args:
        cursor: Database cursor
        duplicate_reform_id: ID of the reform that would create a duplicate (the one being updated)
        target_reform_id: ID of the existing reform that already has the conflicting combination
        enrichment_data: Enrichment data from the duplicate reform
        reform_type_id: The reform_type_id that was being set (already exists in target)
    
    Returns:
        bool: True if merge was successful
    """
    try:
        # Get data from both reforms
        cursor.execute("""
            SELECT * FROM reforms WHERE id = %s
        """, (duplicate_reform_id,))
        duplicate_reform = cursor.fetchone()
        
        cursor.execute("""
            SELECT * FROM reforms WHERE id = %s
        """, (target_reform_id,))
        target_reform = cursor.fetchone()
        
        if not duplicate_reform or not target_reform:
            logger.error(f"Cannot merge: reform {duplicate_reform_id} or {target_reform_id} not found")
            return False
        
        logger.info(f"Merging reform {duplicate_reform_id} into reform {target_reform_id}")
        
        # Re-fetch duplicate reform to get any updates that were made before the merge
        # (e.g., ai_enriched_fields that were updated in the first UPDATE statement)
        cursor.execute("""
            SELECT ai_enriched_fields FROM reforms WHERE id = %s
        """, (duplicate_reform_id,))
        updated_duplicate = cursor.fetchone()
        duplicate_ai_data_from_db = updated_duplicate.get('ai_enriched_fields') if updated_duplicate else None
        
        # Merge AI enrichment data
        # Prefer the target's AI data if it exists, otherwise use duplicate's
        target_ai_data = target_reform.get('ai_enriched_fields')
        if target_ai_data:
            if isinstance(target_ai_data, str):
                target_ai_data = json.loads(target_ai_data)
        else:
            target_ai_data = {}
        
        # Use enrichment_data from the function parameter, or from the database if it was already updated
        duplicate_ai_data = enrichment_data
        if duplicate_ai_data_from_db:
            if isinstance(duplicate_ai_data_from_db, str):
                duplicate_ai_data_from_db = json.loads(duplicate_ai_data_from_db)
            # Merge: prefer database version (most recent) but fall back to parameter
            if duplicate_ai_data_from_db:
                duplicate_ai_data = duplicate_ai_data_from_db
        
        if duplicate_ai_data:
            # Merge AI fields, preferring target's values but adding new fields from duplicate
            if 'fields' in duplicate_ai_data:
                if 'fields' not in target_ai_data:
                    target_ai_data['fields'] = {}
                # Merge fields, preferring target's existing values
                for key, value in duplicate_ai_data['fields'].items():
                    if key not in target_ai_data['fields']:
                        target_ai_data['fields'][key] = value
        
        # Merge other reform fields (prefer non-null values, then target's values)
        merged_scope = duplicate_reform.get('scope') or target_reform.get('scope')
        merged_land_use = duplicate_reform.get('land_use') or target_reform.get('land_use')
        merged_summary = duplicate_reform.get('summary') or target_reform.get('summary')
        merged_requirements = duplicate_reform.get('requirements') or target_reform.get('requirements')
        merged_notes = duplicate_reform.get('notes') or target_reform.get('notes')
        merged_link_url = duplicate_reform.get('link_url') or target_reform.get('link_url')
        merged_policy_doc_id = duplicate_reform.get('policy_document_id') or target_reform.get('policy_document_id')
        merged_legislative_number = duplicate_reform.get('legislative_number') or target_reform.get('legislative_number')
        merged_reform_mechanism = duplicate_reform.get('reform_mechanism') or target_reform.get('reform_mechanism')
        merged_reform_phase = duplicate_reform.get('reform_phase') or target_reform.get('reform_phase')
        
        # Update target reform with merged data
        cursor.execute("""
            UPDATE reforms
            SET ai_enriched_fields = COALESCE(%s, ai_enriched_fields),
                ai_enrichment_version = COALESCE(%s, ai_enrichment_version),
                ai_enriched_at = COALESCE(%s, ai_enriched_at),
                scope = COALESCE(%s, scope),
                land_use = COALESCE(%s, land_use),
                summary = COALESCE(%s, summary),
                requirements = COALESCE(%s, requirements),
                notes = COALESCE(%s, notes),
                link_url = COALESCE(%s, link_url),
                policy_document_id = COALESCE(%s, policy_document_id),
                legislative_number = COALESCE(%s, legislative_number),
                reform_mechanism = COALESCE(%s, reform_mechanism),
                reform_phase = COALESCE(%s, reform_phase),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (
            json.dumps(target_ai_data) if target_ai_data else None,
            ENRICHMENT_VERSION if target_ai_data else None,
            datetime.now(timezone.utc) if target_ai_data else None,
            merged_scope,
            merged_land_use,
            merged_summary,
            merged_requirements,
            merged_notes,
            merged_link_url,
            merged_policy_doc_id,
            merged_legislative_number,
            merged_reform_mechanism,
            merged_reform_phase,
            target_reform_id
        ))
        
        # Merge sources: get sources from duplicate reform and link them to target
        cursor.execute("""
            SELECT source_id, reporter, source_url, notes, is_primary
            FROM reform_sources
            WHERE reform_id = %s
        """, (duplicate_reform_id,))
        duplicate_sources = cursor.fetchall()
        
        if duplicate_sources:
            # Get existing sources for target reform
            cursor.execute("""
                SELECT source_id FROM reform_sources WHERE reform_id = %s
            """, (target_reform_id,))
            existing_source_ids = {row['source_id'] for row in cursor.fetchall()}
            
            # Insert sources from duplicate that don't already exist in target
            for source in duplicate_sources:
                if source['source_id'] not in existing_source_ids:
                    cursor.execute("""
                        INSERT INTO reform_sources (reform_id, source_id, reporter, source_url, notes, is_primary)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (reform_id, source_id) DO NOTHING
                    """, (
                        target_reform_id,
                        source['source_id'],
                        source['reporter'],
                        source['source_url'],
                        source['notes'],
                        source['is_primary']
                    ))
                    logger.info(f"  Merged source {source['source_id']} from reform {duplicate_reform_id} to {target_reform_id}")
        
        # Merge citations: get citations from duplicate reform and link them to target
        cursor.execute("""
            SELECT citation_description, citation_url, citation_notes
            FROM reform_citations
            WHERE reform_id = %s
        """, (duplicate_reform_id,))
        duplicate_citations = cursor.fetchall()
        
        if duplicate_citations:
            # Get existing citations for target reform to avoid duplicates
            cursor.execute("""
                SELECT citation_url, citation_description
                FROM reform_citations
                WHERE reform_id = %s
            """, (target_reform_id,))
            existing_citations = {
                (row['citation_url'] or '', row['citation_description'] or '')
                for row in cursor.fetchall()
            }
            
            # Insert citations from duplicate that don't already exist in target
            for citation in duplicate_citations:
                citation_key = (citation['citation_url'] or '', citation['citation_description'] or '')
                if citation_key not in existing_citations:
                    cursor.execute("""
                        INSERT INTO reform_citations (reform_id, citation_description, citation_url, citation_notes)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (
                        target_reform_id,
                        citation['citation_description'],
                        citation['citation_url'],
                        citation['citation_notes']
                    ))
                    logger.info(f"  Merged citation from reform {duplicate_reform_id} to {target_reform_id}")
        
        # Merge reform types: get reform types from duplicate reform and link them to target
        cursor.execute("""
            SELECT reform_type_id
            FROM reform_reform_types
            WHERE reform_id = %s
        """, (duplicate_reform_id,))
        duplicate_reform_types = cursor.fetchall()
        
        if duplicate_reform_types:
            # Get existing reform types for target reform
            cursor.execute("""
                SELECT reform_type_id FROM reform_reform_types WHERE reform_id = %s
            """, (target_reform_id,))
            existing_reform_type_ids = {row['reform_type_id'] for row in cursor.fetchall()}
            
            # Insert reform types from duplicate that don't already exist in target
            for reform_type in duplicate_reform_types:
                if reform_type['reform_type_id'] not in existing_reform_type_ids:
                    cursor.execute("""
                        INSERT INTO reform_reform_types (reform_id, reform_type_id)
                        VALUES (%s, %s)
                        ON CONFLICT (reform_id, reform_type_id) DO NOTHING
                    """, (target_reform_id, reform_type['reform_type_id']))
                    logger.info(f"  Merged reform_type {reform_type['reform_type_id']} from reform {duplicate_reform_id} to {target_reform_id}")
        
        # Also add the reform_type_id parameter if provided and not already present
        if reform_type_id:
            cursor.execute("""
                SELECT 1 FROM reform_reform_types
                WHERE reform_id = %s AND reform_type_id = %s
            """, (target_reform_id, reform_type_id))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO reform_reform_types (reform_id, reform_type_id)
                    VALUES (%s, %s)
                    ON CONFLICT (reform_id, reform_type_id) DO NOTHING
                """, (target_reform_id, reform_type_id))
                logger.info(f"  Added reform_type {reform_type_id} to target reform {target_reform_id}")
        
        # Delete the duplicate reform (CASCADE will handle reform_sources, reform_citations, and reform_reform_types)
        cursor.execute("DELETE FROM reforms WHERE id = %s", (duplicate_reform_id,))
        logger.info(f"  Deleted duplicate reform {duplicate_reform_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error merging reforms {duplicate_reform_id} and {target_reform_id}: {e}", exc_info=True)
        return False


def update_reform_enrichment(cursor, reform_id: int, enrichment_data: Dict, reform_type_id: Optional[int] = None):
    """
    Update reform record with AI enrichment data.
    
    Args:
        cursor: Database cursor
        reform_id: Reform ID
        enrichment_data: Enrichment data dict
        reform_type_id: Optional new reform_type_id if reform_type_suggestion was provided
    
    Returns:
        tuple: (success: bool, merged_reform_id: Optional[int], error_message: Optional[str])
               merged_reform_id is the ID of the reform that was merged into (if merge occurred)
    """
    try:
        cursor.execute("""
            UPDATE reforms
            SET ai_enriched_fields = %s,
                ai_enrichment_version = %s,
                ai_enriched_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (json.dumps(enrichment_data), ENRICHMENT_VERSION, reform_id))
        
        # Update reform_type_id if suggestion was provided
        # Add the reform type via the junction table if it doesn't already exist
        if reform_type_id:
            # Check if this reform already has this reform type
            cursor.execute("""
                SELECT 1 FROM reform_reform_types
                WHERE reform_id = %s AND reform_type_id = %s
            """, (reform_id, reform_type_id))
            
            if not cursor.fetchone():
                # Add the reform type via junction table
                cursor.execute("""
                    INSERT INTO reform_reform_types (reform_id, reform_type_id)
                    VALUES (%s, %s)
                    ON CONFLICT (reform_id, reform_type_id) DO NOTHING
                """, (reform_id, reform_type_id))
                logger.info(f"Added reform_type_id {reform_type_id} to reform {reform_id}")
        
        return True, None, None
    except psycopg2_errors.UniqueViolation as e:
        # Handle constraint violations by finding and merging the duplicate
        # Note: When a UniqueViolation occurs, the transaction is in an error state
        # The caller must rollback before we can proceed, so we return an error
        # and let the caller handle the rollback and retry with merge logic
        error_msg = str(e)
        if 'duplicate key' in error_msg.lower() or 'unique constraint' in error_msg.lower():
            logger.warning(f"Reform {reform_id}: Constraint violation detected - {error_msg}")
            # Return a special error code that indicates a merge is needed
            # The caller will handle rollback and retry
            return False, None, f"MERGE_NEEDED: {error_msg}"
        raise  # Re-raise if it's a different integrity error


def update_policy_doc_enrichment(cursor, policy_doc_id: int, enrichment_data: Dict):
    """Update policy document with AI enrichment data."""
    cursor.execute("""
        UPDATE policy_documents
        SET ai_enriched_fields = %s,
            ai_enrichment_version = %s,
            ai_enriched_at = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (json.dumps(enrichment_data), ENRICHMENT_VERSION, policy_doc_id))


def get_reform_type_id(cursor, reform_type_code: str) -> Optional[int]:
    """Get reform_type_id from code."""
    cursor.execute("SELECT id FROM reform_types WHERE code = %s", (reform_type_code,))
    result = cursor.fetchone()
    return result['id'] if result else None


def create_enrichment_run(cursor, ai_provider) -> int:
    """Create a new enrichment run record."""
    cursor.execute("""
        INSERT INTO ai_enrichment_runs 
        (enrichment_version, ai_provider, ai_model, status)
        VALUES (%s, %s, %s, 'running')
        RETURNING id
    """, (ENRICHMENT_VERSION, AI_PROVIDER, ai_provider.get_model_name()))
    return cursor.fetchone()['id']


def update_enrichment_run(cursor, run_id: int, **kwargs):
    """Update enrichment run record."""
    updates = []
    values = []
    for key, value in kwargs.items():
        updates.append(f"{key} = %s")
        values.append(value)
    
    if updates:
        values.append(run_id)
        cursor.execute(f"""
            UPDATE ai_enrichment_runs
            SET {', '.join(updates)}
            WHERE id = %s
        """, values)


def run_enrichment(limit: int = 100, reform_id: Optional[int] = None, force: bool = False):
    """
    Main enrichment function.
    
    Args:
        limit: Maximum number of reforms to process
        reform_id: Optional specific reform ID
        force: Force re-enrichment even if already enriched
    """
    conn = cursor = None
    run_id = None
    
    try:
        # Get AI provider
        provider_kwargs = {}
        if AI_MODEL:
            provider_kwargs['model'] = AI_MODEL
        
        ai_provider = get_ai_provider(AI_PROVIDER, **provider_kwargs)
        logger.info(f"Using AI provider: {AI_PROVIDER}, model: {ai_provider.get_model_name()}")
        
        # Connect to database
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Create enrichment run
        run_id = create_enrichment_run(cursor, ai_provider)
        logger.info(f"Created enrichment run {run_id}")
        
        # Find reforms to enrich
        version = 0 if force else ENRICHMENT_VERSION
        reforms = find_unenriched_reforms(cursor, version, limit, reform_id)
        logger.info(f"Found {len(reforms)} reforms to enrich")
        
        if not reforms:
            logger.info("No reforms to enrich")
        update_enrichment_run(cursor, run_id, status='completed', completed_at=datetime.now(timezone.utc))
        conn.commit()
        
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
        
        # Log to activity_logs table
        logger.info(
            "AI enrichment complete (no reforms to enrich)",
            extra={
                "log_type": "ai_enrichment",
                "action": action_name,
                "status": "success",
                "metadata": {
                    "reforms_processed": 0,
                    "reforms_enriched": 0,
                    "reforms_failed": 0,
                    "ai_provider": AI_PROVIDER,
                    "ai_model": ai_provider.get_model_name(),
                    "enrichment_version": ENRICHMENT_VERSION
                },
                "duration_seconds": duration
            }
        )
        
        return
        
        # Process reforms
        processed = 0
        enriched = 0
        failed = 0
        policy_docs_enriched = 0
        
        for reform in reforms:
            processed += 1
            logger.info(f"Processing reform {reform['id']} ({processed}/{len(reforms)})")
            
            try:
                # Enrich reform
                enrichment_data, error = enrich_reform(ai_provider, reform)
                
                if error:
                    logger.warning(f"Failed to enrich reform {reform['id']}: {error}")
                    failed += 1
                    continue
                
                # Get reform_type_id if suggestion provided
                reform_type_id = None
                if enrichment_data.get('fields', {}).get('reform_type_suggestion'):
                    suggestion = enrichment_data['fields']['reform_type_suggestion']['value']
                    reform_type_id = get_reform_type_id(cursor, suggestion)
                    if not reform_type_id:
                        logger.warning(f"Unknown reform type code: {suggestion}")
                
                # Update reform (may return merged_reform_id if a merge occurred)
                success, merged_reform_id, error_msg = update_reform_enrichment(cursor, reform['id'], enrichment_data, reform_type_id)
                if not success:
                    # Check if this is a merge-needed error (legacy - may not be needed anymore)
                    if error_msg and error_msg.startswith("MERGE_NEEDED:"):
                        logger.warning(f"Merge needed for reform {reform['id']}, but merge logic has been simplified")
                        # Rollback and continue - merge logic removed as reform_type_id is now in junction table
                        conn.rollback()
                        failed += 1
                        continue
                    
                    logger.warning(f"Failed to update reform {reform['id']}: {error_msg}")
                    failed += 1
                    # Rollback this item's changes and continue
                    conn.rollback()
                    continue
                
                if merged_reform_id:
                    logger.info(f"Reform {reform['id']} was merged into reform {merged_reform_id}")
                    # The reform was merged, so we count it as enriched but the original ID no longer exists
                    enriched += 1
                else:
                    enriched += 1
                
                # Handle policy document enrichment separately
                policy_enrichment = {
                    'version': ENRICHMENT_VERSION,
                    'model': ai_provider.get_model_name(),
                    'provider': AI_PROVIDER,
                    'enriched_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                    'fields': {}
                }
                
                if 'key_points' in enrichment_data.get('fields', {}):
                    policy_enrichment['fields']['key_points'] = enrichment_data['fields']['key_points']
                if 'analysis' in enrichment_data.get('fields', {}):
                    policy_enrichment['fields']['analysis'] = enrichment_data['fields']['analysis']
                
                if policy_enrichment['fields'] and reform.get('policy_doc_id'):
                    update_policy_doc_enrichment(cursor, reform['policy_doc_id'], policy_enrichment)
                    policy_docs_enriched += 1
                
                # Commit after each successful reform to avoid transaction issues
                conn.commit()
                
                # Update run progress every 10 reforms (without transaction, just for logging)
                if processed % 10 == 0:
                    # Use a separate transaction for progress updates
                    try:
                        update_enrichment_run(
                            cursor, run_id,
                            reforms_processed=processed,
                            reforms_enriched=enriched,
                            reforms_failed=failed,
                            policy_docs_enriched=policy_docs_enriched
                        )
                        conn.commit()
                    except Exception as progress_error:
                        # Don't fail the whole process if progress update fails
                        logger.warning(f"Failed to update progress: {progress_error}")
                        conn.rollback()
                
            except Exception as e:
                logger.error(f"Error processing reform {reform['id']}: {e}", exc_info=True)
                failed += 1
                # Rollback the current transaction to recover from any database errors
                # This allows subsequent reforms to be processed
                try:
                    conn.rollback()
                except Exception as rollback_error:
                    logger.error(f"Error during rollback: {rollback_error}")
                    # If rollback fails, we need to reconnect
                    try:
                        close_db_connection(conn, cursor)
                    except:
                        pass
                    conn, cursor = get_db_connection()
                    cursor = conn.cursor(cursor_factory=RealDictCursor)
                    # Re-create the enrichment run context if needed (though run_id should still be valid)
        
        # Final update
        update_enrichment_run(
            cursor, run_id,
            status='completed',
            completed_at=datetime.now(timezone.utc),
            reforms_processed=processed,
            reforms_enriched=enriched,
            reforms_failed=failed,
            policy_docs_enriched=policy_docs_enriched
        )
        
        conn.commit()
        
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
        
        # Log to activity_logs table
        logger.info(
            "AI enrichment complete",
            extra={
                "log_type": "ai_enrichment",
                "action": action_name,
                "status": "success",
                "metadata": {
                    "reforms_processed": processed,
                    "reforms_enriched": enriched,
                    "reforms_failed": failed,
                    "policy_docs_enriched": policy_docs_enriched,
                    "ai_provider": AI_PROVIDER,
                    "ai_model": ai_provider.get_model_name(),
                    "enrichment_version": ENRICHMENT_VERSION
                },
                "duration_seconds": duration
            }
        )
        
        logger.info(f"Enrichment complete: {enriched} enriched, {failed} failed out of {processed} processed")
        
    except Exception as e:
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
        
        # Log to activity_logs table
        logger.error(
            "AI enrichment failed",
            extra={
                "log_type": "ai_enrichment",
                "action": action_name,
                "status": "failed",
                "error_message": str(e),
                "duration_seconds": duration
            }
        )
        
        logger.error(f"Enrichment failed: {e}", exc_info=True)
        if run_id and cursor:
            try:
                update_enrichment_run(cursor, run_id, status='failed', error_message=str(e))
                if conn:
                    conn.commit()
            except:
                pass
        raise  # Re-raise to ensure script exits with non-zero code
    finally:
        close_db_connection(conn, cursor)


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description='AI Enrichment Service for Urbanist Reform Map')
    parser.add_argument('--limit', type=int, default=100, help='Maximum number of reforms to process')
    parser.add_argument('--reform-id', type=int, help='Enrich specific reform by ID')
    parser.add_argument('--force', action='store_true', help='Force re-enrichment even if already enriched')
    parser.add_argument('--all', action='store_true', help='Process all unenriched reforms (ignores limit)')
    
    args = parser.parse_args()
    
    limit = 999999 if args.all else args.limit
    try:
        run_enrichment(limit=limit, reform_id=args.reform_id, force=args.force)
    except Exception as e:
        logger.error(f"Script failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
