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
    
    // Get original value for tooltip
    const original = reform.reform.original?.[fieldName] || reform.reform[fieldName] || '';
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
