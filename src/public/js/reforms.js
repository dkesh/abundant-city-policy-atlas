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
    const limitations = getLimitationsFilters();

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
        // Add limitations filters
        if (limitations.scope !== 'all') params.append('scope_limitation', limitations.scope);
        if (limitations.land_use !== 'all') params.append('land_use_limitation', limitations.land_use);
        if (limitations.requirements !== 'all') params.append('requirements_limitation', limitations.requirements);
        if (limitations.intensity !== 'all') params.append('intensity_limitation', limitations.intensity);

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

        // Reload explore places if that view is active
        if (typeof explorePlacesView !== 'undefined' && explorePlacesView?.classList?.contains('active')) {
            if (typeof loadMoversAndShakers === 'function') {
                loadMoversAndShakers();
            }
        }

        // Update results banner with count
        const resultsBanner = window.mdcComponents?.resultsBanner;
        const bannerTextEl = resultsInfo?.querySelector('.mdc-banner__text');
        const resultCountEl = document.getElementById('resultCount');
        const downloadBtn = document.getElementById('downloadBannerBtn');
        const shareBtn = document.getElementById('shareBannerBtn');
        
        if (filteredReforms.length > 0) {
            // Update banner text with count
            if (bannerTextEl && resultCountEl) {
                resultCountEl.textContent = filteredReforms.length;
            } else if (bannerTextEl) {
                // Fallback if resultCount element doesn't exist
                bannerTextEl.innerHTML = `Found <strong id="resultCount">${filteredReforms.length}</strong> reforms matching your filters`;
            }
            // Show action buttons
            if (downloadBtn) downloadBtn.style.display = '';
            if (shareBtn) shareBtn.style.display = '';
            
            resultsInfo.classList.remove('container-hidden');
            if (resultsBanner) {
                resultsBanner.open();
            }
            noResultsList.classList.add('container-hidden');
        } else {
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
        const downloadBtn = document.getElementById('downloadBannerBtn');
        const shareBtn = document.getElementById('shareBannerBtn');
        
        if (resultsBanner) {
            resultsBanner.close();
        }
        resultsInfo.classList.add('container-hidden');
        noResultsList.classList.remove('container-hidden');
        
        // Restore action buttons visibility in case of error
        if (downloadBtn) downloadBtn.style.display = '';
        if (shareBtn) shareBtn.style.display = '';
    }
}

function resetLimitationsFilters() {
    // Reset all limitation radio buttons to "all"
    document.querySelectorAll('input[name="scope-limitation"]').forEach(radio => {
        if (radio.value === 'all') radio.checked = true;
    });
    document.querySelectorAll('input[name="landuse-limitation"]').forEach(radio => {
        if (radio.value === 'all') radio.checked = true;
    });
    document.querySelectorAll('input[name="requirements-limitation"]').forEach(radio => {
        if (radio.value === 'all') radio.checked = true;
    });
    document.querySelectorAll('input[name="intensity-limitation"]').forEach(radio => {
        if (radio.value === 'all') radio.checked = true;
    });
    
    // Re-initialize MDC radio buttons to sync state
    document.querySelectorAll('.mdc-radio').forEach(radio => {
        const mdcRadio = mdc.radio.MDCRadio.attachTo(radio);
        if (mdcRadio) {
            mdcRadio.checked = radio.querySelector('input').checked;
        }
    });
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

    // Reset limitations filters
    resetLimitationsFilters();

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
                if (placeId && typeof loadPolicyProfileDetail === 'function') {
                    // Switch to explore places view first
                    switchView('explorePlaces');
                    loadPolicyProfileDetail(parseInt(placeId));
                }
            });
        }
        
        // Add event listener for expand button
        const expandButton = card.querySelector('.expand-reform-button');
        if (expandButton) {
            // Initialize MDC ripple for the button
            if (window.mdc && window.mdc.ripple) {
                const ripple = new mdc.ripple.MDCRipple(expandButton);
                ripple.unbounded = true;
            }
            expandButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showExpandedReformView(reform);
            });
        }
    });

    // Also render map if in map view
    if (mapView.classList.contains('active')) {
        renderMap();
    }
}

