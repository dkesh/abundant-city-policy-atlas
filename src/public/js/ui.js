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
        if (resultsBanner) {
            resultsBanner.open();
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
