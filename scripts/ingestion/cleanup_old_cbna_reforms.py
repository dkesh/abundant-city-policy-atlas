#!/usr/bin/env python3
"""
Clean up old CBNA reforms that were incorrectly classified as 'other:general'.
These should be deleted since we now have correctly classified versions.
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

load_dotenv()

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL not set')
    sys.exit(1)

conn = psycopg2.connect(db_url)
cursor = conn.cursor(cursor_factory=RealDictCursor)

try:
    # Find old CBNA reforms with other:general
    cursor.execute("""
        SELECT 
            r.id,
            p.name as place_name,
            p.place_type,
            rt.code as reform_type_code
        FROM reform_sources rs
        JOIN reforms r ON rs.reform_id = r.id
        JOIN places p ON r.place_id = p.id
        JOIN reform_types rt ON r.reform_type_id = rt.id
        WHERE rs.source_id = (SELECT id FROM sources WHERE short_name = 'CBNA')
        AND rt.code = 'other:general'
    """)
    
    old_reforms = cursor.fetchall()
    
    if not old_reforms:
        print("No old CBNA reforms found to clean up.")
        conn.close()
        sys.exit(0)
    
    print(f"Found {len(old_reforms)} old CBNA reforms with 'other:general' classification.")
    print("\nThese will be deleted:")
    for reform in old_reforms[:10]:  # Show first 10
        print(f"  Reform ID {reform['id']}: {reform['place_name']} ({reform['place_type']})")
    if len(old_reforms) > 10:
        print(f"  ... and {len(old_reforms) - 10} more")
    
    # Ask for confirmation (or use command line argument)
    if len(sys.argv) > 1 and sys.argv[1] == '--yes':
        response = 'yes'
    else:
        response = input(f"\nDelete {len(old_reforms)} old CBNA reforms? (yes/no): ")
    if response.lower() != 'yes':
        print("Cancelled.")
        conn.close()
        sys.exit(0)
    
    # Delete the old reforms
    # Note: This will cascade delete reform_sources entries due to ON DELETE CASCADE
    reform_ids = [r['id'] for r in old_reforms]
    
    cursor.execute("""
        DELETE FROM reforms
        WHERE id = ANY(%s)
    """, (reform_ids,))
    
    deleted_count = cursor.rowcount
    conn.commit()
    
    print(f"\n✓ Successfully deleted {deleted_count} old CBNA reforms.")
    
    # Verify cleanup
    cursor.execute("""
        SELECT COUNT(*) as count
        FROM reform_sources rs
        JOIN reforms r ON rs.reform_id = r.id
        JOIN reform_types rt ON r.reform_type_id = rt.id
        WHERE rs.source_id = (SELECT id FROM sources WHERE short_name = 'CBNA')
        AND rt.code = 'other:general'
    """)
    remaining = cursor.fetchone()['count']
    
    if remaining == 0:
        print("✓ Verification: No 'other:general' CBNA reforms remain.")
    else:
        print(f"⚠ Warning: {remaining} 'other:general' CBNA reforms still remain.")
    
    # Show current CBNA reform distribution
    cursor.execute("""
        SELECT 
            rt.code,
            rt.name,
            COUNT(*) as count
        FROM reform_sources rs
        JOIN reforms r ON rs.reform_id = r.id
        JOIN reform_types rt ON r.reform_type_id = rt.id
        WHERE rs.source_id = (SELECT id FROM sources WHERE short_name = 'CBNA')
        GROUP BY rt.code, rt.name
        ORDER BY count DESC
    """)
    
    print("\nCurrent CBNA reform distribution:")
    for row in cursor.fetchall():
        print(f"  {row['code']}: {row['name']} - {row['count']} reforms")
    
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
    sys.exit(1)
finally:
    conn.close()
