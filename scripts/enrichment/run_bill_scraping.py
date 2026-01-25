#!/usr/bin/env python3
"""
Bill Scraping CLI Entry Point
Scrapes bill data from policy document URLs and stores structured data.
"""

import os
import sys
import argparse
import logging
from datetime import datetime

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import initialize_environment
from scripts.enrichment.bill_scraping_service import scrape_pending_policy_documents, scrape_and_store_bill_data
from scripts.utils.logging_config import setup_database_logging

# Load environment variables from .env file
initialize_environment()

# Setup database logging for activity logs
setup_database_logging()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """CLI entry point for bill scraping."""
    parser = argparse.ArgumentParser(
        description='Bill Scraping Service for Urbanist Reform Map',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape up to 100 pending policy documents
  python run_bill_scraping.py --limit 100
  
  # Scrape all pending policy documents
  python run_bill_scraping.py --all
  
  # Scrape a specific policy document by ID
  python run_bill_scraping.py --policy-doc-id 123
  
  # Disable AI fallback (use only configured scrapers)
  python run_bill_scraping.py --no-ai-fallback

  # Retry previously failed scrapes
  python run_bill_scraping.py --retry-failed --all
        """
    )
    
    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Maximum number of policy documents to process (default: 100)'
    )
    
    parser.add_argument(
        '--policy-doc-id',
        type=int,
        help='Scrape a specific policy document by ID'
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Process all pending policy documents (ignores limit)'
    )
    
    parser.add_argument(
        '--no-ai-fallback',
        action='store_true',
        help='Disable AI fallback for sites without scraper configs'
    )
    
    parser.add_argument(
        '--retry-failed',
        action='store_true',
        help='Include previously failed scrapes in the pending set (retry them)'
    )
    
    args = parser.parse_args()
    
    use_ai_fallback = not args.no_ai_fallback
    limit = 999999 if args.all else args.limit
    
    start_time = datetime.now()
    
    # Log start of scraping run
    action_name = f"scrape_policy_doc_{args.policy_doc_id}" if args.policy_doc_id else "scrape_all"
    logger.info(
        f"Starting bill scraping (limit: {limit}, AI fallback: {use_ai_fallback})",
        extra={
            "log_type": "bill_scraping",
            "action": action_name,
            "status": "running"
        }
    )
    
    try:
        if args.policy_doc_id:
            # Scrape specific policy document
            # First, get the document URL from database
            from scripts.ingestion.db_utils import get_db_connection, close_db_connection
            from psycopg2.extras import RealDictCursor
            
            conn, cursor = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("SELECT id, document_url FROM policy_documents WHERE id = %s", (args.policy_doc_id,))
            doc = cursor.fetchone()
            
            if not doc:
                logger.error(f"Policy document {args.policy_doc_id} not found")
                sys.exit(1)
            
            if not doc['document_url']:
                logger.error(f"Policy document {args.policy_doc_id} has no document_url")
                sys.exit(1)
            
            close_db_connection(conn, cursor)
            
            logger.info(f"Scraping policy document {args.policy_doc_id} from {doc['document_url']}")
            success, error = scrape_and_store_bill_data(
                args.policy_doc_id,
                doc['document_url'],
                use_ai_fallback=use_ai_fallback
            )
            
            duration = int((datetime.now() - start_time).total_seconds())
            
            if success:
                logger.info(
                    f"Successfully scraped policy document {args.policy_doc_id}",
                    extra={
                        "log_type": "bill_scraping",
                        "action": action_name,
                        "status": "success",
                        "metadata": {
                            "policy_doc_id": args.policy_doc_id,
                            "url": doc['document_url']
                        },
                        "duration_seconds": duration
                    }
                )
                logger.info(f"✓ Successfully scraped policy document {args.policy_doc_id}")
                sys.exit(0)
            else:
                logger.error(
                    f"Failed to scrape policy document {args.policy_doc_id}",
                    extra={
                        "log_type": "bill_scraping",
                        "action": action_name,
                        "status": "failed",
                        "error_message": error,
                        "metadata": {
                            "policy_doc_id": args.policy_doc_id,
                            "url": doc['document_url']
                        },
                        "duration_seconds": duration
                    }
                )
                logger.error(f"✗ Failed to scrape policy document {args.policy_doc_id}: {error}")
                sys.exit(1)
        else:
            # Scrape pending policy documents
            logger.info(f"Scraping pending policy documents (limit: {limit}, AI fallback: {use_ai_fallback}, retry_failed: {args.retry_failed})...")
            results = scrape_pending_policy_documents(
                limit=limit, use_ai_fallback=use_ai_fallback, retry_failed=args.retry_failed
            )
            
            duration = int((datetime.now() - start_time).total_seconds())
            
            # Calculate failure rate
            if results['processed'] > 0:
                failure_rate = results['failed'] / results['processed']
            else:
                failure_rate = 0.0
            
            # Log to activity_logs table
            status = "success" if failure_rate <= 0.15 else "partial"
            logger.info(
                "Bill scraping complete",
                extra={
                    "log_type": "bill_scraping",
                    "action": action_name,
                    "status": status,
                    "metadata": {
                        "processed": results['processed'],
                        "succeeded": results['succeeded'],
                        "failed": results['failed'],
                        "failure_rate": failure_rate,
                        "failures_by_domain": results.get('failures_by_domain', {}),
                        "failures_by_error_type": results.get('failures_by_error_type', {}),
                        "use_ai_fallback": use_ai_fallback
                    },
                    "duration_seconds": duration
                }
            )
            
            logger.info("="*60)
            logger.info("Bill Scraping Complete")
            logger.info(f"  Processed: {results['processed']}")
            logger.info(f"  Succeeded: {results['succeeded']}")
            logger.info(f"  Failed: {results['failed']}")
            
            if results['processed'] > 0:
                logger.info(f"  Failure Rate: {failure_rate:.1%}")
            else:
                logger.info(f"  Failure Rate: N/A (no documents processed)")
            
            logger.info("="*60)
            
            # Exit with error only if failure rate exceeds 15%
            if results['processed'] > 0 and failure_rate > 0.15:
                logger.warning(f"Failure rate ({failure_rate:.1%}) exceeds 15% threshold")
                sys.exit(1)
            else:
                sys.exit(0)
                
    except Exception as e:
        duration = int((datetime.now() - start_time).total_seconds())
        
        # Log to activity_logs table
        logger.error(
            "Bill scraping failed",
            extra={
                "log_type": "bill_scraping",
                "action": action_name,
                "status": "failed",
                "error_message": str(e),
                "duration_seconds": duration
            }
        )
        
        logger.error(f"Bill scraping failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
