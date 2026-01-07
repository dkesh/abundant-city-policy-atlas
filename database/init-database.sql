-- ============================================================================
-- INIT DATABASE
-- Urbanist Reform Map
-- Supports data from:
--  * Parking Reform Network (PRN) 
--  * Zoning Reform Tracker (ZRT)
-- ============================================================================

  -- Enable PostGIS extension
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS postgis_topology;

  -- ============================================================================
  -- CORE TABLES
  -- ============================================================================

  -- States table with geometry
  CREATE TABLE IF NOT EXISTS states (
    id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) UNIQUE NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    region VARCHAR(50),                                    -- Northeast, Midwest, South, West
    subregion VARCHAR(50),                                 -- New England, Middle Atlantic, etc.
    geom GEOMETRY(POLYGON, 4326),
    population INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Create spatial index on states geometry
  CREATE INDEX IF NOT EXISTS states_geom_idx ON states USING GIST(geom);

  -- Reform types table - Universal (Source Agnostic)
  CREATE TABLE IF NOT EXISTS reform_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'parking:eliminated', 'housing:adu'
    category VARCHAR(50),              -- New Parent Category (e.g., 'Parking', 'Housing Types')
    name VARCHAR(100) NOT NULL,        -- Display name
    description TEXT,
    color_hex VARCHAR(7),              -- Color for UI
    icon_name VARCHAR(50),
    sort_order INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Place types table (level of government)
   CREATE TYPE place_type AS ENUM ('city','county','state');

  -- Places table (normalized municipalities/counties/states)
  CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    place_type place_type NOT NULL,
    state_code VARCHAR(2),
    population INT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    encoded_name VARCHAR(255),
    source_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, state_code, place_type)
  );
  
  CREATE INDEX IF NOT EXISTS places_state_code_idx ON places(state_code);
  CREATE INDEX IF NOT EXISTS places_name_idx ON places(name);

  -- Policy Documents (Bills, Ordinances, etc.)
  CREATE TABLE IF NOT EXISTS policy_documents (
    id SERIAL PRIMARY KEY,
    reference_number VARCHAR(100) NOT NULL,  -- e.g. "AB 1234", "Ord. 55-2024"
    state_code VARCHAR(2),                   -- For state bills
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL, -- For local ordinances
    title TEXT,
    key_points TEXT[],                       -- "Why it matters" / "What it does"
    analysis TEXT,                           -- Detailed analysis
    document_url TEXT,                       -- Link to bill text
    status VARCHAR(50),                      -- Current status
    last_action_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(state_code, reference_number)
  );

  CREATE INDEX IF NOT EXISTS policy_docs_state_ref_idx ON policy_documents(state_code, reference_number);

  -- Normalized reforms table (place-based) - supports both PRN and ZRT data
  CREATE TABLE IF NOT EXISTS reforms (
    id SERIAL NOT NULL,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    reform_type_id INTEGER NOT NULL REFERENCES reform_types(id) ON DELETE CASCADE,
    policy_document_id INTEGER REFERENCES policy_documents(id) ON DELETE SET NULL,
    -- status and details
    status VARCHAR(50),
    scope TEXT[],
    land_use TEXT[],
    adoption_date DATE,
    summary TEXT,
    requirements TEXT[],
    -- Added fields from the denormalized schema
    reform_mechanism VARCHAR(100),
    reform_phase VARCHAR(50),
    legislative_number VARCHAR(255),
    -- metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE(place_id, reform_type_id, adoption_date, status)
  );

  -- Indexes for common queries on reforms
  CREATE INDEX IF NOT EXISTS reforms_place_idx ON reforms(place_id);
  CREATE INDEX IF NOT EXISTS reforms_type_idx ON reforms(reform_type_id);
  CREATE INDEX IF NOT EXISTS reforms_adoption_idx ON reforms(adoption_date);
  CREATE INDEX IF NOT EXISTS reforms_policy_doc_idx ON reforms(policy_document_id);

