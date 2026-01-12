// ============================================================================
// SHARE SEARCH FUNCTIONALITY
// ============================================================================

async function shareSearch() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'shareSearch called',data:{hasClipboard:!!navigator.clipboard,hasWriteText:!!(navigator.clipboard&&navigator.clipboard.writeText),isSecureContext:window.isSecureContext,hasFocus:document.hasFocus(),userAgent:navigator.userAgent.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    const filterConfig = getFilterConfig();
    
    // Prompt for optional title
    const title = prompt('Enter a name for this search (optional):');
    if (title === null) return; // User cancelled

    try {
        const response = await fetch('/.netlify/functions/save-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter_config: filterConfig,
                title: title || null
            })
        });

        const data = await response.json();

        if (data.success) {
            // Construct the full URL to copy - be very explicit
            const shortId = data.saved_search.short_id;
            const protocol = window.location.protocol;
            const host = window.location.host;
            const shortUrl = `${protocol}//${host}/saved/${shortId}`;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Before clipboard copy',data:{shortUrl:shortUrl,hasFocus:document.hasFocus(),isSecureContext:window.isSecureContext},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
            // #endregion
            
            // Update page title if a title was provided
            if (title && title.trim()) {
                document.title = `${title} - The Abundant City Policy Atlas`;
            }
            
            // Update URL to the saved search URL
            window.history.pushState({}, '', `/saved/${shortId}`);
            
            // Copy to clipboard - use the most reliable method
            let copySuccess = false;
            const textToCopy = shortUrl; // Store in variable to ensure we copy the right thing
            
            try {
                // Try modern clipboard API first
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Attempting clipboard API',data:{hasFocus:document.hasFocus()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
                    // #endregion
                    await navigator.clipboard.writeText(textToCopy);
                    copySuccess = true;
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Clipboard API succeeded',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
                    // #endregion
                } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Clipboard API not available',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    throw new Error('Clipboard API not available');
                }
            } catch (err) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Clipboard API failed',data:{errorName:err.name,errorMessage:err.message,errorStack:err.stack?err.stack.substring(0,200):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,F'})}).catch(()=>{});
                // #endregion
                // Fallback: use textarea method
                try {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Attempting textarea fallback',data:{hasFocus:document.hasFocus(),activeElement:document.activeElement?document.activeElement.tagName:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
                    // #endregion
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    textArea.className = 'clipboard-textarea';
                    textArea.setAttribute('readonly', '');
                    document.body.appendChild(textArea);
                    
                    // Select the text
                    if (navigator.userAgent.match(/ipad|iphone/i)) {
                        // iOS specific
                        const range = document.createRange();
                        range.selectNodeContents(textArea);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        textArea.setSelectionRange(0, 999999);
                    } else {
                        textArea.focus();
                        textArea.select();
                    }
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Before execCommand copy',data:{hasFocus:document.hasFocus(),textAreaFocused:textArea===document.activeElement,selectionLength:window.getSelection().toString().length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
                    // #endregion
                    
                    copySuccess = document.execCommand('copy');
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'execCommand result',data:{copySuccess:copySuccess},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
                    // #endregion
                    
                    document.body.removeChild(textArea);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Textarea fallback failed',data:{errorName:e.name,errorMessage:e.message,errorStack:e.stack?e.stack.substring(0,200):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D,F'})}).catch(()=>{});
                    // #endregion
                    console.error('Copy failed:', e);
                    copySuccess = false;
                }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Final copy result',data:{copySuccess:copySuccess,textToCopy:textToCopy},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E,F'})}).catch(()=>{});
            // #endregion
            
            if (copySuccess) {
                showToast(`Link copied to clipboard! /saved/${shortId}`);
            } else {
                showToast(`Failed to copy. Please copy manually: ${shortUrl}`);
            }
        } else {
            showError(data.error || 'Failed to save search');
        }
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9614b917-70d0-4ce3-b80a-b7bdea1b71fe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'share.js:shareSearch',message:'Save search error',data:{errorName:error.name,errorMessage:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        console.error('Error saving search:', error);
        showError('Failed to save search: ' + error.message);
    }
}

function showToast(message) {
    const snackbar = window.mdcComponents?.snackbar;
    if (snackbar) {
        snackbar.labelText = message;
        snackbar.timeoutMs = 4000;
        snackbar.open();
    } else {
        // Fallback if snackbar not initialized
        console.log('Toast:', message);
    }
}
