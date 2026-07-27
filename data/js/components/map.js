/**
 * components/map.js - Leaflet Map Component for CTN Dashboard
 * Handles map initialization, markers, safe zone circles, and interactions
 */

import { State } from '../state.js';

let map = null;
let deviceMarker = null;
let deviceCircle = null;
let zoneLayers = new Map(); // zone index -> { circle, label, marker }
let mapInitialized = false;
let mapContainer = null;

// Zone type colors
const ZONE_COLORS = {
    0: '#1E88E5',   // Home - Blue
    1: '#43A047',   // School - Green
    2: '#8E24AA',   // Custom - Purple
    3: '#FF8F00',   // Trusted - Amber
    default: '#757575'
};

const ZONE_TYPE_LABELS = {
    0: 'Home',
    1: 'School',
    2: 'Custom',
    3: 'Trusted'
};

const ZONE_TYPE_ICONS = {
    0: '🏠',
    1: '🏫',
    2: '📍',
    3: '⭐'
};

//--------------------------------------------------
// Map Initialization
//--------------------------------------------------
export function initMap(containerId, options = {}) {
    if (typeof L === 'undefined') {
        console.error('Leaflet not loaded');
        return Promise.reject(new Error('Leaflet not loaded'));
    }

    mapContainer = document.getElementById(containerId);
    if (!mapContainer) {
        console.error(`Map container #${containerId} not found`);
        return Promise.reject(new Error('Container not found'));
    }

    // Set default center (Nairobi from config) or use device location
    const center = options.center || [-1.2921, 36.8219];
    const zoom = options.zoom || 15;

    // Initialize map
    map = L.map(containerId, {
        center: center,
        zoom: zoom,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        renderer: L.canvas({ padding: 0.5 })
    });

    // Add tile layer (OSM with fallback)
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
        subdomains: 'abc',
        detectRetina: true,
        crossOrigin: ''
    }).addTo(map);

    // Add zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add scale control
    L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);

    // Handle map clicks for zone creation
    map.on('click', (e) => {
        if (window.zoneEditorMode) {
            window.dispatchEvent(new CustomEvent('map-click', {
                detail: { lat: e.latlng.lat, lng: e.latlng.lng }
            }));
        }
    });

    mapInitialized = true;

    // Initialize device marker if we have GPS data
    if (State.gps.value.hasFix) {
        updateDeviceLocation(State.gps.value.latitude, State.gps.value.longitude, State.gps.value.accuracy || 10);
    }

    // Listen for GPS updates
    State.gps.subscribe(updateDeviceLocationFromState);

    console.log('Map initialized');
    return Promise.resolve(map);
}

//--------------------------------------------------
// Device Location
//--------------------------------------------------
function updateDeviceLocationFromState(gps) {
    if (gps.hasFix && gps.latitude && gps.longitude) {
        updateDeviceLocation(gps.latitude, gps.longitude, gps.accuracy || 10);
    }
}

function updateDeviceLocation(lat, lng, accuracy = 10) {
    if (!map) return;

    const position = [lat, lng];

    // Update or create device marker
    if (!deviceMarker) {
        // Custom pulsing icon for device
        deviceMarker = L.marker(position, {
            icon: createDeviceIcon(),
            zIndexOffset: 1000
        }).addTo(map);

        deviceMarker.bindPopup(createDevicePopupContent());
    } else {
        deviceMarker.setLatLng(position);
        deviceMarker.getPopup().setContent(createDevicePopupContent());
    }

    // Update accuracy circle
    if (!deviceCircle) {
        deviceCircle = L.circle(position, {
            radius: accuracy,
            color: '#1E88E5',
            fillColor: '#1E88E5',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '5, 5',
            interactive: false
        }).addTo(map);
    } else {
        deviceCircle.setLatLng(position).setRadius(accuracy);
    }

    // Auto-center on first fix or if option enabled
    if (window.autoCenterMap) {
        map.setView(position, map.getZoom(), { animate: true, duration: 1 });
    }
}

