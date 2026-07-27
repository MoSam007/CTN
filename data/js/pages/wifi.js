/**
 * pages/wifi.js - WiFi Management Page
 * Network scanning, saved networks with priority, connection management
 */

import { State, showToast, formatBytes } from '../state.js';
import { createLinearGauge } from '../components/gauge.js';

let scanResults = [];
let channelChart = null;
let scanInterval = null;

export async function initWifiPage() {
    const container = document.getElementById('page-wifi');
    if (!container) return;

    container.innerHTML = getWifiHTML();
    await loadWifiData();
    initChannelChart();
    setupEventListeners();
    subscribeToUpdates();
}

function getWifiHTML() {
    return `
        <div class="page page-wifi" role="main">
            <header class="page-header">
                <h1>WiFi Networks</h1>
                <div class="page-header-actions">
                    <button class="btn btn-secondary btn-sm" id="btn-rescan" aria-label="Rescan networks">
                        <span>🔍</span> Scan
                    </button>
                    <button class="btn btn-primary btn-sm" id="btn-refresh-saved" aria-label="Refresh saved networks">
                        <span>↻</span>
                    </button>
                </div>
            </header>

            <!-- Current Connection -->
            <section class="wifi-section current-connection" aria-labelledby="current-conn-title">
                <div class="section-header">
                    <h2 id="current-conn-title">Current Connection</h2>
                    <span class="connection-status" id="connection-status">Disconnected</span>
                </div>
                <div class="connection-info" id="connection-info">
                    <div class="conn-detail">
                        <span class="conn-label">SSID</span>
                        <span class="conn-value" id="conn-ssid">--</span>
                    </div>
                    <div class="conn-detail">
                        <span class="conn-label">Signal</span>
                        <span class="conn-value" id="conn-signal">
                            <div class="signal-mini" id="conn-signal-bars"></div>
                            <span id="conn-rssi">-- dBm</span>
                        </span>
                    </div>
                    <div class="conn-detail">
                        <span class="conn-label">IP Address</span>
                        <span class="conn-value" id="conn-ip">--</span>
                    </div>
                    <div class="conn-detail">
                        <span class="conn-label">Gateway</span>
                        <span class="conn-value" id="conn-gateway">--</span>
                    </div>
                    <div class="conn-detail">
                        <span class="conn-label">Internet</span>
                        <span class="conn-value" id="conn-internet">--</span>
                    </div>
                    <div class="conn-detail">
                        <span class="conn-label">Channel</span>
                        <span class="conn-value" id="conn-channel">--</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-secondary" id="btn-disconnect" disabled>Disconnect</button>
                    <button class="btn btn-primary" id="btn-connect-current" style="display:none;">Connect</button>
                </div>
            </section>

            <!-- Scan Results -->
            <section class="wifi-section scan-results" aria-labelledby="scan-title">
                <div class="section-header">
                    <h2 id="scan-title">Available Networks</h2>
                    <div class="scan-status" id="scan-status">
                        <span class="scan-indicator" id="scan-indicator"></span>
                        <span id="scan-text">Tap Scan to discover networks</span>
                    </div>
                </div>
                <div class="scan-results-grid" id="scan-results-grid" role="list" aria-label="Scanned networks">
                    <div class="scan-empty">No scan results yet. Tap Scan to discover networks.</div>
                </div>
            </section>

            <!-- Channel Graph -->
            <section class="wifi-section channel-graph" aria-labelledby="channel-title">
                <div class="section-header">
                    <h2 id="channel-title">2.4 GHz Channel Usage</h2>
                </div>
                <div class="chart-container">
                    <canvas id="channel-chart" width="400" height="200" aria-label="Channel usage bar chart"></canvas>
                </div>
            </section>

            <!-- Saved Networks -->
            <section class="wifi-section saved-networks" aria-labelledby="saved-title">
                <div class="section-header">
                    <h2 id="saved-title">Saved Networks (Priority Order)</h2>
                    <span class="saved-count" id="saved-count">0 networks</span>
                </div>
                <div class="saved-list" id="saved-list" role="list" aria-label="Saved WiFi networks">
                    <div class="saved-empty">No saved networks. Save a network from scan results.</div>
                </div>
            </section>

            <!-- Auto-Reconnect Status -->
            <section class="wifi-section auto-reconnect" aria-labelledby="reconnect-title">
                <div class="section-header">
                    <h2 id="reconnect-title">Auto-Reconnect Status</h2>
                    <span class="reconnect-state" id="reconnect-state">Active</span>
                </div>
                <div class="reconnect-info">
                    <div class="reconnect-item">
                        <span class="reconnect-label">Fallback AP</span>
                        <span class="reconnect-value" id="fallback-ap">Enabled</span>
                    </div>
                    <div class="reconnect-item">
                        <span class="reconnect-label">Fallback Timeout</span>
                        <span class="reconnect-value" id="fallback-timeout">60s</span>
                    </div>
                    <div class="reconnect-item">
                        <span class="reconnect-label">Scan Interval</span>
                        <span class="reconnect-value" id="scan-interval">30s</span>
                    </div>
                    <div class="reconnect-item">
                        <span class="reconnect-label">Reconnects Today</span>
                        <span class="reconnect-value" id="reconnect-count">0</span>
                    </div>
                </div>
            </section>
        </div>
    `;
}

