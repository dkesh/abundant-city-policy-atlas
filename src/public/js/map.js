// ============================================================================
// MAP FUNCTIONALITY
// ============================================================================

function switchView(view, skipUrlUpdate = false) {
    const views = [listView, mapView, explorePlacesView, contributeView, aboutView];
    const tabs = [listViewTab, mapViewTab, explorePlacesViewTab, contributeViewTab, aboutViewTab];
    views.forEach(el => { if (el) el.classList.remove('active'); });
    tabs.forEach(el => { if (el) el.classList.remove('active'); });
    
    // Show/hide results banner based on view
    if (view === 'about' || view === 'explorePlaces' || view === 'contribute') {
        if (resultsInfo) {
            resultsInfo.classList.add('container-hidden');
        }
    } else {
        // Results banner visibility is managed elsewhere for list/map views
    }
    
    // Map view names to tab indices for MDC tab bar
    const viewToTabIndex = {
        'list': 0,
        'map': 1,
        'explorePlaces': 2,
        'contribute': 3,
        'about': 4
    };
    
    // Activate the correct tab in the MDC tab bar
    if (window.mdcComponents?.tabBar && viewToTabIndex.hasOwnProperty(view)) {
        window.mdcComponents.tabBar.activateTab(viewToTabIndex[view]);
    }
    
    if (view === 'list') {
        listView?.classList.add('active');
        listViewTab?.classList.add('active');
        if (!skipUrlUpdate) {
            window.history.pushState({}, '', '/list');
        }
    } else if (view === 'map') {
        mapView?.classList.add('active');
        mapViewTab?.classList.add('active');
        // Show loading indicator when switching to map view
        showMapLoading(true);
        initializeMap();
        // If map is already initialized, reload data
        if (map && map.isStyleLoaded() && typeof loadMapData === 'function') {
            loadMapData();
        }
        if (!skipUrlUpdate) {
            window.history.pushState({}, '', '/map');
        }
    } else if (view === 'explorePlaces') {
        explorePlacesView?.classList.add('active');
        explorePlacesViewTab?.classList.add('active');
        // Initialize explore places list view if not already loaded
        if (typeof loadExplorePlacesList === 'function') {
            loadExplorePlacesList();
        }
        if (!skipUrlUpdate) {
            window.history.pushState({}, '', '/explore-places');
        }
    } else if (view === 'contribute') {
        contributeView?.classList.add('active');
        contributeViewTab?.classList.add('active');
        if (!skipUrlUpdate) {
            window.history.pushState({}, '', '/contribute');
        }
    } else if (view === 'about') {
        aboutView?.classList.add('active');
        aboutViewTab?.classList.add('active');
        // Load sources when About tab is opened
        if (typeof loadSources === 'function') {
            loadSources();
        }
        // Load reform types when About tab is opened
        if (typeof loadReformTypes === 'function') {
            loadReformTypes();
        }
        if (!skipUrlUpdate) {
            window.history.pushState({}, '', '/about');
        }
    }
}

function showMapLoading(show) {
    const loadingOverlay = document.getElementById('mapLoadingOverlay');
    if (loadingOverlay) {
        if (show) {
            loadingOverlay.classList.remove('container-hidden');
        } else {
            loadingOverlay.classList.add('container-hidden');
        }
    }
}

function closeMapOverlay() {
    if (typeof mapOverlay !== 'undefined' && mapOverlay) {
        mapOverlay.classList.remove('active');
    }
}

async function loadFullReformDataForPlace(placeId, lightweightReforms) {
    // First, check if we have full data in filteredReforms
    if (typeof filteredReforms !== 'undefined' && filteredReforms.length > 0) {
        const fullReformsForPlace = filteredReforms.filter(r => r.place.id === placeId);
        if (fullReformsForPlace.length > 0) {
            showPlaceOverlay(placeId, fullReformsForPlace);
            return;
        }
    }
    
    // If not, try to fetch full data for these specific reforms
    // For now, use lightweight data - the overlay will work with minimal info
    // In the future, we could add a parameter to get-reforms to fetch by IDs
    showPlaceOverlay(placeId, lightweightReforms);
}

