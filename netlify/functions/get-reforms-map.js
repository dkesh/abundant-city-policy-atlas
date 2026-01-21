/**
* Netlify Function: Get Reforms for Map (Lightweight)
* Endpoint: /.netlify/functions/get-reforms-map
*
* Returns minimal reform data optimized for map rendering:
* - Reform ID
* - Place coordinates (lat/lng)
* - Place type (city/county/state)
* - Reform type code and color
* - State code (for state-level reforms)
*
* Supports the same filtering as get-reforms.js but returns only essential fields.
* Full details can be loaded on-demand when users click markers.
*
* Query parameters: Same as get-reforms.js
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

    // Parse query parameters (same logic as get-reforms.js)
    const params = event.queryStringParameters || {};
    
    // Handle multi-select parameters
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
    
    // Limitations filters
    const scopeLimitation = params.scope_limitation || null;
    const landUseLimitation = params.land_use_limitation || null;
    const requirementsLimitation = params.requirements_limitation || null;
    const intensityLimitation = params.intensity_limitation || null;

    // Build dynamic query with filters (same WHERE clause logic as get-reforms.js)
    let whereClauses = ['1=1'];
    let queryParams = [];
    let paramCount = 1;

    // Reform type filter
    if (reformTypes.length > 0) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM reform_reform_types rrt_filter
        JOIN reform_types rt_filter ON rrt_filter.reform_type_id = rt_filter.id
        WHERE rrt_filter.reform_id = r.id
          AND rt_filter.code = ANY($${paramCount})
      )`);
      queryParams.push(reformTypes);
      paramCount++;
    }

    // Place type filter
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
      whereClauses.push(`tld.region = $${paramCount}`);
      queryParams.push(region);
      paramCount++;
    }

    // State filter
    if (states.length > 0) {
      whereClauses.push(`tld.state_name = ANY($${paramCount})`);
      queryParams.push(states);
      paramCount++;
    }

    // Status filter
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
      
      if (includeUnknownDates) {
        whereClauses.push(`(${dateConditions.join(' AND ')} OR r.adoption_date IS NULL)`);
      } else {
        whereClauses.push(`(${dateConditions.join(' AND ')})`);
      }
    } else if (!includeUnknownDates) {
      whereClauses.push(`r.adoption_date IS NOT NULL`);
    }

    // Scope limitation filter
    if (scopeLimitation === 'no_limits') {
      whereClauses.push(`(
        r.scope IS NULL 
        OR array_length(r.scope, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.scope) AS scope_item 
          WHERE LOWER(scope_item) = 'citywide'
        )
      )`);
    } else if (scopeLimitation === 'has_limits') {
      whereClauses.push(`(
        r.scope IS NOT NULL 
        AND array_length(r.scope, 1) > 0
        AND NOT EXISTS (
          SELECT 1 FROM unnest(r.scope) AS scope_item 
          WHERE LOWER(scope_item) = 'citywide'
        )
      )`);
    }

    // Land use limitation filter
    if (landUseLimitation === 'no_limits') {
      whereClauses.push(`(
        r.land_use IS NULL 
        OR array_length(r.land_use, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.land_use) AS land_item 
          WHERE LOWER(land_item) = 'all uses'
        )
      )`);
    } else if (landUseLimitation === 'has_limits') {
      whereClauses.push(`(
        r.land_use IS NOT NULL 
        AND array_length(r.land_use, 1) > 0
        AND NOT EXISTS (
          SELECT 1 FROM unnest(r.land_use) AS land_item 
          WHERE LOWER(land_item) = 'all uses'
        )
      )`);
    }

    // Requirements limitation filter
    if (requirementsLimitation === 'no_limits') {
      whereClauses.push(`(
        r.requirements IS NULL 
        OR array_length(r.requirements, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.requirements) AS req_item 
          WHERE LOWER(req_item) = 'by right'
        )
      )`);
    } else if (requirementsLimitation === 'has_limits') {
      whereClauses.push(`(
        r.requirements IS NOT NULL 
        AND array_length(r.requirements, 1) > 0
        AND NOT EXISTS (
          SELECT 1 FROM unnest(r.requirements) AS req_item 
          WHERE LOWER(req_item) = 'by right'
        )
      )`);
    }

    // Intensity limitation filter
    if (intensityLimitation === 'no_limits') {
      whereClauses.push(`(r.intensity = 'complete' OR r.intensity IS NULL)`);
    } else if (intensityLimitation === 'has_limits') {
      whereClauses.push(`r.intensity = 'partial'`);
    }

    // Build final WHERE clause
    const whereClause = whereClauses.join(' AND ');

    // Lightweight query - only essential fields for map rendering
    const query = `
      SELECT
        r.id,
        p.id as place_id,
        p.name as place_name,
        p.place_type,
        p.latitude,
        p.longitude,
        tld.state_code,
        tld.state_name,
        tld.country,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'code', rt_sub.code,
                'color_hex', rt_sub.color_hex
              ) ORDER BY rt_sub.sort_order
            )
            FROM (
              SELECT DISTINCT rt2.code, rt2.color_hex, rt2.sort_order
              FROM reform_reform_types rrt2
              JOIN reform_types rt2 ON rrt2.reform_type_id = rt2.id
              WHERE rrt2.reform_id = r.id
            ) rt_sub
          ),
          '[]'::json
        ) as reform_types
      FROM reforms r
      JOIN places p ON r.place_id = p.id
      JOIN top_level_division tld ON p.state_code = tld.state_code
      WHERE ${whereClause}
      GROUP BY r.id, p.id, p.name, p.place_type, p.latitude, p.longitude, tld.state_code, tld.state_name, tld.country
      ORDER BY tld.state_name, p.name
    `;

    const result = await client.query(query, queryParams);
    
    // Get total count for metadata
    const countQuery = `
      SELECT COUNT(DISTINCT r.id) as total
      FROM reforms r
      JOIN places p ON r.place_id = p.id
      JOIN top_level_division tld ON p.state_code = tld.state_code
      WHERE ${whereClause}
    `;
    
    const countParams = queryParams;
    const countResult = await client.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    client.release();

    // Transform results for API response (minimal structure)
    const reforms = result.rows.map(row => {
      const reformType = row.reform_types && row.reform_types.length > 0 ? row.reform_types[0] : null;
      
      return {
        id: row.id,
        place: {
          id: row.place_id,
          name: row.place_name,
          type: row.place_type,
          state: row.state_name,
          state_code: row.state_code,
          country: row.country,
          latitude: row.latitude,
          longitude: row.longitude
        },
        reform: {
          type: reformType ? reformType.code : null,
          color: reformType ? reformType.color_hex : null
        }
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: reforms.length,
        total_count: totalCount,
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
        error: 'Failed to fetch reforms for map',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
