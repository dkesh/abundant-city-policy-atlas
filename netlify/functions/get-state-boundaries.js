/**
 * Netlify Function: Get State Boundaries
 * Endpoint: /.netlify/functions/get-state-boundaries
 *
 * Returns state/province boundaries as GeoJSON from the top_level_division table.
 * Uses PostGIS ST_AsGeoJSON to convert geometry to GeoJSON format.
 *
 * Query parameters:
 * ?country=US - Filter by country (optional, returns all if not specified)
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

exports.handler = async (event, context) => {
  // CORS headers
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

  try {
    const client = await pool.connect();

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const country = params.country ? params.country.toUpperCase() : null;

    // Build query
    let whereClause = 'geom IS NOT NULL';
    const queryParams = [];
    let paramCount = 1;

    if (country) {
      whereClause += ` AND country = $${paramCount}`;
      queryParams.push(country);
      paramCount++;
    }

    // Query state boundaries with PostGIS ST_AsGeoJSON
    const query = `
      SELECT 
        state_code,
        state_name,
        country,
        region,
        ST_AsGeoJSON(geom)::json as geometry
      FROM top_level_division
      WHERE ${whereClause}
      ORDER BY country, state_name
    `;

    const result = await client.query(query, queryParams);
    client.release();

    // Transform results to GeoJSON FeatureCollection
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: {
        state_code: row.state_code,
        state_name: row.state_name,
        country: row.country,
        region: row.region
      },
      geometry: row.geometry
    }));

    const featureCollection = {
      type: 'FeatureCollection',
      features: features
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: features.length,
        data: featureCollection
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch state boundaries',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
