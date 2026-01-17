-- ============================================================================
-- SEED DATA
-- Urbanist Reform Map
-- Populates initial reference data: reform types, sources, and top-level divisions (US states, US territories, Canadian provinces)
-- ============================================================================

-- ============================================================================
-- SEED DATA: Categories
-- ============================================================================

INSERT INTO categories (name, description, icon, sort_order) VALUES
  ('Parking', 'Mostly reforms to off-street parking mandates, allowing developers to build the amount of parking that makes economic sense.  Additionally, some changes to on-street parking rules.', 'local_parking', 10),
  ('Housing Typology', 'Reforms that legalize or make it easier to build diverse housing types like accessory dwelling units (ADUs), duplexes, triplexes, and other middle housing.', 'home_work', 20),
  ('Zoning Category', 'Reforms that change zoning classifications and land use categories to allow more housing density and mixed-use development in specific places.', 'location_city', 30),
  ('Physical Dimension', 'Reforms that adjust physical constraints like minimum lot sizes, building height limits, and floor area ratios to enable more housing.', 'square_foot', 40),
  ('Process', 'Reforms that streamline permitting, approvals, and other bureaucratic processes to reduce delays and costs in building housing.', 'assignment', 50),
  ('Building Code', 'Reforms that update building codes to allow more efficient building designs, such as single-stair buildings and elevator requirements.', 'domain', 60),
  ('Other', 'Other types of housing and land use reforms that don''t fit into the standard categories.', 'more_horiz', 90)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- SEED DATA: Reform Types (Universal)
-- ============================================================================

INSERT INTO reform_types (code, category_id, name, description, color_hex, icon_name, sort_order) VALUES
  -- PARKING
  ('parking:eliminated', (SELECT id FROM categories WHERE name = 'Parking'), 'Mandates Eliminated', 'Completely eliminated parking minimum requirements', '#27ae60', 'ban', 10),
  ('parking:reduced', (SELECT id FROM categories WHERE name = 'Parking'), 'Mandates Reduced', 'Reduced parking minimum requirements', '#2ecc71', 'minus-circle', 11),
  ('parking:unspecified', (SELECT id FROM categories WHERE name = 'Parking'), 'Parking: unspecified', 'Parking policy changes', '#27ae60', 'car', 12),
  -- HOUSING TYPOLOGY
  ('housing:adu', (SELECT id FROM categories WHERE name = 'Housing Typology'), 'ADU', 'Accessory Dwelling Unit reforms', '#3498db', 'home', 20),
  ('housing:plex', (SELECT id FROM categories WHERE name = 'Housing Typology'), 'Plex', 'Duplexes, triplexes, 4-plexes', '#9b59b6', 'th-large', 21),
  -- ZONING CATEGORY
  ('zoning:ricz', (SELECT id FROM categories WHERE name = 'Zoning Category'), 'RICZ', 'Reform Income Community Zoning reforms', '#2980b9', 'map', 30),
  ('zoning:yigby', (SELECT id FROM categories WHERE name = 'Zoning Category'), 'YIGBY', 'Yes In God''s Backyard reforms', '#3498db', 'church', 31),
  ('zoning:tod', (SELECT id FROM categories WHERE name = 'Zoning Category'), 'TOD Upzones', 'Transit-oriented development reforms', '#2980b9', 'subway', 32),
  -- PHYSICAL DIMENSION
  ('physical:lot_size', (SELECT id FROM categories WHERE name = 'Physical Dimension'), 'Lot Size', 'Minimum lot size reforms', '#16a085', 'ruler-combined', 40),
  ('physical:height', (SELECT id FROM categories WHERE name = 'Physical Dimension'), 'Height Limits', 'Building height limit reforms', '#34495e', 'arrow-up', 41),
  ('physical:far', (SELECT id FROM categories WHERE name = 'Physical Dimension'), 'Floor Area Ratio', 'FAR regulations', '#d35400', 'expand', 42),
  -- PROCESS
  ('process:permitting', (SELECT id FROM categories WHERE name = 'Process'), 'Permitting Process', 'Permitting process streamlining', '#2c3e50', 'clipboard-check', 50),
  ('process:courts_appeals', (SELECT id FROM categories WHERE name = 'Process'), 'Courts & Appeals', 'Court and appeals process reforms', '#8e44ad', 'gavel', 51),
  ('process:planning_obligations', (SELECT id FROM categories WHERE name = 'Process'), 'Planning Obligations', 'Planning obligation reforms', '#f39c12', 'file-contract', 52),
  -- BUILDING CODE
  ('building:stairwells', (SELECT id FROM categories WHERE name = 'Building Code'), 'Stairwells', 'Stairwell reforms', '#95a5a6', 'stream', 60),
  ('building:elevators', (SELECT id FROM categories WHERE name = 'Building Code'), 'Elevators', 'Elevator-related code reforms', '#7f8c8d', 'arrow-up', 61),
  ('building:unspecified', (SELECT id FROM categories WHERE name = 'Building Code'), 'Building Code: Unspecified', 'Building code reforms', '#95a5a6', 'building', 62),
  -- OTHER
  ('other:general', (SELECT id FROM categories WHERE name = 'Other'), 'Other Reform', 'Other zoning or land use reforms', '#7f8c8d', 'question-circle', 90),
  ('other:land_value_tax', (SELECT id FROM categories WHERE name = 'Other'), 'Land Value Tax', 'Land value tax reforms', '#27ae60', 'dollar-sign', 91),
  ('other:urbanity', (SELECT id FROM categories WHERE name = 'Other'), 'Urbanity', 'Urbanity-related reforms', '#2c3e50', 'city', 92)
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
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
  ('Zoning Reform Tracker, Othering and Belonging Institute', 'ZRT', 'Zoning reform tracking project by Othering & Belonging Institute, University of California, Berkeley', 'https://belonging.berkeley.edu/', 'zrt-logo.svg'),
  ('Center for Land Economics', 'CLE', 'Tracks land value tax reforms across North America', 'https://landeconomics.org/', 'cle-logo.svg')
