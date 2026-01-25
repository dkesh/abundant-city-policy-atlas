/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add reform_distinguished_pairs
  // Stores pairs of reforms that an admin has marked as distinct (not duplicates).
  // Used by the Merge tab to exclude those pairs from suspected-duplicate candidates.
  // ============================================================================

  const sql = `
CREATE TABLE IF NOT EXISTS reform_distinguished_pairs (
  reform_id_1 INTEGER NOT NULL REFERENCES reforms(id) ON DELETE CASCADE,
  reform_id_2 INTEGER NOT NULL REFERENCES reforms(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reform_id_1, reform_id_2),
  CHECK (reform_id_1 < reform_id_2)
);
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  const sql = `
DROP TABLE IF EXISTS reform_distinguished_pairs;
  `;

  pgm.sql(sql);
};
