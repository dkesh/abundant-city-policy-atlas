-- ============================================================================
-- DATABASE SCHEMA
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

-- Top-level divisions table (states, provinces, territories) with geometry
CREATE TABLE IF NOT EXISTS top_level_division (
  id SERIAL PRIMARY KEY,
  state_code VARCHAR(2) UNIQUE NOT NULL,
  state_name VARCHAR(100) NOT NULL,
  country VARCHAR(2) NOT NULL DEFAULT 'US',             -- Country code (e.g., 'US', 'CA')
  region VARCHAR(50),                                    -- Northeast, Midwest, South, West, Canada - Western, etc.
  subregion VARCHAR(50),                                 -- New England, Middle Atlantic, etc.
  geom GEOMETRY(POLYGON, 4326),
  population INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index on top_level_division geometry
CREATE INDEX IF NOT EXISTS top_level_division_geom_idx ON top_level_division USING GIST(geom);

-- Categories table - Groups of related reform types
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL,
  sort_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories(sort_order);

-- Reform types table - Universal (Source Agnostic)
CREATE TABLE IF NOT EXISTS reform_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'parking:eliminated', 'housing:adu'
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,        -- Display name
  description TEXT,
  color_hex VARCHAR(7),              -- Color for UI
  icon_name VARCHAR(50),
  sort_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reform_types_category_idx ON reform_types(category_id);

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
  link_url TEXT,
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
-- VIEWS FOR API ACCESS
-- ============================================================================

-- View: All reforms with state and type info
CREATE OR REPLACE VIEW v_state_reforms_detailed AS
SELECT
  r.id,
  tld.state_code,
  tld.state_name,
  tld.country,
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
  tld.region,
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
JOIN top_level_division tld ON p.state_code = tld.state_code
JOIN reform_types rt ON r.reform_type_id = rt.id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
GROUP BY r.id, tld.state_code, tld.state_name, tld.country, rt.code, rt.name, rt.color_hex, rt.sort_order, p.name, p.place_type, tld.region, r.summary, r.notes, r.scope, r.reform_mechanism, r.reform_phase, r.adoption_date, p.latitude, p.longitude, r.created_at
ORDER BY tld.state_name, p.name, rt.sort_order;

-- View: Summary of reforms by state and type
CREATE OR REPLACE VIEW v_reforms_by_state_summary AS
SELECT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  rt.id as reform_type_id,
  rt.code as reform_code,
  rt.name as reform_type,
  rt.color_hex,
  COUNT(r.id) as reform_count
FROM top_level_division tld
LEFT JOIN places p ON p.state_code = tld.state_code
LEFT JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_types rt ON r.reform_type_id = rt.id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country, rt.id, rt.code, rt.name, rt.color_hex
ORDER BY tld.state_name, rt.sort_order;

-- View: States with at least one reform
CREATE OR REPLACE VIEW v_states_with_reforms AS
SELECT DISTINCT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  COUNT(DISTINCT r.id) as total_reforms,
  COUNT(DISTINCT r.reform_type_id) as type_count,
  COUNT(DISTINCT rs.source_id) as source_count,
  MAX(r.adoption_date) as most_recent_reform
FROM top_level_division tld
JOIN places p ON p.state_code = tld.state_code
JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country;

-- View: Reforms by municipality and source
CREATE OR REPLACE VIEW v_reforms_by_municipality AS
SELECT
  p.name as municipality_name,
  tld.state_code,
  tld.state_name,
  tld.country,
  STRING_AGG(DISTINCT src.short_name, ', ') as sources,
  COUNT(DISTINCT r.id) as reform_count,
  COUNT(DISTINCT r.reform_type_id) as type_count,
  p.latitude,
  p.longitude
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
WHERE p.name IS NOT NULL
GROUP BY p.name, tld.state_code, tld.state_name, tld.country, p.latitude, p.longitude
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
-- SAVED SEARCHES TABLE
-- Allows users to save and share search configurations
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY,
    short_id VARCHAR(20) UNIQUE NOT NULL,  -- e.g., '7ef4f'
    
    -- Core filter data (versioned, migratable)
    filter_config JSONB NOT NULL,  -- Store structured filter state
    
    -- Metadata
    title VARCHAR(255),  -- Optional user-provided name
    description TEXT,    -- Optional description
    view_count INT DEFAULT 0,
    
    -- Versioning for migration support
    filter_version INT DEFAULT 1,  -- Increment when schema changes
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP,
    
    -- Future: when you add auth
    -- user_id INTEGER REFERENCES users(id),
    
    -- Indexes
    CONSTRAINT saved_searches_short_id_unique UNIQUE (short_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_short_id ON saved_searches(short_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_created ON saved_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_searches_filter_config ON saved_searches USING GIN(filter_config);

-- ============================================================================
-- PERMISSIONS (uncomment and adjust for your setup)
-- ============================================================================
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO read_only_user;
-- GRANT SELECT ON ALL VIEWS IN SCHEMA public TO read_only_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO read_only_user;
