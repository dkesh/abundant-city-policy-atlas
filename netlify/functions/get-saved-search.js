/**
 * Netlify Function: Get Saved Search
 * Endpoint: /.netlify/functions/get-saved-search
 * Method: GET
 *
 * Retrieves a saved search by short ID and updates the view count.
 * 
 * Query parameters:
 * ?short_id=7ef4f
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Migration function to update filter config between versions
function migrateFilterConfig(config, fromVersion, toVersion) {
  let migrated = { ...config };
  
  // Example: migration from v1 to v2 (placeholder for future migrations)
  if (fromVersion === 1 && toVersion === 2) {
    // Example migration logic:
    // if (migrated.reform_type) {
    //   migrated.reform_types = Array.isArray(migrated.reform_type) 
    //     ? migrated.reform_type 
    //     : [migrated.reform_type];
    //   delete migrated.reform_type;
    // }
  }
  
  migrated.filter_version = toVersion;
  return migrated;
}

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const shortId = params.short_id;

    if (!shortId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'short_id parameter is required' })
      };
    }

    const client = await pool.connect();

    try {
      // Get saved search
      const result = await client.query(
        'SELECT filter_config, filter_version, title, description, view_count FROM saved_searches WHERE short_id = $1',
        [shortId]
      );

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Saved search not found' })
        };
      }

      const { filter_config, filter_version, title, description, view_count } = result.rows[0];
      const currentVersion = 1; // Current filter schema version

      // Migrate if needed
      let migratedConfig = filter_config;
      if (filter_version < currentVersion) {
        migratedConfig = migrateFilterConfig(filter_config, filter_version, currentVersion);
        
        // Update the database with migrated config
        await client.query(
          'UPDATE saved_searches SET filter_config = $1, filter_version = $2 WHERE short_id = $3',
          [JSON.stringify(migratedConfig), currentVersion, shortId]
        );
      }

      // Update view count and last accessed time
      await client.query(
        'UPDATE saved_searches SET view_count = view_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE short_id = $1',
        [shortId]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          saved_search: {
            short_id: shortId,
            filter_config: migratedConfig,
            title,
            description,
            view_count: view_count + 1
          }
        })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting saved search:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to get saved search'
      })
    };
  }
};
