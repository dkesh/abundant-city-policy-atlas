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

from scripts.enrichment.utils import get_domain, BROWSER_USER_AGENT, get_browser_headers

# Try to import JavaScript renderer (optional)
try:
    from scripts.enrichment.bill_scraper_js import (
        fetch_bill_text_js,
        get_bill_info_js,
        PLAYWRIGHT_AVAILABLE,
        init_browser,
        close_browser
    )
    JS_RENDERER_AVAILABLE = True
except ImportError:
    JS_RENDERER_AVAILABLE = False
    logger.warning("JavaScript renderer not available - SPA sites will use fallback")

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
    # Hawaii (35 URLs) - Note: Has strict bot detection, requires long delays
    'www.capitol.hawaii.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.measure-text',
            '.measure-content',
            '#ctl00_ContentPlaceHolder1_lblMeasureText'
        ],
        'title_selector': 'h1, .measure-title',
        'timeout': 60,  # Longer timeout for Hawaii
        'requires_js': False,  # Not an SPA, but has bot detection
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
    # Montana (20 URLs) - SPA site, requires JavaScript rendering
    'bills.legmt.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '[data-testid="bill-text"]',
            '.bill-content',
            'main',
            'article'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,
        'requires_js': True,  # SPA site
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
    # Georgia (7 URLs) - SPA site, requires JavaScript rendering
    'www.legis.ga.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.bill-content',
            'main',
            '[role="main"]'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,
        'requires_js': True,  # SPA site
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
    # Wyoming (4 URLs) - SPA site, requires JavaScript rendering
    'legisweb.state.wy.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.bill-content',
            'main',
            'article',
            '.legislation-content'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,
        'requires_js': True,  # SPA site
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
    # DC (3 URLs) - Has Cloudflare protection, requires conservative approach
    'lims.dccouncil.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.legislation-text',
            '.bill-content',
            'main'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,  # Longer timeout for Cloudflare-protected site
        'requires_js': False,
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
    # Indiana (2 URLs) - SPA site, requires JavaScript rendering
    'iga.in.gov': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.bill-content',
            'main',
            'article'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,
        'requires_js': True,  # SPA site
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
    # Alabama (1 URL) - SPA site, requires JavaScript rendering
    'alison.legislature.state.al.us': {
        'bill_text_selectors': [
            '.bill-text',
            '#billText',
            'pre',
            '.bill-content',
            'main',
            'article',
            '.bill-details'
        ],
        'title_selector': 'h1, .bill-title',
        'timeout': 60,
        'requires_js': True,  # SPA site
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

# Domain-specific rate limiting (seconds between requests)
# Higher values = more conservative (data quality over speed)
DOMAIN_RATE_LIMITS = {
    'www.capitol.hawaii.gov': 10.0,  # Very long delay for Hawaii (user requested)
    'capitol.hawaii.gov': 10.0,
    'lims.dccouncil.gov': 5.0,  # DC site has issues, be conservative
    'bills.legmt.gov': 3.0,  # Montana SPA site
    'www.legis.ga.gov': 3.0,  # Georgia site
    'iga.in.gov': 3.0,  # Indiana site
    'lis.virginia.gov': 2.0,  # Virginia site
    'legisweb.state.wy.us': 3.0,  # Wyoming site
    'alison.legislature.state.al.us': 3.0,  # Alabama site
}

# Known SPA (Single Page Application) sites that require JavaScript rendering
SPA_DOMAINS = {
    'bills.legmt.gov',  # Montana - uses # fragments in URLs
    'www.legis.ga.gov',  # Georgia - minimal content without JS
    'iga.in.gov',  # Indiana - minimal content
    'legisweb.state.wy.us',  # Wyoming - minimal content
    'alison.legislature.state.al.us',  # Alabama - minimal content
}

# Sites that should be skipped after 404 (page doesn't exist)
_404_skipped_domains = set()


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
    
    # Get domain-specific rate limit or use default
    rate_limit = DOMAIN_RATE_LIMITS.get(domain, _min_request_interval)
    elapsed = time.time() - _last_request_time[domain]
    return elapsed < rate_limit


def wait_for_rate_limit(domain: str):
    """Wait if rate limiting is needed."""
    global _last_request_time
    
    # Get domain-specific rate limit or use default
    rate_limit = DOMAIN_RATE_LIMITS.get(domain, _min_request_interval)
    
    if domain in _last_request_time:
        elapsed = time.time() - _last_request_time[domain]
        if elapsed < rate_limit:
            sleep_time = rate_limit - elapsed
            if sleep_time > 0:
                logger.debug(f"Rate limiting {domain}: waiting {sleep_time:.1f}s")
                time.sleep(sleep_time)
    
    _last_request_time[domain] = time.time()


def is_spa_site(url: str) -> bool:
    """Check if URL is from a known SPA site that requires JavaScript rendering."""
    domain = get_domain(url)
    
    # Check if domain is in known SPA list
    if domain in SPA_DOMAINS:
        return True
    
    # Check scraper config for requires_js flag
    config = SCRAPER_CONFIGS.get(domain, {})
    if config.get('requires_js', False):
        return True
    
    # Also check for # fragments in URL (common SPA pattern)
    if '#' in url and url.split('#')[1]:
        return True
    
    return False


def should_skip_404(domain: str) -> bool:
    """Check if we should skip this domain after 404 errors."""
    return domain in _404_skipped_domains


def mark_404_skipped(domain: str):
    """Mark a domain to skip after 404 errors."""
    _404_skipped_domains.add(domain)


def fetch_bill_text(url: str, timeout: int = 30, max_retries: int = 3) -> Optional[str]:
    """
    Fetch and extract bill text from URL.
    Automatically uses JavaScript rendering for SPA sites if available.
    
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
    
    # Check if this is an SPA site that needs JavaScript rendering
    if is_spa_site(url) and JS_RENDERER_AVAILABLE:
        logger.info(f"Detected SPA site {domain}, using JavaScript renderer")
        try:
            text = fetch_bill_text_js(url, timeout=timeout, max_retries=max_retries)
            if text and len(text) > 100:
                return text
            else:
                logger.warning(f"JavaScript renderer returned insufficient content, falling back to regular scraper")
        except Exception as e:
            logger.warning(f"JavaScript renderer failed for {url}: {e}, falling back to regular scraper")
    
    wait_for_rate_limit(domain)
    
    config = SCRAPER_CONFIGS.get(domain, {})
    
    # Log unknown sites
    if not config:
        is_municipal = is_municipal_site(url)
        log_unknown_site(url, domain, is_municipal)
        logger.warning(f"No scraper config for {domain} (municipal: {is_municipal}) - using fallback selectors")
    
    timeout = config.get('timeout', timeout)
    selectors = config.get('bill_text_selectors', ['pre', '.bill-text', 'body'])
    
    # Use improved browser headers
    headers = get_browser_headers(referer=url if domain else None)
    
    # Check if this is a 404-skipped domain
    if should_skip_404(domain):
        logger.info(f"Skipping {url} - domain marked as 404 (page doesn't exist)")
        return None
    
    for attempt in range(max_retries):
        try:
            # Try with SSL verification first, fall back to unverified if needed
            try:
                response = requests.get(url, headers=headers, timeout=timeout, verify=True)
            except requests.exceptions.SSLError:
                logger.warning(f"SSL verification failed for {url}, retrying without verification")
                response = requests.get(url, headers=headers, timeout=timeout, verify=False)
            
            # Handle specific HTTP status codes
            if response.status_code == 404:
                logger.warning(f"404 Not Found for {url} - marking domain to skip")
                mark_404_skipped(domain)
                return None
            elif response.status_code == 403:
                # 403 Forbidden - likely bot detection, wait longer before retry
                logger.warning(f"403 Forbidden for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    # Longer wait for 403 errors, especially for Hawaii
                    wait_time = (2 ** attempt) * (10 if 'hawaii' in domain.lower() else 3)
                    logger.info(f"Waiting {wait_time}s before retry (403 error)")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts (403 Forbidden)")
                    return None
            elif response.status_code == 523:
                # 523 Cloudflare error - wait longer
                logger.warning(f"523 Server Error (Cloudflare) for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 5  # Longer wait for Cloudflare errors
                    logger.info(f"Waiting {wait_time}s before retry (523 error)")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"Failed to fetch {url} after {max_retries} attempts (523 Server Error)")
                    return None
            
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
                
        except requests.exceptions.HTTPError as e:
            # Handle HTTP errors with specific status codes
            status_code = e.response.status_code if hasattr(e, 'response') and e.response else None
            if status_code == 404:
                logger.warning(f"404 Not Found for {url} - marking domain to skip")
                mark_404_skipped(domain)
                return None
            elif status_code == 403:
                logger.warning(f"403 Forbidden for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * (10 if 'hawaii' in domain.lower() else 3)
                    logger.info(f"Waiting {wait_time}s before retry (403 error)")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"Failed to fetch bill text from {url} after {max_retries} attempts (403 Forbidden)")
                    return None
            elif status_code == 523:
                logger.warning(f"523 Server Error (Cloudflare) for {url} (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 5
                    logger.info(f"Waiting {wait_time}s before retry (523 error)")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"Failed to fetch bill text from {url} after {max_retries} attempts (523 Server Error)")
                    return None
            else:
                logger.warning(f"HTTP error {status_code} for {url} (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"Failed to fetch bill text from {url} after {max_retries} attempts")
                    return None
        except requests.exceptions.RequestException as e:
            logger.warning(f"Request failed for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                # Longer backoff for problematic domains
                backoff_multiplier = 10 if 'hawaii' in domain.lower() else 1
                time.sleep((2 ** attempt) * backoff_multiplier)
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
    Automatically uses JavaScript rendering for SPA sites if available.
    
    Args:
        url: URL to the bill
        fetch_html: If True, also return raw HTML content
    
    Returns:
        Dict with 'text', 'title', 'url', and optionally 'html' keys
    """
    domain = get_domain(url)
    
    # Check if this is an SPA site that needs JavaScript rendering
    if is_spa_site(url) and JS_RENDERER_AVAILABLE:
        logger.info(f"Detected SPA site {domain}, using JavaScript renderer for full content")
        try:
            result = get_bill_info_js(url, fetch_html=fetch_html)
            if result.get('text') and len(result.get('text', '')) > 100:
                return result
            else:
                logger.warning(f"JavaScript renderer returned insufficient content, falling back to regular scraper")
        except Exception as e:
            logger.warning(f"JavaScript renderer failed for {url}: {e}, falling back to regular scraper")
    
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
            
            # Check if this is a 404-skipped domain
            if should_skip_404(domain):
                logger.info(f"Skipping HTML fetch for {url} - domain marked as 404")
                result['html'] = None
                return result
            
            # Use improved browser headers
            headers = get_browser_headers(referer=url if domain else None)
            
            # Try with SSL verification first, fall back to unverified if needed
            try:
                response = requests.get(url, headers=headers, timeout=30, verify=True)
            except requests.exceptions.SSLError:
                logger.warning(f"SSL verification failed for {url}, retrying without verification")
                response = requests.get(url, headers=headers, timeout=30, verify=False)
            
            # Handle specific status codes
            if response.status_code == 404:
                logger.warning(f"404 Not Found for {url} - marking domain to skip")
                mark_404_skipped(domain)
                result['html'] = None
                return result
            elif response.status_code == 403:
                logger.warning(f"403 Forbidden for {url} - cannot fetch HTML")
                result['html'] = None
                return result
            elif response.status_code == 523:
                logger.warning(f"523 Server Error (Cloudflare) for {url} - cannot fetch HTML")
                result['html'] = None
                return result
            
            response.raise_for_status()
            result['html'] = response.text
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if hasattr(e, 'response') and e.response else None
            if status_code == 404:
                mark_404_skipped(domain)
            logger.warning(f"Failed to fetch HTML for {url}: {e}")
            result['html'] = None
        except Exception as e:
            logger.warning(f"Failed to fetch HTML for {url}: {e}")
            result['html'] = None
    
    return result
