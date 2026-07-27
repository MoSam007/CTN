/**
 * pages/settings.js - Device Settings Page
 * Device identity, Telegram, Behaviour AI, Power, Network, Maintenance, Demo Mode
 */

import { State, showToast, formatBytes } from '../state.js';
import { createZoneEditor } from '../components/zone-editor.js';

let deviceNameInput, ownerNameInput, phoneInput;
let tgTokenInput, tgChatIdInput, tgEnabledToggle;
let behaviourEnabledToggle, sensitivitySelect;
let cpuFreqSelect, powerSaveToggle, gpsIntervalInput, behaviourIntervalInput;
let apFallbackToggle, fallbackTimeoutInput, scanIntervalInput;
let demoModeToggle, demoScenarioSelect;

export async function initSettingsPage() {
    const container = document.getElementById('page-settings');
    if (!container) return;

    container.innerHTML = getSettingsHTML();
    await loadSettings();
    initFormElements();
    setupEventListeners();
    subscribeToUpdates();
}

function getSettingsHTML() {
    return `
        <div class="page page-settings" role="main">
            <header class="page-header">
                <h1>Device Settings</h1>
            </header>

            <div class="settings-layout">
                <nav class="settings-nav" aria-label="Settings sections">
                    <button class="settings-nav-btn active" data-section="device">📱 Device</button>
                    <button class="settings-nav-btn" data-section="telegram">📱 Telegram</button>
                    <button class="settings-nav-btn" data-section="behaviour">🧠 Behaviour AI</button>
                    <button class="settings-nav-btn" data-section="power">⚡ Power Management</button>
                    <button class="settings-nav-btn" data-section="network">📶 Network</button>
                    <button class="settings-nav-btn" data-section="maintenance">🔧 Maintenance</button>
                    <button class="settings-nav-btn" data-section="demo">🧪 Demo Mode</button>
                </nav>

                <div class="settings-content">
                    <!-- Device Identity -->
                    <section class="settings-panel active" id="panel-device" aria-labelledby="device-title">
                        <h2 id="device-title">Device Identity</h2>
                        <div class="setting-group">
                            <label for="device-name">Device Nickname</label>
                            <input type="text" id="device-name" class="settings-input" placeholder="CTN-001" maxlength="32">
                            <p class="setting-hint">Friendly name shown in dashboard and alerts</p>
                        </div>
                        <div class="setting-group">
                            <label for="owner-name">Owner Name</label>
                            <input type="text" id="owner-name" class="settings-input" placeholder="Parent Name" maxlength="64">
                            <p class="setting-hint">Used in alert messages</p>
                        </div>
                        <div class="setting-group">
                            <label for="owner-phone">Phone Number (E.164)</label>
                            <input type="tel" id="owner-phone" class="settings-input" placeholder="+2547XXXXXXXX" pattern="^\\+?[0-9]{7,15}$">
                            <p class="setting-hint">For SMS alert fallback (optional)</p>
                        </div>
                        <div class="setting-group readonly-row">
                            <label>Device ID</label>
                            <span class="settings-value" id="setting-device-id">--</span>
                            <p class="setting-hint">Unique hardware identifier</p>
                        </div>
                        <div class="setting-group readonly-row">
                            <label>Firmware Version</label>
                            <span class="settings-value" id="setting-fw-version">--</span>
                        </div>
                        <div class="setting-group readonly-row">
                            <label>Chip ID</label>
                            <span class="settings-value" id="setting-chip-id">--</span>
                        </div>
                        <div class="setting-group readonly-row">
                            <label>MAC Address</label>
                            <span class="settings-value" id="setting-mac">--</span>
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-primary" id="btn-save-device">Save Device Info</button>
                        </div>
                    </section>

                    <!-- Telegram -->
                    <section class="settings-panel" id="panel-telegram" aria-labelledby="telegram-title">
                        <h2 id="telegram-title">Telegram Alerts</h2>
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="tg-enabled" class="settings-toggle">
                                <span class="toggle-slider"></span>
                                Enable Telegram Alerts
                            </label>
                        </div>
                        <div class="setting-group">
                            <label for="tg-token">Bot Token</label>
                            <input type="password" id="tg-token" class="settings-input" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                                   autocomplete="off" data-toggle="tg-token-toggle">
                            <div class="input-actions">
                                <button type="button" class="btn btn-sm btn-secondary" id="tg-token-toggle" aria-label="Show/hide token">👁️</button>
                            </div>
                            <p class="setting-hint">Get from @BotFather</p>
                        </div>
                        <div class="setting-group">
                            <label for="tg-chat-id">Chat ID</label>
                            <input type="text" id="tg-chat-id" class="settings-input" placeholder="-1001234567890" autocomplete="off">
                            <p class="setting-hint">Your user ID or group ID (negative for groups)</p>
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-secondary" id="btn-test-telegram">📤 Test Alert</button>
                            <button class="btn btn-primary" id="btn-save-telegram">Save Telegram Config</button>
                        </div>
                        <div class="settings-divider"></div>
                        <h3>Alert Templates</h3>
                        <p class="settings-info">All 4 alert types use Device Health format (per your requirements)</p>
                        <ul class="template-list">
                            <li>🚨 <strong>Panic/SOS</strong> — Immediate emergency with location + maps link</li>
                            <li>📍 <strong>Geofence</strong> — Arrival/Departure with zone name, time inside</li>
                            <li>🔋 <strong>Battery</strong> — Level, voltage, charging state, runtime estimate</li>
                            <li>⚠️ <strong>Behaviour</strong> — Risk score, anomaly type, recommended action</li>
                        </ul>
                    </section>

                    <!-- Behaviour AI -->
                    <section class="settings-panel" id="panel-behaviour" aria-labelledby="behaviour-title">
                        <h2 id="behaviour-title">Behaviour AI Settings</h2>
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="behaviour-enabled" class="settings-toggle" checked>
                                <span class="toggle-slider"></span>
                                Enable Behaviour Analysis
                            </label>
                            <p class="setting-hint">AI-based anomaly detection and risk scoring</p>
                        </div>
                        <div class="setting-group">
                            <label for="sensitivity">Sensitivity Level</label>
                            <select id="sensitivity" class="settings-select">
                                <option value="low">Low - Fewer false positives</option>
                                <option value="medium" selected>Medium - Balanced</option>
                                <option value="high">High - More sensitive</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label for="deviation-threshold">Route Deviation Threshold (m)</label>
                            <input type="number" id="deviation-threshold" class="settings-input" min="10" max="500" value="100">
                        </div>
                        <div class="setting-group">
                            <label for="stop-duration">Long Stop Duration (min)</label>
                            <input type="number" id="stop-duration" class="settings-input" min="1" max="60" value="5">
                        </div>
                        <div class="setting-group">
                            <label for="night-start">Night Hours Start</label>
                            <input type="time" id="night-start" class="settings-input" value="22:00">
                        </div>
                        <div class="setting-group">
                            <label for="night-end">Night Hours End</label>
                            <input type="time" id="night-end" class="settings-input" value="06:00">
                        </div>
                        <div class="setting-group">
                            <label for="speed-walking">Max Walking Speed (km/h)</label>
                            <input type="number" id="speed-walking" class="settings-input" min="1" max="15" value="7" step="0.5">
                        </div>
                        <div class="setting-group">
                            <label for="speed-running">Min Running Speed (km/h)</label>
                            <input type="number" id="speed-running" class="settings-input" min="5" max="30" value="12" step="0.5">
                        </div>
                        <div class="setting-group">
                            <label for="speed-vehicle">Min Vehicle Speed (km/h)</label>
                            <input type="number" id="speed-vehicle" class="settings-input" min="10" max="100" value="25" step="1">
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-primary" id="btn-save-behaviour">Save Behaviour Config</button>
                            <button class="btn btn-secondary" id="btn-reset-behaviour">Reset to Defaults</button>
                        </div>
                    </section>

                    <!-- Power Management -->
                    <section class="settings-panel" id="panel-power" aria-labelledby="power-title">
                        <h2 id="power-title">Power Management</h2>
                        <div class="setting-group">
                            <label for="cpu-freq">CPU Frequency</label>
                            <select id="cpu-freq" class="settings-select">
                                <option value="80">80 MHz (Power Save)</option>
                                <option value="160" selected>160 MHz (Performance)</option>
                            </select>
                            <p class="setting-hint">Lower frequency saves battery but reduces processing speed</p>
                        </div>
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="power-save" class="settings-toggle">
                                <span class="toggle-slider"></span>
                                Enable Power Save Mode
                            </label>
                            <p class="setting-hint">Reduces WiFi scan frequency, GPS fix rate when idle</p>
                        </div>
                        <div class="setting-group">
                            <label for="gps-interval">GPS Update Interval (seconds)</label>
                            <input type="number" id="gps-interval" class="settings-input" min="5" max="300" value="30">
                            <p class="setting-hint">How often to request GPS fix</p>
                        </div>
                        <div class="setting-group">
                            <label for="behaviour-interval">Behaviour Analysis Interval (seconds)</label>
                            <input type="number" id="behaviour-interval" class="settings-input" min="10" max="600" value="60">
                        </div>
                        <div class="setting-group">
                            <label for="battery-critical">Critical Battery Level (%)</label>
                            <input type="number" id="battery-critical" class="settings-input" min="5" max="30" value="15">
                        </div>
                        <div class="setting-group">
                            <label for="battery-low">Low Battery Level (%)</label>
                            <input type="number" id="battery-low" class="settings-input" min="10" max="50" value="30">
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-primary" id="btn-save-power">Save Power Settings</button>
                        </div>
                    </section>

                    <!-- Network -->
                    <section class="settings-panel" id="panel-network" aria-labelledby="network-title">
                        <h2 id="network-title">Network Settings</h2>
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="ap-fallback" class="settings-toggle" checked>
                                <span class="toggle-slider"></span>
                                Enable AP Fallback
                            </label>
                            <p class="setting-hint">Starts Access Point if no WiFi connection after timeout</p>
                        </div>
                        <div class="setting-group">
                            <label for="fallback-timeout">Fallback Timeout (seconds)</label>
                            <input type="number" id="fallback-timeout" class="settings-input" min="10" max="300" value="60">
                        </div>
                        <div class="setting-group">
                            <label for="scan-interval">WiFi Scan Interval (seconds)</label>
                            <input type="number" id="scan-interval" class="settings-input" min="10" max="600" value="30">
                        </div>
                        <div class="setting-group">
                            <label for="wifi-reconnect">Max Reconnect Attempts</label>
                            <input type="number" id="wifi-reconnect" class="settings-input" min="1" max="20" value="3">
                        </div>
                        <div class="setting-group">
                            <label for="ap-ssid">AP SSID</label>
                            <input type="text" id="ap-ssid" class="settings-input" placeholder="CTN-Setup" maxlength="32">
                        </div>
                        <div class="setting-group">
                            <label for="ap-password">AP Password (min 8 chars)</label>
                            <input type="password" id="ap-password" class="settings-input" placeholder="••••••••" data-toggle="ap-pass-toggle">
                            <div class="input-actions">
                                <button type="button" class="btn btn-sm btn-secondary" id="ap-pass-toggle" aria-label="Show/hide password">👁️</button>
                            </div>
                        </div>
                        <div class="setting-group">
                            <label for="ap-channel">AP Channel</label>
                            <select id="ap-channel" class="settings-select">
                                <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                                <option value="4">4</option><option value="5">5</option><option value="6">6</option>
                                <option value="7">7</option><option value="8">8</option><option value="9">9</option>
                                <option value="10">10</option><option value="11">11</option>
                            </select>
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-primary" id="btn-save-network">Save Network Settings</button>
                        </div>
                    </section>

                    <!-- Maintenance -->
                    <section class="settings-panel" id="panel-maintenance" aria-labelledby="maintenance-title">
                        <h2 id="maintenance-title">Maintenance & OTA</h2>

                        <div class="maintenance-card">
                            <h3>🔄 OTA Firmware Update</h3>
                            <p class="setting-hint">Upload a .bin firmware file to update the device</p>
                            <div class="setting-group">
                                <label for="ota-file">Firmware File (.bin)</label>
                                <input type="file" id="ota-file" accept=".bin" class="settings-input">
                            </div>
                            <div class="ota-progress" id="ota-progress" style="display:none;">
                                <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                                <span class="progress-text" id="progress-text">0%</span>
                            </div>
                            <div class="panel-actions">
                                <button class="btn btn-primary" id="btn-start-ota" disabled>Start OTA Update</button>
                            </div>
                            <p class="ota-warning">⚠️ Do not power off during update. Device will reboot automatically.</p>
                        </div>

                        <div class="maintenance-card">
                            <h3>📦 Configuration</h3>
                            <div class="panel-actions">
                                <button class="btn btn-secondary" id="btn-export-config">Export Config (JSON)</button>
                                <button class="btn btn-secondary" id="btn-import-config">Import Config</button>
                                <input type="file" id="import-config-file" accept=".json" style="display:none;">
                            </div>
                        </div>

                        <div class="maintenance-card danger-zone">
                            <h3>⚠️ Danger Zone</h3>
                            <div class="danger-actions">
                                <button class="btn btn-secondary" id="btn-restart">🔄 Restart Device</button>
                                <button class="btn btn-danger" id="btn-factory-reset">🏭 Factory Reset</button>
                            </div>
                            <p class="danger-desc">
                                <strong>Restart:</strong> Reboots the device (takes ~10s).<br>
                                <strong>Factory Reset:</strong> Erases all saved networks, zones, config. Cannot be undone.
                            </p>
                        </div>
                    </section>

                    <!-- Demo Mode -->
                    <section class="settings-panel" id="panel-demo" aria-labelledby="demo-title">
                        <h2 id="demo-title">Demo Mode</h2>
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="demo-enabled" class="settings-toggle">
                                <span class="toggle-slider"></span>
                                Enable Demo Mode
                            </label>
                            <p class="setting-hint">Simulates GPS, battery, and behaviour data for testing without hardware. Persists in browser storage.</p>
                        </div>
                        <div class="setting-group" id="demo-scenario-group" style="display:none;">
                            <label for="demo-scenario">Demo Scenario</label>
                            <select id="demo-scenario" class="settings-select">
                                <option value="idle">Idle (Stationary)</option>
                                <option value="walk_to_school">🏫 Walk to School</option>
                                <option value="route_deviation">⚠️ Route Deviation</option>
                                <option value="panic_button">🚨 Panic Button</option>
                                <option value="low_battery">🔋 Low Battery</option>
                                <option value="night_wandering">🌙 Night Wandering</option>
                                <option value="safe_arrival">✅ Safe Arrival</option>
                            </select>
                        </div>
                        <div class="panel-actions" id="demo-actions" style="display:none;">
                            <button class="btn btn-secondary" id="btn-demo-step">Step Scenario</button>
                            <button class="btn btn-primary" id="btn-demo-reset">Reset Demo</button>
                        </div>
                        <div class="settings-divider"></div>
                        <h3>Simulator Controls</h3>
                        <div class="simulator-controls">
                            <div class="setting-group">
                                <label>Battery Drain Rate: <span id="drain-rate-value">1.0</span>%/min</label>
                                <input type="range" id="drain-rate" min="0" max="5" step="0.1" value="1" class="settings-slider">
                            </div>
                            <div class="setting-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="sim-charging" class="settings-toggle">
                                    <span class="toggle-slider"></span>
                                    Simulate Charging
                                </label>
                            </div>
                            <div class="setting-group">
                                <label>GPS Noise: <span id="gps-noise-value">0</span>m</label>
                                <input type="range" id="gps-noise" min="0" max="50" value="0" class="settings-slider">
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    `;
}

