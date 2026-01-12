// ============================================================================
// FILTER MANAGEMENT
// ============================================================================

function getSelectedReformTypes() {
    const checkboxes = document.querySelectorAll('.reformTypeCheckbox');
    const selected = [];
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selected.push(checkbox.value);
        }
    });
    return selected;
}

function getSelectedPlaceTypes() {
    const selected = [];
    placeTypeCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selected.push(checkbox.value);
        }
    });
    return selected;
}

function getSelectedStatuses() {
    const selected = [];
    statusCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selected.push(checkbox.value);
        }
    });
    return selected;
}

function getSelectedLocations() {
    const checkboxes = document.querySelectorAll('#locationCheckboxes input[data-state]:checked');
    const states = [];
    checkboxes.forEach(cb => {
        if (cb.dataset.state) {
            states.push(cb.dataset.state);
        }
    });
    return states;
}

function updateLocationHierarchy(regionCheckbox) {
    const region = regionCheckbox.dataset.region;
    const states = REGIONS[region];
    const stateCheckboxes = document.querySelectorAll(
        `#locationCheckboxes input[data-state][data-region="${region}"]`
    );

    stateCheckboxes.forEach(cb => {
        cb.checked = regionCheckbox.checked;
        // Sync MDC checkbox state
        const mdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(cb.closest('.mdc-checkbox'));
        mdcCheckbox.checked = regionCheckbox.checked;
    });
}

function updateRegionCheckbox(stateCheckbox) {
    const region = stateCheckbox.dataset.region;
    const regionCheckbox = document.querySelector(
        `#locationCheckboxes input[data-region="${region}"]:not([data-state])`
    );

    if (!regionCheckbox) return;

    const stateCheckboxes = document.querySelectorAll(
        `#locationCheckboxes input[data-state][data-region="${region}"]`
    );
    const allChecked = Array.from(stateCheckboxes).every(cb => cb.checked);
    const someChecked = Array.from(stateCheckboxes).some(cb => cb.checked);

    regionCheckbox.checked = allChecked;
    regionCheckbox.indeterminate = someChecked && !allChecked;
    
    // Sync MDC checkbox state
    const regionMdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(regionCheckbox.closest('.mdc-checkbox'));
    regionMdcCheckbox.checked = allChecked;
    regionMdcCheckbox.indeterminate = someChecked && !allChecked;
}

// --- Reform Type Hierarchy Helpers ---

function updateReformHierarchy(categoryCheckbox) {
    const category = categoryCheckbox.dataset.category;
    const reformCheckboxes = document.querySelectorAll(
        `.reformTypeCheckbox[data-category="${category}"]`
    );

    reformCheckboxes.forEach(cb => {
        cb.checked = categoryCheckbox.checked;
        // Sync MDC checkbox state
        const mdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(cb.closest('.mdc-checkbox'));
        if (mdcCheckbox) {
            mdcCheckbox.checked = categoryCheckbox.checked;
        }
    });
}

function updateCategoryCheckbox(reformCheckbox) {
    const category = reformCheckbox.dataset.category;
    // Find parent category checkbox (it has data-category but NOT class 'reformTypeCheckbox' in my new design, 
    // or I can give it a specific class like 'category-cb')
    const categoryCheckbox = document.querySelector(
        `input.category-cb[data-category="${category}"]`
    );

    if (!categoryCheckbox) return;

    const siblings = document.querySelectorAll(
        `.reformTypeCheckbox[data-category="${category}"]`
    );
    const allChecked = Array.from(siblings).every(cb => cb.checked);
    const someChecked = Array.from(siblings).some(cb => cb.checked);

    categoryCheckbox.checked = allChecked;
    categoryCheckbox.indeterminate = someChecked && !allChecked;
    
    // Sync MDC checkbox state
    const categoryMdcCheckbox = mdc.checkbox.MDCCheckbox.attachTo(categoryCheckbox.closest('.mdc-checkbox'));
    if (categoryMdcCheckbox) {
        categoryMdcCheckbox.checked = allChecked;
        categoryMdcCheckbox.indeterminate = someChecked && !allChecked;
    }
}