async function loadWifiData() {
    try {
        const [savedRes, statusRes] = await Promise.all([
            fetch('/api/wifi/saved'),
            fetch('/api/wifi/status')
        ]);

        const [saved, status] = await Promise.all([
            savedRes.json(),
            statusRes.json()
        ]);

        if (saved) {
            State.savedNetworks.value = saved.networks || [];
            renderSavedNetworks();
        }

        if (status) {
            State.wifi.value = { ...State.wifi.value, ...status };
            updateCurrentConnection();
            updateReconnectStatus(status);
        }
    } catch (e) {
        console.error('Failed to load WiFi data:', e);
        showToast('Failed to load WiFi data', 'error');
    }
}

function updateCurrentConnection() {
    const wifi = State.wifi.value;
    const statusEl = document.getElementById('connection-status');

    if (wifi.connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connection-status connected';
        document.getElementById('conn-ssid').textContent = wifi.ssid || 'Unknown';
        document.getElementById('conn-rssi').textContent = `${wifi.rssi || 0} dBm`;
        document.getElementById('conn-ip').textContent = wifi.ip || '--';
        document.getElementById('conn-gateway').textContent = wifi.gateway || '--';
        document.getElementById('conn-internet').innerHTML = wifi.internet ? '✅ Yes' : '❌ No';
        document.getElementById('conn-channel').textContent = wifi.channel || '--';
        document.getElementById('btn-disconnect').disabled = false;
        document.getElementById('btn-connect-current').style.display = 'none';
    } else if (wifi.apMode) {
        statusEl.textContent = 'AP Mode';
        statusEl.className = 'connection-status ap-mode';
        document.getElementById('conn-ssid').textContent = wifi.apSsid || 'CTN-Setup';
        document.getElementById('conn-rssi').textContent = '--';
        document.getElementById('conn-ip').textContent = '192.168.4.1';
        document.getElementById('conn-gateway').textContent = '--';
        document.getElementById('conn-internet').textContent = 'N/A';
        document.getElementById('conn-channel').textContent = wifi.apChannel || '1';
        document.getElementById('btn-disconnect').disabled = true;
        document.getElementById('btn-connect-current').style.display = 'none';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'connection-status disconnected';
        document.getElementById('conn-ssid').textContent = '--';
        document.getElementById('conn-rssi').textContent = '--';
        document.getElementById('conn-ip').textContent = '--';
        document.getElementById('conn-gateway').textContent = '--';
        document.getElementById('conn-internet').textContent = '--';
        document.getElementById('conn-channel').textContent = '--';
        document.getElementById('btn-disconnect').disabled = true;
        document.getElementById('btn-connect-current').style.display = 'inline-flex';
    }

    updateSignalMini('conn-signal-bars', State.wifiBars.value);
}

function updateSignalMini(containerId, bars) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '';
    for (let i = 1; i <= 4; i++) {
        html += `<div class="signal-mini-bar${i <= bars ? ' active' : ''}" style="height: ${i * 20}%"></div>`;
    }
    container.innerHTML = html;
}

