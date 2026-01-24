/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Bill Submission System
  // Creates tables for user bill submissions, review queue, and adds index for duplicate checking
  // ============================================================================

  const sql = `
-- Create bill_submissions table to track user submissions
CREATE TABLE IF NOT EXISTS bill_submissions (
  id SERIAL PRIMARY KEY,
  submitted_url TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  existing_reform_id INTEGER REFERENCES reforms(id) ON DELETE SET NULL,
  policy_document_id INTEGER REFERENCES policy_documents(id) ON DELETE SET NULL,
  reform_id INTEGER REFERENCES reforms(id) ON DELETE SET NULL,
  assessment_result JSONB,
  error_message TEXT,
  submission_metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bill_review_queue table for bills needing admin review
CREATE TABLE IF NOT EXISTS bill_review_queue (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES bill_submissions(id) ON DELETE CASCADE,
  policy_document_id INTEGER REFERENCES policy_documents(id) ON DELETE CASCADE,
  reason TEXT,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  review_decision VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index on policy_documents.document_url for fast duplicate checking
CREATE INDEX IF NOT EXISTS policy_docs_url_idx ON policy_documents(document_url) WHERE document_url IS NOT NULL;

-- Add indexes for bill_submissions queries
CREATE INDEX IF NOT EXISTS bill_submissions_status_idx ON bill_submissions(status);
CREATE INDEX IF NOT EXISTS bill_submissions_url_idx ON bill_submissions(submitted_url);
CREATE INDEX IF NOT EXISTS bill_submissions_reform_idx ON bill_submissions(reform_id) WHERE reform_id IS NOT NULL;

-- Add indexes for bill_review_queue queries
CREATE INDEX IF NOT EXISTS bill_review_queue_decision_idx ON bill_review_queue(review_decision);
CREATE INDEX IF NOT EXISTS bill_review_queue_submission_idx ON bill_review_queue(submission_id);
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // ============================================================================
  // ROLLBACK: Remove Bill Submission System
  // ============================================================================

  const sql = `
-- Drop indexes
DROP INDEX IF EXISTS bill_review_queue_submission_idx;
DROP INDEX IF EXISTS bill_review_queue_decision_idx;
DROP INDEX IF EXISTS bill_submissions_reform_idx;
DROP INDEX IF EXISTS bill_submissions_url_idx;
DROP INDEX IF EXISTS bill_submissions_status_idx;
DROP INDEX IF EXISTS policy_docs_url_idx;

-- Drop tables
DROP TABLE IF EXISTS bill_review_queue;
DROP TABLE IF EXISTS bill_submissions;
  `;

  pgm.sql(sql);
};
