/**
 * Netlify Function: Update Review Decision
 * Endpoint: /.netlify/functions/update-review-decision (or /api/update-review-decision)
 * Method: POST
 * Auth: Requires admin session cookie (see admin-auth).
 * Body: { "queue_id": number, "decision": "approved" | "rejected" }
 *
 * Reject: hide reform from users (if any), mark queue item rejected.
 * Accept: show reform (if any) or create reform from flagged submission; mark queue item approved.
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

/** Extract state code from bill URL (e.g. leg.texas.gov -> TX). */
function extractStateFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.toLowerCase();
  const map = {
    'leg.texas.gov': 'TX', 'capitol.texas.gov': 'TX',
    'legislature.ca.gov': 'CA', 'leginfo.legislature.ca.gov': 'CA',
    'legislature.state.oh.us': 'OH', 'legislature.ohio.gov': 'OH',
    'legis.ga.gov': 'GA', 'legis.wisconsin.gov': 'WI',
    'legislature.maine.gov': 'ME', 'legislature.vermont.gov': 'VT',
    'legislature.ny.gov': 'NY', 'nysenate.gov': 'NY', 'assembly.state.ny.us': 'NY',
    'malegislature.gov': 'MA', 'legislature.idaho.gov': 'ID',
    'legislature.az.gov': 'AZ', 'apps.azleg.gov': 'AZ',
    'leg.colorado.gov': 'CO', 'legislature.florida.gov': 'FL',
    'iga.in.gov': 'IN', 'legis.iowa.gov': 'IA', 'legislature.ks.gov': 'KS',
    'legislature.ky.gov': 'KY', 'legis.la.gov': 'LA', 'legislature.mi.gov': 'MI',
    'leg.mn.gov': 'MN', 'house.mo.gov': 'MO', 'legislature.ne.gov': 'NE',
    'gencourt.state.nh.us': 'NH', 'njleg.state.nj.us': 'NJ',
    'nmlegis.gov': 'NM', 'ncleg.gov': 'NC', 'ndlegis.gov': 'ND',
    'legislature.ok.gov': 'OK', 'oregonlegislature.gov': 'OR',
    'legis.state.pa.us': 'PA', 'rilin.state.ri.us': 'RI',
    'scstatehouse.gov': 'SC', 'sdlegislature.gov': 'SD',
    'capitol.tn.gov': 'TN', 'capitol.texas.gov': 'TX',
    'le.utah.gov': 'UT', 'legislature.vermont.gov': 'VT',
    'virginiageneralassembly.gov': 'VA', 'leg.wa.gov': 'WA',
    'legis.wv.gov': 'WV', 'legis.wisconsin.gov': 'WI', 'wyoleg.gov': 'WY'
  };
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (map[host]) return map[host];
    const m = host.match(/([a-z]{2})\.(?:gov|state\.us)/);
    if (m) return m[1].toUpperCase();
  } catch (_) {}
  return null;
}

