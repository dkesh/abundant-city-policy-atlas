/**
 * Netlify Function: Get Review Queue
 * Endpoint: /.netlify/functions/get-review-queue (or /api/get-review-queue)
 * Method: GET
 * Auth: Requires admin session cookie (see admin-auth).
 * Returns bill_review_queue rows with submission and policy_document details.
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
    // Get status from query parameter, default to 'pending'
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status || 'pending';
    
    // Map status values
    let reviewDecision;
    if (status === 'pending') {
      reviewDecision = 'pending';
    } else if (status === 'approved') {
      reviewDecision = 'approved';
    } else if (status === 'completed') {
      // For completed, we want both approved and rejected
      reviewDecision = null; // Will handle in WHERE clause
    } else {
      return json(event, { success: false, error: 'Invalid status parameter' }, 400);
    }

    const client = await pool.connect();
    try {
      let query;
      if (reviewDecision === null) {
        // Completed view: show both approved and rejected
        query = `
          SELECT
            q.id,
            q.submission_id,
            q.policy_document_id,
            q.reason,
            q.reviewed_at,
            q.reviewed_by,
            q.review_decision,
            q.created_at,
            bs.submitted_url,
            bs.submitted_at,
            bs.status AS submission_status,
            bs.assessment_result,
            bs.reform_id AS submission_reform_id,
            pd.reference_number,
            pd.state_code,
            pd.title AS policy_doc_title,
            pd.document_url
          FROM bill_review_queue q
          JOIN bill_submissions bs ON bs.id = q.submission_id
          LEFT JOIN policy_documents pd ON pd.id = q.policy_document_id
          WHERE q.review_decision IN ('approved', 'rejected')
          ORDER BY q.reviewed_at DESC, q.created_at DESC
        `;
      } else {
        query = `
          SELECT
            q.id,
            q.submission_id,
            q.policy_document_id,
            q.reason,
            q.reviewed_at,
            q.reviewed_by,
            q.review_decision,
            q.created_at,
            bs.submitted_url,
            bs.submitted_at,
            bs.status AS submission_status,
            bs.assessment_result,
            bs.reform_id AS submission_reform_id,
            pd.reference_number,
            pd.state_code,
            pd.title AS policy_doc_title,
            pd.document_url
          FROM bill_review_queue q
          JOIN bill_submissions bs ON bs.id = q.submission_id
          LEFT JOIN policy_documents pd ON pd.id = q.policy_document_id
          WHERE q.review_decision = $1
          ORDER BY q.created_at DESC
        `;
      }

      const result = reviewDecision === null 
        ? await client.query(query)
        : await client.query(query, [reviewDecision]);

      const rows = (result.rows || []).map((r) => {
        let assessment = null;
        if (r.assessment_result) {
          try {
            assessment = typeof r.assessment_result === 'string'
              ? JSON.parse(r.assessment_result)
              : r.assessment_result;
          } catch (_) {}
        }
        return {
          id: r.id,
          submission_id: r.submission_id,
          policy_document_id: r.policy_document_id,
          reason: r.reason,
          reviewed_at: r.reviewed_at,
          reviewed_by: r.reviewed_by,
          review_decision: r.review_decision,
          created_at: r.created_at,
          submitted_url: r.submitted_url,
          submitted_at: r.submitted_at,
          submission_status: r.submission_status,
          assessment: assessment,
          submission_reform_id: r.submission_reform_id,
          reference_number: r.reference_number,
          state_code: r.state_code,
          policy_doc_title: r.policy_doc_title,
          document_url: r.document_url
        };
      });

      return json(event, { success: true, items: rows });
    } finally {
      client.release();
    }
  } catch (e) {
    return json(event, { success: false, error: 'Internal server error' }, 500);
  }
};
