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

function customizeMapLabels() {
    if (!map || !map.isStyleLoaded()) return;
    
    // City/town/village labels only show at zoom 8+ (regional/city view)
    const CITY_LABEL_MIN_ZOOM = 8;
    
    const layers = map.getStyle().layers;
    
    layers.forEach(layer => {
        if (layer.type === 'symbol') {
            const layerId = layer.id.toLowerCase();
            
            // Hide country labels completely
            if (layerId.includes('country-label') || 
                layerId.includes('place-country') ||
                layerId.includes('admin-0')) {
                try {
                    map.setLayoutProperty(layer.id, 'visibility', 'none');
                } catch (e) {
                    console.log(`Could not hide layer: ${layer.id}`);
                }
            }
            
            // Show city/town/village labels only at higher zoom levels (less often when zoomed out)
            else if (layerId.includes('place-city') || 
                layerId.includes('place-town') || 
                layerId.includes('place-village') ||
                layerId.includes('place-neighbourhood') ||
                layerId.includes('place-suburb') ||
                (layerId.includes('place-label') && !layerId.includes('state') && !layerId.includes('province') && !layerId.includes('country'))) {
                try {
                    // setLayerZoomRange(id, minzoom, maxzoom): city labels only show from zoom 8 onward
                    map.setLayerZoomRange(layer.id, CITY_LABEL_MIN_ZOOM, 22);
                } catch (e) {
                    console.log(`Could not set zoom range for layer: ${layer.id}`);
                }
            }
            
            // Ensure state/province labels are visible
            else if (layerId.includes('place-state') || 
                layerId.includes('place-province') ||
                layerId.includes('state-label') ||
                layerId.includes('province-label') ||
                layerId.includes('admin-1')) {
                try {
                    map.setLayoutProperty(layer.id, 'visibility', 'visible');
                } catch (e) {
                    console.log(`Could not show layer: ${layer.id}`);
                }
            }
        }
    });
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
            style: 'mapbox://styles/mapbox/basic-v8',
            center: [-95.7129, 37.0902], // Center of US
            zoom: 3.5
        });

        map.on('load', () => {
            console.log('Map loaded successfully');
            customizeMapLabels();
            // Load map data (will call renderMap when ready)
            loadMapData();
        });

        // Also customize labels when style loads (in case style loads after map load)
        map.on('style.load', () => {
            customizeMapLabels();
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
    return (sel && sel.value) ? sel.value : 'none';
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
    
    // Hide legend when "None" is selected or when there are fewer than 2 distinct colors
    const dim = getMapColorDimension();
    if (dim === 'none' || !entries || entries.length < 2) {
        el.classList.add('container-hidden');
        el.innerHTML = '';
        return;
    }
    
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
    const dim = getMapColorDimension();
    
    // When "None" is selected, all states with reforms get the same color
    if (dim === 'none') {
        const reforms = stateReformsByState[stateCode];
        if (!reforms || reforms.length === 0) {
            return '#e0e0e0'; // Light gray for states without reforms
        }
        return '#3498db'; // Same color for all states with reforms
    }
    
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

// Load d3 library dynamically if not already loaded
function loadD3Library() {
    return new Promise((resolve, reject) => {
        // Check if d3 is already loaded with geo support
        if (typeof d3 !== 'undefined') {
            // Check for geo functions - they might be under d3.geo OR directly on d3
            // Full d3 bundle has them directly: d3.geoAlbersUsa, d3.geoPath, etc.
            const hasGeoFunctions = d3.geo || 
                d3.geoAlbersUsa || 
                d3.geoPath || 
                d3.geoAlbers || 
                d3.geoBounds;
            
            if (hasGeoFunctions) {
                resolve();
                return;
            }
            // Sometimes d3 loads but geo takes a moment - wait a bit
            let attempts = 0;
            const checkGeo = setInterval(() => {
                attempts++;
                const hasGeo = d3.geo || 
                    d3.geoAlbersUsa || 
                    d3.geoPath || 
                    d3.geoAlbers || 
                    d3.geoBounds;
                if (hasGeo) {
                    clearInterval(checkGeo);
                    resolve();
                } else if (attempts > 20) {
                    clearInterval(checkGeo);
                    // Check one more time - sometimes the functions are there but not immediately accessible
                    const finalCheck = d3.geoAlbersUsa || d3.geoPath || d3.geoAlbers || d3.geoBounds;
                    if (finalCheck) {
                        resolve();
                    } else {
                        console.log('d3 loaded but geo functions not found. Available d3 properties:', Object.keys(d3).slice(0, 50));
                        // Check if geo functions exist with different casing or naming
                        const geoKeys = Object.keys(d3).filter(k => k.toLowerCase().includes('geo'));
                        console.log('Geo-related keys found:', geoKeys);
                        if (geoKeys.length > 0) {
                            // Functions exist, just resolve - they're there even if not immediately accessible
                            resolve();
                        } else {
                            reject(new Error('d3 library loaded but geo functions are not available.'));
                        }
                    }
                }
            }, 50);
            return;
        }

        // Check if script is already being loaded
        if (document.querySelector('script[data-d3-loading]')) {
            // Wait for existing load to complete
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                const hasGeo = typeof d3 !== 'undefined' && (
                    d3.geo || 
                    d3.geoAlbersUsa || 
                    d3.geoPath || 
                    d3.geoAlbers || 
                    d3.geoBounds
                );
                if (hasGeo) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts > 100) {
                    clearInterval(checkInterval);
                    reject(new Error('Timeout waiting for d3 to load'));
                }
            }, 100);
            return;
        }

        // Load d3 dependencies first, then d3-geo
        // Then ensure d3 object exists with d3.geo
        loadD3Dependencies().then(() => {
            // Ensure d3 object exists and is accessible
            if (typeof d3 === 'undefined') {
                window.d3 = {};
            } else {
                window.d3 = d3; // Ensure window.d3 references the same object
            }
            
            // Load d3-geo from jsdelivr (sometimes works better than unpkg)
            // Try the UMD bundle that should attach to existing d3
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.0/dist/d3-geo.min.js';
            script.setAttribute('data-d3-loading', 'true');
            script.onload = () => {
                script.removeAttribute('data-d3-loading');
                // Wait and check for d3.geo
                let attempts = 0;
                const checkD3 = setInterval(() => {
                    attempts++;
                    // Check both window.d3 and global d3
                    const d3Obj = window.d3 || (typeof d3 !== 'undefined' ? d3 : null);
                    
                    // Check if d3 has the geo functions we need directly on d3 (not d3.geo)
                    // The code uses d3.geoAlbersUsa(), d3.geoPath(), etc.
                    // Full d3 bundle has them directly on d3, standalone d3-geo might have them under d3.geo
                    const hasGeoFunctions = d3Obj && (
                        d3Obj.geoAlbersUsa || 
                        d3Obj.geoPath || 
                        d3Obj.geoAlbers || 
                        d3Obj.geoBounds ||
                        (d3Obj.geo && (d3Obj.geo.path || d3Obj.geo.albersUsa || d3Obj.geo.geoPath))
                    );
                    
                    if (hasGeoFunctions) {
                        clearInterval(checkD3);
                        // If functions are under d3.geo, create aliases on d3 directly
                        if (d3Obj.geo && !d3Obj.geoPath) {
                            if (d3Obj.geo.path) d3Obj.geoPath = d3Obj.geo.path;
                            if (d3Obj.geo.albersUsa) d3Obj.geoAlbersUsa = d3Obj.geo.albersUsa;
                            if (d3Obj.geo.albers) d3Obj.geoAlbers = d3Obj.geo.albers;
                            if (d3Obj.geo.bounds) d3Obj.geoBounds = d3Obj.geo.bounds;
                        }
                        // Ensure global d3 is set
                        window.d3 = d3Obj;
                        if (typeof d3 === 'undefined') {
                            window.d3 = d3Obj;
                        }
                        resolve();
                    }
                    else if (attempts > 30) {
                        clearInterval(checkD3);
                        console.error('d3-geo loaded but d3.geo functions not found');
                        console.log('window.d3:', window.d3);
                        console.log('window.d3 keys:', window.d3 ? Object.keys(window.d3).slice(0, 50) : 'no d3');
                        console.log('global d3:', typeof d3, d3);
                        console.log('global d3 keys:', typeof d3 !== 'undefined' ? Object.keys(d3).slice(0, 50) : 'no d3');
                        // Check if d3 has any geo-related properties
                        if (window.d3) {
                            const geoKeys = Object.keys(window.d3).filter(k => k.toLowerCase().includes('geo'));
                            console.log('d3 keys containing "geo":', geoKeys);
                        }
                        // Check all window properties for geo functions
                        const windowGeoKeys = Object.keys(window).filter(k => k.toLowerCase().includes('geo'));
                        console.log('window properties containing "geo":', windowGeoKeys.slice(0, 20));
                        
                        // Try to manually find and attach geo functions
                        // d3-geo might have loaded but not attached to d3
                        const d3ToUse = d3Obj || window.d3 || (typeof d3 !== 'undefined' ? d3 : {});
                        
                        // Check all possible places where d3-geo functions might be
                        const checks = [
                            // Direct on d3 object
                            () => d3ToUse.geoPath || d3ToUse.geoAlbersUsa || d3ToUse.geoAlbers || d3ToUse.geoBounds,
                            // Under d3.geo
                            () => d3ToUse.geo && (d3ToUse.geo.path || d3ToUse.geo.albersUsa || d3ToUse.geo.albers || d3ToUse.geo.bounds),
                            // In global scope
                            () => window.geoPath || window.geoAlbersUsa || window.geoAlbers || window.geoBounds
                        ];
                        
                        let foundFunctions = false;
                        for (const check of checks) {
                            if (check()) {
                                foundFunctions = true;
                                break;
                            }
                        }
                        
                        if (foundFunctions) {
                            // Attach functions to d3 object if they're elsewhere
                            if (d3ToUse.geo && !d3ToUse.geoPath) {
                                if (d3ToUse.geo.path) d3ToUse.geoPath = d3ToUse.geo.path;
                                if (d3ToUse.geo.albersUsa) d3ToUse.geoAlbersUsa = d3ToUse.geo.albersUsa;
                                if (d3ToUse.geo.albers) d3ToUse.geoAlbers = d3ToUse.geo.albers;
                                if (d3ToUse.geo.bounds) d3ToUse.geoBounds = d3ToUse.geo.bounds;
                            }
                            
                            // Copy from window if needed
                            if (window.geoPath && !d3ToUse.geoPath) d3ToUse.geoPath = window.geoPath;
                            if (window.geoAlbersUsa && !d3ToUse.geoAlbersUsa) d3ToUse.geoAlbersUsa = window.geoAlbersUsa;
                            if (window.geoAlbers && !d3ToUse.geoAlbers) d3ToUse.geoAlbers = window.geoAlbers;
                            if (window.geoBounds && !d3ToUse.geoBounds) d3ToUse.geoBounds = window.geoBounds;
                            
                            // Ensure global d3 is set
                            window.d3 = d3ToUse;
                            if (typeof d3 === 'undefined') {
                                window.d3 = d3ToUse;
                            }
                            
                            console.log('Found and attached geo functions to d3');
                            resolve();
                            return;
                        }
                        
                        reject(new Error('d3-geo loaded but could not access or construct d3.geo. Check console for details.'));
                    }
                }, 100);
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('Failed to load d3-geo library'));
            };
            document.head.appendChild(script);
        }).catch(reject);
    });
}

