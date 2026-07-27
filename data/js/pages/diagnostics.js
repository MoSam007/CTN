/**
 * pages/diagnostics.js - Diagnostics Page
 * System health monitoring with real-time metrics
 */

import { State, showToast, formatBytes, formatUptime, formatDateTime } from '../state.js';
import { createLinearGauge, createRadialGauge } from '../components/gauge.js';
import { createTimeline, createPaginatedTimeline } from '../components/timeline.js';

let diagnosticsTimeline = null;
let heapChart = null;
let cpuChart = null;

export async function initDiagnosticsPage() {
    const container = document.getElementById('page-diagnostics');
    if (!container) return;

    container.innerHTML = getDiagnosticsHTML();
    await loadDiagnostics();
    initCharts();
    initTimeline();
    setupEventListeners();
    subscribeToUpdates();
}

function getDiagnosticsHTML() {
    return `
        <div class="page page-diagnostics" role="main">
            <header class="page-header">
                <h1>Diagnostics</h1>
                <div class="page-header-actions">
                    <button class="btn btn-secondary btn-sm" id="btn-refresh-diag">
                        <span>↻</span> Refresh
                    </button>
                    <button class="btn btn-primary btn-sm" id="btn-export-diag">
                        <span>📥</span> Export JSON
                    </button>
                </div>
            </header>

            <div class="diagnostics-grid">
                <!-- CPU Card -->
                <section class="diag-card" aria-labelledby="cpu-title">
                    <div class="card-header">
                        <h2 id="cpu-title">⚙️ CPU</h2>
                        <span class="cpu-frequency" id="cpu-freq">80 MHz</span>
                    </div>
                    <div class="metric-large">
                        <span class="metric-value" id="cpu-usage">0%</span>
                        <span class="metric-label">Usage</span>
                    </div>
                    <div class="mini-chart" id="cpu-chart"></div>
                    <div class="diag-details">
                        <div class="detail"><span>Frequency:</span> <span id="cpu-frequency">80 MHz</span></div>
                        <div class="detail"><span>Model:</span> <span id="cpu-model">ESP8266</span></div>
                        <div class="detail"><span>Cores:</span> <span>1</span></div>
                    </div>
                </section>

                <!-- Heap/Memory Card -->
                <section class="diag-card" aria-labelledby="heap-title">
                    <div class="card-header">
                        <h2 id="heap-title">💾 Heap Memory</h2>
                    </div>
                    <div class="heap-visual">
                        <div class="heap-bar-container">
                            <div class="heap-bar-used" id="heap-bar-used" style="width: 0%"></div>
                        </div>
                        <div class="heap-labels">
                            <span id="heap-free">0 KB</span>
                            <span id="heap-total">0 KB</span>
                        </div>
                    </div>
                    <div class="mini-chart" id="heap-chart"></div>
                    <div class="diag-details">
                        <div class="detail"><span>Free:</span> <span id="heap-free-val">0 KB</span></div>
                        <div class="detail"><span>Used:</span> <span id="heap-used-val">0 KB</span></div>
                        <div class="detail"><span>Fragmentation:</span> <span id="heap-frag">0%</span></div>
                        <div class="detail"><span>Max Block:</span> <span id="heap-max-block">0 KB</span></div>
                    </div>
                </section>

                <!-- Flash Storage Card -->
                <section class="diag-card" aria-labelledby="flash-title">
                    <div class="card-header">
                        <h2 id="flash-title">💿 Flash Storage</h2>
                    </div>
                    <div class="flash-visual">
                        <div class="flash-bar-container">
                            <div class="flash-bar-used" id="flash-bar-used" style="width: 0%"></div>
                        </div>
                        <div class="flash-labels">
                            <span id="flash-free">0 KB</span>
                            <span id="flash-total">0 KB</span>
                        </div>
                    </div>
                    <div class="diag-details">
                        <div class="detail"><span>Sketch Size:</span> <span id="flash-sketch">0 KB</span></div>
                        <div class="detail"><span>Free:</span> <span id="flash-free-val">0 KB</span></div>
                        <div class="detail"><span>Total:</span> <span id="flash-total-val">0 KB</span></div>
                        <div class="detail"><span>Wear Estimate:</span> <span id="flash-wear">Good</span></div>
                    </div>
                </section>

                <!-- WiFi Diagnostics Card -->
                <section class="diag-card" aria-labelledby="wifi-diag-title">
                    <div class="card-header">
                        <h2 id="wifi-diag-title">📶 WiFi Diagnostics</h2>
                    </div>
                    <div class="diag-metrics-grid">
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="wifi-connect-attempts">0</span>
                            <span class="diag-metric-label">Connect Attempts</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="wifi-connect-failures">0</span>
                            <span class="diag-metric-label">Failures</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="wifi-reconnects">0</span>
                            <span class="diag-metric-label">Reconnects</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="wifi-ap-uptime">0s</span>
                            <span class="diag-metric-label">AP Uptime</span>
                        </div>
                    </div>
                    <div class="rssi-history" id="rssi-history">
                        <h3>RSSI History</h3>
                        <canvas id="rssi-chart" width="400" height="100"></canvas>
                    </div>
                </section>

                <!-- GPS Diagnostics Card -->
                <section class="diag-card" aria-labelledby="gps-diag-title">
                    <div class="card-header">
                        <h2 id="gps-diag-title">📡 GPS Diagnostics</h2>
                    </div>
                    <div class="diag-metrics-grid">
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-gga-count">0</span>
                            <span class="diag-metric-label">GGA Sentences</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-rmc-count">0</span>
                            <span class="diag-metric-label">RMC Sentences</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-gsa-count">0</span>
                            <span class="diag-metric-label">GSA Sentences</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-gsv-count">0</span>
                            <span class="diag-metric-label">GSV Sentences</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-checksum-errors">0</span>
                            <span class="diag-metric-label">Checksum Errors</span>
                        </div>
                        <div class="diag-metric">
                            <span class="diag-metric-value" id="gps-fix-quality">0</span>
                            <span class="diag-metric-label">Fix Quality</span>
                        </div>
                    </div>
                    <div class="diag-details">
                        <div class="detail"><span>Chars Processed:</span> <span id="gps-chars">0</span></div>
                        <div class="detail"><span>Sentences w/ Fix:</span> <span id="gps-sentences-fix">0</span></div>
                        <div class="detail"><span>Failed Checksum:</span> <span id="gps-checksum-fail">0</span></div>
                        <div class="detail"><span>Time Since Fix:</span> <span id="gps-time-fix">--</span></div>
                    </div>
                </section>

                <!-- Restart Reason Card -->
                <section class="diag-card" aria-labelledby="restart-title">
                    <div class="card-header">
                        <h2 id="restart-title">🔄 Restart Info</h2>
                    </div>
                    <div class="restart-info">
                        <div class="restart-main">
                            <span class="restart-reason" id="restart-reason">Power On</span>
                            <span class="restart-code" id="restart-code">0</span>
                        </div>
                        <div class="restart-details" id="restart-details">
                            <div class="detail"><span>Description:</span> <span id="restart-desc">Normal power on</span></div>
                            <div class="detail"><span>Last Reset:</span> <span id="last-reset-time">--</span></div>
                            <div class="detail"><span>Reset Count:</span> <span id="reset-count">0</span></div>
                        </div>
                    </div>
                </section>

                <!-- Firmware Card -->
                <section class="diag-card" aria-labelledby="fw-title">
                    <div class="card-header">
                        <h2 id="fw-title">📦 Firmware</h2>
                    </div>
                    <div class="diag-details">
                        <div class="detail"><span>Version:</span> <span id="fw-version">1.0.0</span></div>
                        <div class="detail"><span>Build Date:</span> <span id="fw-build-date">--</span></div>
                        <div class="detail"><span>Git Commit:</span> <span id="fw-git">--</span></div>
                        <div class="detail"><span>Sketch Space:</span> <span id="fw-sketch-space">--</span></div>
                        <div class="detail"><span>Free Sketch:</span> <span id="fw-free-sketch">--</span></div>
                        <div class="detail"><span>OTA Enabled:</span> <span id="fw-ota-enabled">Yes</span></div>
                    </div>
                </section>

                <!-- Alert History Card -->
                <section class="diag-card full-width" aria-labelledby="alerts-title">
                    <div class="card-header">
                        <h2 id="alerts-title">🚨 Alert History</h2>
                        <div class="alert-filter">
                            <select id="alert-severity-filter">
                                <option value="">All Severities</option>
                                <option value="emergency">🚨 Emergency</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="info">ℹ️ Info</option>
                            </select>
                        </div>
                    </div>
                    <div class="timeline-container" id="alert-timeline"></div>
                </section>

                <!-- Export Section -->
                <section class="diag-card full-width export-section" aria-labelledby="export-title">
                    <div class="card-header">
                        <h2 id="export-title">📤 Export Diagnostics</h2>
                    </div>
                    <p class="export-desc">Download complete diagnostics snapshot for troubleshooting</p>
                    <div class="export-buttons">
                        <button class="btn btn-primary" id="btn-export-json">
                            <span>📄</span> Download JSON
                        </button>
                        <button class="btn btn-secondary" id="btn-export-csv">
                            <span>📊</span> Download CSV
                        </button>
                        <button class="btn btn-secondary" id="btn-copy-diag">
                            <span>📋</span> Copy to Clipboard
                        </button>
                    </div>
                    <pre class="export-preview" id="export-preview" style="display: none;"></pre>
                </section>
            </div>
        </div>
    `;
}

