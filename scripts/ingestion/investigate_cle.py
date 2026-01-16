#!/usr/bin/env python3
"""
Investigation script for Center for Land Economics (CLE) website.
This script helps identify how reform data is structured on the CLE website.

Usage:
    python investigate_cle.py
"""

import requests
import json
import re
from bs4 import BeautifulSoup
from typing import Optional, Dict, List, Any

USER_AGENT = 'urbanist-reform-map/1.0 (+https://github.com/dkesh/urbanist-reform-map)'

CLE_LVT_URL = "https://landeconomics.org/lvt"
CLE_PROBLEM_URL = "https://landeconomics.org/problem"

def fetch_page(url: str) -> Optional[str]:
    """Fetch HTML content from URL."""
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return None


def find_json_in_page(html: str) -> List[Dict]:
    """Find all JSON objects embedded in the page."""
    json_objects = []
    
    # Look for JSON in script tags
    soup = BeautifulSoup(html, 'html.parser')
    script_tags = soup.find_all('script')
    
    for script in script_tags:
        if script.string:
            content = script.string.strip()
            
            # Try to find JSON objects
            # Look for common patterns like { ... } or [ ... ]
            json_patterns = [
                r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}',  # Nested objects
                r'\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]',  # Arrays
            ]
            
            for pattern in json_patterns:
                matches = re.findall(pattern, content, re.DOTALL)
                for match in matches:
                    try:
                        parsed = json.loads(match)
                        if isinstance(parsed, (dict, list)) and len(str(parsed)) > 50:
                            json_objects.append(parsed)
                    except json.JSONDecodeError:
                        continue
    
    return json_objects


def find_map_components(html: str) -> List[Dict]:
    """Find map-related components in the HTML."""
    soup = BeautifulSoup(html, 'html.parser')
    map_info = []
    
    # Look for common map libraries
    map_libraries = [
        'google.maps',
        'mapbox',
        'leaflet',
        'openlayers',
        'arcgis',
        'carto',
    ]
    
    # Check script tags for map libraries
    scripts = soup.find_all('script')
    for script in scripts:
        if script.string:
            content = script.string.lower()
            for lib in map_libraries:
                if lib in content:
                    map_info.append({
                        'library': lib,
                        'found_in': 'script_tag',
                        'snippet': content[:200] if len(content) > 200 else content
                    })
    
    # Look for divs with map-related classes/ids
    map_divs = soup.find_all(['div', 'section'], 
                             class_=lambda x: x and ('map' in str(x).lower() if x else False))
    for div in map_divs:
        map_info.append({
            'element': 'div',
            'classes': div.get('class', []),
            'id': div.get('id'),
            'data_attrs': {k: v for k, v in div.attrs.items() if k.startswith('data-')}
        })
    
    return map_info


def find_state_mentions(html: str) -> List[str]:
    """Find mentions of US states in the HTML."""
    # US state names
    states = [
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
        'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
        'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
        'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
        'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
        'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
        'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
        'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
        'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
    ]
    
    found_states = []
    html_lower = html.lower()
    
    for state in states:
        if state.lower() in html_lower:
            found_states.append(state)
    
    return list(set(found_states))


def analyze_page(url: str) -> Dict[str, Any]:
    """Analyze a page for reform data."""
    print(f"\n{'='*60}")
    print(f"Analyzing: {url}")
    print(f"{'='*60}\n")
    
    html = fetch_page(url)
    if not html:
        return {}
    
    results = {
        'url': url,
        'html_length': len(html),
        'title': None,
        'json_objects': [],
        'map_components': [],
        'states_mentioned': [],
        'potential_data_sources': []
    }
    
    # Extract title
    soup = BeautifulSoup(html, 'html.parser')
    title_tag = soup.find('title')
    if title_tag:
        results['title'] = title_tag.string
    
    # Find JSON objects
    print("Searching for JSON data...")
    json_objects = find_json_in_page(html)
    results['json_objects'] = json_objects
    print(f"  Found {len(json_objects)} potential JSON objects")
    
    # Find map components
    print("Searching for map components...")
    map_components = find_map_components(html)
    results['map_components'] = map_components
    print(f"  Found {len(map_components)} map-related elements")
    
    # Find state mentions
    print("Searching for state mentions...")
    states = find_state_mentions(html)
    results['states_mentioned'] = states
    print(f"  Found mentions of {len(states)} states: {', '.join(states[:10])}")
    if len(states) > 10:
        print(f"  ... and {len(states) - 10} more")
    
    # Look for data attributes
    print("Searching for data attributes...")
    soup = BeautifulSoup(html, 'html.parser')
    data_elements = soup.find_all(attrs=lambda x: x and isinstance(x, dict) and any(k.startswith('data-') for k in x.keys()))
    if data_elements:
        results['potential_data_sources'].append({
            'type': 'data_attributes',
            'count': len(data_elements),
            'sample': [str(elem)[:200] for elem in data_elements[:3]]
        })
        print(f"  Found {len(data_elements)} elements with data attributes")
    
    return results


