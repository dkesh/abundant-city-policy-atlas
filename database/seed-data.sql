-- ============================================================================
-- SEED DATA
-- Urbanist Reform Map
-- Populates initial reference data: reform types, sources, and US states
-- ============================================================================

-- ============================================================================
-- SEED DATA: Reform Types (Universal)
-- ============================================================================

INSERT INTO reform_types (code, category, name, description, color_hex, icon_name, sort_order) VALUES
  -- PARKING
  ('parking:eliminated', 'Parking', 'Parking Minimums Eliminated', 'Completely eliminated parking minimum requirements', '#27ae60', 'ban', 10),
  ('parking:reduced', 'Parking', 'Parking Minimums Reduced', 'Reduced parking minimum requirements', '#2ecc71', 'minus-circle', 11),
  ('parking:unspecified', 'Parking', 'Parking: unspecified', 'Parking policy changes', '#27ae60', 'car', 12),
  -- HOUSING TYPOLOGY
  ('housing:adu', 'Housing Typology', 'ADU', 'Accessory Dwelling Unit reforms', '#3498db', 'home', 20),
  ('housing:plex', 'Housing Typology', 'Plex', 'Duplexes, triplexes, 4-plexes', '#9b59b6', 'th-large', 21),
  -- ZONING CATEGORY
  ('zoning:ricz', 'Zoning Category', 'RICZ', 'Reform Income Community Zoning reforms', '#2980b9', 'map', 30),
  ('zoning:yigby', 'Zoning Category', 'YIGBY', 'Yes In God''s Backyard reforms', '#3498db', 'church', 31),
  ('zoning:tod', 'Zoning Category', 'TOD Upzones', 'Transit-oriented development reforms', '#2980b9', 'subway', 32),
  -- PHYSICAL DIMENSION
  ('physical:lot_size', 'Physical Dimension', 'Lot Size', 'Minimum lot size reforms', '#16a085', 'ruler-combined', 40),
  ('physical:height', 'Physical Dimension', 'Height Limits', 'Building height limit reforms', '#34495e', 'arrow-up', 41),
  ('physical:far', 'Physical Dimension', 'Floor Area Ratio', 'FAR regulations', '#d35400', 'expand', 42),
  -- PROCESS
  ('process:permitting', 'Process', 'Permitting Process', 'Permitting process streamlining', '#2c3e50', 'clipboard-check', 50),
  ('process:courts_appeals', 'Process', 'Courts & Appeals', 'Court and appeals process reforms', '#8e44ad', 'gavel', 51),
  ('process:planning_obligations', 'Process', 'Planning Obligations', 'Planning obligation reforms', '#f39c12', 'file-contract', 52),
  -- BUILDING CODE
  ('building:stairwells', 'Building Code', 'Stairwells', 'Stairwell reforms', '#95a5a6', 'stream', 60),
  ('building:elevators', 'Building Code', 'Elevators', 'Elevator-related code reforms', '#7f8c8d', 'arrow-up', 61),
  ('building:unspecified', 'Building Code', 'Building Code: Unspecified', 'Building code reforms', '#95a5a6', 'building', 62),
  -- OTHER
  ('other:general', 'Other', 'Other Reform', 'Other zoning or land use reforms', '#7f8c8d', 'question-circle', 90),
  ('other:land_value_tax', 'Other', 'Land Value Tax', 'Land value tax reforms', '#27ae60', 'dollar-sign', 91),
  ('other:urbanity', 'Other', 'Urbanity', 'Urbanity-related reforms', '#2c3e50', 'city', 92)
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color_hex = EXCLUDED.color_hex,
  icon_name = EXCLUDED.icon_name,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- SEED DATA: Sources (intermediate data sources)
-- ============================================================================

INSERT INTO sources (name, short_name, description, website_url, logo_filename) VALUES
  ('Parking Reform Network', 'PRN', 'A grassroots advocacy organization working to eliminate parking mandates across North America', 'https://parkingreform.org/', 'prn-logo.svg'),
  ('Berkeley Zoning Reform Tracker', 'ZRT', 'Zoning reform tracking project by UC Berkeley Othering & Belonging Institute', 'https://belonging.berkeley.edu/', 'zrt-logo.svg')
