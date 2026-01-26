/**
 * Netlify Function: Get Activity Logs
 * Endpoint: /.netlify/functions/get-logs (or /api/get-logs)
 * Method: GET
 * Auth: Requires admin session cookie (see admin-auth).
 * Query params:
 *   - log_type: Filter by log type (ingestion, bill_scraping, ai_enrichment, bill_submission, admin_action)
 *   - action: Filter by action name
 *   - status: Filter by status (success, failed, running, partial)
 *   - limit: Number of logs to return (default: 100, max: 500)
 *   - offset: Pagination offset (default: 0)
 *   - start_date: Filter logs from this date (ISO format)
 *   - end_date: Filter logs to this date (ISO format)
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

  if (event.httpMethod !== 'GET') {
    return json(event, { success: false, error: 'Method not allowed' }, 405);
  }

  if (!isAuthenticated(event)) {
    return json(event, { success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const params = event.queryStringParameters || {};
    const logType = params.log_type;
    const action = params.action;
    const status = params.status;
    const limit = Math.min(parseInt(params.limit || '100', 10), 500);
    const offset = parseInt(params.offset || '0', 10);
    const startDate = params.start_date;
    const endDate = params.end_date;

    const client = await pool.connect();
    try {
      // Build WHERE clause
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (logType) {
        conditions.push(`log_type = $${paramIndex}`);
        values.push(logType);
        paramIndex++;
      }

      if (action) {
        conditions.push(`action = $${paramIndex}`);
        values.push(action);
        paramIndex++;
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Check if table exists first
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'activity_logs'
        )
      `);
      
      if (!tableCheck.rows[0].exists) {
        console.error('activity_logs table does not exist');
        return json(event, {
          success: false,
          error: 'activity_logs table does not exist. Please run migrations.',
          logs: [],
          total: 0
        });
      }

      console.log('Querying activity_logs with filters:', { logType, action, status, whereClause, values });

      // Get total count (use separate values array to avoid affecting the main query)
      const countValues = [...values];
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM activity_logs ${whereClause}`,
        countValues
      );
      const total = parseInt(countResult.rows[0].total, 10);
      console.log(`Total logs found: ${total}`);

      // Get logs - add limit and offset to values array
      const limitParamIndex = paramIndex;
      const offsetParamIndex = paramIndex + 1;
      const queryValues = [...values, limit, offset];
      
      console.log(`Executing query with limit=${limit}, offset=${offset}, limitParam=$${limitParamIndex}, offsetParam=$${offsetParamIndex}`);
      console.log('Query values array length:', queryValues.length);
      console.log('Query values:', queryValues);
      
      const logsResult = await client.query(
        `SELECT id, log_type, action, status, metadata, error_message, created_at, duration_seconds
         FROM activity_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
        queryValues
      );

      console.log(`Query returned ${logsResult.rows.length} rows`);
      console.log('Sample row:', logsResult.rows[0]);

      const logs = logsResult.rows.map(row => {
        // Ensure all fields are properly extracted
        const log = {
          id: row.id,
          log_type: row.log_type,
          action: row.action,
          status: row.status,
          metadata: row.metadata,
          error_message: row.error_message,
          created_at: row.created_at ? row.created_at.toISOString() : null,
          duration_seconds: row.duration_seconds
        };
        console.log('Mapped log:', log);
        return log;
      });

      console.log(`Returning ${logs.length} logs`);

      return json(event, {
        success: true,
        logs: logs,
        total: total,
        limit: limit,
        offset: offset
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error fetching logs:', e);
    console.error('Stack:', e.stack);
    return json(event, { 
      success: false, 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    }, 500);
  }
};