function renderScanResults() {
    const grid = document.getElementById('scan-results-grid');
    if (!grid) return;

    if (scanResults.length === 0) {
        grid.innerHTML = '<div class="scan-empty">No networks found. Tap Scan to discover.</div>';
        return;
    }

    grid.innerHTML = scanResults.map(network => renderNetworkCard(network)).join('');

    // Bind events
    grid.querySelectorAll('.network-card').forEach(card => {
        const ssid = card.dataset.ssid;
        const network = scanResults.find(n => n.ssid === ssid);

        card.querySelector('.btn-connect')?.addEventListener('click', () => connectToNetwork(network));
        card.querySelector('.btn-save')?.addEventListener('click', () => saveNetwork(network));
    });
}

function renderNetworkCard(network) {
    const rssi = network.rssi || -100;
    const bars = calculateBars(rssi);
    const security = network.encryption ? '🔒' : '🔓';
    const isSaved = State.savedNetworks.value.some(n => n.ssid === network.ssid);

    return `
        <article class="network-card" data-ssid="${escapeHtml(network.ssid)}" role="listitem">
            <div class="network-header">
                <span class="network-ssid">${escapeHtml(network.ssid || 'Hidden Network')}</span>
                <span class="network-security">${security}</span>
            </div>
            <div class="network-meta">
                <span class="network-rssi">${rssi} dBm</span>
                <span class="network-channel">Ch ${network.channel || '?'}</span>
                ${isSaved ? '<span class="network-saved-badge">Saved</span>' : ''}
            </div>
            <div class="signal-mini" id="signal-${escapeHtml(network.ssid)}"></div>
            <div class="network-actions">
                <button class="btn btn-sm btn-primary btn-connect" ${isSaved ? '' : 'disabled'}>
                    ${network.ssid === State.wifi.value.ssid ? 'Connected' : 'Connect'}
                </button>
                <button class="btn btn-sm btn-secondary btn-save ${isSaved ? 'saved' : ''}">
                    ${isSaved ? '✓ Saved' : 'Save'}
                </button>
            </div>
        </article>
    `;
}

function calculateBars(rssi) {
    if (rssi >= -50) return 4;
    if (rssi >= -60) return 3;
    if (rssi >= -70) return 2;
    if (rssi >= -80) return 1;
    return 0;
}

function renderSavedNetworks() {
    const list = document.getElementById('saved-list');
    if (!list) return;

    const networks = State.savedNetworks.value;

    if (networks.length === 0) {
        list.innerHTML = '<div class="saved-empty">No saved networks. Save a network from scan results.</div>';
        document.getElementById('saved-count').textContent = '0 networks';
        return;
    }

    list.innerHTML = networks.map((network, index) => renderSavedCard(network, index)).join('');
    document.getElementById('saved-count').textContent = `${networks.length} network${networks.length !== 1 ? 's' : ''}`;

    // Bind events
    list.querySelectorAll('.saved-card').forEach(card => {
        const idx = parseInt(card.dataset.index, 10);
        const network = networks[idx];

        card.querySelector('.btn-edit')?.addEventListener('click', () => editSavedNetwork(idx));
        card.querySelector('.btn-delete')?.addEventListener('click', () => deleteSavedNetwork(idx));
        card.querySelector('.btn-move-up')?.addEventListener('click', () => moveNetwork(idx, -1));
        card.querySelector('.btn-move-down')?.addEventListener('click', () => moveNetwork(idx, 1));
        card.querySelector('.priority-input')?.addEventListener('change', (e) => updatePriority(idx, parseInt(e.target.value, 10)));
        card.querySelector('.auto-connect-toggle')?.addEventListener('change', (e) => toggleAutoConnect(idx, e.target.checked));
    });
}

function renderSavedCard(network, index) {
    const priority = network.priority || index + 1;
    const autoConnect = network.autoConnect !== false;

    return `
        <article class="saved-card" data-index="${index}" role="listitem">
            <div class="saved-handle" title="Drag to reorder">⋮⋮</div>
            <div class="saved-info">
                <span class="saved-priority">#${priority}</span>
                <span class="saved-ssid">${escapeHtml(network.ssid)}</span>
                <span class="saved-security">${network.encryption ? '🔒' : '🔓'}</span>
            </div>
            <div class="saved-controls">
                <input type="number" class="priority-input" value="${priority}" min="1" max="99" aria-label="Priority">
                <label class="toggle-switch small">
                    <input type="checkbox" class="auto-connect-toggle" ${autoConnect ? 'checked' : ''} aria-label="Auto connect">
                    <span class="toggle-slider"></span>
                </label>
                <button class="icon-btn btn-edit" aria-label="Edit ${network.ssid}">✏️</button>
                <button class="icon-btn btn-delete" aria-label="Delete ${network.ssid}">🗑️</button>
                <button class="icon-btn btn-move-up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="icon-btn btn-move-down" aria-label="Move down" ${index === networks.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        </article>
    `;
}