function initializeMap() {
    if (map) return; // Already initialized

    // Show loading indicator immediately
    showMapLoading(true);

    // Note: Requires Mapbox GL token
    try {
        mapboxgl.accessToken = 'pk.eyJ1IjoiZGFua2VzaGV0IiwiYSI6ImNtazIwdzhpdTBiOWkzZXB3cjEwNmtlbzEifQ.CJh1ehe_-ZmT_SqZxBeL6g'; 
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [-95.7129, 37.0902], // Center of US
            zoom: 3.5
        });

        map.on('load', () => {
            console.log('Map loaded successfully');
            // Load map data (will call renderMap when ready)
            loadMapData();
        });

        // Update markers when map is moved or zoomed
        map.on('moveend', () => {
            updateMarkersInViewport();
        });
    } catch (e) {
        console.log('Mapbox GL not available. Showing list-only mode.');
        mapView.innerHTML = '<div class="map-error-message">Map view requires Mapbox GL. Please configure your Mapbox token in the code to enable this feature.</div>';
        showMapLoading(false);
    }
}

async function loadMapData() {
    if (!map || !map.isStyleLoaded()) {
        // Wait for map to be ready
        map.once('style.load', () => loadMapData());
        return;
    }

    // Close any open overlays when reloading
    closeMapOverlay();

    // Show loading indicator
    showMapLoading(true);

    try {
        // Build query string from current filters
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
        if (limitations.scope !== 'all') params.append('scope_limitation', limitations.scope);
        if (limitations.land_use !== 'all') params.append('land_use_limitation', limitations.land_use);
        if (limitations.requirements !== 'all') params.append('requirements_limitation', limitations.requirements);
        if (limitations.intensity !== 'all') params.append('intensity_limitation', limitations.intensity);

        const query = params.toString();
        const url = query ? `/.netlify/functions/get-reforms-map?${query}` : '/.netlify/functions/get-reforms-map';

        // Fetch lightweight reform data for map
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch reforms for map');
        }

        // Store lightweight data for map rendering (also used when switching "Color by" without refetch)
        // Note: This is separate from filteredReforms which has full data for list view
        const mapReforms = data.reforms || [];
        lastMapReforms = mapReforms;
        
        // Render map with the lightweight data
        await renderMap(mapReforms);
        
        // Hide loading indicator
        showMapLoading(false);
    } catch (error) {
        console.error('Error loading map data:', error);
        showMapLoading(false);
        // Optionally show error message to user
    }
}

function getMapColorDimension() {
    const sel = document.getElementById('mapColorBy');
    return (sel && sel.value) ? sel.value : 'reform_type';
}

/** Returns { color, label } for a reform based on the current "Color by" dimension. */
function getColorForDimension(reform) {
    const dim = getMapColorDimension();
    const r = reform.reform;

    if (dim === 'reform_type') {
        const color = getMarkerColor(r.type, r.color);
        const label = r.type_name || r.type || 'Other';
        return { color, label };
    }

    if (dim === 'intensity') {
        const v = (r.intensity || 'unknown').toLowerCase();
        if (v === 'complete') return { color: '#27ae60', label: 'Complete' };
        if (v === 'partial') return { color: '#f39c12', label: 'Partial' };
        return { color: '#95a5a6', label: 'Unknown / N/A' };
    }

    if (dim === 'year') {
        const y = r.adoption_year;
        if (y == null) return { color: '#95a5a6', label: 'Unknown' };
        if (y < 2020) return { color: '#3498db', label: 'Before 2020' };
        if (y <= 2021) return { color: '#9b59b6', label: '2020–2021' };
        if (y <= 2023) return { color: '#e67e22', label: '2022–2023' };
        return { color: '#e74c3c', label: '2024+' };
    }

    if (dim === 'status') {
        const s = (r.status || 'adopted').toLowerCase();
        if (s === 'adopted') return { color: '#27ae60', label: 'Adopted' };
        if (s === 'proposed') return { color: '#3498db', label: 'Proposed' };
        if (s === 'failed') return { color: '#e74c3c', label: 'Failed' };
        return { color: '#95a5a6', label: (r.status || 'Adopted') };
    }

    return { color: getCssVariable('--color-secondary'), label: 'Other' };
}

