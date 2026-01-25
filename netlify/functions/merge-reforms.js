/**
 * Netlify Function: Merge Reforms
 * Endpoint: /.netlify/functions/merge-reforms (or /api/merge-reforms)
 * Method: POST
 * Auth: Requires admin session cookie (see admin-auth).
 * Body: { keep_reform_id, merge_reform_id, updates: { summary?, scope?, land_use?, ... } }
 *
 * Updates the kept reform with `updates`, merges sources/citations/reform_types
 * from the merge reform into the kept one, then deletes the merge reform.
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

const UPDATABLE_REFORM_FIELDS = [
  'summary', 'notes', 'scope', 'land_use', 'requirements', 'status', 'intensity',
  'reform_mechanism', 'reform_phase', 'legislative_number', 'link_url', 'policy_document_id'
];

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(event, { success: false, error: 'Method not allowed' }, 405);
  }

  if (!isAuthenticated(event)) {
    return json(event, { success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { keep_reform_id, merge_reform_id, updates } = body;

    if (!keep_reform_id || !merge_reform_id) {
      return json(event, { success: false, error: 'keep_reform_id and merge_reform_id are required' }, 400);
    }

    const keepId = parseInt(keep_reform_id, 10);
    const mergeId = parseInt(merge_reform_id, 10);
    if (Number.isNaN(keepId) || Number.isNaN(mergeId)) {
      return json(event, { success: false, error: 'keep_reform_id and merge_reform_id must be numbers' }, 400);
    }

    if (keepId === mergeId) {
      return json(event, { success: false, error: 'keep_reform_id and merge_reform_id must be different' }, 400);
    }

    const updatesObj = updates && typeof updates === 'object' ? updates : {};
    const reformTypeIds = Array.isArray(updatesObj.reform_type_ids) ? updatesObj.reform_type_ids : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const setClauses = [];
      const values = [];
      let idx = 1;

      for (const f of UPDATABLE_REFORM_FIELDS) {
        if (!(f in updatesObj)) continue;
        const v = updatesObj[f];
        if (f === 'scope' || f === 'land_use' || f === 'requirements') {
          const arr = Array.isArray(v) ? v : (v == null ? null : [v]);
          setClauses.push(`${f} = $${idx}`);
          values.push(arr);
        } else if (f === 'policy_document_id') {
          setClauses.push(`${f} = $${idx}`);
          values.push(v === '' || v == null ? null : v);
        } else {
          setClauses.push(`${f} = $${idx}`);
          values.push(v === '' ? null : v);
        }
        idx++;
      }

      if (setClauses.length) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(keepId);
        await client.query(
          `UPDATE reforms SET ${setClauses.join(', ')} WHERE id = $${idx}`,
          values
        );
      }

      if (reformTypeIds != null) {
        await client.query('DELETE FROM reform_reform_types WHERE reform_id = $1', [keepId]);
        for (const tid of reformTypeIds) {
          const t = parseInt(tid, 10);
          if (Number.isNaN(t)) continue;
          await client.query(
            `INSERT INTO reform_reform_types (reform_id, reform_type_id) VALUES ($1, $2)
             ON CONFLICT (reform_id, reform_type_id) DO NOTHING`,
            [keepId, t]
          );
        }
      } else {
        const rrt = await client.query(
          'SELECT reform_type_id FROM reform_reform_types WHERE reform_id = $1',
          [mergeId]
        );
        for (const row of rrt.rows || []) {
          await client.query(
            `INSERT INTO reform_reform_types (reform_id, reform_type_id) VALUES ($1, $2)
             ON CONFLICT (reform_id, reform_type_id) DO NOTHING`,
            [keepId, row.reform_type_id]
          );
        }
      }

      const src = await client.query(
        'SELECT source_id, reporter, source_url, notes, is_primary FROM reform_sources WHERE reform_id = $1',
        [mergeId]
      );
      for (const row of src.rows || []) {
        await client.query(
          `INSERT INTO reform_sources (reform_id, source_id, reporter, source_url, notes, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (reform_id, source_id) DO NOTHING`,
          [keepId, row.source_id, row.reporter, row.source_url, row.notes, row.is_primary]
        );
      }

      const existingCitations = await client.query(
        'SELECT citation_url, citation_description FROM reform_citations WHERE reform_id = $1',
        [keepId]
      );
      const existingSet = new Set(
        (existingCitations.rows || []).map((r) => `${r.citation_url || ''}\t${r.citation_description || ''}`)
      );

      const cit = await client.query(
        'SELECT citation_description, citation_url, citation_notes FROM reform_citations WHERE reform_id = $1',
        [mergeId]
      );
      for (const row of cit.rows || []) {
        const key = `${row.citation_url || ''}\t${row.citation_description || ''}`;
        if (existingSet.has(key)) continue;
        existingSet.add(key);
        await client.query(
          `INSERT INTO reform_citations (reform_id, citation_description, citation_url, citation_notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [keepId, row.citation_description, row.citation_url, row.citation_notes]
        );
      }

      await client.query('DELETE FROM reforms WHERE id = $1', [mergeId]);
      await client.query('COMMIT');

      return json(event, { success: true });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    return json(event, { success: false, error: 'Internal server error' }, 500);
  }
};
