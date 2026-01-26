/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Activity Logs System
  // Creates unified table to track all system activities (ingestion, scraping, enrichment, submissions, admin actions)
  // ============================================================================

  const sql = `
-- Create activity_logs table to track all system activities
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  log_type VARCHAR(50) NOT NULL,  -- 'ingestion', 'bill_scraping', 'ai_enrichment', 'bill_submission', 'admin_action'
  action VARCHAR(100) NOT NULL,    -- e.g., 'prn_municipalities', 'merge_reforms', 'accept_submission'
  status VARCHAR(50) NOT NULL,     -- 'success', 'failed', 'running', 'partial'
  metadata JSONB,                  -- Flexible JSON for type-specific data
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_status ON activity_logs(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type_created ON activity_logs(log_type, created_at DESC);
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // ============================================================================
  // ROLLBACK: Remove Activity Logs System
  // ============================================================================

  const sql = `
-- Drop indexes
DROP INDEX IF EXISTS idx_activity_logs_type_created;
DROP INDEX IF EXISTS idx_activity_logs_status;
DROP INDEX IF EXISTS idx_activity_logs_created;
DROP INDEX IF EXISTS idx_activity_logs_action;
DROP INDEX IF EXISTS idx_activity_logs_type;

-- Drop table
DROP TABLE IF EXISTS activity_logs;
  `;

  pgm.sql(sql);
};
