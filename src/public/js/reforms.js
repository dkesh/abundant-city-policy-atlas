// ============================================================================
// REFORM FETCHING AND RENDERING
// ============================================================================

async function applyFilters(skipUrlUpdate = false) {
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

    showLoading(true);
    hideError();

    try {
        // Build query string
        const params = new URLSearchParams();
        reformTypes.forEach(t => params.append('reform_type', t));
        placeTypes.forEach(t => params.append('place_type', t));
        statuses.forEach(s => params.append('status', s));
        if (minPopulation > 0) params.append('min_population', minPopulation);
        if (maxPopulation < MAX_POPULATION) params.append('max_population', maxPopulation);
        states.forEach(s => params.append('state', s));
        if (fromYearVal) params.append('from_year', fromYearVal);
        if (toYearVal) params.append('to_year', toYearVal);
        if (includeUnknown) params.append('include_unknown_dates', 'true');

        const query = params.toString();
        const url = query ? `/.netlify/functions/get-reforms?${query}` : '/.netlify/functions/get-reforms';

        // Update URL without reloading page
        if (!skipUrlUpdate) {
            const newUrl = query 
                ? `${window.location.pathname}?${query}` 
                : window.location.pathname;
            window.history.pushState({}, '', newUrl);
        }

        // Fetch reforms
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch reforms');
        }

        allReforms = data.reforms;
        filteredReforms = allReforms;

        renderReforms();
        showLoading(false);

        if (filteredReforms.length > 0) {
            resultCount.textContent = filteredReforms.length;
            resultsInfo.classList.remove('container-hidden');
            const resultsBanner = window.mdcComponents?.resultsBanner;
            if (resultsBanner) {
                resultsBanner.open();
            }
            noResultsList.classList.add('container-hidden');
        } else {
            const resultsBanner = window.mdcComponents?.resultsBanner;
            if (resultsBanner) {
                resultsBanner.close();
            }
            resultsInfo.classList.add('container-hidden');
            noResultsList.classList.remove('container-hidden');
        }

    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        showLoading(false);
        const resultsBanner = window.mdcComponents?.resultsBanner;
        if (resultsBanner) {
            resultsBanner.close();
        }
        resultsInfo.classList.add('container-hidden');
        noResultsList.classList.remove('container-hidden');
    }
}

