// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    applyFiltersBtn.addEventListener('click', applyFilters);
    resetFiltersBtn.addEventListener('click', resetFilters);
    closeOverlayBtn.addEventListener('click', () => mapOverlay.classList.remove('active'));
    
    // Share Search button (combined save + share functionality)
    const shareSearchBtn = document.getElementById('shareSearch');
    shareSearchBtn.addEventListener('click', shareSearch);
    
    // Share button in results banner
    const shareBannerBtn = document.getElementById('shareBannerBtn');
    if (shareBannerBtn) {
        shareBannerBtn.addEventListener('click', shareSearch);
    }
    
    // Dismiss error button
    if (dismissErrorBtn) {
        dismissErrorBtn.addEventListener('click', hideError);
    }
}