function updateMapLegend(entries) {
    const el = document.getElementById('mapLegend');
    if (!el) return;
    if (!entries || entries.length < 2) {
        el.classList.add('container-hidden');
        el.innerHTML = '';
        return;
    }
    const dim = getMapColorDimension();
    const titles = { reform_type: 'Reform type', intensity: 'Intensity', year: 'Year passed', status: 'Reform status' };
    const title = titles[dim] || 'Legend';
    el.innerHTML = `
        <div class="map-legend-title">${title}</div>
        <ul class="map-legend-list">
            ${entries.map(({ label, color }) =>
                `<li class="map-legend-item"><span class="map-legend-swatch" style="background-color:${color}"></span>${escapeHtml(label)}</li>`
            ).join('')}
        </ul>
    `;
    el.classList.remove('container-hidden');
}

async function renderMap(mapReforms = null) {
    if (!map || !map.isStyleLoaded()) return;

    // Use provided mapReforms or fall back to filteredReforms (for backwards compatibility)
    const reformsToRender = mapReforms || filteredReforms;
    
    if (!reformsToRender || reformsToRender.length === 0) {
        showMapLoading(false);
        updateMapLegend(null);
        return;
    }

    // Check if there are any state-level reforms
    const hasStateLevelReforms = reformsToRender.some(reform => reform.place.type === 'state');
    
    // Group state-level reforms by state
    stateReformsByState = {};
    reformsToRender.forEach(reform => {
        if (reform.place.type === 'state') {
            const stateCode = reform.place.state_code || reform.place.state;
            if (!stateReformsByState[stateCode]) {
                stateReformsByState[stateCode] = [];
            }
            stateReformsByState[stateCode].push(reform);
        }
    });
    
    // If state-level reforms exist, load and render state boundaries
    if (hasStateLevelReforms) {
        await loadAndRenderStateBoundaries();
    } else {
        // Remove state boundaries if they exist
        removeStateBoundaries();
    }

    // Group reforms by place and create GeoJSON for markers (city/county only)
    const placeReforms = {};
    reformsGeoJSON = [];
    const legendEntries = new Map(); // key: "label|color", value: { label, color }

    reformsToRender.forEach(reform => {
        // Only include city/county reforms for markers (state-level reforms are shown as polygons)
        if (reform.place.type !== 'state') {
            const placeKey = reform.place.id;
            if (!placeReforms[placeKey]) {
                placeReforms[placeKey] = [];
            }
            placeReforms[placeKey].push(reform);
        }
    });

    // Convert to GeoJSON features for clustering (use current "Color by" dimension)
    Object.entries(placeReforms).forEach(([placeId, reforms]) => {
        const place = reforms[0].place;
        if (place.latitude && place.longitude) {
            const { color, label } = getColorForDimension(reforms[0]);
            const k = `${label}|${color}`;
            if (!legendEntries.has(k)) legendEntries.set(k, { label, color });
            reformsGeoJSON.push({
                type: 'Feature',
                properties: {
                    placeId: placeId,
                    reforms: reforms,
                    reformCount: reforms.length,
                    color: color
                },
                geometry: {
                    type: 'Point',
                    coordinates: [place.longitude, place.latitude]
                }
            });
        }
    });

    // Add state-level legend entries (same dimension)
    Object.values(stateReformsByState).forEach(reforms => {
        if (reforms.length > 0) {
            const { color, label } = getColorForDimension(reforms[0]);
            const k = `${label}|${color}`;
            if (!legendEntries.has(k)) legendEntries.set(k, { label, color });
        }
    });

    // Initialize Supercluster
    clusterIndex = new Supercluster({
        radius: 60,
        maxZoom: 16,
        minZoom: 0,
        extent: 512,
        nodeSize: 64
    });
    
    clusterIndex.load(reformsGeoJSON);
    
    // Update markers for current viewport
    updateMarkersInViewport();

    // Show legend when multiple distinct colors
    updateMapLegend([...legendEntries.values()]);
}

