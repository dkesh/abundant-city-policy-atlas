#!/usr/bin/env python3
"""
Process a single bill submission synchronously.
Called by the submit-bill Netlify function.

Usage:
    python process_single_submission.py <submission_id>
"""

import sys
import os
import logging

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import initialize_environment
from scripts.enrichment.bill_submission_processor import process_bill_submission

# Load environment variables
initialize_environment()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Process a single submission by ID."""
    if len(sys.argv) < 2:
        logger.error("Usage: python process_single_submission.py <submission_id>")
        sys.exit(1)
    
    try:
        submission_id = int(sys.argv[1])
    except ValueError:
        logger.error(f"Invalid submission_id: {sys.argv[1]}")
        sys.exit(1)
    
    logger.info(f"Processing submission {submission_id}")
    
    try:
        success = process_bill_submission(submission_id)
        if success:
            logger.info(f"Successfully processed submission {submission_id}")
            sys.exit(0)
        else:
            logger.error(f"Failed to process submission {submission_id}")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Error processing submission {submission_id}: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
