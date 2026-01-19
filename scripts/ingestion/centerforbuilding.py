#!/usr/bin/env python3
"""
Center for Building Trackers Ingestion Script
Scrapes data from https://www.centerforbuilding.org/trackers

Usage:
    # Scrape and save to CSV
    python centerforbuilding.py --output database/testdata/centerforbuilding-trackers.csv
    
    # Scrape and ingest directly to database
    python centerforbuilding.py --ingest
    
    # Use custom database URL
    python centerforbuilding.py --ingest --database postgresql://user:pass@localhost/db
"""

import os
import sys
import logging
import argparse
import traceback
import re
import json
import csv
from datetime import datetime
from typing import Optional, Dict, List, Tuple, Any
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from helpers import normalize_place_name
from db_utils import (
    build_citation_rows,
    bulk_insert_citations,
    bulk_link_reform_sources,
    bulk_upsert_places,
    bulk_upsert_reforms,
    close_db_connection,
    geocode_missing_places,
    get_db_connection,
    initialize_environment,
    load_reform_type_map,
    log_ingestion,
    normalize_reform_status,
    parse_flexible_date,
    place_key,
    USER_AGENT
)

# Load environment variables
initialize_environment()

# ============================================================================
# CONFIGURATION
# ============================================================================

CBNA_TRACKERS_URL = "https://www.centerforbuilding.org/trackers"
CBNA_PAYLOAD_URL = "https://www.centerforbuilding.org/trackers/_payload.json"

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Batch size for bulk inserts
BATCH_SIZE = 100

# ============================================================================
# SCRAPING FUNCTIONS
# ============================================================================

def fetch_page(url: str) -> Optional[str]:
    """Fetch HTML content from URL."""
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        return None


def fetch_payload_json(url: str) -> Optional[Any]:
    """Fetch and parse JSON payload from URL."""
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch JSON from {url}: {e}")
        return None


def extract_data_from_html(html: str) -> List[Dict]:
    """
    Extract tracker/reform data from HTML.
    Tries multiple parsing strategies.
    """
    data = []
    soup = BeautifulSoup(html, 'html.parser')
    
    # Strategy 1: Look for JSON data in script tags
    script_tags = soup.find_all('script', type='application/json')
    for script in script_tags:
        try:
            json_data = json.loads(script.string)
            extracted = extract_from_json_structure(json_data)
            if extracted:
                data.extend(extracted)
        except (json.JSONDecodeError, AttributeError):
            continue
    
    # Strategy 2: Look for data attributes or embedded JSON
    json_pattern = re.compile(r'<script[^>]*>(.*?)</script>', re.DOTALL)
    scripts = json_pattern.findall(html)
    for script_content in scripts:
        # Look for JSON objects in script content
        json_matches = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', script_content)
        for match in json_matches:
            try:
                json_data = json.loads(match)
                extracted = extract_from_json_structure(json_data)
                if extracted:
                    data.extend(extracted)
            except json.JSONDecodeError:
                continue
    
    # Strategy 3: Look for structured data in HTML (if available)
    # This would depend on the actual HTML structure
    tracker_elements = soup.find_all(['div', 'article', 'section'], 
                                     class_=lambda x: x and ('tracker' in str(x).lower() or 
                                                             'reform' in str(x).lower()))
    for element in tracker_elements:
        # Extract data from HTML elements if structured
        # This is a placeholder - actual implementation depends on HTML structure
        pass
    
    return data


def resolve_nuxt_ref(payload: List, idx: Any, max_depth: int = 3, depth: int = 0) -> Any:
    """
    Resolve a Nuxt.js payload reference (integer index) to actual value.
    Handles nested references recursively.
    """
    if depth > max_depth:
        return idx
    if isinstance(idx, int) and 0 <= idx < len(payload):
        val = payload[idx]
        # If it's still an int, might be another reference
        if isinstance(val, int) and depth < max_depth:
            return resolve_nuxt_ref(payload, val, max_depth, depth + 1)
        return val
    return idx


