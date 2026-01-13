/* eslint-disable camelcase */
/* eslint-disable no-console */

const https = require('https');
const { promisify } = require('util');

/**
 * Migration: Populate state geometries in top_level_division table
 * 
 * Downloads GeoJSON from Natural Earth (admin_1_states_provinces) and
 * matches features to top_level_division records by state_code.
 * 
 * Natural Earth uses:
 * - STUSPS (2-letter code) for US states
 * - ISO_3166_2 (e.g., "CA-BC") for Canadian provinces
 * 
 * This migration:
 * 1. Downloads Natural Earth admin_1 GeoJSON
 * 2. Parses the GeoJSON FeatureCollection
 * 3. Matches features to top_level_division by state_code
 * 4. Updates geom column using PostGIS ST_GeomFromGeoJSON
 */

// Natural Earth admin_1 states/provinces GeoJSON URL (10m resolution - good balance of detail/size)
const NATURAL_EARTH_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';

// Mapping of Natural Earth ISO codes to our state codes for Canadian provinces
// Natural Earth uses ISO_3166_2 format (e.g., "CA-BC"), we use just the province code (e.g., "BC")
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
  // PostGIS ST_GeomFromGeoJSON expects the full GeoJSON geometry object
  // We'll pass it as a JSON string
  return JSON.stringify(geometry);
}

