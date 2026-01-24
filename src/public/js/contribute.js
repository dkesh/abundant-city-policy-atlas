// ============================================================================
// CONTRIBUTE FUNCTIONALITY
// ============================================================================

let currentSubmissionId = null;
let currentAssessment = null;

// Initialize bill submission form when contribute view is loaded
document.addEventListener('DOMContentLoaded', function() {
    const submitBillForm = document.getElementById('submitBillForm');
    const submissionStatus = document.getElementById('submissionStatus');
    
    if (submitBillForm) {
        submitBillForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const urlInput = document.getElementById('billUrl');
            const url = urlInput.value.trim();
            
            if (!url) {
                showSubmissionStatus('Please enter a valid URL', 'error');
                return;
            }
            
            await submitBill(url, false);
        });
    }
});

async function submitBill(url, confirmed = false) {
    showSubmissionStatus('Submitting bill...', 'info');
    
    try {
        const response = await fetch('/.netlify/functions/submit-bill', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url, confirm: confirmed })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.status === 'duplicate_found' || data.status === 'already_submitted') {
                handleSubmissionResponse(data, url);
            } else if (data.status === 'processing') {
                // Start polling for updates
                showSubmissionStatus('Processing bill... This may take a minute.', 'info');
                pollSubmissionStatus(data.submission_id, url);
            } else {
                handleSubmissionResponse(data, url);
            }
        } else {
            showSubmissionStatus(`Error: ${data.error || 'Failed to submit bill'}`, 'error');
        }
    } catch (error) {
        console.error('Error submitting bill:', error);
        showSubmissionStatus('Error submitting bill. Please try again later.', 'error');
    }
}

/**
 * Poll for submission status updates
 */
async function pollSubmissionStatus(submissionId, originalUrl) {
    const maxAttempts = 60; // Poll for up to 2 minutes
    let attempts = 0;
    
    const poll = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`/.netlify/functions/get-bill-submission?id=${submissionId}`);
            const data = await response.json();
            
            if (data.success && data.submission) {
                const status = data.submission.status;
                const submission = data.submission;
                
                // Parse assessment if available
                let assessment = null;
                if (submission.assessment_result) {
                    try {
                        assessment = typeof submission.assessment_result === 'string'
                            ? JSON.parse(submission.assessment_result)
                            : submission.assessment_result;
                    } catch (e) {
                        console.error('Failed to parse assessment:', e);
                    }
                }
                
                if (status === 'completed') {
                    clearInterval(poll);
                    handleSubmissionResponse({
                        success: true,
                        status: 'processing_complete',
                        submission_id: submissionId,
                        reform_id: submission.reform_id,
                        title: submission.title || submission.policy_doc_title,
                        reference_number: submission.reference_number,
                        assessment: assessment
                    }, originalUrl);
                } else if (status === 'needs_confirmation') {
                    clearInterval(poll);
                    handleSubmissionResponse({
                        success: true,
                        status: 'needs_confirmation',
                        submission_id: submissionId,
                        title: submission.title || submission.policy_doc_title,
                        reference_number: submission.reference_number,
                        assessment: assessment
                    }, originalUrl);
                } else if (status === 'failed') {
                    clearInterval(poll);
                    showSubmissionStatus(
                        `Processing failed: ${submission.error_message || 'Unknown error'}`,
                        'error'
                    );
                } else if (status === 'duplicate_found') {
                    clearInterval(poll);
                    handleSubmissionResponse({
                        success: true,
                        status: 'duplicate_found',
                        existing_reform_id: submission.existing_reform_id,
                        title: submission.title || submission.policy_doc_title
                    }, originalUrl);
                } else if (status === 'awaiting_review') {
                    clearInterval(poll);
                    showSubmissionStatus(
                        `<strong>Submission received!</strong><br><br>` +
                        `Your bill has been submitted and is being reviewed. ` +
                        `Your submission will be processed and added to the atlas if approved.`,
                        'info'
                    );
                } else {
                    // Still processing - update status message
                    const statusMessages = {
                        'pending': 'Queued for processing...',
                        'checking_duplicates': 'Checking for duplicates...',
                        'creating_policy_doc': 'Creating policy document...',
                        'scraping': 'Scraping bill text...',
                        'assessing': 'Assessing relevance...',
                        'enriching': 'Enriching with AI...',
                        'processing': 'Processing...'
                    };
                    const message = statusMessages[status] || `Processing... (${status})`;
                    showSubmissionStatus(message, 'info');
                }
            }
        } catch (error) {
            console.error('Error polling submission status:', error);
        }
        
        if (attempts >= maxAttempts) {
            clearInterval(poll);
            showSubmissionStatus(
                'Processing is taking longer than expected. Your submission has been queued and will be processed soon.',
                'info'
            );
        }
    }, 2000); // Poll every 2 seconds
}

