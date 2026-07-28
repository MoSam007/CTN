/**
 * CTN Dashboard - Main Entry Point for Modular Architecture
 * ES6 Module-based SPA with reactive state management
 */

import router from './router.js';
import { State, updateFromTelemetry, updateFromAlert, showToast } from './state.js';
import api from './api.js';
import { initMap, addSafeZone, clearSafeZones, centerMap } from './components/map.js';
import { RadialGauge, LinearGauge } from './components/gauge.js';
import { Timeline } from './components/timeline.js';
import { ZoneEditor } from './components/zone-editor.js';
import { initDashboardPage } from './pages/dashboard.js';
import { initSafeLocationsPage } from './pages/safe-locations.js';
import { initBehaviourPage } from './pages/behaviour.js';
import { initWifiPage } from './pages/wifi.js';
import { initDiagnosticsPage } from './pages/diagnostics.js';
import { initSettingsPage } from './pages/settings.js';
import { initDemoMode } from './demo.js';

//--------------------------------------------------
// Global Components & State
//--------------------------------------------------
let zoneEditor = null;
let activeGauges = new Map();
let activeTimelines = new Map();

//--------------------------------------------------
// Page Initialization Mapping
//--------------------------------------------------
const pageInitializers = {
    'dashboard': initDashboardPage,
    'safe-locations': initSafeLocationsPage,
    'behaviour': initBehaviourPage,
    'wifi': initWifiPage,
    'diagnostics': initDiagnosticsPage,
    'settings': initSettingsPage
};

//--------------------------------------------------
// WebSocket Connection
//--------------------------------------------------
function connectWebSocket() {
    // WebSocket server runs on port 81 (dashboard is on port 80)
    const wsHost = location.hostname;
    const wsPort = location.port ? parseInt(location.port) + 1 : 81;
    const wsUrl = `ws://${wsHost}:${wsPort}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('[WS] Connected');
        State.wsConnected.value = true;
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'init':
                case 'telemetry':
                    updateFromTelemetry(data);
                    break;
                case 'alert':
                    updateFromAlert(data);
                    break;
                case 'pong':
                    // Heartbeat response
                    break;
                case 'ota-progress':
                    // OTA progress update
                    State.ota.value = { ...State.ota.value, progress: data.progress, status: data.status };
                    break;
                default:
                    console.log('[WS] Unknown message type:', data.type);
            }
        } catch (e) {
            console.error('[WS] Message parse error:', e);
        }
    };

    ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting...');
        State.wsConnected.value = false;
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (error) => {
        console.error('[WS] Error:', error);
    };

    // Store reference for sending messages
    window.ws = ws;
}

//--------------------------------------------------
// Register Routes
//--------------------------------------------------
router
    .add('/', (params, path) => { location.hash = 'dashboard'; })  // Empty hash -> dashboard (fires hashchange)
    .add('dashboard', (params, path) => { })
    .add('safe-locations', (params, path) => { })
    .add('behaviour', (params, path) => { })
    .add('wifi', (params, path) => { })
    .add('battery', (params, path) => { })
    .add('gps', (params, path) => { })
    .add('diagnostics', (params, path) => { })
    .add('settings', (params, path) => { });

//--------------------------------------------------
// Route Guards - Initialize pages on navigation
//--------------------------------------------------
router.afterEach(async ({ path }) => {
    const pageName = path.split('/')[1] || 'dashboard';

    // Update current page in state
    State.currentPage.value = pageName;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === pageName);
    });

    // Show active page, hide others
    document.querySelectorAll('.page').forEach(el => {
        el.classList.toggle('active', el.id === `page-${pageName}`);
    });

    // Initialize page if needed
    if (pageInitializers[pageName]) {
        try {
            await pageInitializers[pageName]({
                state: State,
                api,
                router,
                components: {
                    RadialGauge,
                    LinearGauge,
                    Timeline,
                    ZoneEditor,
                    initMap,
                    addSafeZone,
                    clearSafeZones,
                    centerMap
                }
            });
        } catch (e) {
            console.error(`Page init error [${pageName}]:`, e);
        }
    }

    // Update demo mode banner visibility
    updateDemoBanner();
});

//--------------------------------------------------
// Demo Mode Banner
//--------------------------------------------------
function updateDemoBanner() {
    const existing = document.getElementById('demo-banner');
    if (State.demoMode.value) {
        if (!existing) {
            const banner = document.createElement('div');
            banner.id = 'demo-banner';
            banner.className = 'demo-banner';
            banner.innerHTML = `
                <span class="demo-banner-icon">🧪</span>
                <span class="demo-banner-text">
                    <strong>Demo Mode Active</strong> - Scenario: ${State.demoScenarioName.value}
                </span>
                <button class="btn btn-ghost btn-sm" onclick="window.api.setDemoMode(false)">Exit Demo</button>
            `;
            document.body.insertBefore(banner, document.body.firstChild);
        }
    } else if (existing) {
        existing.remove();
    }
}

//--------------------------------------------------
// Global API Access for Inline Event Handlers
//--------------------------------------------------
window.api = api;
window.State = State;
window.router = router;

//--------------------------------------------------
// Service Worker Registration
//--------------------------------------------------
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('[SW] Registered:', registration.scope);

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showToast('New version available. Refresh to update.', 'info', 0);
                    }
                });
            });
        } catch (e) {
            console.warn('[SW] Registration failed:', e);
        }
    }
}

//--------------------------------------------------
// Initialization
//--------------------------------------------------
async function init() {
    console.log('CTN Dashboard v2 initializing...');

    // Initialize DemoMode (loads from localStorage)
    initDemoMode();

    // Sync demo mode state
    State.demoMode.value = api.demoMode;
    State.demoScenario.value = api.demoScenario;
    State.demoScenarioName.value = State.demoScenario.value.charAt(0).toUpperCase() + State.demoScenario.value.slice(1);

    // Connect WebSocket
    connectWebSocket();

    // Register Service Worker
    registerServiceWorker();

    // Theme initialization
    const savedTheme = localStorage.getItem('ctn-theme') || 'light';
    document.documentElement.classList.add(savedTheme);

    // Theme toggle handler
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            document.documentElement.classList.toggle('light', !isDark);
            localStorage.setItem('ctn-theme', isDark ? 'dark' : 'light');
        });
    }

    // Initial route
    router._handleHashChange();

    // Update demo banner
    updateDemoBanner();

    console.log('CTN Dashboard ready');
}

// Start when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}