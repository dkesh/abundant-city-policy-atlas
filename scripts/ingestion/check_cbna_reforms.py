#!/usr/bin/env python3
"""
Check for CBNA reforms in the database.
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

from scripts.ingestion.db_utils import initialize_environment

# Load environment variables
initialize_environment()

# Get database URL
db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

# Connect to database
conn = psycopg2.connect(db_url)
cursor = conn.cursor(cursor_factory=RealDictCursor)

# Check if CBNA source exists
print('=== Checking for CBNA source ===')
cursor.execute("SELECT id, name, short_name FROM sources WHERE short_name = 'CBNA'")
cbna_source = cursor.fetchone()
if cbna_source:
    print(f'✓ CBNA source found: ID={cbna_source["id"]}, Name={cbna_source["name"]}')
    source_id = cbna_source['id']
else:
    print('✗ CBNA source NOT found in sources table')
    print('\nAll sources in database:')
    cursor.execute('SELECT id, name, short_name FROM sources ORDER BY id')
    for row in cursor.fetchall():
        print(f'  - {row["short_name"]}: {row["name"]} (ID: {row["id"]})')
    conn.close()
    sys.exit(0)

# Check for reforms linked to CBNA
print('\n=== Checking for reforms linked to CBNA ===')
cursor.execute("""
    SELECT COUNT(*) as count
    FROM reform_sources
    WHERE source_id = %s
""", (source_id,))
reform_count = cursor.fetchone()['count']
print(f'Total reforms linked to CBNA: {reform_count}')

if reform_count > 0:
    print('\n=== Sample CBNA reforms ===')
    cursor.execute("""
        SELECT 
            r.id as reform_id,
            p.name as place_name,
            p.place_type,
            tld.state_code,
            tld.state_name,
            rt.code as reform_type_code,
            rt.name as reform_type_name,
            r.status,
            r.adoption_date,
            r.summary,
            rs.source_url,
            rs.notes
        FROM reform_sources rs
        JOIN reforms r ON rs.reform_id = r.id
        JOIN places p ON r.place_id = p.id
        LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
        JOIN reform_types rt ON r.reform_type_id = rt.id
        WHERE rs.source_id = %s
        ORDER BY r.id
        LIMIT 10
    """, (source_id,))
    
    for row in cursor.fetchall():
        print(f"\nReform ID: {row['reform_id']}")
        print(f"  Place: {row['place_name']} ({row['place_type']})")
        print(f"  State: {row['state_name']} ({row['state_code']})")
        print(f"  Reform Type: {row['reform_type_name']} ({row['reform_type_code']})")
        print(f"  Status: {row['status']}")
        print(f"  Adoption Date: {row['adoption_date']}")
        if row['summary']:
            summary_preview = row['summary'][:100] + '...' if len(row['summary']) > 100 else row['summary']
            print(f"  Summary: {summary_preview}")
else:
    print('\n=== Checking recent ingestion logs ===')
    cursor.execute("""
        SELECT 
            ingestion_date,
            source_name,
            records_processed,
            places_created,
            places_updated,
            reforms_created,
            reforms_updated,
            status,
            error_message
        FROM data_ingestion
        WHERE source_name LIKE '%CBNA%' OR source_name LIKE '%centerforbuilding%' OR source_name LIKE '%CBNA%'
        ORDER BY ingestion_date DESC
        LIMIT 5
    """)
    logs = cursor.fetchall()
    if logs:
        print('Recent CBNA ingestion logs:')
        for log in logs:
            print(f"  {log['ingestion_date']}: {log['source_name']} - {log['status']}")
            print(f"    Processed: {log['records_processed']}, Created: {log['reforms_created']}, Updated: {log['reforms_updated']}")
            if log['error_message']:
                print(f"    Error: {log['error_message']}")
    else:
        print('No CBNA ingestion logs found')
        
    # Check if there are any reforms that might have been created but not linked
    print('\n=== Checking for reforms with CBNA-related notes ===')
    cursor.execute("""
        SELECT COUNT(*) as count
        FROM reforms
        WHERE notes LIKE '%Center for Building%' OR notes LIKE '%CBNA%'
    """)
    note_count = cursor.fetchone()['count']
    print(f'Reforms with CBNA in notes: {note_count}')

conn.close()