-- Data sources table - tracks intermediate sources (PRN, ZRT, etc.)
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    website_url TEXT,
    logo_filename VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for many-to-many relationship between reforms and sources
CREATE TABLE IF NOT EXISTS reform_sources (
    reform_id INTEGER NOT NULL REFERENCES reforms(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    reporter VARCHAR(255),              -- Person who reported to this source
    source_url TEXT,                    -- Source-specific URL for this reform
    notes TEXT,                         -- Source-specific notes
    ingestion_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_primary BOOLEAN DEFAULT FALSE,   -- Designate primary source for ordering
    PRIMARY KEY (reform_id, source_id)
);

CREATE INDEX IF NOT EXISTS reform_sources_reform_idx ON reform_sources(reform_id);
CREATE INDEX IF NOT EXISTS reform_sources_source_idx ON reform_sources(source_id);

-- Ultimate sources/citations table (different from intermediate data sources)
CREATE TABLE reform_citations (
    id SERIAL NOT NULL,
    reform_id integer NOT NULL,
    citation_description text,
    citation_url text,
    citation_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT reform_citations_reform_fkey FOREIGN KEY (reform_id) REFERENCES reforms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reform_citations_reform_idx ON public.reform_citations USING btree (reform_id);

-- Unique index to allow ON CONFLICT DO NOTHING to work and prevent duplicate citations
CREATE UNIQUE INDEX IF NOT EXISTS reform_citations_uniq
ON public.reform_citations (
    reform_id,
    COALESCE(citation_url, ''),
    COALESCE(citation_description, '')
);

  -- Data ingestion metadata
  CREATE TABLE IF NOT EXISTS data_ingestion (
    id SERIAL PRIMARY KEY,
    ingestion_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source_name VARCHAR(50),  -- PRN or ZRT
    source_url TEXT,
    records_processed INT,
    places_created INT,
    places_updated INT,
    reforms_created INT,
    reforms_updated INT,
    status VARCHAR(50),  -- success, failed, partial
    error_message TEXT,
    duration_seconds INT
  );

  -- ============================================================================
  -- SEED DATA: Reform Types (Universal)
  -- ============================================================================

  INSERT INTO reform_types (code, category, name, description, color_hex, icon_name, sort_order) VALUES
    -- PARKING
    ('parking:eliminated', 'Parking', 'Parking Minimums Eliminated', 'Completely eliminated parking minimum requirements', '#27ae60', 'ban', 10),
    ('parking:reduced', 'Parking', 'Parking Minimums Reduced', 'Reduced or eliminated parking minimum requirements', '#2ecc71', 'minus-circle', 11),
    ('parking:maximums', 'Parking', 'Parking Maximums', 'Maximum parking limits introduced', '#e74c3c', 'arrows-alt', 12),
    ('parking:general', 'Parking', 'General Parking Reform', 'Other parking policy changes', '#27ae60', 'car', 13),

    -- HOUSING TYPES
    ('housing:adu', 'Housing Types', 'ADU Reform', 'Accessory Dwelling Unit reforms', '#3498db', 'home', 20),
    ('housing:plex', 'Housing Types', 'Middle Housing', 'Duplexes, triplexes, 4-plexes', '#9b59b6', 'th-large', 21),
    ('housing:multifamily', 'Housing Types', 'Multifamily', 'General multifamily housing reforms', '#8e44ad', 'city', 22),
    ('housing:mixed_use', 'Housing Types', 'Mixed-Use', 'Residential + Commercial combined', '#d35400', 'store', 23),
    ('housing:sro', 'Housing Types', 'Single Room Occupancy', 'SRO housing reforms', '#c0392b', 'bed', 24),
    ('housing:manufactured', 'Housing Types', 'Manufactured Housing', 'Manufactured housing reforms', '#16a085', 'home', 25),
    ('housing:tiny_homes', 'Housing Types', 'Tiny Homes', 'Tiny home regulations', '#27ae60', 'leaf', 26),
    ('housing:cottage_courts', 'Housing Types', 'Cottage Courts', 'Cottage court developments', '#f1c40f', 'home', 27),
    ('housing:group_housing', 'Housing Types', 'Group Housing', 'Group housing regulations', '#e67e22', 'users', 28),
    ('housing:courtyard', 'Housing Types', 'Courtyard Apartments', 'Courtyard apartment reforms', '#2980b9', 'building', 29),
    ('housing:sf_detached', 'Housing Types', 'Single-Family Detached', 'Single-family detached housing reforms', '#95a5a6', 'home', 30),

    -- PROCESS
    ('process:permitting', 'Process', 'Permitting Process', 'Permitting process streamlining', '#2c3e50', 'clipboard-check', 40),
    ('process:by_right', 'Process', 'By-Right', 'By-right approval processes', '#27ae60', 'check-circle', 41),
    ('process:hearings', 'Process', 'Public Hearings', 'Public hearing requirements', '#c0392b', 'bullhorn', 42),
    ('process:design_review', 'Process', 'Design Review', 'Design review standards', '#8e44ad', 'pencil-ruler', 43),
    ('process:impact_fees', 'Process', 'Impact Fees', 'Development impact fee reforms', '#f39c12', 'hand-holding-usd', 44),
    ('process:environmental', 'Process', 'Environmental Review', 'Environmental review reforms', '#2ecc71', 'leaf', 45),

    -- LAND USE
    ('landuse:tod', 'Land Use', 'TOD Reform', 'Transit-oriented development reforms', '#2980b9', 'subway', 50),
    ('landuse:lot_size', 'Land Use', 'Lot Size', 'Minimum lot size reforms', '#16a085', 'ruler-combined', 51),
    ('landuse:setbacks', 'Land Use', 'Setbacks', 'Setback requirement reforms', '#8e44ad', 'compress-arrows-alt', 52),
    ('landuse:far', 'Land Use', 'Floor Area Ratio', 'FAR regulations', '#d35400', 'expand', 53),
    ('landuse:height', 'Land Use', 'Height Limits', 'Building height limit reforms', '#34495e', 'arrow-up', 54),
    ('landuse:density', 'Land Use', 'Density Limits', 'Dwelling unit density reforms', '#e74c3c', 'th', 55),
    ('landuse:zoning', 'Land Use', 'General Zoning', 'General zoning reforms', '#2c3e50', 'map', 56),

    -- BUILDING CODE
    ('building:staircases', 'Building Code', 'Staircases', 'Single-stair reforms and related codes', '#95a5a6', 'stream', 60),

    -- Catch-all
    ('other:general', 'Other', 'Other Reform', 'Other zoning or land use reforms', '#7f8c8d', 'question-circle', 99)
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

  -- ============================================================================
  -- VIEWS FOR API ACCESS
  -- ============================================================================

  -- View: All reforms with state and type info
  CREATE OR REPLACE VIEW v_state_reforms_detailed AS
  SELECT
    r.id,
    s.state_code,
    s.state_name,
    rt.code as reform_code,
    rt.name as reform_type,
    rt.color_hex,
    p.name as municipality_name,
    CASE 
      WHEN p.place_type = 'city' THEN 'Municipality'
      WHEN p.place_type = 'county' THEN 'County'
      WHEN p.place_type = 'state' THEN 'State'
      ELSE 'Municipality'
    END as governance_level,
    s.region,
    r.summary as reform_name,
    r.notes as description,
    ARRAY_TO_STRING(r.scope, ', ') as scope,
    r.reform_mechanism,
    r.reform_phase,
    r.adoption_date,
    p.latitude,
    p.longitude,
    STRING_AGG(DISTINCT src.short_name, ', ') as sources,
    STRING_AGG(DISTINCT rs.source_url, ', ') FILTER (WHERE rs.source_url IS NOT NULL) as source_urls,
    r.notes,
    r.created_at
  FROM reforms r
  JOIN places p ON r.place_id = p.id
  JOIN states s ON p.state_code = s.state_code
  JOIN reform_types rt ON r.reform_type_id = rt.id
  LEFT JOIN reform_sources rs ON r.id = rs.reform_id
  LEFT JOIN sources src ON rs.source_id = src.id
  GROUP BY r.id, s.state_code, s.state_name, rt.code, rt.name, rt.color_hex, rt.sort_order, p.name, p.place_type, s.region, r.summary, r.notes, r.scope, r.reform_mechanism, r.reform_phase, r.adoption_date, p.latitude, p.longitude, r.created_at
  ORDER BY s.state_name, p.name, rt.sort_order;

  -- View: Summary of reforms by state and type
  CREATE OR REPLACE VIEW v_reforms_by_state_summary AS
  SELECT
    s.id,
    s.state_code,
    s.state_name,
    rt.id as reform_type_id,
    rt.code as reform_code,
    rt.name as reform_type,
    rt.color_hex,
    COUNT(r.id) as reform_count
  FROM states s
  LEFT JOIN places p ON p.state_code = s.state_code
  LEFT JOIN reforms r ON r.place_id = p.id
  LEFT JOIN reform_types rt ON r.reform_type_id = rt.id
  GROUP BY s.id, s.state_code, s.state_name, rt.id, rt.code, rt.name, rt.color_hex
  ORDER BY s.state_name, rt.sort_order;

  -- View: States with at least one reform
  CREATE OR REPLACE VIEW v_states_with_reforms AS
  SELECT DISTINCT
    s.id,
    s.state_code,
    s.state_name,
    COUNT(DISTINCT r.id) as total_reforms,
    COUNT(DISTINCT r.reform_type_id) as type_count,
    COUNT(DISTINCT rs.source_id) as source_count,
    MAX(r.adoption_date) as most_recent_reform
  FROM states s
  JOIN places p ON p.state_code = s.state_code
  JOIN reforms r ON r.place_id = p.id
  LEFT JOIN reform_sources rs ON r.id = rs.reform_id
  GROUP BY s.id, s.state_code, s.state_name;

  -- View: Reforms by municipality and source
  CREATE OR REPLACE VIEW v_reforms_by_municipality AS
  SELECT
    p.name as municipality_name,
    s.state_code,
    s.state_name,
    STRING_AGG(DISTINCT src.short_name, ', ') as sources,
    COUNT(DISTINCT r.id) as reform_count,
    COUNT(DISTINCT r.reform_type_id) as type_count,
    p.latitude,
    p.longitude
  FROM reforms r
  JOIN places p ON r.place_id = p.id
  JOIN states s ON p.state_code = s.state_code
  LEFT JOIN reform_sources rs ON r.id = rs.reform_id
  LEFT JOIN sources src ON rs.source_id = src.id
  WHERE p.name IS NOT NULL
  GROUP BY p.name, s.state_code, s.state_name, p.latitude, p.longitude
  ORDER BY reform_count DESC;

  -- ============================================================================
  -- FUNCTIONS FOR DATA MANAGEMENT
  -- ============================================================================

  -- Update timestamp on row modification
  CREATE OR REPLACE FUNCTION update_timestamp()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Trigger for reforms update
  DROP TRIGGER IF EXISTS reforms_update_timestamp ON reforms;
  CREATE TRIGGER reforms_update_timestamp
  BEFORE UPDATE ON reforms
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

  -- ============================================================================
  -- PERMISSIONS (uncomment and adjust for your setup)
  -- ============================================================================
  -- GRANT SELECT ON ALL TABLES IN SCHEMA public TO read_only_user;
  -- GRANT SELECT ON ALL VIEWS IN SCHEMA public TO read_only_user;
  -- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO read_only_user;
