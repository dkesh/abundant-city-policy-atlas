/* eslint-disable camelcase */
/* eslint-disable no-console */

const https = require('https');

/**
 * Migration: Add Missing Canadian Provinces and US Territories
 * 
 * Adds Canadian provinces and US territories to top_level_division table
 * that may be missing, and populates their geometries from Natural Earth.
 * 
 * This migration runs before the population migration to ensure all
 * records exist before population data is added.
 */

// Natural Earth admin_1 states/provinces GeoJSON URL
const NATURAL_EARTH_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';

// Mapping of Natural Earth ISO codes to our state codes for Canadian provinces
const CANADA_ISO_TO_STATE_CODE = {
  'CA-AB': 'AB', // Alberta
  'CA-BC': 'BC', // British Columbia
  'CA-MB': 'MB', // Manitoba
  'CA-NB': 'NB', // New Brunswick
  'CA-NL': 'NL', // Newfoundland and Labrador
  'CA-NS': 'NS', // Nova Scotia
  'CA-NT': 'NT', // Northwest Territories
  'CA-NU': 'NU', // Nunavut
  'CA-ON': 'ON', // Ontario
  'CA-PE': 'PE', // Prince Edward Island
  'CA-QC': 'QC', // Quebec
  'CA-SK': 'SK', // Saskatchewan
  'CA-YT': 'YT', // Yukon
};

// Name-based mapping for territories and provinces (fallback)
const NAME_TO_STATE_CODE = {
  // US Territories
  'Puerto Rico': 'PR',
  'US Virgin Islands': 'VI',
  'Virgin Islands': 'VI',
  'Guam': 'GU',
  'American Samoa': 'AS',
  'Northern Mariana Islands': 'MP',
  'Northern Marianas': 'MP',
  // Canadian Provinces/Territories
  'Alberta': 'AB',
  'British Columbia': 'BC',
  'Manitoba': 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Newfoundland': 'NL',
  'Nova Scotia': 'NS',
  'Ontario': 'ON',
  'Prince Edward Island': 'PE',
  'Quebec': 'QC',
  'Saskatchewan': 'SK',
  'Northwest Territories': 'NT',
  'Nunavut': 'NU',
  'Yukon': 'YT',
  'Yukon Territory': 'YT',
};

// Data for Canadian provinces and US territories
const MISSING_RECORDS = {
  // US Territories
  'PR': { state_name: 'Puerto Rico', country: 'US', region: 'US Territories', subregion: 'Caribbean' },
  'VI': { state_name: 'US Virgin Islands', country: 'US', region: 'US Territories', subregion: 'Caribbean' },
  'GU': { state_name: 'Guam', country: 'US', region: 'US Territories', subregion: 'Pacific' },
  'AS': { state_name: 'American Samoa', country: 'US', region: 'US Territories', subregion: 'Pacific' },
  'MP': { state_name: 'Northern Mariana Islands', country: 'US', region: 'US Territories', subregion: 'Pacific' },
  // Canadian Provinces - Western
  'AB': { state_name: 'Alberta', country: 'CA', region: 'Canada', subregion: 'Western' },
  'BC': { state_name: 'British Columbia', country: 'CA', region: 'Canada', subregion: 'Western' },
  'MB': { state_name: 'Manitoba', country: 'CA', region: 'Canada', subregion: 'Western' },
  'SK': { state_name: 'Saskatchewan', country: 'CA', region: 'Canada', subregion: 'Western' },
  // Canadian Provinces - Eastern
  'NB': { state_name: 'New Brunswick', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  'NL': { state_name: 'Newfoundland and Labrador', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  'NS': { state_name: 'Nova Scotia', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  'ON': { state_name: 'Ontario', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  'PE': { state_name: 'Prince Edward Island', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  'QC': { state_name: 'Quebec', country: 'CA', region: 'Canada', subregion: 'Eastern' },
  // Canadian Territories - Northern
  'NT': { state_name: 'Northwest Territories', country: 'CA', region: 'Canada', subregion: 'Northern' },
  'NU': { state_name: 'Nunavut', country: 'CA', region: 'Canada', subregion: 'Northern' },
  'YT': { state_name: 'Yukon', country: 'CA', region: 'Canada', subregion: 'Northern' },
};

/**
 * Download GeoJSON from URL
 */
async function downloadGeoJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download GeoJSON: ${res.statusCode} ${res.statusMessage}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const geoJSON = JSON.parse(data);
          resolve(geoJSON);
        } catch (error) {
          reject(new Error(`Failed to parse GeoJSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Download error: ${error.message}`));
    });
  });
}

