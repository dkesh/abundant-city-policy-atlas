/**
 * Netlify Function: Get Movers and Shakers List (Explore Places)
 * Endpoint: /.netlify/functions/get-explore-places-list
 * 
 * Returns a list of featured jurisdictions (no explicit ranks/grades), selected by
 * breadth of tracked reform activity (unique reform types recorded) and including
 * the policy domains (categories) the place has taken on.
 * 
 * Query parameters:
 * ?type={city|county|state} - Filter by place type
 * ?size={small|mid|large|very_large} - Filter by population size
 * ?state={state_name} - Filter by state (can be multiple)
 * ?region={region_name} - Filter by region
 * ?reform_type={code} - Filter by reform type code (can be multiple)
 * ?status={status} - Filter by status (can be multiple)
 * ?from_year={year} - Filter by adoption year (from)
 * ?to_year={year} - Filter by adoption year (to)
 * ?include_unknown_dates={true|false} - Include reforms with unknown dates
 * ?scope_limitation={no_limits|has_limits} - Filter by scope limitation
 * ?land_use_limitation={no_limits|has_limits} - Filter by land use limitation
 * ?requirements_limitation={no_limits|has_limits} - Filter by requirements limitation
 * ?intensity_limitation={no_limits|has_limits} - Filter by intensity limitation
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
    const limit = params.limit ? Math.min(parseInt(params.limit), 100) : 10;

    // Parse multi-value parameters (Netlify may give us arrays or comma-separated strings)
    const parseMultiValue = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      return val.split(',').map(v => v.trim()).filter(Boolean);
    };

    const states = parseMultiValue(params.state);
    const region = params.region || null;
    const reformTypes = parseMultiValue(params.reform_type);
    const statuses = parseMultiValue(params.status);
    const fromYear = params.from_year ? parseInt(params.from_year) : null;
    const toYear = params.to_year ? parseInt(params.to_year) : null;
    const includeUnknownDates = params.include_unknown_dates === 'true';
    const scopeLimitation = params.scope_limitation || null;
    const landUseLimitation = params.land_use_limitation || null;
    const requirementsLimitation = params.requirements_limitation || null;
    const intensityLimitation = params.intensity_limitation || null;

    const client = await pool.connect();

    // Build WHERE clause
    // For cities/counties, require population to be set
    let whereClauses = [];
    let queryParams = [];
    let paramCount = 1;

    if (placeType) {
      whereClauses.push(`p.place_type = $${paramCount}::place_type`);
      queryParams.push(placeType);
      paramCount++;
      
      // Require population for all place types
      if (placeType === 'city' || placeType === 'county' || placeType === 'state') {
        whereClauses.push('p.population IS NOT NULL AND p.population > 0');
      }
    } else {
      // If no place type specified, require population (defaults to cities/counties)
      whereClauses.push('p.population IS NOT NULL AND p.population > 0');
    }

    if (sizeCategory) {
      if (placeType === 'state') {
        // State size ranges (intentionally different from cities)
        const stateSizeRanges = {
          'small': 'p.population < 2000000',
          'mid': 'p.population >= 2000000 AND p.population < 10000000',
          'large': 'p.population >= 10000000'
        };
        if (stateSizeRanges[sizeCategory]) {
          whereClauses.push(stateSizeRanges[sizeCategory]);
        }
      } else {
        // City/County size ranges
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
    }

    // State filter (MULTI - uses ANY with state_name)
    if (states.length > 0) {
      whereClauses.push(`tld.state_name = ANY($${paramCount})`);
      queryParams.push(states);
      paramCount++;
    }

    if (region) {
      whereClauses.push(`tld.region = $${paramCount}`);
      queryParams.push(region);
      paramCount++;
    }

    // Build reform filter WHERE clauses (applied to the reforms join)
    // These will be used in a subquery or CTE to filter which reforms count
    let reformWhereClauses = [];
    let reformParamCount = paramCount;
    let reformTypesParamPos = null; // Track position of reformTypes parameter for category filtering

    // Reform type filter (MULTI - uses EXISTS with junction table)
    if (reformTypes.length > 0) {
      reformTypesParamPos = reformParamCount; // Remember where we put reformTypes
      reformWhereClauses.push(`EXISTS (
        SELECT 1 FROM reform_reform_types rrt_filter
        JOIN reform_types rt_filter ON rrt_filter.reform_type_id = rt_filter.id
        WHERE rrt_filter.reform_id = r.id
          AND rt_filter.code = ANY($${reformParamCount})
      )`);
      queryParams.push(reformTypes);
      reformParamCount++;
    }

    // Status filter (MULTI - uses ANY)
    if (statuses.length > 0) {
      reformWhereClauses.push(`LOWER(r.status) = ANY($${reformParamCount})`);
      queryParams.push(statuses.map(s => s.toLowerCase()));
      reformParamCount++;
    }

    // Date range filters
    if (fromYear !== null || toYear !== null) {
      const dateConditions = [];
      
      if (fromYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) >= $${reformParamCount}`);
        queryParams.push(fromYear);
        reformParamCount++;
      }
      
      if (toYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) <= $${reformParamCount}`);
        queryParams.push(toYear);
        reformParamCount++;
      }
      
      // If we should include unknown dates, OR with IS NULL
      if (includeUnknownDates) {
        reformWhereClauses.push(`(${dateConditions.join(' AND ')} OR r.adoption_date IS NULL)`);
      } else {
        reformWhereClauses.push(`(${dateConditions.join(' AND ')})`);
      }
    } else if (!includeUnknownDates) {
      // If no year range but excluding unknowns, filter out nulls
      reformWhereClauses.push(`r.adoption_date IS NOT NULL`);
    }

    // Scope limitation filter
    if (scopeLimitation === 'no_limits') {
      reformWhereClauses.push(`(
        r.scope IS NULL 
        OR array_length(r.scope, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.scope) AS scope_item 
          WHERE LOWER(scope_item) = 'citywide'
        )
      )`);
    } else if (scopeLimitation === 'has_limits') {
      reformWhereClauses.push(`(
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
      reformWhereClauses.push(`(
        r.land_use IS NULL 
        OR array_length(r.land_use, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.land_use) AS land_item 
          WHERE LOWER(land_item) = 'all uses'
        )
      )`);
    } else if (landUseLimitation === 'has_limits') {
      reformWhereClauses.push(`(
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
      reformWhereClauses.push(`(
        r.requirements IS NULL 
        OR array_length(r.requirements, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.requirements) AS req_item 
          WHERE LOWER(req_item) = 'by right'
        )
      )`);
    } else if (requirementsLimitation === 'has_limits') {
      reformWhereClauses.push(`(
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
      reformWhereClauses.push(`(r.intensity = 'complete' OR r.intensity IS NULL)`);
    } else if (intensityLimitation === 'has_limits') {
      reformWhereClauses.push(`r.intensity = 'partial'`);
    }

    // Combine reform filter clauses; always exclude hidden (rejected) reforms
    const reformFilterClause = `AND (r.hidden IS NOT TRUE)` + (reformWhereClauses.length > 0 
      ? ` AND ${reformWhereClauses.join(' AND ')}`
      : '');

    // If reform types are filtered, we need to also filter categories to only show those from filtered reform types
    // This ensures that only categories containing the filtered reform types are shown
    let categoryFilterClause = '';
    if (reformTypes.length > 0 && reformTypesParamPos !== null) {
      // Only include categories that have reform types matching the filter
      categoryFilterClause = `AND EXISTS (
        SELECT 1 FROM reform_types rt_check
        JOIN categories c_check ON rt_check.category_id = c_check.id
        WHERE rt_check.code = ANY($${reformTypesParamPos})
          AND c_check.id = c.id
      )`;
    }

    // Add limit parameter
    const limitParamCount = reformParamCount;
    queryParams.push(limit);

    const query = `
      WITH place_candidates AS (
        SELECT
          p.id,
          p.name,
          p.place_type,
          p.state_code,
          p.population AS population_effective,
          tld.state_name,
          tld.region,
          COUNT(DISTINCT rrt.reform_type_id) FILTER (WHERE r.id IS NOT NULL) AS reform_types_count,
          COUNT(DISTINCT c.id) FILTER (WHERE r.id IS NOT NULL AND c.id IS NOT NULL ${categoryFilterClause}) AS domains_count,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name ORDER BY c.name) FILTER (WHERE r.id IS NOT NULL AND c.name IS NOT NULL ${categoryFilterClause}), NULL) AS domains
        FROM places p
        LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
        LEFT JOIN reforms r ON r.place_id = p.id ${reformFilterClause}
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
          tld.region
      ),
      top_picks AS (
        SELECT *
        FROM place_candidates
        WHERE reform_types_count > 0
        ORDER BY reform_types_count DESC, domains_count DESC, name
        LIMIT $${limitParamCount}
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