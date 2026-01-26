"""
Bill Submission Processor
Main workflow for processing user-submitted bills through scraping, assessment, and enrichment.
"""

import os
import sys
import json
import logging
from typing import Dict, Optional, Any, Tuple
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import (
    get_db_connection, close_db_connection, initialize_environment,
    bulk_upsert_places, bulk_upsert_reforms, load_reform_type_map,
    get_state_code, get_state_name, place_key
)
from scripts.enrichment.bill_scraping_service import scrape_and_store_bill_data
from scripts.enrichment.bill_assessment import assess_bill_relevance, should_track_bill
from scripts.enrichment.ai_enrichment import enrich_reform, update_reform_enrichment, get_reform_type_id
from scripts.enrichment.utils import get_domain
from scripts.utils.logging_config import setup_database_logging
import re

# Load environment variables
initialize_environment()

logger = logging.getLogger(__name__)

# Setup database logging for activity logs
setup_database_logging()


def extract_state_from_url(url: str) -> Optional[str]:
    """Try to extract state code from URL domain patterns."""
    # Common patterns: leginfo.legislature.ca.gov -> CA, ilga.gov -> IL
    state_patterns = {
        'ca.gov': 'CA', 'ilga.gov': 'IL', 'malegislature.gov': 'MA',
        'capitol.texas.gov': 'TX', 'leg.wa.gov': 'WA', 'capitol.hawaii.gov': 'HI',
        'rilegislature.gov': 'RI', 'njleg.state.nj.us': 'NJ', 'revisor.mn.gov': 'MN',
        'legislature.state.mn.us': 'MN', 'lis.virginia.gov': 'VA', 'cga.ct.gov': 'CT',
        'gencourt.state.nh.us': 'NH', 'azleg.gov': 'AZ', 'oregonlegislature.gov': 'OR',
        'flsenate.gov': 'FL', 'legmt.gov': 'MT', 'ncleg.gov': 'NC',
        'legislature.maine.gov': 'ME', 'nyassembly.gov': 'NY', 'nysenate.gov': 'NY',
        'legislature.ky.gov': 'KY', 'capitol.tn.gov': 'TN', 'le.utah.gov': 'UT',
        'mgaleg.maryland.gov': 'MD', 'legis.wisconsin.gov': 'WI', 'scstatehouse.gov': 'SC',
        'nmlegis.gov': 'NM', 'legis.ga.gov': 'GA', 'wvlegislature.gov': 'WV',
        'leg.state.nv.us': 'NV', 'legislature.ohio.gov': 'OH', 'oklegislature.gov': 'OK',
        'legis.iowa.gov': 'IA', 'legislature.mi.gov': 'MI', 'legisweb.state.wy.us': 'WY',
        'arkleg.state.ar.us': 'AR', 'legislature.vermont.gov': 'VT', 'legislature.idaho.gov': 'ID',
        'nebraskalegislature.gov': 'NE', 'palegis.us': 'PA', 'lims.dccouncil.gov': 'DC',
        'kslegislature.org': 'KS', 'house.mo.gov': 'MO', 'iga.in.gov': 'IN',
        'leg.colorado.gov': 'CO', 'legis.la.gov': 'LA', 'legis.nd.gov': 'ND',
        'legis.delaware.gov': 'DE', 'legislature.state.al.us': 'AL'
    }
    
    for pattern, state_code in state_patterns.items():
        if pattern in url.lower():
            return state_code
    
    return None


