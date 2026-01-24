/**
 * Netlify Background Function: Process Bill Submission
 * This function processes a bill submission asynchronously in the background.
 * 
 * Netlify background functions have a 15-minute timeout.
 */

const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Run Python bill submission processor
 */
async function processBillSubmission(submissionId) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'enrichment', 'process_single_submission.py');
    const python = spawn('python3', [pythonScript, submissionId.toString()], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });

    python.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }
    });

    python.on('error', (err) => {
      reject(err);
    });
  });
}

exports.handler = async (event, context) => {
  console.log('Processing bill submission in background');
  
  try {
    const body = JSON.parse(event.body || '{}');
    const submissionId = body.submission_id;

    if (!submissionId) {
      console.error('No submission_id provided');
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'submission_id is required' })
      };
    }

    console.log(`Processing submission ${submissionId}`);
    
    try {
      const result = await processBillSubmission(submissionId);
      console.log(`Successfully processed submission ${submissionId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, submission_id: submissionId })
      };
    } catch (processingError) {
      console.error(`Processing error for submission ${submissionId}:`, processingError);
      
      // Update submission status to failed
      const client = await pool.connect();
      try {
        await client.query(`
          UPDATE bill_submissions
          SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, ['failed', processingError.message, submissionId]);
      } finally {
        client.release();
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: 'Failed to process bill submission',
          details: processingError.message
        })
      };
    }
  } catch (error) {
    console.error('Error in background function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    };
  }
};
