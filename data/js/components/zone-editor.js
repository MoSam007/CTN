/**
 * components/zone-editor.js - Safe Zone CRUD Modal/Form Component
 * Handles creating, editing, and deleting safe zones with map integration
 */

//--------------------------------------------------
// Zone Editor Class
//--------------------------------------------------
export class ZoneEditor {
    constructor(options = {}) {
        this.options = {
            onSave: options.onSave || (() => {}),
            onDelete: options.onDelete || (() => {}),
            onCancel: options.onCancel || (() => {}),
            zones: options.zones || [],
            map: options.map || null, // Leaflet map instance
            zoneTypes: options.zoneTypes || [
                { value: 0, label: 'Home', icon: '🏠', color: '#1E88E5' },
                { value: 1, label: 'School', icon: '🏫', color: '#43A047' },
                { value: 2, label: 'Custom', icon: '📍', color: '#8E24AA' },
                { value: 3, label: 'Trusted', icon: '⭐', color: '#FF8F00' }
            ],
            defaultRadius: options.defaultRadius || 100,
            minRadius: options.minRadius || 10,
            maxRadius: options.maxRadius || 5000,
            ...options
        };

        this.currentZone = null;
        this.isEditing = false;
        this.tempMarker = null;
        this.tempCircle = null;
        this.modal = null;
        this.mapClickHandler = null;

        this._createModal();
    }

    //--------------------------------------------------
    // Modal Creation
    //--------------------------------------------------
    _createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('zone-editor-modal');
        if (existing) existing.remove();

        this.modal = document.createElement('div');
        this.modal.id = 'zone-editor-modal';
        this.modal.className = 'zone-editor-modal';
        this.modal.setAttribute('role', 'dialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', 'zone-editor-title');
        this.modal.innerHTML = `
            <div class="zone-editor-backdrop" tabindex="-1"></div>
            <div class="zone-editor-dialog">
                <div class="zone-editor-header">
                    <h3 id="zone-editor-title">Add Safe Zone</h3>
                    <button class="zone-editor-close" aria-label="Close">&times;</button>
                </div>
                <form class="zone-editor-form" id="zone-editor-form">
                    <div class="zone-editor-body">
                        <!-- Name Field -->
                        <div class="form-group">
                            <label for="zone-name">Zone Name <span class="required">*</span></label>
                            <input type="text" id="zone-name" name="name" required maxlength="50" placeholder="e.g., Home, Grandma's House">
                        </div>

                        <!-- Type Selector -->
                        <div class="form-group">
                            <label>Zone Type <span class="required">*</span></label>
                            <div class="zone-type-selector" id="zone-type-selector" role="radiogroup" aria-label="Zone type">
                                ${this.options.zoneTypes.map(type => `
                                    <button type="button" class="zone-type-btn${type.value === 0 ? ' active' : ''}"
                                            data-type="${type.value}"
                                            role="radio"
                                            aria-checked="${type.value === 0}"
                                            style="--zone-color: ${type.color};">
                                        <span class="zone-type-icon">${type.icon}</span>
                                        <span class="zone-type-label">${type.label}</span>
                                        <span class="zone-type-indicator"></span>
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" id="zone-type" name="type" value="0" required>
                        </div>

                        <!-- Coordinates -->
                        <div class="form-row">
                            <div class="form-group">
                                <label for="zone-lat">Latitude <span class="required">*</span></label>
                                <input type="number" id="zone-lat" name="latitude" step="0.000001" required placeholder="-1.292100">
                            </div>
                            <div class="form-group">
                                <label for="zone-lng">Longitude <span class="required">*</span></label>
                                <input type="number" id="zone-lng" name="longitude" step="0.000001" required placeholder="36.821900">
                            </div>
                        </div>

                        <!-- Map Pick Button -->
                        <div class="form-group">
                            <button type="button" class="btn btn-secondary" id="zone-pick-map">
                                <span>🗺️</span> Pick on Map
                            </button>
                            <p class="form-hint">Click on the map to set coordinates</p>
                        </div>

