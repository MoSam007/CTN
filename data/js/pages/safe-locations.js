/**
 * pages/safe-locations.js - Safe Locations Page
 * Geofence configuration with map integration
 */

import { State, showToast, formatDateTime } from '../state.js';
import { initMap, updateSafeZones, centerOnDevice, fitAllZones, enableZoneEditorMode, addTemporaryZoneMarker, removeTemporaryZoneMarker, updateTemporaryZoneRadius, destroyMap } from '../components/map.js';
import { ZoneEditor } from '../components/zone-editor.js';

let map = null;
let zoneEditor = null;
let zoneListContainer = null;

export async function initSafeLocationsPage() {
    const container = document.getElementById('page-safe-locations');
    if (!container) return;

    container.innerHTML = getSafeLocationsHTML();
    zoneListContainer = document.getElementById('zone-list-container');

    await initMapComponent();
    await loadZones();
    setupEventListeners();
    initZoneEditor();
}

function getSafeLocationsHTML() {
    return `
        <div class="page page-safe-locations" role="main">
            <header class="page-header">
                <div>
                    <h1>Safe Locations</h1>
                    <p class="page-subtitle">Configure geofences for arrival/departure alerts</p>
                </div>
                <button class="btn btn-primary" id="btn-add-zone">
                    <span>➕</span> Add Safe Zone
                </button>
            </header>

            <div class="safe-locations-layout">
                <!-- Map Panel -->
                <section class="map-panel" aria-labelledby="map-title">
                    <div class="map-header">
                        <h2 id="map-title">Map View</h2>
                        <div class="map-controls">
                            <button class="btn btn-sm btn-secondary" id="btn-center-device" aria-label="Center on device">
                                <span>📍</span> Device
                            </button>
                            <button class="btn btn-sm btn-secondary" id="btn-fit-zones" aria-label="Fit all zones">
                                <span>🔍</span> Fit Zones
                            </button>
                        </div>
                    </div>
                    <div class="map-container" id="safe-locations-map" role="application" aria-label="Safe zones map"></div>
                    <div class="map-legend" id="map-legend"></div>
                </section>

                <!-- Zone List Panel -->
                <section class="zone-list-panel" aria-labelledby="zones-title">
                    <div class="panel-header">
                        <h2 id="zones-title">Safe Zones</h2>
                        <span class="zone-count" id="zone-count">0 zones</span>
                    </div>
                    <div class="zone-list-container" id="zone-list-container" role="list" aria-label="Safe zones">
                        <div class="zone-loading">Loading zones...</div>
                    </div>
                    <div class="zone-help">
                        <h4>Zone Types</h4>
                        <div class="zone-type-legend">
                            <span class="legend-item"><span class="legend-color" style="background: #1E88E5"></span> Home (Blue)</span>
                            <span class="legend-item"><span class="legend-color" style="background: #43A047"></span> School (Green)</span>
                            <span class="legend-item"><span class="legend-color" style="background: #8E24AA"></span> Custom (Purple)</span>
                            <span class="legend-item"><span class="legend-color" style="background: #FF8F00"></span> Trusted (Amber)</span>
                        </div>
                        <p class="help-text">Click a zone on the map or list to edit. Zones trigger arrival/departure alerts.</p>
                    </div>
                </section>
            </div>
        </div>
    `;
}

async function initMapComponent() {
    try {
        map = await initMap('safe-locations-map', {
            center: [State.gps.value.latitude, State.gps.value.longitude],
            zoom: 15
        });

        // Update map when GPS changes
        State.gps.subscribe((gps) => {
            if (gps.hasFix && gps.latitude && gps.longitude) {
                updateDeviceLocation(gps.latitude, gps.longitude, gps.accuracy || 10);
            }
        });

        // Listen for map clicks from zone editor
        window.addEventListener('map-click', handleMapClick);
        window.addEventListener('zone-marker-drag', handleZoneMarkerDrag);

    } catch (e) {
        console.error('Failed to initialize map:', e);
        showToast('Map unavailable', 'warning');
    }
}

