// ============================================================================
// SHARED HELPER FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format population in compact format (e.g., "1.5M", "150K")
 * @param {number} pop - Population number
 * @returns {string} Formatted population string
 */
/**
 * Get population category for cities/counties
 * Categories: small (< 50K), mid (50K-499K), large (500K-1.9M), very_large (>= 2M)
 */
function getCityPopulationCategory(population) {
    if (!population || population === 0) {
        return { label: 'Population Unknown', tooltip: null };
    }
    
    const pop = parseInt(population);
    if (pop < 50000) {
        return { label: 'Small city', tooltip: `Population ${pop.toLocaleString()}` };
    } else if (pop < 500000) {
        return { label: 'Mid-sized city', tooltip: `Population ${pop.toLocaleString()}` };
    } else if (pop < 2000000) {
        return { label: 'Large city', tooltip: `Population ${pop.toLocaleString()}` };
    } else {
        return { label: 'Very large city', tooltip: `Population ${pop.toLocaleString()}` };
    }
}

/**
 * Get population category for states
 * Categories: small (< 3M), medium (3M-10M), large (>= 10M)
 */
function getStatePopulationCategory(population) {
    if (!population || population === 0) {
        return { label: 'Population Unknown', tooltip: null };
    }
    
    const pop = parseInt(population);
    if (pop < 3000000) {
        return { label: 'Small state', tooltip: `Population ${pop.toLocaleString()}` };
    } else if (pop < 10000000) {
        return { label: 'Medium state', tooltip: `Population ${pop.toLocaleString()}` };
    } else {
        return { label: 'Large state', tooltip: `Population ${pop.toLocaleString()}` };
    }
}

function formatPopulationCompact(pop) {
    if (pop >= 1000000) {
        return (pop / 1000000).toFixed(1) + 'M';
    } else if (pop >= 1000) {
        return (pop / 1000).toFixed(0) + 'K';
    }
    return pop.toString();
}

/**
 * Pluralize place type (e.g., "city" -> "cities")
 * @param {string} type - Place type (city, county, state)
 * @returns {string} Pluralized form
 */
function pluralizePlaceType(type) {
    if (type === 'city') return 'cities';
    if (type === 'county') return 'counties';
    if (type === 'state') return 'states';
    return type + 's'; // fallback
}
