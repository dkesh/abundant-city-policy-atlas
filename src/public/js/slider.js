// ============================================================================
// POPULATION SLIDER FUNCTIONALITY
// ============================================================================

// Convert linear position (0-100) to logarithmic population value
function logToPopulation(linearValue) {
    const logMin = Math.log10(MIN_POPULATION);
    const logMax = Math.log10(MAX_POPULATION);
    const logValue = logMin + (linearValue / 100) * (logMax - logMin);
    return Math.round(Math.pow(10, logValue));
}

// Convert population value to linear position (0-100)
function populationToLog(population) {
    const logMin = Math.log10(MIN_POPULATION);
    const logMax = Math.log10(MAX_POPULATION);
    const logValue = Math.log10(population);
    return ((logValue - logMin) / (logMax - logMin)) * 100;
}

function getSliderValues() {
    const slider = window.mdcComponents?.populationSlider;
    if (slider) {
        // slider.get(true) returns raw internal values (logarithmic scale), not formatted
        // Without true, it returns formatted strings which can't be parsed correctly
        const logValues = slider.get(true);
        const minLog = parseFloat(logValues[0]);
        const maxLog = parseFloat(logValues[1]);
        
        // Convert log values to population
        // If value is at logMin (3.0 = log10(1000)), treat as 0
        const logMin = Math.log10(1000);
        const logMax = Math.log10(MAX_POPULATION);
        
        let minPop = 0;
        if (Math.abs(minLog - logMin) > 0.01) {
            minPop = Math.round(Math.pow(10, minLog));
        }
        
        let maxPop = Math.round(Math.pow(10, maxLog));
        
        // Clamp to valid range
        minPop = Math.max(0, Math.min(MAX_POPULATION, minPop));
        maxPop = Math.max(0, Math.min(MAX_POPULATION, maxPop));
        
        return {
            min: minPop,
            max: maxPop
        };
    }
    return { min: 0, max: MAX_POPULATION };
}

function setSliderValues(min, max) {
    const slider = window.mdcComponents?.populationSlider;
    if (slider) {
        // Convert population values to logarithmic scale
        const logMin = Math.log10(1000); // Start at 1,000 for log scale
        const logMax = Math.log10(MAX_POPULATION);
        
        // Ensure values are within bounds
        const minPop = Math.max(0, Math.min(MAX_POPULATION, min || 0));
        const maxPop = Math.max(0, Math.min(MAX_POPULATION, max || MAX_POPULATION));
        
        // Convert to logarithmic scale
        // If min is 0, use logMin (represents 0-1000 range)
        const minLog = minPop <= 0 ? logMin : Math.max(logMin, Math.log10(Math.max(1000, minPop)));
        const maxLog = maxPop <= 0 ? logMax : Math.min(logMax, Math.log10(Math.max(1000, maxPop)));
        
        slider.set([minLog, maxLog]);
    }
}

function updatePopulationLabels() {
    const sliderValues = getSliderValues();
    const minFormatted = sliderValues.min.toLocaleString();
    const maxFormatted = sliderValues.max.toLocaleString();
    populationRangeLabel.textContent = `${minFormatted} to ${maxFormatted}`;
}

// Format function for noUiSlider tooltips and labels
function formatPopulation(value) {
    return Math.round(parseFloat(value)).toLocaleString();
}

function initializePopulationSlider() {
    const sliderEl = document.getElementById('populationSlider');
    if (sliderEl && typeof noUiSlider !== 'undefined') {
        // Use logarithmic scale: slider works with log values internally
        // This gives better granularity for small/medium cities (10K-500K range)
        const logMin = Math.log10(1000); // Start logarithmic scale at 1,000
        const logMax = Math.log10(MAX_POPULATION);
        
        // Initial values: 0 maps to logMin (1000), max maps to logMax
        const startMinLog = logMin; // Start at 1000 (log scale minimum)
        const startMaxLog = logMax;
        
        window.mdcComponents.populationSlider = noUiSlider.create(sliderEl, {
            // When format is defined, start expects values in the "from" format (population), not log values
            start: [0, MAX_POPULATION],
            connect: true,
            range: {
                min: logMin,
                max: logMax
            },
            // Disable tooltips - we'll show values in the label below instead
            tooltips: false,
            format: {
                to: function(value) {
                    // Convert logarithmic value back to population
                    const logVal = parseFloat(value);
                    const logMin = Math.log10(1000);
                    // If at logMin, display as 0
                    if (Math.abs(logVal - logMin) < 0.01) {
                        return '0';
                    }
                    const pop = Math.round(Math.pow(10, logVal));
                    return formatPopulation(pop);
                },
                from: function(value) {
                    // Convert population to logarithmic scale
                    const pop = parseFloat(value);
                    if (pop <= 0) return logMin;
                    // For values >= 1000, use the actual value; don't clamp to 1000
                    if (pop < 1000) return logMin;
                    return Math.log10(pop);
                }
            },
            // Ensure smooth interaction
            behaviour: 'drag',
            animate: false, // Disable animation during initialization
            animationDuration: 300
        });
        
        // Explicitly set handles to ensure correct position after slider is created
        // IMPORTANT: When format is defined, set() expects values in the "from" format (population), not log values
        // So we pass 0 (min) and MAX_POPULATION (max) as population values
        // Use requestAnimationFrame to ensure slider is fully initialized
        requestAnimationFrame(() => {
            window.mdcComponents.populationSlider.set([0, MAX_POPULATION], false); // false = no animation
            // Update labels after setting values
            updatePopulationLabels();
        });
        
        // Listen for slider updates to update labels
        window.mdcComponents.populationSlider.on('update', function(values) {
            updatePopulationLabels();
        });
        
        // Listen for end of drag to apply filters (debounced)
        let filterTimeout;
        window.mdcComponents.populationSlider.on('end', function() {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                applyFilters();
            }, 100);
        });
    }
}