                        <!-- Radius Slider -->
                        <div class="form-group">
                            <label for="zone-radius">Radius <span class="required">*</span></label>
                            <div class="radius-control">
                                <input type="range" id="zone-radius" name="radius"
                                       min="${this.options.minRadius}"
                                       max="${this.options.maxRadius}"
                                       value="${this.options.defaultRadius}"
                                       step="10">
                                <span class="radius-value" id="radius-value">${this.options.defaultRadius}m</span>
                            </div>
                            <div class="radius-presets">
                                <button type="button" class="radius-preset" data-radius="50">50m</button>
                                <button type="button" class="radius-preset" data-radius="100">100m</button>
                                <button type="button" class="radius-preset" data-radius="200">200m</button>
                                <button type="button" class="radius-preset" data-radius="500">500m</button>
                            </div>
                        </div>

                        <!-- Enabled Toggle -->
                        <div class="form-group form-group-checkbox">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="zone-enabled" name="enabled" checked>
                                <span class="checkmark"></span>
                                <span>Zone Enabled</span>
                            </label>
                        </div>

                        <!-- Index (for editing) -->
                        <input type="hidden" id="zone-index" name="index">
                    </div>

                    <div class="zone-editor-footer">
                        <button type="button" class="btn btn-secondary" id="zone-cancel">Cancel</button>
                        <button type="button" class="btn btn-danger" id="zone-delete" style="display: none;">
                            <span>🗑️</span> Delete
                        </button>
                        <button type="submit" class="btn btn-primary" id="zone-save">
                            <span class="btn-loader"></span>
                            <span class="btn-text">Save Zone</span>
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Bind events
        this._bindEvents();
    }

    _bindEvents() {
        const form = this.modal.querySelector('#zone-editor-form');
        const closeBtn = this.modal.querySelector('.zone-editor-close');
        const cancelBtn = this.modal.querySelector('#zone-cancel');
        const deleteBtn = this.modal.querySelector('#zone-delete');
        const pickMapBtn = this.modal.querySelector('#zone-pick-map');
        const radiusInput = this.modal.querySelector('#zone-radius');
        const radiusValue = this.modal.querySelector('#radius-value');
        const typeSelector = this.modal.querySelector('#zone-type-selector');
        const typeInput = this.modal.querySelector('#zone-type');
        const presetButtons = this.modal.querySelectorAll('.radius-preset');

        // Close handlers
        const close = () => this.close();
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        this.modal.querySelector('.zone-editor-backdrop').addEventListener('click', close);

        // Escape key
        this._handleKeydown = (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('open')) {
                close();
            }
        };
        document.addEventListener('keydown', this._handleKeydown);

        // Form submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleSave();
        });

        // Delete
        deleteBtn.addEventListener('click', () => this._handleDelete());

        // Radius slider
        radiusInput.addEventListener('input', (e) => {
            radiusValue.textContent = `${e.target.value}m`;
            this._updateTempCircleRadius(parseInt(e.target.value, 10));
        });

        // Radius presets
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const radius = parseInt(btn.dataset.radius, 10);
                radiusInput.value = radius;
                radiusValue.textContent = `${radius}m`;
                this._updateTempCircleRadius(radius);
                presetButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Type selector
        typeSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.zone-type-btn');
            if (btn) {
                typeSelector.querySelectorAll('.zone-type-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                typeInput.value = btn.dataset.type;
            }
        });

        // Pick on map
        pickMapBtn.addEventListener('click', () => this._enableMapPicking());

        // Coordinate inputs - update temp marker
        this.modal.querySelector('#zone-lat').addEventListener('change', () => this._updateTempMarkerFromInputs());
        this.modal.querySelector('#zone-lng').addEventListener('change', () => this._updateTempMarkerFromInputs());
    }

    //--------------------------------------------------
    // Public API
    //--------------------------------------------------
    open(zone = null) {
        this.currentZone = zone;
        this.isEditing = zone !== null;

        // Reset form
        const form = this.modal.querySelector('#zone-editor-form');
        form.reset();

        // Set title
        this.modal.querySelector('#zone-editor-title').textContent = this.isEditing ? 'Edit Safe Zone' : 'Add Safe Zone';

        // Show/hide delete button
        this.modal.querySelector('#zone-delete').style.display = this.isEditing ? 'inline-flex' : 'none';

        if (this.isEditing) {
            this._populateForm(zone);
        } else {
            // Set defaults
            this.modal.querySelector('#zone-type').value = '0';
            this.modal.querySelector('#zone-radius').value = this.options.defaultRadius;
            this.modal.querySelector('#radius-value').textContent = `${this.options.defaultRadius}m`;
            this.modal.querySelector('#zone-enabled').checked = true;
            this._setActiveType(0);
        }

        // Show modal
        requestAnimationFrame(() => {
            this.modal.classList.add('open');
            this.modal.querySelector('#zone-name').focus();
        });

        // Trap focus
        this._trapFocus();
    }

    close() {
        this.modal.classList.remove('open');
        this._disableMapPicking();
        this._removeTempMarker();
        this.currentZone = null;
        this.isEditing = false;
        this.options.onCancel();
    }

    //--------------------------------------------------
    // Form Handling
    //--------------------------------------------------
    _populateForm(zone) {
        this.modal.querySelector('#zone-name').value = zone.name || '';
        this.modal.querySelector('#zone-type').value = zone.type || 0;
        this.modal.querySelector('#zone-lat').value = zone.latitude || '';
        this.modal.querySelector('#zone-lng').value = zone.longitude || '';
        this.modal.querySelector('#zone-radius').value = zone.radius || this.options.defaultRadius;
        this.modal.querySelector('#radius-value').textContent = `${zone.radius || this.options.defaultRadius}m`;
        this.modal.querySelector('#zone-enabled').checked = zone.enabled !== false;
        this.modal.querySelector('#zone-index').value = zone.index ?? '';

        this._setActiveType(zone.type || 0);

        // Update preset buttons
        const radius = zone.radius || this.options.defaultRadius;
        this.modal.querySelectorAll('.radius-preset').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.radius, 10) === radius);
        });

        // Show temp marker on map
        if (this.options.map && zone.latitude && zone.longitude) {
            this._showTempMarker(zone.latitude, zone.longitude, zone.radius || this.options.defaultRadius);
        }
    }

    _setActiveType(type) {
        this.modal.querySelectorAll('.zone-type-btn').forEach(btn => {
            const isActive = parseInt(btn.dataset.type, 10) === type;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-checked', isActive);
        });
    }

    _getFormData() {
        const formData = new FormData(this.modal.querySelector('#zone-editor-form'));
        return {
            index: formData.get('index') ? parseInt(formData.get('index'), 10) : undefined,
            name: formData.get('name').trim(),
            type: parseInt(formData.get('type'), 10),
            latitude: parseFloat(formData.get('latitude')),
            longitude: parseFloat(formData.get('longitude')),
            radius: parseInt(formData.get('radius'), 10),
            enabled: formData.get('enabled') === 'on'
        };
    }

    _validateForm(data) {
        if (!data.name) return 'Please enter a zone name';
        if (isNaN(data.latitude) || data.latitude < -90 || data.latitude > 90) return 'Invalid latitude';
        if (isNaN(data.longitude) || data.longitude < -180 || data.longitude > 180) return 'Invalid longitude';
        if (isNaN(data.radius) || data.radius < this.options.minRadius || data.radius > this.options.maxRadius) {
            return `Radius must be between ${this.options.minRadius} and ${this.options.maxRadius} meters`;
        }
        return null;
    }

    async _handleSave() {
        const data = this._getFormData();
        const error = this._validateForm(data);

        if (error) {
            this._showError(error);
            return;
        }

        const saveBtn = this.modal.querySelector('#zone-save');
        saveBtn.disabled = true;
        saveBtn.querySelector('.btn-loader').style.display = 'block';
        saveBtn.querySelector('.btn-text').textContent = 'Saving...';

        try {
            await this.options.onSave(data, this.isEditing);
            this.close();
        } catch (err) {
            this._showError(err.message || 'Failed to save zone');
        } finally {
            saveBtn.disabled = false;
            saveBtn.querySelector('.btn-loader').style.display = 'none';
            saveBtn.querySelector('.btn-text').textContent = this.isEditing ? 'Update Zone' : 'Save Zone';
        }
    }

    async _handleDelete() {
        if (!this.isEditing || !this.currentZone) return;

        if (!confirm('Are you sure you want to delete this safe zone? This cannot be undone.')) {
            return;
        }

        const deleteBtn = this.modal.querySelector('#zone-delete');
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<span class="btn-loader"></span> Deleting...';

        try {
            await this.options.onDelete(this.currentZone.index);
            this.close();
        } catch (err) {
            this._showError(err.message || 'Failed to delete zone');
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<span>🗑️</span> Delete';
        }
    }

    _showError(message) {
        // Remove existing error
        const existing = this.modal.querySelector('.zone-editor-error');
        if (existing) existing.remove();

        const error = document.createElement('div');
        error.className = 'zone-editor-error';
        error.textContent = message;
        this.modal.querySelector('.zone-editor-body').prepend(error);

        setTimeout(() => error.remove(), 5000);
    }

    //--------------------------------------------------
    // Map Integration
    //--------------------------------------------------
    _enableMapPicking() {
        if (!this.options.map) {
            this._showError('Map not available');
            return;
        }

        this._disableMapPicking(); // Clean up any existing

        this.mapClickHandler = (e) => this._onMapClick(e);
        this.options.map.on('click', this.mapClickHandler);
        this.options.map.getContainer().style.cursor = 'crosshair';

        this.modal.querySelector('#zone-pick-map').innerHTML = '<span>✋</span> Cancel Map Pick';
        this.modal.querySelector('#zone-pick-map').classList.add('active');

        // Show instruction toast
        this._showMapInstruction('Click on the map to set the zone center');
    }

    _disableMapPicking() {
        if (this.options.map && this.mapClickHandler) {
            this.options.map.off('click', this.mapClickHandler);
            this.mapClickHandler = null;
        }
        if (this.options.map) {
            this.options.map.getContainer().style.cursor = '';
        }
        const btn = this.modal.querySelector('#zone-pick-map');
        btn.innerHTML = '<span>🗺️</span> Pick on Map';
        btn.classList.remove('active');
        this._hideMapInstruction();
    }

    _onMapClick(e) {
        const { lat, lng } = e.latlng;
        this.modal.querySelector('#zone-lat').value = lat.toFixed(6);
        this.modal.querySelector('#zone-lng').value = lng.toFixed(6);
        this._showTempMarker(lat, lng, parseInt(this.modal.querySelector('#zone-radius').value, 10));
        this._disableMapPicking();
    }

    _showTempMarker(lat, lng, radius) {
        if (!this.options.map) return;

        this._removeTempMarker();

        // Temporary marker
        this.tempMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'temp-zone-marker',
                html: '<div class="temp-marker">📍</div>',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            }),
            draggable: true
        }).addTo(this.options.map);

        // Temporary circle
        this.tempCircle = L.circle([lat, lng], {
            radius: radius,
            color: '#1E88E5',
            fillColor: '#1E88E5',
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(this.options.map);

        // Sync circle with marker drag
        this.tempMarker.on('drag', (e) => {
            const pos = e.target.getLatLng();
            this.tempCircle.setLatLng(pos);
            this.modal.querySelector('#zone-lat').value = pos.lat.toFixed(6);
            this.modal.querySelector('#zone-lng').value = pos.lng.toFixed(6);
        });

        // Fit map to show the zone
        this.options.map.fitBounds(this.tempCircle.getBounds(), { padding: [50, 50] });
    }

    _updateTempMarkerFromInputs() {
        const lat = parseFloat(this.modal.querySelector('#zone-lat').value);
        const lng = parseFloat(this.modal.querySelector('#zone-lng').value);
        const radius = parseInt(this.modal.querySelector('#zone-radius').value, 10);

        if (!isNaN(lat) && !isNaN(lng) && this.tempMarker && this.options.map) {
            this.tempMarker.setLatLng([lat, lng]);
            if (this.tempCircle) this.tempCircle.setLatLng([lat, lng]);
            if (!isNaN(radius)) this.tempCircle.setRadius(radius);
            this.options.map.panTo([lat, lng]);
        }
    }

    _updateTempCircleRadius(radius) {
        if (this.tempCircle) {
            this.tempCircle.setRadius(radius);
        }
    }

    _removeTempMarker() {
        if (this.tempMarker && this.options.map) {
            this.options.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
        if (this.tempCircle && this.options.map) {
            this.options.map.removeLayer(this.tempCircle);
            this.tempCircle = null;
        }
    }

    _showMapInstruction(message) {
        const existing = document.getElementById('map-instruction-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'map-instruction-toast';
        toast.className = 'map-instruction-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
    }

    _hideMapInstruction() {
        const toast = document.getElementById('map-instruction-toast');
        if (toast) toast.remove();
    }

    //--------------------------------------------------
    // Focus Management
    //--------------------------------------------------
    _trapFocus() {
        const focusable = this.modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        this._handleTab = (e) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        this.modal.addEventListener('keydown', this._handleTab);
    }

    _untrapFocus() {
        this.modal.removeEventListener('keydown', this._handleTab);
    }

    //--------------------------------------------------
    // Cleanup
    //--------------------------------------------------
    destroy() {
        this.close();
        document.removeEventListener('keydown', this._handleKeydown);
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
    }
}

//--------------------------------------------------
// Zone List Component (for displaying zones)
//--------------------------------------------------
export class ZoneList {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) return;

        this.options = {
            zones: options.zones || [],
            onEdit: options.onEdit || (() => {}),
            onDelete: options.onDelete || (() => {}),
            onToggle: options.onToggle || (() => {}),
            map: options.map || null,
            showArrivalLog: options.showArrivalLog !== false,
            ...options
        };

        this.zones = [...this.options.zones];
        this._createHTML();
    }

    _createHTML() {
        this.container.innerHTML = `
            <div class="zone-list" role="list" aria-label="Safe zones">
                ${this.zones.length === 0 ? this._renderEmpty() : this.zones.map((zone, i) => this._renderZone(zone, i)).join('')}
            </div>
        `;
        this._bindEvents();
    }

    _renderEmpty() {
        return `
            <div class="zone-list-empty">
                <div class="zone-list-empty-icon">📍</div>
                <h4>No Safe Zones Configured</h4>
                <p>Add your first safe zone to get arrival/departure alerts</p>
                <button class="btn btn-primary" data-action="add-first">Add Safe Zone</button>
            </div>
        `;
    }

    _renderZone(zone, index) {
        const typeInfo = this.options.zoneTypes?.find(t => t.value === zone.type) || { label: 'Custom', color: '#8E24AA', icon: '📍' };
        const enabled = zone.enabled !== false;

        return `
            <article class="zone-card${!enabled ? ' disabled' : ''}" data-index="${zone.index ?? index}" role="listitem">
                <div class="zone-card-header">
                    <span class="zone-type-badge" style="background: ${typeInfo.color};">
                        <span class="zone-type-icon">${typeInfo.icon}</span>
                        <span class="zone-type-name">${typeInfo.label}</span>
                    </span>
                    <div class="zone-card-actions">
                        <button class="icon-btn zone-edit-btn" aria-label="Edit zone" title="Edit">✏️</button>
                        <button class="icon-btn zone-delete-btn" aria-label="Delete zone" title="Delete">🗑️</button>
                    </div>
                </div>
                <h4 class="zone-name">${this._escapeHtml(zone.name || 'Unnamed Zone')}</h4>
                <div class="zone-meta">
                    <span class="zone-radius">Radius: ${zone.radius}m</span>
                    <span class="zone-coords">${zone.latitude?.toFixed(4)}, ${zone.longitude?.toFixed(4)}</span>
                </div>
                <div class="zone-card-footer">
                    <label class="toggle-switch">
                        <input type="checkbox" class="zone-toggle" ${enabled ? 'checked' : ''} data-index="${zone.index ?? index}">
                        <span class="toggle-slider"></span>
                    </label>
                    <span class="zone-status">${enabled ? 'Active' : 'Inactive'}</span>
                </div>
                ${this.options.showArrivalLog && zone.arrivalLog ? this._renderArrivalLog(zone.arrivalLog) : ''}
            </article>
        `;
    }

    _renderArrivalLog(log) {
        if (!log || log.length === 0) return '';

        return `
            <div class="zone-arrival-log">
                <div class="arrival-log-header">Recent Activity</div>
                <div class="arrival-log-items">
                    ${log.slice(0, 3).map(entry => `
                        <div class="arrival-log-item">
                            <span class="arrival-type ${entry.type}">${entry.type === 'arrival' ? '🏠' : '🚶'}</span>
                            <span class="arrival-time">${this._formatTime(entry.timestamp)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    _formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _bindEvents() {
        // Edit buttons
        this.container.querySelectorAll('.zone-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.zone-card');
                const index = parseInt(card.dataset.index, 10);
                const zone = this.zones.find(z => (z.index ?? this.zones.indexOf(z)) === index);
                if (zone) this.options.onEdit(zone);
            });
        });

        // Delete buttons
        this.container.querySelectorAll('.zone-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.zone-card');
                const index = parseInt(card.dataset.index, 10);
                const zone = this.zones.find(z => (z.index ?? this.zones.indexOf(z)) === index);
                if (zone && confirm('Delete this safe zone?')) this.options.onDelete(zone.index ?? index);
            });
        });

        // Toggle switches
        this.container.querySelectorAll('.zone-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index, 10);
                this.options.onToggle(index, e.target.checked);
            });
        });

        // Add first button
        const addFirst = this.container.querySelector('[data-action="add-first"]');
        if (addFirst) {
            addFirst.addEventListener('click', () => this.options.onEdit(null));
        }
    }

    //--------------------------------------------------
    // Public API
    //--------------------------------------------------
    setZones(zones) {
        this.zones = [...zones];
        this._createHTML();
    }

    addZone(zone) {
        this.zones.push(zone);
        this._createHTML();
    }

    removeZone(index) {
        this.zones = this.zones.filter((_, i) => i !== index);
        this._createHTML();
    }

    updateZone(index, zone) {
        const idx = this.zones.findIndex(z => (z.index ?? this.zones.indexOf(z)) === index);
        if (idx !== -1) {
            this.zones[idx] = { ...this.zones[idx], ...zone };
            this._createHTML();
        }
    }
}