/**
 * Match Natural Earth feature to our state_code
 */
function matchStateCode(feature) {
  const props = feature.properties;
  
  // Try multiple property name variations for country code
  const countryCode = props.adm0_a3 || props.ADM0_A3 || props.iso_a2 || props.ISO_A2;
  const isUSA = countryCode === 'USA' || countryCode === 'US';
  const isCAN = countryCode === 'CAN' || countryCode === 'CA';
  
  // For US states and territories, try multiple property names
  if (isUSA) {
    // Try postal code (most reliable for US states)
    const postal = props.postal || props.POSTAL || props.postal_code || props.POSTAL_CODE;
    if (postal && postal.length === 2) {
      return postal.toUpperCase();
    }
    
    // Try STUSPS
    const stusps = props.stusps || props.STUSPS || props.stusps_code || props.STUSPS_CODE;
    if (stusps && stusps.length === 2) {
      return stusps.toUpperCase();
    }
    
    // Try ISO_3166_2 (format: US-XX)
    const iso3166 = props.iso_3166_2 || props.ISO_3166_2;
    if (iso3166 && iso3166.startsWith('US-')) {
      return iso3166.substring(3).toUpperCase();
    }
    
    // For territories, match by name (fallback)
    const name = props.name || props.NAME || props.name_en || props.NAME_EN || props.name_long || props.NAME_LONG || props.name_alt || props.NAME_ALT;
    if (name) {
      const normalizedName = name.trim();
      if (NAME_TO_STATE_CODE[normalizedName]) {
        return NAME_TO_STATE_CODE[normalizedName];
      }
    }
  }
  
  // For Canadian provinces, convert ISO_3166_2 to state code
  if (isCAN) {
    const iso3166 = props.iso_3166_2 || props.ISO_3166_2;
    if (iso3166) {
      const isoCode = iso3166.toUpperCase();
      if (CANADA_ISO_TO_STATE_CODE[isoCode]) {
        return CANADA_ISO_TO_STATE_CODE[isoCode];
      }
    }
    
    // Try postal code for Canada
    const postal = props.postal || props.POSTAL || props.postal_code || props.POSTAL_CODE;
    if (postal && postal.length === 2) {
      // Verify it's a valid Canadian province code
      if (CANADA_ISO_TO_STATE_CODE[`CA-${postal.toUpperCase()}`]) {
        return postal.toUpperCase();
      }
    }
    
    // Fallback: match by name for Canadian provinces
    const name = props.name || props.NAME || props.name_en || props.NAME_EN || props.name_long || props.NAME_LONG || props.name_alt || props.NAME_ALT;
    if (name) {
      const normalizedName = name.trim();
      if (NAME_TO_STATE_CODE[normalizedName]) {
        return NAME_TO_STATE_CODE[normalizedName];
      }
    }
  }
  
  return null;
}

/**
 * Convert GeoJSON geometry to PostGIS geometry string
 */
function geometryToPostGIS(geometry) {
  return JSON.stringify(geometry);
}