function updateMarkersInViewport() {
    if (!map || !clusterIndex) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();
    
    // Get clusters and points in current viewport
    const clusters = clusterIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        Math.floor(zoom)
    );

    // Clear existing markers
    Object.values(mapMarkers).forEach(marker => marker.remove());
    mapMarkers = {};

    // Add new markers
    clusters.forEach((cluster, idx) => {
        const [lng, lat] = cluster.geometry.coordinates;
        const props = cluster.properties;

        const el = document.createElement('div');
        el.className = 'marker marker-base';

        if (cluster.properties.cluster) {
            // This is a cluster
            const pointCount = cluster.properties.point_count;
            let sizeClass = 'marker-cluster-small';
            if (pointCount >= 50) {
                sizeClass = 'marker-cluster-large';
            } else if (pointCount >= 10) {
                sizeClass = 'marker-cluster-medium';
            }
            
            el.classList.add('marker-cluster', sizeClass);
            el.textContent = pointCount;

            // Zoom into cluster on click
            el.addEventListener('click', () => {
                const clusterId = cluster.id;
                const zoom = clusterIndex.getClusterExpansionZoom(clusterId);
                map.easeTo({
                    center: [lng, lat],
                    zoom: zoom
                });
            });
        } else {
            // This is an individual place marker
            el.classList.add('marker-place');
            el.style.backgroundColor = props.color;

            el.addEventListener('click', async () => {
                // If we only have lightweight data, fetch full data for the overlay
                if (props.reforms && props.reforms.length > 0 && !props.reforms[0].reform.summary) {
                    // Load full reform data for this place
                    await loadFullReformDataForPlace(props.placeId, props.reforms);
                } else {
                    showPlaceOverlay(props.placeId, props.reforms);
                }
            });
        }

        const marker = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .addTo(map);

        mapMarkers[`marker-${idx}`] = marker;
    });
}

