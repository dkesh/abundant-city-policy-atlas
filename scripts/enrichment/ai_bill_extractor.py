"""
AI-Powered Bill Data Extractor
Uses AI to extract structured data from bill HTML when no scraper config exists.
"""

import os
import sys
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.enrichment.ai_providers import get_ai_provider, parse_json_response
from scripts.enrichment.bill_data_extractor import (
    extract_structured_dates,
    extract_vote_counts,
    extract_sponsors,
    extract_legislative_history
)

logger = logging.getLogger(__name__)

# System prompt for AI extraction
EXTRACTION_SYSTEM_PROMPT = """You are an expert at extracting structured data from legislative bill web pages. 
Your task is to analyze HTML content and extract:
1. Legislative dates (filed, introduced, passed, signed, effective)
2. Vote counts (yes/no/abstain for each chamber)
3. Sponsor names
4. Legislative history/timeline
5. Committee information

Return your findings as structured JSON. Be precise and only include data you can clearly identify."""

EXTRACTION_USER_PROMPT_TEMPLATE = """Analyze this legislative bill web page and extract structured data.

URL: {url}
Domain: {domain}

HTML Content (first 50000 characters):
{html_preview}

Extract the following information and return as JSON:

{{
  "dates": {{
    "filed": "YYYY-MM-DD or null",
    "introduced": "YYYY-MM-DD or null",
    "passed_first_chamber": "YYYY-MM-DD or null",
    "passed_second_chamber": "YYYY-MM-DD or null",
    "adopted": "YYYY-MM-DD or null",
    "signed": "YYYY-MM-DD or null",
    "effective": "YYYY-MM-DD or null"
  }},
  "votes": {{
    "first_chamber": {{
      "yes": number or null,
      "no": number or null,
      "abstain": number or null
    }},
    "second_chamber": {{
      "yes": number or null,
      "no": number or null,
      "abstain": number or null
    }},
    "final": {{
      "yes": number or null,
      "no": number or null,
      "abstain": number or null
    }}
  }},
  "sponsors": ["name1", "name2", ...],
  "committees": ["committee1", "committee2", ...],
  "legislative_history": [
    {{
      "date": "YYYY-MM-DD",
      "action": "action description",
      "chamber": "House|Senate|Assembly|General or null",
      "description": "full description"
    }}
  ],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of extraction method"
}}

Focus on finding:
- Date fields in tables, headers, or text
- Vote tallies in tables or status sections
- Sponsor information in author/sponsor sections
- Action history in timeline or history sections
"""


def extract_with_ai(html_content: str, url: str, domain: str) -> Dict[str, Any]:
    """
    Use AI to extract structured bill data from HTML.
    
    Args:
        html_content: Full HTML content of the bill page
        url: Original URL
        domain: Domain name
    
    Returns:
        Dict with extracted structured data
    """
    if not html_content:
        logger.warning(f"No HTML content provided for {url}")
        return {}
    
    try:
        # Get AI provider
        ai_provider = get_ai_provider(os.getenv('AI_PROVIDER', 'anthropic'))
        
        # Truncate HTML to avoid token limits (keep first 50000 chars)
        html_preview = html_content[:50000]
        if len(html_content) > 50000:
            html_preview += "\n\n[... content truncated ...]"
        
        # Build prompt
        prompt = EXTRACTION_USER_PROMPT_TEMPLATE.format(
            url=url,
            domain=domain,
            html_preview=html_preview
        )
        
        # Call AI
        logger.info(f"Using AI to extract structured data from {domain}")
        response = ai_provider.complete(prompt, system_prompt=EXTRACTION_SYSTEM_PROMPT, max_tokens=4096)
        
        # Parse response
        extracted_data = parse_json_response(response['content'])
        
        if not extracted_data:
            logger.warning(f"Failed to parse AI extraction response for {url}")
            return {}
        
        # Validate and clean data
        result = {
            'dates': {},
            'votes': {},
            'sponsors': [],
            'committees': [],
            'legislative_history': [],
            'extraction_method': 'ai',
            'extraction_confidence': extracted_data.get('confidence', 0.5),
            'extraction_reasoning': extracted_data.get('reasoning', '')
        }
        
        # Process dates
        dates = extracted_data.get('dates', {})
        for date_key in ['filed', 'introduced', 'passed_first_chamber', 'passed_second_chamber', 
                        'adopted', 'signed', 'effective']:
            date_value = dates.get(date_key)
            if date_value and date_value != 'null':
                result['dates'][date_key] = date_value
        
        # Process votes
        votes = extracted_data.get('votes', {})
        for chamber in ['first_chamber', 'second_chamber', 'final']:
            if chamber in votes:
                chamber_votes = votes[chamber]
                if isinstance(chamber_votes, dict):
                    result['votes'][chamber] = {
                        'yes': chamber_votes.get('yes'),
                        'no': chamber_votes.get('no'),
                        'abstain': chamber_votes.get('abstain', 0)
                    }
        
        # Process sponsors
        sponsors = extracted_data.get('sponsors', [])
        if isinstance(sponsors, list):
            result['sponsors'] = [s for s in sponsors if isinstance(s, str) and len(s) > 2][:20]
        
        # Process committees
        committees = extracted_data.get('committees', [])
        if isinstance(committees, list):
            result['committees'] = [c for c in committees if isinstance(c, str) and len(c) > 2][:20]
        
        # Process legislative history
        history = extracted_data.get('legislative_history', [])
        if isinstance(history, list):
            result['legislative_history'] = [
                h for h in history 
                if isinstance(h, dict) and 'date' in h and 'action' in h
            ][:50]
        
        logger.info(f"AI extraction complete for {domain}: {len(result['sponsors'])} sponsors, "
                   f"{len(result['dates'])} dates, {len(result['votes'])} vote records")
        
        return result
        
    except Exception as e:
        logger.error(f"AI extraction failed for {url}: {e}", exc_info=True)
        return {}


def extract_bill_data_with_fallback(html_content: str, url: str, domain: str, 
                                     use_ai_fallback: bool = True) -> Dict[str, Any]:
    """
    Extract structured bill data using scraper first, AI fallback if needed.
    
    Args:
        html_content: HTML content of bill page
        url: Original URL
        domain: Domain name
        use_ai_fallback: Whether to use AI if scraper extraction fails
    
    Returns:
        Dict with extracted structured data
    """
    # Try rule-based extraction first
    try:
        dates = extract_structured_dates(html_content, url)
        votes = extract_vote_counts(html_content, url)
        sponsors = extract_sponsors(html_content, url)
        history = extract_legislative_history(html_content, url)
        
        # If we got substantial data, use it
        if dates or votes or sponsors or history:
            logger.info(f"Rule-based extraction successful for {domain}")
            return {
                'dates': dates,
                'votes': votes,
                'sponsors': sponsors,
                'committees': [],  # Not extracted by rule-based
                'legislative_history': history,
                'extraction_method': 'scraper'
            }
    except Exception as e:
        logger.warning(f"Rule-based extraction failed for {domain}: {e}")
    
    # Fall back to AI if enabled and we didn't get good data
    if use_ai_fallback:
        logger.info(f"Using AI fallback for {domain}")
        return extract_with_ai(html_content, url, domain)
    
    return {
        'dates': {},
        'votes': {},
        'sponsors': [],
        'committees': [],
        'legislative_history': [],
        'extraction_method': 'none'
    }