async function loadZones() {
    try {
        const response = await fetch('/api/safe-zones');
        const data = await response.json();

        if (data.zones) {
            State.safeZones.value = data.zones.map((zone, i) => ({ ...zone, index: zone.index ?? i }));
            renderZoneList();
            updateSafeZones(map, State.safeZones.value);
            renderMapLegend();
        }
    } catch (e) {
        console.error('Failed to load zones:', e);
        showToast('Failed to load safe zones', 'error');
    }
}

function renderZoneList() {
    const zones = State.safeZones.value;

    if (!zoneListContainer) return;

    if (zones.length === 0) {
        zoneListContainer.innerHTML = `
            <div class="zone-empty">
                <div class="zone-empty-icon">📍</div>
                <h4>No Safe Zones Configured</h4>
                <p>Add your first safe zone to get arrival/departure alerts</p>
                <button class="btn btn-primary" id="btn-add-first-zone">Add Safe Zone</button>
            </div>
        `;
        document.getElementById('btn-add-first-zone')?.addEventListener('click', () => openZoneEditor());
        document.getElementById('zone-count').textContent = '0 zones';
        return;
    }

    zoneListContainer.innerHTML = zones.map((zone, i) => renderZoneCard(zone, i)).join('');
    document.getElementById('zone-count').textContent = `${zones.length} zone${zones.length !== 1 ? 's' : ''}`;

    // Bind events
    zoneListContainer.querySelectorAll('.zone-card').forEach(card => {
        const index = parseInt(card.dataset.index, 10);
        const zone = zones[index];

        card.querySelector('.zone-edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openZoneEditor(zone);
        });

        card.querySelector('.zone-delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteZone(zone);
        });

        card.querySelector('.zone-toggle')?.addEventListener('change', (e) => {
            toggleZone(zone, e.target.checked);
        });

        card.addEventListener('click', () => {
            // Center map on zone
            if (map && zone.latitude && zone.longitude) {
                map.setView([zone.latitude, zone.longitude], 16, { animate: true });
            }
        });
    });
}

function renderZoneCard(zone, index) {
    const enabled = zone.enabled !== false;
    const typeInfo = getZoneTypeInfo(zone.type);
    const color = typeInfo.color;

    return `
        <article class="zone-card${!enabled ? ' disabled' : ''}" data-index="${index}" role="listitem">
            <div class="zone-card-header">
                <span class="zone-type-badge" style="background: ${color};">
                    <span class="zone-type-icon">${typeInfo.icon}</span>
                    <span class="zone-type-name">${typeInfo.label}</span>
                </span>
                <div class="zone-card-actions">
                    <button class="icon-btn zone-edit-btn" aria-label="Edit ${zone.name}">✏️</button>
                    <button class="icon-btn zone-delete-btn" aria-label="Delete ${zone.name}">🗑️</button>
                </div>
            </div>
            <h4 class="zone-name">${escapeHtml(zone.name || 'Unnamed Zone')}</h4>
            <div class="zone-meta">
                <span class="zone-radius">Radius: ${zone.radius}m</span>
                <span class="zone-coords">${zone.latitude?.toFixed(4)}, ${zone.longitude?.toFixed(4)}</span>
            </div>
            <div class="zone-card-footer">
                <label class="toggle-switch">
                    <input type="checkbox" class="zone-toggle" ${enabled ? 'checked' : ''} data-index="${index}" aria-label="${enabled ? 'Disable' : 'Enable'} ${zone.name}">
                    <span class="toggle-slider"></span>
                </label>
                <span class="zone-status">${enabled ? 'Active' : 'Inactive'}</span>
            </div>
        </article>
    `;
}

function renderMapLegend() {
    const legend = document.getElementById('map-legend');
    if (!legend) return;

    const zones = State.safeZones.value;
    if (zones.length === 0) {
        legend.innerHTML = '';
        return;
    }

    legend.innerHTML = `
        <h4>Map Legend</h4>
        <div class="legend-items">
            ${zones.filter(z => z.enabled !== false).map(zone => {
                const typeInfo = getZoneTypeInfo(zone.type);
                return `
                    <div class="legend-item" data-index="${zone.index}">
                        <span class="legend-circle" style="border-color: ${typeInfo.color}; background: ${typeInfo.color}33;"></span>
                        <span class="legend-label">${escapeHtml(zone.name)}</span>
                        <span class="legend-radius">${zone.radius}m</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Bind legend clicks
    legend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index, 10);
            const zone = zones.find(z => z.index === index);
            if (map && zone) {
                map.setView([zone.latitude, zone.longitude], 16, { animate: true });
            }
        });
    });
}

