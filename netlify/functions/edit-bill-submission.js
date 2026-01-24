/**
 * Netlify Function: Edit Bill Submission
 * Endpoint: /.netlify/functions/edit-bill-submission
 * Method: POST
 *
 * Saves user edits to a reform, storing them in reform columns (original)
 * while preserving AI version in ai_enriched_fields (sparkle).
 * 
 * Request body:
 * {
 *   "submission_id": 123,
 *   "summary": "User-edited summary",
 *   "scope": ["User-edited scope"],
 *   "land_use": ["Residential"],
 *   "requirements": [],
 *   "notes": "Optional notes"
 * }
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { submission_id, summary, scope, land_use, requirements, notes } = body;

    if (!submission_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'submission_id is required' })
      };
    }

    // Validate that at least one field is provided
    if (!summary && !scope && !land_use && !requirements && !notes) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'At least one field must be provided' })
      };
    }

    const client = await pool.connect();

    try {
      // Get submission to find reform_id
      const submissionResult = await client.query(`
        SELECT reform_id, status FROM bill_submissions WHERE id = $1
      `, [submission_id]);

      if (submissionResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Submission not found' })
        };
      }

      const submission = submissionResult.rows[0];
      const reform_id = submission.reform_id;

      if (!reform_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'No reform associated with this submission. Please complete enrichment first.' 
          })
        };
      }

      // Build update query - only update fields that are provided
      const updateFields = [];
      const updateValues = [];

      if (summary !== undefined) {
        updateFields.push('summary = $' + (updateValues.length + 1));
        updateValues.push(summary || null);
      }

      if (scope !== undefined) {
        updateFields.push('scope = $' + (updateValues.length + 1));
        updateValues.push(Array.isArray(scope) ? scope : null);
      }

      if (land_use !== undefined) {
        updateFields.push('land_use = $' + (updateValues.length + 1));
        updateValues.push(Array.isArray(land_use) ? land_use : null);
      }

      if (requirements !== undefined) {
        updateFields.push('requirements = $' + (updateValues.length + 1));
        updateValues.push(Array.isArray(requirements) ? requirements : null);
      }

      if (notes !== undefined) {
        updateFields.push('notes = $' + (updateValues.length + 1));
        updateValues.push(notes || null);
      }

      if (updateFields.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'No valid fields to update' })
        };
      }

      // Add updated_at and reform_id
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(reform_id);

      // Update reform with user edits
      const updateSql = `
        UPDATE reforms
        SET ${updateFields.join(', ')}
        WHERE id = $${updateValues.length}
      `;

      await client.query(updateSql, updateValues);

      // Update submission status to completed
      await client.query(`
        UPDATE bill_submissions
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [submission_id]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          reform_id: reform_id,
          message: 'Edits saved successfully. User edits are stored in reform columns (original), AI version preserved in ai_enriched_fields (sparkle).'
        })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error editing bill submission:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    };
  }
};
