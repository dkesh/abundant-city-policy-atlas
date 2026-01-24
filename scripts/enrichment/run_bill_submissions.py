#!/usr/bin/env python3
"""
Process all pending bill submissions.
Can be run manually or via cron/GitHub Actions.

Usage:
    python run_bill_submissions.py [--limit N]
"""

import sys
import os
import argparse
import logging
from typing import List, Tuple

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import initialize_environment, get_db_connection, close_db_connection
from scripts.enrichment.bill_submission_processor import process_bill_submission
from psycopg2.extras import RealDictCursor

# Load environment variables
initialize_environment()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_pending_submissions(limit: int = 100) -> List[int]:
    """Get IDs of pending submissions."""
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT id, submitted_url, submitted_at
            FROM bill_submissions
            WHERE status = 'pending'
            ORDER BY submitted_at ASC
            LIMIT %s
        """, (limit,))
        
        submissions = cursor.fetchall()
        return [s['id'] for s in submissions]
        
    except Exception as e:
        logger.error(f"Error getting pending submissions: {e}", exc_info=True)
        return []
    finally:
        close_db_connection(conn, cursor)


def main():
    """Process all pending submissions."""
    parser = argparse.ArgumentParser(
        description='Process pending bill submissions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process up to 100 pending submissions
  python run_bill_submissions.py

  # Process up to 10 submissions
  python run_bill_submissions.py --limit 10
  
  # Process all pending submissions
  python run_bill_submissions.py --limit 999999
        """
    )
    
    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Maximum number of submissions to process (default: 100)'
    )
    
    args = parser.parse_args()
    
    logger.info(f"Getting pending submissions (limit: {args.limit})...")
    submission_ids = get_pending_submissions(args.limit)
    
    if not submission_ids:
        logger.info("No pending submissions found")
        return 0
    
    logger.info(f"Found {len(submission_ids)} pending submissions")
    
    success_count = 0
    error_count = 0
    
    for i, submission_id in enumerate(submission_ids, 1):
        logger.info(f"[{i}/{len(submission_ids)}] Processing submission {submission_id}")
        
        try:
            success = process_bill_submission(submission_id)
            if success:
                success_count += 1
                logger.info(f"✓ Successfully processed submission {submission_id}")
            else:
                error_count += 1
                logger.error(f"✗ Failed to process submission {submission_id}")
        except Exception as e:
            error_count += 1
            logger.error(f"✗ Error processing submission {submission_id}: {e}", exc_info=True)
    
    logger.info("="*60)
    logger.info("Bill Submission Processing Complete")
    logger.info(f"  Total: {len(submission_ids)}")
    logger.info(f"  Succeeded: {success_count}")
    logger.info(f"  Failed: {error_count}")
    logger.info("="*60)
    
    # Return non-zero exit code if there were errors
    return 1 if error_count > 0 else 0


if __name__ == '__main__':
    sys.exit(main())
