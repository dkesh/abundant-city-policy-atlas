"""
Database Log Handler for Python logging.
Writes structured activity logs to the activity_logs table.
"""

import json
import logging
import os
import sys
from typing import Optional, Dict, Any

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import get_db_connection, close_db_connection


class DatabaseLogHandler(logging.Handler):
    """
    Custom logging handler that writes structured activity logs to the database.
    
    Only logs records that have structured metadata in the 'extra' parameter:
    - log_type: Type of activity (e.g., 'ingestion', 'bill_scraping', 'ai_enrichment')
    - action: Specific action (e.g., 'prn_municipalities', 'merge_reforms')
    - status: Status of the activity (e.g., 'success', 'failed', 'running')
    
    Optional fields in 'extra':
    - metadata: JSON-serializable dict with additional context
    - error_message: Error message (if not provided, uses log message for ERROR level)
    - duration_seconds: Duration of the activity in seconds
    """
    
    def __init__(self, level=logging.NOTSET):
        super().__init__(level)
        self._connection_pool = None
    
    def emit(self, record: logging.LogRecord):
        """
        Emit a log record to the database if it contains structured metadata.
        """
        try:
            # Check if this log record has structured metadata
            if not hasattr(record, 'log_type') or not hasattr(record, 'action') or not hasattr(record, 'status'):
                # Not a structured log, skip it
                return
            
            log_type = getattr(record, 'log_type')
            action = getattr(record, 'action')
            status = getattr(record, 'status')
            
            # Extract optional fields
            metadata = getattr(record, 'metadata', None)
            error_message = getattr(record, 'error_message', None)
            duration_seconds = getattr(record, 'duration_seconds', None)
            
            # If error_message not provided but this is an error, use the log message
            if error_message is None and record.levelno >= logging.ERROR:
                error_message = record.getMessage()
            
            # Prepare metadata as JSONB
            metadata_json = None
            if metadata is not None:
                try:
                    metadata_json = json.dumps(metadata)
                except (TypeError, ValueError) as e:
                    # If metadata can't be serialized, log a warning and skip
                    self.handleError(record)
                    return
            
            # Write to database
            self._write_to_database(
                log_type=log_type,
                action=action,
                status=status,
                metadata_json=metadata_json,
                error_message=error_message,
                duration_seconds=duration_seconds
            )
            
        except Exception:
            # Don't let logging errors break the application
            self.handleError(record)
    
    def _write_to_database(
        self,
        log_type: str,
        action: str,
        status: str,
        metadata_json: Optional[str],
        error_message: Optional[str],
        duration_seconds: Optional[int]
    ):
        """
        Write log entry to activity_logs table.
        """
        conn = None
        cursor = None
        
        try:
            conn, cursor = get_db_connection()
            
            # Check if table exists first
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'activity_logs'
                )
            """)
            table_exists = cursor.fetchone()[0]
            
            if not table_exists:
                # Table doesn't exist - migration hasn't been run
                import sys
                print(f"DatabaseLogHandler: activity_logs table does not exist. Migration may not have been run.", file=sys.stderr)
                return
            
            # Debug: log what we're trying to insert
            import sys
            print(f"DatabaseLogHandler: Writing log - type={log_type}, action={action}, status={status}", file=sys.stderr)
            
            cursor.execute("""
                INSERT INTO activity_logs (
                    log_type, action, status, metadata, error_message, duration_seconds
                ) VALUES (%s, %s, %s, %s::jsonb, %s, %s)
            """, (
                log_type,
                action,
                status,
                metadata_json,
                error_message,
                duration_seconds
            ))
            
            conn.commit()
            print(f"DatabaseLogHandler: Successfully wrote log entry", file=sys.stderr)
            
        except Exception as e:
            # Log error to console but don't raise
            # This prevents logging failures from breaking the application
            try:
                import sys
                import traceback
                print(f"DatabaseLogHandler: Failed to write log to database: {e}", file=sys.stderr)
                print(f"DatabaseLogHandler: Traceback: {traceback.format_exc()}", file=sys.stderr)
            except Exception:
                pass
            
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
        
        finally:
            close_db_connection(conn, cursor)
    
    def close(self):
        """Clean up handler resources."""
        super().close()
