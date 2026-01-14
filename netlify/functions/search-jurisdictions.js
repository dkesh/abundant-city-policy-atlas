/**
 * Netlify Function: Search Jurisdictions
 * Endpoint: /.netlify/functions/search-jurisdictions?q={search_term}
 * 
 * Returns matching jurisdictions for the search bar in Report Card tab.
 * Searches by name, state, and returns basic info with grade.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
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
    const params = event.queryStringParameters || {};
    const searchTerm = params.q ? params.q.trim() : '';
    const limit = params.limit ? Math.min(parseInt(params.limit), 50) : 20;

    if (!searchTerm || searchTerm.length < 2) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          count: 0,
          jurisdictions: []
        })
      };
    }

    const client = await pool.connect();

    let query, queryParams;

    query = `
      SELECT 
        p.id,
        p.name,
        p.place_type,
        p.state_code,
        p.population,
        tld.state_name,
        tld.region,
        COALESCE(pog.overall_score, 0) as overall_score,
        COALESCE(pog.overall_letter_grade, 'F') as overall_letter_grade
      FROM places p
      LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
      LEFT JOIN v_place_overall_grades pog ON p.id = pog.place_id
      WHERE LOWER(p.name) LIKE LOWER($1)
      --AND p.population IS NOT NULL
      ORDER BY 
        CASE 
          WHEN LOWER(p.name) = LOWER($2) THEN 1
          WHEN LOWER(p.name) LIKE LOWER($3) THEN 2
          ELSE 3
        END,
        overall_score DESC,
        p.name
      LIMIT $4
    `;
    const searchPattern = `%${searchTerm}%`;
    const exactMatch = searchTerm;
    const startsWith = `${searchTerm}%`;
    queryParams = [searchPattern, exactMatch, startsWith, limit];

    const result = await client.query(query, queryParams);
    client.release();

    const jurisdictions = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.place_type,
      stateCode: row.state_code,
      stateName: row.state_name,
      region: row.region,
      population: row.population,
      overallGrade: {
        score: row.overall_score ? parseFloat(row.overall_score) : 0,
        letter: row.overall_letter_grade || 'F'
      },
      displayName: `${row.name}, ${row.state_name}`
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: jurisdictions.length,
        jurisdictions
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to search jurisdictions',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};