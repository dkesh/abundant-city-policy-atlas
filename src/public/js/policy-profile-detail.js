// ============================================================================
// POLICY PROFILE DETAIL VIEW
// ============================================================================

// Load and display policy profile detail
async function loadPolicyProfileDetail(placeId) {
    const listView = document.getElementById('explorePlacesListView');
    const detailView = document.getElementById('policyProfileDetailView');
    const detailContent = document.getElementById('policyProfileDetailContent');
    
    if (!detailContent) return;
    
    // Show detail view, hide list view
    if (listView) listView.classList.add('container-hidden');
    if (detailView) detailView.classList.remove('container-hidden');
    
    detailContent.innerHTML = '<p>Loading policy profile...</p>';
    
    try {
        const response = await fetch(`/.netlify/functions/get-policy-profile?place_id=${placeId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load policy profile');
        }
        
        renderPlaceProfile(data);
        
        // Update URL
        window.history.pushState({ placeId }, '', `/place?place_id=${placeId}`);
        
    } catch (error) {
        console.error('Error loading policy profile:', error);
        detailContent.innerHTML = '<p class="error">Failed to load policy profile. Please try again.</p>';
    }
}

// Render policy profile
function renderPlaceProfile(data) {
    const container = document.getElementById('policyProfileDetailContent');
    if (!container) return;
    
    const { place, reforms, domains, todoItems, reformSummary, advocacyOrganizations } = data;
    
    container.innerHTML = `
        <div class="policy-profile-detail" id="policyProfilePrintContent">
            <!-- Header -->
            <div class="policy-profile-header">
                <div class="policy-profile-logo">
                    <img src="/icon.svg" alt="ACPA Logo" class="acpa-logo">
                </div>
                <h1 class="mdc-typography--headline3">${escapeHtml(place.name)} Policy Profile</h1>
                <p class="mdc-typography--subtitle1">${escapeHtml(place.stateName || '')}${place.region ? ` • ${escapeHtml(place.region)}` : ''}</p>
                ${(() => {
                    if (!place.population) return '';
                    const popCategory = place.type === 'state' 
                        ? getStatePopulationCategory(place.population)
                        : getCityPopulationCategory(place.population);
                    return `<p class="mdc-typography--body2" title="${popCategory.tooltip || ''}">${popCategory.label}</p>`;
                })()}
                <p class="mdc-typography--body2" style="margin-top: 16px; color: #666;">
                    Based on tracked reforms in the Atlas. This is not a complete audit; gaps may reflect missing data.
                </p>
            </div>
            
            <!-- Advocacy Organizations -->
            ${renderAdvocacyOrganizations(advocacyOrganizations)}
            
            <!-- Reform Timeline -->
            ${renderReformTimeline(reforms, place)}
            
            <!-- Priority Areas for Improvement -->
            ${todoItems && todoItems.length > 0 ? `
                <div class="priority-areas">
                    <h3 class="mdc-typography--headline6">Priority Areas for Improvement</h3>
                    <ul class="todo-list">
                        ${todoItems.map(item => `
                            <li class="todo-item">
                                <span class="todo-category">${escapeHtml(item.category)}:</span>
                                <span class="todo-text">${escapeHtml(item.reformName)}</span>
                                <span class="todo-note">(adopted by ${item.adoptionCount} similar jurisdictions)</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <!-- Policy Domains Overview -->
            ${renderDomainOverview(domains, reformSummary)}
            
            <!-- Print Button -->
            <div class="policy-profile-actions">
                <button class="mdc-button mdc-button--raised" id="printPolicyProfile">
                    <span class="mdc-button__ripple"></span>
                    <i class="material-icons mdc-button__icon">print</i>
                    <span class="mdc-button__label">Print Policy Profile</span>
                </button>
            </div>
        </div>
    `;
    
    // Initialize print button
    const printBtn = document.getElementById('printPolicyProfile');
    if (printBtn) {
        printBtn.addEventListener('click', () => printPolicyProfile());
        // Initialize MDC ripple
        if (window.mdcComponents && window.mdcComponents.buttons) {
            window.mdcComponents.buttons.push(new mdc.ripple.MDCRipple(printBtn));
        }
    }

    // Initialize expand buttons for timeline items
    container.querySelectorAll('.timeline-expand-button').forEach(button => {
        const reformId = parseInt(button.getAttribute('data-reform-id'));
        const reformCode = button.getAttribute('data-reform-code');
        
        // Find the reform data
        const reform = reforms.find(r => r.id === reformId);
        if (reform && typeof showExpandedReformView === 'function') {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const transformedReform = transformTimelineReformForExpandedView(reform, place);
                showExpandedReformView(transformedReform);
            });
            
            // Initialize MDC ripple
            if (window.mdcComponents && window.mdcComponents.iconButtons) {
                const ripple = new mdc.ripple.MDCRipple(button);
                ripple.unbounded = true;
                window.mdcComponents.iconButtons.push(ripple);
            }
        }
    });
}

// Transform timeline reform data to format expected by showExpandedReformView
function transformTimelineReformForExpandedView(timelineReform, place) {
    // Transform AI enrichment fields if present
    let aiEnrichment = null;
    if (timelineReform.ai_enriched_fields) {
        aiEnrichment = {
            version: timelineReform.ai_enriched_fields.version,
            enriched_at: timelineReform.ai_enriched_fields.enriched_at,
            model: timelineReform.ai_enriched_fields.model,
            provider: timelineReform.ai_enriched_fields.provider,
            fields: timelineReform.ai_enriched_fields.fields || {}
        };
    }
    
    return {
        id: timelineReform.id,
        reform: {
            id: timelineReform.id,
            adoption_date: timelineReform.adoption_date,
            status: timelineReform.status || 'adopted',
            scope: timelineReform.scope || [],
            land_use: timelineReform.land_use || [],
            requirements: timelineReform.requirements || [],
            types: [{ name: timelineReform.reform_name }],
            type_name: timelineReform.reform_name,
            summary: timelineReform.summary || null,
            link_url: timelineReform.link_url || null,
            notes: timelineReform.notes || null,
            policy_document: null,
            sources: Array.isArray(timelineReform.sources) ? timelineReform.sources : [],
            ai_enrichment: aiEnrichment,
            original: {
                summary: timelineReform.summary || '',
                scope: timelineReform.scope || [],
                land_use: timelineReform.land_use || [],
                requirements: timelineReform.requirements || []
            }
        },
        place: {
            id: place.id,
            name: place.name,
            state: place.stateName || '',
            country: place.country || 'US',
            type: place.type,
            region: place.region || null,
            population: place.population || null
        }
    };
}

// Render reform timeline grouped by year
function renderReformTimeline(reforms, place) {
    if (!reforms || reforms.length === 0) {
        return `
            <div class="reform-timeline">
                <h3 class="mdc-typography--headline6">Reform Timeline</h3>
                <p class="mdc-typography--body2" style="color: #666;">No reforms recorded in the Atlas for this jurisdiction.</p>
            </div>
        `;
    }

    // Group reforms by year
    const reformsByYear = {};
    const unknownDateReforms = [];

    reforms.forEach(reform => {
        if (!reform.adoption_date) {
            unknownDateReforms.push(reform);
            return;
        }

        const date = new Date(reform.adoption_date);
        const year = date.getFullYear();
        
        if (!reformsByYear[year]) {
            reformsByYear[year] = [];
        }
        reformsByYear[year].push(reform);
    });

    // Sort years descending
    const years = Object.keys(reformsByYear).sort((a, b) => parseInt(b) - parseInt(a));

    let timelineHTML = `
        <div class="reform-timeline">
            <h3 class="mdc-typography--headline6">Reform Timeline</h3>
    `;

    // Render reforms by year
    years.forEach(year => {
        timelineHTML += `
            <div class="timeline-year">
                <h4 class="mdc-typography--subtitle1">${year}</h4>
                <div class="timeline-items">
                    ${reformsByYear[year].map(reform => renderTimelineItem(reform, false, place)).join('')}
                </div>
            </div>
        `;
    });

    // Render unknown date reforms at the end
    if (unknownDateReforms.length > 0) {
        timelineHTML += `
            <div class="timeline-year">
                <h4 class="mdc-typography--subtitle1">Date Unknown</h4>
                <div class="timeline-items">
                    ${unknownDateReforms.map(reform => renderTimelineItem(reform, true, place)).join('')}
                </div>
            </div>
        `;
    }

    timelineHTML += `</div>`;
    return timelineHTML;
}

// Render a single timeline item
function renderTimelineItem(reform, isUnknownDate = false, place = null) {
    const dateStr = isUnknownDate 
        ? 'Date unknown' 
        : (() => {
            const date = new Date(reform.adoption_date);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        })();

    const statusBadge = reform.status 
        ? `<span class="status-badge status-${reform.status.toLowerCase()}">${escapeHtml(reform.status)}</span>`
        : '';

    const limitationTags = [];
    if (reform.scope && Array.isArray(reform.scope) && reform.scope.length > 0) {
        const hasCitywide = reform.scope.some(s => s && s.toLowerCase() === 'citywide');
        if (!hasCitywide) {
            limitationTags.push(`<span class="limitation-chip">Limited scope</span>`);
        }
    }
    if (reform.land_use && Array.isArray(reform.land_use) && reform.land_use.length > 0) {
        const hasAllUses = reform.land_use.some(lu => lu && lu.toLowerCase() === 'all uses');
        if (!hasAllUses) {
            limitationTags.push(`<span class="limitation-chip">Limited land use</span>`);
        }
    }
    if (reform.requirements && Array.isArray(reform.requirements) && reform.requirements.length > 0) {
        const hasByRight = reform.requirements.some(req => req && req.toLowerCase() === 'by right');
        if (!hasByRight) {
            limitationTags.push(`<span class="limitation-chip">Discretionary</span>`);
        }
    }
    if (reform.intensity === 'partial') {
        limitationTags.push(`<span class="limitation-chip">Partial reform</span>`);
    }

    return `
        <div class="timeline-item">
            <div class="timeline-item-date">${dateStr}</div>
            <div class="timeline-item-content">
                <div class="timeline-item-header">
                    <span class="timeline-item-name">${escapeHtml(reform.reform_name)}</span>
                    ${statusBadge}
                    ${typeof showExpandedReformView === 'function' ? `
                        <button class="mdc-icon-button expand-reform-button timeline-expand-button" 
                                data-reform-id="${reform.id}"
                                data-reform-code="${escapeHtml(reform.reform_code)}"
                                aria-label="Expand reform details"
                                title="View full details">
                            <i class="material-icons mdc-icon-button__icon">open_in_full</i>
                        </button>
                    ` : ''}
                </div>
                <div class="timeline-item-meta">
                    <span class="timeline-item-category">${escapeHtml(reform.category)}</span>
                    ${limitationTags.length > 0 ? `<div class="timeline-item-limitations">${limitationTags.join('')}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

// Render domain overview
function renderDomainOverview(domains, reformSummary) {
    if (!domains || Object.keys(domains).length === 0) {
        return `
            <div class="domain-overview">
                <h3 class="mdc-typography--headline6">Policy Domains</h3>
                <p class="mdc-typography--body2" style="color: #666;">No policy domains recorded.</p>
            </div>
        `;
    }

    const domainKeys = Object.keys(domains).sort();

    return `
        <div class="domain-overview">
            <h3 class="mdc-typography--headline6">Policy Domains</h3>
            <div class="domain-summaries">
                ${domainKeys.map(category => {
                    const domain = domains[category];
                    const reformTypes = domain.reformTypes || [];
                    const totalTracked = domain.totalTracked || 0;
                    const reformNames = reformSummary[category] 
                        ? reformSummary[category].map(r => r.name)
                        : [];

                    return `
                        <div class="mdc-card domain-summary-card">
                            <div class="domain-summary-header">
                                <h4 class="mdc-typography--headline6">${escapeHtml(category)}</h4>
                                <div class="domain-summary-count">
                                    ${reformTypes.length} of ${totalTracked} tracked types
                                </div>
                            </div>
                            ${reformNames.length > 0 ? `
                                <div class="domain-summary-reforms">
                                    <div class="mdc-typography--caption" style="font-weight: 500; margin-bottom: 8px; color: #666;">Reforms recorded:</div>
                                    <ul class="domain-reform-list">
                                        ${reformNames.map(name => `<li>${escapeHtml(name)}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : `
                                <div class="domain-summary-reforms">
                                    <p class="mdc-typography--body2" style="color: #666;">No reforms recorded in this domain.</p>
                                </div>
                            `}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Render advocacy organizations section
function renderAdvocacyOrganizations(organizations) {
    if (!organizations || organizations.length === 0) {
        return '';
    }

    return `
        <div class="advocacy-organizations-section">
            <h3 class="mdc-typography--headline6">Advocacy Organizations</h3>
            <p class="mdc-typography--body2" style="color: #666; margin-bottom: 16px;">
                Pro-housing advocacy organizations active in this jurisdiction.
            </p>
            <div class="advocacy-organizations-grid">
                ${organizations.map(org => `
                    <div class="mdc-card advocacy-organization-card">
                        ${org.logoUrl ? `
                            <img src="${escapeHtml(org.logoUrl)}" alt="${escapeHtml(org.name)}" class="advocacy-org-logo" />
                        ` : ''}
                        <div class="advocacy-org-content">
                            <h4 class="mdc-typography--subtitle1 advocacy-org-name">
                                ${org.websiteUrl ? `
                                    <a href="${escapeHtml(org.websiteUrl)}" target="_blank" rel="noopener" class="advocacy-org-link">
                                        ${escapeHtml(org.name)}
                                        <i class="material-icons" style="font-size: 16px; vertical-align: middle; margin-left: 4px;">open_in_new</i>
                                    </a>
                                ` : escapeHtml(org.name)}
                            </h4>
                            ${org.description ? `
                                <p class="mdc-typography--body2" style="color: #666; margin-top: 8px;">
                                    ${escapeHtml(org.description)}
                                </p>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Print policy profile
function printPolicyProfile() {
    window.print();
}