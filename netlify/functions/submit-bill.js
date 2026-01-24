/**
 * Netlify Function: Submit Bill
 * Endpoint: /.netlify/functions/submit-bill
 * Method: POST
 *
 * Accepts a bill URL submission and initiates asynchronous processing.
 * Client should poll get-bill-submission to get status updates.
 * 
 * Request body:
 * {
 *   "url": "https://legislature.example.gov/bills/2024/AB1234",
 *   "confirm": false  // Optional: set to true to override low relevance assessment
 * }
 * 
 * Response types:
 * - duplicate_found: Bill already exists
 * - processing: Submitted and processing in background
 */

const { Pool } = require('pg');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Check if we're running in local development mode
 */
function isLocalDevelopment() {
  // Netlify Dev sets CONTEXT to 'dev'
  // Also check for common local development indicators
  return process.env.CONTEXT === 'dev' || 
         process.env.NETLIFY_DEV === 'true' ||
         !process.env.NETLIFY; // Not running on Netlify at all
}

/**
 * Find Python executable, preferring venv if available
 * 
 * Note: This is only used for local development. In production (Netlify),
 * submissions are processed via GitHub Actions workflows which run Python directly.
 */
function findPythonExecutable() {
  const cwd = process.cwd();
  
  // Common venv locations
  const venvPaths = [
    path.join(cwd, 'venv', 'bin', 'python'),
    path.join(cwd, 'venv', 'bin', 'python3'),
    path.join(cwd, '.venv', 'bin', 'python'),
    path.join(cwd, '.venv', 'bin', 'python3'),
    path.join(cwd, 'env', 'bin', 'python'),
    path.join(cwd, 'env', 'bin', 'python3'),
  ];
  
  // Check for venv Python
  for (const venvPath of venvPaths) {
    if (fs.existsSync(venvPath)) {
      console.log(`Using venv Python: ${venvPath}`);
      return venvPath;
    }
  }
  
  // Fall back to system python3
  // Note: In production, this function is never called - GitHub Actions runs Python directly
  console.log('No venv found, using system python3');
  return 'python3';
}

/**
 * Process bill submission locally using Python script
 */
async function processLocally(submissionId) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = findPythonExecutable();
    const pythonScript = path.join(process.cwd(), 'scripts', 'enrichment', 'process_single_submission.py');
    
    console.log(`Spawning: ${pythonExecutable} ${pythonScript} ${submissionId}`);
    
    const python = spawn(pythonExecutable, [pythonScript, submissionId.toString()], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      detached: true, // Detach so it runs in background
      stdio: ['ignore', 'pipe', 'pipe'] // Capture output for debugging
    });

    // Log output for debugging
    python.stdout.on('data', (data) => {
      console.log(`[Python stdout] ${data.toString().trim()}`);
    });
    
    python.stderr.on('data', (data) => {
      console.error(`[Python stderr] ${data.toString().trim()}`);
    });

    python.on('error', (error) => {
      console.error(`Failed to start Python process: ${error.message}`);
      reject(error);
    });

    python.unref(); // Allow Node to exit even if Python is still running
    
    // Give it a moment to start, then resolve
    setTimeout(() => {
      console.log(`Started local background processing for submission ${submissionId}`);
      resolve();
    }, 100);
  });
}

/**
 * Trigger background processing via GitHub Actions workflow (production)
 * or local Python script (development)
 */