ON CONFLICT (short_name) DO NOTHING;

-- ============================================================================
-- US STATES SEED DATA
-- Per US Census Bureau Regions and Divisions
-- ============================================================================

INSERT INTO states (state_code, state_name, region, subregion) VALUES
  -- Northeast Region
  ('CT', 'Connecticut', 'Northeast', 'New England'),
  ('ME', 'Maine', 'Northeast', 'New England'),
  ('MA', 'Massachusetts', 'Northeast', 'New England'),
  ('NH', 'New Hampshire', 'Northeast', 'New England'),
  ('RI', 'Rhode Island', 'Northeast', 'New England'),
  ('VT', 'Vermont', 'Northeast', 'New England'),
  ('NJ', 'New Jersey', 'Northeast', 'Middle Atlantic'),
  ('NY', 'New York', 'Northeast', 'Middle Atlantic'),
  ('PA', 'Pennsylvania', 'Northeast', 'Middle Atlantic'),
  -- Midwest Region
  ('IL', 'Illinois', 'Midwest', 'East North Central'),
  ('IN', 'Indiana', 'Midwest', 'East North Central'),
  ('MI', 'Michigan', 'Midwest', 'East North Central'),
  ('OH', 'Ohio', 'Midwest', 'East North Central'),
  ('WI', 'Wisconsin', 'Midwest', 'East North Central'),
  ('IA', 'Iowa', 'Midwest', 'West North Central'),
  ('KS', 'Kansas', 'Midwest', 'West North Central'),
  ('MN', 'Minnesota', 'Midwest', 'West North Central'),
  ('MO', 'Missouri', 'Midwest', 'West North Central'),
  ('NE', 'Nebraska', 'Midwest', 'West North Central'),
  ('ND', 'North Dakota', 'Midwest', 'West North Central'),
  ('SD', 'South Dakota', 'Midwest', 'West North Central'),  
  -- South Region
  ('DE', 'Delaware', 'South', 'South Atlantic'),
  ('FL', 'Florida', 'South', 'South Atlantic'),
  ('GA', 'Georgia', 'South', 'South Atlantic'),
  ('MD', 'Maryland', 'South', 'South Atlantic'),
  ('NC', 'North Carolina', 'South', 'South Atlantic'),
  ('SC', 'South Carolina', 'South', 'South Atlantic'),
  ('VA', 'Virginia', 'South', 'South Atlantic'),
  ('WV', 'West Virginia', 'South', 'South Atlantic'),
  ('DC', 'District of Columbia', 'South', 'South Atlantic'),
  ('AL', 'Alabama', 'South', 'East South Central'),
  ('KY', 'Kentucky', 'South', 'East South Central'),
  ('MS', 'Mississippi', 'South', 'East South Central'),
  ('TN', 'Tennessee', 'South', 'East South Central'),
  ('AR', 'Arkansas', 'South', 'West South Central'),
  ('LA', 'Louisiana', 'South', 'West South Central'),
  ('OK', 'Oklahoma', 'South', 'West South Central'),
  ('TX', 'Texas', 'South', 'West South Central'),
  -- West Region
  ('AZ', 'Arizona', 'West', 'Mountain'),
  ('CO', 'Colorado', 'West', 'Mountain'),
  ('ID', 'Idaho', 'West', 'Mountain'),
  ('MT', 'Montana', 'West', 'Mountain'),
  ('NV', 'Nevada', 'West', 'Mountain'),
  ('NM', 'New Mexico', 'West', 'Mountain'),
  ('UT', 'Utah', 'West', 'Mountain'),
  ('WY', 'Wyoming', 'West', 'Mountain'),
  ('AK', 'Alaska', 'West', 'Pacific'),
  ('CA', 'California', 'West', 'Pacific'),
  ('HI', 'Hawaii', 'West', 'Pacific'),
  ('OR', 'Oregon', 'West', 'Pacific'),
  ('WA', 'Washington', 'West', 'Pacific')
ON CONFLICT (state_code) DO NOTHING;
