/**
 * pages/behaviour.js - Behaviour AI Page
 * Risk scoring, anomaly detection, and learned behaviour analysis
 */

import { State, showToast } from '../state.js';
import { createRadialGauge, createLinearGauge } from '../components/gauge.js';
import { createTimeline, createPaginatedTimeline } from '../components/timeline.js';

let riskGauge = null;
let activityGauge = null;
let anomalyTimeline = null;
let configLoaded = false;

export async function initBehaviourPage() {
    const container = document.getElementById('page-behaviour');
    if (!container) return;

    container.innerHTML = getBehaviourHTML();
    await loadBehaviourData();
    initGauges();
    initTimeline();
    setupEventListeners();
    subscribeToUpdates();
}

function getBehaviourHTML() {
    return `
        <div class="page page-behaviour" role="main">
            <header class="page-header">
                <h1>Behaviour AI</h1>
                <div class="page-header-actions">
                    <button class="btn btn-secondary btn-sm" id="btn-refresh-behaviour">
                        <span>↻</span>
                    </button>
                    <button class="btn btn-primary btn-sm" id="btn-test-anomaly">
                        <span>⚠️</span> Test Anomaly
                    </button>
                </div>
            </header>

            <div class="behaviour-grid">
                <!-- Risk Score Gauge -->
                <section class="behaviour-card risk-score-card" aria-labelledby="risk-title">
                    <div class="card-header">
                        <h2 id="risk-title">Risk Score</h2>
                        <span class="risk-state-large" id="risk-state-large">SAFE</span>
                    </div>
                    <div class="gauge-container" id="risk-gauge"></div>
                    <div class="risk-breakdown">
                        <div class="risk-band safe"><span class="band-color" style="background:#43A047"></span> Safe (0-30)</div>
                        <div class="risk-band watch"><span class="band-color" style="background:#1E88E5"></span> Watch (30-50)</div>
                        <div class="risk-band warning"><span class="band-color" style="background:#FB8C00"></span> Warning (50-70)</div>
                        <div class="risk-band emergency"><span class="band-color" style="background:#E53935"></span> Emergency (70-100)</div>
                    </div>
                </section>

                <!-- Current State & Activity -->
                <section class="behaviour-card" aria-labelledby="state-title">
                    <div class="card-header">
                        <h2 id="state-title">Current State</h2>
                    </div>
                    <div class="state-display">
                        <div class="state-badge" id="state-badge">SAFE</div>
                        <div class="state-meta">
                            <div class="state-item">
                                <span class="state-label">Mode</span>
                                <span class="state-value" id="behaviour-mode">LEARNING</span>
                            </div>
                            <div class="state-item">
                                <span class="state-label">Activity</span>
                                <span class="state-value" id="current-activity">Stationary</span>
                            </div>
                            <div class="state-item">
                                <span class="state-label">Safe Zone</span>
                                <span class="state-value" id="current-safe-zone">None</span>
                            </div>
                        </div>
                    </div>

                    <!-- Activity Classification -->
                    <div class="activity-section">
                        <h3>Activity Classification</h3>
                        <div class="activity-chips" id="activity-chips">
                            <span class="activity-chip" data-activity="stationary">Stationary</span>
                            <span class="activity-chip" data-activity="walking">Walking</span>
                            <span class="activity-chip" data-activity="in_vehicle">In Vehicle</span>
                            <span class="activity-chip" data-activity="running">Running</span>
                            <span class="activity-chip" data-activity="unknown">Unknown</span>
                        </div>
                    </div>
                </section>

                <!-- School Attendance -->
                <section class="behaviour-card school-card" aria-labelledby="school-title">
                    <div class="card-header">
                        <h2 id="school-title">🏫 School Attendance</h2>
                    </div>
                    <div class="school-stats">
                        <div class="school-stat">
                            <span class="stat-value" id="attendance-today">Present</span>
                            <span class="stat-label">Today</span>
                        </div>
                        <div class="school-stat">
                            <span class="stat-value" id="attendance-week">5/5</span>
                            <span class="stat-label">This Week</span>
                        </div>
                        <div class="school-stat">
                            <span class="stat-value" id="attendance-month">95%</span>
                            <span class="stat-label">This Month</span>
                        </div>
                    </div>
                    <div class="school-schedule" id="school-schedule">
                        <div class="schedule-item">
                            <span class="schedule-time">07:30</span>
                            <span class="schedule-label">Arrival Window</span>
                        </div>
                        <div class="schedule-item">
                            <span class="schedule-time">14:30</span>
                            <span class="schedule-label">Departure Window</span>
                        </div>
                    </div>
                </section>

                <!-- Safe Zone Status -->
                <section class="behaviour-card" aria-labelledby="zone-status-title">
                    <div class="card-header">
                        <h2 id="zone-status-title">📍 Safe Zone Status</h2>
                    </div>
                    <div class="zone-status-grid" id="zone-status-grid">
                        <div class="zone-status-card home">
                            <div class="zone-status-header">
                                <span class="zone-icon">🏠</span>
                                <span class="zone-name">Home</span>
                            </div>
                            <div class="zone-status-body">
                                <span class="zone-state" id="home-state">Outside</span>
                                <span class="zone-time" id="home-time">--</span>
                            </div>
                        </div>
                        <div class="zone-status-card school">
                            <div class="zone-status-header">
                                <span class="zone-icon">🏫</span>
                                <span class="zone-name">School</span>
                            </div>
                            <div class="zone-status-body">
                                <span class="zone-state" id="school-state">Outside</span>
                                <span class="zone-time" id="school-time">--</span>
                            </div>
                        </div>
                    </div>
                    <div class="other-zones" id="other-zones"></div>
                </section>

                <!-- Anomaly Timeline -->
                <section class="behaviour-card anomaly-card" aria-labelledby="anomaly-title">
                    <div class="card-header">
                        <h2 id="anomaly-title">⚠️ Anomaly Timeline</h2>
                        <span class="anomaly-count" id="anomaly-total">0 total</span>
                    </div>
                    <div class="timeline-container" id="anomaly-timeline"></div>
                </section>

                <!-- Learned Locations -->
                <section class="behaviour-card" aria-labelledby="learned-title">
                    <div class="card-header">
                        <h2 id="learned-title">🧠 Learned Locations</h2>
                    </div>
                    <div class="learned-list" id="learned-list">
                        <div class="learned-item">
                            <span class="learned-icon">🏠</span>
                            <div class="learned-info">
                                <span class="learned-name">Home</span>
                                <span class="learned-coords" id="home-coords">Learning...</span>
                            </div>
                            <span class="learned-status" id="home-learned">Learning</span>
                        </div>
                        <div class="learned-item">
                            <span class="learned-icon">🏫</span>
                            <div class="learned-info">
                                <span class="learned-name">School</span>
                                <span class="learned-coords" id="school-coords">Learning...</span>
                            </div>
                            <span class="learned-status" id="school-learned">Learning</span>
                        </div>
                        <div class="learned-item">
                            <span class="learned-icon">🛤️</span>
                            <div class="learned-info">
                                <span class="learned-name">Route Points</span>
                                <span class="learned-coords" id="route-count">0 learned</span>
                            </div>
                            <span class="learned-status" id="route-learned">Learning</span>
                        </div>
                    </div>
                </section>

                <!-- Configuration -->
                <section class="behaviour-card config-card" aria-labelledby="config-title">
                    <div class="card-header">
                        <h2 id="config-title">⚙️ Configuration</h2>
                        <label class="toggle-switch">
                            <input type="checkbox" id="behaviour-enabled" checked>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <p class="config-desc" id="config-desc">Behaviour AI is enabled</p>

                    <div class="config-grid">
                        <div class="config-item">
                            <label for="sensitivity">Sensitivity</label>
                            <select id="sensitivity" class="config-select">
                                <option value="low">Low</option>
                                <option value="medium" selected>Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div class="config-item">
                            <label for="deviation-threshold">Deviation Threshold (m)</label>
                            <input type="number" id="deviation-threshold" class="config-input" min="10" max="500" value="100">
                        </div>
                        <div class="config-item">
                            <label for="stop-duration">Long Stop Duration (min)</label>
                            <input type="number" id="stop-duration" class="config-input" min="1" max="60" value="5">
                        </div>
                        <div class="config-item">
                            <label for="night-start">Night Hours Start</label>
                            <input type="time" id="night-start" class="config-input" value="22:00">
                        </div>
                        <div class="config-item">
                            <label for="night-end">Night Hours End</label>
                            <input type="time" id="night-end" class="config-input" value="06:00">
                        </div>
                        <div class="config-item">
                            <label for="speed-walking">Walking Speed Max (km/h)</label>
                            <input type="number" id="speed-walking" class="config-input" min="1" max="15" value="7">
                        </div>
                        <div class="config-item">
                            <label for="speed-running">Running Speed Min (km/h)</label>
                            <input type="number" id="speed-running" class="config-input" min="5" max="30" value="12">
                        </div>
                        <div class="config-item">
                            <label for="speed-vehicle">Vehicle Speed Min (km/h)</label>
                            <input type="number" id="speed-vehicle" class="config-input" min="10" max="100" value="25">
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-primary" id="btn-save-config">Save Configuration</button>
                        <button class="btn btn-secondary" id="btn-reset-config">Reset to Defaults</button>
                    </div>
                </section>
            </div>
        </div>
    `;
}