// Note: networks variable needs to be accessible in renderSavedCard
let networks = [];

function updateReconnectStatus(status) {
    document.getElementById('fallback-ap').textContent = status.apFallback ? 'Enabled' : 'Disabled';
    document.getElementById('fallback-timeout').textContent = `${status.fallbackTimeout || 60}s`;
    document.getElementById('scan-interval').textContent = `${status.scanInterval || 30}s`;
    document.getElementById('reconnect-count').textContent = status.reconnectCount || 0;

    const reconnectState = document.getElementById('reconnect-state');
    if (status.apFallback) {
        reconnectState.textContent = 'AP Fallback Active';
        reconnectState.className = 'reconnect-state fallback';
    } else if (status.connected) {
        reconnectState.textContent = 'Connected';
        reconnectState.className = 'reconnect-state connected';
    } else {
        reconnectState.textContent = 'Scanning...';
        reconnectState.className = 'reconnect-state scanning';
    }
}

function initChannelChart() {
    const canvas = document.getElementById('channel-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    channelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
            datasets: [{
                label: 'Networks',
                data: new Array(13).fill(0),
                backgroundColor: 'rgba(30, 136, 229, 0.7)',
                borderColor: '#1E88E5',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Channel ${ctx.label}: ${ctx.raw} network${ctx.raw !== 1 ? 's' : ''}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    title: { display: true, text: 'Network Count' }
                },
                x: {
                    title: { display: true, text: 'Channel' }
                }
            }
        }
    });
}

function updateChannelChart() {
    if (!channelChart) return;

    const counts = new Array(13).fill(0);
    scanResults.forEach(network => {
        const ch = network.channel;
        if (ch >= 1 && ch <= 13) counts[ch - 1]++;
    });

    channelChart.data.datasets[0].data = counts;
    channelChart.update();
}

