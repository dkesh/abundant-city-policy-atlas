-- Quick diagnostic query to check advocacy organization data
-- Run this to verify if Austin has organizations linked

-- Check if Austin place exists
SELECT id, name, place_type, state_code 
FROM places 
WHERE name ILIKE '%austin%' AND state_code = 'TX';

-- Check if organizations exist
SELECT id, name 
FROM advocacy_organizations 
WHERE name ILIKE '%austin%';

-- Check place mappings for Austin
SELECT 
  ao.name as org_name,
  p.name as place_name,
  p.place_type,
  p.state_code
FROM advocacy_organizations ao
JOIN advocacy_organization_places aop ON ao.id = aop.advocacy_organization_id
JOIN places p ON aop.place_id = p.id
WHERE p.name ILIKE '%austin%' OR ao.name ILIKE '%austin%';