async function loadBehaviourData() {
    try {
        const [statusRes, configRes, routesRes] = await Promise.all([
            fetch('/api/behaviour/status'),
            fetch('/api/behaviour/config'),
            fetch('/api/behaviour/routes')
        ]);

        const [status, config, routes] = await Promise.all([
            statusRes.json(),
            configRes.json(),
            routesRes.json()
        ]);

        if (status) {
            State.behaviour.value = { ...State.behaviour.value, ...status };
        }
        if (config) {
            State.behaviourConfig.value = config;
            populateConfig(config);
        }
        if (routes) {
            State.behaviourRoutes.value = routes;
        }

        updateUI();
    } catch (e) {
        console.error('Failed to load behaviour data:', e);
        showToast('Failed to load behaviour data', 'error');
    }
}

function updateUI() {
    const behaviour = State.behaviour.value;
    const config = State.behaviourConfig.value;
    const routes = State.behaviourRoutes.value;

    // Risk gauge
    if (riskGauge) {
        riskGauge.setValue(behaviour.riskScore || 0);
    }

    // Risk state
    const stateLabels = ['SAFE', 'WATCH', 'WARNING', 'EMERGENCY'];
    const state = behaviour.stateCode !== undefined ? stateLabels[behaviour.stateCode] : behaviour.state || 'SAFE';
    document.getElementById('risk-state-large').textContent = state;
    document.getElementById('risk-state-large').className = `risk-state-large ${state.toLowerCase()}`;
    document.getElementById('state-badge').textContent = state;
    document.getElementById('state-badge').className = `state-badge ${state.toLowerCase()}`;

    // Mode
    document.getElementById('behaviour-mode').textContent = behaviour.learningMode ? 'LEARNING' : 'NORMAL';

    // Activity
    const activities = ['Unknown', 'Stationary', 'Walking', 'Running', 'In Vehicle'];
    const activity = activities[behaviour.activityType] || 'Unknown';
    document.getElementById('current-activity').textContent = activity;
    updateActivityChips(behaviour.activityType || 0);

    // Safe zone status
    updateZoneStatus(behaviour);

    // Anomaly count
    document.getElementById('anomaly-count').textContent = behaviour.anomalyCount || 0;
    document.getElementById('anomaly-total').textContent = `${behaviour.anomalyCount || 0} total`;

    // Anomaly timeline
    if (anomalyTimeline && behaviour.recentAnomalies) {
        const timelineEvents = behaviour.recentAnomalies.map((a, i) => ({
            id: a.timestamp || Date.now() - i * 1000,
            type: getAnomalyTypeKey(a.type),
            timestamp: a.timestamp,
            message: getAnomalyMessage(a.type, a.details),
            details: a.details,
            location: a.location
        }));
        anomalyTimeline.setEvents(timelineEvents);
    }

    // Learned locations
    updateLearnedLocations();

    // School attendance
    updateSchoolAttendance();
}

