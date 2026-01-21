// ============================================================================
// EXPLORE PLACES LIST VIEW
// ============================================================================

let explorePlacesListenersInstalled = false;

// Initialize explore places list view
async function loadExplorePlacesList() {
    const listView = document.getElementById('explorePlacesListView');
    const detailView = document.getElementById('policyProfileDetailView');
    
    // Show list view, hide detail view
    if (listView) listView.classList.remove('container-hidden');
    if (detailView) detailView.classList.add('container-hidden');
    
    // Load movers and shakers lists
    installExplorePlacesListeners();
    await loadMoversAndShakers();
    
    // Initialize search
    initializeExplorePlacesSearch();
}

function installExplorePlacesListeners() {
    if (explorePlacesListenersInstalled) return;
    explorePlacesListenersInstalled = true;
    // No immediate listeners - explore places will update when "Apply Filters" is clicked
    // (handled in reforms.js applyFilters function)
}

async function loadMoversAndShakers() {
    const moversSectionsEl = document.getElementById('moversSections');
    if (!moversSectionsEl) return;

    const selectedPlaceTypes = (typeof getSelectedPlaceTypes === 'function')
        ? getSelectedPlaceTypes()
        : Array.from(document.querySelectorAll('.placeTypeCheckbox:checked')).map(cb => cb.value);

    const sectionDefs = buildMoversSectionDefs(selectedPlaceTypes);

    if (sectionDefs.length === 0) {
        moversSectionsEl.innerHTML = `
            <div class="mdc-typography--body2" style="color:#95a5a6;">
                Select Cities, Counties, and/or States in the filters to see Movers and Shakers for those levels of government.
            </div>
        `;
        return;
    }

    moversSectionsEl.innerHTML = sectionDefs.map(s => `
        <div class="movers-section">
            <h4 class="mdc-typography--headline6">${escapeHtml(s.title)}</h4>
            <div id="${escapeHtml(s.containerId)}" class="top-ten-list"><p>Loading...</p></div>
        </div>
    `).join('');

    try {
        // Get current filter configuration
        const filterConfig = (typeof getFilterConfig === 'function')
            ? getFilterConfig()
            : {};

        const fetchGroup = async ({ placeType, sizeCategory, limit }) => {
            const params = new URLSearchParams();
            if (placeType) params.append('type', placeType);
            if (sizeCategory) params.append('size', sizeCategory);
            if (limit) params.append('limit', String(limit));
            
            // Add filter parameters
            if (filterConfig.reform_types && filterConfig.reform_types.length > 0) {
                filterConfig.reform_types.forEach(t => params.append('reform_type', t));
            }
            if (filterConfig.states && filterConfig.states.length > 0) {
                filterConfig.states.forEach(s => params.append('state', s));
            }
            if (filterConfig.statuses && filterConfig.statuses.length > 0) {
                filterConfig.statuses.forEach(s => params.append('status', s));
            }
            if (filterConfig.from_year) params.append('from_year', filterConfig.from_year);
            if (filterConfig.to_year) params.append('to_year', filterConfig.to_year);
            if (filterConfig.include_unknown_dates) params.append('include_unknown_dates', 'true');
            if (filterConfig.limitations) {
                if (filterConfig.limitations.scope !== 'all') params.append('scope_limitation', filterConfig.limitations.scope);
                if (filterConfig.limitations.land_use !== 'all') params.append('land_use_limitation', filterConfig.limitations.land_use);
                if (filterConfig.limitations.requirements !== 'all') params.append('requirements_limitation', filterConfig.limitations.requirements);
                if (filterConfig.limitations.intensity !== 'all') params.append('intensity_limitation', filterConfig.limitations.intensity);
            }
            
            const response = await fetch(`/.netlify/functions/get-explore-places-list?${params.toString()}`);
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to load movers');
            }
            return data.movers || [];
        };

        const results = await Promise.all(sectionDefs.map(async (s) => {
            const movers = await fetchGroup({ placeType: s.placeType, sizeCategory: s.sizeCategory, limit: 5 });
            return { ...s, movers };
        }));

        results.forEach(r => {
            const containerEl = document.getElementById(r.containerId);
            renderMoversList(containerEl, r.movers);
        });
    } catch (error) {
        console.error('Error loading movers and shakers:', error);
        moversSectionsEl.querySelectorAll('.top-ten-list').forEach(el => {
            el.innerHTML = '<p class="error">Failed to load movers and shakers. Please try again.</p>';
        });
    }
}