exports.up = async (pgm) => {
  console.log('Starting migration: Add missing Canadian provinces and US territories...');
  
  try {
    // Step 1: Check which records already exist
    const existingResult = await pgm.db.query(`
      SELECT state_code, country 
      FROM top_level_division
    `);
    
    const existingKeys = new Set(
      existingResult.rows.map(row => `${row.state_code}:${row.country}`)
    );
    
    // Step 2: Insert missing records (without geometry first)
    console.log('Inserting missing records...');
    let insertedCount = 0;
    const recordsToGeocode = [];
    
    for (const [stateCode, data] of Object.entries(MISSING_RECORDS)) {
      const key = `${stateCode}:${data.country}`;
      if (!existingKeys.has(key)) {
        await pgm.db.query(`
          INSERT INTO top_level_division (state_code, state_name, country, region, subregion)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (state_code) DO NOTHING
        `, [stateCode, data.state_name, data.country, data.region, data.subregion]);
        
        console.log(`  Inserted ${data.state_name} (${stateCode})`);
        insertedCount++;
        recordsToGeocode.push(stateCode);
      } else {
        console.log(`  ${data.state_name} (${stateCode}) already exists, skipping insert`);
        // Check if it needs geometry
        const existing = existingResult.rows.find(r => r.state_code === stateCode && r.country === data.country);
        if (existing) {
          const hasGeometry = await pgm.db.query(`
            SELECT geom IS NOT NULL as has_geom
            FROM top_level_division
            WHERE state_code = $1 AND country = $2
          `, [stateCode, data.country]);
          
          if (!hasGeometry.rows[0].has_geom) {
            recordsToGeocode.push(stateCode);
          }
        }
      }
    }
    
    console.log(`Inserted ${insertedCount} new records`);
    
    // Step 3: Download Natural Earth GeoJSON
    if (recordsToGeocode.length > 0) {
      console.log('Downloading Natural Earth GeoJSON...');
      const geoJSON = await downloadGeoJSON(NATURAL_EARTH_URL);
      console.log(`Downloaded ${geoJSON.features.length} features`);
      
      // Step 4: Build mapping of state_code to features
      const stateCodeToFeature = new Map();
      for (const feature of geoJSON.features) {
        const stateCode = matchStateCode(feature);
        if (stateCode && recordsToGeocode.includes(stateCode)) {
          stateCodeToFeature.set(stateCode, feature);
        }
      }
      
      console.log(`Matched ${stateCodeToFeature.size} features for geocoding`);
      
      // Step 5: Update geometries for matched records
      let geocodedCount = 0;
      for (const stateCode of recordsToGeocode) {
        const feature = stateCodeToFeature.get(stateCode);
        const recordData = MISSING_RECORDS[stateCode];
        
        if (feature && feature.geometry) {
          const geomJSON = geometryToPostGIS(feature.geometry);
          
          await pgm.db.query(`
            UPDATE top_level_division 
            SET geom = ST_Multi(ST_GeomFromGeoJSON($1::json))::geometry(MULTIPOLYGON, 4326), 
                updated_at = CURRENT_TIMESTAMP
            WHERE state_code = $2 AND country = $3
          `, [geomJSON, stateCode, recordData.country]);
          
          console.log(`  Added geometry for ${recordData.state_name} (${stateCode})`);
          geocodedCount++;
        } else {
          console.log(`  Warning: No geometry found for ${recordData.state_name} (${stateCode})`);
        }
      }
      
      console.log(`Added geometries for ${geocodedCount} records`);
    } else {
      console.log('No records need geocoding');
    }
    
    // Step 6: Verify results
    const verifyResult = await pgm.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN country = 'US' THEN 1 END) as us_count,
        COUNT(CASE WHEN country = 'CA' THEN 1 END) as ca_count,
        COUNT(geom) as with_geometry
      FROM top_level_division
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`\nVerification:`);
    console.log(`  Total records: ${stats.total}`);
    console.log(`  US records: ${stats.us_count}`);
    console.log(`  Canadian records: ${stats.ca_count}`);
    console.log(`  Records with geometry: ${stats.with_geometry}`);
    
    console.log('\nMigration completed successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

exports.down = async (pgm) => {
  console.log('Rolling back: Removing added provinces and territories...');
  
  // Remove the records we added (but be careful not to remove US states)
  const stateCodesToRemove = Object.keys(MISSING_RECORDS);
  
  await pgm.db.query(`
    DELETE FROM top_level_division
    WHERE state_code = ANY($1)
  `, [stateCodesToRemove]);
  
  console.log('Rollback completed');
};