function updateActivityChips(activeType) {
    document.querySelectorAll('.activity-chip').forEach(chip => {
        const type = chip.dataset.activity;
        const typeMap = { stationary: 1, walking: 2, in_vehicle: 3, running: 4, unknown: 0 };
        chip.classList.toggle('active', typeMap[type] === activeType);
    });
}

function updateZoneStatus(behaviour) {
    // Home zone
    const homeInside = behaviour.inHomeZone || false;
    document.getElementById('home-state').textContent = homeInside ? 'Inside' : 'Outside';
    document.getElementById('home-state').className = `zone-state ${homeInside ? 'inside' : 'outside'}`;
    document.getElementById('home-time').textContent = homeInside && behaviour.homeEnteredAt ?
        `Since ${new Date(behaviour.homeEnteredAt).toLocaleTimeString()}` :
        behaviour.homeExitedAt ? `Left ${new Date(behaviour.homeExitedAt).toLocaleTimeString()}` : '--';

    // School zone
    const schoolInside = behaviour.inSchoolZone || false;
    document.getElementById('school-state').textContent = schoolInside ? 'Inside' : 'Outside';
    document.getElementById('school-state').className = `zone-state ${schoolInside ? 'inside' : 'outside'}`;
    document.getElementById('school-time').textContent = schoolInside && behaviour.schoolEnteredAt ?
        `Since ${new Date(behaviour.schoolEnteredAt).toLocaleTimeString()}` :
        behaviour.schoolExitedAt ? `Left ${new Date(behaviour.schoolExitedAt).toLocaleTimeString()}` : '--';
}