function buildMoversSectionDefs(placeTypes) {
    const defs = [];
    const addTriplet = (placeType, labelBase) => {
        defs.push({ placeType, sizeCategory: 'small', title: `Small ${labelBase}`, containerId: `movers-${placeType}-small` });
        defs.push({ placeType, sizeCategory: 'mid', title: `Mid-Sized ${labelBase}`, containerId: `movers-${placeType}-mid` });
        defs.push({ placeType, sizeCategory: 'large', title: `Large ${labelBase}`, containerId: `movers-${placeType}-large` });
    };

    if (placeTypes.includes('city')) addTriplet('city', 'Cities');
    if (placeTypes.includes('state')) addTriplet('state', 'States');
    if (placeTypes.includes('county')) addTriplet('county', 'Counties');

    return defs;
}

function renderMoversList(containerEl, movers) {
    if (!containerEl) return;

    if (!movers || movers.length === 0) {
        containerEl.innerHTML = '<p>No places found for this category.</p>';
        return;
    }

    containerEl.innerHTML = `
        <div class="explore-places-list movers-list">
            ${movers.map((place) => `
                <div class="mdc-card explore-places-item movers-item" data-place-id="${place.id}">
                    <div class="mdc-card__primary-action">
                        <div class="explore-places-item-content movers-item-content">
                            <div class="explore-places-info movers-info">
                                ${place.type === 'state'
                                    ? `<h3 class="mdc-typography--headline6">${escapeHtml(place.name)}</h3>`
                                    : `<h3 class="mdc-typography--headline6">${escapeHtml(place.name)}${place.stateName ? ` <span class="place-sep">•</span> <span class="place-state">${escapeHtml(place.stateName)}</span>` : ''}</h3>`
                                }
                                ${Array.isArray(place.domains) && place.domains.length > 0 ? `
                                    <div class="jurisdiction-badges movers-domains">
                                        ${place.domains.map(d => `
                                            <span class="mdc-chip">
                                                <span class="mdc-chip__text">${escapeHtml(d)}</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add click handlers
    containerEl.querySelectorAll('.explore-places-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeId = item.getAttribute('data-place-id');
            showPolicyProfileDetail(parseInt(placeId));
        });
    });
}

// Initialize explore places search
function initializeExplorePlacesSearch() {
    const searchInput = document.getElementById('explorePlacesSearchInput');
    const searchResults = document.getElementById('explorePlacesSearchResults');
    
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
            await performExplorePlacesSearch(query);
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
async function performExplorePlacesSearch(query) {
    const searchResults = document.getElementById('explorePlacesSearchResults');
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
                showPolicyProfileDetail(parseInt(placeId));
                searchResults.classList.add('container-hidden');
            });
        });
        
    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<p class="error">Search failed. Please try again.</p>';
    }
}

// Show policy profile detail (called from policy-profile-detail.js)
function showPolicyProfileDetail(placeId) {
    if (typeof loadPolicyProfileDetail === 'function') {
        loadPolicyProfileDetail(placeId);
    }
}

// Navigate to explore places list view
function navigateToExplorePlacesList() {
    const listView = document.getElementById('explorePlacesListView');
    const detailView = document.getElementById('policyProfileDetailView');
    
    if (listView) listView.classList.remove('container-hidden');
    if (detailView) detailView.classList.add('container-hidden');
    
    // Update URL
    window.history.pushState({}, '', '/explore-places');
}