def print_summary(results: Dict[str, Any]):
    """Print a summary of findings."""
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}\n")
    
    print(f"Page: {results.get('url', 'Unknown')}")
    print(f"Title: {results.get('title', 'Unknown')}")
    print(f"HTML Size: {results.get('html_length', 0):,} bytes")
    print(f"\nJSON Objects Found: {len(results.get('json_objects', []))}")
    print(f"Map Components: {len(results.get('map_components', []))}")
    print(f"States Mentioned: {len(results.get('states_mentioned', []))}")
    
    if results.get('json_objects'):
        print("\n--- Sample JSON Objects ---")
        for i, obj in enumerate(results['json_objects'][:3], 1):
            print(f"\nObject {i} (type: {type(obj).__name__}, size: {len(str(obj))} chars):")
            if isinstance(obj, dict):
                print(f"  Keys: {list(obj.keys())[:10]}")
            elif isinstance(obj, list):
                print(f"  Length: {len(obj)}")
                if obj and isinstance(obj[0], dict):
                    print(f"  First item keys: {list(obj[0].keys())[:10]}")
    
    if results.get('map_components'):
        print("\n--- Map Components ---")
        for i, comp in enumerate(results['map_components'][:5], 1):
            print(f"\nComponent {i}:")
            for key, value in comp.items():
                if isinstance(value, str) and len(value) > 100:
                    print(f"  {key}: {value[:100]}...")
                else:
                    print(f"  {key}: {value}")


def main():
    """Main investigation function."""
    print("="*60)
    print("CENTER FOR LAND ECONOMICS - WEBSITE INVESTIGATION")
    print("="*60)
    
    # Analyze both pages
    lvt_results = analyze_page(CLE_LVT_URL)
    problem_results = analyze_page(CLE_PROBLEM_URL)
    
    # Print summaries
    print_summary(lvt_results)
    print_summary(problem_results)
    
    # Recommendations
    print(f"\n{'='*60}")
    print("RECOMMENDATIONS")
    print(f"{'='*60}\n")
    
    if lvt_results.get('json_objects'):
        print("✓ Found JSON objects - may contain reform data")
        print("  → Inspect these objects manually to find reform data structure")
    
    if lvt_results.get('map_components'):
        print("✓ Found map components")
        print("  → Map data may be loaded dynamically via JavaScript")
        print("  → Consider using Selenium/Playwright to render full page")
    
    if lvt_results.get('states_mentioned'):
        print(f"✓ Found mentions of {len(lvt_results.get('states_mentioned', []))} states")
        print("  → This suggests state-level reform tracking")
    
    if not lvt_results.get('json_objects') and not lvt_results.get('map_components'):
        print("⚠ No obvious data sources found in static HTML")
        print("  → Data is likely loaded dynamically")
        print("  → Use browser DevTools to inspect Network requests")
        print("  → Consider using Selenium/Playwright for full page rendering")
    
    print("\nNext Steps:")
    print("1. Manually inspect https://landeconomics.org/lvt in a browser")
    print("2. Open DevTools → Network tab → Look for API calls")
    print("3. Inspect map element for data attributes or embedded data")
    print("4. Check if map library exposes data via JavaScript console")


if __name__ == '__main__':
    main()
