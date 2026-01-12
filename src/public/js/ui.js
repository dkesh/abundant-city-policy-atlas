// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

function showLoading(show) {
    const progress = window.mdcComponents?.circularProgress;
    if (show) {
        loadingSpinner.classList.remove('container-hidden');
        if (progress) {
            progress.open();
        }
    } else {
        loadingSpinner.classList.add('container-hidden');
        if (progress) {
            progress.close();
        }
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
