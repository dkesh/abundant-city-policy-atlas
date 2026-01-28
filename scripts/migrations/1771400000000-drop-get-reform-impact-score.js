/**
 * Migration: Drop get_reform_impact_score
 *
 * Removes the stub function that was created by earlier runs of
 * 1771200000000 before it was updated to use the full inline formula.
 * No-op if the function was never created (e.g. fresh install with updated 1771200000000).
 */

exports.up = async (pgm) => {
  await pgm.db.query('DROP FUNCTION IF EXISTS get_reform_impact_score(text[], text[], text[], text)');
};

exports.down = async () => {
  // Function was optional; no need to recreate stub
};
