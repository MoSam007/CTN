/**
 * pages/dashboard.js - Health Dashboard Page
 * Device health overview with key metrics and status cards
 */

import { State, formatUptime, formatBytes, showToast } from '../state.js';
import { createRadialGauge } from '../components/gauge.js';
import { initMap, updateDeviceLocation, centerOnDevice, destroyMap } from '../components/map.js';

let riskGauge = null;
let batteryGauge = null;
let mapInitialized = false;
let demoScenarioInterval = null;

export async function initDashboardPage() {
    const container = document.getElementById('page-dashboard');
    if (!container) return;

    container.innerHTML = getDashboardHTML();
    await renderDashboard();
    setupEventListeners();
    subscribeToState();

    // Fetch initial device status from API (WebSocket is disabled in firmware)
    fetchInitialStatus();
}

async function fetchInitialStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            const data = await response.json();
            updateStateFromStatus(data);
        }
    } catch (e) {
        console.error('Failed to fetch initial status:', e);
    }
}

function updateStateFromStatus(data) {
    // Update battery
    if (data.battery) {
        State.battery.value = { ...State.battery.value, ...data.battery };
    }

    // Update GPS
    if (data.gps) {
        State.gps.value = { ...State.gps.value, ...data.gps };
    }

    // Update WiFi
    if (data.wifi) {
        State.wifi.value = { ...State.wifi.value, ...data.wifi };
    }

    // Update Device/Firmware
    if (data.firmwareVersion || data.deviceName || data.uptime || data.freeHeap) {
        State.device.value = {
            ...State.device.value,
            firmware: data.firmwareVersion,
            name: data.deviceName,
            uptime: data.uptime,
            freeHeap: data.freeHeap,
            chipId: data.flashChipSize ? parseInt(data.flashChipSize) : 0,
            resetReason: data.resetReason
        };
    }

    // Update Behaviour
    if (data.behaviour) {
        State.behaviour.value = {
            ...State.behaviour.value,
            riskScore: data.behaviour.riskScore ?? State.behaviour.value.riskScore,
            state: data.behaviour.stateStr ?? State.behaviour.value.state,
            anomalyCount: 0
        };
    }

    // Update Telegram
    if (data.telegram) {
        State.telegram.value = {
            ...State.telegram.value,
            configured: data.telegram.configured,
            enabled: data.telegram.enabled
        };
    }

    // Update demo mode
    if (data.demoMode !== undefined) {
        State.demoMode.value = data.demoMode;
    }

    // Update device status badge in header
    updateDeviceStatusBadge(data);
}

function updateDeviceStatusBadge(data) {
    const badge = document.getElementById('device-status');
    if (!badge) return;

    const wifi = data.wifi;
    let text, className;

    if (wifi?.connected) {
        text = 'Connected';
        className = 'status-connected';
    } else if (wifi?.mode === 'AP' || wifi?.apMode) {
        text = 'AP Mode';
        className = 'status-ap';
    } else {
        text = 'Disconnected';
        className = 'status-disconnected';
    }

    badge.textContent = text;
    badge.className = `status-badge ${className}`;
}