def extract_from_json_structure(obj: Any, path: str = "", payload: Optional[List] = None) -> List[Dict]:
    """
    Extract tracker/reform data from Nuxt.js payload structure.
    The payload is a list where integers reference other items in the list.
    """
    results = []
    
    # If this is a Nuxt payload (list), process it specially
    if isinstance(obj, list) and len(obj) > 100:  # Likely a Nuxt payload
        payload = obj
        logger.info(f"Processing Nuxt payload with {len(payload)} items...")
        
        # Look for posts (items with 'type' field)
        for i, item in enumerate(payload[:5000]):  # Check first 5000 items
            if not isinstance(item, dict):
                continue
            
            # Check if it's a post/tracker entry
            type_ref = item.get('type')
            if not isinstance(type_ref, int):
                continue
            
            type_val = resolve_nuxt_ref(payload, type_ref)
            # CBNA uses 'trackersmap' as the post type for tracker entries
            if not isinstance(type_val, str) or type_val not in ['post', 'tracker', 'page', 'trackersmap']:
                continue
            
            # Get ACF data (Advanced Custom Fields - where WordPress stores custom data)
            acf_ref = item.get('acf')
            if not isinstance(acf_ref, int):
                continue
            
            acf_val = resolve_nuxt_ref(payload, acf_ref)
            if not isinstance(acf_val, dict) or len(acf_val) == 0:
                continue
            
            # Get title
            title_ref = item.get('title')
            title = None
            if isinstance(title_ref, int):
                title_obj = resolve_nuxt_ref(payload, title_ref)
                if isinstance(title_obj, dict) and 'rendered' in title_obj:
                    title = title_obj['rendered']
            
            # Get link
            link_ref = item.get('link')
            link = None
            if isinstance(link_ref, int):
                link = resolve_nuxt_ref(payload, link_ref)
            elif isinstance(link_ref, str):
                link = link_ref
            
            # Extract data from ACF fields
            record = {
                'title': title,
                'link_url': link,
                'acf': acf_val
            }
            
            # Look for tracker-specific fields in ACF
            # CBNA uses these ACF field names based on inspection
            # Resolve all ACF values that are references
            resolved_acf = {}
            for key, val in acf_val.items():
                if isinstance(val, int):
                    resolved_val = resolve_nuxt_ref(payload, val)
                    resolved_acf[key] = resolved_val
                else:
                    resolved_acf[key] = val
            
            # Map CBNA ACF fields to our standard fields
            # 'place' contains the location name
            # 'parent_state' contains state reference
            # 'parent_country' contains country reference
            # 'description' contains the summary text
            # 'category' might contain reform type
            
            if 'place' in resolved_acf:
                place_val = resolved_acf['place']
                if isinstance(place_val, dict) and 'rendered' in place_val:
                    place_name = place_val['rendered']
                elif isinstance(place_val, str):
                    place_name = place_val
                else:
                    place_name = None
                
                if place_name:
                    # Check if place name is a state/province name
                    from db_utils import get_state_code
                    state_code = get_state_code(place_name)
                    if state_code:
                        # Place is a state/province, not a city
                        record['state_code'] = state_code
                        # Don't set city for states/provinces
                    else:
                        # Place is a city/municipality
                        record['city'] = place_name
            
            if 'parent_state' in resolved_acf:
                state_val = resolved_acf['parent_state']
                # parent_state can be a list containing a reference to a state entry
                if isinstance(state_val, list) and len(state_val) > 0:
                    # Get the first item (should be a reference to a state entry)
                    state_ref = state_val[0]
                    if isinstance(state_ref, int):
                        state_entry = resolve_nuxt_ref(payload, state_ref)
                        if isinstance(state_entry, dict):
                            # This is a state entry - get its place/name
                            state_acf_ref = state_entry.get('acf')
                            if isinstance(state_acf_ref, int):
                                state_acf = resolve_nuxt_ref(payload, state_acf_ref)
                                if isinstance(state_acf, dict):
                                    state_place_ref = state_acf.get('place')
                                    if isinstance(state_place_ref, int):
                                        state_place_obj = resolve_nuxt_ref(payload, state_place_ref)
                                        if isinstance(state_place_obj, dict) and 'rendered' in state_place_obj:
                                            record['state'] = state_place_obj['rendered']
                                        elif isinstance(state_place_obj, str):
                                            record['state'] = state_place_obj
                                    elif isinstance(state_place_ref, str):
                                        record['state'] = state_place_ref
                                    # Also try to get state code directly
                                    from db_utils import get_state_code
                                    if record.get('state'):
                                        state_code = get_state_code(record['state'])
                                        if state_code:
                                            record['state_code'] = state_code
                elif isinstance(state_val, dict):
                    if 'rendered' in state_val:
                        record['state'] = state_val['rendered']
                    elif 'name_state' in state_val:
                        # Might be from state_country_belong structure
                        record['state'] = state_val['name_state']
                    # Try to get state code
                    from db_utils import get_state_code
                    if record.get('state'):
                        state_code = get_state_code(record['state'])
                        if state_code:
                            record['state_code'] = state_code
                elif isinstance(state_val, str) and state_val.strip():
                    # Only use if it's not empty and not a URL
                    if not state_val.startswith('http'):
                        record['state'] = state_val
                        from db_utils import get_state_code
                        state_code = get_state_code(state_val)
                        if state_code:
                            record['state_code'] = state_code
            
            if 'description' in resolved_acf:
                desc_val = resolved_acf['description']
                if isinstance(desc_val, dict) and 'rendered' in desc_val:
                    record['summary'] = desc_val['rendered']
                elif isinstance(desc_val, str):
                    record['summary'] = desc_val
            
            if 'description_2' in resolved_acf:
                desc2_val = resolved_acf['description_2']
                if isinstance(desc2_val, dict) and 'rendered' in desc2_val:
                    if not record.get('summary'):
                        record['summary'] = desc2_val['rendered']
                    else:
                        record['summary'] += '\n\n' + desc2_val['rendered']
                elif isinstance(desc2_val, str):
                    if not record.get('summary'):
                        record['summary'] = desc2_val
                    else:
                        record['summary'] += '\n\n' + desc2_val
            
            if 'category' in resolved_acf:
                cat_val = resolved_acf['category']
                if isinstance(cat_val, dict) and 'rendered' in cat_val:
                    record['reform_type'] = cat_val['rendered']
                elif isinstance(cat_val, str):
                    record['reform_type'] = cat_val
            
            # Store full ACF for reference
            record['acf'] = resolved_acf
            
            # Also check state_country_belong for state information (as fallback)
            if not record.get('state') and 'state_country_belong' in resolved_acf:
                scb_ref = resolved_acf['state_country_belong']
                if isinstance(scb_ref, int):
                    scb = resolve_nuxt_ref(payload, scb_ref)
                    if isinstance(scb, dict):
                        name_state_ref = scb.get('name_state')
                        if isinstance(name_state_ref, int):
                            name_state = resolve_nuxt_ref(payload, name_state_ref)
                            if isinstance(name_state, dict) and 'rendered' in name_state:
                                record['state'] = name_state['rendered']
                            elif isinstance(name_state, str):
                                record['state'] = name_state
                        elif isinstance(name_state_ref, str):
                            record['state'] = name_state_ref
                        # Try to get state code
                        from db_utils import get_state_code
                        if record.get('state'):
                            state_code = get_state_code(record['state'])
                            if state_code:
                                record['state_code'] = state_code
            
            # If we found at least location or reform info, normalize it
            if record.get('state') or record.get('city') or record.get('reform_type'):
                normalized = normalize_cbna_record(record)
                if normalized:
                    results.append(normalized)
        
        return results
    
    # Fallback: original recursive extraction for non-Nuxt structures
    if isinstance(obj, dict):
        # Check if this looks like a reform/tracker record
        has_location = any(key in obj for key in ['state', 'state_code', 'city', 'municipality', 'place'])
        has_reform = any(key in obj for key in ['reform', 'reform_type', 'type', 'policy', 'bill'])
        has_status = any(key in obj for key in ['status', 'phase', 'adoption_date', 'date'])
        
        if has_location and (has_reform or has_status):
            normalized = normalize_cbna_record(obj)
            if normalized:
                results.append(normalized)
        
        # Recurse into nested structures
        for key, value in obj.items():
            if isinstance(value, (dict, list)):
                results.extend(extract_from_json_structure(value, f"{path}.{key}", payload))
    
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, (dict, list)):
                results.extend(extract_from_json_structure(item, f"{path}[{i}]", payload))
    
    return results


