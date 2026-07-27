/**
 * State.js - Reactive State Management for CTN Dashboard
 * Uses a simple signal/observer pattern for reactive UI updates
 */

class Signal {
    constructor(initialValue) {
        this._value = initialValue;
        this._subscribers = new Set();
    }

    get value() {
        return this._value;
    }

    set value(newValue) {
        if (newValue !== this._value) {
            this._value = newValue;
            this._notify();
        }
    }

    subscribe(callback) {
        this._subscribers.add(callback);
        return () => this._subscribers.delete(callback);
    }

    _notify() {
        this._subscribers.forEach(cb => {
            try {
                cb(this._value);
            } catch (e) {
                console.error('Signal callback error:', e);
            }
        });
    }
}

class ComputedSignal {
    constructor(computeFn, deps = []) {
        this._computeFn = computeFn;
        this._deps = deps;
        this._value = null;
        this._subscribers = new Set();
        this._dirty = true;

        // Subscribe to dependencies
        this._unsubs = deps.map(dep => dep.subscribe(() => {
            this._dirty = true;
            this._notify();
        }));
    }

    get value() {
        if (this._dirty) {
            this._value = this._computeFn();
            this._dirty = false;
        }
        return this._value;
    }

    subscribe(callback) {
        this._subscribers.add(callback);
        return () => this._subscribers.delete(callback);
    }

    _notify() {
        this._subscribers.forEach(cb => {
            try {
                cb(this.value);
            } catch (e) {
                console.error('ComputedSignal callback error:', e);
            }
        });
    }

    destroy() {
        this._unsubs.forEach(unsub => unsub());
        this._unsubs = [];
        this._subscribers.clear();
    }
}

//--------------------------------------------------
// Global State Store
//--------------------------------------------------
const State = {
    // Connection
    wsConnected: new Signal(false),
    apiError: new Signal(null),

    // Demo Mode
    demoMode: new Signal(false),
    demoScenario: new Signal('idle'),
    demoScenarioName: new Signal('Idle'),

    // Device Status
    device: new Signal({
        name: 'CTN-001',
        firmware: '1.0',
        chipId: 0,
        uptime: 0,
        freeHeap: 0,
        resetReason: ''
    }),

    // Battery
    battery: new Signal({
        percentage: 85,
        voltage: 3.82,
        state: 'Good',
        charging: false,
        runtimeHours: 48,
        health: 'Good'
    }),

    // GPS
    gps: new Signal({
        latitude: -1.29210,
        longitude: 36.82190,
        satellites: 8,
        hdop: 1.2,
        speed: 0,
        heading: 0,
        altitude: 1650,
        hasFix: true,
        accuracy: 6,
        stats: {
            charsProcessed: 0,
            sentencesWithFix: 0,
            failedChecksum: 0,
            timeSinceFix: 0
        }
    }),

    // WiFi
    wifi: new Signal({
        connected: false,
        apMode: true,
        ssid: '',
        ip: '',
        gateway: '',
        dns: '',
        subnetMask: '',
        rssi: -100,
        signalQuality: 0,
        macAddress: '',
        channel: 0,
        internet: false
    }),

    // Saved WiFi Networks
    savedNetworks: new Signal([]),

    // Safe Zones
    safeZones: new Signal([]),

    // Behaviour
    behaviour: new Signal({
        riskScore: 12,
        state: 'SAFE',
        stateCode: 0,
        anomalyCount: 0,
        recentAnomalies: []
    }),

    behaviourConfig: new Signal({}),
    behaviourRoutes: new Signal([]),

    // Diagnostics
    diagnostics: new Signal({}),

    // Device Settings
    deviceSettings: new Signal({
        deviceName: 'CTN-001',
        ownerName: '',
        phoneNumber: '',
        timezone: 'Africa/Nairobi',
        language: 'en',
        units: 'metric',
        autoUpdate: true,
        debugMode: false
    }),

    // Alerts
    alerts: new Signal({
        history: [],
        count: 0,
        unreadCount: 0
    }),

    // OTA
    ota: new Signal({
        inProgress: false,
        state: 0,
        progress: 0,
        error: ''
    }),

    // Telegram
    telegram: new Signal({
        configured: false,
        enabled: false,
        hasToken: false,
        hasChatId: false
    }),

    // Current Page
    currentPage: new Signal('dashboard'),

    // UI State
    ui: new Signal({
        sidebarOpen: false,
        theme: 'light',
        loading: {},
        toasts: []
    }),

    //--------------------------------------------------
    // Computed Signals
    //--------------------------------------------------

    // Battery color based on percentage
    batteryColor: new ComputedSignal(() => {
        const pct = State.battery.value.percentage;
        if (pct >= 80) return 'var(--color-success, #43A047)';
        if (pct >= 50) return 'var(--color-warning, #FB8C00)';
        if (pct >= 20) return 'var(--color-warning, #FB8C00)';
        return 'var(--color-error, #E53935)';
    }, [State.battery]),

    // Risk score color
    riskColor: new ComputedSignal(() => {
        const score = State.behaviour.value.riskScore;
        if (score >= 70) return 'var(--color-error, #E53935)';
        if (score >= 50) return 'var(--color-warning, #FB8C00)';
        if (score >= 30) return 'var(--color-info, #1E88E5)';
        return 'var(--color-success, #43A047)';
    }, [State.behaviour]),

    // Risk label
    riskLabel: new ComputedSignal(() => {
        const score = State.behaviour.value.riskScore;
        if (score >= 70) return 'EMERGENCY';
        if (score >= 50) return 'WARNING';
        if (score >= 30) return 'WATCH';
        return 'SAFE';
    }, [State.behaviour]),

    // GPS status text
    gpsStatusText: new ComputedSignal(() => {
        const gps = State.gps.value;
        if (!gps.hasFix) return 'No Fix';
        if (gps.satellites >= 8) return 'Excellent';
        if (gps.satellites >= 5) return 'Good';
        return 'Fair';
    }, [State.gps]),

    // WiFi signal bars (0-4)
    wifiBars: new ComputedSignal(() => {
        const rssi = State.wifi.value.rssi;
        if (rssi >= -50) return 4;
        if (rssi >= -60) return 3;
        if (rssi >= -70) return 2;
        if (rssi >= -80) return 1;
        return 0;
    }, [State.wifi]),

    // Compile-time constants
    zoneColors: {
        0: '#1E88E5', // Home - Blue
        1: '#43A047', // School - Green
        2: '#8E24AA'  // Custom - Purple
    },

    zoneTypeLabels: {
        0: 'Home',
        1: 'School',
        2: 'Custom'
    },

    behaviourStateLabels: {
        0: 'SAFE',
        1: 'WATCH',
        2: 'WARNING',
        3: 'EMERGENCY'
    },

    anomalyTypeLabels: {
        0: 'None',
        1: 'Route Deviation',
        2: 'Long Stop',
        3: 'Running',
        4: 'Wandering',
        5: 'Leaving School',
        6: 'Leaving Safe Zone',
        7: 'Night Movement',
        8: 'Repeated Movement',
        9: 'Unexpected Movement'
    },

    batteryStateLabels: {
        0: 'Full',
        1: 'Good',
        2: 'Normal',
        3: 'Low',
        4: 'Critical'
    }
};

