-- ============================================================================
-- SEED DATA
-- Urbanist Reform Map
-- Populates initial reference data: reform types, sources, and top-level divisions (US states, US territories, Canadian provinces)
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
-- TOP-LEVEL DIVISIONS SEED DATA
-- US States, US Territories, and Canadian Provinces
-- Per US Census Bureau Regions and Divisions for US states
-- ============================================================================

INSERT INTO top_level_division (state_code, state_name, country, region, subregion) VALUES
  -- US States - Northeast Region
  ('CT', 'Connecticut', 'US', 'Northeast', 'New England'),
  ('ME', 'Maine', 'US', 'Northeast', 'New England'),
  ('MA', 'Massachusetts', 'US', 'Northeast', 'New England'),
  ('NH', 'New Hampshire', 'US', 'Northeast', 'New England'),
  ('RI', 'Rhode Island', 'US', 'Northeast', 'New England'),
  ('VT', 'Vermont', 'US', 'Northeast', 'New England'),
  ('NJ', 'New Jersey', 'US', 'Northeast', 'Middle Atlantic'),
  ('NY', 'New York', 'US', 'Northeast', 'Middle Atlantic'),
  ('PA', 'Pennsylvania', 'US', 'Northeast', 'Middle Atlantic'),
  -- US States - Midwest Region
  ('IL', 'Illinois', 'US', 'Midwest', 'East North Central'),
  ('IN', 'Indiana', 'US', 'Midwest', 'East North Central'),
  ('MI', 'Michigan', 'US', 'Midwest', 'East North Central'),
  ('OH', 'Ohio', 'US', 'Midwest', 'East North Central'),
  ('WI', 'Wisconsin', 'US', 'Midwest', 'East North Central'),
  ('IA', 'Iowa', 'US', 'Midwest', 'West North Central'),
  ('KS', 'Kansas', 'US', 'Midwest', 'West North Central'),
  ('MN', 'Minnesota', 'US', 'Midwest', 'West North Central'),
  ('MO', 'Missouri', 'US', 'Midwest', 'West North Central'),
  ('NE', 'Nebraska', 'US', 'Midwest', 'West North Central'),
  ('ND', 'North Dakota', 'US', 'Midwest', 'West North Central'),
  ('SD', 'South Dakota', 'US', 'Midwest', 'West North Central'),  
  -- US States - South Region
  ('DE', 'Delaware', 'US', 'South', 'South Atlantic'),
  ('FL', 'Florida', 'US', 'South', 'South Atlantic'),
  ('GA', 'Georgia', 'US', 'South', 'South Atlantic'),
  ('MD', 'Maryland', 'US', 'South', 'South Atlantic'),
  ('NC', 'North Carolina', 'US', 'South', 'South Atlantic'),
  ('SC', 'South Carolina', 'US', 'South', 'South Atlantic'),
  ('VA', 'Virginia', 'US', 'South', 'South Atlantic'),
  ('WV', 'West Virginia', 'US', 'South', 'South Atlantic'),
  ('DC', 'District of Columbia', 'US', 'South', 'South Atlantic'),
  ('AL', 'Alabama', 'US', 'South', 'East South Central'),
  ('KY', 'Kentucky', 'US', 'South', 'East South Central'),
  ('MS', 'Mississippi', 'US', 'South', 'East South Central'),
  ('TN', 'Tennessee', 'US', 'South', 'East South Central'),
  ('AR', 'Arkansas', 'US', 'South', 'West South Central'),
  ('LA', 'Louisiana', 'US', 'South', 'West South Central'),
  ('OK', 'Oklahoma', 'US', 'South', 'West South Central'),
  ('TX', 'Texas', 'US', 'South', 'West South Central'),
  -- US States - West Region
  ('AZ', 'Arizona', 'US', 'West', 'Mountain'),
  ('CO', 'Colorado', 'US', 'West', 'Mountain'),
  ('ID', 'Idaho', 'US', 'West', 'Mountain'),
  ('MT', 'Montana', 'US', 'West', 'Mountain'),
  ('NV', 'Nevada', 'US', 'West', 'Mountain'),
  ('NM', 'New Mexico', 'US', 'West', 'Mountain'),
  ('UT', 'Utah', 'US', 'West', 'Mountain'),
  ('WY', 'Wyoming', 'US', 'West', 'Mountain'),
  ('AK', 'Alaska', 'US', 'West', 'Pacific'),
  ('CA', 'California', 'US', 'West', 'Pacific'),
  ('HI', 'Hawaii', 'US', 'West', 'Pacific'),
  ('OR', 'Oregon', 'US', 'West', 'Pacific'),
  ('WA', 'Washington', 'US', 'West', 'Pacific'),
  -- US Territories - Caribbean
  ('PR', 'Puerto Rico', 'US', 'US Territories', 'Caribbean'),
  ('VI', 'US Virgin Islands', 'US', 'US Territories', 'Caribbean'),
  -- US Territories - Pacific
  ('GU', 'Guam', 'US', 'US Territories', 'Pacific'),
  ('AS', 'American Samoa', 'US', 'US Territories', 'Pacific'),
  ('MP', 'Northern Mariana Islands', 'US', 'US Territories', 'Pacific'),
  -- Canadian Provinces - Western
  ('AB', 'Alberta', 'CA', 'Canada', 'Western'),
  ('BC', 'British Columbia', 'CA', 'Canada', 'Western'),
  ('MB', 'Manitoba', 'CA', 'Canada', 'Western'),
  ('SK', 'Saskatchewan', 'CA', 'Canada', 'Western'),
  -- Canadian Provinces - Eastern
  ('NB', 'New Brunswick', 'CA', 'Canada', 'Eastern'),
  ('NL', 'Newfoundland and Labrador', 'CA', 'Canada', 'Eastern'),
  ('NS', 'Nova Scotia', 'CA', 'Canada', 'Eastern'),
  ('ON', 'Ontario', 'CA', 'Canada', 'Eastern'),
  ('PE', 'Prince Edward Island', 'CA', 'Canada', 'Eastern'),
  ('QC', 'Quebec', 'CA', 'Canada', 'Eastern'),
  -- Canadian Territories - Northern
  ('NT', 'Northwest Territories', 'CA', 'Canada', 'Northern'),
  ('NU', 'Nunavut', 'CA', 'Canada', 'Northern'),
  ('YT', 'Yukon', 'CA', 'Canada', 'Northern')
ON CONFLICT (state_code) DO NOTHING;