def normalize_cbna_record(raw: Dict) -> Optional[Dict]:
    """
    Normalize a raw CBNA record to standard format.
    Handles both direct field access and ACF (Advanced Custom Fields) structure.
    """
    # Extract state - try multiple field names and formats
    state_code = None
    state_val = (raw.get('state') or raw.get('state_code') or raw.get('state_abbrev') or 
                 raw.get('state_abbreviation') or '')
    if isinstance(state_val, str):
        state_code = state_val.strip().upper()
    elif isinstance(state_val, dict):
        # Might be a reference or nested object
        state_code = (state_val.get('rendered') or state_val.get('value') or '').strip().upper()
    elif isinstance(state_val, list) and len(state_val) > 0:
        # Handle list of states
        first_state = state_val[0]
        if isinstance(first_state, str):
            state_code = first_state.strip().upper()
        elif isinstance(first_state, dict):
            state_code = (first_state.get('rendered') or first_state.get('value') or '').strip().upper()
    
    # Validate state_code - must be 2 characters and not contain invalid content
    if state_code:
        # Filter out invalid state codes (HTML, URLs, dates, long text)
        if (len(state_code) > 2 or 
            state_code.startswith('HTTP') or 
            state_code.startswith('<') or 
            'T' in state_code and len(state_code) > 10 or  # Dates like "2025-07-21T22:24:52"
            state_code.startswith('HTTPS')):
            state_code = None
        # Also validate it's a valid state/province code (US states or Canadian provinces)
        from db_utils import STATE_CODE_TO_NAME
        if state_code and state_code not in STATE_CODE_TO_NAME:
            state_code = None
    
    # Extract city/municipality
    # IMPORTANT: Don't extract from 'place' if we already have a state_code from 'place'
    # (i.e., if 'place' was a state name, don't use it as a city)
    city = None
    city_val = (raw.get('city') or raw.get('municipality') or raw.get('municipality_name') or 
                raw.get('location') or raw.get('city_name') or '')
    # Only use 'place' if we don't already have state_code set from it
    # Check if 'place' was used to set state_code by seeing if place name is a state
    if not city_val and 'place' in raw:
        place_val = raw.get('place')
        if isinstance(place_val, str):
            place_name = place_val.strip()
        elif isinstance(place_val, dict):
            place_name = (place_val.get('rendered') or place_val.get('value') or '').strip()
        else:
            place_name = None
        
        # Only use place as city if it's NOT a state/province name
        if place_name:
            from db_utils import get_state_code
            # If place name is a state, don't use it as city (state_code should already be set)
            if not get_state_code(place_name):
                city_val = place_name
    
    if isinstance(city_val, str):
        city = city_val.strip()
    elif isinstance(city_val, dict):
        city = (city_val.get('rendered') or city_val.get('value') or '').strip()
    
    # Fix common typos in place names first
    if city:
        city = city.replace('Missorui', 'Missouri')
    
    # If we have a city but no state_code, try to infer from known city-state/province mappings
    # This is a fallback for when parent_state extraction doesn't work
    city_state_mappings = {
        # US Cities
        'Chattanooga': 'TN',
        'Memphis': 'TN',
        'Nashville': 'TN',
        'Knoxville': 'TN',
        'Jackson': 'MS',
        'Santa Monica': 'CA',
        'Los Angeles': 'CA',
        'San Francisco': 'CA',
        'Baltimore': 'MD',
        'Austin': 'TX',
        'New York City': 'NY',
        'New York': 'NY',  # Alternative name
        # Canadian Cities
        'Vancouver': 'BC',  # British Columbia
        'Toronto': 'ON',  # Ontario
        'Edmonton': 'AB',  # Alberta
    }
    
    if city and not state_code:
        # Check known mappings first
        city_normalized = city.strip()
        if city_normalized in city_state_mappings:
            mapped_state = city_state_mappings[city_normalized]
            if mapped_state:
                state_code = mapped_state
                logger.debug(f"Inferred state code {state_code} for city {city}")
    
    # If we still don't have state_code, try to extract state from place name
    # or check if place name IS a state name
    if city and not state_code:
        from db_utils import STATE_NAME_TO_CODE, get_state_code
        # Check if place name is a state name
        state_code = get_state_code(city)
        if state_code:
            # Place name is a state, so city should be None
            city = None
        else:
            # Try to extract state abbreviation from place name (e.g., "Washington, D.C." -> "DC")
            # Handle common cases
            place_upper = city.upper()
            if 'D.C.' in city or 'DC' in place_upper:
                state_code = 'DC'
                # Remove state from city name
                city = city.replace(', D.C.', '').replace(', DC', '').replace('D.C.', '').replace('DC', '').strip()
            elif ', ' in city:
                # Might be "City, State" format
                parts = city.split(', ')
                if len(parts) == 2:
                    potential_state = parts[1].strip()
                    state_code = get_state_code(potential_state)
                    if state_code:
                        city = parts[0].strip()
    
    # CRITICAL: If city name is actually a state/province name, clear city and ensure state_code is set
    if city:
        from db_utils import get_state_code
        city_state_code = get_state_code(city)
        if city_state_code:
            # City name is actually a state/province name - this is a state-level reform
            if not state_code:
                state_code = city_state_code
            city = None  # Clear city for state-level reforms
    
    # Extract reform type
    reform_type = None
    reform_val = (raw.get('reform_type') or raw.get('reform') or raw.get('type') or 
                  raw.get('policy_type') or raw.get('reform_category') or '')
    if isinstance(reform_val, str):
        reform_type = reform_val.strip()
    elif isinstance(reform_val, dict):
        reform_type = (reform_val.get('rendered') or reform_val.get('value') or '').strip()
    elif isinstance(reform_val, list) and len(reform_val) > 0:
        # Handle array of reform types
        reform_type = ', '.join(str(v) for v in reform_val if v)
    
    # If reform_type is a label (like "state-label", "settlement-minor-label"), ignore it
    # and try to extract from summary instead
    if reform_type and ('-label' in reform_type.lower() or reform_type.lower() in ['state', 'settlement', 'country']):
        reform_type = None
    
    # If we don't have a reform type, try to infer from summary/description
    if not reform_type:
        summary_text = (raw.get('summary') or raw.get('description') or '').lower()
        if summary_text:
            # Check for building code reform keywords
            if 'single-stair' in summary_text or 'single stair' in summary_text or 'stairwell' in summary_text:
                reform_type = 'single-stair building'
            elif 'elevator' in summary_text:
                reform_type = 'elevator'
            elif 'building code' in summary_text:
                reform_type = 'building code'
            # Could add more patterns here as needed
    
    # Extract status
    status = None
    status_val = (raw.get('status') or raw.get('phase') or raw.get('reform_status') or 
                  raw.get('bill_status') or '')
    if isinstance(status_val, str):
        status = status_val.strip()
    elif isinstance(status_val, dict):
        status = (status_val.get('rendered') or status_val.get('value') or '').strip()
    
    # Extract date
    date = (raw.get('adoption_date') or raw.get('date') or raw.get('enacted_date') or 
            raw.get('passed_date') or raw.get('effective_date') or raw.get('date_adopted'))
    if isinstance(date, dict):
        date = date.get('rendered') or date.get('value')
    
    # Extract summary/description
    summary = (raw.get('summary') or raw.get('description') or raw.get('title') or 
               raw.get('name') or raw.get('details') or raw.get('notes') or '')
    if isinstance(summary, dict):
        summary = summary.get('rendered') or summary.get('value') or ''
    if isinstance(summary, str):
        # Clean HTML if present
        summary = summary.strip()
        if summary.startswith('<'):
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(summary, 'html.parser')
            summary = soup.get_text().strip()
    
    # Extract URL
    url = (raw.get('url') or raw.get('link') or raw.get('link_url') or 
           raw.get('source_url') or raw.get('document_url'))
    if isinstance(url, dict):
        url = url.get('rendered') or url.get('value')
    
    # Require at least location or reform type to be valid
    if not state_code and not city and not reform_type:
        return None
    
    # If we have a state_code but city is also set and city is actually a state/province name, clear city
    if state_code and city:
        from db_utils import get_state_code
        city_state_code = get_state_code(city)
        if city_state_code == state_code:
            city = None
    
    return {
        'state_code': state_code if state_code else None,
        'municipality_name': normalize_place_name(city) if city else None,
        'reform_type': reform_type if reform_type else None,
        'status': status if status else None,
        'adoption_date': parse_flexible_date(str(date)) if date else None,
        'summary': summary if summary else None,
        'link_url': url if url else None,
        'raw_data': raw  # Keep raw data for reference
    }


