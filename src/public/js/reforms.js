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
        
        // Add event listener for jurisdiction link
        const jurisdictionLink = card.querySelector('.jurisdiction-link');
        if (jurisdictionLink) {
            jurisdictionLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent card click
                const placeId = jurisdictionLink.getAttribute('data-place-id');
                if (placeId && typeof loadReportCardDetail === 'function') {
                    // Switch to report card view first
                    switchView('reportCard');
                    loadReportCardDetail(parseInt(placeId));
                }
            });
        }
    });

    // Also render map if in map view
    if (mapView.classList.contains('active')) {
        renderMap();
    }
}

function createReformCard(reform, showDistance = false) {
    const card = document.createElement('div');
    card.className = `mdc-card reform-card ${reform.reform.type}`;
    card.id = `reform-${reform.id}`;

    const adoptionDateRaw = reform.reform.adoption_date;
    const placeType = reform.place.type.charAt(0).toUpperCase() + reform.place.type.slice(1);

    // Helper function to format date for display
    const formatAdoptionDate = (dateString) => {
        if (!dateString) {
            return { chipText: 'Adoption Date Unknown', tooltip: null };
        }
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return { chipText: 'Adoption Date Unknown', tooltip: null };
            }
            
            const year = date.getFullYear();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const month = monthNames[date.getMonth()];
            const day = date.getDate();
            
            return {
                chipText: `Adopted ${year}`,
                tooltip: `${month} ${day}, ${year}`
            };
        } catch (e) {
            return { chipText: 'Adoption Date Unknown', tooltip: null };
        }
    };

    // Helper function to create chip HTML with proper MDC structure
    const createChip = (text, title = null) => {
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `
            <span class="mdc-chip"${titleAttr}>
                <span class="mdc-chip__ripple"></span>
                <span class="mdc-chip__text">${escapeHtml(text)}</span>
            </span>
        `;
    };

    // Build limitation chips with embedded headers
    const limitationChips = [];
    
    const scopeItems = (reform.reform.scope || [])
        .filter(s => s.toLowerCase() !== 'citywide');
    scopeItems.forEach(s => {
        limitationChips.push({ type: 'Scope', value: s });
    });
    
    const landUseItems = (reform.reform.land_use || [])
        .filter(l => l.toLowerCase() !== 'all uses');
    landUseItems.forEach(l => {
        limitationChips.push({ type: 'Land Use', value: l });
    });
    
    const requirementsItems = (reform.reform.requirements || [])
        .filter(r => r.toLowerCase() !== 'by right');
    requirementsItems.forEach(r => {
        limitationChips.push({ type: 'Requirements', value: r });
    });

    // Helper function to create limitation chip with embedded header
    const createLimitationChip = (type, value) => `
        <span class="mdc-chip limitation-chip">
            <span class="mdc-chip__ripple"></span>
            <span class="mdc-chip__text"><strong>${escapeHtml(type)}</strong>: ${escapeHtml(value)}</span>
        </span>
    `;

    const limitationsHtml = limitationChips.length > 0
        ? limitationChips.map(item => createLimitationChip(item.type, item.value)).join('')
        : '';

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

    // Build jurisdiction name with link to report card
    const jurisdictionName = reform.place.type === 'state' 
        ? escapeHtml(reform.place.state) + (reform.place.country ? `, ${reform.place.country === 'US' ? 'USA' : reform.place.country === 'CA' ? 'Canada' : reform.place.country}` : '')
        : `${escapeHtml(reform.place.name)}, ${escapeHtml(reform.place.state)}${reform.place.country ? `, ${reform.place.country === 'US' ? 'USA' : reform.place.country === 'CA' ? 'Canada' : reform.place.country}` : ''}`;
    
    const jurisdictionNameHtml = `<a href="#" class="jurisdiction-link" data-place-id="${reform.place.id}">${jurisdictionName}</a>`;

    // Build reform chips (for bottom left)
    const adoptionDateFormatted = formatAdoptionDate(adoptionDateRaw);
    const reformChips = [];
    reformChips.push(createChip(reform.reform.type_name));
    reformChips.push(createChip(adoptionDateFormatted.chipText, adoptionDateFormatted.tooltip));
    reformChips.push(createChip(`Status: ${escapeHtml(reform.reform.status || 'Adopted')}`));

    card.innerHTML = `
        <div class="mdc-card__primary-action">
            <div class="mdc-card__primary">
                <!-- Jurisdiction header - full width -->
                <div class="reform-header">
                    <h3 class="mdc-typography--headline6 reform-title" id="place-${reform.place.id}">${jurisdictionNameHtml}</h3>
                    <div class="jurisdiction-badges">
                        ${createChip(placeType)}
                        ${reform.place.region ? createChip(reform.place.region) : ''}
                        ${(() => {
                            if (!reform.place.population) return '';
                            const popCategory = reform.place.type === 'state' 
                                ? getStatePopulationCategory(reform.place.population)
                                : getCityPopulationCategory(reform.place.population);
                            return createChip(popCategory.label, popCategory.tooltip);
                        })()}
                    </div>
                </div>

                <!-- Main content and limitations side by side -->
                <div class="reform-card-content">
                    <div class="reform-main-content">
                        ${reform.reform.policy_document && reform.reform.policy_document.title ? `
                        <div class="reform-meta mdc-typography--body2">
                            <div class="meta-item">
                                <strong>Bill Title:</strong> ${escapeHtml(reform.reform.policy_document.title)}
                            </div>
                        </div>
                        ` : ''}

                        ${reform.reform.summary ? `
                            <div class="reform-summary mdc-typography--body2">
                                ${escapeHtml(reform.reform.summary)}
                            </div>
                        ` : ''}
                    </div>

                    ${limitationsHtml ? `
                    <div class="limitations-section">
                        <div class="limitations-header">
                            <span>Limitations</span>
                            <button class="mdc-icon-button limitations-help-button" aria-label="Help with limitations" title="Limitations narrow the application of a reform. Scope limits the parts of a city the reform applies to. Land Use limits which zones a reform applies to. Requirements add additional requirements for development to use the reform.">
                                <i class="material-icons">help_outline</i>
                            </button>
                        </div>
                        <div class="limitations-chips">
                            ${limitationsHtml}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="mdc-card__actions">
                <div class="mdc-card__action-buttons">
                    <div class="reform-badges">
                        ${reformChips.join('')}
                    </div>
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
