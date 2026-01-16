"""
Bill Data Extractor
Extracts structured data (dates, votes, sponsors, history) from bill HTML.
"""

import re
import logging
from datetime import datetime
from typing import Optional, Dict, List, Any
from bs4 import BeautifulSoup

from scripts.enrichment.utils import parse_flexible_date

logger = logging.getLogger(__name__)

# Common date label patterns
DATE_LABEL_PATTERNS = {
    'filed': [r'filed', r'filing', r'pre-filed', r'prefiled'],
    'introduced': [r'introduced', r'introduction', r'first reading'],
    'passed_first_chamber': [r'passed.*house', r'passed.*assembly', r'passed.*senate', r'third reading.*house', r'third reading.*assembly'],
    'passed_second_chamber': [r'passed.*senate', r'passed.*house', r'concurrence', r'concurred'],
    'adopted': [r'adopted', r'enacted', r'approved'],
    'signed': [r'signed', r'governor.*sign', r'executive.*sign'],
    'effective': [r'effective', r'becomes.*law', r'takes.*effect']
}

# Vote count patterns
VOTE_PATTERNS = [
    r'(\d+)\s*[-–—]\s*(\d+)',  # "45 - 12" or "45–12"
    r'(\d+)\s*yes.*?(\d+)\s*no',  # "45 yes, 12 no"
    r'(\d+)\s*for.*?(\d+)\s*against',  # "45 for, 12 against"
    r'yeas[:\s]+(\d+).*?nays[:\s]+(\d+)',  # "Yeas: 45, Nays: 12"
    r'ayes[:\s]+(\d+).*?noes[:\s]+(\d+)',  # "Ayes: 45, Noes: 12"
]


# parse_flexible_date is now imported from scripts.enrichment.utils


def extract_dates_from_text(text: str) -> Dict[str, Optional[datetime]]:
    """Extract dates from text using pattern matching."""
    dates = {}
    text_lower = text.lower()
    
    for date_type, patterns in DATE_LABEL_PATTERNS.items():
        for pattern in patterns:
            # Look for pattern followed by date
            regex = rf'{pattern}[:\s]+([^\n]+?)(?:\n|$)'
            matches = re.finditer(regex, text_lower, re.IGNORECASE | re.MULTILINE)
            for match in matches:
                date_str = match.group(1).strip()
                parsed_date = parse_flexible_date(date_str)
                if parsed_date:
                    dates[date_type] = parsed_date
                    break
            if date_type in dates:
                break
    
    return dates


def extract_dates_from_table(soup: BeautifulSoup) -> Dict[str, Optional[datetime]]:
    """Extract dates from HTML tables (common in legislative sites)."""
    dates = {}
    
    # Look for tables with date information
    tables = soup.find_all('table')
    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True).lower()
                value = cells[1].get_text(strip=True)
                
                # Check if label matches a date type
                for date_type, patterns in DATE_LABEL_PATTERNS.items():
                    for pattern in patterns:
                        if re.search(pattern, label, re.IGNORECASE):
                            parsed_date = parse_flexible_date(value)
                            if parsed_date:
                                dates[date_type] = parsed_date
                                break
    
    return dates


def extract_structured_dates(html_content: str, url: str) -> Dict[str, Optional[datetime]]:
    """
    Extract structured dates from bill HTML.
    
    Returns:
        Dict with keys: filed, introduced, passed_first_chamber, passed_second_chamber,
                       adopted, signed, effective
    """
    if not html_content:
        return {}
    
    soup = BeautifulSoup(html_content, 'html.parser')
    dates = {}
    
    # Try extracting from tables first (more structured)
    table_dates = extract_dates_from_table(soup)
    dates.update(table_dates)
    
    # Also try extracting from text
    text = soup.get_text()
    text_dates = extract_dates_from_text(text)
    
    # Merge, preferring table dates
    for key, value in text_dates.items():
        if key not in dates and value:
            dates[key] = value
    
    return dates