def scrape_cbna_data() -> List[Dict]:
    """
    Main scraping function that tries multiple approaches.
    Returns list of normalized records.
    """
    logger.info(f"Fetching data from {CBNA_TRACKERS_URL}...")
    
    all_data = []
    
    # Approach 1: Try fetching payload JSON
    logger.info("Attempting to fetch payload JSON...")
    payload = fetch_payload_json(CBNA_PAYLOAD_URL)
    if payload:
        logger.info("Payload JSON fetched, extracting data...")
        extracted = extract_from_json_structure(payload, payload=payload if isinstance(payload, list) else None)
        if extracted:
            logger.info(f"Extracted {len(extracted)} records from payload")
            all_data.extend(extracted)
    
    # Approach 2: Fetch HTML and parse
    logger.info("Fetching HTML page...")
    html = fetch_page(CBNA_TRACKERS_URL)
    if html:
        logger.info("HTML fetched, extracting data...")
        extracted = extract_data_from_html(html)
        if extracted:
            logger.info(f"Extracted {len(extracted)} records from HTML")
            all_data.extend(extracted)
    
    # Deduplicate based on key fields
    seen = set()
    deduped = []
    for record in all_data:
        key = (
            record.get('state_code'),
            record.get('municipality_name'),
            record.get('reform_type'),
            record.get('adoption_date')
        )
        if key not in seen:
            seen.add(key)
            deduped.append(record)
    
    logger.info(f"Total unique records: {len(deduped)}")
    return deduped


