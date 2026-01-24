"""
AI Bill Assessment Service
Assesses whether a bill is worth tracking based on relevance to urbanist reforms.
"""

import os
import sys
import json
import logging
from typing import Dict, Optional, Any

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.enrichment.ai_providers import get_ai_provider, parse_json_response

logger = logging.getLogger(__name__)

# System prompt for bill assessment
ASSESSMENT_SYSTEM_PROMPT = """You are an expert policy analyst specializing in urban planning, housing, and transportation reform legislation. 
Your task is to assess whether a legislative bill is relevant to urbanist reform topics and worth tracking in our database.

Urbanist reform topics include:
- Parking reform (eliminating or reducing parking minimums)
- Housing reform (ADUs, missing middle housing, upzoning, etc.)
- Zoning reform (form-based codes, TOD, YIMBY, etc.)
- Transit and transportation reform
- Building code reform
- Permitting and process reform
- Land use and density reform

Return a probability score (0.0 to 1.0) indicating how likely the bill is to be relevant to these topics."""

ASSESSMENT_USER_PROMPT_TEMPLATE = """Analyze this legislative bill and assess whether it is worth tracking in our urbanist reform database.

URL: {url}
Domain: {domain}

Bill Text (first 10000 characters):
{bill_text_preview}

Bill Title: {title}

Assess whether this bill relates to urbanist reform topics such as:
- Parking reform (parking minimums, parking requirements)
- Housing reform (ADUs, missing middle, upzoning, density)
- Zoning reform (form-based codes, TOD, YIMBY, mixed-use)
- Transit and transportation
- Building codes
- Permitting processes
- Land use and density

Return your assessment as JSON with this structure:
{{
  "worth_tracking": true or false,
  "probability": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this bill is or isn't relevant",
  "reform_type_suggestions": ["parking:off-street_mandates", "housing:adu", ...],
  "confidence": "HIGH|MEDIUM|LOW"
}}

Only suggest reform types if you're confident the bill relates to them. Leave reform_type_suggestions as an empty array if uncertain."""


def assess_bill_relevance(
    bill_text: str,
    url: str,
    title: Optional[str] = None,
    domain: Optional[str] = None,
    metadata: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Assess whether a bill is worth tracking based on relevance to urbanist reforms.
    
    Args:
        bill_text: Full or partial bill text
        url: Bill URL
        title: Optional bill title
        domain: Optional domain name (extracted from URL if not provided)
        metadata: Optional additional metadata
    
    Returns:
        Dict with:
        - worth_tracking: bool
        - probability: float (0.0 to 1.0)
        - reasoning: str
        - reform_type_suggestions: List[str]
        - confidence: str
    """
    if not bill_text or len(bill_text.strip()) < 100:
        logger.warning(f"Insufficient bill text for assessment: {len(bill_text) if bill_text else 0} chars")
        return {
            "worth_tracking": False,
            "probability": 0.0,
            "reasoning": "Insufficient bill text to assess relevance",
            "reform_type_suggestions": [],
            "confidence": "LOW"
        }
    
    try:
        # Extract domain if not provided
        if not domain:
            from scripts.enrichment.utils import get_domain
            domain = get_domain(url) or "unknown"
        
        # Get AI provider
        ai_provider = get_ai_provider(os.getenv('AI_PROVIDER', 'anthropic'))
        
        # Truncate bill text to avoid token limits (keep first 10000 chars)
        bill_text_preview = bill_text[:10000]
        if len(bill_text) > 10000:
            bill_text_preview += "\n\n[... content truncated ...]"
        
        # Build prompt
        prompt = ASSESSMENT_USER_PROMPT_TEMPLATE.format(
            url=url,
            domain=domain,
            bill_text_preview=bill_text_preview,
            title=title or "(no title available)"
        )
        
        # Call AI
        logger.info(f"Assessing bill relevance for {domain}")
        response = ai_provider.complete(prompt, system_prompt=ASSESSMENT_SYSTEM_PROMPT, max_tokens=2048)
        
        # Parse response
        assessment_data = parse_json_response(response['content'])
        
        if not assessment_data:
            logger.warning(f"Failed to parse AI assessment response for {url}")
            return {
                "worth_tracking": False,
                "probability": 0.0,
                "reasoning": "Failed to parse AI assessment",
                "reform_type_suggestions": [],
                "confidence": "LOW"
            }
        
        # Validate and normalize response
        result = {
            "worth_tracking": bool(assessment_data.get("worth_tracking", False)),
            "probability": float(assessment_data.get("probability", 0.0)),
            "reasoning": str(assessment_data.get("reasoning", "")),
            "reform_type_suggestions": assessment_data.get("reform_type_suggestions", []),
            "confidence": assessment_data.get("confidence", "MEDIUM")
        }
        
        # Clamp probability to 0.0-1.0
        result["probability"] = max(0.0, min(1.0, result["probability"]))
        
        # Validate reform_type_suggestions is a list
        if not isinstance(result["reform_type_suggestions"], list):
            result["reform_type_suggestions"] = []
        
        logger.info(f"Assessment complete for {domain}: worth_tracking={result['worth_tracking']}, probability={result['probability']:.2f}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error assessing bill relevance for {url}: {e}", exc_info=True)
        return {
            "worth_tracking": False,
            "probability": 0.0,
            "reasoning": f"Error during assessment: {str(e)}",
            "reform_type_suggestions": [],
            "confidence": "LOW"
        }


def should_track_bill(assessment_result: Dict[str, Any], threshold: float = 0.5) -> bool:
    """
    Determine if a bill should be tracked based on assessment result.
    
    Args:
        assessment_result: Result from assess_bill_relevance()
        threshold: Probability threshold (default 0.5)
    
    Returns:
        bool: True if bill should be tracked
    """
    if not assessment_result:
        return False
    
    # Use worth_tracking flag if available, otherwise use probability
    if "worth_tracking" in assessment_result:
        return assessment_result["worth_tracking"]
    
    return assessment_result.get("probability", 0.0) >= threshold