async function loadSettings() {
    try {
        const [deviceRes, tgRes, behaviourRes, powerRes, networkRes, demoRes] = await Promise.all([
            fetch('/api/device/settings'),
            fetch('/api/telegram/config'),
            fetch('/api/behaviour/config'),
            fetch('/api/power/config'),
            fetch('/api/network/config'),
            fetch('/api/demo/config')
        ]);

        const [device, tg, behaviour, power, network, demo] = await Promise.all([
            deviceRes.json().catch(() => ({})),
            tgRes.json().catch(() => ({})),
            behaviourRes.json().catch(() => ({})),
            powerRes.json().catch(() => ({})),
            networkRes.json().catch(() => ({})),
            demoRes.json().catch(() => ({}))
        ]);

        // Populate device
        if (device) {
            State.deviceSettings.value = { ...State.deviceSettings.value, ...device };
            populateDeviceSettings(device);
        }

        // Populate Telegram
        if (tg) {
            State.telegram.value = { ...State.telegram.value, ...tg };
            populateTelegramSettings(tg);
        }

        // Populate Behaviour
        if (behaviour) {
            State.behaviourConfig.value = { ...State.behaviourConfig.value, ...behaviour };
            populateBehaviourSettings(behaviour);
        }

        // Populate Power
        if (power) {
            populatePowerSettings(power);
        }

        // Populate Network
        if (network) {
            populateNetworkSettings(network);
        }

        // Populate Demo
        if (demo) {
            populateDemoSettings(demo);
        }

    } catch (e) {
        console.error('Failed to load settings:', e);
        showToast('Failed to load settings', 'error');
    }
}

