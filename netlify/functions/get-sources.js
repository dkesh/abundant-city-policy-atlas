const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

/**
 * Get all sources from the database
 */
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const client = await pool.connect();

    const query = `
      SELECT 
        id,
        name,
        short_name,
        description,
        website_url,
        logo_filename
      FROM sources
      ORDER BY name
    `;

    const result = await client.query(query);
    client.release();

    const sources = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      description: row.description,
      websiteUrl: row.website_url,
      logoFilename: row.logo_filename
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sources
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch sources',
        details: error.message
      })
    };
  }
};
