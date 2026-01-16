/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add AI Enrichment Fields
  // Adds JSONB columns to track AI-enriched fields separately from tracker data
  // ============================================================================

  const sql = `
-- Add AI enrichment columns to reforms table
ALTER TABLE reforms ADD COLUMN IF NOT EXISTS ai_enriched_fields JSONB DEFAULT NULL;
ALTER TABLE reforms ADD COLUMN IF NOT EXISTS ai_enrichment_version INT DEFAULT NULL;
ALTER TABLE reforms ADD COLUMN IF NOT EXISTS ai_enriched_at TIMESTAMP DEFAULT NULL;

-- Add AI enrichment columns to policy_documents table
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS ai_enriched_fields JSONB DEFAULT NULL;
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS ai_enrichment_version INT DEFAULT NULL;
ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS ai_enriched_at TIMESTAMP DEFAULT NULL;

-- Index for finding unenriched records
CREATE INDEX IF NOT EXISTS reforms_ai_version_idx ON reforms(ai_enrichment_version) WHERE ai_enrichment_version IS NULL;

-- Create AI enrichment runs tracking table
CREATE TABLE IF NOT EXISTS ai_enrichment_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  enrichment_version INT NOT NULL,
  ai_provider VARCHAR(50),        -- 'anthropic' or 'openai'
  ai_model VARCHAR(100),          -- e.g., 'claude-3-5-sonnet-20241022'
  reforms_processed INT DEFAULT 0,
  reforms_enriched INT DEFAULT 0,
  reforms_failed INT DEFAULT 0,
  policy_docs_enriched INT DEFAULT 0,
  citations_discovered INT DEFAULT 0,
  status VARCHAR(50),             -- 'running', 'completed', 'failed'
  error_message TEXT
);

-- Index for enrichment runs
CREATE INDEX IF NOT EXISTS ai_enrichment_runs_version_idx ON ai_enrichment_runs(enrichment_version);
CREATE INDEX IF NOT EXISTS ai_enrichment_runs_status_idx ON ai_enrichment_runs(status);
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // ============================================================================
  // ROLLBACK: Remove AI Enrichment Fields
  // ============================================================================

  const sql = `
-- Drop tracking table
DROP TABLE IF EXISTS ai_enrichment_runs;

-- Remove columns from reforms table
ALTER TABLE reforms DROP COLUMN IF EXISTS ai_enriched_fields;
ALTER TABLE reforms DROP COLUMN IF EXISTS ai_enrichment_version;
ALTER TABLE reforms DROP COLUMN IF EXISTS ai_enriched_at;

-- Remove columns from policy_documents table
ALTER TABLE policy_documents DROP COLUMN IF EXISTS ai_enriched_fields;
ALTER TABLE policy_documents DROP COLUMN IF EXISTS ai_enrichment_version;
ALTER TABLE policy_documents DROP COLUMN IF EXISTS ai_enriched_at;

-- Drop indexes
DROP INDEX IF EXISTS reforms_ai_version_idx;
  `;

  pgm.sql(sql);
};