async function initializeReformTypeFilter() {
    try {
        const response = await fetch('/.netlify/functions/get-reform-types');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch reform types');
        }

        const container = document.getElementById('reformTypeCheckboxes');
        container.innerHTML = '';

        // Group Types by Category
        const byCategory = {};
        data.reformTypes.forEach(rt => {
            const cat = rt.category || 'Other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(rt);
        });

        // Define order
        const catOrder = ['Parking', 'Housing Typology', 'Zoning Category', 'Physical Dimension', 'Process', 'Building Code', 'Other'];

        // Render Groups
        catOrder.forEach(cat => {
            if (!byCategory[cat]) return;

            // 1. Create Header (Chevron + MDC Checkbox + Label)
            const catHeader = document.createElement('div');
            catHeader.className = 'category-header'; // Reuses region-header style via CSS

            // Chevron
            const chevron = document.createElement('i');
            chevron.className = 'material-icons chevron chevron-collapsed';
            chevron.textContent = 'expand_more';
            
            // MDC form field wrapper
            const categoryFormField = document.createElement('div');
            categoryFormField.className = 'mdc-form-field category-group';
            
            // MDC Checkbox wrapper
            const categoryCheckboxWrapper = document.createElement('div');
            categoryCheckboxWrapper.className = 'mdc-checkbox';
            
            // Parent Checkbox
            const parentCb = document.createElement('input');
            parentCb.type = 'checkbox';
            parentCb.className = 'mdc-checkbox__native-control category-cb';
            parentCb.checked = true;
            parentCb.id = `category-${cat}`;
            parentCb.dataset.category = cat;
            parentCb.addEventListener('change', (e) => updateReformHierarchy(e.target));

            const categoryBackground = document.createElement('div');
            categoryBackground.className = 'mdc-checkbox__background';
            categoryBackground.innerHTML = `
                <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
                    <path class="mdc-checkbox__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                </svg>
                <div class="mdc-checkbox__mixedmark"></div>
            `;
            
            const categoryRipple = document.createElement('div');
            categoryRipple.className = 'mdc-checkbox__ripple';
            
            categoryCheckboxWrapper.appendChild(parentCb);
            categoryCheckboxWrapper.appendChild(categoryBackground);
            categoryCheckboxWrapper.appendChild(categoryRipple);
            
            const categoryLabel = document.createElement('label');
            categoryLabel.htmlFor = `category-${cat}`;
            categoryLabel.textContent = cat;
            
            categoryFormField.appendChild(categoryCheckboxWrapper);
            categoryFormField.appendChild(categoryLabel);

            catHeader.appendChild(chevron);
            catHeader.appendChild(categoryFormField);
            container.appendChild(catHeader);
            
            // Initialize category MDC checkbox
            const categoryMdcCheckbox = new mdc.checkbox.MDCCheckbox(categoryCheckboxWrapper);
            const categoryMdcFormField = new mdc.formField.MDCFormField(categoryFormField);
            categoryMdcFormField.input = categoryMdcCheckbox;

            // 2. Create Reform Items Container (Hidden by default)
            const reformsContainer = document.createElement('div');
            reformsContainer.className = 'reforms-container container-hidden';

            // Items
            byCategory[cat].forEach(rt => {
                const formField = document.createElement('div');
                formField.className = 'mdc-form-field reform-item';
                
                // MDC Checkbox wrapper
                const checkboxWrapper = document.createElement('div');
                checkboxWrapper.className = 'mdc-checkbox';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'mdc-checkbox__native-control reformTypeCheckbox';
                checkbox.value = rt.code;
                checkbox.checked = true;
                checkbox.id = `reform-${rt.code}`;
                checkbox.dataset.category = cat;
                checkbox.dataset.color = rt.color_hex;
                checkbox.addEventListener('change', (e) => updateCategoryCheckbox(e.target));
                
                const background = document.createElement('div');
                background.className = 'mdc-checkbox__background';
                background.innerHTML = `
                    <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
                        <path class="mdc-checkbox__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                    </svg>
                    <div class="mdc-checkbox__mixedmark"></div>
                `;
                
                const ripple = document.createElement('div');
                ripple.className = 'mdc-checkbox__ripple';
                
                checkboxWrapper.appendChild(checkbox);
                checkboxWrapper.appendChild(background);
                checkboxWrapper.appendChild(ripple);
                
                const label = document.createElement('label');
                label.htmlFor = `reform-${rt.code}`;
                label.textContent = rt.name;
                
                // Color indicator
                if (rt.color_hex) {
                   formField.style.borderLeft = `3px solid ${rt.color_hex}`;
                   formField.style.paddingLeft = '8px';
                }

                formField.appendChild(checkboxWrapper);
                formField.appendChild(label);
                reformsContainer.appendChild(formField);
                
                // Initialize MDC checkbox
                const mdcCheckbox = new mdc.checkbox.MDCCheckbox(checkboxWrapper);
                const mdcFormField = new mdc.formField.MDCFormField(formField);
                mdcFormField.input = mdcCheckbox;
            });
            
            container.appendChild(reformsContainer);

            // Toggle click handler
            chevron.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = reformsContainer.classList.contains('container-hidden');
                if (isHidden) {
                    reformsContainer.classList.remove('container-hidden');
                    reformsContainer.classList.add('reforms-container-visible');
                    chevron.classList.remove('chevron-collapsed');
                    chevron.classList.add('chevron-expanded');
                } else {
                    reformsContainer.classList.add('container-hidden');
                    reformsContainer.classList.remove('reforms-container-visible');
                    chevron.classList.add('chevron-collapsed');
                    chevron.classList.remove('chevron-expanded');
                }
            });
        });
    } catch (error) {
        console.error('Error loading reform types:', error);
        showError('Failed to load reform types');
    }
}