function createDeviceIcon() {
    return L.divIcon({
        className: 'ctn-device-marker',
        html: `
            <div class="device-marker-wrapper">
                <div class="device-pulse"></div>
                <div class="device-marker-core">📍</div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
}

function createDevicePopupContent() {
    const gps = State.gps.value;
    const battery = State.battery.value;

    return `
        <div class="device-popup">
            <h4>📍 Device Location</h4>
            <div class="popup-row"><span>Lat:</span> <strong>${gps.latitude?.toFixed(6) || 'N/A'}</strong></div>
            <div class="popup-row"><span>Lng:</span> <strong>${gps.longitude?.toFixed(6) || 'N/A'}</strong></div>
            <div class="popup-row"><span>Accuracy:</span> <strong>${gps.accuracy ? gps.accuracy.toFixed(1) + 'm' : 'N/A'}</strong></div>
            <div class="popup-row"><span>Speed:</span> <strong>${gps.speed ? gps.speed.toFixed(1) + ' km/h' : 'Stationary'}</strong></div>
            <div class="popup-row"><span>Sats:</span> <strong>${gps.satellites || 0}</strong></div>
            <div class="popup-row"><span>Battery:</span> <strong>${battery.percentage || 0}%</strong></div>
            <a href="https://maps.google.com/?q=${gps.latitude},${gps.longitude}" target="_blank" class="btn btn-sm btn-primary mt-2">Open in Google Maps</a>
        </div>
    `;
}

//--------------------------------------------------
// Safe Zone Layers
//--------------------------------------------------
export function updateSafeZones(zones) {
    if (!map) return;

    const currentIndices = new Set(zones.map(z => z.index).filter(i => i !== undefined));

    // Remove zones that no longer exist
    for (const [index, layer] of zoneLayers) {
        if (!currentIndices.has(index)) {
            removeZoneLayer(index);
        }
    }

    // Add or update zones
    zones.forEach((zone, i) => {
        const index = zone.index ?? i;
        if (zone.enabled !== false) {
            addOrUpdateZoneLayer(index, zone);
        } else if (zoneLayers.has(index)) {
            removeZoneLayer(index);
        }
    });
}

function addOrUpdateZoneLayer(index, zone) {
    const color = ZONE_COLORS[zone.type] || ZONE_COLORS.default;
    const label = zone.name || ZONE_TYPE_LABELS[zone.type] || `Zone ${index}`;

    if (zoneLayers.has(index)) {
        // Update existing
        const layer = zoneLayers.get(index);
        layer.circle.setLatLng([zone.latitude, zone.longitude]);
        layer.circle.setRadius(zone.radius);
        layer.circle.setStyle({ color, fillColor: color });

        // Update label
        if (layer.label) {
            layer.label.setLatLng([zone.latitude, zone.longitude]);
            layer.label.setIcon(L.divIcon({
                className: 'zone-label',
                html: `<span style="background:${color}">${label}</span>`,
                iconSize: null,
                iconAnchor: [0, 0]
            }));
        }
    } else {
        // Create new
        const circle = L.circle([zone.latitude, zone.longitude], {
            radius: zone.radius,
            color: color,
            fillColor: color,
            fillOpacity: 0.12,
            weight: 2,
            interactive: true,
            zoneIndex: index
        }).addTo(map);

        // Add label marker
        const label = L.marker([zone.latitude, zone.longitude], {
            icon: L.divIcon({
                className: 'zone-label',
                html: `<span style="background:${color}">${label}</span>`,
                iconSize: null,
                iconAnchor: [0, 0]
            }),
            interactive: false,
            zIndexOffset: 500
        }).addTo(map);

        // Bind popup
        circle.bindPopup(createZonePopupContent(zone, index));

        zoneLayers.set(index, { circle, label, zone });
    }
}

function removeZoneLayer(index) {
    const layer = zoneLayers.get(index);
    if (layer) {
        map.removeLayer(layer.circle);
        if (layer.label) map.removeLayer(layer.label);
        zoneLayers.delete(index);
    }
}

function createZonePopupContent(zone, index) {
    const typeIcon = ZONE_TYPE_ICONS[zone.type] || '📍';
    const typeLabel = ZONE_TYPE_LABELS[zone.type] || 'Custom';

    return `
        <div class="zone-popup">
            <h4>${typeIcon} ${zone.name || `Zone ${index}`}</h4>
            <div class="popup-row"><span>Type:</span> <strong>${typeLabel}</strong></div>
            <div class="popup-row"><span>Radius:</span> <strong>${zone.radius}m</strong></div>
            <div class="popup-row"><span>Status:</span> <span class="badge ${zone.enabled !== false ? 'badge-success' : 'badge-secondary'}">${zone.enabled !== false ? 'Active' : 'Disabled'}</span></div>
            <div class="popup-row"><span>Coordinates:</span> <code>${zone.latitude.toFixed(6)}, ${zone.longitude.toFixed(6)}</code></div>
            <div class="popup-actions mt-2">
                <button class="btn btn-sm btn-primary" onclick="editZone(${index})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteZone(${index})">Delete</button>
            </div>
        </div>
    `;
}

//--------------------------------------------------
// Map Controls
//--------------------------------------------------
export function centerOnDevice() {
    if (!map || !State.gps.value.hasFix) return;

    const pos = [State.gps.value.latitude, State.gps.value.longitude];
    map.setView(pos, 16, { animate: true, duration: 1 });
}

export function fitAllZones() {
    if (!map || zoneLayers.size === 0) return;

    const bounds = L.latLngBounds([]);
    zoneLayers.forEach(({ circle }) => {
        bounds.extend(circle.getBounds());
    });

    if (deviceMarker) {
        bounds.extend(deviceMarker.getLatLng());
    }

    map.fitBounds(bounds, { padding: [20, 20], animate: true });
}

export function setMapView(lat, lng, zoom = 15) {
    if (!map) return;
    map.setView([lat, lng], zoom, { animate: true });
}

//--------------------------------------------------
// Zone Editor Integration
//--------------------------------------------------
export function enableZoneEditorMode(enabled) {
    window.zoneEditorMode = enabled;
    if (map) {
        map.getContainer().style.cursor = enabled ? 'crosshair' : '';
    }
}

export function addTemporaryZoneMarker(lat, lng) {
    if (!map) return null;

    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'temp-zone-marker',
            html: '<div class="temp-marker">📍</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        }),
        draggable: true
    }).addTo(map);

    const circle = L.circle([lat, lng], {
        radius: 100,
        color: '#1E88E5',
        fillColor: '#1E88E5',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 5'
    }).addTo(map);

    // Sync circle with marker drag
    marker.on('drag', (e) => {
        circle.setLatLng(e.target.getLatLng());
        window.dispatchEvent(new CustomEvent('zone-marker-drag', {
            detail: { lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }
        }));
    });

    window.tempZoneMarker = marker;
    window.tempZoneCircle = circle;

    return { marker, circle };
}

export function removeTemporaryZoneMarker() {
    if (window.tempZoneMarker) {
        map.removeLayer(window.tempZoneMarker);
        window.tempZoneMarker = null;
    }
    if (window.tempZoneCircle) {
        map.removeLayer(window.tempZoneCircle);
        window.tempZoneCircle = null;
    }
}

export function updateTemporaryZoneRadius(radius) {
    if (window.tempZoneCircle) {
        window.tempZoneCircle.setRadius(radius);
    }
}

//--------------------------------------------------
// Cleanup
//--------------------------------------------------
export function destroyMap() {
    if (map) {
        State.gps.unsubscribe(updateDeviceLocationFromState);

        zoneLayers.forEach((layer, index) => removeZoneLayer(index));
        if (deviceMarker) map.removeLayer(deviceMarker);
        if (deviceCircle) map.removeLayer(deviceCircle);
        removeTemporaryZoneMarker();

        map.remove();
        map = null;
        mapInitialized = false;
    }
}

export function getMap() {
    return map;
}

export function isMapReady() {
    return mapInitialized && map !== null;
}

//--------------------------------------------------
// CSS Styles (injected if not present)
//--------------------------------------------------
const mapStyles = `
<style id="ctn-map-styles">
.ctn-device-marker .device-marker-wrapper {
    position: relative;
    width: 40px;
    height: 40px;
}
.ctn-device-marker .device-pulse {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border-radius: 50%;
    background: #1E88E5;
    opacity: 0.6;
    animation: pulse-ring 2s ease-out infinite;
}
@keyframes pulse-ring {
    0% { transform: scale(0.5); opacity: 0.6; }
    100% { transform: scale(2.5); opacity: 0; }
}
.ctn-device-marker .device-marker-core {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    z-index: 2;
}
.zone-label {
    background: none !important;
    border: none !important;
    box-shadow: none !important;
}
.zone-label span {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    color: white;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
.temp-zone-marker .temp-marker {
    font-size: 24px;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}
.device-popup, .zone-popup {
    min-width: 200px;
}
.popup-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid #eee;
}
.popup-row:last-child { border-bottom: none; }
.popup-row span:first-child { color: #666; }
.popup-actions { display: flex; gap: 8px; }
.btn-sm { padding: 4px 12px; font-size: 12px; }
</style>
`;

// Inject styles
if (!document.getElementById('ctn-map-styles')) {
    document.head.insertAdjacentHTML('beforeend', mapStyles);
}