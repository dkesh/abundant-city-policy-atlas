// ============================================================================
// MAP FUNCTIONALITY
// ============================================================================

function switchView(view) {
    if (view === 'list') {
        listView.classList.add('active');
        mapView.classList.remove('active');
        listViewTab.classList.add('active');
        mapViewTab.classList.remove('active');
    } else {
        listView.classList.remove('active');
        mapView.classList.add('active');
        listViewTab.classList.remove('active');
        mapViewTab.classList.add('active');
        initializeMap();
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

function renderMap() {
    if (!map || !map.isStyleLoaded()) return;

    // Group reforms by place and create GeoJSON
    const placeReforms = {};
    reformsGeoJSON = [];
    
    filteredReforms.forEach(reform => {
        const placeKey = reform.place.id;
        if (!placeReforms[placeKey]) {
            placeReforms[placeKey] = [];
        }
        placeReforms[placeKey].push(reform);
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
                    color: getMarkerColor(reforms[0].reform.type)
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

function getMarkerColor(reformType) {
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