function initializeLocationFilter() {
    locationCheckboxes.innerHTML = '';

    Object.keys(REGIONS).forEach(region => {
        // Region container
        const regionHeader = document.createElement('div');
        regionHeader.className = 'region-header';
        
        // Chevron toggle
        const chevron = document.createElement('i');
        chevron.className = 'material-icons chevron chevron-collapsed';
        chevron.textContent = 'expand_more';
        
        // Region MDC checkbox
        const regionFormField = document.createElement('div');
        regionFormField.className = 'mdc-form-field region-group';
        
        const regionCheckboxWrapper = document.createElement('div');
        regionCheckboxWrapper.className = 'mdc-checkbox';
        
        const regionCheckbox = document.createElement('input');
        regionCheckbox.type = 'checkbox';
        regionCheckbox.className = 'mdc-checkbox__native-control';
        regionCheckbox.id = `region-${region}`;
        regionCheckbox.dataset.region = region;
        regionCheckbox.addEventListener('change', (e) => updateLocationHierarchy(e.target));
        
        const regionBackground = document.createElement('div');
        regionBackground.className = 'mdc-checkbox__background';
        regionBackground.innerHTML = `
            <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
                <path class="mdc-checkbox__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
            </svg>
            <div class="mdc-checkbox__mixedmark"></div>
        `;
        
        const regionRipple = document.createElement('div');
        regionRipple.className = 'mdc-checkbox__ripple';
        
        regionCheckboxWrapper.appendChild(regionCheckbox);
        regionCheckboxWrapper.appendChild(regionBackground);
        regionCheckboxWrapper.appendChild(regionRipple);
        
        const regionLabel = document.createElement('label');
        regionLabel.htmlFor = `region-${region}`;
        regionLabel.textContent = region;
        
        regionFormField.appendChild(regionCheckboxWrapper);
        regionFormField.appendChild(regionLabel);
        
        // Header gets chevron + form field (chevron on left)
        regionHeader.appendChild(chevron);
        regionHeader.appendChild(regionFormField);
        locationCheckboxes.appendChild(regionHeader);

        // States container (hidden by default)
        const statesContainer = document.createElement('div');
        statesContainer.className = 'states-container container-hidden';

        REGIONS[region].forEach(state => {
            const stateFormField = document.createElement('div');
            stateFormField.className = 'mdc-form-field state-item';
            
            const stateCheckboxWrapper = document.createElement('div');
            stateCheckboxWrapper.className = 'mdc-checkbox';
            
            const stateCheckbox = document.createElement('input');
            stateCheckbox.type = 'checkbox';
            stateCheckbox.className = 'mdc-checkbox__native-control';
            stateCheckbox.id = `state-${state}`;
            stateCheckbox.dataset.state = state;
            stateCheckbox.dataset.region = region;
            stateCheckbox.addEventListener('change', (e) => updateRegionCheckbox(e.target));
            
            const stateBackground = document.createElement('div');
            stateBackground.className = 'mdc-checkbox__background';
            stateBackground.innerHTML = `
                <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
                    <path class="mdc-checkbox__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                </svg>
                <div class="mdc-checkbox__mixedmark"></div>
            `;
            
            const stateRipple = document.createElement('div');
            stateRipple.className = 'mdc-checkbox__ripple';
            
            stateCheckboxWrapper.appendChild(stateCheckbox);
            stateCheckboxWrapper.appendChild(stateBackground);
            stateCheckboxWrapper.appendChild(stateRipple);
            
            const stateLabel = document.createElement('label');
            stateLabel.htmlFor = `state-${state}`;
            stateLabel.textContent = state;
            
            stateFormField.appendChild(stateCheckboxWrapper);
            stateFormField.appendChild(stateLabel);
            statesContainer.appendChild(stateFormField);
            
            // Initialize MDC checkbox
            const mdcCheckbox = new mdc.checkbox.MDCCheckbox(stateCheckboxWrapper);
            const mdcFormField = new mdc.formField.MDCFormField(stateFormField);
            mdcFormField.input = mdcCheckbox;
        });
        
        locationCheckboxes.appendChild(statesContainer);
        
        // Initialize region checkbox
        const regionMdcCheckbox = new mdc.checkbox.MDCCheckbox(regionCheckboxWrapper);
        const regionMdcFormField = new mdc.formField.MDCFormField(regionFormField);
        regionMdcFormField.input = regionMdcCheckbox;

        // Toggle click handler
        chevron.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = statesContainer.classList.contains('container-hidden');
            if (isHidden) {
                statesContainer.classList.remove('container-hidden');
                statesContainer.classList.add('states-container-visible');
                chevron.classList.remove('chevron-collapsed');
                chevron.classList.add('chevron-expanded');
            } else {
                statesContainer.classList.add('container-hidden');
                statesContainer.classList.remove('states-container-visible');
                chevron.classList.add('chevron-collapsed');
                chevron.classList.remove('chevron-expanded');
            }
        });
    });
}
