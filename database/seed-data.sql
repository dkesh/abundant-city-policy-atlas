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
