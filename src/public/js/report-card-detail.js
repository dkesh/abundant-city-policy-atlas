// ============================================================================
// REPORT CARD DETAIL VIEW
// ============================================================================

// Load and display report card detail
async function loadReportCardDetail(placeId) {
    const listView = document.getElementById('reportCardListView');
    const detailView = document.getElementById('reportCardDetailView');
    const detailContent = document.getElementById('reportCardDetailContent');
    
    if (!detailContent) return;
    
    // Show detail view, hide list view
    if (listView) listView.classList.add('container-hidden');
    if (detailView) detailView.classList.remove('container-hidden');
    
    detailContent.innerHTML = '<p>Loading report card...</p>';
    
    try {
        const response = await fetch(`/.netlify/functions/get-report-card?place_id=${placeId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load report card');
        }
        
        renderReportCard(data);
        
        // Update URL
        window.history.pushState({ placeId }, '', `/report-card?place_id=${placeId}`);
        
    } catch (error) {
        console.error('Error loading report card:', error);
        detailContent.innerHTML = '<p class="error">Failed to load report card. Please try again.</p>';
    }
}

// Render report card
function renderReportCard(data) {
    const container = document.getElementById('reportCardDetailContent');
    if (!container) return;
    
    const { place, overallGrade, categoryGrades, comparisons, todoItems, reformSummary } = data;
    
    container.innerHTML = `
        <div class="report-card-detail" id="reportCardPrintContent">
            <!-- Header -->
            <div class="report-card-header">
                <div class="report-card-logo">
                    <img src="/icon.svg" alt="ACPA Logo" class="acpa-logo">
                </div>
                <h1 class="mdc-typography--headline3">${escapeHtml(place.name)} Report Card</h1>
                <p class="mdc-typography--subtitle1">${escapeHtml(place.stateName || '')}${place.region ? ` • ${escapeHtml(place.region)}` : ''}</p>
                ${place.population ? `<p class="mdc-typography--body2">Population: ${formatPopulationCompact(place.population)}</p>` : ''}
            </div>
            
            <!-- Overall Grade -->
            <div class="report-card-overall-grade">
                <div class="overall-grade-circle grade-${overallGrade.letter.toLowerCase()}">
                    <div class="grade-letter-large">${overallGrade.letter}</div>
                    <div class="grade-score-large">${overallGrade.score.toFixed(1)}</div>
                </div>
                <div class="overall-grade-info">
                    <h2 class="mdc-typography--headline5">Overall Grade: ${overallGrade.letter}</h2>
                    <p class="mdc-typography--body1">Score: ${overallGrade.score.toFixed(1)}/100</p>
                    <p class="mdc-typography--body2">Categories with reforms: ${overallGrade.categoriesWithReforms}</p>
                </div>
            </div>
            
            <!-- Comparisons -->
            <div class="report-card-comparisons">
                <h3 class="mdc-typography--headline6">Comparisons</h3>
                <div class="comparison-items">
                    ${comparisons.statePercentile > 0 ? `
                        <div class="comparison-item">
                            <span class="comparison-label">Better than</span>
                            <span class="comparison-value">${comparisons.statePercentile.toFixed(1)}%</span>
                            <span class="comparison-label">of ${pluralizePlaceType(place.type)} in ${place.stateName}</span>
                        </div>
                    ` : ''}
                    ${comparisons.regionPercentile > 0 ? `
                        <div class="comparison-item">
                            <span class="comparison-label">Better than</span>
                            <span class="comparison-value">${comparisons.regionPercentile.toFixed(1)}%</span>
                            <span class="comparison-label">of similar ${pluralizePlaceType(place.type)} in ${place.region}</span>
                        </div>
                    ` : ''}
                    ${comparisons.nationalPercentile > 0 ? `
                        <div class="comparison-item">
                            <span class="comparison-label">Better than</span>
                            <span class="comparison-value">${comparisons.nationalPercentile.toFixed(1)}%</span>
                            <span class="comparison-label">of ${place.type === 'state' ? 'states' : 'national ' + pluralizePlaceType(place.type)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Category Grades -->
            <div class="report-card-categories">
                <h3 class="mdc-typography--headline6">Grades by Category</h3>
                <div class="category-grades-grid">
                    ${categoryGrades.map(grade => `
                        <div class="mdc-card category-grade-card">
                            <div class="category-grade-header">
                                <h4 class="mdc-typography--headline6">${escapeHtml(grade.category)}</h4>
                                <div class="category-grade-letter grade-${grade.letterGrade.toLowerCase()}">${grade.letterGrade}</div>
                            </div>
                            <div class="category-grade-details">
                                <div class="grade-stat">
                                    <span class="stat-label">Score:</span>
                                    <span class="stat-value">${grade.finalScore.toFixed(1)}/100</span>
                                </div>
                                <div class="grade-stat">
                                    <span class="stat-label">Reforms:</span>
                                    <span class="stat-value">${grade.reformsAdopted}/${grade.totalPossible}</span>
                                </div>
                                ${grade.limitationsPenalty > 0 ? `
                                    <div class="grade-stat">
                                        <span class="stat-label">Limitations:</span>
                                        <span class="stat-value penalty">-${grade.limitationsPenalty} points</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- TODO List -->
            ${todoItems && todoItems.length > 0 ? `
                <div class="report-card-todo">
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
            
            <!-- Print Button -->
            <div class="report-card-actions">
                <button class="mdc-button mdc-button--raised" id="printReportCard">
                    <span class="mdc-button__ripple"></span>
                    <i class="material-icons mdc-button__icon">print</i>
                    <span class="mdc-button__label">Print Report Card</span>
                </button>
            </div>
        </div>
    `;
    
    // Initialize print button
    const printBtn = document.getElementById('printReportCard');
    if (printBtn) {
        printBtn.addEventListener('click', () => printReportCard());
        // Initialize MDC ripple
        if (window.mdcComponents && window.mdcComponents.buttons) {
            window.mdcComponents.buttons.push(new mdc.ripple.MDCRipple(printBtn));
        }
    }
}

// Print report card
function printReportCard() {
    window.print();
}