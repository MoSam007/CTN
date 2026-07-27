/**
 * api.js - API Client + WebSocket Wrapper for CTN Dashboard
 * Intercepts calls in demo mode to return simulated data
 */

import { State } from './state.js';

class APIClient {
    constructor() {
        this.baseURL = '/api';
        this.ws = null;
        this.wsReconnectDelay = 1000;
        this.wsMaxReconnectDelay = 30000;
        this.wsConnected = false;
        this.handlers = new Map();
        this.demoMode = false;
        this.demoScenario = 'idle';
        this._demoDataInterval = null;

        // Load demo mode from localStorage
        try {
            this.demoMode = localStorage.getItem('ctn-demo-mode') === 'true';
            this.demoScenario = localStorage.getItem('ctn-demo-scenario') || 'idle';
        } catch (e) {
            // localStorage not available
        }
    }

    //--------------------------------------------------
    // HTTP Request Wrapper
    //--------------------------------------------------
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            State.apiError.value = error.message;
            throw error;
        }
    }

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    post(endpoint, body) {
        return this.request(endpoint, { method: 'POST', body });
    }

    put(endpoint, body) {
        return this.request(endpoint, { method: 'PUT', body });
    }

    delete(endpoint, body) {
        return this.request(endpoint, { method: 'DELETE', body });
    }

    //--------------------------------------------------
    // Demo Mode Interception
    //--------------------------------------------------
    setDemoMode(enabled, scenario = 'idle') {
        this.demoMode = enabled;
        this.demoScenario = scenario;

        try {
            localStorage.setItem('ctn-demo-mode', enabled.toString());
            localStorage.setItem('ctn-demo-scenario', scenario);
        } catch (e) {
            // Ignore
        }

        if (enabled) {
            this._startDemoSimulation();
        } else {
            this._stopDemoSimulation();
        }

        State.demoMode.value = enabled;
        State.demoScenario.value = scenario;
    }

    _startDemoSimulation() {
        // Simulate periodic telemetry updates
        this._demoDataInterval = setInterval(() => {
            this._simulateTelemetry();
        }, 1000);
    }

    _stopDemoSimulation() {
        if (this._demoDataInterval) {
            clearInterval(this._demoDataInterval);
            this._demoDataInterval = null;
        }
    }

    _simulateTelemetry() {
        // This generates simulated data when in demo mode
        // The actual demo data comes from the ESP8266 backend via WebSocket
        // This is just for initial page load before WS connects

        const scenarios = {
            idle: this._getIdleData(),
            walkToSchool: this._getWalkToSchoolData(),
            routeDeviation: this._getRouteDeviationData(),
            panicButton: this._getPanicButtonData(),
            lowBattery: this._getLowBatteryData(),
            nightWandering: this._getNightWanderingData(),
            safeArrival: this._getSafeArrivalData()
        };

        const data = scenarios[this.demoScenario] || scenarios.idle;
        this._dispatchDemoData(data);
    }

    _getIdleData() {
        return {
            type: 'telemetry',
            battery: { percentage: 85, voltage: 3.82, state: 'Normal', charging: false, runtimeHours: 42, health: 'Good' },
            gps: { lat: -1.29210, lon: 36.82190, speed: 0, course: 0, fix: true, satellites: 8, hdop: 1.2, accuracy: 6 },
            riskScore: 12,
            behaviourState: 0,
            wifi: { rssi: -52, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'idle'
        };
    }

    _getWalkToSchoolData() {
        const progress = (Date.now() / 30000) % 1; // 30 second loop
        const lat = -1.29210 + progress * 0.0046;
        const lon = 36.82190 + progress * 0.0023;
        return {
            type: 'telemetry',
            battery: { percentage: Math.max(85 - progress * 5, 80), voltage: 3.8, state: 'Normal', charging: false, runtimeHours: 40, health: 'Good' },
            gps: { lat, lon, speed: 4.5, course: 45, fix: true, satellites: 8, hdop: 1.2, accuracy: 6 },
            riskScore: 15 + Math.sin(Date.now() / 10000) * 5,
            behaviourState: 0,
            wifi: { rssi: -55, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'walkToSchool'
        };
    }

    _getRouteDeviationData() {
        return {
            type: 'telemetry',
            battery: { percentage: 70, voltage: 3.75, state: 'Normal', charging: false, runtimeHours: 28, health: 'Good' },
            gps: { lat: -1.28600, lon: 36.82600, speed: 6.0, course: 90, fix: true, satellites: 7, hdop: 1.5, accuracy: 7.5 },
            riskScore: 65,
            behaviourState: 2,
            wifi: { rssi: -60, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'routeDeviation'
        };
    }

    _getPanicButtonData() {
        return {
            type: 'telemetry',
            battery: { percentage: 60, voltage: 3.7, state: 'Normal', charging: false, runtimeHours: 24, health: 'Good' },
            gps: { lat: -1.29210, lon: 36.82190, speed: 0, course: 0, fix: true, satellites: 8, hdop: 1.2, accuracy: 6 },
            riskScore: 95,
            behaviourState: 3,
            wifi: { rssi: -52, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'panicButton'
        };
    }

    _getLowBatteryData() {
        return {
            type: 'telemetry',
            battery: { percentage: 8, voltage: 3.2, state: 'Critical', charging: false, runtimeHours: 0.5, health: 'Fair' },
            gps: { lat: -1.29210, lon: 36.82190, speed: 0, course: 0, fix: true, satellites: 8, hdop: 1.2, accuracy: 6 },
            riskScore: 25,
            behaviourState: 0,
            wifi: { rssi: -52, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'lowBattery'
        };
    }

    _getNightWanderingData() {
        return {
            type: 'telemetry',
            battery: { percentage: 45, voltage: 3.65, state: 'Normal', charging: false, runtimeHours: 18, health: 'Good' },
            gps: { lat: -1.29400, lon: 36.82000, speed: 1.5, course: 180, fix: true, satellites: 6, hdop: 2.0, accuracy: 10 },
            riskScore: 70,
            behaviourState: 2,
            wifi: { rssi: -65, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'nightWandering'
        };
    }

    _getSafeArrivalData() {
        return {
            type: 'telemetry',
            battery: { percentage: 75, voltage: 3.78, state: 'Normal', charging: false, runtimeHours: 35, health: 'Good' },
            gps: { lat: -1.29210, lon: 36.82190, speed: 0, course: 0, fix: true, satellites: 8, hdop: 1.1, accuracy: 5.5 },
            riskScore: 10,
            behaviourState: 0,
            wifi: { rssi: -52, connected: true, apMode: false, ssid: 'HomeNetwork' },
            timestamp: Date.now(),
            demoMode: true,
            demoScenario: 'safeArrival'
        };
    }

    _dispatchDemoData(data) {
        this.handlers.get('telemetry')?.forEach(fn => fn(data));
    }

    //--------------------------------------------------
    // WebSocket
    //--------------------------------------------------
    connectWS() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsURL = `${protocol}//${location.host}/ws`;

        try {
            this.ws = new WebSocket(wsURL);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.wsConnected = true;
                this.wsReconnectDelay = 1000;
                State.wsConnected.value = true;
                this.dispatch('ws-open', {});
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleWSMessage(msg);
                } catch (e) {
                    console.warn('WS parse error:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected, reconnecting...');
                this.wsConnected = false;
                State.wsConnected.value = false;
                this.dispatch('ws-close', {});
                setTimeout(() => this.connectWS(), this.wsReconnectDelay);
                this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 1.5, this.wsMaxReconnectDelay);
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                this.dispatch('ws-error', { error: err });
            };
        } catch (e) {
            console.error('WebSocket connection failed:', e);
            setTimeout(() => this.connectWS(), this.wsReconnectDelay);
        }
    }

    handleWSMessage(msg) {
        const type = msg.type;
        this.dispatch(type, msg);
        this.dispatch('message', msg);
    }

    sendWS(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    //--------------------------------------------------
    // Event Handler System
    //--------------------------------------------------
    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type).add(handler);

        return () => this.off(type, handler);
    }

    off(type, handler) {
        if (this.handlers.has(type)) {
            this.handlers.get(type).delete(handler);
        }
    }

    dispatch(type, data) {
        if (this.handlers.has(type)) {
            this.handlers.get(type).forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`Handler error for ${type}:`, e);
                }
            });
        }
    }

    //--------------------------------------------------
    // High-level API Methods (with demo mode support)
    //--------------------------------------------------

    // Device Status
    async getStatus() {
        if (this.demoMode) return this._getIdleData(); // Simulated
        return this.get('/status');
    }

    async getDevice() {
        if (this.demoMode) return {
            deviceName: 'CTN-001',
            firmwareVersion: '1.2.0',
            chipId: 123456,
            flashChipId: 789012,
            flashChipSize: 4194304,
            freeHeap: 38240,
            heapFragmentation: 15,
            uptime: Math.floor(Date.now() / 1000),
            resetReason: 'Power On',
            cpuFreqMHz: 160,
            sketchSize: 450000,
            freeSketchSpace: 1200000
        };
        return this.get('/device');
    }

    // Battery
    async getBattery() {
        if (this.demoMode) {
            const data = this._getIdleData();
            return data.battery;
        }
        return this.get('/battery');
    }

    // GPS
    async getGPS() {
        if (this.demoMode) {
            const data = this._getIdleData();
            return data.gps;
        }
        return this.get('/gps');
    }

    // WiFi
    async getWiFiStatus() {
        if (this.demoMode) {
            const data = this._getIdleData();
            return data.wifi;
        }
        return this.get('/wifi/status');
    }

    async scanWiFi() {
        if (this.demoMode) {
            return {
                networks: [
                    { ssid: 'HomeNetwork', rssi: -52, encryption: 4, channel: 6, secure: true },
                    { ssid: 'OfficeWiFi', rssi: -68, encryption: 4, channel: 11, secure: true },
                    { ssid: 'GuestNetwork', rssi: -75, encryption: 0, channel: 1, secure: false }
                ],
                count: 3
            };
        }
        return this.get('/wifi/scan');
    }

    async getSavedWiFi() {
        if (this.demoMode) {
            return {
                savedNetworks: [
                    { ssid: 'HomeNetwork', priority: 1, autoConnect: true, hidden: false, lastConnected: Date.now() - 3600000, failCount: 0 },
                    { ssid: 'OfficeWiFi', priority: 2, autoConnect: true, hidden: false, lastConnected: Date.now() - 86400000, failCount: 0 }
                ],
                count: 2
            };
        }
        return this.get('/wifi/saved');
    }

    async connectWiFi(ssid, password) {
        if (this.demoMode) return { success: true, ip: '192.168.1.100', ssid };
        return this.post('/wifi/connect', { ssid, password });
    }

    async saveWiFi(ssid, password, priority = 255, autoConnect = true, hidden = false) {
        if (this.demoMode) return { success: true, message: 'Network saved (demo)', ssid, priority };
        return this.post('/wifi/save', { ssid, password, priority, autoConnect, hidden });
    }

    async updateWiFi(ssid, password, priority, autoConnect, hidden) {
        if (this.demoMode) return { success: true, message: 'Network updated (demo)' };
        return this.put('/wifi/update', { ssid, password, priority, autoConnect, hidden });
    }

    async removeWiFi(ssid) {
        if (this.demoMode) return { success: true, message: 'Network removed (demo)' };
        return this.delete('/wifi/remove', { ssid });
    }

    async reorderWiFi(order) {
        if (this.demoMode) return { success: true, message: 'Reordered (demo)' };
        return this.post('/wifi/reorder', { order });
    }

    async reconnectWiFi() {
        if (this.demoMode) return { success: true, message: 'Reconnecting (demo)' };
        return this.post('/wifi/reconnect');
    }

    // Safe Zones
    async getSafeZones() {
        if (this.demoMode) {
            return {
                zones: [
                    { index: 0, name: 'Home', type: 0, latitude: -1.29210, longitude: 36.82190, radius: 100, enabled: true },
                    { index: 1, name: 'School', type: 1, latitude: -1.27850, longitude: 36.81080, radius: 150, enabled: true }
                ],
                count: 2
            };
        }
        return this.get('/safe-zones');
    }

    async addSafeZone(zone) {
        if (this.demoMode) return { success: true, message: 'Zone added (demo)', index: 2 };
        return this.post('/safe-zones', zone);
    }

    async updateSafeZone(index, zone) {
        if (this.demoMode) return { success: true, message: 'Zone updated (demo)' };
        return this.put(`/safe-zones/${index}`, zone);
    }

    async deleteSafeZone(index) {
        if (this.demoMode) return { success: true, message: 'Zone deleted (demo)' };
        return this.delete(`/safe-zones/${index}`);
    }

    // Behaviour
    async getBehaviourStatus() {
        if (this.demoMode) {
            return {
                riskScore: 15,
                state: 'SAFE',
                stateCode: 0,
                anomalyCount: 0,
                recentAnomalies: []
            };
        }
        return this.get('/behaviour/status');
    }

    async getBehaviourConfig() {
        if (this.demoMode) {
            return {
                minVisitsToLearn: 3,
                learningRate: 0.1,
                routeTimeout: 300000,
                maxDeviationDistance: 50,
                maxStopDuration: 300000,
                runningSpeedThreshold: 10,
                wanderingSpeedThreshold: 2,
                nightStartHour: 22,
                nightEndHour: 6,
                maxRepeatedMovements: 5,
                watchThreshold: 70,
                warningThreshold: 50,
                emergencyThreshold: 30,
                enableRouteDeviationAlerts: true,
                enableLongStopAlerts: true,
                enableRunningAlerts: true,
                enableWanderingAlerts: true,
                enableSchoolAlerts: true,
                enableSafeZoneAlerts: true,
                enableNightMovementAlerts: true,
                enableRepeatedMovementAlerts: true
            };
        }
        return this.get('/behaviour/config');
    }

    async saveBehaviourConfig(config) {
        if (this.demoMode) return { success: true, message: 'Config saved (demo)' };
        return this.post('/behaviour/config', config);
    }

    async getBehaviourRoutes() {
        if (this.demoMode) return { routes: [], count: 0 };
        return this.get('/behaviour/routes');
    }

    // Diagnostics
    async getDiagnostics() {
        if (this.demoMode) {
            return {
                system: {
                    freeHeap: 38240,
                    maxFreeBlock: 32000,
                    heapFragmentation: 16,
                    uptime: Math.floor(Date.now() / 1000),
                    resetReason: 'Power On',
                    cpuFreqMHz: 160,
                    sketchSize: 450000,
                    freeSketchSpace: 1200000,
                    flashChipSize: 4194304,
                    flashChipId: 789012
                },
                wifi: { connected: true, apMode: false, rssi: -52, signalQuality: 85, ssid: 'HomeNetwork', ip: '192.168.1.100', macAddress: 'AA:BB:CC:DD:EE:FF', channel: 6, internet: true },
                gps: { hasFix: true, satellites: 8, hdop: 1.2, charsProcessed: 156000, sentencesWithFix: 1540, failedChecksum: 20, timeSinceFix: 500, latitude: -1.29210, longitude: 36.82190 },
                battery: { percentage: 85, voltage: 3.82, state: 'Normal', charging: false, runtimeHours: 42, health: 'Good' },
                behaviour: { riskScore: 12, state: 'SAFE', anomalyCount: 0 },
                alerts: { pending: 0, historyCount: 5 },
                safeZones: { count: 2 },
                ota: { inProgress: false, state: 0, progress: 0, error: '' }
            };
        }
        return this.get('/diagnostics/full');
    }

    // Device Settings
    async getDeviceSettings() {
        if (this.demoMode) {
            return {
                deviceName: 'CTN-001',
                ownerName: 'Parent Name',
                phoneNumber: '+254700000000',
                timezone: 'Africa/Nairobi',
                language: 'en',
                units: 'metric',
                autoUpdate: true,
                debugMode: false
            };
        }
        return this.get('/device/settings');
    }

    async saveDeviceSettings(settings) {
        if (this.demoMode) return { success: true, message: 'Settings saved (demo)' };
        return this.post('/device/settings', settings);
    }

    // Alerts
    async getAlertHistory() {
        if (this.demoMode) {
            return {
                alerts: [
                    { index: 0, type: 22, priority: 2, title: 'Safe Arrival', message: 'Arrived at School', location: 'School', timestamp: Date.now() - 3600000, acknowledged: true },
                    { index: 1, type: 23, priority: 1, title: 'Safe Departure', message: 'Left Home', location: 'Home', timestamp: Date.now() - 7200000, acknowledged: true }
                ],
                count: 2
            };
        }
        return this.get('/alerts/history');
    }

    async acknowledgeAlert(index) {
        if (this.demoMode) return { success: true, message: 'Alert acknowledged (demo)' };
        return this.post('/alerts/acknowledge', { index });
    }

    // OTA
    async getOTAStatus() {
        if (this.demoMode) {
            return { inProgress: false, state: 0, progress: 0, error: '' };
        }
        return this.get('/ota/status');
    }

    async startOTAUpdate(file) {
        if (this.demoMode) {
            // Simulate OTA progress
            this._simulateOTAProgress();
            return { success: true, message: 'OTA started (demo simulation)' };
        }

        const formData = new FormData();
        formData.append('firmware', file);

        const response = await fetch(`${this.baseURL}/ota/update`, {
            method: 'POST',
            body: formData
        });

        return response.json();
    }

    _simulateOTAProgress() {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                this.dispatch('ota-progress', { progress: 100, status: 'Update complete! Restarting...' });
                setTimeout(() => {
                    this.dispatch('ota-progress', { progress: 100, status: 'Restarting...' });
                }, 1000);
            } else {
                this.dispatch('ota-progress', { progress: Math.round(progress), status: `Writing... ${Math.round(progress)}%` });
            }
        }, 500);
    }

    // Telegram
    async getTelegramStatus() {
        if (this.demoMode) {
            return { configured: true, enabled: true, hasToken: true, hasChatId: true };
        }
        return this.get('/telegram/status');
    }

    async saveTelegramConfig(botToken, chatId, enabled = true) {
        if (this.demoMode) return { success: true, message: 'Telegram config saved (demo)' };
        return this.post('/telegram/save', { botToken, chatId, enabled });
    }

    async testTelegram() {
        if (this.demoMode) return { success: true, message: 'Test message sent (demo)' };
        return this.post('/telegram/test');
    }

    // Device Control
    async restartDevice() {
        if (this.demoMode) return { success: true, message: 'Restarting (demo)' };
        return this.post('/device/restart');
    }

    async resetDevice() {
        if (this.demoMode) return { success: true, message: 'Factory reset (demo)' };
        return this.post('/device/reset');
    }

    // Demo Mode Control
    async setDemoScenario(scenario) {
        this.setDemoMode(true, scenario);

        // Send to backend if real device
        if (!this.demoMode) {
            return this.post('/demo/scenario', { scenario });
        }
        return { success: true };
    }
}

// Export singleton instance
export const api = new APIClient();
export default api;