/** Create reform from flagged submission (no reform yet). Returns new reform_id or null. */
async function createReformFromFlagged(client, submission) {
  const { policy_document_id, submitted_url, assessment_result } = submission;
  if (!policy_document_id || !submitted_url) return null;

  const pd = await client.query(
    `SELECT reference_number, title, state_code, status, last_action_date, date_adopted
     FROM policy_documents WHERE id = $1`,
    [policy_document_id]
  );
  if (pd.rows.length === 0) return null;
  const doc = pd.rows[0];

  let stateCode = doc.state_code || extractStateFromUrl(submitted_url);
  if (!stateCode) return null;

  let placeId = (await client.query(
    `SELECT id FROM places WHERE place_type = 'state' AND state_code = $1 LIMIT 1`,
    [stateCode]
  )).rows[0]?.id;

  if (!placeId) {
    const tld = await client.query(
      `SELECT state_name FROM top_level_division WHERE state_code = $1`,
      [stateCode]
    );
    const stateName = tld.rows[0]?.state_name || stateCode;
    const ins = await client.query(
      `INSERT INTO places (name, place_type, state_code) VALUES ($1, 'state', $2)
       ON CONFLICT (name, state_code, place_type) DO UPDATE SET name = places.name
       RETURNING id`,
      [stateName, stateCode]
    );
    placeId = ins.rows[0]?.id;
  }
  if (!placeId) return null;

  let reformTypeIds = [];
  const assessment = typeof assessment_result === 'string'
    ? (() => { try { return JSON.parse(assessment_result); } catch { return {}; } })()
    : (assessment_result || {});
  const codes = assessment.reform_type_suggestions || [];
  if (Array.isArray(codes) && codes.length > 0) {
    const r = await client.query(
      `SELECT id FROM reform_types WHERE code = ANY($1)`,
      [codes]
    );
    reformTypeIds = r.rows.map((row) => row.id);
  }
  if (reformTypeIds.length === 0) {
    const def = await client.query(
      `SELECT id FROM reform_types WHERE code IN ('other:general', 'other:unspecified') LIMIT 1`
    );
    if (def.rows[0]) reformTypeIds = [def.rows[0].id];
  }
  if (reformTypeIds.length === 0) return null;

  const summary = doc.title || `Bill from ${submitted_url}`;
  const status = doc.status || 'proposed';
  const adoptionDate = doc.date_adopted || doc.last_action_date || null;

  const insReform = await client.query(
    `INSERT INTO reforms (
       place_id, policy_document_id, status, summary, legislative_number,
       link_url, adoption_date, hidden
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [placeId, policy_document_id, status, summary, doc.reference_number, submitted_url, adoptionDate]
  );
  const reformId = insReform.rows[0]?.id;
  if (!reformId) return null;

  for (const tid of reformTypeIds) {
    await client.query(
      `INSERT INTO reform_reform_types (reform_id, reform_type_id) VALUES ($1, $2)
       ON CONFLICT (reform_id, reform_type_id) DO NOTHING`,
      [reformId, tid]
    );
  }

  await client.query(
    `UPDATE bill_submissions SET reform_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [reformId, submission.submission_id]
  );

  return reformId;
}

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
    const { queue_id, decision } = body;

    if (!queue_id || !decision) {
      return json(event, { success: false, error: 'queue_id and decision are required' }, 400);
    }

    const d = String(decision).toLowerCase();
    if (d !== 'approved' && d !== 'rejected') {
      return json(event, { success: false, error: 'decision must be approved or rejected' }, 400);
    }

    const client = await pool.connect();
    try {
      const q = await client.query(
        `SELECT q.id, q.submission_id, bs.reform_id, bs.policy_document_id, bs.submitted_url, bs.assessment_result
         FROM bill_review_queue q
         JOIN bill_submissions bs ON bs.id = q.submission_id
         WHERE q.id = $1 AND q.review_decision = 'pending'`,
        [queue_id]
      );
      if (q.rows.length === 0) {
        return json(event, { success: false, error: 'Queue item not found or already reviewed' }, 404);
      }

      const row = q.rows[0];
      const submission = {
        submission_id: row.submission_id,
        reform_id: row.reform_id,
        policy_document_id: row.policy_document_id,
        submitted_url: row.submitted_url,
        assessment_result: row.assessment_result
      };

      await client.query('BEGIN');

      if (d === 'rejected') {
        if (submission.reform_id) {
          await client.query(
            `UPDATE reforms SET hidden = true WHERE id = $1`,
            [submission.reform_id]
          );
        }
      } else {
        if (submission.reform_id) {
          await client.query(
            `UPDATE reforms SET hidden = false WHERE id = $1`,
            [submission.reform_id]
          );
        } else {
          const created = await createReformFromFlagged(client, submission);
          if (!created) {
            await client.query('ROLLBACK');
            return json(event, { success: false, error: 'Could not create reform from flagged submission (missing state or reform types)' }, 400);
          }
        }
      }

      await client.query(
        `UPDATE bill_review_queue
         SET review_decision = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'admin'
         WHERE id = $2`,
        [d, queue_id]
      );

      await client.query('COMMIT');

      return json(event, {
        success: true,
        item: {
          id: parseInt(queue_id, 10),
          review_decision: d,
          reviewed_at: new Date().toISOString()
        }
      });
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
