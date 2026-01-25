/**
 * Netlify Function: Get Merge Candidates
 * Endpoint: /.netlify/functions/get-merge-candidates (or /api/get-merge-candidates)
 * Method: GET
 * Auth: Requires admin session cookie (see admin-auth).
 *
 * Returns suspected duplicate reform pairs (same place, same adoption date),
 * excluding groups where 2+ reforms have policy docs with different reference numbers,
 * and excluding pairs in reform_distinguished_pairs.
 * Response: { success: true, pairs: [ { reform_id_1, reform_id_2, place, adoption_date, reform_a, reform_b } ] }
 */

const { Pool } = require('pg');
const { isAuthenticated, corsHeaders } = require('./admin-auth-utils');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function json(event, body, statusCode = 200) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify(body) };
}

const REFORMS_DETAIL_SQL = `
WITH dup_groups AS (
  SELECT place_id, adoption_date
  FROM reforms
  WHERE adoption_date IS NOT NULL
  GROUP BY place_id, adoption_date
  HAVING COUNT(*) >= 2
),
excluded AS (
  SELECT r.place_id, r.adoption_date
  FROM reforms r
  JOIN policy_documents pd ON r.policy_document_id = pd.id
  WHERE r.adoption_date IS NOT NULL
    AND (r.place_id, r.adoption_date) IN (SELECT place_id, adoption_date FROM dup_groups)
  GROUP BY r.place_id, r.adoption_date
  HAVING COUNT(DISTINCT pd.reference_number) > 1
),
dup_groups_filtered AS (
  SELECT place_id, adoption_date FROM dup_groups
  EXCEPT
  SELECT place_id, adoption_date FROM excluded
)
SELECT
  r.id,
  r.place_id,
  r.policy_document_id,
  r.status,
  r.scope,
  r.land_use,
  r.adoption_date,
  r.summary,
  r.requirements,
  r.reform_mechanism,
  r.reform_phase,
  r.legislative_number,
  r.intensity,
  r.notes,
  r.link_url,
  r.hidden,
  r.created_at,
  r.updated_at,
  p.name AS place_name,
  p.place_type,
  p.state_code,
  tld.state_name,
  tld.region,
  pd.reference_number AS pd_reference_number,
  pd.title AS pd_title,
  pd.document_url AS pd_document_url,
  COALESCE(
    (SELECT json_agg(json_build_object('id', rt.id, 'code', rt.code, 'name', rt.name, 'category', c.name) ORDER BY rt.sort_order NULLS LAST, rt.id)
     FROM reform_reform_types rrt
     JOIN reform_types rt ON rrt.reform_type_id = rt.id
     LEFT JOIN categories c ON rt.category_id = c.id
     WHERE rrt.reform_id = r.id),
    '[]'::json
  ) AS reform_types,
  COALESCE(
    (SELECT json_agg(json_build_object('short_name', s.short_name, 'name', s.name, 'source_url', rs.source_url, 'reporter', rs.reporter, 'is_primary', rs.is_primary) ORDER BY rs.is_primary DESC NULLS LAST, s.name)
     FROM reform_sources rs JOIN sources s ON rs.source_id = s.id WHERE rs.reform_id = r.id),
    '[]'::json
  ) AS sources,
  COALESCE(
    (SELECT json_agg(json_build_object('citation_description', rc.citation_description, 'citation_url', rc.citation_url, 'citation_notes', rc.citation_notes))
     FROM reform_citations rc WHERE rc.reform_id = r.id),
    '[]'::json
  ) AS citations
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
LEFT JOIN policy_documents pd ON r.policy_document_id = pd.id
WHERE (r.place_id, r.adoption_date) IN (SELECT place_id, adoption_date FROM dup_groups_filtered)
ORDER BY tld.state_name, p.name, r.adoption_date, r.id
`;

function rowToReform(r) {
  return {
    id: r.id,
    place_id: r.place_id,
    policy_document_id: r.policy_document_id,
    status: r.status,
    scope: Array.isArray(r.scope) ? r.scope : (r.scope ? [r.scope] : []),
    land_use: Array.isArray(r.land_use) ? r.land_use : (r.land_use ? [r.land_use] : []),
    adoption_date: r.adoption_date ? (typeof r.adoption_date === 'string' ? r.adoption_date : r.adoption_date.toISOString().slice(0, 10)) : null,
    summary: r.summary,
    requirements: Array.isArray(r.requirements) ? r.requirements : (r.requirements ? [r.requirements] : []),
    reform_mechanism: r.reform_mechanism,
    reform_phase: r.reform_phase,
    legislative_number: r.legislative_number,
    intensity: r.intensity,
    notes: r.notes,
    link_url: r.link_url,
    hidden: Boolean(r.hidden),
    created_at: r.created_at ? (r.created_at.toISOString ? r.created_at.toISOString() : r.created_at) : null,
    updated_at: r.updated_at ? (r.updated_at.toISOString ? r.updated_at.toISOString() : r.updated_at) : null,
    place_name: r.place_name,
    place_type: r.place_type,
    state_code: r.state_code,
    state_name: r.state_name,
    region: r.region,
    policy_document: (r.pd_reference_number || r.pd_title || r.pd_document_url)
      ? { reference_number: r.pd_reference_number, title: r.pd_title, document_url: r.pd_document_url }
      : null,
    reform_types: r.reform_types || [],
    sources: r.sources || [],
    citations: r.citations || []
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return json(event, { success: false, error: 'Method not allowed' }, 405);
  }

  if (!isAuthenticated(event)) {
    return json(event, { success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const client = await pool.connect();
    try {
      const [reformsRes, distinguishedRes] = await Promise.all([
        client.query(REFORMS_DETAIL_SQL),
        client.query('SELECT reform_id_1, reform_id_2 FROM reform_distinguished_pairs')
      ]);

      const distinguished = new Set(
        (distinguishedRes.rows || []).map((row) => `${row.reform_id_1},${row.reform_id_2}`)
      );

      const rows = reformsRes.rows || [];
      const byGroup = new Map();
      for (const r of rows) {
        const key = `${r.place_id}\t${r.adoption_date ? r.adoption_date.toISOString().slice(0, 10) : ''}`;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key).push(rowToReform(r));
      }

      const pairs = [];
      for (const [, reforms] of byGroup) {
        for (let i = 0; i < reforms.length; i++) {
          for (let j = i + 1; j < reforms.length; j++) {
            const id1 = Math.min(reforms[i].id, reforms[j].id);
            const id2 = Math.max(reforms[i].id, reforms[j].id);
            if (distinguished.has(`${id1},${id2}`)) continue;
            const a = reforms[i].id < reforms[j].id ? reforms[i] : reforms[j];
            const b = reforms[i].id < reforms[j].id ? reforms[j] : reforms[i];
            const place = {
              place_id: a.place_id,
              place_name: a.place_name,
              state_code: a.state_code,
              state_name: a.state_name,
              place_type: a.place_type,
              region: a.region,
              adoption_date: a.adoption_date
            };
            pairs.push({
              reform_id_1: id1,
              reform_id_2: id2,
              place,
              adoption_date: a.adoption_date,
              reform_a: a,
              reform_b: b
            });
          }
        }
      }

      return json(event, { success: true, pairs });
    } finally {
      client.release();
    }
  } catch (e) {
    return json(event, { success: false, error: 'Internal server error' }, 500);
  }
};