# ============================================================================
# DATA NORMALIZATION
# ============================================================================

def normalize_reform_type(cbna_type: str) -> Optional[str]:
    """
    Map CBNA reform type strings to our universal codes.
    CBNA primarily tracks building code reforms, especially single-stair and elevator reforms.
    """
    if not cbna_type:
        return None
    
    cbna_type_lower = cbna_type.lower().strip()
    
    # Mapping based on CBNA's focus areas
    mapping = {
        # Building code reforms (CBNA's primary focus)
        'single-stair': 'building:stairwells',
        'single stair': 'building:stairwells',
        'single-stair building': 'building:stairwells',
        'stairwell': 'building:stairwells',
        'stairwells': 'building:stairwells',
        'elevator': 'building:elevators',
        'elevators': 'building:elevators',
        'building code': 'building:unspecified',
        'building codes': 'building:unspecified',
        # Other reform types (less common in CBNA data)
        'adu': 'housing:adu',
        'accessory dwelling unit': 'housing:adu',
        'plex': 'housing:plex',
        'duplex': 'housing:plex',
        'triplex': 'housing:plex',
        'missing middle': 'housing:plex',
        'parking': 'parking:unspecified',
        'parking minimum': 'parking:unspecified',
        'parking elimination': 'parking:eliminated',
        'tod': 'zoning:tod',
        'transit-oriented': 'zoning:tod',
        'lot size': 'physical:lot_size',
        'height': 'physical:height',
        'far': 'physical:far',
        'floor area ratio': 'physical:far',
    }
    
    # Try exact match first
    if cbna_type_lower in mapping:
        return mapping[cbna_type_lower]
    
    # Try partial matches (check if any key is contained in the type string)
    for key, code in mapping.items():
        if key in cbna_type_lower:
            return code
    
    # Default fallback - CBNA primarily tracks building code reforms
    return 'building:unspecified'