function getDashboardHTML() {
    return `
        <div class="page page-dashboard" role="main">
            <header class="page-header">
                <h1>Dashboard</h1>
                <div class="page-header-actions">
                    <button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" aria-label="Refresh">
                        <span>↻</span>
                    </button>
                    <button class="btn btn-danger btn-sm" id="btn-panic-test" aria-label="Test Panic Alert">
                        <span>🚨</span> Panic Test
                    </button>
                </div>
            </header>

            <!-- Demo Mode Banner -->
            <div class="demo-banner" id="demo-banner" style="display: none;" role="status" aria-live="polite">
                <span class="demo-banner-icon">🧪</span>
                <span class="demo-banner-text">Demo Mode: <strong id="demo-scenario-name">Idle</strong></span>
                <button class="btn btn-sm btn-secondary" id="btn-exit-demo">Exit Demo</button>
            </div>

            <!-- Status Grid -->
            <div class="dashboard-grid">
                <!-- Risk Score Gauge - Prominent -->
                <section class="dashboard-card risk-score-card" aria-labelledby="risk-score-title">
                    <div class="card-header">
                        <h2 id="risk-score-title">Risk Score</h2>
                        <span class="risk-state-badge" id="risk-state-badge">SAFE</span>
                    </div>
                    <div class="gauge-container" id="risk-gauge"></div>
                    <div class="risk-details">
                        <div class="risk-detail">
                            <span class="risk-label">State</span>
                            <span class="risk-value" id="behaviour-state">SAFE</span>
                        </div>
                        <div class="risk-detail">
                            <span class="risk-label">Anomalies</span>
                            <span class="risk-value" id="anomaly-count">0</span>
                        </div>
                    </div>
                </section>

                <!-- Battery -->
                <section class="dashboard-card" aria-labelledby="battery-title">
                    <div class="card-header">
                        <h2 id="battery-title">Battery</h2>
                        <span class="battery-status" id="battery-status">Good</span>
                    </div>
                    <div class="battery-visual">
                        <div class="battery-svg" id="battery-svg"></div>
                        <div class="battery-percent" id="battery-percent">85%</div>
                    </div>
                    <div class="metric-row">
                        <div class="metric">
                            <span class="metric-label">Voltage</span>
                            <span class="metric-value" id="battery-voltage">3.82V</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Runtime</span>
                            <span class="metric-value" id="battery-runtime">48h</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Health</span>
                            <span class="metric-value" id="battery-health">Good</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-secondary" id="btn-toggle-charge" aria-label="Toggle Charging">
                            <span id="charge-btn-icon">🔌</span> <span id="charge-btn-text">Plug In</span>
                        </button>
                    </div>
                </section>

                <!-- GPS -->
                <section class="dashboard-card" aria-labelledby="gps-title">
                    <div class="card-header">
                        <h2 id="gps-title">GPS</h2>
                        <span class="gps-fix-indicator" id="gps-fix-indicator">
                            <span class="fix-dot"></span> Fix
                        </span>
                    </div>
                    <div class="gps-coords" id="gps-coords">-1.292100, 36.821900</div>
                    <div class="metric-row">
                        <div class="metric">
                            <span class="metric-label">Satellites</span>
                            <span class="metric-value" id="gps-sats">8</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Accuracy</span>
                            <span class="metric-value" id="gps-accuracy">6m</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Speed</span>
                            <span class="metric-value" id="gps-speed">0 km/h</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <a href="#" class="btn btn-sm btn-primary" id="btn-open-maps" target="_blank">
                            <span>🗺️</span> Open in Maps
                        </a>
                    </div>
                </section>

                <!-- WiFi -->
                <section class="dashboard-card" aria-labelledby="wifi-title">
                    <div class="card-header">
                        <h2 id="wifi-title">WiFi</h2>
                        <span class="wifi-status" id="wifi-status">Disconnected</span>
                    </div>
                    <div class="wifi-signal" id="wifi-signal">
                        <div class="signal-bars" id="signal-bars"></div>
                        <span class="signal-text" id="signal-text">No signal</span>
                    </div>
                    <div class="metric-row">
                        <div class="metric">
                            <span class="metric-label">SSID</span>
                            <span class="metric-value" id="wifi-ssid">--</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">RSSI</span>
                            <span class="metric-value" id="wifi-rssi">--</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Internet</span>
                            <span class="metric-value" id="wifi-internet">--</span>
                        </div>
                    </div>
                </section>

                <!-- Telegram -->
                <section class="dashboard-card" aria-labelledby="telegram-title">
                    <div class="card-header">
                        <h2 id="telegram-title">Telegram</h2>
                        <span class="telegram-status" id="telegram-status">Not Configured</span>
                    </div>
                    <p class="telegram-desc" id="telegram-desc">Configure bot token and chat ID in Settings</p>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-primary" id="btn-test-telegram" disabled>
                            <span>📤</span> Test
                        </button>
                    </div>
                </section>

                <!-- Device Info -->
                <section class="dashboard-card device-info-card" aria-labelledby="device-title">
                    <div class="card-header">
                        <h2 id="device-title">Device</h2>
                        <span class="device-name" id="device-name">CTN-001</span>
                    </div>
                    <div class="metric-row">
                        <div class="metric">
                            <span class="metric-label">Firmware</span>
                            <span class="metric-value" id="fw-version">1.0</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Uptime</span>
                            <span class="metric-value" id="device-uptime">0s</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Free Heap</span>
                            <span class="metric-value" id="free-heap">--</span>
                        </div>
                    </div>
                    <div class="metric-row">
                        <div class="metric">
                            <span class="metric-label">Chip ID</span>
                            <span class="metric-value" id="chip-id">--</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Reset Reason</span>
                            <span class="metric-value" id="reset-reason">--</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Flash Free</span>
                            <span class="metric-value" id="flash-free">--</span>
                        </div>
                    </div>
                </section>

                <!-- Safe Zone Indicator -->
                <section class="dashboard-card" aria-labelledby="zone-title">
                    <div class="card-header">
                        <h2 id="zone-title">Safe Zone</h2>
                        <span class="zone-indicator" id="zone-indicator">Outside</span>
                    </div>
                    <div class="zone-current" id="zone-current">Not in a safe zone</div>
                    <div class="zone-time" id="zone-time"></div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-secondary" id="btn-view-zones">
                            <span>📍</span> View Zones
                        </button>
                    </div>
                </section>

                <!-- Quick Actions -->
                <section class="dashboard-card quick-actions-card" aria-labelledby="actions-title">
                    <div class="card-header">
                        <h2 id="actions-title">Quick Actions</h2>
                    </div>
                    <div class="quick-actions-grid">
                        <button class="action-btn" id="action-demo-walk" data-scenario="walk_to_school">
                            <span class="action-icon">🏫</span>
                            <span>School Run</span>
                        </button>
                        <button class="action-btn" id="action-demo-deviation" data-scenario="route_deviation">
                            <span class="action-icon">⚠️</span>
                            <span>Route Deviation</span>
                        </button>
                        <button class="action-btn" id="action-demo-panic" data-scenario="panic_button">
                            <span class="action-icon">🚨</span>
                            <span>Panic Alert</span>
                        </button>
                        <button class="action-btn" id="action-demo-lowbat" data-scenario="low_battery">
                            <span class="action-icon">🔋</span>
                            <span>Low Battery</span>
                        </button>
                    </div>
                </section>
            </div>
        </div>
    `;
}

