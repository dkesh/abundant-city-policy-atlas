// ============================================================================
// INITIALIZATION
// ============================================================================

async function loadFiltersFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.toString()) {
        const config = urlParamsToFilterConfig(urlParams);
        applyFilterConfig(config);
        return true;
    }
    return false;
}

async function loadPlaceProfileFromUrl() {
    const path = window.location.pathname;
    if (path !== '/place') return false;

    const placeId = new URLSearchParams(window.location.search).get('place_id');
    if (!placeId) return false;

    const id = parseInt(placeId, 10);
    if (isNaN(id)) return false;

    if (typeof switchView === 'function') {
        switchView('explorePlaces');
    }
    if (typeof loadPolicyProfileDetail === 'function') {
        await loadPolicyProfileDetail(id);
        return true;
    }
    return false;
}

async function loadSavedSearch() {
    const path = window.location.pathname;
    const savedMatch = path.match(/^\/saved\/([a-zA-Z0-9]+)$/);
    if (savedMatch) {
        const shortId = savedMatch[1];
        try {
            const response = await fetch(`/.netlify/functions/get-saved-search?short_id=${shortId}`);
            const data = await response.json();

            if (data.success) {
                const config = data.saved_search.filter_config;
                applyFilterConfig(config);
                
                // Update page title if saved search has a title
                if (data.saved_search.title) {
                    document.title = `${data.saved_search.title} - The Abundant City Policy Atlas`;
                }
                
                // Show notification
                showToast(`Loaded saved search: ${data.saved_search.title || 'Untitled'}`);
                return true;
            } else {
                showError(data.error || 'Saved search not found');
                // Redirect to home
                window.history.replaceState({}, '', '/');
            }
        } catch (error) {
            console.error('Error loading saved search:', error);
            showError('Failed to load saved search');
            window.history.replaceState({}, '', '/');
        }
        return false;
    }
    return false;
}

