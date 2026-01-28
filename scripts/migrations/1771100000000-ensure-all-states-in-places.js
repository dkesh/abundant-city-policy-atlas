/**
 * Migration: Ensure All States Exist in Places Table
 * 
 * This migration ensures that every state/province in top_level_division
 * has a corresponding entry in the places table with synced population data.
 * This simplifies queries by making places.population the single source of truth.
 */

exports.up = async (pgm) => {
  console.log('Starting migration: Ensure all states exist in places table...');
  
  // Phase 1: Insert missing state entries into places table
  console.log('Phase 1: Inserting missing state entries into places table...');
  const insertResult = await pgm.db.query(`
    INSERT INTO places (name, place_type, state_code, population, latitude, longitude, encoded_name)
    SELECT 
      tld.state_name,
      'state'::place_type,
      tld.state_code,
      tld.population,
      NULL,
      NULL,
      NULL
    FROM top_level_division tld
    WHERE NOT EXISTS (
      SELECT 1 FROM places p 
      WHERE p.place_type = 'state' 
        AND p.state_code = tld.state_code
    )
    ON CONFLICT (name, state_code, place_type) DO NOTHING
    RETURNING id, name, state_code, population
  `);
  
  console.log(`Inserted ${insertResult.rows.length} new state entries into places table`);
  if (insertResult.rows.length > 0) {
    insertResult.rows.forEach(row => {
      console.log(`  Created: ${row.name} (${row.state_code}) - Population: ${row.population ? row.population.toLocaleString() : 'NULL'}`);
    });
  }
  
  // Phase 2: Sync population from top_level_division to places for all states
  console.log('Phase 2: Syncing population data from top_level_division to places...');
  const syncResult = await pgm.db.query(`
    UPDATE places p
    SET population = tld.population, updated_at = CURRENT_TIMESTAMP
    FROM top_level_division tld
    WHERE p.place_type = 'state'
      AND p.state_code = tld.state_code
      AND tld.population IS NOT NULL
      AND (p.population IS NULL OR p.population != tld.population)
    RETURNING p.id, p.name, p.state_code, p.population
  `);
  
  console.log(`Synced population for ${syncResult.rows.length} state entries`);
  if (syncResult.rows.length > 0) {
    syncResult.rows.forEach(row => {
      console.log(`  Updated: ${row.name} (${row.state_code}) - Population: ${row.population.toLocaleString()}`);
    });
  }
  
  // Verification
  console.log('Verification: Checking state coverage...');
  const verifyResult = await pgm.db.query(`
    SELECT 
      COUNT(DISTINCT tld.state_code) as total_states,
      COUNT(DISTINCT p.id) as states_in_places,
      COUNT(DISTINCT CASE WHEN p.population IS NOT NULL THEN p.id END) as states_with_population
    FROM top_level_division tld
    LEFT JOIN places p ON p.place_type = 'state' AND p.state_code = tld.state_code
  `);
  
  const stats = verifyResult.rows[0];
  console.log(`Total states in top_level_division: ${stats.total_states}`);
  console.log(`States in places table: ${stats.states_in_places}`);
  console.log(`States with population: ${stats.states_with_population}`);
  
  if (parseInt(stats.total_states) !== parseInt(stats.states_in_places)) {
    console.log(`⚠️  Warning: Not all states have entries in places table`);
    
    const missingResult = await pgm.db.query(`
      SELECT tld.state_code, tld.state_name, tld.country
      FROM top_level_division tld
      WHERE NOT EXISTS (
        SELECT 1 FROM places p 
        WHERE p.place_type = 'state' 
          AND p.state_code = tld.state_code
      )
      ORDER BY tld.country, tld.state_code
    `);
    
    if (missingResult.rows.length > 0) {
      console.log('Missing states:');
      missingResult.rows.forEach(row => {
        console.log(`  ${row.state_code} - ${row.state_name} (${row.country})`);
      });
    }
  }
  
  console.log('Migration completed successfully');
};

exports.down = async (pgm) => {
  console.log('Rolling back: This migration does not remove state entries from places table');
  console.log('State entries in places table will remain, but population sync will be undone');
  
  // Note: We don't remove state entries from places table on rollback
  // because they may have been created for other reasons (e.g., having reforms)
  // We only clear the population sync
  await pgm.db.query(`
    UPDATE places 
    SET population = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE place_type = 'state'
  `);
  
  console.log('Rollback completed (population cleared from state places)');
};
