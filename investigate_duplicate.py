#!/usr/bin/env python3
"""
Investigate duplicate key violation for reform 5567
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Load environment variables
load_dotenv()

# Get database URL
db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

# Connect to database
conn = psycopg2.connect(db_url)
cursor = conn.cursor(cursor_factory=RealDictCursor)

print("=" * 80)
print("INVESTIGATING DUPLICATE KEY VIOLATION FOR REFORM 5567")
print("=" * 80)
print()

# The constraint violation was:
# place_id=1771, reform_type_id=1, adoption_date=2025-02-07, status='Adopted'

# 1. Get the existing reform that already has this combination
print("1. EXISTING REFORM WITH THIS COMBINATION:")
print("-" * 80)
cursor.execute("""
    SELECT r.*,
           p.name as place_name,
           p.place_type,
           p.state_code,
           rt.code as reform_type_code,
           rt.name as reform_type_name,
           pd.title as policy_doc_title,
           pd.reference_number as policy_doc_ref
    FROM reforms r
    JOIN places p ON r.place_id = p.id
    JOIN reform_types rt ON r.reform_type_id = rt.id
    LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
    WHERE r.place_id = 1771
      AND r.reform_type_id = 1
      AND r.adoption_date = '2025-02-07'
      AND r.status = 'Adopted'
    ORDER BY r.id
""")

existing_reforms = cursor.fetchall()
for i, reform in enumerate(existing_reforms, 1):
    print(f"\nExisting Reform #{i}:")
    print(f"  ID: {reform['id']}")
    print(f"  Place: {reform['place_name']} ({reform['place_type']}, {reform['state_code']})")
    print(f"  Reform Type: {reform['reform_type_code']} - {reform['reform_type_name']}")
    print(f"  Status: {reform['status']}")
    print(f"  Adoption Date: {reform['adoption_date']}")
    print(f"  Summary: {reform['summary']}")
    print(f"  Scope: {reform['scope']}")
    print(f"  Land Use: {reform['land_use']}")
    print(f"  Policy Doc: {reform['policy_doc_title']} ({reform['policy_doc_ref']})")
    print(f"  Link URL: {reform['link_url']}")
    print(f"  Legislative Number: {reform['legislative_number']}")
    print(f"  Created At: {reform['created_at']}")
    print(f"  Updated At: {reform['updated_at']}")
    if reform.get('ai_enriched_fields'):
        print(f"  AI Enriched: Yes (version {reform.get('ai_enrichment_version')})")
    else:
        print(f"  AI Enriched: No")
    
    # Get sources for this reform
    cursor.execute("""
        SELECT s.name, s.short_name, rs.reporter, rs.source_url, rs.is_primary
        FROM reform_sources rs
        JOIN sources s ON rs.source_id = s.id
        WHERE rs.reform_id = %s
        ORDER BY rs.is_primary DESC, s.name
    """, (reform['id'],))
    sources = cursor.fetchall()
    if sources:
        print(f"  Sources:")
        for src in sources:
            primary = " (PRIMARY)" if src['is_primary'] else ""
            print(f"    - {src['name']} ({src['short_name']}){primary}")
            if src['source_url']:
                print(f"      URL: {src['source_url']}")

print("\n" + "=" * 80)
print("2. REFORM 5567 (THE ONE THAT FAILED):")
print("-" * 80)

# 2. Get reform 5567
cursor.execute("""
    SELECT r.*,
           p.name as place_name,
           p.place_type,
           p.state_code,
           rt.code as reform_type_code,
           rt.name as reform_type_name,
           pd.title as policy_doc_title,
           pd.reference_number as policy_doc_ref
    FROM reforms r
    JOIN places p ON r.place_id = p.id
    JOIN reform_types rt ON r.reform_type_id = rt.id
    LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
    WHERE r.id = 5567
