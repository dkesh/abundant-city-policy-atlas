// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function showLoading(show) {
    const resultsBanner = window.mdcComponents?.resultsBanner;
    const bannerTextEl = resultsInfo?.querySelector('.mdc-banner__text');
    const downloadBtn = document.getElementById('downloadBannerBtn');
    const shareBtn = document.getElementById('shareBannerBtn');
    
    if (show) {
        // Show loading state in the results banner
        if (bannerTextEl) {
            bannerTextEl.textContent = 'Loading reforms...';
        }
        // Hide action buttons during loading
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (shareBtn) shareBtn.style.display = 'none';
        
        // Show the banner if it's not already visible
        if (resultsInfo && resultsInfo.classList.contains('container-hidden')) {
            resultsInfo.classList.remove('container-hidden');
        }
        // Only open the banner if there's at least one visible focusable element
        // MDC Banner's FocusTrap requires at least one focusable child
        if (resultsBanner) {
            // Check if there's at least one visible focusable element in the banner
            const isDownloadBtnVisible = downloadBtn && window.getComputedStyle(downloadBtn).display !== 'none';
            const isShareBtnVisible = shareBtn && window.getComputedStyle(shareBtn).display !== 'none';
            if (isDownloadBtnVisible || isShareBtnVisible) {
                resultsBanner.open();
            }
            // If no buttons are visible, just show the banner with CSS (don't call open())
            // The banner will be visible but won't have focus trap issues
        }
    } else {
        // Restore action buttons visibility (they'll be shown/hidden based on results)
        if (downloadBtn) downloadBtn.style.display = '';
        if (shareBtn) shareBtn.style.display = '';
        // The banner text will be updated by applyFilters when results come in
    }
}

function showError(message) {
    const banner = window.mdcComponents?.errorBanner;
    if (banner && errorMessage) {
        const textEl = errorMessage.querySelector('.mdc-banner__text');
        if (textEl) {
            textEl.textContent = message;
        }
        banner.open();
    } else if (errorMessage) {
        // Fallback if banner not initialized
        errorMessage.textContent = message;
        errorMessage.classList.remove('container-hidden');
    }
}

function hideError() {
    const banner = window.mdcComponents?.errorBanner;
    if (banner) {
        banner.close();
    } else if (errorMessage) {
        // Fallback if banner not initialized
        errorMessage.classList.add('container-hidden');
    }
}