function getCssVariable(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

function getMarkerColor(reformType, reformColor = null) {
    // Use reform color if available
    if (reformColor) {
        return reformColor;
    }
    
    // Fallback to type-based colors from CSS variables
    // Handle both prefixed (prn:rm_min) and non-prefixed (rm_min) types
    const type = reformType.includes(':') ? reformType.split(':')[1] : reformType;
    switch (type) {
        case 'rm_min': return getCssVariable('--color-reform-rm-min');
        case 'reduce_min': return getCssVariable('--color-reform-reduce-min');
        case 'add_max': return getCssVariable('--color-reform-add-max');
        case 'adu': return getCssVariable('--color-reform-adu');
        case 'plex': return getCssVariable('--color-reform-plex');
        case 'tod': return getCssVariable('--color-reform-tod');
        case 'other': return getCssVariable('--color-reform-other');
        default: return getCssVariable('--color-secondary');
    }
}

function showPlaceOverlay(placeId, reforms) {
    const place = reforms[0].place;
    const countryDisplay = place.country === 'US' ? 'USA' : place.country === 'CA' ? 'Canada' : place.country || '';
    const countrySuffix = countryDisplay ? `, ${countryDisplay}` : '';
    document.getElementById('overlayHeader').textContent = `${place.name}, ${place.state}${countrySuffix} (${reforms.length} reforms)`;
    
    const overlayCards = document.getElementById('overlayCards');
    overlayCards.innerHTML = '';
    reforms.forEach(reform => {
        const card = createReformCard(reform, true);
        overlayCards.appendChild(card);
        
        // Add event listener for report card button
        const reportCardBtn = card.querySelector('.view-policy-profile-btn');
        if (reportCardBtn) {
            reportCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const placeId = reportCardBtn.getAttribute('data-place-id');
                if (placeId && typeof loadPolicyProfileDetail === 'function') {
                    switchView('explorePlaces');
                    loadPolicyProfileDetail(parseInt(placeId), 'map');
                }
            });
        }
        
        // Add event listener for expand button
        const expandButton = card.querySelector('.expand-reform-button');
        if (expandButton && typeof showExpandedReformView === 'function') {
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

    mapOverlay.classList.add('active');
}

function showStateOverlay(stateName, stateCode, reforms) {
    const countryDisplay = reforms[0]?.place?.country === 'US' ? 'USA' : reforms[0]?.place?.country === 'CA' ? 'Canada' : reforms[0]?.place?.country || '';
    const countrySuffix = countryDisplay ? `, ${countryDisplay}` : '';
    document.getElementById('overlayHeader').textContent = `${stateName}${countrySuffix} (${reforms.length} reforms)`;
    
    const overlayCards = document.getElementById('overlayCards');
    overlayCards.innerHTML = '';
    reforms.forEach(reform => {
        const card = createReformCard(reform, true);
        overlayCards.appendChild(card);
        
        // Add event listener for report card button
        const reportCardBtn = card.querySelector('.view-policy-profile-btn');
        if (reportCardBtn) {
            reportCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const placeId = reportCardBtn.getAttribute('data-place-id');
                if (placeId && typeof loadPolicyProfileDetail === 'function') {
                    switchView('explorePlaces');
                    loadPolicyProfileDetail(parseInt(placeId), 'map');
                }
            });
        }
        
        // Add event listener for expand button
        const expandButton = card.querySelector('.expand-reform-button');
        if (expandButton && typeof showExpandedReformView === 'function') {
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

    mapOverlay.classList.add('active');
}

function groupStateLevelReforms() {
    // This function is now handled inline in renderMap
    // Keeping for backwards compatibility if needed elsewhere
    const stateReforms = {};
    
    const reformsToCheck = filteredReforms.length > 0 ? filteredReforms : [];
    reformsToCheck.forEach(reform => {
        if (reform.place.type === 'state') {
            const stateCode = reform.place.state_code || reform.place.state;
            if (!stateReforms[stateCode]) {
                stateReforms[stateCode] = [];
            }
            stateReforms[stateCode].push(reform);
        }
    });
    
    return stateReforms;
}

function getStateColor(stateCode) {
    const reforms = stateReformsByState[stateCode];
    if (!reforms || reforms.length === 0) {
        return '#e0e0e0'; // Light gray for states without reforms
    }
    return getColorForDimension(reforms[0]).color;
}

async function loadAndRenderStateBoundaries() {
    try {
        // Ensure map is loaded
        if (!map.isStyleLoaded()) {
            map.once('style.load', () => loadAndRenderStateBoundaries());
            return;
        }
        
        // Fetch state boundaries from API
        const response = await fetch('/.netlify/functions/get-state-boundaries');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success || !data.data) {
            throw new Error(data.error || 'Failed to fetch state boundaries');
        }
        
        stateBoundariesGeoJSON = data.data;
        
        // Add color property to each feature based on reforms
        stateBoundariesGeoJSON.features.forEach(feature => {
            const stateCode = feature.properties.state_code;
            feature.properties.fillColor = getStateColor(stateCode);
            feature.properties.hasReforms = stateReformsByState[stateCode] ? stateReformsByState[stateCode].length > 0 : false;
            feature.properties.reforms = stateReformsByState[stateCode] || [];
        });
        
        // Add or update the source
        if (!stateBoundariesSourceAdded || !map.getSource('state-boundaries')) {
            map.addSource('state-boundaries', {
                type: 'geojson',
                data: stateBoundariesGeoJSON
            });
            stateBoundariesSourceAdded = true;
        } else {
            map.getSource('state-boundaries').setData(stateBoundariesGeoJSON);
        }
        
        // Remove existing layers if they exist (to re-add in correct order)
        if (map.getLayer('state-borders')) {
            map.removeLayer('state-borders');
        }
        if (map.getLayer('state-fill')) {
            map.removeLayer('state-fill');
        }
        
        // Add fill layer first (bottom layer)
        map.addLayer({
            id: 'state-fill',
            type: 'fill',
            source: 'state-boundaries',
            paint: {
                'fill-color': [
                    'get',
                    'fillColor'
                ],
                'fill-opacity': [
                    'case',
                    ['get', 'hasReforms'],
                    0.6, // 60% opacity for states with reforms
                    0.2  // 20% opacity for states without reforms
                ]
            }
        });
        
        // Add border layer on top of fill
        map.addLayer({
            id: 'state-borders',
            type: 'line',
            source: 'state-boundaries',
            paint: {
                'line-color': '#ffffff',
                'line-width': 1,
                'line-opacity': 0.8
            }
        });
        
        // Add click handler for state polygons (only once)
        if (!map._stateClickHandlerAdded) {
            map.on('click', 'state-fill', (e) => {
                // Only show overlay if clicking on state polygon (not on a marker)
                // Markers are HTML elements rendered on top, so if we get here, it's a state click
                e.originalEvent.stopPropagation(); // Prevent event bubbling
                const feature = e.features[0];
                const stateCode = feature.properties.state_code;
                const stateName = feature.properties.state_name;
                const reforms = stateReformsByState[stateCode] || [];
                
                if (reforms.length > 0) {
                    showStateOverlay(stateName, stateCode, reforms);
                }
            });
            
            // Change cursor on hover
            map.on('mouseenter', 'state-fill', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            
            map.on('mouseleave', 'state-fill', () => {
                map.getCanvas().style.cursor = '';
            });
            
            map._stateClickHandlerAdded = true;
        }
        
    } catch (error) {
        console.error('Error loading state boundaries:', error);
        // Don't throw - allow markers to still render
    }
}

function removeStateBoundaries() {
    // Remove layers if they exist
    if (map.getLayer('state-fill')) {
        map.removeLayer('state-fill');
    }
    if (map.getLayer('state-borders')) {
        map.removeLayer('state-borders');
    }
    
    // Remove source if it exists
    if (map.getSource('state-boundaries')) {
        map.removeSource('state-boundaries');
    }
    
    stateBoundariesSourceAdded = false;
    stateBoundariesGeoJSON = null;
}

function printMap() {
    // Check if map is initialized
    if (!map || !map.isStyleLoaded()) {
        console.warn('Map is not initialized or not ready for export');
        return;
    }

    // Function to capture and download the map as PNG
    const captureAndDownload = () => {
        try {
            // Get the map canvas
            const canvas = map.getCanvas();
            if (!canvas) {
                console.error('Could not get map canvas');
                return;
            }

            // Convert canvas to data URL (standard resolution, not high-res)
            const dataUrl = canvas.toDataURL('image/png');

            // Verify we got valid image data
            if (!dataUrl || dataUrl === 'data:,') {
                console.error('Failed to capture map canvas - empty data URL');
                return;
            }

            // Create a temporary anchor element to trigger download
            const link = document.createElement('a');
            link.download = 'map-export.png';
            link.href = dataUrl;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error exporting map:', error);
        }
    };

    // Wait for map to be fully rendered before capturing
    // The 'idle' event fires when the map has finished rendering all tiles
    map.once('idle', captureAndDownload);
    
    // Trigger a repaint to ensure the map is up to date
    // This ensures all layers and tiles are rendered before we capture
    map.triggerRepaint();
}
