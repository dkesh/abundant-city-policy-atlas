// ============================================================================
// URL/FILTER CONVERSION UTILITIES
// ============================================================================

function getFilterConfig() {
    const reformTypes = getSelectedReformTypes();
    const placeTypes = getSelectedPlaceTypes();
    const statuses = getSelectedStatuses();
    const sliderValues = getSliderValues();
    const minPopulation = sliderValues.min;
    const maxPopulation = sliderValues.max;
    const states = getSelectedLocations();
    const fromYearVal = fromYear.value ? parseInt(fromYear.value) : null;
    const toYearVal = toYear.value ? parseInt(toYear.value) : null;
    const includeUnknown = includeUnknownDates.checked;

    return {
        reform_types: reformTypes,
        place_types: placeTypes,
        statuses: statuses,
        min_population: minPopulation > 0 ? minPopulation : null,
        max_population: maxPopulation < MAX_POPULATION ? maxPopulation : null,
        states: states,
        from_year: fromYearVal,
        to_year: toYearVal,
        include_unknown_dates: includeUnknown
    };
}

function filterConfigToUrlParams(config) {
    const params = new URLSearchParams();
    (config.reform_types || []).forEach(t => params.append('reform_type', t));
    (config.place_types || []).forEach(t => params.append('place_type', t));
    (config.statuses || []).forEach(s => params.append('status', s));
    if (config.min_population) params.append('min_population', config.min_population);
    if (config.max_population && config.max_population < MAX_POPULATION) params.append('max_population', config.max_population);
    (config.states || []).forEach(s => params.append('state', s));
    if (config.from_year) params.append('from_year', config.from_year);
    if (config.to_year) params.append('to_year', config.to_year);
    if (config.include_unknown_dates) params.append('include_unknown_dates', 'true');
    return params;
}

function urlParamsToFilterConfig(urlSearchParams) {
    // Handle both URLSearchParams object and plain object
    const getMultiValue = (key) => {
        if (urlSearchParams instanceof URLSearchParams) {
            return urlSearchParams.getAll(key);
        } else {
            const val = urlSearchParams[key];
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            return val.split(',').map(v => v.trim()).filter(Boolean);
        }
    };

    const getValue = (key) => {
        if (urlSearchParams instanceof URLSearchParams) {
            return urlSearchParams.get(key);
        } else {
            return urlSearchParams[key];
        }
    };

    return {
        reform_types: getMultiValue('reform_type'),
        place_types: getMultiValue('place_type'),
        statuses: getMultiValue('status'),
        min_population: getValue('min_population') ? parseInt(getValue('min_population')) : null,
        max_population: getValue('max_population') ? parseInt(getValue('max_population')) : null,
        states: getMultiValue('state'),
        from_year: getValue('from_year') ? parseInt(getValue('from_year')) : null,
        to_year: getValue('to_year') ? parseInt(getValue('to_year')) : null,
        include_unknown_dates: getValue('include_unknown_dates') === 'true'
    };
}

function applyFilterConfig(config) {
    // Apply reform types
    document.querySelectorAll('.reformTypeCheckbox').forEach(cb => {
        cb.checked = config.reform_types && config.reform_types.includes(cb.value);
    });
    // Update category checkboxes based on children
    document.querySelectorAll('.category-cb').forEach(cb => {
        const category = cb.dataset.category;
        const children = document.querySelectorAll(`.reformTypeCheckbox[data-category="${category}"]`);
        const allChecked = Array.from(children).every(child => child.checked);
        const someChecked = Array.from(children).some(child => child.checked);
        cb.checked = allChecked;
        cb.indeterminate = someChecked && !allChecked;
        // Sync MDC checkbox state
        const categoryMdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(cb.closest('.mdc-checkbox'));
        if (categoryMdcCheckbox) {
            categoryMdcCheckbox.checked = allChecked;
            categoryMdcCheckbox.indeterminate = someChecked && !allChecked;
        }
    });

    // Apply place types
    placeTypeCheckboxes.forEach(cb => {
        cb.checked = config.place_types && config.place_types.includes(cb.value);
    });

    // Apply statuses
    statusCheckboxes.forEach(cb => {
        cb.checked = config.statuses && config.statuses.includes(cb.value);
    });

    // Apply locations
    document.querySelectorAll('#locationCheckboxes input[type="checkbox"]').forEach(cb => {
        if (cb.dataset.state) {
            cb.checked = config.states && config.states.includes(cb.dataset.state);
            // Sync MDC checkbox state
            const mdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(cb.closest('.mdc-checkbox'));
            if (mdcCheckbox) {
                mdcCheckbox.checked = cb.checked;
            }
        }
    });
    // Update region checkboxes
    Object.keys(REGIONS).forEach(region => {
        const regionCheckbox = document.querySelector(`input[data-region="${region}"]:not([data-state])`);
        if (regionCheckbox) {
            const stateCheckboxes = document.querySelectorAll(`input[data-state][data-region="${region}"]`);
            const allChecked = Array.from(stateCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(stateCheckboxes).some(cb => cb.checked);
            regionCheckbox.checked = allChecked;
            regionCheckbox.indeterminate = someChecked && !allChecked;
            // Sync MDC checkbox state
            const regionMdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(regionCheckbox.closest('.mdc-checkbox'));
            if (regionMdcCheckbox) {
                regionMdcCheckbox.checked = allChecked;
                regionMdcCheckbox.indeterminate = someChecked && !allChecked;
            }
        }
    });

    // Apply population
    setSliderValues(config.min_population || 0, config.max_population || MAX_POPULATION);
    updatePopulationLabels();

    // Apply dates
    fromYear.value = config.from_year || '';
    toYear.value = config.to_year || '';
    includeUnknownDates.checked = config.include_unknown_dates !== false;
}
