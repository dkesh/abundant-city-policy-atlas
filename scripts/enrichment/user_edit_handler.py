"""
User Edit Handler
Handles saving user edits to reform columns while preserving AI sparkle version in ai_enriched_fields.
"""

import os
import sys
import json
import logging
from typing import Dict, Optional, Any
import psycopg2
from psycopg2.extras import RealDictCursor

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import get_db_connection, close_db_connection

logger = logging.getLogger(__name__)


def save_user_edits(reform_id: int, user_edits: Dict[str, Any]) -> bool:
    """
    Save user edits to reform table columns (original) while preserving AI version in ai_enriched_fields (sparkle).
    
    The existing pattern:
    - Reform table columns (summary, scope, land_use, requirements) = "original" (user edits go here)
    - ai_enriched_fields JSONB = "sparkle" (AI-generated version stays here)
    
    Args:
        reform_id: Reform ID to update
        user_edits: Dict with keys: summary, scope, land_use, requirements, notes (optional)
    
    Returns:
        bool: True if successful
    """
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Validate reform exists
        cursor.execute("SELECT id, ai_enriched_fields FROM reforms WHERE id = %s", (reform_id,))
        reform = cursor.fetchone()
        
        if not reform:
            logger.error(f"Reform {reform_id} not found")
            return False
        
        # Build update query - only update fields that are provided in user_edits
        update_fields = []
        update_values = []
        
        # Map user_edit keys to database columns
        field_mappings = {
            'summary': 'summary',
            'scope': 'scope',
            'land_use': 'land_use',
            'requirements': 'requirements',
            'notes': 'notes'
        }
        
        for user_key, db_column in field_mappings.items():
            if user_key in user_edits:
                update_fields.append(f"{db_column} = %s")
                # Handle arrays properly
                value = user_edits[user_key]
                if isinstance(value, list):
                    update_values.append(value if value else None)
                else:
                    update_values.append(value if value else None)
        
        if not update_fields:
            logger.warning(f"No valid fields to update for reform {reform_id}")
            return False
        
        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Execute update
        update_values.append(reform_id)
        update_sql = f"""
            UPDATE reforms
            SET {', '.join(update_fields)}
            WHERE id = %s
        """
        
        cursor.execute(update_sql, update_values)
        conn.commit()
        
        logger.info(f"Saved user edits for reform {reform_id}: {list(user_edits.keys())}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error saving user edits for reform {reform_id}: {e}", exc_info=True)
        if conn:
            conn.rollback()
        return False
    finally:
        close_db_connection(conn, cursor)


def get_ai_sparkle_version(reform_id: int) -> Optional[Dict[str, Any]]:
    """
    Get the AI sparkle version from ai_enriched_fields.
    
    Args:
        reform_id: Reform ID
    
    Returns:
        Dict with AI-generated fields, or None if not found
    """
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT ai_enriched_fields FROM reforms WHERE id = %s", (reform_id,))
        result = cursor.fetchone()
        
        if not result or not result.get('ai_enriched_fields'):
            return None
        
        ai_data = result['ai_enriched_fields']
        if isinstance(ai_data, str):
            ai_data = json.loads(ai_data)
        
        # Extract fields from the enrichment structure
        if isinstance(ai_data, dict) and 'fields' in ai_data:
            return ai_data['fields']
        
        return ai_data
        
    except Exception as e:
        logger.error(f"Error getting AI sparkle version for reform {reform_id}: {e}", exc_info=True)
        return None
    finally:
        close_db_connection(conn, cursor)


def compare_user_edits_vs_ai(reform_id: int, user_edits: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare user edits with AI sparkle version to show differences.
    
    Args:
        reform_id: Reform ID
        user_edits: User-edited fields
    
    Returns:
        Dict with comparison results showing which fields differ
    """
    ai_sparkle = get_ai_sparkle_version(reform_id)
    
    if not ai_sparkle:
        return {
            "has_ai_version": False,
            "differences": {},
            "fields_match": True
        }
    
    differences = {}
    fields_match = True
    
    # Compare each field
    for field in ['summary', 'scope', 'land_use', 'requirements']:
        user_value = user_edits.get(field)
        ai_value = None
        
        # Extract AI value from sparkle structure
        if isinstance(ai_sparkle, dict):
            ai_field_data = ai_sparkle.get(field)
            if isinstance(ai_field_data, dict) and 'value' in ai_field_data:
                ai_value = ai_field_data['value']
            else:
                ai_value = ai_field_data
        
        # Compare values
        if user_value != ai_value:
            fields_match = False
            differences[field] = {
                "user": user_value,
                "ai": ai_value
            }
    
    return {
        "has_ai_version": True,
        "differences": differences,
        "fields_match": fields_match
    }