""")

reform_5567 = cursor.fetchone()
if reform_5567:
    print(f"\nReform 5567:")
    print(f"  ID: {reform_5567['id']}")
    print(f"  Place: {reform_5567['place_name']} ({reform_5567['place_type']}, {reform_5567['state_code']})")
    print(f"  Current Reform Type: {reform_5567['reform_type_code']} - {reform_5567['reform_type_name']}")
    print(f"  Status: {reform_5567['status']}")
    print(f"  Adoption Date: {reform_5567['adoption_date']}")
    print(f"  Summary: {reform_5567['summary']}")
    print(f"  Scope: {reform_5567['scope']}")
    print(f"  Land Use: {reform_5567['land_use']}")
    print(f"  Policy Doc: {reform_5567['policy_doc_title']} ({reform_5567['policy_doc_ref']})")
    print(f"  Link URL: {reform_5567['link_url']}")
    print(f"  Legislative Number: {reform_5567['legislative_number']}")
    print(f"  Created At: {reform_5567['created_at']}")
    print(f"  Updated At: {reform_5567['updated_at']}")
    
    # Check what AI enrichment was trying to suggest
    if reform_5567.get('ai_enriched_fields'):
        ai_fields = reform_5567['ai_enriched_fields']
        if isinstance(ai_fields, str):
            ai_fields = json.loads(ai_fields)
        print(f"\n  AI Enrichment Data:")
        if 'fields' in ai_fields:
            if 'reform_type_suggestion' in ai_fields['fields']:
                suggestion = ai_fields['fields']['reform_type_suggestion']
                print(f"    Reform Type Suggestion: {suggestion.get('value')} (confidence: {suggestion.get('confidence')})")
            for key, value in ai_fields['fields'].items():
                if key != 'reform_type_suggestion':
                    print(f"    {key}: {value}")
    else:
        print(f"  AI Enriched: No (was being enriched when error occurred)")
    
    # Get sources for reform 5567
    cursor.execute("""
        SELECT s.name, s.short_name, rs.reporter, rs.source_url, rs.is_primary
        FROM reform_sources rs
        JOIN sources s ON rs.source_id = s.id
        WHERE rs.reform_id = %s
        ORDER BY rs.is_primary DESC, s.name
    """, (reform_5567['id'],))
    sources = cursor.fetchall()
    if sources:
        print(f"\n  Sources:")
        for src in sources:
            primary = " (PRIMARY)" if src['is_primary'] else ""
            print(f"    - {src['name']} ({src['short_name']}){primary}")
            if src['source_url']:
                print(f"      URL: {src['source_url']}")
    
    # Check what reform_type_id=1 is
    cursor.execute("SELECT code, name FROM reform_types WHERE id = 1")
    reform_type_1 = cursor.fetchone()
    if reform_type_1:
        print(f"\n  NOTE: The AI was trying to set reform_type_id to 1")
        print(f"        which is: {reform_type_1['code']} - {reform_type_1['name']}")
else:
    print("Reform 5567 not found!")

print("\n" + "=" * 80)
print("3. COMPARISON:")
print("-" * 80)

if reform_5567 and existing_reforms:
    existing = existing_reforms[0]  # Compare with first existing reform
    print("\nKey Differences/Similarities:")
    print(f"  Place: {'SAME' if reform_5567['place_id'] == existing['place_id'] else 'DIFFERENT'}")
    print(f"    - Reform 5567: {reform_5567['place_name']}")
    print(f"    - Existing: {existing['place_name']}")
    print(f"  Reform Type: {'SAME' if reform_5567['reform_type_id'] == existing['reform_type_id'] else 'DIFFERENT (was trying to change)'}")
    print(f"    - Reform 5567 current: {reform_5567['reform_type_code']}")
    print(f"    - Existing: {existing['reform_type_code']}")
    print(f"    - Reform 5567 was trying to change to: {reform_type_1['code'] if reform_type_1 else 'N/A'}")
    print(f"  Status: {'SAME' if reform_5567['status'] == existing['status'] else 'DIFFERENT'}")
    print(f"    - Reform 5567: {reform_5567['status']}")
    print(f"    - Existing: {existing['status']}")
    print(f"  Adoption Date: {'SAME' if str(reform_5567['adoption_date']) == str(existing['adoption_date']) else 'DIFFERENT'}")
    print(f"    - Reform 5567: {reform_5567['adoption_date']}")
    print(f"    - Existing: {existing['adoption_date']}")
    print(f"  Link URL: {'SAME' if reform_5567['link_url'] == existing['link_url'] else 'DIFFERENT'}")
    print(f"    - Reform 5567: {reform_5567['link_url']}")
    print(f"    - Existing: {existing['link_url']}")
    print(f"  Policy Document: {'SAME' if reform_5567['policy_document_id'] == existing['policy_document_id'] else 'DIFFERENT'}")
    print(f"    - Reform 5567: {reform_5567['policy_doc_ref']}")
    print(f"    - Existing: {existing['policy_doc_ref']}")

print("\n" + "=" * 80)
print("4. ALL REFORMS FOR THIS PLACE (place_id=1771):")
print("-" * 80)

cursor.execute("""
    SELECT r.id, r.reform_type_id, rt.code as reform_type_code, rt.name as reform_type_name,
           r.status, r.adoption_date, r.link_url, pd.reference_number
    FROM reforms r
    JOIN reform_types rt ON r.reform_type_id = rt.id
    LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
    WHERE r.place_id = 1771
    ORDER BY r.adoption_date DESC NULLS LAST, r.id
""")

all_reforms = cursor.fetchall()
print(f"\nTotal reforms for this place: {len(all_reforms)}")
for r in all_reforms:
    marker = " <-- REFORM 5567" if r['id'] == 5567 else " <-- EXISTING (causes conflict)" if r['id'] in [x['id'] for x in existing_reforms] else ""
    print(f"  ID {r['id']}: {r['reform_type_code']} | {r['status']} | {r['adoption_date']} | {r['link_url'] or r['reference_number']}{marker}")

conn.close()