async function triggerBackgroundProcessing(submissionId) {
  if (isLocalDevelopment()) {
    // Local development: spawn Python process in background
    console.log(`Local development mode: processing submission ${submissionId} locally`);
    try {
      await processLocally(submissionId);
      console.log(`Local processing started for submission ${submissionId}`);
    } catch (error) {
      console.error(`Failed to start local processing: ${error}`);
      // Don't fail - user can manually process later
    }
  } else {
    // Production: trigger GitHub Actions workflow
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      
      if (!githubToken) {
        console.warn('GITHUB_TOKEN not set, cannot trigger background processing');
        return;
      }
      
      const response = await fetch('https://api.github.com/repos/dkesh/abundant-city-policy-atlas/dispatches', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          event_type: 'process-bill-submission',
          client_payload: {
            submission_id: submissionId
          }
        })
      });
      
      if (response.ok) {
        console.log(`Successfully triggered background processing for submission ${submissionId}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to trigger background processing: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error(`Error triggering background processing for submission ${submissionId}:`, error);
      // Don't fail the main request if background trigger fails
      // The submission will be picked up by the scheduled job
    }
  }
}

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
    const { url, confirm } = body;

    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'url is required' })
      };
    }

    // Validate URL format
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL must use http or https protocol');
      }
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid URL format' })
      };
    }

    const client = await pool.connect();

    try {
      // First, check for existing submissions with this URL
      const existingSubmissionCheck = await client.query(`
        SELECT 
          bs.id,
          bs.status,
          bs.reform_id,
          bs.existing_reform_id,
          q.review_decision,
          pd.title,
          r.id as reform_id_from_policy_doc,
          r.summary as reform_summary
        FROM bill_submissions bs
        LEFT JOIN bill_review_queue q ON q.submission_id = bs.id
        LEFT JOIN policy_documents pd ON pd.id = bs.policy_document_id
        LEFT JOIN reforms r ON r.policy_document_id = pd.id OR r.id = bs.reform_id
        WHERE bs.submitted_url = $1
        ORDER BY bs.submitted_at DESC
        LIMIT 1
      `, [url]);

      if (existingSubmissionCheck.rows.length > 0) {
        const existing = existingSubmissionCheck.rows[0];
        
        // First, check if it's attached to a visible reform (approved and visible)
        const reformId = existing.reform_id || existing.reform_id_from_policy_doc || existing.existing_reform_id;
        if (reformId) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              status: 'duplicate_found',
              existing_reform_id: reformId,
              title: existing.title || existing.reform_summary,
              message: 'This bill already exists in the database'
            })
          };
        }
        
        // If it's been rejected, just thank them
        if (existing.review_decision === 'rejected') {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              status: 'already_submitted',
              message: 'Thank you for your submission!'
            })
          };
        }
        
        // If it's in review queue (pending), let them know
        if (existing.review_decision === 'pending') {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              status: 'already_submitted',
              in_review: true,
              message: 'Thank you for your submission! This bill is currently being reviewed.'
            })
          };
        }
        
        // If it's still processing or awaiting review, let them know
        if (existing.status === 'pending' || existing.status === 'processing' || 
            existing.status === 'awaiting_review' || existing.status === 'needs_confirmation') {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              status: 'already_submitted',
              in_review: true,
              message: 'Thank you for your submission! This bill is currently being reviewed.'
            })
          };
        }
        
        // Fallback for any other status
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            status: 'already_submitted',
            message: 'Thank you for your submission!'
          })
        };
      }

      // Check for existing bill in policy_documents (already processed and visible)
      const existingBillCheck = await client.query(`
        SELECT pd.id as policy_doc_id, r.id as reform_id, r.summary, pd.title
        FROM policy_documents pd
        LEFT JOIN reforms r ON r.policy_document_id = pd.id
        WHERE pd.document_url = $1
        LIMIT 1
      `, [url]);

      if (existingBillCheck.rows.length > 0 && existingBillCheck.rows[0].reform_id) {
        const existing = existingBillCheck.rows[0];
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            status: 'duplicate_found',
            existing_reform_id: existing.reform_id,
            title: existing.title || existing.summary,
            message: 'This bill already exists in the database'
          })
        };
      }

      // Create submission record
      const result = await client.query(`
        INSERT INTO bill_submissions (submitted_url, status, submission_metadata)
        VALUES ($1, $2, $3)
        RETURNING id, submitted_at, status
      `, [
        url,
        'pending',
        JSON.stringify({
          user_agent: event.headers['user-agent'],
          submitted_at: new Date().toISOString(),
          confirmed: !!confirm
        })
      ]);

      const submission = result.rows[0];
      const submissionId = submission.id;

      // Trigger background processing
      await triggerBackgroundProcessing(submissionId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          submission_id: submissionId,
          status: 'processing',
          message: 'Bill submitted successfully. Processing...'
        })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting bill:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    };
  }
};
