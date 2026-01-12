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
            const view = e.detail.index === 0 ? 'list' : 'map';
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
    
    // Try to load from saved search first, then URL params, then default
    const loadedSaved = await loadSavedSearch();
    if (!loadedSaved) {
        const loadedFromUrl = await loadFiltersFromUrl();
        if (!loadedFromUrl) {
            // Apply default filters
            applyFilters(true);
        } else {
            // Load from URL params
            applyFilters(true);
        }
    } else {
        // Loaded from saved search
        applyFilters(true);
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', async () => {
    const loadedFromUrl = await loadFiltersFromUrl();
    if (loadedFromUrl) {
        applyFilters(true);
    }
});
