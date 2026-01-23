"""
JavaScript-enabled Bill Scraper
Uses Playwright to render JavaScript-heavy sites (SPAs) that require browser automation.
"""

import os
import logging
import time
from typing import Optional, Dict
from datetime import datetime, timezone

try:
    from playwright.sync_api import sync_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("Playwright not available - JavaScript rendering disabled")

from scripts.enrichment.utils import get_domain, get_browser_headers
from scripts.enrichment.bill_scraper import (
    SCRAPER_CONFIGS,
    DOMAIN_RATE_LIMITS,
    _last_request_time,
    wait_for_rate_limit
)

logger = logging.getLogger(__name__)

# Browser instance (singleton)
_browser: Optional[Browser] = None
_browser_initialized = False


def init_browser() -> bool:
    """
    Initialize Playwright browser instance.
    
    Returns:
        True if browser initialized successfully, False otherwise
    """
    global _browser, _browser_initialized
    
    if not PLAYWRIGHT_AVAILABLE:
        logger.error("Playwright not available - cannot initialize browser")
        return False
    
    if _browser_initialized and _browser:
        return True
    
    try:
        playwright = sync_playwright().start()
        # Use Chromium in headless mode
        _browser = playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        _browser_initialized = True
        logger.info("Playwright browser initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Playwright browser: {e}")
        return False


def close_browser():
    """Close the browser instance."""
    global _browser, _browser_initialized
    
    if _browser:
        try:
            _browser.close()
            _browser = None
            _browser_initialized = False
            logger.info("Playwright browser closed")
        except Exception as e:
            logger.warning(f"Error closing browser: {e}")


def fetch_bill_text_js(url: str, timeout: int = 60, max_retries: int = 2) -> Optional[str]:
    """
    Fetch bill text from JavaScript-rendered site using Playwright.
    
    Args:
        url: URL to the bill text
        timeout: Page load timeout in seconds
        max_retries: Maximum number of retry attempts
    
    Returns:
        Extracted bill text, or None if failed
    """
    if not PLAYWRIGHT_AVAILABLE:
        logger.warning("Playwright not available - cannot fetch JavaScript-rendered content")
        return None
    
    if not init_browser():
        return None
    
    domain = get_domain(url)
    wait_for_rate_limit(domain)
    
    config = SCRAPER_CONFIGS.get(domain, {})
    selectors = config.get('bill_text_selectors', ['pre', '.bill-text', 'body'])
    timeout_ms = timeout * 1000
    
    for attempt in range(max_retries):
        try:
            # Create a new page for each request
            page = _browser.new_page()
            
            # Set realistic browser headers
            headers = get_browser_headers(referer=url if domain else None)
            page.set_extra_http_headers(headers)
            
            # Navigate to URL and wait for content
            logger.info(f"Loading {url} with Playwright (attempt {attempt + 1}/{max_retries})...")
            
            try:
                # Wait for network to be idle (content loaded)
                page.goto(url, wait_until='networkidle', timeout=timeout_ms)
            except PlaywrightTimeoutError:
                # If networkidle times out, try domcontentloaded
                logger.warning(f"Network idle timeout for {url}, trying domcontentloaded...")
                page.goto(url, wait_until='domcontentloaded', timeout=timeout_ms)
                # Wait a bit for JavaScript to render
                time.sleep(3)
            
            # Wait for content to be visible (additional wait for SPAs)
            try:
                # Try to wait for one of the selectors to appear
                for selector in selectors:
                    try:
                        page.wait_for_selector(selector, timeout=5000)
                        break
                    except PlaywrightTimeoutError:
                        continue
            except Exception:
                pass  # Continue even if selectors don't appear
            
            # Get page content
            html_content = page.content()
            
            # Parse with BeautifulSoup
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Try each selector in order
            text_content = None
            for selector in selectors:
                elements = soup.select(selector)
                if elements:
                    text_content = elements[0].get_text(separator='\n', strip=True)
                    if text_content and len(text_content) > 100:
                        break
            
            # Fallback: get all text if no selector worked
            if not text_content or len(text_content) < 100:
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.decompose()
                text_content = soup.get_text(separator='\n', strip=True)
            
            # Close the page
            page.close()
            
            if text_content and len(text_content) > 100:
                logger.info(f"Successfully fetched bill text from {url} using Playwright ({len(text_content)} chars)")
                return text_content
            else:
                logger.warning(f"Bill text too short from {url} using Playwright ({len(text_content) if text_content else 0} chars)")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                return None
                
        except PlaywrightTimeoutError as e:
            logger.warning(f"Playwright timeout for {url} (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.error(f"Failed to fetch {url} with Playwright after {max_retries} attempts")
                return None
        except Exception as e:
            logger.error(f"Error fetching {url} with Playwright: {e}", exc_info=True)
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None
    
    return None


def get_bill_info_js(url: str, fetch_html: bool = False) -> Dict[str, Optional[str]]:
    """
    Get comprehensive bill information from JavaScript-rendered URL using Playwright.
    
    Args:
        url: URL to the bill
        fetch_html: If True, also return raw HTML content
    
    Returns:
        Dict with 'text', 'title', 'url', and optionally 'html' keys
    """
    if not PLAYWRIGHT_AVAILABLE:
        logger.warning("Playwright not available - cannot fetch JavaScript-rendered content")
        return {'text': None, 'title': None, 'url': url, 'html': None}
    
    if not init_browser():
        return {'text': None, 'title': None, 'url': url, 'html': None}
    
    domain = get_domain(url)
    wait_for_rate_limit(domain)
    
    config = SCRAPER_CONFIGS.get(domain, {})
    selectors = config.get('bill_text_selectors', ['pre', '.bill-text', 'body'])
    title_selector = config.get('title_selector', 'h1')
    
    try:
        page = _browser.new_page()
        headers = get_browser_headers(referer=url if domain else None)
        page.set_extra_http_headers(headers)
        
        logger.info(f"Loading {url} with Playwright for full content...")
        
        try:
            page.goto(url, wait_until='networkidle', timeout=60000)
        except PlaywrightTimeoutError:
            page.goto(url, wait_until='domcontentloaded', timeout=60000)
            time.sleep(3)
        
        # Wait for content
        for selector in selectors:
            try:
                page.wait_for_selector(selector, timeout=5000)
                break
            except PlaywrightTimeoutError:
                continue
        
        html_content = page.content()
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Extract text
        text_content = None
        for selector in selectors:
            elements = soup.select(selector)
            if elements:
                text_content = elements[0].get_text(separator='\n', strip=True)
                if text_content and len(text_content) > 100:
                    break
        
        if not text_content or len(text_content) < 100:
            for script in soup(["script", "style"]):
                script.decompose()
            text_content = soup.get_text(separator='\n', strip=True)
        
        # Extract title
        title_elem = soup.select_one(title_selector)
        title = title_elem.get_text(strip=True) if title_elem else None
        
        page.close()
        
        result = {
            'text': text_content if text_content and len(text_content) > 100 else None,
            'title': title,
            'url': url
        }
        
        if fetch_html:
            result['html'] = html_content
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching {url} with Playwright: {e}", exc_info=True)
        return {'text': None, 'title': None, 'url': url, 'html': None}
