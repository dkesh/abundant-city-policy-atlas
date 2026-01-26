"""
Logging configuration utilities.
Provides helper functions to configure logging with database handler.
"""

import logging
import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.utils.database_log_handler import DatabaseLogHandler


def setup_database_logging(level=logging.INFO):
    """
    Configure logging to include database handler for structured activity logs.
    
    This function:
    1. Sets up basic logging configuration if not already configured
    2. Adds DatabaseLogHandler to the root logger
    3. Preserves existing console/file handlers
    
    Args:
        level: Logging level (default: INFO)
    """
    root_logger = logging.getLogger()
    
    # Check if database handler already exists
    for handler in root_logger.handlers:
        if isinstance(handler, DatabaseLogHandler):
            # Already configured
            return
    
    # Configure basic logging if not already done
    if not root_logger.handlers:
        logging.basicConfig(
            level=level,
            format='%(asctime)s - %(levelname)s - %(message)s',
            stream=sys.stdout
        )
    
    # Add database handler
    db_handler = DatabaseLogHandler(level=level)
    root_logger.addHandler(db_handler)
    
    # Don't propagate to avoid duplicate logs
    db_handler.setLevel(level)