function populateDeviceSettings(d) {
    document.getElementById('device-name').value = d.deviceName || '';
    document.getElementById('owner-name').value = d.ownerName || '';
    document.getElementById('owner-phone').value = d.phoneNumber || '';
    document.getElementById('setting-device-id').textContent = d.deviceId || 'Unknown';
    document.getElementById('setting-fw-version').textContent = d.firmwareVersion || 'Unknown';
    document.getElementById('setting-chip-id').textContent = d.chipId ? '0x' + d.chipId.toString(16).toUpperCase() : 'Unknown';
    document.getElementById('setting-mac').textContent = d.macAddress || 'Unknown';
}

function populateTelegramSettings(t) {
    document.getElementById('tg-enabled').checked = t.enabled || false;
    document.getElementById('tg-token').value = t.token || '';
    document.getElementById('tg-chat-id').value = t.chatId || '';
}

function populateBehaviourSettings(b) {
    document.getElementById('behaviour-enabled').checked = b.enabled !== false;
    document.getElementById('sensitivity').value = b.sensitivity || 'medium';
    document.getElementById('deviation-threshold').value = b.deviationThreshold || 100;
    document.getElementById('stop-duration').value = b.longStopDuration || 5;
    document.getElementById('night-start').value = b.nightStart || '22:00';
    document.getElementById('night-end').value = b.nightEnd || '06:00';
    document.getElementById('speed-walking').value = b.maxWalkingSpeed || 7;
    document.getElementById('speed-running').value = b.minRunningSpeed || 12;
    document.getElementById('speed-vehicle').value = b.minVehicleSpeed || 25;
}