function handleSubmissionResponse(data, originalUrl) {
    const urlInput = document.getElementById('billUrl');
    
    if (data.status === 'duplicate_found') {
        // Case A: Bill already exists and is visible
        const title = data.title || 'this reform';
        showSubmissionStatus(
            `This bill already exists in our database as "${title}". ` +
            `<a href="/place?reform=${data.existing_reform_id}" target="_blank">View existing reform</a>`,
            'info'
        );
        urlInput.value = '';
        
    } else if (data.status === 'already_submitted') {
        // Case: Already submitted (in review, rejected, or processing)
        // If in_review is explicitly true, show review message
        // Otherwise (rejected or unknown), just thank them
        const message = data.in_review 
            ? (data.message || 'Thank you for your submission! This bill is currently being reviewed.')
            : (data.message || 'Thank you for your submission!');
        showSubmissionStatus(message, 'info');
        urlInput.value = '';
        
    } else if (data.status === 'needs_confirmation') {
        // Case B: Low relevance - ask for confirmation
        currentSubmissionId = data.submission_id;
        currentAssessment = data.assessment;
        
        const reasoning = data.assessment?.reasoning || 'This bill may not be directly related to urbanist reforms.';
        const probability = data.assessment?.probability ? 
            ` (Relevance score: ${(data.assessment.probability * 100).toFixed(0)}%)` : '';
        
        showSubmissionStatus(
            `<strong>Confirmation needed:</strong> ${reasoning}${probability}<br><br>` +
            `Are you sure you want to submit this bill?<br><br>` +
            `<button id="confirmSubmit" class="btn-primary" style="margin-right: 10px; padding: 0.5rem 1rem; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">Yes, submit it</button>` +
            `<button id="cancelSubmit" class="btn-secondary" style="padding: 0.5rem 1rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>`,
            'warning'
        );
        
        // Add event listeners for confirmation buttons
        setTimeout(() => {
            document.getElementById('confirmSubmit')?.addEventListener('click', () => {
                submitBill(originalUrl, true);
            });
            document.getElementById('cancelSubmit')?.addEventListener('click', () => {
                showSubmissionStatus('Submission cancelled.', 'info');
                urlInput.value = '';
            });
        }, 100);
        
    } else if (data.status === 'processing_complete') {
        // Case C: Successfully processed - show summary and ask for corrections
        currentSubmissionId = data.submission_id;
        currentAssessment = data.assessment;
        
        const title = data.title || data.reference_number || 'Untitled Bill';
        const reformTypes = data.assessment?.reform_type_suggestions?.join(', ') || 'Not specified';
        const summary = data.assessment?.summary || 'Summary not available';
        
        showSubmissionStatus(
            `<strong>Bill processed successfully!</strong><br><br>` +
            `<strong>Title:</strong> ${title}<br>` +
            `<strong>Reference:</strong> ${data.reference_number || 'N/A'}<br>` +
            `<strong>Reform Types:</strong> ${reformTypes}<br><br>` +
            `<strong>AI-Generated Summary:</strong><br>` +
            `<div style="padding: 0.75rem; background: #f5f5f5; border-radius: 4px; margin: 0.5rem 0;">${summary}</div><br>` +
            `<a href="/place?reform=${data.reform_id}" target="_blank" class="btn-primary" style="display: inline-block; padding: 0.5rem 1rem; background: #1976d2; color: white; text-decoration: none; border-radius: 4px;">View Reform</a>`,
            'success'
        );
        urlInput.value = '';
        
    } else {
        console.error('Unexpected submission status:', data.status, data);
        showSubmissionStatus(`Unexpected status: ${data.status}`, 'error');
    }
}

function showSubmissionStatus(message, type) {
    const submissionStatus = document.getElementById('submissionStatus');
    if (!submissionStatus) return;
    
    submissionStatus.style.display = 'block';
    submissionStatus.className = `submission-status ${type}`;
    submissionStatus.innerHTML = message;
    
    // Style based on type
    if (type === 'error') {
        submissionStatus.style.color = '#d32f2f';
        submissionStatus.style.backgroundColor = '#ffebee';
        submissionStatus.style.padding = '1rem';
        submissionStatus.style.borderRadius = '4px';
        submissionStatus.style.border = '1px solid #ffcdd2';
    } else if (type === 'success') {
        submissionStatus.style.color = '#2e7d32';
        submissionStatus.style.backgroundColor = '#e8f5e9';
        submissionStatus.style.padding = '1rem';
        submissionStatus.style.borderRadius = '4px';
        submissionStatus.style.border = '1px solid #c8e6c9';
    } else if (type === 'warning') {
        submissionStatus.style.color = '#f57c00';
        submissionStatus.style.backgroundColor = '#fff3e0';
        submissionStatus.style.padding = '1rem';
        submissionStatus.style.borderRadius = '4px';
        submissionStatus.style.border = '1px solid #ffcc80';
    } else {
        submissionStatus.style.color = '#1976d2';
        submissionStatus.style.backgroundColor = '#e3f2fd';
        submissionStatus.style.padding = '1rem';
        submissionStatus.style.borderRadius = '4px';
        submissionStatus.style.border = '1px solid #90caf9';
    }
}
