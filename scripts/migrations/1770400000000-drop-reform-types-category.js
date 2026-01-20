/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Drop denormalized reform_types.category column
  // Category is resolved via reform_types.category_id -> categories.name.
  // All references have been updated to use c.name from JOIN categories.
  // ============================================================================
  pgm.sql(`
    ALTER TABLE reform_types DROP COLUMN IF EXISTS category;
  `);
};

exports.down = (pgm) => {
  // Restore the denormalized category column and populate from category_id
  pgm.sql(`
    ALTER TABLE reform_types ADD COLUMN IF NOT EXISTS category VARCHAR(50);
    UPDATE reform_types rt
    SET category = c.name
    FROM categories c
    WHERE rt.category_id = c.id;
  `);
};