function updateLearnedLocations() {
    const profile = State.behaviour.value.profile || {};

    // Home
    if (profile.homeLat && profile.homeLon) {
        document.getElementById('home-coords').textContent = `${profile.homeLat.toFixed(6)}, ${profile.homeLon.toFixed(6)}`;
        document.getElementById('home-learned').textContent = 'Learned';
        document.getElementById('home-learned').className = 'learned-status learned';
    } else {
        document.getElementById('home-coords').textContent = 'Not learned';
        document.getElementById('home-learned').textContent = 'Learning';
        document.getElementById('home-learned').className = 'learned-status learning';
    }

    // School
    if (profile.schoolLat && profile.schoolLon) {
        document.getElementById('school-coords').textContent = `${profile.schoolLat.toFixed(6)}, ${profile.schoolLon.toFixed(6)}`;
        document.getElementById('school-learned').textContent = 'Learned';
        document.getElementById('school-learned').className = 'learned-status learned';
    } else {
        document.getElementById('school-coords').textContent = 'Not learned';
        document.getElementById('school-learned').textContent = 'Learning';
        document.getElementById('school-learned').className = 'learned-status learning';
    }

    // Route points
    const routeCount = State.behaviourRoutes.value?.length || 0;
    document.getElementById('route-count').textContent = `${routeCount} learned`;
    document.getElementById('route-learned').textContent = routeCount > 0 ? 'Learned' : 'Learning';
    document.getElementById('route-learned').className = routeCount > 0 ? 'learned-status learned' : 'learned-status learning';
}

function updateSchoolAttendance() {
    // This would come from behaviour profile / learned schedule
    // For now, show placeholder
    document.getElementById('attendance-today').textContent = 'Present';
    document.getElementById('attendance-week').textContent = '5/5';
    document.getElementById('attendance-month').textContent = '95%';
}

function getAnomalyTypeKey(type) {
    const types = {
        1: 'route_deviation',
        2: 'long_stop',
        3: 'running',
        4: 'wandering',
        5: 'leaving_school',
        6: 'leaving_safe_zone',
        7: 'night_movement',
        8: 'repeated_movement',
        9: 'unexpected_movement'
    };
    return types[type] || 'default';
}

function getAnomalyMessage(type, details) {
    const messages = {
        1: 'Route deviation detected',
        2: 'Extended stop detected',
        3: 'Running detected',
        4: 'Wandering pattern',
        5: 'Left school unexpectedly',
        6: 'Left safe zone',
        7: 'Night movement detected',
        8: 'Repeated movement pattern',
        9: 'Unexpected movement'
    };
    return messages[type] || 'Anomaly detected';
}

function initGauges() {
    riskGauge = createRadialGauge('risk-gauge', {
        size: 200,
        strokeWidth: 16,
        label: 'RISK SCORE',
        colorBands: [
            { from: 0, to: 30, color: '#43A047', label: 'SAFE' },
            { from: 30, to: 50, color: '#1E88E5', label: 'WATCH' },
            { from: 50, to: 70, color: '#FB8C00', label: 'WARNING' },
            { from: 70, to: 100, color: '#E53935', label: 'EMERGENCY' }
        ]
    });
    riskGauge.setValue(State.behaviour.value.riskScore || 0, false);
}

