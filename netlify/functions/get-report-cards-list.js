/**
 * Netlify Function: Get Report Cards List (Top Ten)
 * Endpoint: /.netlify/functions/get-report-cards-list
 * 
 * Returns list of jurisdictions with their grades, sorted by overall grade.
 * Supports filtering by place_type, size_category, state, region.
 * 
 * Query parameters:
 * ?type={city|county|state} - Filter by place type
 * ?size={small|mid|large|very_large} - Filter by population size
 * ?state={state_code} - Filter by state
 * ?region={region_name} - Filter by region
 * ?limit={number} - Limit results (default 10)
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
    const placeType = params.type || null;
    const sizeCategory = params.size || null;
    const stateCode = params.state || null;
    const region = params.region || null;
    const limit = params.limit ? Math.min(parseInt(params.limit), 100) : 10;

    const client = await pool.connect();

    // Build WHERE clause
    // For states, skip population filter (states don't have population in places table)
    // For cities/counties, require population to be set
    let whereClauses = [];
    let queryParams = [];
    let paramCount = 1;

    if (placeType) {
      whereClauses.push(`p.place_type = $${paramCount}::place_type`);
      queryParams.push(placeType);
      paramCount++;
      
      // Only require population for cities and counties, not states
      if (placeType !== 'state') {
        whereClauses.push('p.population IS NOT NULL AND p.population > 0');
      }
    } else {
      // If no place type specified, require population (defaults to cities/counties)
      whereClauses.push('p.population IS NOT NULL AND p.population > 0');
    }

    if (sizeCategory) {
      // Map size category to population ranges
      const sizeRanges = {
        'small': 'p.population < 50000',
        'mid': 'p.population >= 50000 AND p.population < 500000',
        'large': 'p.population >= 500000 AND p.population < 2000000',
        'very_large': 'p.population >= 2000000'
      };
      if (sizeRanges[sizeCategory]) {
        whereClauses.push(sizeRanges[sizeCategory]);
      }
    }

    if (stateCode) {
      whereClauses.push(`p.state_code = $${paramCount}`);
      queryParams.push(stateCode.toUpperCase());
      paramCount++;
    }

    if (region) {
      whereClauses.push(`tld.region = $${paramCount}`);
      queryParams.push(region);
      paramCount++;
    }

    queryParams.push(limit);

    const query = `
      SELECT 
        p.id,
        p.name,
        p.place_type,
        p.state_code,
        p.population,
        tld.state_name,
        tld.region,
        COALESCE(pog.overall_score, 0) as overall_score,
        COALESCE(pog.overall_letter_grade, 'F') as overall_letter_grade,
        COALESCE(pog.categories_with_reforms, 0) as categories_with_reforms
      FROM places p
      LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
      LEFT JOIN v_place_overall_grades pog ON p.id = pog.place_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY overall_score DESC, p.name
      LIMIT $${paramCount}
    `;

    const result = await client.query(query, queryParams);
    client.release();

    const reportCards = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.place_type,
      stateCode: row.state_code,
      stateName: row.state_name,
      region: row.region,
      population: row.population,
      overallGrade: {
        score: row.overall_score ? parseFloat(row.overall_score) : 0,
        letter: row.overall_letter_grade || 'F',
        categoriesWithReforms: row.categories_with_reforms || 0
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: reportCards.length,
        reportCards
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch report cards list',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};