async function loadDiagnostics() {
    try {
        const response = await fetch('/api/diagnostics/full');
        const data = await response.json();
        if (data) {
            renderDiagnostics(data);
        }
    } catch (e) {
        console.error('Failed to load diagnostics:', e);
        showToast('Failed to load diagnostics', 'error');
    }
}

function renderDiagnostics(data) {
    // CPU
    document.getElementById('cpu-usage').textContent = `${data.cpu?.usage || 0}%`;
    document.getElementById('cpu-frequency').textContent = `${data.cpu?.frequency || 80} MHz`;
    document.getElementById('cpu-model').textContent = data.cpu?.model || 'ESP8266';

    // Heap
    const heap = data.memory?.heap || {};
    const total = heap.total || 81920;
    const free = heap.free || 0;
    const used = total - free;
    const pct = ((used / total) * 100).toFixed(1);

    document.getElementById('heap-bar-used').style.width = `${pct}%`;
    document.getElementById('heap-free').textContent = `${(free/1024).toFixed(1)} KB`;
    document.getElementById('heap-total').textContent = `${(total/1024).toFixed(1)} KB`;
    document.getElementById('heap-free-val').textContent = formatBytes(free);
    document.getElementById('heap-used-val').textContent = formatBytes(used);
    document.getElementById('heap-frag').textContent = `${heap.fragmentation || 0}%`;
    document.getElementById('heap-max-block').textContent = formatBytes(heap.maxBlock || 0);

    // Flash
    const flash = data.memory?.flash || {};
    const flashTotal = flash.total || 4194304;
    const flashUsed = flash.used || 0;
    const flashFree = flashTotal - flashUsed;
    const flashPct = ((flashUsed / flashTotal) * 100).toFixed(1);

    document.getElementById('flash-bar-used').style.width = `${flashPct}%`;
    document.getElementById('flash-free').textContent = formatBytes(flashFree);
    document.getElementById('flash-total').textContent = formatBytes(flashTotal);
    document.getElementById('flash-sketch').textContent = formatBytes(flash.sketchSize || 0);
    document.getElementById('flash-free-val').textContent = formatBytes(flashFree);
    document.getElementById('flash-total-val').textContent = formatBytes(flashTotal);
    document.getElementById('flash-wear').textContent = flash.wear || 'Good';

    // WiFi
    const wifi = data.wifi || {};
    document.getElementById('wifi-connect-attempts').textContent = wifi.connectAttempts || 0;
    document.getElementById('wifi-connect-failures').textContent = wifi.connectFailures || 0;
    document.getElementById('wifi-reconnects').textContent = wifi.reconnects || 0;
    document.getElementById('wifi-ap-uptime').textContent = formatUptime(wifi.apUptime || 0);

    // GPS
    const gps = data.gps || {};
    document.getElementById('gps-gga-count').textContent = gps.ggaCount || 0;
    document.getElementById('gps-rmc-count').textContent = gps.rmcCount || 0;
    document.getElementById('gps-gsa-count').textContent = gps.gsaCount || 0;
    document.getElementById('gps-gsv-count').textContent = gps.gsvCount || 0;
    document.getElementById('gps-checksum-errors').textContent = gps.checksumErrors || 0;
    document.getElementById('gps-fix-quality').textContent = gps.fixQuality || 0;
    document.getElementById('gps-chars').textContent = gps.charsProcessed || 0;
    document.getElementById('gps-sentences-fix').textContent = gps.sentencesWithFix || 0;
    document.getElementById('gps-checksum-fail').textContent = gps.failedChecksum || 0;
    document.getElementById('gps-time-fix').textContent = gps.timeSinceFix ? formatUptime(gps.timeSinceFix / 1000) : '--';

    // Restart
    const restart = data.restart || {};
    document.getElementById('restart-reason').textContent = restart.reason || 'Power On';
    document.getElementById('restart-code').textContent = restart.code || 0;
    document.getElementById('restart-desc').textContent = restart.description || 'Normal power on';
    document.getElementById('last-reset-time').textContent = restart.timestamp ? formatDateTime(restart.timestamp) : '--';
    document.getElementById('reset-count').textContent = restart.count || 1;

    // Firmware
    const fw = data.firmware || {};
    document.getElementById('fw-version').textContent = fw.version || '1.0.0';
    document.getElementById('fw-build-date').textContent = fw.buildDate || '--';
    document.getElementById('fw-git').textContent = fw.gitCommit || '--';
    document.getElementById('fw-sketch-space').textContent = formatBytes(fw.sketchSpace || 0);
    document.getElementById('fw-free-sketch').textContent = formatBytes(fw.freeSketchSpace || 0);
    document.getElementById('fw-ota-enabled').textContent = fw.otaEnabled ? 'Yes' : 'No';

    // Alert History
    if (diagnosticsTimeline && data.alerts?.history) {
        const events = data.alerts.history.map((a, i) => ({
            id: a.timestamp || Date.now() - i * 1000,
            type: a.type,
            timestamp: a.timestamp,
            message: a.message,
            details: a.details,
            severity: a.severity
        }));
        diagnosticsTimeline.setEvents(events);
    }
}

