#!/usr/bin/env python3
"""
Analyze bill URLs in the database to identify all legislative/municipal sites.
"""

import os
import sys
from urllib.parse import urlparse
from collections import Counter

# Load environment variables from .env file
def load_env_file():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file()

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from scripts.ingestion.db_utils import get_db_connection, close_db_connection
from scripts.enrichment.utils import get_domain
import psycopg2
from psycopg2.extras import RealDictCursor

def main():
    conn, cursor = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get all URLs from reforms and policy_documents
    cursor.execute("""
        SELECT DISTINCT link_url as url
        FROM reforms
        WHERE link_url IS NOT NULL AND link_url != ''
        
        UNION
        
        SELECT DISTINCT document_url as url
        FROM policy_documents
        WHERE document_url IS NOT NULL AND document_url != ''
    """)
    
    urls = cursor.fetchall()
    
    # Extract domains
    domains = []
    domain_urls = {}
    
    for row in urls:
        url = row['url']
        domain = get_domain(url)
        if domain:
            domains.append(domain)
            if domain not in domain_urls:
                domain_urls[domain] = []
            domain_urls[domain].append(url)
    
    # Count domains
    domain_counts = Counter(domains)
    
    print("=" * 80)
    print("BILL URL ANALYSIS")
    print("=" * 80)
    print(f"\nTotal unique URLs: {len(urls)}")
    print(f"Total unique domains: {len(domain_counts)}")
    print("\n" + "=" * 80)
    print("DOMAINS FOUND IN DATABASE (sorted by frequency):")
    print("=" * 80)
    
    for domain, count in domain_counts.most_common():
        print(f"\n{domain} ({count} URLs)")
        # Show a sample URL
        if domain in domain_urls and domain_urls[domain]:
            print(f"  Sample: {domain_urls[domain][0][:100]}...")
    
    print("\n" + "=" * 80)
    print("DOMAINS IN bill_scraper.py:")
    print("=" * 80)
    
    from scripts.enrichment.bill_scraper import SCRAPER_CONFIGS
    configured_domains = list(SCRAPER_CONFIGS.keys())
    for domain in sorted(configured_domains):
        print(f"  - {domain}")
    
    print("\n" + "=" * 80)
    print("COMPARISON:")
    print("=" * 80)
    
    db_domains_set = set(domain_counts.keys())
    configured_domains_set = set(configured_domains)
    
    missing_in_scraper = db_domains_set - configured_domains_set
    extra_in_scraper = configured_domains_set - db_domains_set
    
    if missing_in_scraper:
        print(f"\n⚠️  Domains in database but NOT in scraper ({len(missing_in_scraper)}):")
        for domain in sorted(missing_in_scraper):
            count = domain_counts[domain]
            print(f"  - {domain} ({count} URLs)")
    else:
        print("\n✓ All database domains are configured in scraper")
    
    if extra_in_scraper:
        print(f"\n📝 Domains in scraper but NOT in database ({len(extra_in_scraper)}):")
        for domain in sorted(extra_in_scraper):
            print(f"  - {domain}")
    else:
        print("\n✓ No extra domains in scraper")
    
    print("\n" + "=" * 80)
    
    close_db_connection(conn, cursor)

if __name__ == '__main__':
    main()
