// ============================================================================
// MAP FUNCTIONALITY
// ============================================================================

function switchView(view) {
    // Hide all views
    listView.classList.remove('active');
    mapView.classList.remove('active');
    aboutView.classList.remove('active');
    
    // Remove active from all tabs
    listViewTab.classList.remove('active');
    mapViewTab.classList.remove('active');
    aboutViewTab.classList.remove('active');
    
    // Show/hide results banner based on view
    if (view === 'about') {
        if (resultsInfo) {
            resultsInfo.classList.add('container-hidden');
        }
    } else {
        // Results banner visibility is managed elsewhere for list/map views
    }
    
    if (view === 'list') {
        listView.classList.add('active');
        listViewTab.classList.add('active');
    } else if (view === 'map') {
        mapView.classList.add('active');
        mapViewTab.classList.add('active');
        initializeMap();
    } else if (view === 'about') {
        aboutView.classList.add('active');
        aboutViewTab.classList.add('active');
        // Load sources when About tab is opened
        if (typeof loadSources === 'function') {
            loadSources();
        }
    }
}

function initializeMap() {
    if (map) return; // Already initialized

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
            renderMap();
        });

        // Update markers when map is moved or zoomed
        map.on('moveend', () => {
            updateMarkersInViewport();
        });
    } catch (e) {
        console.log('Mapbox GL not available. Showing list-only mode.');
        mapView.innerHTML = '<div class="map-error-message">Map view requires Mapbox GL. Please configure your Mapbox token in the code to enable this feature.</div>';
    }
}

async function renderMap() {
    if (!map || !map.isStyleLoaded()) return;

    // Check if there are any state-level reforms
    const hasStateLevelReforms = filteredReforms.some(reform => reform.place.type === 'state');
    
    // Group state-level reforms by state
    stateReformsByState = groupStateLevelReforms();
    
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
    
    filteredReforms.forEach(reform => {
        // Only include city/county reforms for markers (state-level reforms are shown as polygons)
        if (reform.place.type !== 'state') {
            const placeKey = reform.place.id;
            if (!placeReforms[placeKey]) {
                placeReforms[placeKey] = [];
            }
            placeReforms[placeKey].push(reform);
        }
    });

    // Convert to GeoJSON features for clustering
    Object.entries(placeReforms).forEach(([placeId, reforms]) => {
        const place = reforms[0].place;
        if (place.latitude && place.longitude) {
            reformsGeoJSON.push({
                type: 'Feature',
                properties: {
                    placeId: placeId,
                    reforms: reforms,
                    reformCount: reforms.length,
                    color: getMarkerColor(reforms[0].reform.type, reforms[0].reform.color)
                },
                geometry: {
                    type: 'Point',
                    coordinates: [place.longitude, place.latitude]
                }
            });
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

            el.addEventListener('click', () => {
                showPlaceOverlay(props.placeId, props.reforms);
            });
        }

        const marker = new mapboxgl.Marker(el)
            .setLngLat([lng, lat])
            .addTo(map);

        mapMarkers[`marker-${idx}`] = marker;
    });
}

function getMarkerColor(reformType, reformColor = null) {
    // Use reform color if available
    if (reformColor) {
        return reformColor;
    }
    
    // Fallback to type-based colors
    // Handle both prefixed (prn:rm_min) and non-prefixed (rm_min) types
    const type = reformType.includes(':') ? reformType.split(':')[1] : reformType;
    switch (type) {
        case 'rm_min': return '#27ae60';
        case 'reduce_min': return '#2ecc71';
        case 'add_max': return '#e74c3c';
        case 'adu': return '#3498db';
        case 'plex': return '#9b59b6';
        case 'tod': return '#f39c12';
        case 'other': return '#95a5a6';
        default: return '#3498db';
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
        overlayCards.appendChild(createReformCard(reform, true));
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
        overlayCards.appendChild(createReformCard(reform, true));
    });

    mapOverlay.classList.add('active');
}

function groupStateLevelReforms() {
    const stateReforms = {};
    
    filteredReforms.forEach(reform => {
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
    
    // Use the color from the first reform (or could aggregate if multiple types)
    return getMarkerColor(reforms[0].reform.type, reforms[0].reform.color);
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
