const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

/**
 * Get all categories with their associated reform types
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
        c.id,
        c.name,
        c.description,
        c.icon,
        c.sort_order,
        COALESCE(
          json_agg(
            json_build_object(
              'id', rt.id,
              'code', rt.code,
              'name', rt.name,
              'description', rt.description,
              'colorHex', rt.color_hex,
              'sortOrder', rt.sort_order
            ) ORDER BY rt.sort_order, rt.name
          ) FILTER (WHERE rt.id IS NOT NULL),
          '[]'::json
        ) as reform_types
      FROM categories c
      LEFT JOIN reform_types rt ON c.id = rt.category_id
      GROUP BY c.id, c.name, c.description, c.icon, c.sort_order
      ORDER BY c.sort_order, c.name
    `;

    const result = await client.query(query);
    client.release();

    const categories = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sort_order,
      reformTypes: row.reform_types
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        categories
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch categories',
        details: error.message
      })
    };
  }
};