def parse_csv_row(row: Dict, place_id_map: Dict, reform_type_map: Dict) -> Optional[Dict]:
    """Parse a normalized CBNA record into a reform payload for upsert."""
    try:
        state_code = row.get('state_code')
        municipality_name = row.get('municipality_name')
        reform_type_str = row.get('reform_type', '')
        
        if not state_code and not municipality_name:
            return None
        
        # Determine place_id
        place_id = None
        if municipality_name and state_code:
            pid = place_id_map.get(place_key(municipality_name, state_code, 'city'))
            if pid:
                place_id = pid
        elif state_code:
            # State-level reform
            from db_utils import get_state_name
            state_name = get_state_name(state_code) or state_code
            pid = place_id_map.get(place_key(state_name, state_code, 'state'))
            if pid:
                place_id = pid
        
        if not place_id:
            logger.debug(f"  ⚠ Unknown place: {(state_code, municipality_name)}")
            return None
        
        reform_code = normalize_reform_type(reform_type_str)
        if not reform_code or reform_code not in reform_type_map:
            logger.warning(f"  ⚠ Unknown reform type: {reform_type_str} -> {reform_code}")
            return None
        
        return {
            'place_id': place_id,
            'reform_type_ids': [reform_type_map[reform_code]],  # Convert to list for new schema
            'status': normalize_reform_status(row.get('status')),
            'scope': None,
            'land_use': None,
            'adoption_date': row.get('adoption_date'),
            'summary': row.get('summary'),
            'requirements': None,
            'notes': f"From Center for Building Trackers",
            'reform_mechanism': None,
            'reform_phase': None,
            'legislative_number': None,
            'link_url': CBNA_TRACKERS_URL,  # Always use main trackers page
            'citations': [],
            # Source-specific fields
            'reporter': None,
            'source_url': row.get('link_url'),
            'source_notes': None,
            'is_primary': True
        }
    
    except Exception as e:
        logger.error(f"  ✗ Error parsing row: {e}")
        return None