// Load d3 dependencies (d3-path and d3-array) that d3-geo needs
function loadD3Dependencies() {
    return new Promise((resolve, reject) => {
        // Check if we need to load d3-path
        const loadD3Path = !document.querySelector('script[src*="d3-path"]');
        const loadD3Array = !document.querySelector('script[src*="d3-array"]');
        
        if (!loadD3Path && !loadD3Array) {
            resolve();
            return;
        }

        let loaded = 0;
        const total = (loadD3Path ? 1 : 0) + (loadD3Array ? 1 : 0);
        
        if (loadD3Path) {
            const pathScript = document.createElement('script');
            pathScript.src = 'https://cdn.jsdelivr.net/npm/d3-path@3.1.0/dist/d3-path.min.js';
            pathScript.onload = () => {
                loaded++;
                if (loaded === total) resolve();
            };
            pathScript.onerror = () => {
                console.warn('Failed to load d3-path, continuing anyway');
                loaded++;
                if (loaded === total) resolve();
            };
            document.head.appendChild(pathScript);
        }
        
        if (loadD3Array) {
            const arrayScript = document.createElement('script');
            arrayScript.src = 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/dist/d3-array.min.js';
            arrayScript.onload = () => {
                loaded++;
                if (loaded === total) resolve();
            };
            arrayScript.onerror = () => {
                console.warn('Failed to load d3-array, continuing anyway');
                loaded++;
                if (loaded === total) resolve();
            };
            document.head.appendChild(arrayScript);
        }
    });
}

