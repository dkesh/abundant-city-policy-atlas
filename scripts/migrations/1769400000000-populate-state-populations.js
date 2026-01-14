/**
 * Migration: Populate State/Province Populations
 * 
 * Populates the population field in top_level_division table with
 * 2024 US Census Bureau estimates (most recent reliable data as of 2025).
 * Also updates places table entries for state-level jurisdictions.
 * 
 * Data sources:
 * - US States: US Census Bureau 2024 estimates
 * - US Territories: US Census Bureau estimates
 * - Canadian Provinces: Statistics Canada 2024 estimates
 */

exports.up = async (pgm) => {
  console.log('Starting migration: Populate state/province populations...');
  
  // US State populations (2024 estimates from US Census Bureau)
  const usStatePopulations = {
    // Northeast Region
    'CT': 3626205,   // Connecticut
    'ME': 1393723,   // Maine
    'MA': 7029917,   // Massachusetts
    'NH': 1395231,   // New Hampshire
    'RI': 1095610,   // Rhode Island
    'VT': 647464,    // Vermont
    'NJ': 9288994,   // New Jersey
    'NY': 19980472,  // New York
    'PA': 13002700,  // Pennsylvania
    
    // Midwest Region
    'IL': 12601467,  // Illinois
    'IN': 6833038,   // Indiana
    'MI': 10034113,  // Michigan
    'OH': 11799448,  // Ohio
    'WI': 5892539,   // Wisconsin
    'IA': 3200517,   // Iowa
    'KS': 2937150,   // Kansas
    'MN': 5706494,   // Minnesota
    'MO': 6177957,   // Missouri
    'NE': 1963692,   // Nebraska
    'ND': 783926,    // North Dakota
    'SD': 909824,    // South Dakota
    
    // South Region
    'DE': 1018396,   // Delaware
    'FL': 22610726,  // Florida
    'GA': 11049515,  // Georgia
    'MD': 6164660,   // Maryland
    'NC': 10698973,  // North Carolina
    'SC': 5282634,   // South Carolina
    'VA': 8701929,   // Virginia
    'WV': 1793716,   // West Virginia
    'DC': 678972,    // District of Columbia
    'AL': 5074296,   // Alabama
    'KY': 4509349,   // Kentucky
    'MS': 2940057,   // Mississippi
    'TN': 7051339,   // Tennessee
    'AR': 3033949,   // Arkansas
    'LA': 4657757,   // Louisiana
    'OK': 4041763,   // Oklahoma
    'TX': 30462592,  // Texas
    
    // West Region
    'AZ': 7421401,   // Arizona
    'CO': 5893634,   // Colorado
    'ID': 1945353,   // Idaho
    'MT': 1122867,   // Montana
    'NV': 3177772,   // Nevada
    'NM': 2114654,   // New Mexico
    'UT': 3380800,   // Utah
    'WY': 584153,    // Wyoming
    'AK': 733406,    // Alaska
    'CA': 39029342,  // California
    'HI': 1440196,   // Hawaii
    'OR': 4237256,   // Oregon
    'WA': 7797095,   // Washington
    
    // US Territories
    'PR': 3263584,   // Puerto Rico (2023 estimate)
    'VI': 105413,    // US Virgin Islands (2023 estimate)
    'GU': 172952,    // Guam (2023 estimate)
    'AS': 43641,     // American Samoa (2023 estimate)
    'MP': 51594,     // Northern Mariana Islands (2023 estimate)
  };
  
  // Canadian Province/Territory populations (2024 estimates from Statistics Canada)
  const canadianProvincePopulations = {
    // Western Provinces
    'AB': 4732746,   // Alberta
    'BC': 5400879,   // British Columbia
    'MB': 1429406,   // Manitoba
    'SK': 1207778,   // Saskatchewan
    
    // Eastern Provinces
    'NB': 834691,    // New Brunswick
    'NL': 536291,    // Newfoundland and Labrador
    'NS': 1061663,   // Nova Scotia
    'ON': 15780123, // Ontario
    'PE': 173787,    // Prince Edward Island
    'QC': 8919043,   // Quebec
    
    // Northern Territories
    'NT': 45661,     // Northwest Territories
    'NU': 40453,     // Nunavut
    'YT': 44881,     // Yukon
  };
  
  // Update top_level_division table
  // Use UPDATE with WHERE EXISTS to only update records that exist
  // This avoids errors if seed data hasn't been run yet
  console.log('Updating top_level_division table...');
  let updatedCount = 0;
  let notFoundCount = 0;
  
  // Update US states and territories
  for (const [stateCode, population] of Object.entries(usStatePopulations)) {
    const result = await pgm.db.query(`
      UPDATE top_level_division 
      SET population = $1, updated_at = CURRENT_TIMESTAMP
      WHERE state_code = $2 AND country = 'US'
      RETURNING state_name
    `, [population, stateCode]);
    
    if (result.rows.length > 0) {
      console.log(`  Updated ${result.rows[0].state_name} (${stateCode}): ${population.toLocaleString()}`);
      updatedCount++;
    } else {
      console.log(`  Warning: State code ${stateCode} not found in database`);
      notFoundCount++;
    }
  }
  
  // Update Canadian provinces and territories
  for (const [provinceCode, population] of Object.entries(canadianProvincePopulations)) {
    const result = await pgm.db.query(`
      UPDATE top_level_division 
      SET population = $1, updated_at = CURRENT_TIMESTAMP
      WHERE state_code = $2 AND country = 'CA'
      RETURNING state_name
    `, [population, provinceCode]);
    
    if (result.rows.length > 0) {
      console.log(`  Updated ${result.rows[0].state_name} (${provinceCode}): ${population.toLocaleString()}`);
      updatedCount++;
    } else {
      console.log(`  Warning: Province code ${provinceCode} not found in database`);
      notFoundCount++;
    }
  }
  
  if (notFoundCount > 0) {
    console.log(`\n⚠️  Warning: ${notFoundCount} state/province codes were not found in the database.`);
    console.log('   This usually means the migration to add provinces/territories has not been run yet.');
    console.log('   Please ensure all previous migrations have been run, including the one that');
    console.log('   adds Canadian provinces and US territories to the top_level_division table.');
    console.log('');
  }
  
  console.log(`Updated ${updatedCount} state/province populations in top_level_division`);
  
  // Update places table for state-level entries
  // This ensures that state-level places also have population data
  console.log('Updating places table for state-level entries...');
  const placesUpdateResult = await pgm.db.query(`
    UPDATE places p
    SET population = tld.population, updated_at = CURRENT_TIMESTAMP
    FROM top_level_division tld
    WHERE p.place_type = 'state'
      AND p.state_code = tld.state_code
      AND tld.population IS NOT NULL
      AND (p.population IS NULL OR p.population != tld.population)
    RETURNING p.id, p.name, p.state_code, p.population
  `);
  
  console.log(`Updated ${placesUpdateResult.rows.length} state-level entries in places table`);
  
  // Verify populations were set
  const verifyResult = await pgm.db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(population) as with_population,
      COUNT(*) - COUNT(population) as without_population
    FROM top_level_division
  `);
  
  const stats = verifyResult.rows[0];
  console.log(`Verification: ${stats.with_population}/${stats.total} states/provinces have population data`);
  
  if (stats.without_population > 0) {
    console.log(`Warning: ${stats.without_population} states/provinces still missing population data`);
    
    // List states without population
    const missingResult = await pgm.db.query(`
      SELECT state_code, state_name, country
      FROM top_level_division
      WHERE population IS NULL
      ORDER BY country, state_code
    `);
    
    if (missingResult.rows.length > 0) {
      console.log('States/provinces without population data:');
      missingResult.rows.forEach(row => {
        console.log(`  ${row.state_code} - ${row.state_name} (${row.country})`);
      });
    }
  }
  
  console.log('Migration completed successfully');
};

exports.down = async (pgm) => {
  console.log('Rolling back: Clearing state/province populations...');
  
  // Clear population data from top_level_division
  await pgm.db.query(`
    UPDATE top_level_division 
    SET population = NULL, updated_at = CURRENT_TIMESTAMP
  `);
  
  // Clear population data from state-level places entries
  await pgm.db.query(`
    UPDATE places 
    SET population = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE place_type = 'state'
  `);
  
  console.log('Rollback completed');
};