exports.up = async (pgm) => {
  console.log('Starting migration: Populate state geometries...');
  
  try {
    // Step 0: Alter column type to accept both Polygon and MultiPolygon
    // Some states (like Hawaii) have MultiPolygon geometries (multiple islands)
    console.log('Updating geometry column type to accept Polygon and MultiPolygon...');
    
    // Check current column type
    const colCheck = await pgm.db.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'top_level_division' AND column_name = 'geom'
    `);
    
    if (colCheck.rows.length > 0 && colCheck.rows[0].data_type !== 'USER-DEFINED') {
      // Column exists but might not be the right type
      await pgm.db.query(`
        ALTER TABLE top_level_division 
        ALTER COLUMN geom TYPE GEOMETRY(MULTIPOLYGON, 4326) 
        USING CASE 
          WHEN geom IS NULL THEN NULL
          WHEN GeometryType(geom) = 'POLYGON' THEN ST_Multi(geom)
          WHEN GeometryType(geom) = 'MULTIPOLYGON' THEN geom
          ELSE ST_Multi(geom)::geometry(MULTIPOLYGON, 4326)
        END
      `);
    } else {
      // Try to alter directly (handles case where column is already geometry type)
      try {
        await pgm.db.query(`
          ALTER TABLE top_level_division 
          ALTER COLUMN geom TYPE GEOMETRY(MULTIPOLYGON, 4326) 
          USING CASE 
            WHEN geom IS NULL THEN NULL
            WHEN GeometryType(geom) = 'POLYGON' THEN ST_Multi(geom)
            WHEN GeometryType(geom) = 'MULTIPOLYGON' THEN geom
            ELSE geom::geometry(MULTIPOLYGON, 4326)
          END
        `);
      } catch (err) {
        // If column doesn't exist or is already correct type, continue
        if (!err.message.includes('does not exist') && !err.message.includes('already')) {
          throw err;
        }
      }
    }
    console.log('Geometry column type updated to MULTIPOLYGON');
    
    // Recreate the spatial index after altering the column
    await pgm.db.query(`
      DROP INDEX IF EXISTS top_level_division_geom_idx;
      CREATE INDEX top_level_division_geom_idx ON top_level_division USING GIST(geom);
    `);
    console.log('Spatial index recreated');
    // Step 1: Download GeoJSON
    console.log('Downloading Natural Earth admin_1 GeoJSON...');
    const geoJSON = await downloadGeoJSON(NATURAL_EARTH_URL);
    console.log(`Downloaded ${geoJSON.features.length} features`);
    
    // Step 2: Debug - log a sample feature to see available properties
    if (geoJSON.features.length > 0) {
      const sampleFeature = geoJSON.features.find(f => {
        const props = f.properties;
        const country = props.adm0_a3 || props.ADM0_A3 || props.iso_a2 || props.ISO_A2;
        return country === 'USA' || country === 'US' || country === 'CAN' || country === 'CA';
      });
      if (sampleFeature) {
        console.log('Sample feature properties:', Object.keys(sampleFeature.properties).slice(0, 20).join(', '));
        console.log('Sample US feature:', JSON.stringify(sampleFeature.properties, null, 2).substring(0, 500));
      }
    }
    
    // Step 3: Build mapping of state_code -> GeoJSON feature
    const stateCodeToFeature = new Map();
    let matchedCount = 0;
    let unmatchedFeatures = [];
    const matchedCodes = new Set();
    
    geoJSON.features.forEach((feature) => {
      const stateCode = matchStateCode(feature);
      if (stateCode) {
        // Handle duplicates - keep the first one or prefer one with better geometry
        if (!stateCodeToFeature.has(stateCode)) {
          stateCodeToFeature.set(stateCode, feature);
          matchedCodes.add(stateCode);
          matchedCount++;
        } else {
          // If duplicate, prefer the one with more coordinates (more detailed)
          const existing = stateCodeToFeature.get(stateCode);
          const existingCoords = JSON.stringify(existing.geometry).length;
          const newCoords = JSON.stringify(feature.geometry).length;
          if (newCoords > existingCoords) {
            stateCodeToFeature.set(stateCode, feature);
          }
        }
      } else {
        // Log unmatched features for debugging (only US/Canada)
        const props = feature.properties;
        const country = props.adm0_a3 || props.ADM0_A3 || props.iso_a2 || props.ISO_A2;
        if (country === 'USA' || country === 'US' || country === 'CAN' || country === 'CA') {
          unmatchedFeatures.push({
            name: props.name || props.NAME || props.name_en || props.NAME_EN,
            country: country,
            postal: props.postal || props.POSTAL,
            stusps: props.stusps || props.STUSPS,
            iso: props.iso_3166_2 || props.ISO_3166_2,
          });
        }
      }
    });
    
    console.log(`Matched ${matchedCount} features to state codes`);
    console.log(`Matched codes: ${Array.from(matchedCodes).sort().join(', ')}`);
    if (unmatchedFeatures.length > 0 && unmatchedFeatures.length <= 20) {
      console.log(`Unmatched US/Canada features (${unmatchedFeatures.length}):`);
      unmatchedFeatures.slice(0, 10).forEach(f => {
        console.log(`  - ${f.name || 'unnamed'} (country: ${f.country}, postal: ${f.postal || 'N/A'}, stusps: ${f.stusps || 'N/A'}, iso: ${f.iso || 'N/A'})`);
      });
    }
    
    // Step 4: Get all state codes from database
    const result = await pgm.db.query(`
      SELECT state_code, state_name, country 
      FROM top_level_division 
      ORDER BY country, state_code
    `);
    
    console.log(`Found ${result.rows.length} states/provinces in database`);
    
    // Step 5: Update geometries for matched states
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (const row of result.rows) {
      const feature = stateCodeToFeature.get(row.state_code);
      
      if (feature && feature.geometry) {
        const geomJSON = geometryToPostGIS(feature.geometry);
        
        // Use ST_GeomFromGeoJSON to convert GeoJSON to PostGIS geometry
        // Convert Polygon to MultiPolygon if needed to match column type
        await pgm.db.query(`
          UPDATE top_level_division 
          SET geom = ST_Multi(ST_GeomFromGeoJSON($1::json))::geometry(MULTIPOLYGON, 4326), 
              updated_at = CURRENT_TIMESTAMP
          WHERE state_code = $2
        `, [geomJSON, row.state_code]);
        
        updatedCount++;
      } else {
        console.log(`Warning: No geometry found for ${row.state_code} (${row.state_name})`);
        notFoundCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} geometries`);
    if (notFoundCount > 0) {
      console.log(`Warning: ${notFoundCount} states/provinces could not be matched`);
    }
    
    // Step 6: Verify geometries were created
    const verifyResult = await pgm.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(geom) as with_geometry,
        COUNT(*) - COUNT(geom) as without_geometry
      FROM top_level_division
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`Verification: ${stats.with_geometry}/${stats.total} states have geometries`);
    
    if (stats.without_geometry > 0) {
      console.log(`Warning: ${stats.without_geometry} states still missing geometries`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

exports.down = async (pgm) => {
  // Rollback: Clear all geometries and restore column type
  console.log('Rolling back: Clearing state geometries and restoring column type...');
  
  // Clear geometries
  await pgm.sql(`
    UPDATE top_level_division 
    SET geom = NULL, updated_at = CURRENT_TIMESTAMP
  `);
  
  // Restore column type to POLYGON (original type)
  // Note: This will fail if any MultiPolygon geometries exist, but we just cleared them
  await pgm.db.query(`
    ALTER TABLE top_level_division 
    ALTER COLUMN geom TYPE GEOMETRY(POLYGON, 4326) 
    USING CASE 
      WHEN geom IS NULL THEN NULL
      WHEN GeometryType(geom) = 'MULTIPOLYGON' THEN ST_GeometryN(geom, 1)
      ELSE geom::geometry(POLYGON, 4326)
    END
  `);
  
  // Recreate the spatial index
  await pgm.db.query(`
    DROP INDEX IF EXISTS top_level_division_geom_idx;
    CREATE INDEX top_level_division_geom_idx ON top_level_division USING GIST(geom);
  `);
  
  console.log('State geometries cleared and column type restored to POLYGON');
};
