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
    
    // Initialize print countries checkboxes
    if (typeof initializePrintCountriesCheckboxes === 'function') {
        initializePrintCountriesCheckboxes();
    }

    // Map "Color by" dimension selector – re-render from cached data without refetch
    const mapColorBy = document.getElementById('mapColorBy');
    if (mapColorBy) {
        mapColorBy.addEventListener('change', () => {
            if (typeof lastMapReforms !== 'undefined' && lastMapReforms && lastMapReforms.length > 0 && typeof renderMap === 'function') {
                renderMap(lastMapReforms);
            }
        });
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
    
    // Back to explore places list button (or back to reforms list or map)
    const backToExplorePlacesBtn = document.getElementById('backToExplorePlaces');
    if (backToExplorePlacesBtn) {
        backToExplorePlacesBtn.addEventListener('click', () => {
            const previousView = backToExplorePlacesBtn.getAttribute('data-previous-view') || 'explorePlaces';
            
            if (previousView === 'list') {
                // Navigate back to reforms list view
                if (typeof switchView === 'function') {
                    switchView('list');
                }
            } else if (previousView === 'map') {
                // Navigate back to map view
                if (typeof switchView === 'function') {
                    switchView('map');
                }
            } else {
                // Navigate back to explore places list view
                if (typeof navigateToExplorePlacesList === 'function') {
                    navigateToExplorePlacesList();
                }
            }
        });
    }
}
