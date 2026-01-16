#!/usr/bin/env python3
"""
Shared utilities for enrichment scripts.
Provides date parsing, URL utilities, and other common functions.
"""

import re
import logging
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse
from dateutil import parser as date_parser

logger = logging.getLogger(__name__)

# Browser user agent for web scraping (mimics real browser)
BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'


def parse_flexible_date(date_str: Optional[str]) -> Optional[datetime]:
    """
    Parse a date string in various formats and return a datetime object.
    
    This is a unified date parser that handles multiple formats:
    - ISO format (YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS)
    - US format (MM/DD/YYYY, MM-DD-YYYY)
    - Various other formats via dateutil parser
    
    Args:
        date_str: Date string in various formats, or None
    
    Returns:
        datetime object if parsing succeeds, None otherwise
    """
    if not date_str:
        return None
    
    # Clean the string
    date_str = str(date_str).strip()
    if not date_str or date_str.lower() in ['none', 'null', 'n/a', '']:
        return None
    
    # Remove time component if present (T separator) for initial parsing
    date_str_clean = date_str.split('T')[0] if 'T' in date_str else date_str
    
    # Try dateutil parser first (handles most formats including fuzzy parsing)
    try:
        if date_parser:
            return date_parser.parse(date_str, fuzzy=True)
    except (ValueError, TypeError):
        pass
    
    # Try common patterns as fallback
    patterns = [
        r'(\d{1,2})/(\d{1,2})/(\d{4})',  # MM/DD/YYYY
        r'(\d{4})-(\d{1,2})-(\d{1,2})',  # YYYY-MM-DD
        r'(\d{1,2})-(\d{1,2})-(\d{4})',  # MM-DD-YYYY
    ]
    
    for pattern in patterns:
        match = re.search(pattern, date_str_clean)
        if match:
            try:
                if len(match.groups()) == 3:
                    parts = match.groups()
                    if len(parts[0]) == 4:  # YYYY-MM-DD
                        return datetime.strptime(f"{parts[0]}-{parts[1]}-{parts[2]}", "%Y-%m-%d")
                    else:  # MM/DD/YYYY or MM-DD-YYYY
                        return datetime.strptime(f"{parts[0]}/{parts[1]}/{parts[2]}", "%m/%d/%Y")
            except ValueError:
                continue
    
    logger.debug(f"Could not parse date: {date_str}")
    return None


def datetime_to_date_string(dt: Optional[datetime]) -> Optional[str]:
    """
    Convert datetime object to YYYY-MM-DD string format.
    
    Args:
        dt: datetime object or None
    
    Returns:
        Date string in YYYY-MM-DD format, or None
    """
    if not dt:
        return None
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d')
    return None


def datetime_to_iso_string(dt: Optional[datetime]) -> Optional[str]:
    """
    Convert datetime object to ISO format string.
    
    Args:
        dt: datetime object or None
    
    Returns:
        ISO format string, or None
    """
    if not dt:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return None


def get_domain(url: Optional[str]) -> Optional[str]:
    """
    Extract domain from URL.
    
    Args:
        url: URL string or None
    
    Returns:
        Lowercase domain name, or None if URL is invalid
    """
    if not url:
        return None
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Remove port if present
        if ':' in domain:
            domain = domain.split(':')[0]
        return domain
    except Exception as e:
        logger.debug(f"Error parsing URL '{url}': {e}")
        return None


def parse_date_for_db(date_val: Optional[any]) -> Optional[datetime]:
    """
    Parse a date value that might be a datetime, date, or string.
    Useful for converting dates from various sources to datetime objects.
    
    Args:
        date_val: datetime, date, string, or None
    
    Returns:
        datetime object, or None
    """
    if not date_val:
        return None
    
    # Already a datetime
    if isinstance(date_val, datetime):
        return date_val
    
    # date object - convert to datetime
    if hasattr(date_val, 'date'):  # date object
        return datetime.combine(date_val, datetime.min.time())
    
    # String - try parsing
    if isinstance(date_val, str):
        # Try ISO format first
        try:
            return datetime.fromisoformat(date_val.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pass
        
        # Try flexible parser
        return parse_flexible_date(date_val)
    
    return None
