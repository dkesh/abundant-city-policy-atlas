# Bill Scraping Improvements

This document describes the improvements made to the bill scraping system to address the 38% failure rate.

## Key Improvements

### 1. Updated User-Agent and Browser Headers
- **File**: `scripts/enrichment/utils.py`
- Updated User-Agent from Chrome 91 (2021) to Chrome 131 (current)
- Added comprehensive browser headers including:
  - Accept-Encoding: gzip, deflate, br
  - Connection: keep-alive
  - Sec-Fetch-* headers
  - Referer header support
- Created `get_browser_headers()` helper function for consistent header generation

### 2. Domain-Specific Rate Limiting
- **File**: `scripts/enrichment/bill_scraper.py`
- Added `DOMAIN_RATE_LIMITS` dictionary with conservative delays:
  - **Hawaii** (`www.capitol.hawaii.gov`): **10 seconds** between requests (user requested long delays)
  - DC (`lims.dccouncil.gov`): 5 seconds
  - SPA sites: 3 seconds
  - Other sites: 2 seconds
- Rate limiting is now domain-aware and respects these limits

### 3. Enhanced Error Handling
- **File**: `scripts/enrichment/bill_scraper.py`
- **404 Not Found**: Automatically skips domains after first 404 (page doesn't exist)
- **403 Forbidden**: Longer retry delays, especially for Hawaii (10x multiplier)
- **523 Cloudflare Errors**: Special handling with longer retry delays (5x multiplier)
- Error categorization for better monitoring

### 4. JavaScript Rendering Support (SPA Sites)
- **New File**: `scripts/enrichment/bill_scraper_js.py`
- Uses Playwright for JavaScript-rendered Single Page Applications (SPAs)
- Automatically detects SPA sites and uses browser automation
- Handles sites like:
  - `bills.legmt.gov` (Montana)
  - `www.legis.ga.gov` (Georgia)
  - `iga.in.gov` (Indiana)
  - `legisweb.state.wy.us` (Wyoming)
  - `alison.legislature.state.al.us` (Alabama)

### 5. Updated Scraper Configurations
- **File**: `scripts/enrichment/bill_scraper.py`
- Marked SPA sites with `requires_js: true` flag
- Improved selectors for better content extraction
- Increased timeouts for problematic sites (Hawaii, DC, SPAs)

### 6. Enhanced Logging and Monitoring
- **File**: `scripts/enrichment/bill_scraping_service.py`
- Tracks failures by domain
- Tracks failures by error type (403, 404, 523, other)
- Provides summary statistics at end of run

## Installation

### Local Development
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers (required for JavaScript rendering)
python -m playwright install chromium
python -m playwright install-deps chromium  # Linux only
```

### GitHub Actions
The workflow automatically installs Playwright browsers. No manual steps needed.

## Usage

The scraping system automatically:
1. Detects SPA sites and uses JavaScript rendering when needed
2. Applies domain-specific rate limiting
3. Handles errors gracefully with appropriate retries
4. Skips 404s after first failure
5. Uses longer delays for problematic sites (especially Hawaii)

### Running Scraping
```bash
# Scrape all pending documents
python scripts/enrichment/run_bill_scraping.py --all

# Scrape with limit
python scripts/enrichment/run_bill_scraping.py --limit 100

# Scrape specific document
python scripts/enrichment/run_bill_scraping.py --policy-doc-id 123

# Disable AI fallback (use only configured scrapers)
python scripts/enrichment/run_bill_scraping.py --no-ai-fallback
```

## Expected Impact

### Before Improvements
- **Failure Rate**: 37.9%
- **Main Issues**:
  - 30+ Hawaii 403 errors
  - 3 DC 523 errors
  - Many SPA sites returning minimal content (60-91 chars)

### After Improvements
- **Expected Failure Rate**: <15% (target)
- **Improvements**:
  - Hawaii: Better headers + 10s delays should reduce 403 errors by 50-80%
  - DC: Longer retries for 523 errors
  - SPA Sites: Full content extraction with JavaScript rendering
  - 404s: Automatically skipped after first failure

## Troubleshooting

### Playwright Not Available
If you see "Playwright not available" warnings:
```bash
pip install playwright
python -m playwright install chromium
```

### Still Getting 403 Errors
- Check that User-Agent is current
- Verify headers are being sent correctly
- Consider increasing rate limits further for problematic domains

### SPA Sites Still Returning Minimal Content
- Verify Playwright is installed and working
- Check that `is_spa_site()` is detecting the site correctly
- Review selectors in `SCRAPER_CONFIGS` for the domain

## Configuration

### Adjusting Rate Limits
Edit `DOMAIN_RATE_LIMITS` in `scripts/enrichment/bill_scraper.py`:
```python
DOMAIN_RATE_LIMITS = {
    'www.capitol.hawaii.gov': 10.0,  # Increase for more conservative scraping
    # ...
}
```

### Adding New SPA Sites
1. Add domain to `SPA_DOMAINS` set in `scripts/enrichment/bill_scraper.py`
2. Update `SCRAPER_CONFIGS` with `requires_js: true`
3. Add appropriate selectors for the rendered content

## Notes

- **Hawaii**: User explicitly requested very long delays (10 seconds) - data quality over speed
- **Playwright**: Only used for SPA sites, regular sites still use `requests` (faster, cheaper)
- **404 Handling**: Domains are marked to skip after first 404 to avoid wasting time
- **Error Categorization**: Helps identify patterns and prioritize fixes