async function startScan() {
    const btn = document.getElementById('btn-rescan');
    const indicator = document.getElementById('scan-indicator');
    const text = document.getElementById('scan-text');

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loader"></span> Scanning...';
    indicator.className = 'scan-indicator scanning';
    text.textContent = 'Scanning for networks...';

    try {
        const response = await fetch('/api/wifi/scan', { method: 'POST' });
        const result = await response.json();

        if (result.scanning) {
            // Poll for results
            pollScanResults();
        } else if (result.networks) {
            scanResults = result.networks;
            renderScanResults();
            updateChannelChart();
            indicator.className = 'scan-indicator done';
            text.textContent = `Found ${scanResults.length} networks`;
        }
    } catch (e) {
        indicator.className = 'scan-indicator error';
        text.textContent = 'Scan failed';
        showToast('WiFi scan failed', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔍</span> Scan';
    }
}

function pollScanResults() {
    let attempts = 0;
    const maxAttempts = 30;

    scanInterval = setInterval(async () => {
        attempts++;
        try {
            const response = await fetch('/api/wifi/scan');
            const result = await response.json();

            if (result.networks) {
                clearInterval(scanInterval);
                scanResults = result.networks;
                renderScanResults();
                updateChannelChart();
                document.getElementById('scan-indicator').className = 'scan-indicator done';
                document.getElementById('scan-text').textContent = `Found ${scanResults.length} networks`;
            } else if (attempts >= maxAttempts) {
                clearInterval(scanInterval);
                document.getElementById('scan-indicator').className = 'scan-indicator error';
                document.getElementById('scan-text').textContent = 'Scan timeout';
            }
        } catch (e) {
            // Continue polling
        }
    }, 1000);
}

async function connectToNetwork(network) {
    const password = prompt(`Enter password for "${network.ssid}":`);
    if (password === null) return;

    try {
        const response = await fetch('/api/wifi/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssid: network.ssid, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Connection failed');
        showToast(`Connecting to ${network.ssid}...`, 'success');
        await loadWifiData();
    } catch (e) {
        showToast(e.message || 'Connection failed', 'error');
    }
}

async function saveNetwork(network) {
    const password = prompt(`Enter password for "${network.ssid}":`);
    if (password === null) return;

    try {
        const response = await fetch('/api/wifi/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ssid: network.ssid,
                password,
                priority: State.savedNetworks.value.length + 1
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Save failed');
        showToast(`Saved ${network.ssid}`, 'success');
        await loadWifiData();
    } catch (e) {
        showToast(e.message || 'Save failed', 'error');
    }
}

async function editSavedNetwork(index) {
    const network = State.savedNetworks.value[index];
    const password = prompt(`New password for "${network.ssid}" (leave blank to keep current):`);
    if (password === null) return;

    try {
        const response = await fetch(`/api/wifi/saved/${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password || network.password })
        });
        if (!response.ok) throw new Error('Update failed');
        showToast('Network updated', 'success');
        await loadWifiData();
    } catch (e) {
        showToast('Failed to update', 'error');
    }
}

async function deleteSavedNetwork(index) {
    const network = State.savedNetworks.value[index];
    if (!confirm(`Delete "${network.ssid}"?`)) return;

    try {
        const response = await fetch(`/api/wifi/saved/${index}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        showToast('Network deleted', 'success');
        await loadWifiData();
    } catch (e) {
        showToast('Failed to delete', 'error');
    }
}

async function moveNetwork(fromIndex, direction) {
    const toIndex = fromIndex + direction;
    const networks = [...State.savedNetworks.value];
    const [moved] = networks.splice(fromIndex, 1);
    networks.splice(toIndex, 0, moved);

    // Update priorities
    networks.forEach((n, i) => n.priority = i + 1);

    try {
        const response = await fetch('/api/wifi/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networks })
        });
        if (!response.ok) throw new Error('Reorder failed');
        showToast('Priority updated', 'success');
        await loadWifiData();
    } catch (e) {
        showToast('Failed to reorder', 'error');
    }
}

async function updatePriority(index, priority) {
    const networks = [...State.savedNetworks.value];
    networks[index].priority = priority;
    networks.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    networks.forEach((n, i) => n.priority = i + 1);

    try {
        const response = await fetch('/api/wifi/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networks })
        });
        if (!response.ok) throw new Error('Update failed');
        await loadWifiData();
    } catch (e) {
        showToast('Failed to update', 'error');
        renderSavedNetworks(); // Revert
    }
}

async function toggleAutoConnect(index, enabled) {
    const network = State.savedNetworks.value[index];
    try {
        const response = await fetch(`/api/wifi/saved/${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoConnect: enabled })
        });
        if (!response.ok) throw new Error('Update failed');
        showToast(enabled ? 'Auto-connect enabled' : 'Auto-connect disabled', 'success');
    } catch (e) {
        showToast('Failed to update', 'error');
        renderSavedNetworks(); // Revert
    }
}

function setupEventListeners() {
    document.getElementById('btn-rescan')?.addEventListener('click', startScan);
    document.getElementById('btn-refresh-saved')?.addEventListener('click', loadWifiData);
    document.getElementById('btn-disconnect')?.addEventListener('click', async () => {
        try {
            await fetch('/api/wifi/disconnect', { method: 'POST' });
            showToast('Disconnected', 'success');
            await loadWifiData();
        } catch (e) {
            showToast('Failed to disconnect', 'error');
        }
    });
    document.getElementById('btn-connect-current')?.addEventListener('click', async () => {
        if (State.savedNetworks.value.length > 0) {
            // Try to connect to highest priority network
            const network = State.savedNetworks.value[0];
            connectToNetwork({ ssid: network.ssid, rssi: 0, channel: 1 });
        }
    });
}

function subscribeToUpdates() {
    State.wifi.subscribe(() => {
        updateCurrentConnection();
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Simple Chart.js fallback if not available
if (typeof Chart === 'undefined') {
    window.Chart = class Chart {
        constructor(ctx, config) {
            this.ctx = ctx;
            this.config = config;
            this.render();
        }
        render() {
            // Simple canvas rendering fallback
            const ctx = this.ctx;
            const { labels, datasets } = this.config.data;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        update() { this.render(); }
    };
}

export function destroyWifiPage() {
    if (scanInterval) clearInterval(scanInterval);
    if (channelChart) channelChart.destroy();
}