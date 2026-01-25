"""
Bill Scraping Service
Scrapes and stores structured bill data in policy_documents table.
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import get_db_connection, close_db_connection
from scripts.enrichment.bill_scraper import get_bill_info
from scripts.enrichment.utils import get_domain, parse_date_for_db
from scripts.enrichment.bill_data_extractor import (
    extract_structured_dates,
    extract_vote_counts,
    extract_sponsors,
    extract_legislative_history,
    extract_full_bill_text,
)
from scripts.enrichment.ai_bill_extractor import extract_bill_data_with_fallback

logger = logging.getLogger(__name__)


def _record_scrape_failure(
    conn, policy_doc_id: int, error_type: str, *, detail: Optional[str] = None
) -> None:
    """Record a failed scrape attempt in scraping_metadata so we skip re-scraping."""
    if not conn:
        return
    cur = None
    try:
        cur = conn.cursor()
        metadata = {
            "last_scrape_attempt_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "status": "failed",
            "error_type": error_type,
        }
        if detail:
            metadata["error_detail"] = detail[:500]  # cap length
        cur.execute(
            """
            UPDATE policy_documents
            SET scraping_metadata = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (json.dumps(metadata), policy_doc_id),
        )
        conn.commit()
    except Exception as e:
        logger.warning(f"Could not record scrape failure for policy_doc {policy_doc_id}: {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()


def scrape_and_store_bill_data(policy_doc_id: int, document_url: str, 
                                use_ai_fallback: bool = True) -> Tuple[bool, Optional[str]]:
    """
    Scrape bill data from URL and store in policy_documents table.
    
    Args:
        policy_doc_id: ID of policy_document record
        document_url: URL to scrape
        use_ai_fallback: Whether to use AI if scraper fails
    
    Returns:
        Tuple of (success, error_message)
    """
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Fetch bill info (text + HTML)
        from scripts.enrichment.utils import get_domain
        domain = get_domain(document_url)
        logger.info(f"Scraping bill data from {document_url} for policy_doc {policy_doc_id} (domain: {domain})")
        bill_info = get_bill_info(document_url, fetch_html=True)
        
        if not bill_info.get('text') and not bill_info.get('html'):
            # Categorize the failure type for better logging
            error_type = "fetch_failed"
            if '403' in str(bill_info.get('html', '')) or '403' in str(bill_info.get('text', '')):
                error_type = "403_forbidden"
            elif '404' in str(bill_info.get('html', '')) or '404' in str(bill_info.get('text', '')):
                error_type = "404_not_found"
            elif '523' in str(bill_info.get('html', '')) or '523' in str(bill_info.get('text', '')):
                error_type = "523_cloudflare"

            _record_scrape_failure(conn, policy_doc_id, error_type)
            logger.warning(f"Failed to scrape policy_doc {policy_doc_id} ({domain}): {error_type}")
            return False, f"Could not fetch bill text or HTML ({error_type})"
        
        bill_text = bill_info.get('text') or ''
        html_content = bill_info.get('html') or ''
        domain = get_domain(document_url)

        # If we have HTML but no raw text (e.g. JS-rendered page), extract text from HTML.
        # Otherwise we "succeed" but store bill_text=NULL and get re-selected every run.
        if not (bill_text and bill_text.strip()) and html_content:
            extracted = extract_full_bill_text(html_content, document_url)
            if extracted and extracted.strip():
                bill_text = extracted
                logger.info(f"Extracted {len(bill_text)} chars bill text from HTML for policy_doc {policy_doc_id}")
            else:
                _record_scrape_failure(conn, policy_doc_id, "no_extractable_text")
                logger.warning(f"No extractable bill text from HTML for policy_doc {policy_doc_id} ({domain})")
                return False, "Could not extract bill text from HTML (no_extractable_text)"
        
        # Extract structured data
        if html_content:
            # Try rule-based extraction first, then AI fallback
            structured_data = extract_bill_data_with_fallback(
                html_content, document_url, domain, use_ai_fallback=use_ai_fallback
            )
        else:
            # If no HTML, try to extract from text
            structured_data = {
                'dates': extract_structured_dates(bill_text, document_url) if bill_text else {},
                'votes': extract_vote_counts(bill_text, document_url) if bill_text else {},
                'sponsors': extract_sponsors(bill_text, document_url) if bill_text else [],
                'committees': [],
                'legislative_history': extract_legislative_history(bill_text, document_url) if bill_text else [],
                'extraction_method': 'text_only'
            }
        
        # Prepare date values for database
        dates = structured_data.get('dates', {})
        date_filed = dates.get('filed')
        date_introduced = dates.get('introduced')
        date_passed_first = dates.get('passed_first_chamber')
        date_passed_second = dates.get('passed_second_chamber')
        date_adopted = dates.get('adopted')
        date_signed = dates.get('signed')
        date_effective = dates.get('effective')
        
        # Convert date values to date objects using shared utility
        def parse_date(date_val):
            dt = parse_date_for_db(date_val)
            return dt.date() if dt else None
        
        date_filed = parse_date(date_filed)
        date_introduced = parse_date(date_introduced)
        date_passed_first = parse_date(date_passed_first)
        date_passed_second = parse_date(date_passed_second)
        date_adopted = parse_date(date_adopted)
        date_signed = parse_date(date_signed)
        date_effective = parse_date(date_effective)
        
        # Prepare vote data (JSONB)
        vote_data = structured_data.get('votes', {}) or None
        
        # Prepare arrays
        sponsors = structured_data.get('sponsors', []) or []
        committees = structured_data.get('committees', []) or []
        
        # Prepare legislative history (JSONB)
        legislative_history = structured_data.get('legislative_history', []) or None
        
        # Prepare scraping metadata
        scraping_metadata = {
            'last_scraped': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'scraper_version': 1,
            'scraper_config_used': domain if domain in ['ilga.gov', 'leginfo.legislature.ca.gov'] else None,
            'extraction_method': structured_data.get('extraction_method', 'unknown'),
            'extraction_confidence': structured_data.get('extraction_confidence'),
            'extraction_reasoning': structured_data.get('extraction_reasoning', '')
        }
        
        # Update policy_document
        update_sql = """
            UPDATE policy_documents
            SET bill_text = %s,
                bill_text_fetched_at = CURRENT_TIMESTAMP,
                bill_text_source = %s,
                date_filed = %s,
                date_introduced = %s,
                date_passed_first_chamber = %s,
                date_passed_second_chamber = %s,
                date_adopted = %s,
                date_signed = %s,
                date_effective = %s,
                vote_data = %s,
                sponsors = %s,
                committees = %s,
                legislative_history = %s,
                scraping_metadata = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """
        
        bill_text_source = 'scraper' if structured_data.get('extraction_method') == 'scraper' else 'ai'

        # Never store success with bill_text NULL: doc would stay "pending" and be re-scraped every run.
        if not (bill_text and bill_text.strip()):
            _record_scrape_failure(conn, policy_doc_id, "no_extractable_text")
            logger.warning(f"No bill text to store for policy_doc {policy_doc_id} (would re-scrape indefinitely)")
            return False, "No bill text extracted (no_extractable_text)"
        
        cursor.execute(update_sql, (
            bill_text,
            bill_text_source,
            date_filed,
            date_introduced,
            date_passed_first,
            date_passed_second,
            date_adopted,
            date_signed,
            date_effective,
            json.dumps(vote_data) if vote_data else None,
            sponsors if sponsors else None,
            committees if committees else None,
            json.dumps(legislative_history) if legislative_history else None,
            json.dumps(scraping_metadata),
            policy_doc_id
        ))
        
        conn.commit()
        
        logger.info(f"Successfully stored bill data for policy_doc {policy_doc_id}: "
                   f"{len(bill_text) if bill_text else 0} chars text, {len(dates)} dates, {len(sponsors)} sponsors")
        
        return True, None
        
    except Exception as e:
        logger.error(f"Error scraping bill data for policy_doc {policy_doc_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
            _record_scrape_failure(conn, policy_doc_id, "exception", detail=str(e))
        return False, str(e)
    finally:
        close_db_connection(conn, cursor)


def scrape_pending_policy_documents(
    limit: int = 100, use_ai_fallback: bool = True, retry_failed: bool = False
) -> Dict[str, int]:
    """
    Scrape bill data for policy documents that haven't been scraped yet.
    
    Args:
        limit: Maximum number of documents to process
        use_ai_fallback: Whether to use AI fallback
        retry_failed: If True, include docs with scraping_metadata->>'status' = 'failed'
    
    Returns:
        Dict with counts: processed, succeeded, failed, and error breakdown
    """
    from scripts.enrichment.utils import get_domain
    from collections import defaultdict
    
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Find policy documents with URLs but no bill text.
        # By default exclude previously failed scrapes; use retry_failed to include them.
        exclude_failed = "" if retry_failed else " AND (scraping_metadata IS NULL OR scraping_metadata->>'status' != 'failed')"
        cursor.execute(
            f"""
            SELECT id, document_url
            FROM policy_documents
            WHERE document_url IS NOT NULL
              AND document_url != ''
              AND (bill_text IS NULL OR bill_text = '')
              {exclude_failed}
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        
        docs = cursor.fetchall()
        logger.info(f"Found {len(docs)} policy documents to scrape")
        
        processed = 0
        succeeded = 0
        failed = 0
        
        # Track failures by domain and error type
        failures_by_domain = defaultdict(int)
        failures_by_error_type = defaultdict(int)
        
        for doc in docs:
            processed += 1
            domain = get_domain(doc['document_url'])
            
            success, error = scrape_and_store_bill_data(
                doc['id'], doc['document_url'], use_ai_fallback=use_ai_fallback
            )
            
            if success:
                succeeded += 1
            else:
                failed += 1
                failures_by_domain[domain] += 1
                
                # Categorize error type
                if error:
                    if '403' in error or 'forbidden' in error.lower():
                        failures_by_error_type['403_forbidden'] += 1
                    elif '404' in error or 'not_found' in error.lower():
                        failures_by_error_type['404_not_found'] += 1
                    elif '523' in error or 'cloudflare' in error.lower():
                        failures_by_error_type['523_cloudflare'] += 1
                    else:
                        failures_by_error_type['other'] += 1
                
                logger.warning(f"Failed to scrape policy_doc {doc['id']} ({domain}): {error}")
        
        # Log failure summary
        if failures_by_domain:
            logger.info("="*60)
            logger.info("Failure Summary by Domain:")
            for domain, count in sorted(failures_by_domain.items(), key=lambda x: x[1], reverse=True):
                logger.info(f"  {domain}: {count} failures")
            logger.info("="*60)
        
        if failures_by_error_type:
            logger.info("="*60)
            logger.info("Failure Summary by Error Type:")
            for error_type, count in sorted(failures_by_error_type.items(), key=lambda x: x[1], reverse=True):
                logger.info(f"  {error_type}: {count} failures")
            logger.info("="*60)
        
        return {
            'processed': processed,
            'succeeded': succeeded,
            'failed': failed,
            'failures_by_domain': dict(failures_by_domain),
            'failures_by_error_type': dict(failures_by_error_type)
        }
        
    except Exception as e:
        logger.error(f"Error in scrape_pending_policy_documents: {e}", exc_info=True)
        return {'processed': 0, 'succeeded': 0, 'failed': 0}
    finally:
        close_db_connection(conn, cursor)