# ============================================================================
# CSV EXPORT
# ============================================================================

def save_to_csv(records: List[Dict], output_path: str) -> None:
    """Save scraped records to CSV file."""
    if not records:
        logger.warning("No records to save")
        return
    
    # Determine CSV columns from first record
    fieldnames = ['state_code', 'municipality_name', 'reform_type', 'status', 
                  'adoption_date', 'summary', 'link_url']
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for record in records:
            writer.writerow(record)
    
    logger.info(f"✓ Saved {len(records)} records to {output_path}")


# ============================================================================
# DATABASE INGESTION
# ============================================================================

def ingest_cbna_data(records: List[Dict], database_url: Optional[str] = None) -> Tuple[int, int, int]:
    """
    Main ingestion function.
    
    Returns:
        (records_processed, reforms_created, reforms_updated)
    """
    start_time = datetime.now()
    conn = cursor = None
    
    try:
        conn, cursor = get_db_connection(database_url)
        reform_type_map = load_reform_type_map(cursor)
        
        # Collect places
        logger.info("Collecting places from records...")
        place_records = []
        for record in records:
            state_code = record.get('state_code')
            municipality_name = record.get('municipality_name')
            
            if municipality_name and state_code:
                place_records.append({
                    'name': municipality_name,
                    'place_type': 'city',
                    'state_code': state_code,
                    'population': None,
                    'latitude': None,
                    'longitude': None,
                    'encoded_name': None,
                })
            elif state_code:
                from db_utils import get_state_name
                state_name = get_state_name(state_code) or state_code
                place_records.append({
                    'name': state_name,
                    'place_type': 'state',
                    'state_code': state_code,
                    'population': None,
                    'latitude': None,
                    'longitude': None,
                    'encoded_name': None,
                })
        
        places_created, places_updated, place_id_map = bulk_upsert_places(conn, cursor, place_records)
        if place_records:
            logger.info(
                f"Upserted {len(place_records)} places (created {places_created}, updated {places_updated})"
            )
        
        # Parse and upsert reforms
        total_created = 0
        total_updated = 0
        reform_rows: List[Dict] = []
        
        for i, record in enumerate(records, 1):
            parsed = parse_csv_row(record, place_id_map, reform_type_map)
            if parsed:
                reform_rows.append(parsed)
            
            if len(reform_rows) >= BATCH_SIZE or i == len(records):
                if reform_rows:
                    logger.info(
                        f"Processing batch {(i - 1)//BATCH_SIZE + 1} ({len(reform_rows)} reforms)..."
                    )
                    created, updated, reform_ids, deduped_reforms = bulk_upsert_reforms(
                        conn, cursor, reform_rows
                    )
                    
                    # Link reforms to CBNA source
                    bulk_link_reform_sources(conn, cursor, reform_ids, deduped_reforms, 'CBNA')
                    
                    citation_rows = build_citation_rows(reform_ids, deduped_reforms)
                    bulk_insert_citations(conn, cursor, citation_rows)
                    total_created += created
                    total_updated += updated
                    reform_rows = []
        
        # Geocode places without coordinates
        geocode_missing_places(conn, cursor)
        
        log_ingestion(
            conn,
            cursor,
            source_name='CBNA',
            records_processed=len(records),
            places_created=places_created,
            places_updated=places_updated,
            reforms_created=total_created,
            reforms_updated=total_updated,
            status='success',
            start_time=start_time,
            source_url=CBNA_TRACKERS_URL,
        )
        
        duration = int((datetime.now() - start_time).total_seconds())
        logger.info("\n" + "="*60)
        logger.info("✓ Ingestion complete!")
        logger.info(f"  Total records processed: {len(records)}")
        logger.info(f"  Reforms created: {total_created}")
        logger.info(f"  Reforms updated: {total_updated}")
        logger.info(f"  Duration: {duration}s")
        logger.info("="*60 + "\n")
        
        return len(records), total_created, total_updated
    
    except Exception as e:
        logger.error(f"✗ Ingestion failed: {e}")
        traceback.print_exc()
        try:
            if conn and cursor:
                log_ingestion(
                    conn,
                    cursor,
                    source_name='CBNA',
                    records_processed=0,
                    places_created=0,
                    places_updated=0,
                    reforms_created=0,
                    reforms_updated=0,
                    status='failed',
                    start_time=start_time,
                    source_url=CBNA_TRACKERS_URL,
                    error_message=str(e),
                )
        except Exception:
            pass
        raise
    
    finally:
        close_db_connection(conn, cursor)


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Scrape and ingest Center for Building Trackers data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape and save to CSV
  python centerforbuilding.py --output database/testdata/centerforbuilding-trackers.csv
  
  # Scrape and ingest to database
  python centerforbuilding.py --ingest
  
  # Use custom database URL
  python centerforbuilding.py --ingest --database postgresql://user:pass@host/db
        """
    )
    
    parser.add_argument(
        '--output',
        type=str,
        help='Path to output CSV file (if not ingesting to database)',
        default=None
    )
    
    parser.add_argument(
        '--ingest',
        action='store_true',
        help='Ingest data directly to database'
    )
    
    parser.add_argument(
        '--database',
        type=str,
        help='Database URL (default: $DATABASE_URL)',
        default=None
    )
    
    args = parser.parse_args()
    
    if not args.output and not args.ingest:
        parser.error("Must specify either --output or --ingest")
    
    try:
        # Scrape data
        records = scrape_cbna_data()
        
        if not records:
            logger.warning("No records scraped. The website structure may have changed.")
            logger.info("You may need to inspect the page manually and update the scraping logic.")
            sys.exit(1)
        
        # Save to CSV or ingest to database
        if args.output:
            save_to_csv(records, args.output)
            logger.info(f"✓ Data saved to {args.output}")
        elif args.ingest:
            ingest_cbna_data(records, args.database)
    
    except Exception as e:
        logger.error(f"Script failed: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