async function printMap() {
    // Check if we have state boundary data
    if (!stateBoundariesGeoJSON || !stateBoundariesGeoJSON.features || stateBoundariesGeoJSON.features.length === 0) {
        console.warn('No state boundary data available for export. Loading boundaries...');
        // Try to load boundaries if we don't have them
        if (typeof loadAndRenderStateBoundaries === 'function') {
            await loadAndRenderStateBoundaries();
        }
        if (!stateBoundariesGeoJSON || !stateBoundariesGeoJSON.features || stateBoundariesGeoJSON.features.length === 0) {
            console.error('Could not load state boundaries for export');
            if (typeof showToast === 'function') {
                showToast('Unable to export map: no state data available');
            }
            return;
        }
    }

    // Load d3 library if not already available
    try {
        await loadD3Library();
    } catch (error) {
        console.error('Failed to load d3 library:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to load map export library. Please try again.');
        }
        return;
    }

    try {
        // Create SVG map with just US/Canada states
        const svg = createSimpleStateMapSVG(stateBoundariesGeoJSON);
        
        // Convert SVG to data URL
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        // Create a canvas to convert SVG to PNG
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Use high resolution for export
            const scale = 2; // 2x resolution
            canvas.width = 1200 * scale;
            canvas.height = 800 * scale;
            const ctx = canvas.getContext('2d');
            
            // Scale context for high resolution
            ctx.scale(scale, scale);
            
            // Draw white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 1200, 800);
            
            // Draw the SVG image
            ctx.drawImage(img, 0, 0, 1200, 800);
            
            // Convert to PNG and download
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = 'map-export.png';
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                URL.revokeObjectURL(svgUrl);
            }, 'image/png');
        };
        
        img.onerror = () => {
            console.error('Failed to load SVG for export');
            URL.revokeObjectURL(svgUrl);
            // Fallback: download as SVG directly
            const link = document.createElement('a');
            link.download = 'map-export.svg';
            link.href = svgUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(svgUrl);
        };
        
        img.src = svgUrl;
        
    } catch (error) {
        console.error('Error exporting map:', error);
        if (typeof showToast === 'function') {
            showToast('Error exporting map: ' + error.message);
        }
    }
}

