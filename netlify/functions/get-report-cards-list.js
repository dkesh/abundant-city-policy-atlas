/**
 * Netlify Function: Get Movers and Shakers List (Explore Places)
 * Endpoint: /.netlify/functions/get-report-cards-list
 * 
 * Returns a list of featured jurisdictions (no explicit ranks/grades), selected by
 * breadth of tracked reform activity (unique reform types recorded) and including
 * the policy domains (categories) the place has taken on.
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

    const populationExpr = placeType === 'state'
      ? 'COALESCE(p.population, tld.population)'
      : 'p.population';

    // Build WHERE clause
    // For cities/counties, require population to be set
    let whereClauses = [];
    let queryParams = [];
    let paramCount = 1;

    if (placeType) {
      whereClauses.push(`p.place_type = $${paramCount}::place_type`);
      queryParams.push(placeType);
      paramCount++;
      
      // Only require population for cities and counties
      if (placeType === 'city' || placeType === 'county') {
        whereClauses.push('p.population IS NOT NULL AND p.population > 0');
      } else if (placeType === 'state') {
        // States may store population in top_level_division; use that for sizing and basic sanity.
        whereClauses.push(`${populationExpr} IS NOT NULL AND ${populationExpr} > 0`);
      }
    } else {
      // If no place type specified, require population (defaults to cities/counties)
      whereClauses.push('p.population IS NOT NULL AND p.population > 0');
    }

    if (sizeCategory) {
      if (placeType === 'state') {
        // State size ranges (intentionally different from cities)
        const stateSizeRanges = {
          'small': `${populationExpr} < 2000000`,
          'mid': `${populationExpr} >= 2000000 AND ${populationExpr} < 10000000`,
          'large': `${populationExpr} >= 10000000`
        };
        if (stateSizeRanges[sizeCategory]) {
          whereClauses.push(stateSizeRanges[sizeCategory]);
        }
      } else {
        // City/County size ranges
        const sizeRanges = {
          'small': `${populationExpr} < 50000`,
          'mid': `${populationExpr} >= 50000 AND ${populationExpr} < 500000`,
          'large': `${populationExpr} >= 500000 AND ${populationExpr} < 2000000`,
          'very_large': `${populationExpr} >= 2000000`
        };
        if (sizeRanges[sizeCategory]) {
          whereClauses.push(sizeRanges[sizeCategory]);
        }
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
      WITH place_candidates AS (
        SELECT
          p.id,
          p.name,
          p.place_type,
          p.state_code,
          ${populationExpr} AS population_effective,
          tld.state_name,
          tld.region,
          COUNT(DISTINCT rrt.reform_type_id) AS reform_types_count,
          COUNT(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL) AS domains_count,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name ORDER BY c.name), NULL) AS domains
        FROM places p
        LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
        LEFT JOIN reforms r ON r.place_id = p.id
        LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
        LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
        LEFT JOIN categories c ON rt.category_id = c.id
        WHERE ${whereClauses.join(' AND ')}
        GROUP BY
          p.id,
          p.name,
          p.place_type,
          p.state_code,
          p.population,
          tld.state_name,
          tld.region,
          tld.population
      ),
      top_picks AS (
        SELECT *
        FROM place_candidates
        WHERE reform_types_count > 0
        ORDER BY reform_types_count DESC, domains_count DESC, name
        LIMIT $${paramCount}
      )
      SELECT *
      FROM top_picks
      ORDER BY name
    `;

    const result = await client.query(query, queryParams);
    client.release();

    const movers = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.place_type,
      stateCode: row.state_code,
      stateName: row.state_name,
      region: row.region,
      population: row.population_effective ? parseInt(row.population_effective, 10) : null,
      domains: Array.isArray(row.domains) ? row.domains : [],
      reformTypesCount: row.reform_types_count ? parseInt(row.reform_types_count, 10) : 0,
      domainsCount: row.domains_count ? parseInt(row.domains_count, 10) : 0
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: movers.length,
        movers
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch movers list',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};