function populatePowerSettings(p) {
    document.getElementById('cpu-freq').value = p.cpuFreq || 160;
    document.getElementById('power-save').checked = p.powerSave || false;
    document.getElementById('gps-interval').value = p.gpsInterval || 30;
    document.getElementById('behaviour-interval').value = p.behaviourInterval || 60;
    document.getElementById('battery-critical').value = p.batteryCritical || 15;
    document.getElementById('battery-low').value = p.batteryLow || 30;
}

function populateNetworkSettings(n) {
    document.getElementById('ap-fallback').checked = n.apFallback !== false;
    document.getElementById('fallback-timeout').value = n.fallbackTimeout || 60;
    document.getElementById('scan-interval').value = n.scanInterval || 30;
    document.getElementById('wifi-reconnect').value = n.maxReconnect || 3;
    document.getElementById('ap-ssid').value = n.apSsid || 'CTN-Setup';
    document.getElementById('ap-password').value = n.apPassword || '';
    document.getElementById('ap-channel').value = n.apChannel || 1;
}

function populateDemoSettings(d) {
    const enabled = d.enabled || false;
    document.getElementById('demo-enabled').checked = enabled;
    document.getElementById('demo-scenario').value = d.scenario || 'idle';
    document.getElementById('demo-scenario-group').style.display = enabled ? 'block' : 'none';
    document.getElementById('demo-actions').style.display = enabled ? 'flex' : 'none';
    document.getElementById('drain-rate').value = d.drainRate || 1;
    document.getElementById('drain-rate-value').textContent = d.drainRate || 1;
    document.getElementById('sim-charging').checked = d.charging || false;
    document.getElementById('gps-noise').value = d.gpsNoise || 0;
    document.getElementById('gps-noise-value').textContent = d.gpsNoise || 0;

    State.demoMode.value = enabled;
}