def extract_vote_counts(html_content: str, url: str) -> Dict[str, Dict[str, int]]:
    """
    Extract vote counts from bill HTML.
    
    Returns:
        Dict with structure:
        {
            "first_chamber": {"yes": 45, "no": 12, "abstain": 0},
            "second_chamber": {"yes": 38, "no": 15, "abstain": 2},
            "final": {"yes": 45, "no": 12}
        }
    """
    if not html_content:
        return {}
    
    votes = {}
    soup = BeautifulSoup(html_content, 'html.parser')
    text = soup.get_text()
    
    # Look for vote tables
    tables = soup.find_all('table')
    for table in tables:
        # Check if table contains vote information
        table_text = table.get_text().lower()
        if any(keyword in table_text for keyword in ['vote', 'yea', 'nay', 'yes', 'no', 'for', 'against']):
            rows = table.find_all('tr')
            for row in rows:
                cells = [cell.get_text(strip=True) for cell in row.find_all(['td', 'th'])]
                if len(cells) >= 2:
                    # Try to extract vote counts
                    for pattern in VOTE_PATTERNS:
                        match = re.search(pattern, ' '.join(cells), re.IGNORECASE)
                        if match:
                            yes_count = int(match.group(1))
                            no_count = int(match.group(2))
                            
                            # Determine chamber from context
                            row_text = ' '.join(cells).lower()
                            if 'senate' in row_text or 'upper' in row_text:
                                chamber = 'second_chamber' if 'second_chamber' in votes else 'first_chamber'
                            elif 'house' in row_text or 'assembly' in row_text or 'lower' in row_text:
                                chamber = 'first_chamber'
                            else:
                                chamber = 'final'
                            
                            votes[chamber] = {
                                'yes': yes_count,
                                'no': no_count,
                                'abstain': 0
                            }
                            break
    
    # Also try pattern matching in text
    if not votes:
        for pattern in VOTE_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                yes_count = int(match.group(1))
                no_count = int(match.group(2))
                votes['final'] = {
                    'yes': yes_count,
                    'no': no_count,
                    'abstain': 0
                }
                break
    
    return votes


def extract_sponsors(html_content: str, url: str) -> List[str]:
    """Extract sponsor names from bill HTML."""
    if not html_content:
        return []
    
    sponsors = []
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Look for sponsor sections
    sponsor_keywords = ['sponsor', 'author', 'introduced by', 'by']
    for keyword in sponsor_keywords:
        # Find elements containing sponsor keyword
        elements = soup.find_all(string=re.compile(keyword, re.IGNORECASE))
        for elem in elements:
            parent = elem.parent
            if parent:
                # Get text from parent or siblings
                text = parent.get_text()
                # Extract names (simple heuristic: capitalize words after "by" or "sponsor")
                match = re.search(rf'{keyword}[:\s]+([^\n]+)', text, re.IGNORECASE)
                if match:
                    sponsor_text = match.group(1).strip()
                    # Split by common delimiters
                    names = re.split(r'[,;]|\sand\s', sponsor_text)
                    sponsors.extend([name.strip() for name in names if name.strip()])
    
    # Also check for sponsor tables
    tables = soup.find_all('table')
    for table in tables:
        table_text = table.get_text().lower()
        if 'sponsor' in table_text or 'author' in table_text:
            rows = table.find_all('tr')
            for row in rows:
                cells = [cell.get_text(strip=True) for cell in row.find_all(['td', 'th'])]
                if len(cells) >= 2:
                    label = cells[0].lower()
                    if 'sponsor' in label or 'author' in label:
                        sponsors.append(cells[1])
    
    # Deduplicate and clean
    sponsors = list(set([s for s in sponsors if len(s) > 2 and len(s) < 100]))
    return sponsors[:20]  # Limit to 20 sponsors


def extract_legislative_history(html_content: str, url: str) -> List[Dict[str, Any]]:
    """
    Extract legislative history/timeline from bill HTML.
    
    Returns:
        List of dicts with keys: date, action, chamber, description
    """
    if not html_content:
        return []
    
    history = []
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Look for history/timeline sections
    history_keywords = ['history', 'timeline', 'actions', 'status', 'progress']
    for keyword in history_keywords:
        # Find sections with history
        sections = soup.find_all(['div', 'section'], class_=re.compile(keyword, re.IGNORECASE))
        sections.extend(soup.find_all(['div', 'section'], id=re.compile(keyword, re.IGNORECASE)))
        
        for section in sections:
            # Look for list items or table rows
            items = section.find_all(['li', 'tr'])
            for item in items:
                text = item.get_text(strip=True)
                # Try to extract date and action
                date_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', text)
                if date_match:
                    date_str = date_match.group(1)
                    parsed_date = parse_flexible_date(date_str)
                    if parsed_date:
                        # Extract action (text after date)
                        action_text = text[date_match.end():].strip()
                        history.append({
                            'date': parsed_date.isoformat(),
                            'action': action_text[:200],  # Limit length
                            'chamber': None,  # Could be enhanced to detect chamber
                            'description': text[:500]
                        })
    
    # Sort by date
    history.sort(key=lambda x: x['date'])
    return history[:50]  # Limit to 50 entries


def extract_full_bill_text(html_content: str, url: str) -> str:
    """
    Extract full bill text from HTML.
    This is a fallback - the main bill_scraper.py should handle this.
    """
    if not html_content:
        return ''
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove script and style elements
    for script in soup(["script", "style", "nav", "header", "footer"]):
        script.decompose()
    
    # Get text
    text = soup.get_text(separator='\n', strip=True)
    
    # Clean up excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text