def extract_state_from_bill_text(bill_text: str) -> Optional[str]:
    """Try to extract state code from bill text."""
    if not bill_text:
        return None
    
    # Look for state names in the text (first 5000 chars)
    text_sample = bill_text[:5000].upper()
    
    # Common patterns: "State of California", "Commonwealth of Massachusetts", etc.
    state_name_patterns = {
        'CALIFORNIA': 'CA', 'ILLINOIS': 'IL', 'MASSACHUSETTS': 'MA', 'TEXAS': 'TX',
        'WASHINGTON': 'WA', 'HAWAII': 'HI', 'RHODE ISLAND': 'RI', 'NEW JERSEY': 'NJ',
        'MINNESOTA': 'MN', 'VIRGINIA': 'VA', 'CONNECTICUT': 'CT', 'NEW HAMPSHIRE': 'NH',
        'ARIZONA': 'AZ', 'OREGON': 'OR', 'FLORIDA': 'FL', 'MONTANA': 'MT', 'NORTH CAROLINA': 'NC',
        'MAINE': 'ME', 'NEW YORK': 'NY', 'KENTUCKY': 'KY', 'TENNESSEE': 'TN', 'UTAH': 'UT',
        'MARYLAND': 'MD', 'WISCONSIN': 'WI', 'SOUTH CAROLINA': 'SC', 'NEW MEXICO': 'NM',
        'GEORGIA': 'GA', 'WEST VIRGINIA': 'WV', 'NEVADA': 'NV', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
        'IOWA': 'IA', 'MICHIGAN': 'MI', 'WYOMING': 'WY', 'ARKANSAS': 'AR', 'VERMONT': 'VT',
        'IDAHO': 'ID', 'NEBRASKA': 'NE', 'PENNSYLVANIA': 'PA', 'KANSAS': 'KS', 'MISSOURI': 'MO',
        'INDIANA': 'IN', 'COLORADO': 'CO', 'LOUISIANA': 'LA', 'NORTH DAKOTA': 'ND', 'DELAWARE': 'DE',
        'ALABAMA': 'AL', 'DISTRICT OF COLUMBIA': 'DC', 'MISSISSIPPI': 'MS', 'SOUTH DAKOTA': 'SD'
    }
    
    for state_name, state_code in state_name_patterns.items():
        if state_name in text_sample:
            return state_code
    
    return None