function getZoneTypeInfo(type) {
    const types = {
        0: { label: 'Home', icon: '🏠', color: '#1E88E5' },
        1: { label: 'School', icon: '🏫', color: '#43A047' },
        2: { label: 'Custom', icon: '📍', color: '#8E24AA' },
        3: { label: 'Trusted', icon: '⭐', color: '#FF8F00' }
    };
    return types[type] || types[2];
}

function initZoneEditor() {
    zoneEditor = new ZoneEditor({
        map: map,
        zones: State.safeZones.value,
        onSave: saveZone,
        onDelete: deleteZoneConfirmed,
        onCancel: () => {
            removeTemporaryZoneMarker();
            enableZoneEditorMode(false);
        }
    });
}

function openZoneEditor(zone = null) {
    if (zoneEditor) {
        zoneEditor.open(zone);
    }
}

async function saveZone(data, isEditing) {
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing ? `/api/safe-zones/${data.index}` : '/api/safe-zones';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: data.name,
                type: data.type,
                latitude: data.latitude,
                longitude: data.longitude,
                radius: data.radius,
                enabled: data.enabled
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save zone');

        showToast(isEditing ? 'Zone updated' : 'Zone added', 'success');
        await loadZones();
    } catch (e) {
        showToast(e.message || 'Failed to save zone', 'error');
        throw e; // Re-throw to keep modal open
    }
}

async function deleteZone(zone) {
    if (!confirm(`Delete "${zone.name}"? This cannot be undone.`)) return;

    try {
        const response = await fetch(`/api/safe-zones/${zone.index}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to delete zone');

        showToast('Zone deleted', 'success');
        await loadZones();
    } catch (e) {
        showToast(e.message || 'Failed to delete zone', 'error');
    }
}

async function deleteZoneConfirmed(index) {
    try {
        const response = await fetch(`/api/safe-zones/${index}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to delete zone');

        showToast('Zone deleted', 'success');
        await loadZones();
    } catch (e) {
        showToast(e.message || 'Failed to delete zone', 'error');
        throw e;
    }
}

async function toggleZone(zone, enabled) {
    try {
        const response = await fetch(`/api/safe-zones/${zone.index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...zone, enabled })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update zone');

        showToast(enabled ? 'Zone enabled' : 'Zone disabled', 'success');
        await loadZones();
    } catch (e) {
        showToast(e.message || 'Failed to toggle zone', 'error');
        // Revert toggle
        renderZoneList();
    }
}

function handleMapClick(e) {
    if (zoneEditor) {
        // Zone editor handles map clicks internally
    }
}

function handleZoneMarkerDrag(e) {
    updateTemporaryZoneRadius(e.detail.lat, e.detail.lng);
}

function setupEventListeners() {
    // Add zone button
    document.getElementById('btn-add-zone')?.addEventListener('click', () => openZoneEditor());
    document.getElementById('btn-add-first-zone')?.addEventListener('click', () => openZoneEditor());

    // Map controls
    document.getElementById('btn-center-device')?.addEventListener('click', centerOnDevice);
    document.getElementById('btn-fit-zones')?.addEventListener('click', fitAllZones);

    // Refresh on state change
    State.safeZones.subscribe(() => {
        renderZoneList();
        if (map) updateSafeZones(map, State.safeZones.value);
        renderMapLegend();
        if (zoneEditor) zoneEditor.options.zones = State.safeZones.value;
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function destroySafeLocationsPage() {
    window.removeEventListener('map-click', handleMapClick);
    window.removeEventListener('zone-marker-drag', handleZoneMarkerDrag);
    if (zoneEditor) {
        zoneEditor.destroy();
        zoneEditor = null;
    }
    if (map) {
        destroyMap();
        map = null;
    }
}