// Helper to get field value (AI if available, otherwise original)
function getFieldValue(fieldName, reform, useOriginal = false) {
    if (useOriginal) {
        return reform.reform.original?.[fieldName] || reform.reform[fieldName] || '';
    }
    
    // Prefer AI value if available, fall back to original
    const aiValue = reform.reform.ai_enrichment?.fields?.[fieldName]?.value;
    if (aiValue !== undefined && aiValue !== null) {
        return aiValue;
    }
    return reform.reform.original?.[fieldName] || reform.reform[fieldName] || '';
}

// Helper to check if field has AI enrichment
function hasAIEnrichment(fieldName, reform) {
    return !!reform.reform.ai_enrichment?.fields?.[fieldName];
}

// Helper to render AI indicator (clickable sparkle logo)
function renderAIIndicator(fieldName, reform) {
    if (!hasAIEnrichment(fieldName, reform)) return '';
    
    const field = reform.reform.ai_enrichment.fields[fieldName];
    const fieldId = `field-${reform.id}-${fieldName}`;
    
    // Get original value for tooltip - ONLY use the original object, don't fall back to merged value
    const original = reform.reform.original?.[fieldName] || '';
    const formatValueForTooltip = (val) => {
        if (Array.isArray(val)) {
            return val.length > 0 ? val.join(', ') : '(none)';
        }
        return val || '(none)';
    };
    const originalFormatted = formatValueForTooltip(original);
    
    return `
        <button class="ai-indicator" 
                onclick="toggleFieldSource('${fieldId}')"
                title="AI-generated (${field.confidence} confidence): ${escapeHtml(field.reasoning || '')}\nOriginal value: ${escapeHtml(originalFormatted)}"
                aria-label="View original value">
            <img src="/images/ai-sparkle.svg" alt="AI" class="ai-icon" />
        </button>
    `;
}

// Helper to render field comparison view (only shows original value)
function renderFieldComparison(fieldName, reform) {
    if (!hasAIEnrichment(fieldName, reform)) return '';
    
    const fieldId = `field-${reform.id}-${fieldName}`;
    const original = reform.reform.original?.[fieldName] || '';
    
    // Format array fields
    const formatValue = (val) => {
        if (Array.isArray(val)) {
            return val.length > 0 ? val.map(v => escapeHtml(v)).join(', ') : '';
        }
        return val || '';
    };
    
    const originalFormatted = formatValue(original);
    if (!originalFormatted) return '';
    
    return `
        <div id="${fieldId}-comparison" class="field-comparison hidden">
            <div class="comparison-header">
                <span>Original (Tracker): ${fieldName}</span>
                <button onclick="toggleFieldSource('${fieldId}')" class="mdc-icon-button" aria-label="Close comparison" style="min-width: 32px; width: 32px; height: 32px; padding: 0;">
                    <i class="material-icons" style="font-size: 18px;">close</i>
                </button>
            </div>
            <div class="comparison-content">
                <div class="original-value">
                    <div class="value-content">${originalFormatted}</div>
                </div>
            </div>
        </div>
    `;
}

