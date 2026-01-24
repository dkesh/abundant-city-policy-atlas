/**
* Netlify Function: Get Reforms with Filtering
* Endpoint: /.netlify/functions/get-reforms
*
* Returns parking and transit reforms from the database with support for filtering:
* - By reform type (rm_min, reduce_min, add_max) - MULTI-SELECT
* - By level of government (state, county, city) - MULTI-SELECT
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
* ?limit=100 - Limit results (default 30 for pagination)
* ?offset=0 - Offset for pagination (default 0)
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
    const offset = params.offset ? Math.max(0, parseInt(params.offset)) : 0;
    const limit = params.limit ? Math.min(parseInt(params.limit), 5000) : 30;
    
    // Limitations filters
    const scopeLimitation = params.scope_limitation || null;
    const landUseLimitation = params.land_use_limitation || null;
    const requirementsLimitation = params.requirements_limitation || null;
    const intensityLimitation = params.intensity_limitation || null;

    // Build dynamic query with filters
    let whereClauses = ['1=1', '(r.hidden IS NOT TRUE)']; // Exclude rejected submission-based reforms
    let queryParams = [];
    let paramCount = 1;

    // Reform type filter (MULTI - uses EXISTS with junction table)
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
      whereClauses.push(`tld.region = $${paramCount}`);
      queryParams.push(region);
      paramCount++;
    }

    // State filter (MULTI - uses ANY)
    if (states.length > 0) {
      whereClauses.push(`tld.state_name = ANY($${paramCount})`);
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

    // Scope limitation filter
    if (scopeLimitation === 'no_limits') {
      // No scope limits = has 'citywide' in scope array
      whereClauses.push(`(
        r.scope IS NULL 
        OR array_length(r.scope, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.scope) AS scope_item 
          WHERE LOWER(scope_item) = 'citywide'
        )
      )`);
    } else if (scopeLimitation === 'has_limits') {
      // Has scope limits = scope exists and doesn't contain 'citywide'
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
      // No land use limits = has 'all uses' in land_use array
      whereClauses.push(`(
        r.land_use IS NULL 
        OR array_length(r.land_use, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.land_use) AS land_item 
          WHERE LOWER(land_item) = 'all uses'
        )
      )`);
    } else if (landUseLimitation === 'has_limits') {
      // Has land use limits = land_use exists and doesn't contain 'all uses'
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
      // No requirements limits = has 'by right' in requirements array
      whereClauses.push(`(
        r.requirements IS NULL 
        OR array_length(r.requirements, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(r.requirements) AS req_item 
          WHERE LOWER(req_item) = 'by right'
        )
      )`);
    } else if (requirementsLimitation === 'has_limits') {
      // Has requirements limits = requirements exists and doesn't contain 'by right'
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
      // No intensity limits = intensity is 'complete' or NULL
      whereClauses.push(`(r.intensity = 'complete' OR r.intensity IS NULL)`);
    } else if (intensityLimitation === 'has_limits') {
      // Has intensity limits = intensity is 'partial'
      whereClauses.push(`r.intensity = 'partial'`);
    }

    // Build final WHERE clause
    const whereClause = whereClauses.join(' AND ');

    console.log('===== DEBUG get-reforms =====');
    console.log('WHERE clause:', whereClause);
    console.log('Query params:', JSON.stringify(queryParams));
    console.log('============================');

    // Query reforms with all related data including sources and policy documents
    // For states, use population from top_level_division if places.population is null
    const query = `
      SELECT
        r.id,
        p.id as place_id,
        p.name as place_name,
        p.place_type,
        COALESCE(p.population, CASE WHEN p.place_type = 'state' THEN tld.population ELSE NULL END) as population,
        p.latitude,
        p.longitude,
        p.encoded_name,
        r.link_url,
        tld.state_code,
        tld.state_name,
        tld.country,
        tld.region,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'code', rt_sub.code,
                'name', rt_sub.name,
                'color_hex', rt_sub.color_hex,
                'sort_order', rt_sub.sort_order
              ) ORDER BY rt_sub.sort_order
            )
            FROM (
              SELECT DISTINCT rt2.code, rt2.name, rt2.color_hex, rt2.sort_order
              FROM reform_reform_types rrt2
              JOIN reform_types rt2 ON rrt2.reform_type_id = rt2.id
              WHERE rrt2.reform_id = r.id
            ) rt_sub
          ),
          '[]'::json
        ) as reform_types,
        r.status,
        r.scope,
        r.land_use,
        r.adoption_date,
        r.summary,
        r.requirements,
        r.notes,
        r.intensity,
        r.created_at,
        r.ai_enriched_fields,
        r.ai_enrichment_version,
        r.summary as original_summary,
        r.scope as original_scope,
        r.land_use as original_land_use,
        r.requirements as original_requirements,
        pd.id as policy_document_id,
        pd.title as policy_document_title,
        pd.reference_number as policy_document_reference,
        pd.ai_enriched_fields as policy_doc_ai_fields,
        pd.key_points as original_key_points,
        pd.analysis as original_analysis,
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
      JOIN places p ON r.place_id = p.id
      JOIN top_level_division tld ON p.state_code = tld.state_code
      LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
      LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
      WHERE ${whereClause}
      GROUP BY r.id, p.id, p.name, p.place_type, p.population, tld.population, p.latitude, p.longitude, p.encoded_name, r.link_url,
               tld.state_code, tld.state_name, tld.country, tld.region,
               r.status, r.scope, r.land_use, r.adoption_date, r.summary, r.requirements, r.notes, r.intensity, r.created_at,
               r.ai_enriched_fields, r.ai_enrichment_version,
               pd.id, pd.title, pd.reference_number, pd.ai_enriched_fields, pd.key_points, pd.analysis
      ORDER BY tld.state_name, p.name, r.adoption_date DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(limit);
    queryParams.push(offset);

    const result = await client.query(query, queryParams);
    
    // Get total count for pagination metadata (using same WHERE clause)
    const countQuery = `
      SELECT COUNT(DISTINCT r.id) as total
      FROM reforms r
      JOIN places p ON r.place_id = p.id
      JOIN top_level_division tld ON p.state_code = tld.state_code
      WHERE ${whereClause}
    `;
    
    // Rebuild queryParams for count query (without limit/offset)
    const countParams = queryParams.slice(0, -2);
    const countResult = await client.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    client.release();

    // Helper function to get merged value (AI if available, otherwise original)
    const getMergedValue = (aiEnrichment, fieldName, originalValue) => {
      if (aiEnrichment?.fields?.[fieldName]?.value !== undefined && 
          aiEnrichment?.fields?.[fieldName]?.value !== null) {
        return aiEnrichment.fields[fieldName].value;
      }
      return originalValue;
    };

    // Transform results for API response
    const reforms = result.rows.map(row => {
      const aiEnrichment = row.ai_enriched_fields || null;
      
      // Get merged values (AI where available, original otherwise)
      const mergedSummary = getMergedValue(aiEnrichment, 'summary', row.summary);
      const mergedScope = getMergedValue(aiEnrichment, 'scope', row.scope) || [];
      const mergedLandUse = getMergedValue(aiEnrichment, 'land_use', row.land_use) || [];
      const mergedRequirements = getMergedValue(aiEnrichment, 'requirements', row.requirements) || [];
      
      return {
        id: row.id,
        place: {
          id: row.place_id,
          name: row.place_name,
          type: row.place_type,
          state: row.state_name,
          state_code: row.state_code,
          country: row.country,
          population: row.population,
          latitude: row.latitude,
          longitude: row.longitude,
          encoded_name: row.encoded_name,
          region: row.region
        },
        reform: {
          types: row.reform_types || [],  // Array of reform types
          // For backwards compatibility, use first type if available
          type: row.reform_types && row.reform_types.length > 0 ? row.reform_types[0].code : null,
          type_name: row.reform_types && row.reform_types.length > 0 ? row.reform_types[0].name : null,
          color: row.reform_types && row.reform_types.length > 0 ? row.reform_types[0].color_hex : null,
          status: row.status,
          scope: mergedScope,
          land_use: mergedLandUse,
          adoption_date: row.adoption_date ? row.adoption_date.toISOString().split('T')[0] : null,
          summary: mergedSummary || '',
          requirements: mergedRequirements,
          intensity: row.intensity,
          notes: row.notes || '',
          link_url: row.link_url,
          sources: row.sources || [],
          original: {
            summary: row.original_summary || '',
            scope: row.original_scope || [],
            land_use: row.original_land_use || [],
            requirements: row.original_requirements || []
          },
          ai_enrichment: aiEnrichment ? {
            version: aiEnrichment.version,
            enriched_at: aiEnrichment.enriched_at,
            model: aiEnrichment.model,
            provider: aiEnrichment.provider,
            fields: aiEnrichment.fields || {}
          } : null,
          policy_document: row.policy_document_id ? {
            id: row.policy_document_id,
            title: row.policy_document_title,
            reference_number: row.policy_document_reference,
            original: {
              key_points: row.original_key_points || [],
              analysis: row.original_analysis || ''
            },
            ai_enrichment: row.policy_doc_ai_fields ? {
              version: row.policy_doc_ai_fields.version,
              enriched_at: row.policy_doc_ai_fields.enriched_at,
              fields: row.policy_doc_ai_fields.fields || {}
            } : null
          } : null
        }
      };
    });

    const hasMore = (offset + result.rows.length) < totalCount;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: result.rows.length,
        pagination: {
          offset: offset,
          limit: limit,
          total_count: totalCount,
          has_more: hasMore
        },
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