function initializeMDCComponents() {
    // Initialize MDC components
    const mdcComponents = {
        buttons: [],
        checkboxes: [],
        textFields: [],
        slider: null, // Keep for backward compatibility if needed
        populationSlider: null, // noUiSlider instance
        tabBar: null,
        iconButtons: [],
        circularProgress: null,
        snackbar: null,
        errorBanner: null,
        resultsBanner: null
    };

    // Store MDC components globally early so initializePopulationSlider can access it
    window.mdcComponents = mdcComponents;

    // Initialize all buttons
    document.querySelectorAll('.mdc-button').forEach(button => {
        mdcComponents.buttons.push(new mdc.ripple.MDCRipple(button));
    });

    // Initialize all icon buttons
    document.querySelectorAll('.mdc-icon-button').forEach(iconButton => {
        const ripple = new mdc.ripple.MDCRipple(iconButton);
        ripple.unbounded = true;
        mdcComponents.iconButtons.push(ripple);
    });

    // Initialize all checkboxes
    document.querySelectorAll('.mdc-checkbox').forEach(checkbox => {
        mdcComponents.checkboxes.push(new mdc.checkbox.MDCCheckbox(checkbox));
    });

    // Initialize all radio buttons
    document.querySelectorAll('.mdc-radio').forEach(radio => {
        new mdc.radio.MDCRadio(radio);
    });

    // Initialize all form fields
    document.querySelectorAll('.mdc-form-field').forEach(formField => {
        new mdc.formField.MDCFormField(formField);
    });

    // Initialize text fields
    document.querySelectorAll('.mdc-text-field').forEach(textField => {
        mdcComponents.textFields.push(new mdc.textField.MDCTextField(textField));
    });

    // Initialize population slider
    initializePopulationSlider();

    // Initialize tab bar
    const tabBarEl = document.querySelector('.mdc-tab-bar');
    if (tabBarEl) {
        mdcComponents.tabBar = new mdc.tabBar.MDCTabBar(tabBarEl);
        mdcComponents.tabBar.listen('MDCTabBar:activated', (e) => {
            const views = ['list', 'map', 'explorePlaces', 'about'];
            const view = views[e.detail.index];
            switchView(view);
        });
    }

    // Initialize circular progress
    const progressEl = document.querySelector('.mdc-circular-progress');
    if (progressEl) {
        mdcComponents.circularProgress = new mdc.circularProgress.MDCCircularProgress(progressEl);
    }

    // Initialize snackbar
    const snackbarEl = document.getElementById('snackbar');
    if (snackbarEl) {
        mdcComponents.snackbar = new mdc.snackbar.MDCSnackbar(snackbarEl);
    }

    // Initialize error banner
    if (errorMessage) {
        mdcComponents.errorBanner = new mdc.banner.MDCBanner(errorMessage);
        // Initialize dismiss button ripple if it exists
        if (dismissErrorBtn) {
            mdcComponents.buttons.push(new mdc.ripple.MDCRipple(dismissErrorBtn));
        }
    }

    // Initialize results banner
    const resultsBannerEl = document.getElementById('resultsInfo');
    if (resultsBannerEl) {
        mdcComponents.resultsBanner = new mdc.banner.MDCBanner(resultsBannerEl);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeMDCComponents();
    setupEventListeners();
    
    await initializeReformTypeFilter();
    initializeLocationFilter();
    updatePopulationLabels();
    
    const path = window.location.pathname;
    
    // Handle direct URL access to view routes
    if (path === '/list' && typeof switchView === 'function') {
        switchView('list', true);
        const loadedFromUrl = await loadFiltersFromUrl();
        applyFilters(true);
        return;
    } else if (path === '/map' && typeof switchView === 'function') {
        switchView('map', true);
        const loadedFromUrl = await loadFiltersFromUrl();
        applyFilters(true);
        return;
    } else if (path === '/about' && typeof switchView === 'function') {
        switchView('about', true);
        return;
    } else if (path === '/explore-places' && typeof switchView === 'function') {
        switchView('explorePlaces', true);
        return;
    }
    
    // Try to load from saved search first, then place profile, then URL params, then default
    const loadedSaved = await loadSavedSearch();
    if (!loadedSaved) {
        const loadedPlaceProfile = await loadPlaceProfileFromUrl();
        if (!loadedPlaceProfile) {
            const loadedFromUrl = await loadFiltersFromUrl();
            if (!loadedFromUrl) {
                // Apply default filters
                applyFilters(true);
            } else {
                // Load from URL params
                applyFilters(true);
            }
        }
    } else {
        // Loaded from saved search
        applyFilters(true);
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', async () => {
    const path = window.location.pathname;
    
    // Handle place profile URLs
    const loadedPlaceProfile = await loadPlaceProfileFromUrl();
    if (loadedPlaceProfile) return;

    // Handle saved search URLs
    const loadedSaved = await loadSavedSearch();
    if (loadedSaved) {
        applyFilters(true);
        return;
    }

    // Handle view routes (list, map, about, explore-places)
    if (path === '/list' && typeof switchView === 'function') {
        switchView('list', true);
        return;
    } else if (path === '/map' && typeof switchView === 'function') {
        switchView('map', true);
        return;
    } else if (path === '/about' && typeof switchView === 'function') {
        switchView('about', true);
        return;
    } else if (path === '/explore-places' && typeof switchView === 'function') {
        switchView('explorePlaces', true);
        return;
    }

    // Handle filter URLs (with query params)
    const loadedFromUrl = await loadFiltersFromUrl();
    if (loadedFromUrl) {
        applyFilters(true);
        return;
    }

    // Default: show list view if at root
    if (path === '/' && typeof switchView === 'function') {
        switchView('list', true);
    }
});

// ============================================================================
// SOURCES LOADING FOR ABOUT TAB
// ============================================================================

async function loadSources() {
    const loadingEl = document.getElementById('sourcesLoading');
    const errorEl = document.getElementById('sourcesError');
    const gridEl = document.getElementById('sourcesGrid');

    if (!loadingEl || !errorEl || !gridEl) return;

    try {
        // Try both API paths
        let response = await fetch('/.netlify/functions/get-sources');
        if (!response.ok) {
            // Fallback to /api/ path
            response = await fetch('/api/get-sources');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load sources');
        }

        if (!data.sources || data.sources.length === 0) {
            throw new Error('No sources found');
        }

        loadingEl.style.display = 'none';
        errorEl.style.display = 'none';
        errorEl.classList.add('container-hidden');
        gridEl.classList.remove('container-hidden');
        gridEl.style.display = 'grid';

        // Clear existing cards
        gridEl.innerHTML = '';

        // Render source cards
        data.sources.forEach(source => {
            const card = createSourceCard(source);
            gridEl.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading sources:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.classList.remove('container-hidden');
        errorEl.textContent = `Error: ${error.message}`;
    }
}

function createSourceCard(source) {
    const card = document.createElement('div');
    card.className = 'mdc-card source-card';

    const logoHtml = source.logoFilename 
        ? `<div class="source-logo-container">
             <img src="${escapeHtml(source.logoFilename)}" alt="${escapeHtml(source.name)} Logo" />
           </div>`
        : '';

    const websiteLink = source.websiteUrl
        ? `<div class="mdc-card__actions">
             <div class="mdc-card__action-buttons">
               <a href="${escapeHtml(source.websiteUrl)}" target="_blank" rel="noopener" class="mdc-button mdc-button--outlined">
                 <span class="mdc-button__ripple"></span>
                 <span class="mdc-button__label">Visit Website</span>
               </a>
             </div>
           </div>`
        : '';

    card.innerHTML = `
        <div class="mdc-card__primary">
            ${logoHtml}
            <h3 class="mdc-typography--headline6">${escapeHtml(source.name)}</h3>
            ${source.description ? `<p class="mdc-typography--body2">${escapeHtml(source.description)}</p>` : ''}
        </div>
        ${websiteLink}
    `;

    // Initialize button ripple if website link exists
    if (source.websiteUrl) {
        const button = card.querySelector('.mdc-button');
        if (button) {
            new mdc.ripple.MDCRipple(button);
        }
    }

    return card;
}

// ============================================================================
// CATEGORIES LOADING FOR ABOUT TAB
// ============================================================================

async function loadReformTypes() {
    const loadingEl = document.getElementById('reformTypesLoading');
    const errorEl = document.getElementById('reformTypesError');
    const gridEl = document.getElementById('reformTypesGrid');

    if (!loadingEl || !errorEl || !gridEl) return;

    try {
        // Try both API paths
        let response = await fetch('/.netlify/functions/get-categories');
        if (!response.ok) {
            // Fallback to /api/ path
            response = await fetch('/api/get-categories');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load categories');
        }

        if (!data.categories || data.categories.length === 0) {
            throw new Error('No categories found');
        }

        loadingEl.style.display = 'none';
        errorEl.style.display = 'none';
        errorEl.classList.add('container-hidden');
        gridEl.classList.remove('container-hidden');
        gridEl.style.display = 'grid';

        // Clear existing cards
        gridEl.innerHTML = '';

        // Render category cards
        data.categories.forEach(category => {
            const card = createCategoryCard(category);
            gridEl.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading categories:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.classList.remove('container-hidden');
        errorEl.textContent = `Error: ${error.message}`;
    }
}

function createCategoryCard(category) {
    const card = document.createElement('div');
    card.className = 'mdc-card source-card';

    const iconHtml = category.icon
        ? `<div class="category-icon" style="margin-bottom: 16px;">
             <i class="material-icons" style="font-size: 48px; color: #666;">${escapeHtml(category.icon)}</i>
           </div>`
        : '';

    const reformTypesList = category.reformTypes && category.reformTypes.length > 0
        ? `<div class="reform-types-list" style="margin-top: 16px;">
             <div class="mdc-typography--caption" style="font-weight: 500; margin-bottom: 8px; color: #666;">Includes:</div>
             <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
               ${category.reformTypes.map(reformType => 
                 `<li style="margin-bottom: 8px;">
                    <strong>${escapeHtml(reformType.name)}</strong>
                    ${reformType.description ? `<div style="margin-top: 4px; font-size: 0.875rem; color: #666;">${escapeHtml(reformType.description)}</div>` : ''}
                  </li>`
               ).join('')}
             </ul>
           </div>`
        : '';

    card.innerHTML = `
        <div class="mdc-card__primary">
            ${iconHtml}
            <h3 class="mdc-typography--headline6">${escapeHtml(category.name)}</h3>
            ${category.description ? `<p class="mdc-typography--body2" style="margin-top: 8px;">${escapeHtml(category.description)}</p>` : ''}
            ${reformTypesList}
        </div>
    `;

    return card;
}