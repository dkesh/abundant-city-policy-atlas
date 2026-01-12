-- ============================================================================
-- INIT DATABASE
-- ============================================================================
-- 
-- This file is a convenience wrapper that loads the schema and seed data.
-- The database structure has been separated into:
--   - schema.sql: Creates all tables, views, functions, triggers, and indexes
--   - seed-data.sql: Populates initial reference data (reform types, sources, states)
--
-- To initialize the database, run:
--   1. schema.sql (creates structure)
--   2. seed-data.sql (populates initial data)
--
-- Or use this file which combines both (for backward compatibility).
-- ============================================================================

\i schema.sql
\i seed-data.sql