//--------------------------------------------------
// Factory Functions
//--------------------------------------------------
export function createZoneEditor(options) {
    return new ZoneEditor(options);
}

export function createZoneList(container, options) {
    return new ZoneList(container, options);
}

//--------------------------------------------------
// CSS Styles
//--------------------------------------------------
const zoneEditorStyles = `
<style id="ctn-zone-editor-styles">
/* Modal */
.zone-editor-modal {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease, visibility 0.2s ease;
}
.zone-editor-modal.open {
    opacity: 1;
    visibility: visible;
}
.zone-editor-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
}
.zone-editor-dialog {
    position: relative;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    background: var(--color-surface, #FFFFFF);
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
    overflow: hidden;
    transform: scale(0.95) translateY(20px);
    transition: transform 0.2s ease;
    display: flex;
    flex-direction: column;
}
.zone-editor-modal.open .zone-editor-dialog {
    transform: scale(1) translateY(0);
}
.zone-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border, #E0E0E0);
}
.zone-editor-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary, #212121);
}
.zone-editor-close {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    font-size: 24px;
    line-height: 1;
    color: var(--color-text-secondary, #757575);
    cursor: pointer;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
}
.zone-editor-close:hover {
    background: var(--color-surface-variant, #F5F5F5);
    color: var(--color-text-primary, #212121);
}
.zone-editor-body {
    padding: 24px;
    overflow-y: auto;
    max-height: 60vh;
}
.zone-editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--color-border, #E0E0E0);
    background: var(--color-surface-variant, #FAFAFA);
}

/* Form */
.zone-editor-form { display: flex; flex-direction: column; gap: 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-group label { font-size: 13px; font-weight: 500; color: var(--color-text-primary, #212121); }
.required { color: var(--color-error, #E53935); }
.form-group input[type="text"],
.form-group input[type="number"] {
    padding: 12px 14px;
    border: 1px solid var(--color-border, #E0E0E0);
    border-radius: 10px;
    font-size: 15px;
    background: var(--color-surface, #FFFFFF);
    color: var(--color-text-primary, #212121);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.form-group input:focus {
    outline: none;
    border-color: var(--color-primary, #1E88E5);
    box-shadow: 0 0 0 3px var(--color-primary-light, #BBDEFB);
}
.form-hint { margin: 4px 0 0; font-size: 12px; color: var(--color-text-tertiary, #9E9E9E); }
.zone-editor-error {
    padding: 10px 12px;
    background: var(--color-error-light, #FDEDEC);
    color: var(--color-error, #E53935);
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 4px;
    animation: slideDown 0.2s ease;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* Zone Type Selector */
.zone-type-selector {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}
.zone-type-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px;
    border: 2px solid var(--color-border, #E0E0E0);
    border-radius: 12px;
    background: var(--color-surface, #FFFFFF);
    cursor: pointer;
    transition: all 0.15s ease;
}
.zone-type-btn:hover {
    border-color: var(--zone-color);
}
.zone-type-btn.active {
    border-color: var(--zone-color);
    background: var(--zone-color-light, rgba(var(--zone-color-rgb), 0.1));
}
.zone-type-icon { font-size: 20px; line-height: 1; }
.zone-type-label { font-size: 11px; font-weight: 500; color: var(--color-text-secondary, #757575); }
.zone-type-btn.active .zone-type-label { color: var(--zone-color); }
.zone-type-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 0 0 10px 10px;
    background: var(--zone-color);
    opacity: 0;
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.2s ease, opacity 0.15s ease;
}
.zone-type-btn.active .zone-type-indicator {
    opacity: 1;
    transform: scaleX(1);
}

/* Radius Control */
.radius-control { display: flex; align-items: center; gap: 12px; }
.radius-control input[type="range"] { flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: var(--color-border, #E0E0E0); border-radius: 3px; outline: none; }
.radius-control input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--color-primary, #1E88E5); cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.radius-value { min-width: 60px; font-size: 14px; font-weight: 600; color: var(--color-primary, #1E88E5); }
.radius-presets { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.radius-preset { padding: 6px 12px; border: 1px solid var(--color-border, #E0E0E0); border-radius: 20px; background: var(--color-surface, #FFFFFF); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
.radius-preset:hover { border-color: var(--color-primary, #1E88E5); color: var(--color-primary, #1E88E5); }
.radius-preset.active { background: var(--color-primary, #1E88E5); border-color: var(--color-primary, #1E88E5); color: white; }

/* Checkbox Toggle */
.form-group-checkbox { margin-top: 4px; }
.checkbox-wrapper { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px; color: var(--color-text-primary, #212121); }
.checkbox-wrapper input { position: absolute; opacity: 0; pointer-events: none; }
.checkmark { width: 20px; height: 20px; border: 2px solid var(--color-border, #E0E0E0); border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; }
.checkbox-wrapper input:checked + .checkmark { background: var(--color-primary, #1E88E5); border-color: var(--color-primary, #1E88E5); }
.checkbox-wrapper input:checked + .checkmark::after { content: '✓'; color: white; font-size: 12px; font-weight: bold; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; position: relative; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--color-primary, #1E88E5); color: white; }
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dark, #1565C0); }
.btn-secondary { background: var(--color-surface-variant, #F5F5F5); color: var(--color-text-primary, #212121); border: 1px solid var(--color-border, #E0E0E0); }
.btn-secondary:hover:not(:disabled) { background: var(--color-border, #E0E0E0); }
.btn-danger { background: var(--color-error-light, #FDEDEC); color: var(--color-error, #E53935); }
.btn-danger:hover:not(:disabled) { background: var(--color-error, #E53935); color: white; }
.btn-loader { display: none; width: 16px; height: 16px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.icon-btn { width: 36px; height: 36px; border: none; background: transparent; border-radius: 8px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease; }
.icon-btn:hover { background: var(--color-surface-variant, #F5F5F5); }

/* Zone List */
.zone-list { display: flex; flex-direction: column; gap: 12px; }
.zone-card { background: var(--color-surface, #FFFFFF); border: 1px solid var(--color-border, #E0E0E0); border-radius: 12px; padding: 16px; transition: all 0.15s ease; }
.zone-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-color: var(--color-border-light, #EEE); }
.zone-card.disabled { opacity: 0.6; background: var(--color-surface-variant, #F5F5F5); }
.zone-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.zone-type-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; }
.zone-type-icon { font-size: 12px; }
.zone-card-actions { display: flex; gap: 4px; }
.zone-name { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: var(--color-text-primary, #212121); }
.zone-meta { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-secondary, #757575); margin-bottom: 12px; }
.zone-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--color-border-light, #F0F0F0); }
.zone-status { font-size: 12px; font-weight: 500; color: var(--color-text-tertiary, #9E9E9E); }
.toggle-switch { position: relative; width: 44px; height: 26px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: var(--color-border, #E0E0E0); border-radius: 26px; transition: 0.2s; display: flex; align-items: center; padding: 2px; }
.toggle-slider::before { content: ''; width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: 0.2s; }
.toggle-switch input:checked + .toggle-slider { background: var(--color-primary, #1E88E5); }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
.zone-arrival-log { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light, #F0F0F0); }
.arrival-log-header { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-tertiary, #9E9E9E); margin-bottom: 8px; }
.arrival-log-items { display: flex; flex-direction: column; gap: 6px; }
.arrival-log-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-secondary, #757575); }
.arrival-type { font-size: 14px; }
.arrival-time { font-variant-numeric: tabular-nums; }
.zone-list-empty { text-align: center; padding: 48px 24px; color: var(--color-text-tertiary, #9E9E9E); }
.zone-list-empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
.zone-list-empty h4 { margin: 0 0 8px; font-size: 16px; color: var(--color-text-secondary, #757575); }
.zone-list-empty p { margin: 0 0 20px; font-size: 14px; }

/* Map Instruction Toast */
.map-instruction-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-text-primary, #212121);
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 1001;
    animation: slideUp 0.3s ease;
}
@keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* Dark Mode */
@media (prefers-color-scheme: dark) {
    :root[data-theme="dark"] .zone-editor-dialog { background: var(--color-surface, #1E1E1E); }
    :root[data-theme="dark"] .form-group input { background: var(--color-surface-variant, #2A2A2A); border-color: var(--color-border, #424242); color: var(--color-text-primary, #E0E0E0); }
    :root[data-theme="dark"] .form-group input:focus { border-color: var(--color-primary, #42A5F5); box-shadow: 0 0 0 3px var(--color-primary-dark, #1565C0); }
    :root[data-theme="dark"] .zone-type-btn { background: var(--color-surface, #1E1E1E); border-color: var(--color-border, #424242); }
    :root[data-theme="dark"] .zone-type-btn:hover { border-color: var(--zone-color); }
    :root[data-theme="dark"] .zone-card { background: var(--color-surface, #1E1E1E); border-color: var(--color-border, #333); }
    :root[data-theme="dark"] .zone-card.disabled { background: var(--color-surface-variant, #2A2A2A); }
    :root[data-theme="dark"] .zone-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    :root[data-theme="dark"] .btn-secondary { background: var(--color-surface-variant, #2A2A2A); border-color: var(--color-border, #424242); color: var(--color-text-primary, #E0E0E0); }
    :root[data-theme="dark"] .btn-secondary:hover:not(:disabled) { background: var(--color-border, #424242); }
    :root[data-theme="dark"] .radius-preset { background: var(--color-surface, #1E1E1E); border-color: var(--color-border, #424242); color: var(--color-text-primary, #E0E0E0); }
    :root[data-theme="dark"] .radius-preset:hover { border-color: var(--color-primary, #42A5F5); color: var(--color-primary, #42A5F5); }
    :root[data-theme="dark"] .radius-preset.active { background: var(--color-primary, #42A5F5); border-color: var(--color-primary, #42A5F5); }
    :root[data-theme="dark"] .zone-editor-error { background: var(--color-error-dark, #3E1E1E); color: var(--color-error-light, #EF9A9A); }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
    .zone-editor-modal, .zone-editor-dialog, .zone-type-btn, .btn, .toggle-slider::before, .zone-card, .icon-btn, .map-instruction-toast {
        transition: none !important;
        animation: none !important;
    }
}
</style>
`;

if (!document.getElementById('ctn-zone-editor-styles')) {
    document.head.insertAdjacentHTML('beforeend', zoneEditorStyles);
}