function initFormElements() {
    // Toggle visibility for password fields
    document.querySelectorAll('[data-toggle]').forEach(input => {
        const toggleId = input.dataset.toggle;
        const toggleBtn = document.getElementById(toggleId);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                input.type = input.type === 'password' ? 'text' : 'password';
                toggleBtn.textContent = input.type === 'password' ? '👁️' : '🙈';
            });
        }
    });

    // Sliders
    document.getElementById('drain-rate')?.addEventListener('input', (e) => {
        document.getElementById('drain-rate-value').textContent = e.target.value;
    });
    document.getElementById('gps-noise')?.addEventListener('input', (e) => {
        document.getElementById('gps-noise-value').textContent = e.target.value;
    });

    // Nav tabs
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(section) {
    // Update nav
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });

    // Update panels
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${section}`);
    });
}

function setupEventListeners() {
    // Device
    document.getElementById('btn-save-device')?.addEventListener('click', saveDeviceSettings);

    // Telegram
    document.getElementById('btn-save-telegram')?.addEventListener('click', saveTelegramSettings);
    document.getElementById('btn-test-telegram')?.addEventListener('click', testTelegram);

    // Behaviour
    document.getElementById('btn-save-behaviour')?.addEventListener('click', saveBehaviourSettings);
    document.getElementById('btn-reset-behaviour')?.addEventListener('click', resetBehaviourSettings);

    // Power
    document.getElementById('btn-save-power')?.addEventListener('click', savePowerSettings);

    // Network
    document.getElementById('btn-save-network')?.addEventListener('click', saveNetworkSettings);

    // Maintenance
    document.getElementById('btn-export-config')?.addEventListener('click', exportConfig);
    document.getElementById('btn-import-config')?.addEventListener('click', () => {
        document.getElementById('import-config-file').click();
    });
    document.getElementById('import-config-file')?.addEventListener('change', importConfig);
    document.getElementById('btn-restart')?.addEventListener('click', restartDevice);
    document.getElementById('btn-factory-reset')?.addEventListener('click', factoryReset);
    document.getElementById('btn-start-ota')?.addEventListener('click', startOTA);
    document.getElementById('ota-file')?.addEventListener('change', handleOTAFileSelect);

    // Demo
    document.getElementById('demo-enabled')?.addEventListener('change', toggleDemoMode);
    document.getElementById('demo-scenario')?.addEventListener('change', changeDemoScenario);
    document.getElementById('btn-demo-step')?.addEventListener('click', stepDemoScenario);
    document.getElementById('btn-demo-reset')?.addEventListener('click', resetDemo);
    document.getElementById('drain-rate')?.addEventListener('change', updateDemoSimulator);
    document.getElementById('sim-charging')?.addEventListener('change', updateDemoSimulator);
    document.getElementById('gps-noise')?.addEventListener('change', updateDemoSimulator);
}

async function saveDeviceSettings() {
    const data = {
        deviceName: document.getElementById('device-name').value.trim(),
        ownerName: document.getElementById('owner-name').value.trim(),
        phoneNumber: document.getElementById('owner-phone').value.trim()
    };

    try {
        const response = await fetch('/api/device/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        showToast('Device settings saved', 'success');
    } catch (e) {
        showToast('Failed to save device settings', 'error');
    }
}

async function saveTelegramSettings() {
    const data = {
        enabled: document.getElementById('tg-enabled').checked,
        token: document.getElementById('tg-token').value.trim(),
        chatId: document.getElementById('tg-chat-id').value.trim()
    };

    if (data.enabled && (!data.token || !data.chatId)) {
        showToast('Token and Chat ID required when enabled', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/telegram/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        showToast('Telegram settings saved', 'success');
    } catch (e) {
        showToast('Failed to save Telegram settings', 'error');
    }
}

async function testTelegram() {
    try {
        const response = await fetch('/api/telegram/test', { method: 'POST' });
        if (response.ok) showToast('Test message sent', 'success');
        else showToast('Test failed', 'error');
    } catch (e) {
        showToast('Failed to send test', 'error');
    }
}

async function saveBehaviourSettings() {
    const data = {
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
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        showToast('Behaviour settings saved', 'success');
    } catch (e) {
        showToast('Failed to save behaviour settings', 'error');
    }
}

async function resetBehaviourSettings() {
    if (!confirm('Reset all behaviour settings to defaults?')) return;
    try {
        const response = await fetch('/api/behaviour/config/reset', { method: 'POST' });
        if (!response.ok) throw new Error('Reset failed');
        showToast('Settings reset to defaults', 'success');
        loadSettings();
    } catch (e) {
        showToast('Failed to reset', 'error');
    }
}

async function savePowerSettings() {
    const data = {
        cpuFreq: parseInt(document.getElementById('cpu-freq').value, 10),
        powerSave: document.getElementById('power-save').checked,
        gpsInterval: parseInt(document.getElementById('gps-interval').value, 10),
        behaviourInterval: parseInt(document.getElementById('behaviour-interval').value, 10),
        batteryCritical: parseInt(document.getElementById('battery-critical').value, 10),
        batteryLow: parseInt(document.getElementById('battery-low').value, 10)
    };

    try {
        const response = await fetch('/api/power/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        showToast('Power settings saved', 'success');
    } catch (e) {
        showToast('Failed to save power settings', 'error');
    }
}

async function saveNetworkSettings() {
    const data = {
        apFallback: document.getElementById('ap-fallback').checked,
        fallbackTimeout: parseInt(document.getElementById('fallback-timeout').value, 10),
        scanInterval: parseInt(document.getElementById('scan-interval').value, 10),
        maxReconnect: parseInt(document.getElementById('wifi-reconnect').value, 10),
        apSsid: document.getElementById('ap-ssid').value.trim(),
        apPassword: document.getElementById('ap-password').value,
        apChannel: parseInt(document.getElementById('ap-channel').value, 10)
    };

    try {
        const response = await fetch('/api/network/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        showToast('Network settings saved', 'success');
    } catch (e) {
        showToast('Failed to save network settings', 'error');
    }
}

async function exportConfig() {
    try {
        const response = await fetch('/api/config/export');
        const config = await response.json();

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ctn-config-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Configuration exported', 'success');
    } catch (e) {
        showToast('Export failed', 'error');
    }
}

async function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const config = JSON.parse(text);

        const response = await fetch('/api/config/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (!response.ok) throw new Error('Import failed');
        showToast('Configuration imported. Restart recommended.', 'success');
        loadSettings();
    } catch (e) {
        showToast('Import failed: ' + e.message, 'error');
    }

    e.target.value = '';
}

async function restartDevice() {
    if (!confirm('Restart the device?')) return;
    try {
        await fetch('/api/device/restart', { method: 'POST' });
        showToast('Device restarting...', 'info');
        setTimeout(() => location.reload(), 5000);
    } catch (e) {
        showToast('Restart failed', 'error');
    }
}

async function factoryReset() {
    if (!confirm('⚠️ FACTORY RESET? This erases ALL settings, WiFi networks, safe zones, and config. This cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? Type "RESET" to confirm.')) return;

    const input = prompt('Type "RESET" to confirm factory reset:');
    if (input !== 'RESET') {
        showToast('Reset cancelled', 'info');
        return;
    }

    try {
        await fetch('/api/device/factory-reset', { method: 'POST' });
        showToast('Factory reset initiated. Device will reboot.', 'warning');
        setTimeout(() => location.reload(), 10000);
    } catch (e) {
        showToast('Factory reset failed', 'error');
    }
}

function handleOTAFileSelect(e) {
    const file = e.target.files[0];
    const btn = document.getElementById('btn-start-ota');

    if (file && file.name.endsWith('.bin')) {
        btn.disabled = false;
        btn.textContent = `Update to ${file.name}`;
    } else {
        btn.disabled = true;
        btn.textContent = 'Start OTA Update';
    }
}

async function startOTA() {
    const file = document.getElementById('ota-file').files[0];
    if (!file) return;

    const progress = document.getElementById('ota-progress');
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('progress-text');
    const btn = document.getElementById('btn-start-ota');

    progress.style.display = 'block';
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('firmware', file);

        const response = await fetch('/api/ota/update', {
            method: 'POST',
            body: formData
        });

        // OTA upload progress is tracked via WebSocket
        // This just initiates the upload
        showToast('OTA update started...', 'info');

        // Poll for progress
        const pollProgress = setInterval(async () => {
            try {
                const statusRes = await fetch('/api/ota/status');
                const status = await statusRes.json();
                if (status.inProgress) {
                    fill.style.width = `${status.progress}%`;
                    text.textContent = `${Math.round(status.progress)}%`;
                } else {
                    clearInterval(pollProgress);
                    if (status.complete) {
                        text.textContent = 'Complete! Rebooting...';
                        showToast('OTA update successful! Device rebooting...', 'success');
                        setTimeout(() => location.reload(), 10000);
                    } else if (status.error) {
                        text.textContent = 'Error: ' + status.error;
                        showToast('OTA failed: ' + status.error, 'error');
                    }
                }
            } catch (e) {
                // Ignore polling errors
            }
        }, 1000);

    } catch (e) {
        showToast('OTA upload failed', 'error');
        progress.style.display = 'none';
        btn.disabled = false;
    }
}

function toggleDemoMode(e) {
    const enabled = e.target.checked;
    document.getElementById('demo-scenario-group').style.display = enabled ? 'block' : 'none';
    document.getElementById('demo-actions').style.display = enabled ? 'flex' : 'none';

    fetch('/api/demo/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
    }).then(() => {
        showToast(enabled ? 'Demo mode enabled' : 'Demo mode disabled', 'success');
        State.demoMode.value = enabled;
    }).catch(() => {
        showToast('Failed to toggle demo mode', 'error');
        e.target.checked = !enabled;
    });
}

async function changeDemoScenario(e) {
    const scenario = e.target.value;
    try {
        const response = await fetch('/api/demo/scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario })
        });
        if (response.ok) showToast(`Scenario: ${scenario} started`, 'success');
    } catch (e) {
        showToast('Failed to change scenario', 'error');
    }
}

async function stepDemoScenario() {
    try {
        await fetch('/api/demo/step', { method: 'POST' });
        showToast('Scenario stepped', 'info');
    } catch (e) {
        showToast('Failed to step', 'error');
    }
}

async function resetDemo() {
    try {
        await fetch('/api/demo/reset', { method: 'POST' });
        showToast('Demo reset', 'success');
    } catch (e) {
        showToast('Failed to reset', 'error');
    }
}

async function updateDemoSimulator() {
    const data = {
        drainRate: parseFloat(document.getElementById('drain-rate').value),
        charging: document.getElementById('sim-charging').checked,
        gpsNoise: parseInt(document.getElementById('gps-noise').value, 10)
    };

    try {
        await fetch('/api/demo/simulator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        // Silently fail
    }
}

function subscribeToUpdates() {
    State.demoMode.subscribe((enabled) => {
        document.getElementById('demo-enabled').checked = enabled;
        document.getElementById('demo-scenario-group').style.display = enabled ? 'block' : 'none';
        document.getElementById('demo-actions').style.display = enabled ? 'flex' : 'none';
    });

    State.demoScenarioName.subscribe((name) => {
        const select = document.getElementById('demo-scenario');
        if (select && !select.matches(':focus')) {
            // Update select to match current scenario if not user-focused
        }
    });
}

export function destroySettingsPage() {
    // Cleanup if needed
}