def create_or_get_state_place(state_code: str, state_name: str) -> Optional[int]:
    """Create or get state place record."""
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if place exists
        cursor.execute("""
            SELECT id FROM places
            WHERE name = %s AND state_code = %s AND place_type = 'state'
        """, (state_name, state_code))
        
        result = cursor.fetchone()
        if result:
            return result['id']
        
        # Create place
        places = [{
            'name': state_name,
            'place_type': 'state',
            'state_code': state_code,
            'population': None,
            'latitude': None,
            'longitude': None,
            'encoded_name': None
        }]
        
        created, updated, place_id_map = bulk_upsert_places(conn, cursor, places)
        conn.commit()
        
        key = place_key(state_name, state_code, 'state')
        place_id = place_id_map.get(key)
        
        return place_id
        
    except Exception as e:
        logger.error(f"Error creating/getting state place {state_code}: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return None
    finally:
        close_db_connection(conn, cursor)


def get_reform_type_ids_from_assessment(assessment: Dict, cursor) -> list:
    """Get reform type IDs from assessment suggestions."""
    suggestions = assessment.get('reform_type_suggestions', [])
    if not suggestions:
        return []
    
    # load_reform_type_map only needs cursor
    reform_type_map = load_reform_type_map(cursor, include_short_codes=True)
    reform_type_ids = []
    
    for suggestion in suggestions:
        if isinstance(suggestion, str):
            reform_type_id = reform_type_map.get(suggestion)
            if reform_type_id:
                reform_type_ids.append(reform_type_id)
    
    return reform_type_ids


def get_default_reform_type_ids(cursor) -> list:
    """Get default/unspecified reform type IDs as fallback."""
    # load_reform_type_map only needs cursor
    reform_type_map = load_reform_type_map(cursor, include_short_codes=True)
    
    # Try common fallback types
    fallback_codes = ['other:general', 'other:unspecified']
    for code in fallback_codes:
        reform_type_id = reform_type_map.get(code)
        if reform_type_id:
            return [reform_type_id]
    
    return []


def create_reform_from_submission(conn, cursor, place_id: int, policy_doc_id: int, 
                                  url: str, assessment: Dict, reform_type_ids: list) -> Optional[int]:
    """Create a reform record from submission data."""
    try:
        # Get policy document info
        cursor.execute("""
            SELECT reference_number, title, status, date_adopted
            FROM policy_documents WHERE id = %s
        """, (policy_doc_id,))
        policy_doc = cursor.fetchone()
        
        # Create reform record
        reform_record = {
            'place_id': place_id,
            'policy_document_id': policy_doc_id,
            'reform_type_ids': reform_type_ids,
            'status': policy_doc.get('status') or 'proposed',
            'summary': policy_doc.get('title') or f"Bill from {url}",
            'legislative_number': policy_doc.get('reference_number'),
            'link_url': url,
            'adoption_date': policy_doc.get('date_adopted'),
            'scope': None,
            'land_use': None,
            'requirements': None,
            'notes': None,
            'reform_mechanism': None,
            'reform_phase': None,
            'intensity': None
        }
        
        # Use bulk_upsert_reforms to create the reform
        created, updated, reform_ids, deduped = bulk_upsert_reforms(
            conn, cursor, [reform_record]
        )
        
        if reform_ids and len(reform_ids) > 0:
            return reform_ids[0]
        
        return None
        
    except Exception as e:
        logger.error(f"Error creating reform: {e}", exc_info=True)
        return None


def check_existing_bill(url: str) -> Optional[Dict[str, Any]]:
    """
    Check if a bill already exists in the database by URL or reference_number.
    
    Args:
        url: Bill URL to check
    
    Returns:
        Dict with existing reform info if found, None otherwise
    """
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check by document_url
        cursor.execute("""
            SELECT pd.id as policy_doc_id, pd.reference_number, pd.state_code,
                   r.id as reform_id, r.summary, r.status
            FROM policy_documents pd
            LEFT JOIN reforms r ON r.policy_document_id = pd.id
            WHERE pd.document_url = %s
            LIMIT 1
        """, (url,))
        
        result = cursor.fetchone()
        if result:
            return {
                "exists": True,
                "policy_document_id": result['policy_doc_id'],
                "reform_id": result['reform_id'],
                "reference_number": result['reference_number'],
                "state_code": result['state_code'],
                "summary": result['summary'],
                "status": result['status']
            }
        
        return None
        
    except Exception as e:
        logger.error(f"Error checking for existing bill {url}: {e}", exc_info=True)
        return None
    finally:
        close_db_connection(conn, cursor)


def update_submission_status(submission_id: int, status: str, 
                             error_message: Optional[str] = None,
                             assessment_result: Optional[Dict] = None,
                             policy_doc_id: Optional[int] = None,
                             reform_id: Optional[int] = None,
                             existing_reform_id: Optional[int] = None) -> bool:
    """Update bill submission status."""
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        updates = ["status = %s", "updated_at = CURRENT_TIMESTAMP"]
        values = [status]
        
        if error_message:
            updates.append("error_message = %s")
            values.append(error_message)
        
        if assessment_result:
            updates.append("assessment_result = %s")
            values.append(json.dumps(assessment_result))
        
        if policy_doc_id:
            updates.append("policy_document_id = %s")
            values.append(policy_doc_id)
        
        if reform_id:
            updates.append("reform_id = %s")
            values.append(reform_id)
        
        if existing_reform_id:
            updates.append("existing_reform_id = %s")
            values.append(existing_reform_id)
        
        values.append(submission_id)
        
        cursor.execute(f"""
            UPDATE bill_submissions
            SET {', '.join(updates)}
            WHERE id = %s
        """, values)
        
        conn.commit()
        return True
        
    except Exception as e:
        logger.error(f"Error updating submission {submission_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return False
    finally:
        close_db_connection(conn, cursor)


def create_policy_document_from_bill(url: str, bill_text: str, title: Optional[str] = None,
                                     reference_number: Optional[str] = None,
                                     state_code: Optional[str] = None) -> Optional[int]:
    """
    Create a policy_document record from scraped bill data.
    
    Args:
        url: Bill URL
        bill_text: Scraped bill text
        title: Optional bill title
        reference_number: Optional reference number (e.g., "AB 1234")
        state_code: Optional state code
    
    Returns:
        policy_document_id or None
    """
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Try to extract reference number from URL or title if not provided
        if not reference_number:
            # Simple extraction - could be improved
            if title:
                # Look for patterns like "AB 1234" or "SB 567" in title
                import re
                match = re.search(r'([A-Z]{1,3}\s+\d+)', title)
                if match:
                    reference_number = match.group(1)
        
        # Generate a placeholder reference number if still missing
        if not reference_number:
            reference_number = f"SUBMITTED-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
        
        # Insert policy document
        cursor.execute("""
            INSERT INTO policy_documents (
                reference_number, state_code, document_url, title
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (state_code, reference_number) DO UPDATE
            SET document_url = EXCLUDED.document_url,
                title = COALESCE(EXCLUDED.title, policy_documents.title),
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (reference_number, state_code, url, title))
        
        result = cursor.fetchone()
        policy_doc_id = result['id'] if result else None
        
        conn.commit()
        
        if policy_doc_id:
            logger.info(f"Created/updated policy_document {policy_doc_id} for {url}")
        
        return policy_doc_id
        
    except Exception as e:
        logger.error(f"Error creating policy document for {url}: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return None
    finally:
        close_db_connection(conn, cursor)


def add_to_review_queue(submission_id: int, policy_doc_id: int, reason: str) -> bool:
    """Add a bill to the review queue."""
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            INSERT INTO bill_review_queue (submission_id, policy_document_id, reason)
            VALUES (%s, %s, %s)
            ON CONFLICT (submission_id) DO UPDATE SET
                reason = EXCLUDED.reason,
                policy_document_id = EXCLUDED.policy_document_id
        """, (submission_id, policy_doc_id, reason))
        
        conn.commit()
        logger.info(f"Added submission {submission_id} to review queue")
        return True
        
    except Exception as e:
        logger.error(f"Error adding to review queue: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return False
    finally:
        close_db_connection(conn, cursor)


def process_bill_submission(submission_id: int) -> bool:
    """
    Main processing workflow for a bill submission.
    
    Steps:
    1. Get submission record
    2. Check for duplicates
    3. Scrape bill
    4. Assess worth tracking
    5. If worth tracking: create reform and enrich
    6. If not worth tracking: add to review queue
    
    Args:
        submission_id: Submission ID
    
    Returns:
        bool: True if successful
    """
    conn = cursor = None
    start_time = datetime.now(timezone.utc)
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get submission
        cursor.execute("SELECT * FROM bill_submissions WHERE id = %s", (submission_id,))
        submission = cursor.fetchone()
        
        if not submission:
            logger.error(f"Submission {submission_id} not found")
            return False
        
        url = submission['submitted_url']
        
        # Log start of processing
        logger.info(
            f"Processing submission {submission_id} for {url}",
            extra={
                "log_type": "bill_submission",
                "action": "process",
                "status": "running",
                "metadata": {
                    "submission_id": submission_id,
                    "url": url
                }
            }
        )
        
        logger.info(f"Processing submission {submission_id} for {url}")
        
        # Step 1: Check for duplicates
        update_submission_status(submission_id, 'checking_duplicates')
        existing = check_existing_bill(url)
        
        if existing and existing.get('reform_id'):
            logger.info(f"Found existing reform {existing['reform_id']} for {url}")
            update_submission_status(
                submission_id, 
                'duplicate_found',
                existing_reform_id=existing['reform_id'],
                policy_doc_id=existing['policy_document_id']
            )
            
            duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
            logger.info(
                "Bill submission processed (duplicate found)",
                extra={
                    "log_type": "bill_submission",
                    "action": "process",
                    "status": "success",
                    "metadata": {
                        "submission_id": submission_id,
                        "url": url,
                        "existing_reform_id": existing['reform_id'],
                        "result": "duplicate_found"
                    },
                    "duration_seconds": duration
                }
            )
            
            return True
        
        # Step 2: Create policy document (placeholder, will be updated by scraper)
        update_submission_status(submission_id, 'creating_policy_doc')
        policy_doc_id = create_policy_document_from_bill(url, "", title=None)
        
        if not policy_doc_id:
            update_submission_status(submission_id, 'failed', error_message="Failed to create policy document")
            return False
        
        update_submission_status(submission_id, 'scraping', policy_doc_id=policy_doc_id)
        
        # Step 3: Scrape bill
        success, error = scrape_and_store_bill_data(policy_doc_id, url, use_ai_fallback=True)
        
        if not success:
            update_submission_status(submission_id, 'failed', error_message=error or "Scraping failed")
            return False
        
        # Get scraped bill text
        cursor.execute("SELECT bill_text, title, reference_number, state_code FROM policy_documents WHERE id = %s", (policy_doc_id,))
        policy_doc = cursor.fetchone()
        
        if not policy_doc or not policy_doc.get('bill_text'):
            update_submission_status(submission_id, 'failed', error_message="No bill text scraped")
            return False
        
        bill_text = policy_doc['bill_text']
        
        # Step 4: Assess worth tracking
        update_submission_status(submission_id, 'assessing')
        assessment = assess_bill_relevance(
            bill_text=bill_text,
            url=url,
            title=policy_doc.get('title'),
            domain=get_domain(url)
        )
        
        update_submission_status(submission_id, 'assessing', assessment_result=assessment)
        
        # Step 5: Decide next steps
        if should_track_bill(assessment, threshold=0.5):
            logger.info(f"Bill is worth tracking (probability: {assessment['probability']:.2f})")
            update_submission_status(submission_id, 'enriching')
            
            # Extract state code from URL or policy document
            state_code = policy_doc.get('state_code')
            if not state_code:
                # Try to extract from URL domain or bill text
                state_code = extract_state_from_url(url) or extract_state_from_bill_text(bill_text)
            
            if not state_code:
                logger.warning(f"Could not determine state_code for submission {submission_id}")
                update_submission_status(submission_id, 'awaiting_review', policy_doc_id=policy_doc_id, 
                                       error_message="Could not determine state/jurisdiction")
                # Add to review queue so admin can manually set the state
                add_to_review_queue(
                    submission_id,
                    policy_doc_id,
                    "Could not automatically determine state/jurisdiction. Manual review needed."
                )
                return True
            
            # Create or get state place
            state_name = get_state_name(state_code) or f"State {state_code}"
            place_id = create_or_get_state_place(state_code, state_name)
            
            if not place_id:
                logger.error(f"Failed to create/get place for {state_code}")
                update_submission_status(submission_id, 'failed', error_message="Failed to create/get place")
                return False
            
            # Get reform type IDs from assessment suggestions
            reform_type_ids = get_reform_type_ids_from_assessment(assessment, cursor)
            
            if not reform_type_ids:
                logger.warning(f"No valid reform types from assessment for submission {submission_id}")
                # Use a default/unspecified reform type if available
                reform_type_ids = get_default_reform_type_ids(cursor)
            
            if not reform_type_ids:
                logger.error(f"Could not determine reform types for submission {submission_id}")
                update_submission_status(submission_id, 'awaiting_review', policy_doc_id=policy_doc_id,
                                       error_message="Could not determine reform types")
                # Add to review queue so admin can manually set the reform types
                add_to_review_queue(
                    submission_id,
                    policy_doc_id,
                    "Could not automatically determine reform types. Manual review needed."
                )
                return True
            
            # Create reform
            reform_id = create_reform_from_submission(
                conn, cursor, place_id, policy_doc_id, url, assessment, reform_type_ids
            )
            
            if not reform_id:
                logger.error(f"Failed to create reform for submission {submission_id}")
                update_submission_status(submission_id, 'failed', error_message="Failed to create reform")
                return False
            
            # Run AI enrichment
            try:
                # Get reform data for enrichment
                cursor.execute("""
                    SELECT r.id, r.link_url, r.legislative_number, r.summary,
                           r.scope, r.land_use, r.requirements,
                           p.name as place_name, tld.state_name,
                           pd.bill_text, pd.document_url, pd.reference_number, pd.title as policy_doc_title
                    FROM reforms r
                    JOIN places p ON r.place_id = p.id
                    JOIN top_level_division tld ON p.state_code = tld.state_code
                    LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
                    WHERE r.id = %s
                """, (reform_id,))
                
                reform_data = cursor.fetchone()
                
                if reform_data and reform_data.get('bill_text'):
                    # Get AI provider
                    from scripts.enrichment.ai_providers import get_ai_provider
                    ai_provider = get_ai_provider(os.getenv('AI_PROVIDER', 'anthropic'))
                    
                    # Enrich reform
                    enrichment_data, error = enrich_reform(ai_provider, reform_data)
                    
                    if enrichment_data:
                        # Get reform_type_id if suggestion provided
                        reform_type_id = None
                        if enrichment_data.get('fields', {}).get('reform_type_suggestion'):
                            suggestion = enrichment_data['fields']['reform_type_suggestion'].get('value')
                            if suggestion:
                                reform_type_id = get_reform_type_id(cursor, suggestion)
                        
                        # Update reform with enrichment
                        success, merged_reform_id, error_msg = update_reform_enrichment(
                            cursor, reform_id, enrichment_data, reform_type_id
                        )
                        
                        if success:
                            conn.commit()
                            logger.info(f"Successfully enriched reform {reform_id}")
                            update_submission_status(submission_id, 'completed', policy_doc_id=policy_doc_id, reform_id=reform_id)
                        else:
                            logger.warning(f"Failed to update enrichment: {error_msg}")
                            update_submission_status(submission_id, 'completed', policy_doc_id=policy_doc_id, reform_id=reform_id)
                    else:
                        logger.warning(f"Enrichment failed: {error}")
                        update_submission_status(submission_id, 'completed', policy_doc_id=policy_doc_id, reform_id=reform_id)
                else:
                    logger.warning(f"No bill text available for enrichment of reform {reform_id}")
                    update_submission_status(submission_id, 'completed', policy_doc_id=policy_doc_id, reform_id=reform_id)
                    add_to_review_queue(
                        submission_id,
                        policy_doc_id,
                        "Auto-accepted; visible to users pending admin review."
                    )
                if reform_data and reform_data.get('bill_text'):
                    add_to_review_queue(
                        submission_id,
                        policy_doc_id,
                        "Auto-accepted; visible to users pending admin review."
                    )
                    
            except Exception as e:
                logger.error(f"Error during enrichment: {e}", exc_info=True)
                # Still mark as completed since reform was created
                update_submission_status(submission_id, 'completed', policy_doc_id=policy_doc_id, reform_id=reform_id)
                add_to_review_queue(
                    submission_id,
                    policy_doc_id,
                    "Auto-accepted; visible to users pending admin review."
                )
            
        else:
            logger.info(f"Bill not worth tracking (probability: {assessment['probability']:.2f})")
            
            # Check if user confirmed they want to submit despite low relevance
            cursor.execute("SELECT submission_metadata FROM bill_submissions WHERE id = %s", (submission_id,))
            metadata_row = cursor.fetchone()
            confirmed = False
            if metadata_row and metadata_row.get('submission_metadata'):
                try:
                    metadata = metadata_row['submission_metadata']
                    if isinstance(metadata, str):
                        import json
                        metadata = json.loads(metadata)
                    confirmed = metadata.get('confirmed', False)
                except Exception as e:
                    logger.warning(f"Failed to parse submission_metadata: {e}")
            
            if confirmed:
                # User confirmed - add to review queue but mark status as review_queue
                logger.info(f"User confirmed submission despite low relevance")
                update_submission_status(submission_id, 'review_queue', policy_doc_id=policy_doc_id)
                add_to_review_queue(
                    submission_id, 
                    policy_doc_id, 
                    f"User confirmed submission. Low relevance probability: {assessment['probability']:.2f}. {assessment.get('reasoning', '')}"
                )
            else:
                # Needs user confirmation
                update_submission_status(submission_id, 'needs_confirmation', policy_doc_id=policy_doc_id)
        
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
        
        # Get final status
        cursor.execute("SELECT status, reform_id, policy_document_id FROM bill_submissions WHERE id = %s", (submission_id,))
        final_status = cursor.fetchone()
        
        logger.info(
            "Bill submission processed",
            extra={
                "log_type": "bill_submission",
                "action": "process",
                "status": "success",
                "metadata": {
                    "submission_id": submission_id,
                    "url": url,
                    "final_status": final_status['status'] if final_status else 'unknown',
                    "reform_id": final_status.get('reform_id') if final_status else None,
                    "policy_document_id": final_status.get('policy_document_id') if final_status else None
                },
                "duration_seconds": duration
            }
        )
        
        return True
        
    except Exception as e:
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds())
        
        logger.error(
            "Bill submission processing failed",
            extra={
                "log_type": "bill_submission",
                "action": "process",
                "status": "failed",
                "error_message": str(e),
                "metadata": {
                    "submission_id": submission_id,
                    "url": url if 'url' in locals() else None
                },
                "duration_seconds": duration
            }
        )
        
        logger.error(f"Error processing submission {submission_id}: {e}", exc_info=True)
        update_submission_status(submission_id, 'failed', error_message=str(e))
        return False
    finally:
        close_db_connection(conn, cursor)
