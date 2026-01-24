/**
 * Netlify Function: Get Bill Submission
 * Endpoint: /.netlify/functions/get-bill-submission
 * Method: GET
 *
 * Returns the status and details of a bill submission.
 * 
 * Query parameters:
 * ?id=123 - Submission ID
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

exports.handler = async (event, context) => {
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'id parameter is required' })
      };
    }

    const client = await pool.connect();

    try {
      // Get submission with related data
      const result = await client.query(`
        SELECT 
          bs.id,
          bs.submitted_url,
          bs.submitted_at,
          bs.status,
          bs.assessment_result,
          bs.error_message,
          bs.existing_reform_id,
          bs.policy_document_id,
          bs.reform_id,
          pd.title as policy_document_title,
          pd.reference_number,
          pd.state_code,
          pd.bill_text,
          r.id as reform_id_full,
          r.summary as reform_summary,
          r.status as reform_status,
          r.ai_enriched_fields
        FROM bill_submissions bs
        LEFT JOIN policy_documents pd ON bs.policy_document_id = pd.id
        LEFT JOIN reforms r ON bs.reform_id = r.id OR bs.existing_reform_id = r.id
        WHERE bs.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Submission not found' })
        };
      }

      const submission = result.rows[0];

      // Parse assessment result if present
      let assessment = null;
      if (submission.assessment_result) {
        try {
          assessment = typeof submission.assessment_result === 'string' 
            ? JSON.parse(submission.assessment_result)
            : submission.assessment_result;
        } catch (e) {
          console.warn('Failed to parse assessment_result:', e);
        }
      }

      // Parse AI enriched fields if present
      let ai_enriched_fields = null;
      if (submission.ai_enriched_fields) {
        try {
          ai_enriched_fields = typeof submission.ai_enriched_fields === 'string'
            ? JSON.parse(submission.ai_enriched_fields)
            : submission.ai_enriched_fields;
        } catch (e) {
          console.warn('Failed to parse ai_enriched_fields:', e);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          submission: {
            id: submission.id,
            submitted_url: submission.submitted_url,
            submitted_at: submission.submitted_at,
            status: submission.status,
            assessment_result: assessment,
            error_message: submission.error_message,
            existing_reform_id: submission.existing_reform_id,
            policy_document_id: submission.policy_document_id,
            reform_id: submission.reform_id,
            title: submission.policy_document_title,
            policy_doc_title: submission.policy_document_title,
            reference_number: submission.reference_number,
            state_code: submission.state_code,
            reform: submission.reform_id_full ? {
              id: submission.reform_id_full,
              summary: submission.reform_summary,
              status: submission.reform_status,
              ai_enriched_fields: ai_enriched_fields
            } : null
          }
        })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting bill submission:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    };
  }
};