function initTimeline() {
    anomalyTimeline = createTimeline('anomaly-timeline', {
        events: [],
        maxEvents: 30,
        typeColors: {
            safe_arrival: '#43A047',
            safe_departure: '#1E88E5',
            route_deviation: '#FB8C00',
            long_stop: '#8E24AA',
            running: '#E53935',
            wandering: '#FF8F00',
            leaving_school: '#E53935',
            leaving_safe_zone: '#E53935',
            night_movement: '#5C6BC0',
            repeated_movement: '#00ACC1',
            unexpected_movement: '#FB8C00',
            panic: '#C62828',
            default: '#757575'
        },
        typeLabels: {
            safe_arrival: 'Safe Arrival',
            safe_departure: 'Safe Departure',
            route_deviation: 'Route Deviation',
            long_stop: 'Long Stop',
            running: 'Running',
            wandering: 'Wandering',
            leaving_school: 'Leaving School',
            leaving_safe_zone: 'Leaving Safe Zone',
            night_movement: 'Night Movement',
            repeated_movement: 'Repeated Movement',
            unexpected_movement: 'Unexpected Movement',
            panic: 'Panic Button'
        },
        typeIcons: {
            safe_arrival: '🏠',
            safe_departure: '🚶',
            route_deviation: '⚠️',
            long_stop: '⏸️',
            running: '🏃',
            wandering: '🔄',
            leaving_school: '🏫',
            leaving_safe_zone: '📍',
            night_movement: '🌙',
            repeated_movement: '🔁',
            unexpected_movement: '❓',
            panic: '🚨'
        }
    });
}

function populateConfig(config) {
    document.getElementById('behaviour-enabled').checked = config.enabled !== false;
    document.getElementById('sensitivity').value = config.sensitivity || 'medium';
    document.getElementById('deviation-threshold').value = config.deviationThreshold || 100;
    document.getElementById('stop-duration').value = config.longStopDuration || 5;
    document.getElementById('night-start').value = config.nightStart || '22:00';
    document.getElementById('night-end').value = config.nightEnd || '06:00';
    document.getElementById('speed-walking').value = config.maxWalkingSpeed || 7;
    document.getElementById('speed-running').value = config.minRunningSpeed || 12;
    document.getElementById('speed-vehicle').value = config.minVehicleSpeed || 25;

    // Update toggle label
    const enabled = config.enabled !== false;
    document.getElementById('config-desc').textContent = enabled ? 'Behaviour AI is enabled' : 'Behaviour AI is disabled';
}

function setupEventListeners() {
    // Refresh
    document.getElementById('btn-refresh-behaviour')?.addEventListener('click', loadBehaviourData);

    // Test anomaly
    document.getElementById('btn-test-anomaly')?.addEventListener('click', async () => {
        try {
            await fetch('/api/behaviour/test-anomaly', { method: 'POST' });
            showToast('Test anomaly triggered', 'info');
        } catch (e) {
            showToast('Failed to trigger anomaly', 'error');
        }
    });

    // Config changes
    document.getElementById('behaviour-enabled')?.addEventListener('change', (e) => {
        document.getElementById('config-desc').textContent = e.target.checked ? 'Behaviour AI is enabled' : 'Behaviour AI is disabled';
    });

    // Save config
    document.getElementById('btn-save-config')?.addEventListener('click', saveConfig);

    // Reset config
    document.getElementById('btn-reset-config')?.addEventListener('click', async () => {
        if (!confirm('Reset all behaviour configuration to defaults?')) return;
        try {
            await fetch('/api/behaviour/config/reset', { method: 'POST' });
            showToast('Configuration reset', 'success');
            loadBehaviourData();
        } catch (e) {
            showToast('Failed to reset config', 'error');
        }
    });
}

async function saveConfig() {
    const config = {
        enabled: document.getElementById('behaviour-enabled').checked,
        sensitivity: document.getElementById('sensitivity').value,
        deviationThreshold: parseInt(document.getElementById('deviation-threshold').value, 10),
        longStopDuration: parseInt(document.getElementById('stop-duration').value, 10),
        nightStart: document.getElementById('night-start').value,
        nightEnd: document.getElementById('night-end').value,
        maxWalkingSpeed: parseFloat(document.getElementById('speed-walking').value),
        minRunningSpeed: parseFloat(document.getElementById('speed-running').value),
        minVehicleSpeed: parseFloat(document.getElementById('speed-vehicle').value)
    };

    try {
        const response = await fetch('/api/behaviour/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save config');
        showToast('Configuration saved', 'success');
        loadBehaviourData();
    } catch (e) {
        showToast(e.message || 'Failed to save config', 'error');
    }
}

function subscribeToUpdates() {
    State.behaviour.subscribe(() => {
        if (riskGauge) {
            riskGauge.setValue(State.behaviour.value.riskScore || 0);
        }
        updateUI();
    });

    State.behaviourConfig.subscribe(() => {
        // Config updated
    });
}

export function destroyBehaviourPage() {
    if (riskGauge) {
        riskGauge.destroy();
        riskGauge = null;
    }
    if (anomalyTimeline) {
        anomalyTimeline.destroy();
        anomalyTimeline = null;
    }
}