/**
 * Netlify Function: Get Policy Profile for a Jurisdiction
 * Endpoint: /.netlify/functions/get-policy-profile?place_id={id}
 * 
 * Returns policy profile data for a specific jurisdiction including:
 * - Place metadata
 * - Reforms timeline (chronological)
 * - Domain summaries
 * - Priority areas for improvement (peer-based suggestions)
 * - Advocacy organizations active in this jurisdiction
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

    // Parse filter parameters (optional)
    const parseMultiValue = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      return val.split(',').map(v => v.trim()).filter(Boolean);
    };

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

    // Get place metadata
    const placeQuery = `
      SELECT 
        p.id,
        p.name,
        p.place_type,
        p.state_code,
        p.population,
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

    // Build reform filter WHERE clauses
    let reformWhereClauses = ['r.place_id = $1', '(r.hidden IS NOT TRUE)'];
    let reformQueryParams = [placeId];
    let reformParamCount = 2;

    // Reform type filter
    if (reformTypes.length > 0) {
      reformWhereClauses.push(`EXISTS (
        SELECT 1 FROM reform_reform_types rrt_filter
        JOIN reform_types rt_filter ON rrt_filter.reform_type_id = rt_filter.id
        WHERE rrt_filter.reform_id = r.id
          AND rt_filter.code = ANY($${reformParamCount})
      )`);
      reformQueryParams.push(reformTypes);
      reformParamCount++;
    }

    // Status filter
    if (statuses.length > 0) {
      reformWhereClauses.push(`LOWER(r.status) = ANY($${reformParamCount})`);
      reformQueryParams.push(statuses.map(s => s.toLowerCase()));
      reformParamCount++;
    }

    // Date range filters
    if (fromYear !== null || toYear !== null) {
      const dateConditions = [];
      
      if (fromYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) >= $${reformParamCount}`);
        reformQueryParams.push(fromYear);
        reformParamCount++;
      }
      
      if (toYear !== null) {
        dateConditions.push(`EXTRACT(YEAR FROM r.adoption_date) <= $${reformParamCount}`);
        reformQueryParams.push(toYear);
        reformParamCount++;
      }
      
      if (includeUnknownDates) {
        reformWhereClauses.push(`(${dateConditions.join(' AND ')} OR r.adoption_date IS NULL)`);
      } else {
        reformWhereClauses.push(`(${dateConditions.join(' AND ')})`);
      }
    } else if (!includeUnknownDates) {
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

    // Get all reforms for this place with reform type info, sorted by adoption date for timeline
    // Note: This query returns one row per reform-reform_type combination
    // We use LEFT JOIN to include reforms even if they have no reform types
    // We'll group by reform_id to combine reform types and sources
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
        r.summary,
        r.notes,
        r.link_url,
        r.ai_enriched_fields,
        r.intensity,
        rt.code as reform_code,
        c.name as category,
        rt.name as reform_name,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', s.id,
                'name', s.name,
                'short_name', s.short_name,
                'logo', s.logo_filename,
                'website_url', s.website_url,
                'reporter', rs.reporter,
                'source_url', rs.source_url,
                'notes', rs.notes,
                'is_primary', rs.is_primary
              ) ORDER BY rs.is_primary DESC, s.name
            )
            FROM reform_sources rs
            JOIN sources s ON rs.source_id = s.id
            WHERE rs.reform_id = r.id
          ),
          '[]'::json
        ) as sources
      FROM reforms r
      LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
      LEFT JOIN categories c ON rt.category_id = c.id
      WHERE ${reformWhereClauses.join(' AND ')}
      ORDER BY 
        CASE WHEN r.adoption_date IS NULL THEN 1 ELSE 0 END,
        r.adoption_date DESC NULLS LAST,
        CASE WHEN c.name IS NULL THEN 1 ELSE 0 END,
        c.name,
        rt.name
    `;

    const reformsResult = await client.query(reformsQuery, reformQueryParams);
    
    // Deduplicate reforms: the query returns one row per reform-reform_type combination
    // Group by reform.id and collect all reform_types
    const reformMap = new Map();
    reformsResult.rows.forEach(row => {
      const reformId = row.id;
      
      if (!reformMap.has(reformId)) {
        // First time seeing this reform - initialize with this row's data
        reformMap.set(reformId, {
          ...row,
          reform_types: row.reform_type_id ? [{
            id: row.reform_type_id,
            code: row.reform_code,
            name: row.reform_name,
            category: row.category
          }] : []
        });
      } else {
        // Already seen this reform - add this reform_type if it's not already present
        const existing = reformMap.get(reformId);
        if (row.reform_type_id) {
          const typeExists = existing.reform_types.some(rt => rt.id === row.reform_type_id);
          if (!typeExists) {
            existing.reform_types.push({
              id: row.reform_type_id,
              code: row.reform_code,
              name: row.reform_name,
              category: row.category
            });
          }
        }
      }
    });
    
    // Convert map to array and use first reform_type for display fields
    const reforms = Array.from(reformMap.values()).map(r => {
      const firstReformType = r.reform_types.length > 0 ? r.reform_types[0] : null;
      return {
        ...r,
        reform_name: firstReformType?.name || r.reform_name || 'Unclassified Reform',
        reform_code: firstReformType?.code || r.reform_code || null,
        category: firstReformType?.category || r.category || 'Uncategorized'
      };
    });

    // Get all reform types by category for domain overview
    const reformTypesQuery = `
      SELECT 
        rt.id,
        rt.code,
        c.name as category,
        rt.name
      FROM reform_types rt
      LEFT JOIN categories c ON rt.category_id = c.id
      WHERE rt.category_id IS NOT NULL
      ORDER BY c.name, rt.name
    `;

    const reformTypesResult = await client.query(reformTypesQuery);
    const allReformTypes = reformTypesResult.rows;

    // Get TODO items: reform types that are common in similar jurisdictions but missing here
    // Strategy: Find reform types that are common in similar-sized jurisdictions in the same state/region
    // but not adopted by this jurisdiction
    // If reform types are filtered, only suggest reforms from those categories
    let todoQueryParams = [
      place.place_type,
      place.state_code || '',
      place.region || '',
      place.population || null,
      placeId
    ];
    let todoParamCount = 6;

    // Build filter clause for suggested reforms
    let todoFilterClause = '';
    if (reformTypes.length > 0) {
      // Get categories for the filtered reform types
      const categoryQuery = `
        SELECT DISTINCT c.id, c.name
        FROM reform_types rt
        JOIN categories c ON rt.category_id = c.id
        WHERE rt.code = ANY($1)
      `;
      const categoryResult = await client.query(categoryQuery, [reformTypes]);
      const filteredCategories = categoryResult.rows.map(r => r.name);
      
      if (filteredCategories.length > 0) {
        todoFilterClause = `AND c.name = ANY($${todoParamCount})`;
        todoQueryParams.push(filteredCategories);
        todoParamCount++;
      } else {
        // If no categories found, return empty result
        todoFilterClause = 'AND 1=0';
      }
    }

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
          c.name as category,
          COUNT(DISTINCT r.place_id) as adoption_count
        FROM reforms r
        JOIN reform_reform_types rrt ON r.id = rrt.reform_id
        JOIN reform_types rt ON rrt.reform_type_id = rt.id
        LEFT JOIN categories c ON rt.category_id = c.id
        WHERE r.place_id IN (SELECT id FROM similar_places)
          AND (r.hidden IS NOT TRUE)
          ${todoFilterClause}
        GROUP BY rt.id, rt.code, rt.name, c.name
        HAVING COUNT(DISTINCT r.place_id) >= 3
      ),
      missing_reforms AS (
        SELECT cr.*
        FROM common_reforms cr
        WHERE NOT EXISTS (
          SELECT 1 FROM reforms r
          WHERE r.place_id = $5
            AND (r.hidden IS NOT TRUE)
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
    const todoResult = await client.query(todoQuery, todoQueryParams);

    // Get reform summary by category for domain overview (only filtered reforms)
    // Use the same filter clauses as the reforms query
    const reformSummaryQuery = `
      SELECT 
        c.name as category,
        rt.code as reform_code,
        rt.name as reform_name,
        COUNT(DISTINCT r.id) as reform_count
      FROM reforms r
      JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      JOIN reform_types rt ON rrt.reform_type_id = rt.id
      LEFT JOIN categories c ON rt.category_id = c.id
      WHERE ${reformWhereClauses.join(' AND ')}
      GROUP BY c.name, rt.code, rt.name
      ORDER BY c.name, rt.name
    `;

    const reformSummaryResult = await client.query(reformSummaryQuery, reformQueryParams);

    // Get advocacy organizations for this place
    // Includes direct matches and hierarchical matches (state-level orgs shown for cities/counties)
    const advocacyOrgsQuery = `
      SELECT DISTINCT
        ao.id,
        ao.name,
        ao.website_url,
        ao.logo_url,
        ao.description
      FROM advocacy_organizations ao
      JOIN advocacy_organization_places aop ON ao.id = aop.advocacy_organization_id
      JOIN places p_org ON aop.place_id = p_org.id
      JOIN places p_target ON p_target.id = $1
      WHERE 
        -- Direct place match
        aop.place_id = $1
        OR
        -- State-level match: show state-level orgs for cities/counties in that state
        (p_org.place_type = 'state' 
         AND p_org.state_code = p_target.state_code
         AND p_target.place_type IN ('city', 'county'))
      ORDER BY ao.name
    `;

    const advocacyOrgsResult = await client.query(advocacyOrgsQuery, [placeId]);
    const advocacyOrganizations = advocacyOrgsResult.rows;

    client.release();

    // Build domain summaries: count reform types per category
    const domainSummaries = {};
    const reformTypesByCategory = {};
    
    // Group reform types by category
    allReformTypes.forEach(rt => {
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
        reform_name: r.reform_name || 'Unclassified Reform',
        reform_code: r.reform_code || null,
        category: r.category || 'Uncategorized',
        scope: r.scope,
        land_use: r.land_use,
        requirements: r.requirements,
        intensity: r.intensity,
        summary: r.summary,
        notes: r.notes,
        link_url: r.link_url,
        ai_enriched_fields: r.ai_enriched_fields,
        sources: Array.isArray(r.sources) ? r.sources : []
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
      }, {}),
      advocacyOrganizations: advocacyOrganizations.map(org => ({
        id: org.id,
        name: org.name,
        websiteUrl: org.website_url,
        logoUrl: org.logo_url,
        description: org.description
      }))
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