async function renderDashboard() {
    await updateAllCards();
    initRiskGauge();
    updateBatteryVisual();
    updateSignalBars();
}

async function updateAllCards() {
    const behaviour = State.behaviour.value;
    const battery = State.battery.value;
    const gps = State.gps.value;
    const wifi = State.wifi.value;
    const telegram = State.telegram.value;
    const device = State.device.value;
    const demoMode = State.demoMode.value;
    const demoScenario = State.demoScenario.value;
    const demoScenarioName = State.demoScenarioName.value;

    // Demo banner
    const demoBanner = document.getElementById('demo-banner');
    const demoScenarioEl = document.getElementById('demo-scenario-name');
    if (demoMode) {
        demoBanner.style.display = 'flex';
        demoScenarioEl.textContent = demoScenarioName;
    } else {
        demoBanner.style.display = 'none';
    }

    // Risk Score
    if (riskGauge) {
        riskGauge.setValue(behaviour.riskScore);
    }
    const stateLabel = behaviour.state || State.riskLabel.value;
    document.getElementById('risk-state-badge').textContent = stateLabel;
    document.getElementById('risk-state-badge').className = `risk-state-badge ${stateLabel.toLowerCase()}`;
    document.getElementById('behaviour-state').textContent = stateLabel;
    document.getElementById('anomaly-count').textContent = behaviour.anomalyCount || 0;

    // Battery
    document.getElementById('battery-percent').textContent = `${battery.percentage}%`;
    document.getElementById('battery-voltage').textContent = `${battery.voltage?.toFixed(2) || 0}V`;
    document.getElementById('battery-runtime').textContent = `${battery.runtimeHours || 0}h`;
    document.getElementById('battery-health').textContent = battery.health || 'Good';
    document.getElementById('battery-status').textContent = battery.state || 'Good';
    document.getElementById('battery-status').className = `battery-status ${(battery.state || '').toLowerCase()}`;

    const chargeBtn = document.getElementById('btn-toggle-charge');
    const chargeIcon = document.getElementById('charge-btn-icon');
    const chargeText = document.getElementById('charge-btn-text');
    if (battery.charging) {
        chargeIcon.textContent = '🔋';
        chargeText.textContent = 'Unplug';
    } else {
        chargeIcon.textContent = '🔌';
        chargeText.textContent = 'Plug In';
    }

    // GPS
    if (gps.hasFix) {
        document.getElementById('gps-coords').textContent = `${gps.latitude?.toFixed(6) || 0}, ${gps.longitude?.toFixed(6) || 0}`;
        document.getElementById('gps-sats').textContent = gps.satellites || 0;
        document.getElementById('gps-accuracy').textContent = `${gps.accuracy || 0}m`;
        document.getElementById('gps-speed').textContent = `${gps.speed?.toFixed(1) || 0} km/h`;

        const fixIndicator = document.getElementById('gps-fix-indicator');
        fixIndicator.className = 'gps-fix-indicator has-fix';
        fixIndicator.innerHTML = '<span class="fix-dot"></span> Fix';

        // Update maps link
        const mapsLink = document.getElementById('btn-open-maps');
        mapsLink.href = `https://maps.google.com/?q=${gps.latitude},${gps.longitude}`;
    } else {
        document.getElementById('gps-coords').textContent = 'No fix';
        document.getElementById('gps-sats').textContent = gps.satellites || 0;
        document.getElementById('gps-accuracy').textContent = '--';
        document.getElementById('gps-speed').textContent = '--';

        const fixIndicator = document.getElementById('gps-fix-indicator');
        fixIndicator.className = 'gps-fix-indicator no-fix';
        fixIndicator.innerHTML = '<span class="fix-dot"></span> No Fix';
    }

    // WiFi
    if (wifi.connected) {
        document.getElementById('wifi-status').textContent = 'Connected';
        document.getElementById('wifi-status').className = 'wifi-status connected';
        document.getElementById('wifi-ssid').textContent = wifi.ssid || 'Unknown';
        document.getElementById('wifi-rssi').textContent = `${wifi.rssi || 0} dBm`;
        document.getElementById('wifi-internet').textContent = wifi.internet ? 'Yes' : 'No';
        document.getElementById('wifi-internet').className = wifi.internet ? 'metric-value success' : 'metric-value warning';
    } else if (wifi.apMode) {
        document.getElementById('wifi-status').textContent = 'AP Mode';
        document.getElementById('wifi-status').className = 'wifi-status ap-mode';
        document.getElementById('wifi-ssid').textContent = wifi.apSsid || 'CTN-Setup';
        document.getElementById('wifi-rssi').textContent = '--';
        document.getElementById('wifi-internet').textContent = 'N/A';
    } else {
        document.getElementById('wifi-status').textContent = 'Disconnected';
        document.getElementById('wifi-status').className = 'wifi-status disconnected';
        document.getElementById('wifi-ssid').textContent = '--';
        document.getElementById('wifi-rssi').textContent = '--';
        document.getElementById('wifi-internet').textContent = '--';
    }

    // Telegram
    if (telegram.configured && telegram.enabled) {
        document.getElementById('telegram-status').textContent = 'Connected';
        document.getElementById('telegram-status').className = 'telegram-status connected';
        document.getElementById('telegram-desc').textContent = 'Alerts will be sent via Telegram';
        document.getElementById('btn-test-telegram').disabled = false;
    } else if (telegram.configured && !telegram.enabled) {
        document.getElementById('telegram-status').textContent = 'Disabled';
        document.getElementById('telegram-status').className = 'telegram-status disabled';
        document.getElementById('telegram-desc').textContent = 'Telegram configured but disabled';
        document.getElementById('btn-test-telegram').disabled = true;
    } else {
        document.getElementById('telegram-status').textContent = 'Not Configured';
        document.getElementById('telegram-status').className = 'telegram-status not-configured';
        document.getElementById('telegram-desc').textContent = 'Configure bot token and chat ID in Settings';
        document.getElementById('btn-test-telegram').disabled = true;
    }

    // Device
    document.getElementById('device-name').textContent = device.name || 'CTN-001';
    document.getElementById('fw-version').textContent = device.firmware || '1.0';
    document.getElementById('device-uptime').textContent = formatUptime(device.uptime || 0);
    document.getElementById('free-heap').textContent = formatBytes(device.freeHeap || 0);
    document.getElementById('chip-id').textContent = device.chipId ? '#' + device.chipId.toString(16).toUpperCase() : '--';
    document.getElementById('reset-reason').textContent = device.resetReason || 'Unknown';
    document.getElementById('flash-free').textContent = formatBytes(device.flashFree || 0);

    // Safe Zone
    const currentZone = getCurrentZone();
    if (currentZone) {
        document.getElementById('zone-indicator').textContent = 'Inside';
        document.getElementById('zone-indicator').className = 'zone-indicator inside';
        document.getElementById('zone-current').textContent = `Inside ${currentZone.name}`;
    } else {
        document.getElementById('zone-indicator').textContent = 'Outside';
        document.getElementById('zone-indicator').className = 'zone-indicator outside';
        document.getElementById('zone-current').textContent = 'Not in a safe zone';
    }
}

