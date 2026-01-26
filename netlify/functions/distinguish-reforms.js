/**
 * Netlify Function: Distinguish Reforms
 * Endpoint: /.netlify/functions/distinguish-reforms (or /api/distinguish-reforms)
 * Method: POST
 * Auth: Requires admin session cookie (see admin-auth).
 * Body: { reform_id_1: number, reform_id_2: number }
 *
 * Marks a pair of reforms as distinct (not duplicates). The pair is stored
 * in reform_distinguished_pairs and will be excluded from merge candidates.
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
    let { reform_id_1, reform_id_2 } = body;

    if (reform_id_1 == null || reform_id_2 == null) {
      return json(event, { success: false, error: 'reform_id_1 and reform_id_2 are required' }, 400);
    }

    reform_id_1 = parseInt(reform_id_1, 10);
    reform_id_2 = parseInt(reform_id_2, 10);
    if (Number.isNaN(reform_id_1) || Number.isNaN(reform_id_2)) {
      return json(event, { success: false, error: 'reform_id_1 and reform_id_2 must be numbers' }, 400);
    }

    if (reform_id_1 === reform_id_2) {
      return json(event, { success: false, error: 'reform_id_1 and reform_id_2 must be different' }, 400);
    }

    const id1 = Math.min(reform_id_1, reform_id_2);
    const id2 = Math.max(reform_id_1, reform_id_2);

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO reform_distinguished_pairs (reform_id_1, reform_id_2)
         VALUES ($1, $2)
         ON CONFLICT (reform_id_1, reform_id_2) DO NOTHING`,
        [id1, id2]
      );
      
      // Log admin action (after successful insert)
      try {
        await client.query(`
          INSERT INTO activity_logs (log_type, action, status, metadata)
          VALUES ('admin_action', 'distinguish_reforms', 'success', $1::jsonb)
        `, [JSON.stringify({
          reform_id_1: id1,
          reform_id_2: id2,
          admin_user: 'admin'
        })]);
      } catch (logError) {
        // Don't fail the distinguish if logging fails, but log to console
        console.error('Failed to log distinguish action:', logError);
      }
      
      return json(event, { success: true });
    } finally {
      client.release();
    }
  } catch (e) {
    return json(event, { success: false, error: 'Internal server error' }, 500);
  }
};