// Global toggle function (add to window scope)
window.toggleFieldSource = function(fieldId) {
    const comparison = document.getElementById(`${fieldId}-comparison`);
    if (comparison) {
        comparison.classList.toggle('hidden');
    }
};

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
    
    // Add intensity limitation if partial
    if (reform.reform.intensity === 'partial') {
        limitationChips.push({ type: 'Intensity', value: 'Partial reform' });
    }

    // Helper function to create limitation chip with embedded header
    const createLimitationChip = (type, value) => {
        const fullText = `${type}: ${value}`;
        return `
        <span class="mdc-chip limitation-chip" title="${escapeHtml(fullText)}">
            <span class="mdc-chip__ripple"></span>
            <span class="mdc-chip__text"><strong>${escapeHtml(type)}</strong>: ${escapeHtml(value)}</span>
        </span>
    `;
    };

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
    
    // Show one chip for each reform type (policy domain)
    if (reform.reform.types && reform.reform.types.length > 0) {
        reform.reform.types.forEach(reformType => {
            reformChips.push(createChip(reformType.name));
        });
    } else if (reform.reform.type_name) {
        // Fallback to backwards compatibility field if types array is missing
        reformChips.push(createChip(reform.reform.type_name));
    }
    
    reformChips.push(createChip(adoptionDateFormatted.chipText, adoptionDateFormatted.tooltip));
    const statusDisplay = reform.reform.status 
        ? reform.reform.status.charAt(0).toUpperCase() + reform.reform.status.slice(1).toLowerCase()
        : 'Adopted';
    reformChips.push(createChip(`Status: ${escapeHtml(statusDisplay)}`));

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

                        ${reform.reform.summary || reform.reform.ai_enrichment?.fields?.summary ? `
                            <div class="reform-summary mdc-typography--body2">
                                <div id="field-${reform.id}-summary">
                                    ${escapeHtml(getFieldValue('summary', reform))}
                                    ${renderAIIndicator('summary', reform)}
                                </div>
                                ${renderFieldComparison('summary', reform)}
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
                <div class="mdc-card__action-icons">
                    ${sourcesHtml ? `
                    <div class="sources-logos">
                        ${sourcesHtml}
                    </div>
                    ` : ''}
                    <button class="mdc-icon-button expand-reform-button" 
                            data-reform-id="${reform.id}" 
                            aria-label="Expand reform details"
                            title="View full details">
                        <i class="material-icons mdc-icon-button__icon">open_in_full</i>
                    </button>
                </div>
            </div>
        </div>
    `;

    return card;
}

// Helper to get policy document field value (AI if available, otherwise original)
function getPolicyDocFieldValue(fieldName, reform) {
    if (!reform.reform.policy_document) return null;
    
    const policyDoc = reform.reform.policy_document;
    const aiValue = policyDoc.ai_enrichment?.fields?.[fieldName]?.value;
    if (aiValue !== undefined && aiValue !== null) {
        return aiValue;
    }
    return policyDoc.original?.[fieldName] || null;
}

// Helper to check if policy document field has AI enrichment
function hasPolicyDocAIEnrichment(fieldName, reform) {
    if (!reform.reform.policy_document) return false;
    return !!reform.reform.policy_document.ai_enrichment?.fields?.[fieldName];
}

// Helper to render AI indicator for policy document fields
function renderPolicyDocAIIndicator(fieldName, reform) {
    if (!hasPolicyDocAIEnrichment(fieldName, reform)) return '';
    
    const field = reform.reform.policy_document.ai_enrichment.fields[fieldName];
    const fieldId = `policy-doc-${reform.id}-${fieldName}`;
    
    // Get original value for tooltip
    const original = reform.reform.policy_document.original?.[fieldName] || null;
    const formatValueForTooltip = (val) => {
        if (Array.isArray(val)) {
            return val.length > 0 ? val.join(', ') : '(none)';
        }
        return val || '(none)';
    };
    const originalFormatted = formatValueForTooltip(original);
    
    return `
        <button class="ai-indicator" 
                onclick="toggleFieldSource('${fieldId}')"
                title="AI-generated (${field.confidence} confidence): ${escapeHtml(field.reasoning || '')}\nOriginal value: ${escapeHtml(originalFormatted)}"
                aria-label="View original value">
            <img src="/images/ai-sparkle.svg" alt="AI" class="ai-icon" />
        </button>
    `;
}

