// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let allReforms = [];
let filteredReforms = [];
let map = null;
let mapMarkers = {};
let clusterIndex = null;
let reformsGeoJSON = [];
let stateBoundariesGeoJSON = null;
let stateReformsByState = {}; // Maps state_code to array of state-level reforms
let stateBoundariesSourceAdded = false;
let lastMapReforms = null; // Cached map data for re-render when "Color by" changes

// Pagination state for infinite scroll
let currentOffset = 0;
let hasMoreReforms = false;
let isLoadingMore = false;
let infiniteScrollInstance = null;
let currentFilterParams = null; // Store current filter params for pagination

const REGIONS = {
    'Northeast': ['Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'Rhode Island', 'Vermont', 'New Jersey', 'New York', 'Pennsylvania'],
    'Midwest': ['Illinois', 'Indiana', 'Michigan', 'Ohio', 'Wisconsin', 'Iowa', 'Kansas', 'Minnesota', 'Missouri', 'Nebraska', 'North Dakota', 'South Dakota'],
    'South': ['Delaware', 'Florida', 'Georgia', 'Maryland', 'North Carolina', 'South Carolina', 'Virginia', 'West Virginia', 'Alabama', 'Kentucky', 'Mississippi', 'Tennessee', 'Arkansas', 'Louisiana', 'Oklahoma', 'Texas', 'District of Columbia'],
    'West': ['Arizona', 'Colorado', 'Idaho', 'Montana', 'Nevada', 'New Mexico', 'Utah', 'Wyoming', 'Alaska', 'California', 'Hawaii', 'Oregon', 'Washington'],
    'US Territories': ['Puerto Rico', 'US Virgin Islands', 'Guam', 'American Samoa', 'Northern Mariana Islands'],
    'Canada': ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Northwest Territories', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon']
};

const MIN_POPULATION = 0;
const MAX_POPULATION = 20000000; // 20 million - nearest million above largest cities
