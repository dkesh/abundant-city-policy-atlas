"""
Web Scraper for Bill Text
Fetches bill text from various state legislature websites and municipal ordinance sites.
"""

import os
import time
import logging
import json
import re
import urllib3
from typing import Optional, Dict, List
from datetime import datetime, timezone
import requests
from bs4 import BeautifulSoup

from scripts.enrichment.utils import get_domain, BROWSER_USER_AGENT

# Disable SSL warnings when verification is disabled
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

# File to log unknown sites
UNKNOWN_SITES_LOG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    'scripts', 'enrichment', 'unknown_sites.jsonl'
)

# User agent for requests (imported from utils)
USER_AGENT = BROWSER_USER_AGENT

# Scraper configurations for different state legislature websites
# Based on analysis of 4,646 URLs in database
SCRAPER_CONFIGS = {
    # Illinois
    'ilga.gov': {
        'bill_text_selectors': [
            '.legislation-text',
            '#ctl00_ContentPlaceHolder1_lblBillText',
            '.bill-text',
            'pre'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 30,
    },
    # California
    'leginfo.legislature.ca.gov': {
        'bill_text_selectors': [
            '#bill_all',
            '.bill-text',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Massachusetts (46 URLs)
    'malegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document-content'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 30,
    },
    # Texas (45 URLs)
    'capitol.texas.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Washington (36 URLs)
    'app.leg.wa.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document-content'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Hawaii (35 URLs)
    'www.capitol.hawaii.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.measure-text'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Rhode Island (33 URLs)
    'status.rilegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # New Jersey (32 URLs)
    'www.njleg.state.nj.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.bill-content'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Minnesota (29 URLs) - Note: www.revisor.mn.gov is different from legislature.state.mn.us
    'www.revisor.mn.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#bill-content',
            'pre',
            '.document'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    'legislature.state.mn.us': {
        'bill_text_selectors': [
            '.bill-text',
            'pre',
            '#bill-content'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Virginia (28 URLs)
    'lis.virginia.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document-content'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Connecticut (25 URLs)
    'www.cga.ct.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # New Hampshire (24 URLs)
    'www.gencourt.state.nh.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Arizona (24 URLs)
    'apps.azleg.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Oregon (21 URLs)
    'olis.oregonlegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.measure-text'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Florida (20 URLs)
    'flsenate.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document-content'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Montana (20 URLs)
    'bills.legmt.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # North Carolina (17 URLs)
    'www.ncleg.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Maine (15 URLs)
    'legislature.maine.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # New York Assembly (15 URLs)
    'nyassembly.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # New York Senate (13 URLs)
    'nysenate.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Kentucky (12 URLs)
    'apps.legislature.ky.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Tennessee (11 URLs)
    'wapp.capitol.tn.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Utah (11 URLs)
    'le.utah.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Maryland (11 URLs)
    'mgaleg.maryland.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Wisconsin (10 URLs)
    'docs.legis.wisconsin.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.document'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # South Carolina (8 URLs)
    'www.scstatehouse.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # New Mexico (7 URLs)
    'www.nmlegis.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Georgia (7 URLs)
    'www.legis.ga.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # West Virginia (6 URLs)
    'www.wvlegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Nevada (6 URLs)
    'www.leg.state.nv.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Ohio (5 URLs)
    'www.legislature.ohio.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Oklahoma (5 URLs)
    'www.oklegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Iowa (5 URLs)
    'www.legis.iowa.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Michigan (4 URLs)
    'legislature.mi.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Wyoming (4 URLs)
    'legisweb.state.wy.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Arkansas (4 URLs)
    'www.arkleg.state.ar.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Vermont (4 URLs)
    'legislature.vermont.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Idaho (3 URLs)
    'legislature.idaho.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Nebraska (3 URLs)
    'nebraskalegislature.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Pennsylvania (3 URLs)
    'www.palegis.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # DC (3 URLs)
    'lims.dccouncil.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Kansas (2 URLs)
    'www.kslegislature.org': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Missouri (2 URLs)
    'www.house.mo.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Indiana (2 URLs)
    'iga.in.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Colorado (2 URLs)
    'leg.colorado.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Louisiana (1 URL)
    'www.legis.la.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # North Dakota (1 URL)
    'www.legis.nd.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Delaware (1 URL)
    'legis.delaware.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
    # Alabama (1 URL)
    'alison.legislature.state.al.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre'
        ],
        'title_selector': 'h1',
        'timeout': 30,
    },
}

# Municipal ordinance site patterns (for detection)
MUNICIPAL_PATTERNS = [
    r'city.*\.gov',
    r'municipal.*\.gov',
    r'\.us/.*ordinance',
    r'code.*\.org',
    r'municode\.com',
]

# Rate limiting
_last_request_time = {}
_min_request_interval = 1.0  # seconds between requests to same domain


# get_domain is now imported from scripts.enrichment.utils


def is_municipal_site(url: str) -> bool:
    """Check if URL appears to be a municipal ordinance site."""
    domain = get_domain(url)
    for pattern in MUNICIPAL_PATTERNS:
        if re.search(pattern, domain, re.IGNORECASE):
            return True
    return False


def log_unknown_site(url: str, domain: str, is_municipal: bool = False):
    """Log unknown legislative/municipal sites for future scraper development."""
    log_entry = {
        'timestamp': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'url': url,
        'domain': domain,
        'is_municipal': is_municipal,
        'has_scraper': False
    }
    
    try:
        os.makedirs(os.path.dirname(UNKNOWN_SITES_LOG), exist_ok=True)
        with open(UNKNOWN_SITES_LOG, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')
        logger.info(f"Logged unknown site: {domain} (municipal: {is_municipal})")
    except Exception as e:
        logger.warning(f"Failed to log unknown site: {e}")


def should_rate_limit(domain: str) -> bool:
    """Check if we should rate limit based on last request time."""
    global _last_request_time
    
    if domain not in _last_request_time:
        return False
    
    elapsed = time.time() - _last_request_time[domain]
    return elapsed < _min_request_interval


def wait_for_rate_limit(domain: str):
    """Wait if rate limiting is needed."""
    if should_rate_limit(domain):
        sleep_time = _min_request_interval - (time.time() - _last_request_time[domain])
        if sleep_time > 0:
            time.sleep(sleep_time)
    
    _last_request_time[domain] = time.time()


def fetch_bill_text(url: str, timeout: int = 30, max_retries: int = 3) -> Optional[str]:
    """
    Fetch and extract bill text from URL.
    
    Args:
        url: URL to the bill text
        timeout: Request timeout in seconds
        max_retries: Maximum number of retry attempts
    
    Returns:
        Extracted bill text, or None if failed
    """
    if not url or not url.startswith('http'):
        logger.warning(f"Invalid URL: {url}")
        return None
    
    domain = get_domain(url)
    wait_for_rate_limit(domain)
    
    config = SCRAPER_CONFIGS.get(domain, {})
    
    # Log unknown sites
    if not config:
        is_municipal = is_municipal_site(url)
        log_unknown_site(url, domain, is_municipal)
        logger.warning(f"No scraper config for {domain} (municipal: {is_municipal}) - using fallback selectors")
    
    timeout = config.get('timeout', timeout)
    selectors = config.get('bill_text_selectors', ['pre', '.bill-text', 'body'])
    
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    
    for attempt in range(max_retries):
        try:
            # Try with SSL verification first, fall back to unverified if needed
            try:
                response = requests.get(url, headers=headers, timeout=timeout, verify=True)
            except requests.exceptions.SSLError:
                logger.warning(f"SSL verification failed for {url}, retrying without verification")
                response = requests.get(url, headers=headers, timeout=timeout, verify=False)
            response.raise_for_status()
            
            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Try each selector in order
            text_content = None
            for selector in selectors:
                elements = soup.select(selector)
                if elements:
                    # Get text from first matching element
                    text_content = elements[0].get_text(separator='\n', strip=True)
                    if text_content and len(text_content) > 100:  # Minimum content length
                        break
            
            # Fallback: get all text if no selector worked
            if not text_content or len(text_content) < 100:
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.decompose()
                text_content = soup.get_text(separator='\n', strip=True)
            
            if text_content and len(text_content) > 100:
                logger.info(f"Successfully fetched bill text from {url} ({len(text_content)} chars)")
                return text_content
            else:
                logger.warning(f"Bill text too short from {url} ({len(text_content) if text_content else 0} chars)")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"Request failed for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                logger.error(f"Failed to fetch bill text from {url} after {max_retries} attempts")
                return None
        except Exception as e:
            logger.error(f"Unexpected error fetching bill text from {url}: {e}")
            return None
    
    return None


def extract_bill_title(url: str, html_content: Optional[str] = None) -> Optional[str]:
    """
    Extract bill title from URL or HTML content.
    
    Args:
        url: URL to the bill
        html_content: Optional HTML content (if already fetched)
    
    Returns:
        Bill title or None
    """
    domain = get_domain(url)
    config = SCRAPER_CONFIGS.get(domain, {})
    title_selector = config.get('title_selector', 'h1')
    
    if html_content:
        soup = BeautifulSoup(html_content, 'html.parser')
        title_elem = soup.select_one(title_selector)
        if title_elem:
            return title_elem.get_text(strip=True)
    
    return None


def get_bill_info(url: str, fetch_html: bool = False) -> Dict[str, Optional[str]]:
    """
    Get comprehensive bill information from URL.
    
    Args:
        url: URL to the bill
        fetch_html: If True, also return raw HTML content
    
    Returns:
        Dict with 'text', 'title', 'url', and optionally 'html' keys
    """
    text = fetch_bill_text(url)
    title = extract_bill_title(url)
    
    result = {
        'text': text,
        'title': title,
        'url': url
    }
    
    if fetch_html:
        # Fetch HTML for structured data extraction
        try:
            domain = get_domain(url)
            wait_for_rate_limit(domain)
            headers = {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
            # Try with SSL verification first, fall back to unverified if needed
            try:
                response = requests.get(url, headers=headers, timeout=30, verify=True)
            except requests.exceptions.SSLError:
                logger.warning(f"SSL verification failed for {url}, retrying without verification")
                response = requests.get(url, headers=headers, timeout=30, verify=False)
            response.raise_for_status()
            result['html'] = response.text
        except Exception as e:
            logger.warning(f"Failed to fetch HTML for {url}: {e}")
            result['html'] = None
    
    return result
