# Bill Submission Processing

## Overview

When users submit bills via the `/contribute` page, the submissions are stored in the `bill_submissions` table with status `'pending'`. They need to be processed before appearing in the review queue.

## Local Development

When running `netlify dev` locally, bill submissions are automatically processed in the background using a Python script. The `submit-bill` function detects local development mode and spawns a background process.

**Note**: Processing happens asynchronously, so you may need to wait a few seconds for the submission to appear in the review queue. You can check the status by polling the `get-bill-submission` endpoint or by querying the database directly.

If automatic processing doesn't work, you can manually process submissions using the commands below.

## Manual Processing

To process pending bill submissions manually:

```bash
# Process all pending submissions
python scripts/enrichment/run_bill_submissions.py
# Or using npm:
npm run process:submissions

# Process a specific submission by ID
python scripts/enrichment/process_single_submission.py <submission_id>
# Or using npm:
npm run process:submission <submission_id>

# Process up to 10 submissions
python scripts/enrichment/run_bill_submissions.py --limit 10
```

## Automated Processing

Bill submissions are automatically processed by:

1. **Daily cron job**: The `bill-scraping` GitHub Action runs daily at 5:00 AM UTC
2. **Manual trigger**: You can manually run the workflow from the GitHub Actions tab

## Workflow

When a submission is processed:

1. **Duplicate check**: System checks if the bill URL already exists
2. **Scraping**: Bill text is scraped from the URL
3. **Assessment**: AI assesses whether the bill is relevant to urbanist reforms
4. **Enrichment**: If relevant (probability > 0.5), the bill is enriched with AI-generated metadata
5. **Review queue**: The submission is added to `bill_review_queue` for admin review

## Submission Statuses

- `pending`: Submitted but not yet processed
- `checking_duplicates`: Checking for existing bills
- `creating_policy_doc`: Creating policy document record
- `scraping`: Scraping bill text
- `assessing`: Assessing relevance with AI
- `enriching`: Enriching with AI metadata
- `needs_confirmation`: Low relevance score, needs user confirmation
- `completed`: Successfully processed and added to review queue
- `duplicate_found`: Bill already exists in database
- `failed`: Processing failed (see error_message field)

## Current Submissions

To see all pending submissions:

```sql
SELECT id, submitted_url, submitted_at, status 
FROM bill_submissions 
WHERE status = 'pending' 
ORDER BY submitted_at ASC;
```

To see what's in the review queue:

```sql
SELECT q.id, q.submission_id, q.reason, bs.submitted_url, bs.status
FROM bill_review_queue q
JOIN bill_submissions bs ON bs.id = q.submission_id
WHERE q.review_decision = 'pending'
ORDER BY q.created_at DESC;
```