ON CONFLICT (short_name) DO NOTHING;

-- ============================================================================
-- TOP-LEVEL DIVISIONS SEED DATA
-- US States, US Territories, and Canadian Provinces
-- Per US Census Bureau Regions and Divisions for US states
-- ============================================================================

INSERT INTO top_level_division (state_code, state_name, country, region, subregion, population) VALUES
  -- US States - Northeast Region
  ('CT', 'Connecticut', 'US', 'Northeast', 'New England', 3626205),
  ('ME', 'Maine', 'US', 'Northeast', 'New England', 1393723),
  ('MA', 'Massachusetts', 'US', 'Northeast', 'New England', 7029917),
  ('NH', 'New Hampshire', 'US', 'Northeast', 'New England', 1395231),
  ('RI', 'Rhode Island', 'US', 'Northeast', 'New England', 1095610),
  ('VT', 'Vermont', 'US', 'Northeast', 'New England', 647464),
  ('NJ', 'New Jersey', 'US', 'Northeast', 'Middle Atlantic', 9288994),
  ('NY', 'New York', 'US', 'Northeast', 'Middle Atlantic', 19980472),
  ('PA', 'Pennsylvania', 'US', 'Northeast', 'Middle Atlantic', 13002700),
  -- US States - Midwest Region
  ('IL', 'Illinois', 'US', 'Midwest', 'East North Central', 12601467),
  ('IN', 'Indiana', 'US', 'Midwest', 'East North Central', 6833038),
  ('MI', 'Michigan', 'US', 'Midwest', 'East North Central', 10034113),
  ('OH', 'Ohio', 'US', 'Midwest', 'East North Central', 11799448),
  ('WI', 'Wisconsin', 'US', 'Midwest', 'East North Central', 5892539),
  ('IA', 'Iowa', 'US', 'Midwest', 'West North Central', 3200517),
  ('KS', 'Kansas', 'US', 'Midwest', 'West North Central', 2937150),
  ('MN', 'Minnesota', 'US', 'Midwest', 'West North Central', 5706494),
  ('MO', 'Missouri', 'US', 'Midwest', 'West North Central', 6177957),
  ('NE', 'Nebraska', 'US', 'Midwest', 'West North Central', 1963692),
  ('ND', 'North Dakota', 'US', 'Midwest', 'West North Central', 783926),
  ('SD', 'South Dakota', 'US', 'Midwest', 'West North Central', 909824),  
  -- US States - South Region
  ('DE', 'Delaware', 'US', 'South', 'South Atlantic', 1018396),
  ('FL', 'Florida', 'US', 'South', 'South Atlantic', 22610726),
  ('GA', 'Georgia', 'US', 'South', 'South Atlantic', 11049515),
  ('MD', 'Maryland', 'US', 'South', 'South Atlantic', 6164660),
  ('NC', 'North Carolina', 'US', 'South', 'South Atlantic', 10698973),
  ('SC', 'South Carolina', 'US', 'South', 'South Atlantic', 5282634),
  ('VA', 'Virginia', 'US', 'South', 'South Atlantic', 8701929),
  ('WV', 'West Virginia', 'US', 'South', 'South Atlantic', 1793716),
  ('DC', 'District of Columbia', 'US', 'South', 'South Atlantic', 678972),
  ('AL', 'Alabama', 'US', 'South', 'East South Central', 5074296),
  ('KY', 'Kentucky', 'US', 'South', 'East South Central', 4509349),
  ('MS', 'Mississippi', 'US', 'South', 'East South Central', 2940057),
  ('TN', 'Tennessee', 'US', 'South', 'East South Central', 7051339),
  ('AR', 'Arkansas', 'US', 'South', 'West South Central', 3033949),
  ('LA', 'Louisiana', 'US', 'South', 'West South Central', 4657757),
  ('OK', 'Oklahoma', 'US', 'South', 'West South Central', 4041763),
  ('TX', 'Texas', 'US', 'South', 'West South Central', 30462592),
  -- US States - West Region
  ('AZ', 'Arizona', 'US', 'West', 'Mountain', 7421401),
  ('CO', 'Colorado', 'US', 'West', 'Mountain', 5893634),
  ('ID', 'Idaho', 'US', 'West', 'Mountain', 1945353),
  ('MT', 'Montana', 'US', 'West', 'Mountain', 1122867),
  ('NV', 'Nevada', 'US', 'West', 'Mountain', 3177772),
  ('NM', 'New Mexico', 'US', 'West', 'Mountain', 2114654),
  ('UT', 'Utah', 'US', 'West', 'Mountain', 3380800),
  ('WY', 'Wyoming', 'US', 'West', 'Mountain', 584153),
  ('AK', 'Alaska', 'US', 'West', 'Pacific', 733406),
  ('CA', 'California', 'US', 'West', 'Pacific', 39029342),
  ('HI', 'Hawaii', 'US', 'West', 'Pacific', 1440196),
  ('OR', 'Oregon', 'US', 'West', 'Pacific', 4237256),
  ('WA', 'Washington', 'US', 'West', 'Pacific', 7797095),
  -- US Territories - Caribbean
  ('PR', 'Puerto Rico', 'US', 'US Territories', 'Caribbean', 3263584),
  ('VI', 'US Virgin Islands', 'US', 'US Territories', 'Caribbean', 105413),
  -- US Territories - Pacific
  ('GU', 'Guam', 'US', 'US Territories', 'Pacific', 172952),
  ('AS', 'American Samoa', 'US', 'US Territories', 'Pacific', 43641),
  ('MP', 'Northern Mariana Islands', 'US', 'US Territories', 'Pacific', 51594),
  -- Canadian Provinces - Western
  ('AB', 'Alberta', 'CA', 'Canada', 'Western', 4732746),
  ('BC', 'British Columbia', 'CA', 'Canada', 'Western', 5400879),
  ('MB', 'Manitoba', 'CA', 'Canada', 'Western', 1429406),
  ('SK', 'Saskatchewan', 'CA', 'Canada', 'Western', 1207778),
  -- Canadian Provinces - Eastern
  ('NB', 'New Brunswick', 'CA', 'Canada', 'Eastern', 834691),
  ('NL', 'Newfoundland and Labrador', 'CA', 'Canada', 'Eastern', 536291),
  ('NS', 'Nova Scotia', 'CA', 'Canada', 'Eastern', 1061663),
  ('ON', 'Ontario', 'CA', 'Canada', 'Eastern', 15780123),
  ('PE', 'Prince Edward Island', 'CA', 'Canada', 'Eastern', 173787),
  ('QC', 'Quebec', 'CA', 'Canada', 'Eastern', 8919043),
  -- Canadian Territories - Northern
  ('NT', 'Northwest Territories', 'CA', 'Canada', 'Northern', 45661),
  ('NU', 'Nunavut', 'CA', 'Canada', 'Northern', 40453),
  ('YT', 'Yukon', 'CA', 'Canada', 'Northern', 44881)
ON CONFLICT (state_code) DO UPDATE SET
  population = EXCLUDED.population,
  updated_at = CURRENT_TIMESTAMP;
