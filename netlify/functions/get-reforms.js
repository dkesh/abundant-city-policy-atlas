/**
* Netlify Function: Get Reforms with Filtering
* Endpoint: /.netlify/functions/get-reforms
*
* Returns parking and transit reforms from the database with support for filtering:
* - By reform type (rm_min, reduce_min, add_max) - MULTI-SELECT
* - By jurisdiction type (state, county, city) - MULTI-SELECT
* - By jurisdiction size (population thresholds)
* - By region (Northeast, Midwest, South, West)
* - By state - MULTI-SELECT
*
* Query parameters:
* ?reform_type=rm_min&reform_type=reduce_min - Multiple reform types (uses ANY)
* ?place_type=city&place_type=county - Multiple place types (uses ANY)
* ?min_population=100000 - Filter by minimum population
* ?max_population=500000 - Filter by maximum population
* ?region=West - Filter by census region
* ?state=California&state=Texas - Multiple states (uses ANY)
* ?limit=100 - Limit results (default 1000)
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
    // Note: Netlify provides single values as strings, multiple values as arrays
    const params = event.queryStringParameters || {};
    
    console.log('Raw params:', JSON.stringify(params));
    
    // Handle multi-select parameters: convert single value to array
    // Netlify may give us comma-separated strings or arrays
    const parseMultiValue = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      return val.split(',').map(v => v.trim()).filter(Boolean);
    };
    
    const reformTypes = parseMultiValue(params.reform_type);
    const placeTypes = parseMultiValue(params.place_type);
    const states = parseMultiValue(params.state);
    const statuses = parseMultiValue(params.status);
    
    const minPopulation = params.min_population ? parseInt(params.min_population) : null;
    const maxPopulation = params.max_population ? parseInt(params.max_population) : null;
    const region = params.region ? params.region.trim() : null;
    const fromYear = params.from_year ? parseInt(params.from_year) : null;
    const toYear = params.to_year ? parseInt(params.to_year) : null;
    const includeUnknownDates = params.include_unknown_dates === 'true';
    const limit = params.limit ? Math.min(parseInt(params.limit), 5000) : 1000;

    // Build dynamic query with filters
    let whereClauses = ['1=1']; // Start with always-true condition
    let queryParams = [];
    let paramCount = 1;

    // Reform type filter (MULTI - uses ANY)
    if (reformTypes.length > 0) {
      whereClauses.push(`rt.code = ANY($${paramCount})`);
      queryParams.push(reformTypes);
      paramCount++;
    }

    // Place type filter (MULTI - uses ANY with explicit enum cast)
    if (placeTypes.length > 0) {
      whereClauses.push(`p.place_type = ANY($${paramCount}::place_type[])`);
      queryParams.push(placeTypes);
      paramCount++;
    }

    // Population range filters
    if (minPopulation !== null) {
      whereClauses.push(`p.population >= $${paramCount}`);
      queryParams.push(minPopulation);
      paramCount++;
    }

    if (maxPopulation !== null) {
      whereClauses.push(`p.population <= $${paramCount}`);
      queryParams.push(maxPopulation);
      paramCount++;
    }

    // Region filter
    if (region) {
      whereClauses.push(`s.region = $${paramCount}`);
      queryParams.push(region);
      paramCount++;
    }

    // State filter (MULTI - uses ANY)
    if (states.length > 0) {
      whereClauses.push(`s.state_name = ANY($${paramCount})`);
      queryParams.push(states);
      paramCount++;
    }

    // Status filter (MULTI - uses ANY)
    if (statuses.length > 0) {
      whereClauses.push(`LOWER(r.status) = ANY($${paramCount})`);
      queryParams.push(statuses);
      paramCount++;
    }

    // Date range filters
    if (fromYear !== null || toYear !== null) {
      const dateConditions = [];
      
      if (fromYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) >= $${paramCount}`);
        queryParams.push(fromYear);
        paramCount++;
      }
      
      if (toYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) <= $${paramCount}`);
        queryParams.push(toYear);
        paramCount++;
      }
      
      // If we should include unknown dates, OR with IS NULL
      if (includeUnknownDates) {
        whereClauses.push(`(${dateConditions.join(' AND ')} OR r.adoption_date IS NULL)`);
      } else {
        whereClauses.push(`(${dateConditions.join(' AND ')})`);
      }
    } else if (!includeUnknownDates) {
      // If no year range but excluding unknowns, filter out nulls
      whereClauses.push(`r.adoption_date IS NOT NULL`);
    }

    // Build final WHERE clause
    const whereClause = whereClauses.join(' AND ');

    console.log('===== DEBUG get-reforms =====');
    console.log('WHERE clause:', whereClause);
    console.log('Query params:', JSON.stringify(queryParams));
    console.log('============================');

    // Query reforms with all related data including sources and policy documents
    const query = `
      SELECT
        r.id,
        p.id as place_id,
        p.name as place_name,
        p.place_type,
        p.population,
        p.latitude,
        p.longitude,
        p.encoded_name,
        r.link_url,
        s.state_code,
        s.state_name,
        s.region,
        rt.code as reform_type_code,
        rt.name as reform_type_name,
        rt.color_hex,
        r.status,
        r.scope,
        r.land_use,
        r.adoption_date,
        r.summary,
        r.requirements,
        r.notes,
        r.created_at,
        pd.id as policy_document_id,
        pd.title as policy_document_title,
        pd.reference_number as policy_document_reference,
        COALESCE(
          json_agg(
            json_build_object(
              'id', src.id,
              'name', src.name,
              'short_name', src.short_name,
              'logo', src.logo_filename,
              'website_url', src.website_url,
              'reporter', rs.reporter,
              'source_url', rs.source_url,
              'notes', rs.notes,
              'is_primary', rs.is_primary
            ) ORDER BY rs.is_primary DESC, src.name
          ) FILTER (WHERE src.id IS NOT NULL),
          '[]'::json
        ) as sources
      FROM reforms r
      JOIN places p ON r.place_id = p.id
      JOIN states s ON p.state_code = s.state_code
      JOIN reform_types rt ON r.reform_type_id = rt.id
      LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
      LEFT JOIN reform_sources rs ON r.id = rs.reform_id
      LEFT JOIN sources src ON rs.source_id = src.id
      WHERE ${whereClause}
      GROUP BY r.id, p.id, p.name, p.place_type, p.population, p.latitude, p.longitude, p.encoded_name, r.link_url,
               s.state_code, s.state_name, s.region,
               rt.id, rt.code, rt.name, rt.color_hex, rt.sort_order,
               r.status, r.scope, r.land_use, r.adoption_date, r.summary, r.requirements, r.notes, r.created_at,
               pd.id, pd.title, pd.reference_number
      ORDER BY s.state_name, p.name, rt.sort_order, r.adoption_date DESC
      LIMIT $${paramCount}
    `;

    queryParams.push(limit);

    const result = await client.query(query, queryParams);
    client.release();

    // Transform results for API response
    const reforms = result.rows.map(row => ({
      id: row.id,
      place: {
        id: row.place_id,
        name: row.place_name,
        type: row.place_type,
        state: row.state_name,
        state_code: row.state_code,
        population: row.population,
        latitude: row.latitude,
        longitude: row.longitude,
        encoded_name: row.encoded_name,
        region: row.region
      },
      reform: {
        type: row.reform_type_code,
        type_name: row.reform_type_name,
        color: row.color_hex,
        status: row.status,
        scope: row.scope || [],
        land_use: row.land_use || [],
        adoption_date: row.adoption_date ? row.adoption_date.toISOString().split('T')[0] : null,
        summary: row.summary || '',
        requirements: row.requirements || [],
        notes: row.notes || '',
        link_url: row.link_url,
        sources: row.sources || [],
        policy_document: row.policy_document_id ? {
          id: row.policy_document_id,
          title: row.policy_document_title,
          reference_number: row.policy_document_reference
        } : null
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: result.rows.length,
        filters: {
          reform_types: reformTypes.length > 0 ? reformTypes : undefined,
          place_types: placeTypes.length > 0 ? placeTypes : undefined,
          min_population: minPopulation,
          max_population: maxPopulation,
          region: region,
          states: states.length > 0 ? states : undefined
        },
        reforms: reforms
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch reforms',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
