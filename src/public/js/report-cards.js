// ============================================================================
// REPORT CARD LIST VIEW
// ============================================================================

let currentReportCardFilter = { type: 'city', size: 'mid' };

// Initialize report card list view
async function loadReportCardList() {
    const listView = document.getElementById('reportCardListView');
    const detailView = document.getElementById('reportCardDetailView');
    
    // Show list view, hide detail view
    if (listView) listView.classList.remove('container-hidden');
    if (detailView) detailView.classList.add('container-hidden');
    
    // Load the top ten list
    await loadTopTenList(currentReportCardFilter.type, currentReportCardFilter.size);
    
    // Initialize search
    initializeReportCardSearch();
    
    // Initialize filter buttons
    initializeReportCardFilters();
}

// Load top ten list based on filters
async function loadTopTenList(placeType, sizeCategory) {
    const topTenContainer = document.getElementById('topTenList');
    if (!topTenContainer) return;
    
    topTenContainer.innerHTML = '<p>Loading...</p>';
    
    try {
        const params = new URLSearchParams();
        if (placeType) params.append('type', placeType);
        if (sizeCategory) params.append('size', sizeCategory);
        params.append('limit', '10');
        
        const response = await fetch(`/.netlify/functions/get-report-cards-list?${params.toString()}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load report cards');
        }
        
        renderTopTenList(data.reportCards, placeType, sizeCategory);
        
    } catch (error) {
        console.error('Error loading top ten list:', error);
        topTenContainer.innerHTML = '<p class="error">Failed to load report cards. Please try again.</p>';
    }
}

// Render top ten list
function renderTopTenList(reportCards, placeType, sizeCategory) {
    const container = document.getElementById('topTenList');
    if (!container) return;
    
    if (reportCards.length === 0) {
        container.innerHTML = '<p>No report cards found for this category.</p>';
        return;
    }
    
    const sizeLabel = {
        'small': 'Small',
        'mid': 'Mid-Sized',
        'large': 'Large',
        'very_large': 'Very Large'
    }[sizeCategory] || '';
    
    const typeLabel = {
        'city': 'Cities',
        'county': 'Counties',
        'state': 'States'
    }[placeType] || '';
    
    const title = sizeCategory ? `${sizeLabel} ${typeLabel}` : typeLabel;
    
    container.innerHTML = `
        <h4 class="mdc-typography--headline6">Top 10 ${title}</h4>
        <div class="report-card-list">
            ${reportCards.map((card, index) => `
                <div class="mdc-card report-card-item" data-place-id="${card.id}">
                    <div class="mdc-card__primary-action">
                        <div class="report-card-item-content">
                            <div class="report-card-rank">${index + 1}</div>
                            <div class="report-card-info">
                                <h3 class="mdc-typography--headline6">${escapeHtml(card.name)}</h3>
                                <p class="mdc-typography--body2">${escapeHtml(card.stateName || '')}</p>
                            </div>
                            <div class="report-card-grade">
                                <div class="grade-letter grade-${card.overallGrade.letter.toLowerCase()}">${card.overallGrade.letter}</div>
                                <div class="grade-score">${card.overallGrade.score.toFixed(1)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Add click handlers
    container.querySelectorAll('.report-card-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeId = item.getAttribute('data-place-id');
            showReportCardDetail(parseInt(placeId));
        });
    });
}

// Initialize report card search
function initializeReportCardSearch() {
    const searchInput = document.getElementById('reportCardSearchInput');
    const searchResults = document.getElementById('reportCardSearchResults');
    
    if (!searchInput || !searchResults) return;
    
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            searchResults.classList.add('container-hidden');
            searchResults.innerHTML = '';
            return;
        }
        
        searchTimeout = setTimeout(async () => {
            await performReportCardSearch(query);
        }, 300);
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('container-hidden');
        }
    });
}

// Perform search
async function performReportCardSearch(query) {
    const searchResults = document.getElementById('reportCardSearchResults');
    if (!searchResults) return;
    
    searchResults.innerHTML = '<p>Searching...</p>';
    searchResults.classList.remove('container-hidden');
    
    try {
        const response = await fetch(`/.netlify/functions/search-jurisdictions?q=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }
        
        if (data.jurisdictions.length === 0) {
            searchResults.innerHTML = '<p class="mdc-typography--body2">No results found</p>';
            return;
        }
        
        searchResults.innerHTML = `
            <div class="search-results-list">
                ${data.jurisdictions.map(j => `
                    <div class="search-result-item" data-place-id="${j.id}">
                        <div class="search-result-name">${escapeHtml(j.displayName)}</div>
                        <div class="search-result-meta">
                            <span class="grade-badge grade-${j.overallGrade.letter.toLowerCase()}">${j.overallGrade.letter}</span>
                            ${j.population ? `<span class="population">${formatPopulationCompact(j.population)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add click handlers
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const placeId = item.getAttribute('data-place-id');
                showReportCardDetail(parseInt(placeId));
                searchResults.classList.add('container-hidden');
            });
        });
        
    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<p class="error">Search failed. Please try again.</p>';
    }
}

// Initialize filter buttons
function initializeReportCardFilters() {
    const filterButtons = document.querySelectorAll('.top-ten-filters .mdc-button');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Get filter values
            const type = button.getAttribute('data-filter');
            const size = button.getAttribute('data-size');
            
            currentReportCardFilter = { type, size };
            
            // Reload list
            loadTopTenList(type, size);
        });
    });
}

// Show report card detail (called from report-card-detail.js)
function showReportCardDetail(placeId) {
    if (typeof loadReportCardDetail === 'function') {
        loadReportCardDetail(placeId);
    }
}

// Navigate to report card list view
function navigateToReportCardList() {
    const listView = document.getElementById('reportCardListView');
    const detailView = document.getElementById('reportCardDetailView');
    
    if (listView) listView.classList.remove('container-hidden');
    if (detailView) detailView.classList.add('container-hidden');
    
    // Update URL
    window.history.pushState({}, '', '/report-cards');
}