//--------------------------------------------------
// Helper Functions
//--------------------------------------------------

function formatTime(ms) {
    if (!ms) return '--:--';
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ms) {
    if (!ms) return '--/--/----';
    const date = new Date(ms);
    return date.toLocaleDateString();
}

function formatDateTime(ms) {
    if (!ms) return '--/--/---- --:--';
    const date = new Date(ms);
    return date.toLocaleString();
}

function formatDuration(ms) {
    if (!ms || ms < 1000) return '< 1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

function formatUptime(seconds) {
    if (!seconds) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins) parts.push(`${mins}m`);
    if (secs || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

//--------------------------------------------------
// State Update Functions (called from API/WS handlers)
//--------------------------------------------------

function updateFromStatus(data) {
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

    // Update Firmware/Device
    if (data.firmware) {
        State.device.value = { ...State.device.value, ...data.firmware };
    }

    // Update State
    if (data.state) {
        State.behaviour.value = {
            ...State.behaviour.value,
            riskScore: data.state.riskScore ?? State.behaviour.value.riskScore,
            state: data.state.behaviour ?? State.behaviour.value.state
        };
    }

    // Demo mode flag
    if (data.demoMode !== undefined) {
        State.demoMode.value = data.demoMode;
    }
    if (data.demoScenario !== undefined) {
        State.demoScenario.value = data.demoScenario;
        State.demoScenarioName.value = data.demoScenarioName || `Scenario ${data.demoScenario}`;
    }
}

function updateFromTelemetry(data) {
    // Called from WebSocket telemetry broadcast
    if (data.battery) {
        State.battery.value = { ...State.battery.value, ...data.battery };
    }
    if (data.gps) {
        State.gps.value = { ...State.gps.value, ...data.gps };
    }
    if (data.riskScore !== undefined) {
        State.behaviour.value = { ...State.behaviour.value, riskScore: data.riskScore };
    }
    if (data.behaviourState !== undefined) {
        State.behaviour.value = { ...State.behaviour.value, stateCode: data.behaviourState };
    }
    if (data.wifi) {
        State.wifi.value = { ...State.wifi.value, ...data.wifi };
    }
    if (data.demoMode !== undefined) {
        State.demoMode.value = data.demoMode;
    }
    if (data.demoScenario !== undefined) {
        State.demoScenario.value = data.demoScenario;
    }
    if (data.demoScenarioName) {
        State.demoScenarioName.value = data.demoScenarioName;
    }
}

function updateFromAlert(data) {
    if (data.type === 'alert') {
        const alert = {
            type: data.alertType,
            message: data.message,
            timestamp: data.timestamp,
            read: false
        };
        const alerts = State.alerts.value;
        alerts.history.unshift(alert);
        alerts.count = alerts.history.length;
        alerts.unreadCount = alerts.history.filter(a => !a.read).length;
        State.alerts.value = { ...alerts };

        // Show toast
        showToast(alert.message, 'warning');
    }
}

//--------------------------------------------------
// Toast Notifications
//--------------------------------------------------

function showToast(message, type = 'info', duration = 5000) {
    const toast = {
        id: Date.now() + Math.random(),
        message,
        type,
        duration
    };

    const ui = State.ui.value;
    ui.toasts = [...ui.toasts, toast];
    State.ui.value = { ...ui };

    // Auto-remove
    setTimeout(() => {
        const current = State.ui.value;
        current.toasts = current.toasts.filter(t => t.id !== toast.id);
        State.ui.value = { ...current };
    }, duration);
}

function dismissToast(id) {
    const ui = State.ui.value;
    ui.toasts = ui.toasts.filter(t => t.id !== id);
    State.ui.value = { ...ui };
}

//--------------------------------------------------
// Export
//--------------------------------------------------

export {
    State,
    Signal,
    ComputedSignal,
    formatTime,
    formatDate,
    formatDateTime,
    formatDuration,
    formatUptime,
    formatBytes,
    updateFromStatus,
    updateFromTelemetry,
    updateFromAlert,
    showToast,
    dismissToast
};

export default State;