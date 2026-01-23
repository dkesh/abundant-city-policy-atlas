#!/usr/bin/env python3

"""
Shared helper functions for ingestion scripts.

This module provides utility functions used by multiple ingestion scripts
(prn_municipalities.py, obi.py, etc.)
"""

from typing import Optional


def normalize_place_name(name: str) -> str:
    """
    Normalize place names for consistent database storage and lookups.
    
    Applies title-casing to place names, where each word is capitalized.
    Examples:
        'tukwila' -> 'Tukwila'
        'san francisco' -> 'San Francisco'
        'los angeles' -> 'Los Angeles'
        'new york city' -> 'New York City'
    
    Args:
        name: Raw place name string to normalize
        
    Returns:
        Title-cased place name
    """
    return ' '.join(word.capitalize() for word in name.split())
