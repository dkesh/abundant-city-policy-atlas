#!/usr/bin/env python3
"""
Bill Scraping CLI Entry Point
Scrapes bill data from policy document URLs and stores structured data.
"""

import os
import sys
import argparse
import logging

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import initialize_environment
from scripts.enrichment.bill_scraping_service import scrape_pending_policy_documents, scrape_and_store_bill_data

# Load environment variables from .env file
initialize_environment()

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
    
    args = parser.parse_args()
    
    use_ai_fallback = not args.no_ai_fallback
    limit = 999999 if args.all else args.limit
    
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
            
            if success:
                logger.info(f"✓ Successfully scraped policy document {args.policy_doc_id}")
                sys.exit(0)
            else:
                logger.error(f"✗ Failed to scrape policy document {args.policy_doc_id}: {error}")
                sys.exit(1)
        else:
            # Scrape pending policy documents
            logger.info(f"Scraping pending policy documents (limit: {limit}, AI fallback: {use_ai_fallback})...")
            results = scrape_pending_policy_documents(limit=limit, use_ai_fallback=use_ai_fallback)
            
            logger.info("="*60)
            logger.info("Bill Scraping Complete")
            logger.info(f"  Processed: {results['processed']}")
            logger.info(f"  Succeeded: {results['succeeded']}")
            logger.info(f"  Failed: {results['failed']}")
            logger.info("="*60)
            
            if results['failed'] > 0:
                sys.exit(1)
            else:
                sys.exit(0)
                
    except Exception as e:
        logger.error(f"Bill scraping failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
