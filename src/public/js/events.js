// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    applyFiltersBtn.addEventListener('click', applyFilters);
    resetFiltersBtn.addEventListener('click', resetFilters);
    closeOverlayBtn.addEventListener('click', () => mapOverlay.classList.remove('active'));
    
    // Print map button
    if (printMapButton) {
        printMapButton.addEventListener('click', printMap);
    }
    
    // Share Search button (combined save + share functionality)
    const shareSearchBtn = document.getElementById('shareSearch');
    shareSearchBtn.addEventListener('click', shareSearch);
    
    // Download button in results banner
    const downloadBannerBtn = document.getElementById('downloadBannerBtn');
    if (downloadBannerBtn) {
        downloadBannerBtn.addEventListener('click', () => {
            if (typeof filteredReforms !== 'undefined' && filteredReforms.length > 0) {
                exportReformsToCSV(filteredReforms);
            } else {
                if (typeof showToast === 'function') {
                    showToast('No reforms available to export');
                }
            }
        });
    }
    
    // Share button in results banner
    const shareBannerBtn = document.getElementById('shareBannerBtn');
    if (shareBannerBtn) {
        shareBannerBtn.addEventListener('click', shareSearch);
    }
    
    // Dismiss error button
    if (dismissErrorBtn) {
        dismissErrorBtn.addEventListener('click', hideError);
    }
    
    // Back to report card list button
    const backToReportCardListBtn = document.getElementById('backToReportCardList');
    if (backToReportCardListBtn) {
        backToReportCardListBtn.addEventListener('click', () => {
            if (typeof navigateToReportCardList === 'function') {
                navigateToReportCardList();
            }
        });
    }
}
