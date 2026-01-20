/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Advocacy Organizations and Communications
  // Creates tables for advocacy organizations, their relationships to places,
  // and advocate communications linked to reforms
  // ============================================================================

  const sql = `
-- ============================================================================
-- ADVOCACY ORGANIZATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS advocacy_organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  website_url TEXT,
  logo_url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS advocacy_organizations_name_idx ON advocacy_organizations(name);

-- ============================================================================
-- ADVOCACY ORGANIZATION PLACES JUNCTION TABLE
-- Many-to-many relationship between advocacy organizations and places/jurisdictions
-- ============================================================================
CREATE TABLE IF NOT EXISTS advocacy_organization_places (
  advocacy_organization_id INTEGER NOT NULL REFERENCES advocacy_organizations(id) ON DELETE CASCADE,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (advocacy_organization_id, place_id)
);

CREATE INDEX IF NOT EXISTS advocacy_organization_places_org_idx ON advocacy_organization_places(advocacy_organization_id);
CREATE INDEX IF NOT EXISTS advocacy_organization_places_place_idx ON advocacy_organization_places(place_id);

-- ============================================================================
-- ADVOCATE COMMUNICATIONS TABLE
-- Links advocacy organizations to specific reforms with communication details
-- ============================================================================
CREATE TABLE IF NOT EXISTS advocate_communications (
  id SERIAL PRIMARY KEY,
  reform_id INTEGER NOT NULL REFERENCES reforms(id) ON DELETE CASCADE,
  advocacy_organization_id INTEGER NOT NULL REFERENCES advocacy_organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(500),
  full_text TEXT,
  communication_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS advocate_communications_reform_idx ON advocate_communications(reform_id);
CREATE INDEX IF NOT EXISTS advocate_communications_org_idx ON advocate_communications(advocacy_organization_id);
CREATE INDEX IF NOT EXISTS advocate_communications_date_idx ON advocate_communications(communication_date);

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER FOR advocacy_organizations
-- ============================================================================
CREATE TRIGGER advocacy_organizations_update_timestamp
BEFORE UPDATE ON advocacy_organizations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER FOR advocate_communications
-- ============================================================================
CREATE TRIGGER advocate_communications_update_timestamp
BEFORE UPDATE ON advocate_communications
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert migration
  const sql = `
-- Drop triggers
DROP TRIGGER IF EXISTS advocate_communications_update_timestamp ON advocate_communications;
DROP TRIGGER IF EXISTS advocacy_organizations_update_timestamp ON advocacy_organizations;

-- Drop tables (in reverse order due to foreign keys)
DROP TABLE IF EXISTS advocate_communications;
DROP TABLE IF EXISTS advocacy_organization_places;
DROP TABLE IF EXISTS advocacy_organizations;
  `;

  pgm.sql(sql);
};