function initCharts() {
    // Simple canvas-based charts for memory/heap trends
    initSimpleChart('cpu-chart', 'CPU Usage', '#1E88E5');
    initSimpleChart('heap-chart', 'Heap Usage', '#43A047');
    initSimpleChart('rssi-chart', 'RSSI (dBm)', '#FB8C00');
}

function initSimpleChart(canvasId, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 80;

    // Store chart data in State for updates
    if (!State.charts) State.charts = {};
    State.charts[canvasId] = { ctx, data: [], maxPoints: 50, color, label };
}

function updateSimpleChart(canvasId, value) {
    const chart = State.charts?.[canvasId];
    if (!chart) return;

    const { ctx, data, maxPoints, color } = chart;
    data.push(value);
    if (data.length > maxPoints) data.shift();

    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;

    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'var(--color-border, #E0E0E0)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = padding + (height - 2 * padding) * i / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw line
    if (data.length > 1) {
        const maxVal = Math.max(...data, 100);
        const minVal = Math.min(...data, 0);
        const range = maxVal - minVal || 1;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        data.forEach((val, i) => {
            const x = padding + (width - 2 * padding) * i / (maxPoints - 1);
            const y = height - padding - (height - 2 * padding) * (val - minVal) / range;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Label
    ctx.fillStyle = 'var(--color-text-secondary, #757575)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${label}: ${value}`, padding, 12);
}

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
}

function initTimeline() {
    diagnosticsTimeline = createPaginatedTimeline('alert-timeline', {
        pageSize: 20,
        typeColors: {
            panic: '#C62828',
            low_battery: '#FB8C00',
            wifi_lost: '#757575',
            gps_lost: '#757575',
            safe_arrival: '#43A047',
            safe_departure: '#1E88E5',
            route_deviation: '#FB8C00',
            default: '#757575'
        },
        typeLabels: {
            panic: 'Panic Button',
            low_battery: 'Low Battery',
            wifi_lost: 'WiFi Lost',
            gps_lost: 'GPS Lost',
            safe_arrival: 'Safe Arrival',
            safe_departure: 'Safe Departure',
            route_deviation: 'Route Deviation'
        }
    });

    // Filter handler
    document.getElementById('alert-severity-filter')?.addEventListener('change', (e) => {
        filterTimeline(e.target.value);
    });
}

function filterTimeline(severity) {
    // Filter is handled by PaginatedTimeline internally
    // This would need to be implemented in the component
    if (diagnosticsTimeline) {
        // Re-render with filtered events
    }
}

function setupEventListeners() {
    document.getElementById('btn-refresh-diag')?.addEventListener('click', loadDiagnostics);

    document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-copy-diag')?.addEventListener('click', copyToClipboard);

    // Resize charts on window resize
    window.addEventListener('resize', () => {
        Object.values(State.charts || {}).forEach(chart => {
            chart.ctx.canvas.width = chart.ctx.canvas.parentElement.clientWidth;
        });
    });
}

function subscribeToUpdates() {
    // Update charts from telemetry
    State.gps.subscribe((gps) => {
        if (gps.rssi) {
            updateSimpleChart('rssi-chart', gps.rssi);
        }
    });

    State.battery.subscribe((battery) => {
        if (battery.heapUsed !== undefined) {
            updateSimpleChart('heap-chart', battery.heapUsed);
        }
    });
}

async function exportJSON() {
    try {
        const response = await fetch('/api/diagnostics/full');
        const data = await response.json();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ctn-diagnostics-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Diagnostics exported as JSON', 'success');
    } catch (e) {
        showToast('Export failed', 'error');
    }
}

async function exportCSV() {
    try {
        const response = await fetch('/api/diagnostics/full');
        const data = await response.json();

        const rows = [];
        // Flatten data to CSV rows
        const flatten = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}_${key}` : key;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    flatten(value, newKey);
                } else {
                    rows.push([newKey, value]);
                }
            }
        };
        flatten(data);

        const csv = [['Key', 'Value'], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ctn-diagnostics-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Diagnostics exported as CSV', 'success');
    } catch (e) {
        showToast('CSV export failed', 'error');
    }
}

async function copyToClipboard() {
    try {
        const response = await fetch('/api/diagnostics/full');
        const data = await response.json();
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        showToast('Diagnostics copied to clipboard', 'success');
    } catch (e) {
        showToast('Copy failed', 'error');
    }
}

export function destroyDiagnosticsPage() {
    if (heapChart) heapChart.destroy();
    if (cpuChart) cpuChart.destroy();
}