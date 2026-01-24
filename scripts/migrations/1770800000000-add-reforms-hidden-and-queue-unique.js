/* eslint-disable camelcase */

exports.up = (pgm) => {
  const sql = `
-- reforms.hidden: hide rejected submission-based reforms from public views
ALTER TABLE reforms ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS reforms_hidden_idx ON reforms(hidden) WHERE hidden = true;

-- One queue row per submission; replace non-unique index with unique constraint
DROP INDEX IF EXISTS bill_review_queue_submission_idx;
ALTER TABLE bill_review_queue ADD CONSTRAINT bill_review_queue_submission_id_key UNIQUE (submission_id);
  `;
  pgm.sql(sql);
};

exports.down = (pgm) => {
  const sql = `
ALTER TABLE bill_review_queue DROP CONSTRAINT IF EXISTS bill_review_queue_submission_id_key;
CREATE INDEX IF NOT EXISTS bill_review_queue_submission_idx ON bill_review_queue(submission_id);
DROP INDEX IF EXISTS reforms_hidden_idx;
ALTER TABLE reforms DROP COLUMN IF EXISTS hidden;
  `;
  pgm.sql(sql);
};
