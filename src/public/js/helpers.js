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
