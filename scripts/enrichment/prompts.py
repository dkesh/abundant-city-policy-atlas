"""
AI Prompt Templates for Reform Enrichment
"""

ENRICHMENT_PROMPT_TEMPLATE = """
You are analyzing a policy document to extract structured data about an urbanist reform.

## CONTEXT
Place: {place_name}, {state_name}
Reform Type (current): {current_reform_type}
Legislative Number: {legislative_number}
External URL: {link_url}

## DOCUMENT TEXT
{document_text}

## FIELD DEFINITIONS

### reform_type (classification)
Classify parking reforms into one of these categories:
- "parking:eliminated": Complete prohibition/ban on parking minimums. Key indicators:
 * Words: "prohibits", "prohibited", "bans", "banned", "eliminates", "elimination", "repeals", "repealed", "removes", "removed"
 * "may not require", "shall not require", "no parking required", "no minimum", "zero parking"
 * If minimums are BANNED in certain areas, this is elimination (not reduction)
  
- "parking:reduced": Lowered parking requirements that still exist. Key indicators:
 * Words: "reduces", "reduced", "reduction", "lowers", "lowered", "decreases", "decreased"
 * "minimum of X spaces" (where X is a specific number)
 * Requirements still exist but are lower than before

- "parking:unspecified": Use ONLY if genuinely unclear from the text or if the text is about parking issues unrelated to off-street minimums, like street parking.

### scope (array of strings)
Geographic or conditional limitations that narrow where the reform applies.
- Be CONCISE: prefer "Within 0.5 mi of transit" over "Within 0.5 mi of public transportation hub"
- Keep limitation text under 40 characters when possible
- Include exact distances/thresholds from the text when available
- Examples: "Within 0.5 mi of transit", "Downtown district", "High-density zones"
- Use "Citywide" or "Statewide" only if reform truly has no geographic limits

### land_use (array of strings)
Types of development or zoning categories affected.
- Examples: "Residential", "Commercial", "Mixed-use", "Affordable housing", "Senior housing"
- Only include if explicitly stated in text

### requirements (array of strings)
Additional conditions that must be met to use the reform.
- Be CONCISE: keep text under 40 characters when possible
- Examples: "Bicycle parking required", "TDM plan required", "Within 0.25 mi of transit"
- Only include if explicitly stated in text

### summary (string)
A 1-2 sentence user-facing description of what this reform does.
- Focus on the impact for developers/residents
- Be specific about what changed
- Avoid jargon

### key_points (array of strings) - for policy_documents
2-4 bullet points summarizing what the bill does and why it matters.

### analysis (string) - for policy_documents
A paragraph providing deeper context about the bill's impact.

## OUTPUT FORMAT
Return valid JSON with this structure:
{{
  "reform_type_suggestion": {{
    "value": "parking:eliminated",
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }},
  "scope": {{
    "value": ["specific scope 1", "specific scope 2"],
    "confidence": "HIGH|MEDIUM|LOW", 
    "reasoning": "Brief explanation"
  }},
  "land_use": {{
    "value": ["type1", "type2"],
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }},
  "requirements": {{
    "value": ["requirement1"],
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }},
  "summary": {{
    "value": "User-facing summary...",
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }},
  "key_points": {{
    "value": ["Point 1", "Point 2"],
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }},
  "analysis": {{
    "value": "Detailed analysis paragraph...",
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "Brief explanation"
  }}
}}

Only include fields you can confidently populate from the document. Omit fields if the document doesn't contain relevant information.
"""

SYSTEM_PROMPT = """
You are an expert policy analyst specializing in urban planning and housing reform legislation. 
Your task is to extract structured, accurate information from policy documents with high precision.
Be conservative - only extract information that is clearly stated in the document.
"""


def build_enrichment_prompt(
    place_name: str,
    state_name: str,
    current_reform_type: str,
    legislative_number: str,
    link_url: str,
    document_text: str
) -> str:
    """
    Build the enrichment prompt with context.
    
    Args:
        place_name: Name of the place (city/county/state)
        state_name: Name of the state
        current_reform_type: Current reform type code
        legislative_number: Bill/ordinance number
        link_url: URL to the bill
        document_text: Full text of the bill/document
    
    Returns:
        Formatted prompt string
    """
    return ENRICHMENT_PROMPT_TEMPLATE.format(
        place_name=place_name,
        state_name=state_name,
        current_reform_type=current_reform_type,
        legislative_number=legislative_number or "(none)",
        link_url=link_url or "(none)",
        document_text=document_text[:50000]  # Limit to 50k chars to avoid token limits
    )