// Helper to render field comparison for policy document fields
function renderPolicyDocFieldComparison(fieldName, reform) {
    if (!hasPolicyDocAIEnrichment(fieldName, reform)) return '';
    
    const fieldId = `policy-doc-${reform.id}-${fieldName}`;
    const original = reform.reform.policy_document.original?.[fieldName] || null;
    
    // Format array fields
    const formatValue = (val) => {
        if (Array.isArray(val)) {
            return val.length > 0 ? val.map(v => escapeHtml(v)).join(', ') : '';
        }
        return val || '';
    };
    
    const originalFormatted = formatValue(original);
    if (!originalFormatted) return '';
    
    return `
        <div id="${fieldId}-comparison" class="field-comparison hidden">
            <div class="comparison-header">
                <span>Original (Tracker): ${fieldName}</span>
                <button onclick="toggleFieldSource('${fieldId}')" class="mdc-icon-button" aria-label="Close comparison" style="min-width: 32px; width: 32px; height: 32px; padding: 0;">
                    <i class="material-icons" style="font-size: 18px;">close</i>
                </button>
            </div>
            <div class="comparison-content">
                <div class="original-value">
                    <div class="value-content">${originalFormatted}</div>
                </div>
            </div>
        </div>
    `;
}

function showExpandedReformView(reform) {
    // Get or create modal element
    let modal = document.getElementById('expandedReformModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'expandedReformModal';
        modal.className = 'expanded-reform-modal';
        document.body.appendChild(modal);
    }
    
    const adoptionDateRaw = reform.reform.adoption_date;
    const placeType = reform.place.type.charAt(0).toUpperCase() + reform.place.type.slice(1);
    const countryDisplay = reform.place.country === 'US' ? 'USA' : reform.place.country === 'CA' ? 'Canada' : reform.place.country || '';
    const countrySuffix = countryDisplay ? `, ${countryDisplay}` : '';
    
    // Format adoption date
    const formatAdoptionDate = (dateString) => {
        if (!dateString) {
            return 'Adoption Date Unknown';
        }
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return 'Adoption Date Unknown';
            }
            const year = date.getFullYear();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const month = monthNames[date.getMonth()];
            const day = date.getDate();
            return `${month} ${day}, ${year}`;
        } catch (e) {
            return 'Adoption Date Unknown';
        }
    };
    
    const adoptionDateFormatted = formatAdoptionDate(adoptionDateRaw);
    const statusDisplay = reform.reform.status 
        ? reform.reform.status.charAt(0).toUpperCase() + reform.reform.status.slice(1).toLowerCase()
        : 'Adopted';
    
    // Build jurisdiction name
    const jurisdictionName = reform.place.type === 'state' 
        ? reform.place.state + countrySuffix
        : `${reform.place.name}, ${reform.place.state}${countrySuffix}`;
    
    // Build reform types chips
    const reformTypesChips = [];
    if (reform.reform.types && reform.reform.types.length > 0) {
        reform.reform.types.forEach(reformType => {
            reformTypesChips.push(`<span class="mdc-chip"><span class="mdc-chip__ripple"></span><span class="mdc-chip__text">${escapeHtml(reformType.name)}</span></span>`);
        });
    } else if (reform.reform.type_name) {
        reformTypesChips.push(`<span class="mdc-chip"><span class="mdc-chip__ripple"></span><span class="mdc-chip__text">${escapeHtml(reform.reform.type_name)}</span></span>`);
    }
    
    // Build place badges
    const placeBadges = [];
    placeBadges.push(`<span class="mdc-chip"><span class="mdc-chip__ripple"></span><span class="mdc-chip__text">${escapeHtml(placeType)}</span></span>`);
    if (reform.place.region) {
        placeBadges.push(`<span class="mdc-chip"><span class="mdc-chip__ripple"></span><span class="mdc-chip__text">${escapeHtml(reform.place.region)}</span></span>`);
    }
    if (reform.place.population) {
        const popCategory = reform.place.type === 'state' 
            ? getStatePopulationCategory(reform.place.population)
            : getCityPopulationCategory(reform.place.population);
        placeBadges.push(`<span class="mdc-chip" title="${popCategory.tooltip || ''}"><span class="mdc-chip__ripple"></span><span class="mdc-chip__text">${escapeHtml(popCategory.label)}</span></span>`);
    }
    
    // Build scope items
    const scopeItems = (reform.reform.scope || []).filter(s => s.toLowerCase() !== 'citywide');
    const scopeHtml = scopeItems.length > 0 
        ? scopeItems.map(s => `<li>${escapeHtml(s)}</li>`).join('')
        : '<li>None</li>';
    
    // Build land use items
    const landUseItems = (reform.reform.land_use || []).filter(l => l.toLowerCase() !== 'all uses');
    const landUseHtml = landUseItems.length > 0 
        ? landUseItems.map(l => `<li>${escapeHtml(l)}</li>`).join('')
        : '<li>None</li>';
    
    // Build requirements items
    const requirementsItems = (reform.reform.requirements || []).filter(r => r.toLowerCase() !== 'by right');
    const requirementsHtml = requirementsItems.length > 0 
        ? requirementsItems.map(r => `<li>${escapeHtml(r)}</li>`).join('')
        : '<li>None</li>';
    
    // Build sources HTML
    const reformLinkUrl = reform.reform.link_url || '';
    const sourcesHtml = (reform.reform.sources && reform.reform.sources.length > 0) ? 
        reform.reform.sources.map(source => {
            const sourceUrl = reformLinkUrl || source.website_url || '';
            const logoUrl = source.logo ? `${source.logo}` : '';
            if (!logoUrl && !source.name) return '';
            
            const sourceNameHtml = source.name ? `<span class="source-name">${escapeHtml(source.name)}</span>` : '';
            const sourceLinkHtml = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="source-link">${sourceNameHtml}<i class="material-icons" style="font-size: 16px; vertical-align: middle;">open_in_new</i></a>` : sourceNameHtml;
            
            return `
                <div class="source-item">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(source.short_name || source.name)}" class="source-logo" />` : ''}
                    ${sourceLinkHtml}
                    ${source.reporter ? `<span class="source-reporter">Reported by: ${escapeHtml(source.reporter)}</span>` : ''}
                    ${source.source_url ? `<a href="${escapeHtml(source.source_url)}" target="_blank" rel="noopener" class="source-reference-link">Source <i class="material-icons" style="font-size: 14px; vertical-align: middle;">link</i></a>` : ''}
                </div>
            `;
        }).join('')
    : '<p class="mdc-typography--body2">No sources available</p>';
    
    // Build policy document HTML
    let policyDocHtml = '';
    if (reform.reform.policy_document) {
        const policyDoc = reform.reform.policy_document;
        const keyPoints = getPolicyDocFieldValue('key_points', reform) || policyDoc.original?.key_points || [];
        const analysis = getPolicyDocFieldValue('analysis', reform) || policyDoc.original?.analysis || '';
        
        const keyPointsHtml = Array.isArray(keyPoints) && keyPoints.length > 0
            ? keyPoints.map(kp => `<li>${escapeHtml(kp)}</li>`).join('')
            : '<li>No key points available</li>';
        
        policyDocHtml = `
            <div class="expanded-section policy-document-section">
                <h3 class="mdc-typography--headline6">Policy Document</h3>
                ${policyDoc.title ? `
                <div class="expanded-field">
                    <strong>Title:</strong>
                    <div class="field-value">
                        ${escapeHtml(policyDoc.title)}
                    </div>
                </div>
                ` : ''}
                ${policyDoc.reference_number ? `
                <div class="expanded-field">
                    <strong>Reference Number:</strong>
                    <div class="field-value">
                        ${escapeHtml(policyDoc.reference_number)}
                    </div>
                </div>
                ` : ''}
                <div class="expanded-field">
                    <strong>Key Points:</strong>
                    <div class="field-value">
                        <ul class="expanded-list">${keyPointsHtml}</ul>
                        ${renderPolicyDocAIIndicator('key_points', reform)}
                    </div>
                    ${renderPolicyDocFieldComparison('key_points', reform)}
                </div>
                ${analysis ? `
                <div class="expanded-field">
                    <strong>Analysis:</strong>
                    <div class="field-value">
                        <div id="policy-doc-${reform.id}-analysis">${escapeHtml(analysis)}</div>
                        ${renderPolicyDocAIIndicator('analysis', reform)}
                    </div>
                    ${renderPolicyDocFieldComparison('analysis', reform)}
                </div>
                ` : ''}
            </div>
        `;
    }
    
    // Build the modal content
    modal.innerHTML = `
        <div class="expanded-reform-modal-backdrop"></div>
        <div class="expanded-reform-modal-content">
            <div class="expanded-reform-modal-header">
                <h2 class="mdc-typography--headline5">${escapeHtml(jurisdictionName)}</h2>
                <button class="mdc-icon-button expanded-reform-modal-close" aria-label="Close expanded view">
                    <i class="material-icons mdc-icon-button__icon">close</i>
                </button>
            </div>
            <div class="expanded-reform-modal-body">
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Place Information</h3>
                    <div class="expanded-badges">
                        ${placeBadges.join('')}
                    </div>
                    ${reform.place.population ? `
                    <div class="expanded-field">
                        <strong>Population:</strong>
                        <div class="field-value">${reform.place.population.toLocaleString()}</div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Reform Details</h3>
                    <div class="expanded-badges">
                        ${reformTypesChips.join('')}
                    </div>
                    <div class="expanded-field">
                        <strong>Status:</strong>
                        <div class="field-value">${escapeHtml(statusDisplay)}</div>
                    </div>
                    <div class="expanded-field">
                        <strong>Adoption Date:</strong>
                        <div class="field-value">${escapeHtml(adoptionDateFormatted)}</div>
                    </div>
                    ${reform.reform.summary || reform.reform.ai_enrichment?.fields?.summary ? `
                    <div class="expanded-field">
                        <strong>Summary:</strong>
                        <div class="field-value">
                            <div id="field-${reform.id}-summary-expanded">${escapeHtml(getFieldValue('summary', reform))}</div>
                            ${renderAIIndicator('summary', reform)}
                        </div>
                        ${renderFieldComparison('summary', reform)}
                    </div>
                    ` : ''}
                </div>
                
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Limitations</h3>
                    <div class="expanded-field">
                        <strong>Scope:</strong>
                        <div class="field-value">
                            <ul class="expanded-list">${scopeHtml}</ul>
                        </div>
                    </div>
                    <div class="expanded-field">
                        <strong>Land Use:</strong>
                        <div class="field-value">
                            <ul class="expanded-list">${landUseHtml}</ul>
                        </div>
                    </div>
                    <div class="expanded-field">
                        <strong>Requirements:</strong>
                        <div class="field-value">
                            <ul class="expanded-list">${requirementsHtml}</ul>
                        </div>
                    </div>
                    ${reform.reform.intensity === 'partial' ? `
                    <div class="expanded-field">
                        <strong>Intensity:</strong>
                        <div class="field-value">
                            <ul class="expanded-list"><li>Partial reform</li></ul>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                ${reform.reform.notes ? `
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Notes</h3>
                    <div class="expanded-field">
                        <div class="field-value">${escapeHtml(reform.reform.notes)}</div>
                    </div>
                </div>
                ` : ''}
                
                ${reform.reform.link_url ? `
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Links</h3>
                    <div class="expanded-field">
                        <a href="${escapeHtml(reform.reform.link_url)}" target="_blank" rel="noopener" class="external-link">
                            View External Link <i class="material-icons" style="font-size: 16px; vertical-align: middle;">open_in_new</i>
                        </a>
                    </div>
                </div>
                ` : ''}
                
                ${policyDocHtml}
                
                <div class="expanded-section">
                    <h3 class="mdc-typography--headline6">Sources</h3>
                    <div class="sources-list">
                        ${sourcesHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Initialize MDC components for new buttons
    const closeButton = modal.querySelector('.expanded-reform-modal-close');
    if (closeButton && window.mdcComponents) {
        const ripple = new mdc.ripple.MDCRipple(closeButton);
        ripple.unbounded = true;
    }
    
    // Add event listeners
    const backdrop = modal.querySelector('.expanded-reform-modal-backdrop');
    const closeBtn = modal.querySelector('.expanded-reform-modal-close');
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (backdrop) {
        backdrop.addEventListener('click', closeModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // Close on ESC key
    const handleEsc = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// ============================================================================
// CSV EXPORT FUNCTION
// ============================================================================

/**
 * Escape CSV value - wraps in quotes if contains commas, quotes, or newlines
 * @param {string} value - Value to escape
 * @returns {string} Escaped CSV value
 */
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    const stringValue = String(value);
    
    // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
}

/**
 * Export filtered reforms to CSV file
 * @param {Array} reforms - Array of reform objects to export
 */
function exportReformsToCSV(reforms) {
    if (!reforms || reforms.length === 0) {
        if (typeof showToast === 'function') {
            showToast('No reforms available to export');
        }
        return;
    }

    // Define CSV headers
    const headers = [
        'Jurisdiction Name',
        'Level of Government',
        'State/Province',
        'Country',
        'Region',
        'Population',
        'Policy Domain',
        'Status',
        'Adoption Date',
        'Summary'
    ];

    // Build CSV rows
    const rows = [headers.join(',')];

    reforms.forEach(reform => {
        // Get jurisdiction name (use state name for state-level reforms)
        const jurisdictionName = reform.place.type === 'state' 
            ? reform.place.state 
            : reform.place.name;

        // Format place type (capitalize first letter)
        const placeType = reform.place.type 
            ? reform.place.type.charAt(0).toUpperCase() + reform.place.type.slice(1)
            : '';

        // Get state/province
        const stateProvince = reform.place.state || '';

        // Get country
        const country = reform.place.country || '';

        // Get region
        const region = reform.place.region || '';

        // Get population
        const population = reform.place.population ? String(reform.place.population) : '';

        // Get reform types (comma-separated list of names)
        const reformTypes = reform.reform.types && reform.reform.types.length > 0
            ? reform.reform.types.map(rt => rt.name).join(', ')
            : (reform.reform.type_name || '');

        // Get status (capitalized)
        const status = reform.reform.status 
            ? reform.reform.status.charAt(0).toUpperCase() + reform.reform.status.slice(1).toLowerCase()
            : '';

        // Get adoption date (YYYY-MM-DD format)
        const adoptionDate = reform.reform.adoption_date || '';

        // Get summary (use AI-enriched value if available, otherwise original)
        const summary = getFieldValue('summary', reform) || '';

        // Build CSV row
        const row = [
            escapeCSV(jurisdictionName),
            escapeCSV(placeType),
            escapeCSV(stateProvince),
            escapeCSV(country),
            escapeCSV(region),
            escapeCSV(population),
            escapeCSV(reformTypes),
            escapeCSV(status),
            escapeCSV(adoptionDate),
            escapeCSV(summary)
        ];

        rows.push(row.join(','));
    });

    // Create CSV content
    const csvContent = rows.join('\n');

    // Create Blob with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    // Generate filename with timestamp
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const filename = `reforms-export-${year}-${month}-${day}-${hours}${minutes}${seconds}.csv`;

    // Create download link and trigger download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Show success message
    if (typeof showToast === 'function') {
        showToast(`Exported ${reforms.length} reform${reforms.length !== 1 ? 's' : ''} to CSV`);
    }
}