function getCurrentZone() {
    const zones = State.safeZones.value;
    const gps = State.gps.value;
    if (!gps.hasFix || !gps.latitude || !gps.longitude) return null;

    for (const zone of zones) {
        if (zone.enabled === false) continue;
        const dist = calculateDistance(gps.latitude, gps.longitude, zone.latitude, zone.longitude);
        if (dist <= zone.radius) return zone;
    }
    return null;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function initRiskGauge() {
    if (riskGauge) return;

    riskGauge = createRadialGauge('risk-gauge', {
        size: 180,
        strokeWidth: 14,
        min: 0,
        max: 100,
        startAngle: -135,
        endAngle: 135,
        label: 'RISK SCORE',
        colorBands: [
            { from: 0, to: 30, color: '#43A047', label: 'SAFE' },
            { from: 30, to: 50, color: '#1E88E5', label: 'WATCH' },
            { from: 50, to: 70, color: '#FB8C00', label: 'WARNING' },
            { from: 70, to: 100, color: '#E53935', label: 'EMERGENCY' }
        ]
    });

    riskGauge.setValue(State.behaviour.value.riskScore);
}

function updateBatteryVisual() {
    const battery = State.battery.value;
    const svg = document.getElementById('battery-svg');
    if (!svg) return;

    const pct = battery.percentage || 0;
    const color = getBatteryColor(pct);
    const charging = battery.charging;

    svg.innerHTML = `
        <svg width="100" height="50" viewBox="0 0 100 50">
            <!-- Battery outline -->
            <rect x="2" y="8" width="86" height="34" rx="4" fill="none" stroke="var(--color-border, #E0E0E0)" stroke-width="2"/>
            <!-- Battery tip -->
            <rect x="88" y="18" width="8" height="14" rx="2" fill="var(--color-border, #E0E0E0)"/>
            <!-- Battery fill -->
            <rect x="5" y="11" width="${Math.max(0.8, 80 * pct / 100)}" height="28" rx="2" fill="${color}" ${charging ? 'class="charging"' : ''}/>
            ${charging ? '<animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite"/>' : ''}
        </svg>
        <style>
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            .charging { animation: pulse 1s ease-in-out infinite; }
        </style>
    `;
}

function getBatteryColor(pct) {
    if (pct >= 80) return '#43A047';
    if (pct >= 50) return '#FB8C00';
    if (pct >= 20) return '#FB8C00';
    return '#E53935';
}

function updateSignalBars() {
    const wifi = State.wifi.value;
    const barsContainer = document.getElementById('signal-bars');
    const signalText = document.getElementById('signal-text');

    if (!barsContainer) return;

    const bars = State.wifiBars.value;
    let html = '';
    for (let i = 1; i <= 4; i++) {
        const active = i <= bars;
        html += `<div class="signal-bar${active ? ' active' : ''}" style="height: ${i * 20}%"></div>`;
    }
    barsContainer.innerHTML = html;

    if (wifi.connected) {
        signalText.textContent = `${wifi.signalQuality}% • ${wifi.rssi} dBm`;
    } else if (wifi.apMode) {
        signalText.textContent = 'Access Point Mode';
    } else {
        signalText.textContent = 'Disconnected';
    }
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('btn-refresh-dashboard')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh-dashboard');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-loader"></span>';
        try {
            await updateAllCards();
            showToast('Refreshed', 'success');
        } catch (e) {
            showToast('Refresh failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>↻</span>';
        }
    });

    // Panic test
    document.getElementById('btn-panic-test')?.addEventListener('click', async () => {
        if (!confirm('Send a test panic alert?')) return;
        try {
            const response = await fetch('/api/alerts/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'panic' })
            });
            if (response.ok) showToast('Panic test sent', 'success');
            else showToast('Test failed', 'error');
        } catch (e) {
            showToast('Failed to send test', 'error');
        }
    });

    // Exit demo
    document.getElementById('btn-exit-demo')?.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/demo/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false })
            });
            if (response.ok) showToast('Demo mode disabled', 'success');
        } catch (e) {
            showToast('Failed to exit demo', 'error');
        }
    });

    // Toggle charge (demo mode)
    document.getElementById('btn-toggle-charge')?.addEventListener('click', async () => {
        const battery = State.battery.value;
        try {
            const response = await fetch('/api/demo/battery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ charging: !battery.charging })
            });
            if (response.ok) showToast(battery.charging ? 'Unplugged' : 'Plugged in', 'success');
        } catch (e) {
            showToast('Failed', 'error');
        }
    });

    // Demo scenario buttons
    document.querySelectorAll('.action-btn[data-scenario]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const scenario = btn.dataset.scenario;
            try {
                const response = await fetch('/api/demo/scenario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scenario })
                });
                if (response.ok) showToast(`Scenario: ${scenario} started`, 'success');
            } catch (e) {
                showToast('Failed to start scenario', 'error');
            }
        });
    });

    // View zones
    document.getElementById('btn-view-zones')?.addEventListener('click', () => {
        window.location.hash = 'safe-locations';
    });

    // Test Telegram
    document.getElementById('btn-test-telegram')?.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/telegram/test', { method: 'POST' });
            if (response.ok) showToast('Test message sent', 'success');
            else showToast('Test failed', 'error');
        } catch (e) {
            showToast('Failed to send test', 'error');
        }
    });
}

function subscribeToState() {
    // Update on state changes
    State.behaviour.subscribe(() => {
        if (riskGauge) riskGauge.setValue(State.behaviour.value.riskScore);
        document.getElementById('risk-state-badge').textContent = State.behaviour.value.state || State.riskLabel.value;
        document.getElementById('behaviour-state').textContent = State.behaviour.value.state || State.riskLabel.value;
        document.getElementById('anomaly-count').textContent = State.behaviour.value.anomalyCount || 0;
    });

    State.battery.subscribe(() => {
        updateAllCards().then(() => {
            updateBatteryVisual();
        });
    });

    State.gps.subscribe(() => {
        updateAllCards();
    });

    State.wifi.subscribe(() => {
        updateAllCards();
        updateSignalBars();
    });

    State.telegram.subscribe(() => {
        updateAllCards();
    });

    State.device.subscribe(() => {
        updateAllCards();
    });

    State.demoMode.subscribe(() => {
        updateAllCards();
    });

    State.demoScenarioName.subscribe(() => {
        const el = document.getElementById('demo-scenario-name');
        if (el) el.textContent = State.demoScenarioName.value;
    });
}

export function destroyDashboardPage() {
    if (riskGauge) {
        riskGauge.destroy();
        riskGauge = null;
    }
}