function createSimpleStateMapSVG(geoJSON) {
    const width = 1200;
    const height = 800;
    
    // Filter to only US and Canada (exclude Mexico, oceans, etc.)
    const usCaFeatures = geoJSON.features.filter(f => {
        const country = f.properties.country;
        return country === 'US' || country === 'CA';
    });
    
    if (usCaFeatures.length === 0) {
        console.warn('No US or Canada features found in GeoJSON');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#666">No map data available</text></svg>`;
    }
    
    // Create filtered GeoJSON
    const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: usCaFeatures
    };
    
    // Determine which projection to use
    const hasUS = usCaFeatures.some(f => f.properties.country === 'US');
    const hasCA = usCaFeatures.some(f => f.properties.country === 'CA');
    
    let projection;
    
    if (hasUS && hasCA) {
        // Albers USA works well for both US and Canada
        projection = d3.geoAlbersUsa();
    } else if (hasUS) {
        // Albers USA for US only
        projection = d3.geoAlbersUsa();
    } else {
        // For Canada only, use Albers with Canada-specific parameters
        projection = d3.geoAlbers()
            .parallels([50, 60])
            .rotate([-95, 0]);
    }
    
    // Set initial projection parameters
    // Albers USA has built-in defaults that work well for US and US+Canada
    if (hasUS) {
        // Albers USA - use default scale and center, adjust translate
        projection.scale(1070).translate([width / 2, height / 2]);
    } else {
        // For Canada only with custom Albers
        const bounds = d3.geoBounds(filteredGeoJSON);
        const [[x0, y0], [x1, y1]] = bounds;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const x = (x0 + x1) / 2;
        const y = (y0 + y1) / 2;
        const scale = 0.9 / Math.max(dx / (width - 40), dy / (height - 40));
        projection.scale(scale * 1000).translate([width / 2, height / 2]).center([x, y]);
    }
    
    // Try to use fitSize if available (d3-geo v3+)
    if (typeof projection.fitSize === 'function') {
        try {
            projection.fitSize([width - 40, height - 40], filteredGeoJSON);
        } catch (e) {
            // If fitSize fails, use the manually set values above
            console.log('fitSize not available, using manual projection');
        }
    }
    
    const path = d3.geoPath().projection(projection);
    
    // Build SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    
    // White background
    svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
    
    // Render each state/province
    usCaFeatures.forEach(feature => {
        const stateCode = feature.properties.state_code;
        const color = getStateColor(stateCode);
        const hasReforms = stateReformsByState[stateCode] ? stateReformsByState[stateCode].length > 0 : false;
        const opacity = hasReforms ? 0.6 : 0.2;
        
        // Render the path
        const pathData = path(feature);
        if (pathData) {
            svg += `<path d="${pathData}" fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.9"/>`;
        }
    });
    
    // Add state/province labels
    usCaFeatures.forEach(feature => {
        const stateCode = feature.properties.state_code;
        if (!stateCode) return; // Skip if no state code
        
        // Calculate centroid of the state/province
        const centroid = path.centroid(feature);
        if (centroid && !isNaN(centroid[0]) && !isNaN(centroid[1])) {
            const [x, y] = centroid;
            // Use two-letter state code (or province code)
            const label = stateCode.length === 2 ? stateCode : stateCode.substring(0, 2).toUpperCase();
            
            // Add text label with a subtle background for readability
            svg += `<circle cx="${x}" cy="${y}" r="12" fill="rgba(255,255,255,0.8)" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>`;
            svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#333">${escapeHtml(label)}</text>`;
        }
    });
    
    svg += '</svg>';
    
    return svg;
}
