/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Bill Scraping Fields to policy_documents
  // Adds columns to store structured bill data from scraping
  // ============================================================================

  const sql = `
-- Add bill text storage
ALTER TABLE policy_documents 
  ADD COLUMN IF NOT EXISTS bill_text TEXT,
  ADD COLUMN IF NOT EXISTS bill_text_fetched_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS bill_text_source VARCHAR(50);

-- Add legislative date fields
ALTER TABLE policy_documents 
  ADD COLUMN IF NOT EXISTS date_filed DATE,
  ADD COLUMN IF NOT EXISTS date_introduced DATE,
  ADD COLUMN IF NOT EXISTS date_passed_first_chamber DATE,
  ADD COLUMN IF NOT EXISTS date_passed_second_chamber DATE,
  ADD COLUMN IF NOT EXISTS date_adopted DATE,
  ADD COLUMN IF NOT EXISTS date_signed DATE,
  ADD COLUMN IF NOT EXISTS date_effective DATE;

-- Add vote information (JSONB for flexibility)
ALTER TABLE policy_documents 
  ADD COLUMN IF NOT EXISTS vote_data JSONB;

-- Add legislative metadata
ALTER TABLE policy_documents 
  ADD COLUMN IF NOT EXISTS sponsors TEXT[],
  ADD COLUMN IF NOT EXISTS committees TEXT[],
  ADD COLUMN IF NOT EXISTS legislative_history JSONB;

-- Add scraping metadata
ALTER TABLE policy_documents 
  ADD COLUMN IF NOT EXISTS scraping_metadata JSONB;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS policy_docs_bill_text_fetched_idx 
  ON policy_documents(bill_text_fetched_at) 
  WHERE bill_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS policy_docs_date_introduced_idx 
  ON policy_documents(date_introduced) 
  WHERE date_introduced IS NOT NULL;

CREATE INDEX IF NOT EXISTS policy_docs_date_effective_idx 
  ON policy_documents(date_effective) 
  WHERE date_effective IS NOT NULL;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE policy_documents 
      DROP COLUMN IF EXISTS bill_text,
      DROP COLUMN IF EXISTS bill_text_fetched_at,
      DROP COLUMN IF EXISTS bill_text_source,
      DROP COLUMN IF EXISTS date_filed,
      DROP COLUMN IF EXISTS date_introduced,
      DROP COLUMN IF EXISTS date_passed_first_chamber,
      DROP COLUMN IF EXISTS date_passed_second_chamber,
      DROP COLUMN IF EXISTS date_adopted,
      DROP COLUMN IF EXISTS date_signed,
      DROP COLUMN IF EXISTS date_effective,
      DROP COLUMN IF EXISTS vote_data,
      DROP COLUMN IF EXISTS sponsors,
      DROP COLUMN IF EXISTS committees,
      DROP COLUMN IF EXISTS legislative_history,
      DROP COLUMN IF EXISTS scraping_metadata;
    
    DROP INDEX IF EXISTS policy_docs_bill_text_fetched_idx;
    DROP INDEX IF EXISTS policy_docs_date_introduced_idx;
    DROP INDEX IF EXISTS policy_docs_date_effective_idx;
  `);
};
