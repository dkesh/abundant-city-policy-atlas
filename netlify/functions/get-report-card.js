/**
 * Netlify Function: Get Policy Profile for a Jurisdiction
 * Endpoint: /.netlify/functions/get-report-card?place_id={id}
 * 
 * Returns policy profile data for a specific jurisdiction including:
 * - Place metadata
 * - Reforms timeline (chronological)
 * - Domain summaries
 * - Priority areas for improvement (peer-based suggestions)
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
    const placeId = params.place_id ? parseInt(params.place_id) : null;

    if (!placeId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'place_id parameter is required'
        })
      };
    }

    const client = await pool.connect();

    // Get place metadata
    // For states, use population from top_level_division if places.population is null
    const placeQuery = `
      SELECT 
        p.id,
        p.name,
        p.place_type,
        p.state_code,
        COALESCE(p.population, CASE WHEN p.place_type = 'state' THEN tld.population ELSE NULL END) as population,
        tld.state_name,
        tld.region,
        tld.country
      FROM places p
      LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
      WHERE p.id = $1
    `;

    const placeResult = await client.query(placeQuery, [placeId]);
    
    if (placeResult.rows.length === 0) {
      client.release();
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Place not found'
        })
      };
    }

    const place = placeResult.rows[0];

    // Get all reforms for this place with reform type info, sorted by adoption date for timeline
    const reformsQuery = `
      SELECT 
        r.id,
        r.place_id,
        rt.id as reform_type_id,
        r.scope,
        r.land_use,
        r.requirements,
        r.status,
        r.adoption_date,
        rt.code as reform_code,
        rt.category,
        rt.name as reform_name
      FROM reforms r
      JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      JOIN reform_types rt ON rrt.reform_type_id = rt.id
      WHERE r.place_id = $1
        AND rt.category IS NOT NULL
      ORDER BY 
        CASE WHEN r.adoption_date IS NULL THEN 1 ELSE 0 END,
        r.adoption_date DESC NULLS LAST,
        rt.category,
        rt.name
    `;

    const reformsResult = await client.query(reformsQuery, [placeId]);
    const reforms = reformsResult.rows;

    // Get all reform types by category for domain overview
    const reformTypesQuery = `
      SELECT 
        id,
        code,
        category,
        name
      FROM reform_types
      WHERE category IS NOT NULL
      ORDER BY category, name
    `;

    const reformTypesResult = await client.query(reformTypesQuery);
    const reformTypes = reformTypesResult.rows;

    // Get TODO items: reform types that are common in similar jurisdictions but missing here
    // Strategy: Find reform types that are common in similar-sized jurisdictions in the same state/region
    // but not adopted by this jurisdiction
    const todoQuery = `
      WITH similar_places AS (
        SELECT DISTINCT p2.id
        FROM places p2
        LEFT JOIN top_level_division tld2 ON p2.state_code = tld2.state_code
        WHERE p2.place_type = $1::place_type
          AND (
            ($2::VARCHAR(2) != '' AND p2.state_code = $2::VARCHAR(2))
            OR 
            ($3::VARCHAR(50) != '' AND tld2.region = $3::VARCHAR(50))
          )
          AND p2.population > 0
          AND ABS(COALESCE(p2.population, 0) - COALESCE($4, 0)) < COALESCE($4, 0) * 0.5
          AND p2.id != $5
        LIMIT 50
      ),
      common_reforms AS (
        SELECT 
          rt.id as reform_type_id,
          rt.code as reform_code,
          rt.name as reform_name,
          rt.category,
          COUNT(DISTINCT r.place_id) as adoption_count
        FROM reforms r
        JOIN reform_reform_types rrt ON r.id = rrt.reform_id
        JOIN reform_types rt ON rrt.reform_type_id = rt.id
        WHERE r.place_id IN (SELECT id FROM similar_places)
        GROUP BY rt.id, rt.code, rt.name, rt.category
        HAVING COUNT(DISTINCT r.place_id) >= 3
      ),
      missing_reforms AS (
        SELECT cr.*
        FROM common_reforms cr
        WHERE NOT EXISTS (
          SELECT 1 FROM reforms r
          WHERE r.place_id = $5
            AND EXISTS (
              SELECT 1 FROM reform_reform_types rrt2
              WHERE rrt2.reform_id = r.id
                AND rrt2.reform_type_id = cr.reform_type_id
            )
        )
      )
      SELECT 
        reform_code,
        reform_name,
        category,
        adoption_count
      FROM missing_reforms
      ORDER BY adoption_count DESC, category, reform_name
      LIMIT 10
    `;

    // Ensure parameters are always strings (not null) so PostgreSQL can infer types
    const todoResult = await client.query(todoQuery, [
      place.place_type,
      place.state_code || '',
      place.region || '',
      place.population || null,
      placeId
    ]);

    // Get reform summary by category for domain overview
    const reformSummaryQuery = `
      SELECT 
        rt.category,
        rt.code as reform_code,
        rt.name as reform_name,
        COUNT(DISTINCT r.id) as reform_count
      FROM reforms r
      JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      JOIN reform_types rt ON rrt.reform_type_id = rt.id
      WHERE r.place_id = $1
      GROUP BY rt.category, rt.code, rt.name
      ORDER BY rt.category, rt.name
    `;

    const reformSummaryResult = await client.query(reformSummaryQuery, [placeId]);

    client.release();

    // Build domain summaries: count reform types per category
    const domainSummaries = {};
    const reformTypesByCategory = {};
    
    // Group reform types by category
    reformTypes.forEach(rt => {
      if (!reformTypesByCategory[rt.category]) {
        reformTypesByCategory[rt.category] = [];
      }
      reformTypesByCategory[rt.category].push(rt.code);
    });

    // Build domain summaries with counts
    reformSummaryResult.rows.forEach(r => {
      if (!domainSummaries[r.category]) {
        domainSummaries[r.category] = {
          reformTypes: [],
          totalTracked: reformTypesByCategory[r.category]?.length || 0
        };
      }
      domainSummaries[r.category].reformTypes.push(r.reform_code);
    });

    // Ensure all categories with tracked types are represented
    Object.keys(reformTypesByCategory).forEach(category => {
      if (!domainSummaries[category]) {
        domainSummaries[category] = {
          reformTypes: [],
          totalTracked: reformTypesByCategory[category].length
        };
      }
    });

    // Build response
    const response = {
      success: true,
      place: {
        id: place.id,
        name: place.name,
        type: place.place_type,
        stateCode: place.state_code,
        stateName: place.state_name,
        region: place.region,
        country: place.country,
        population: place.population
      },
      reforms: reforms.map(r => ({
        id: r.id,
        adoption_date: r.adoption_date,
        status: r.status,
        reform_name: r.reform_name,
        reform_code: r.reform_code,
        category: r.category,
        scope: r.scope,
        land_use: r.land_use,
        requirements: r.requirements
      })),
      domains: domainSummaries,
      todoItems: todoResult.rows.map(r => ({
        reformCode: r.reform_code,
        reformName: r.reform_name,
        category: r.category,
        adoptionCount: r.adoption_count
      })),
      reformSummary: reformSummaryResult.rows.reduce((acc, r) => {
        if (!acc[r.category]) {
          acc[r.category] = [];
        }
        acc[r.category].push({
          code: r.reform_code,
          name: r.reform_name,
          count: r.reform_count
        });
        return acc;
      }, {})
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch policy profile',
          message: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
    };
  }
};