function resetFilters() {
    // Reset checkboxes
    document.querySelectorAll('.reformTypeCheckbox').forEach(cb => cb.checked = true);
    document.querySelectorAll('.category-cb').forEach(cb => {
        cb.checked = true;
        cb.indeterminate = false;
    });
    placeTypeCheckboxes.forEach(cb => {
        cb.checked = cb.value === 'city';
    });
    statusCheckboxes.forEach(cb => {
        cb.checked = cb.value === 'adopted';
    });
    document.querySelectorAll('#locationCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);

    // Reset sliders
    setSliderValues(0, MAX_POPULATION);
    updatePopulationLabels();

    // Reset date range
    fromYear.value = '';
    toYear.value = '';
    includeUnknownDates.checked = true;

    // Clear URL params
    window.history.pushState({}, '', window.location.pathname);
    applyFilters(true);
}

function renderReforms() {
    reformsList.innerHTML = '';

    if (filteredReforms.length === 0) {
        return;
    }

    filteredReforms.forEach(reform => {
        const card = createReformCard(reform);
        reformsList.appendChild(card);
    });

    // Also render map if in map view
    if (mapView.classList.contains('active')) {
        renderMap();
    }
}

function createReformCard(reform, showDistance = false) {
    const card = document.createElement('div');
    card.className = `mdc-card reform-card ${reform.reform.type}`;

    const adoptionDate = reform.reform.adoption_date || 'Date unknown';
    const placeType = reform.place.type.charAt(0).toUpperCase() + reform.place.type.slice(1);

    const scopeTags = (reform.reform.scope || [])
        .filter(s => s.toLowerCase() !== 'citywide')
        .map(s =>
            `<span class="mdc-chip__text">${escapeHtml(s)}</span>`
        ).join('');

    const landUseTags = (reform.reform.land_use || [])
        .filter(l => l.toLowerCase() !== 'all uses')
        .map(l =>
            `<span class="mdc-chip__text">${escapeHtml(l)}</span>`
        ).join('');

    const requirementsTags = (reform.reform.requirements || [])
        .filter(r => r.toLowerCase() !== 'by right')
        .map(r =>
            `<span class="mdc-chip__text">${escapeHtml(r)}</span>`
        ).join('');

    // Helper function to create chip HTML with proper MDC structure
    const createChip = (text) => `
        <span class="mdc-chip">
            <span class="mdc-chip__ripple"></span>
            <span class="mdc-chip__text">${escapeHtml(text)}</span>
        </span>
    `;

    // Sources with logos only
    const reformLinkUrl = reform.reform.link_url || '';
    const sourcesHtml = (reform.reform.sources && reform.reform.sources.length > 0) ? 
        reform.reform.sources.map(source => {
            const sourceUrl = reformLinkUrl || source.website_url || '';
            const logoUrl = source.logo ? `${source.logo}` : '';
            
            if (!logoUrl) return '';
            
            if (sourceUrl) {
                return `
                    <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="source-logo-link">
                        <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(source.short_name)}" class="source-logo" />
                    </a>
                `;
            } else {
                return `
                    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(source.short_name)}" class="source-logo" />
                `;
            }
        }).join('')
    : '';

    card.innerHTML = `
        <div class="mdc-card__primary-action">
            <div class="mdc-card__primary">
                <div class="reform-header">
                    <h3 class="mdc-typography--headline6 reform-title">${reform.place.type === 'state' 
                        ? escapeHtml(reform.place.state) + (reform.place.country ? `, ${reform.place.country === 'US' ? 'USA' : reform.place.country === 'CA' ? 'Canada' : reform.place.country}` : '')
                        : `${escapeHtml(reform.place.name)}, ${escapeHtml(reform.place.state)}${reform.place.country ? `, ${reform.place.country === 'US' ? 'USA' : reform.place.country === 'CA' ? 'Canada' : reform.place.country}` : ''}`}</h3>
                    <div class="reform-badges">
                        ${createChip(reform.reform.type_name)}
                        ${createChip(placeType)}
                        ${reform.place.region ? createChip(reform.place.region) : ''}
                    </div>
                </div>

                <div class="reform-meta mdc-typography--body2">
                    <div class="meta-item">
                        <strong>Adopted:</strong> ${adoptionDate}
                    </div>
                    <div class="meta-item">
                        <strong>Status:</strong> ${escapeHtml(reform.reform.status || 'Adopted')}
                    </div>
                    ${reform.reform.policy_document && reform.reform.policy_document.title ? `
                    <div class="meta-item">
                        <strong>Bill Title:</strong> ${escapeHtml(reform.reform.policy_document.title)}
                    </div>
                    ` : ''}
                    ${reform.place.population ? `
                    <div class="meta-item">
                        <strong>Population:</strong> ${parseInt(reform.place.population).toLocaleString()}
                    </div>
                    ` : ''}
                </div>

                ${reform.reform.summary ? `
                    <div class="reform-summary mdc-typography--body2">
                        ${escapeHtml(reform.reform.summary)}
                    </div>
                ` : ''}

                <div class="reform-details">
                    ${scopeTags ? `
                    <div class="detail-item">
                        <strong class="mdc-typography--subtitle2">Scope</strong>
                        <div class="tag-list">${scopeTags}</div>
                    </div>
                    ` : ''}
                    
                    ${landUseTags ? `
                    <div class="detail-item">
                        <strong class="mdc-typography--subtitle2">Land Use</strong>
                        <div class="tag-list">${landUseTags}</div>
                    </div>
                    ` : ''}

                    ${requirementsTags ? `
                    <div class="detail-item">
                        <strong class="mdc-typography--subtitle2">Requirements</strong>
                        <div class="tag-list">${requirementsTags}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="mdc-card__actions">
                <div class="mdc-card__action-buttons">
                    <span class="mdc-typography--caption reform-footer-text">
                        ${reform.place.type.charAt(0).toUpperCase() + reform.place.type.slice(1)} ID: ${reform.id}
                    </span>
                </div>
                ${sourcesHtml ? `
                <div class="mdc-card__action-icons sources-logos">
                    ${sourcesHtml}
                </div>
                ` : ''}
            </div>
        </div>
    `;

    return card;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
