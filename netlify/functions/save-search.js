/**
 * Netlify Function: Save Search
 * Endpoint: /.netlify/functions/save-search
 * Method: POST
 *
 * Saves a search configuration to the database and returns a short ID for sharing.
 * 
 * Request body:
 * {
 *   "filter_config": {
 *     "reform_types": ["rm_min", "reduce_min"],
 *     "place_types": ["city"],
 *     "states": ["Massachusetts"],
 *     "statuses": ["adopted"],
 *     "min_population": 50000,
 *     "max_population": null,
 *     "from_year": 2020,
 *     "to_year": null,
 *     "include_unknown_dates": true
 *   },
 *   "title": "Optional search name",
 *   "description": "Optional description"
 * }
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Generate a short ID (6 characters, base62)
function generateShortId() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Ensure unique short ID
async function generateUniqueShortId(client) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const shortId = generateShortId();
    const result = await client.query(
      'SELECT id FROM saved_searches WHERE short_id = $1',
      [shortId]
    );
    
    if (result.rows.length === 0) {
      return shortId;
    }
    
    attempts++;
  }
  
  throw new Error('Failed to generate unique short ID after multiple attempts');
}

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { filter_config, title, description } = body;

    if (!filter_config) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'filter_config is required' })
      };
    }

    const client = await pool.connect();

    try {
      // Generate unique short ID
      const shortId = await generateUniqueShortId(client);

      // Current filter version
      const filterVersion = 2;

      // Insert saved search
      const result = await client.query(
        `INSERT INTO saved_searches (short_id, filter_config, title, description, filter_version)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, short_id, created_at`,
        [shortId, JSON.stringify(filter_config), title || null, description || null, filterVersion]
      );

      const savedSearch = result.rows[0];

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          saved_search: {
            id: savedSearch.id,
            short_id: savedSearch.short_id,
            created_at: savedSearch.created_at
          }
        })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving search:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to save search'
      })
    };
  }
};
