const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

/**
 * Get all reform types from the database
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
        rt.id,
        rt.code,
        c.name as category,
        rt.name,
        rt.description,
        rt.color_hex,
        rt.sort_order
      FROM reform_types rt
      LEFT JOIN categories c ON rt.category_id = c.id
      ORDER BY rt.sort_order, rt.name
    `;

    const result = await client.query(query);
    client.release();

    const reformTypes = result.rows.map(row => ({
      id: row.id,
      code: row.code,
      category: row.category,
      name: row.name,
      description: row.description,
      colorHex: row.color_hex,
      sortOrder: row.sort_order
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        reformTypes
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch reform types',
        details: error.message
      })
    };
  }
};
