/**
 * demo.js - Frontend Demo Mode State Machine
 * Simulates GPS walks, risk oscillations, battery drain, and scripted alerts
 * Runs entirely in browser when demo mode is enabled
 */

import { State, showToast } from './state.js';

/**
 * Demo Scenarios
 * Each scenario defines a scripted sequence of events
 */
const DEMO_SCENARIOS = {
    idle: {
        name: 'Idle',
        description: 'Stationary at home, low risk',
        duration: 0, // Infinite
        events: []
    },

    walk_to_school: {
        name: 'School Run',
        description: 'Walk from Home → School with normal route',
        duration: 300000, // 5 minutes
        waypoints: [
            // Home location (Nairobi area example)
            { lat: -1.2921, lng: 36.8219, dwell: 30000, label: 'Home' },
            // Waypoint 1 - leaving home
            { lat: -1.2915, lng: 36.8225, dwell: 5000 },
            // Waypoint 2 - main road
            { lat: -1.2900, lng: 36.8240, dwell: 10000 },
            // Waypoint 3 - crossing
            { lat: -1.2885, lng: 36.8255, dwell: 8000 },
            // Waypoint 4 - approaching school
            { lat: -1.2870, lng: 36.8270, dwell: 10000 },
            // School
            { lat: -1.2865, lng: 36.8275, dwell: 60000, label: 'School' }
        ],
        riskProfile: [
            { time: 0, risk: 15 },      // At home - safe
            { time: 30000, risk: 35 },  // Leaving home - watch
            { time: 60000, risk: 45 },  // On main road - warning
            { time: 120000, risk: 30 }, // Quiet street - safe
            { time: 180000, risk: 20 }, // Arriving school - safe
            { time: 240000, risk: 12 }  // At school - safe
        ],
        anomalies: [
            { type: 'safe_departure', time: 30000, zone: 'Home' },
            { type: 'safe_arrival', time: 240000, zone: 'School' }
        ],
        batteryDrain: 0.8 // % per minute
    },

    route_deviation: {
        name: 'Route Deviation',
        description: 'Child deviates from learned route',
        duration: 180000, // 3 minutes
        waypoints: [
            { lat: -1.2870, lng: 36.8275, dwell: 10000, label: 'School (start)' },
            { lat: -1.2880, lng: 36.8280, dwell: 10000 },
            { lat: -1.2895, lng: 36.8295, dwell: 15000 }, // Deviation point
            { lat: -1.2910, lng: 36.8310, dwell: 20000 }, // Further off route
            { lat: -1.2920, lng: 36.8320, dwell: 30000 }  // Unknown area
        ],
        riskProfile: [
            { time: 0, risk: 15 },
            { time: 20000, risk: 35 },
            { time: 40000, risk: 55 },  // Deviation detected
            { time: 60000, risk: 70 },  // Far off route
            { time: 90000, risk: 85 }   // Emergency
        ],
        anomalies: [
            { type: 'route_deviation', time: 40000, details: 'Deviated 200m from learned route' },
            { type: 'leaving_safe_zone', time: 60000, details: 'Left school safe zone unexpectedly' }
        ],
        batteryDrain: 1.2
    },

    panic_button: {
        name: 'Panic Button',
        description: 'Emergency panic button pressed',
        duration: 60000, // 1 minute
        waypoints: [
            { lat: -1.2870, lng: 36.8275, dwell: 10000, label: 'School' }
        ],
        riskProfile: [
            { time: 0, risk: 12 },
            { time: 5000, risk: 95 }  // Panic pressed
        ],
        anomalies: [
            { type: 'panic', time: 5000, details: 'Panic button activated!' }
        ],
        batteryDrain: 0.5
    },

    low_battery: {
        name: 'Low Battery',
        description: 'Battery drains to critical level',
        duration: 300000, // 5 minutes
        waypoints: [
            { lat: -1.2921, lng: 36.8219, dwell: 300000, label: 'Home' }
        ],
        riskProfile: [
            { time: 0, risk: 15 },
            { time: 120000, risk: 20 }
        ],
        anomalies: [
            { type: 'low_battery', time: 60000, details: 'Battery below 20%' },
            { type: 'low_battery', time: 180000, details: 'Battery below 10% - Critical!' },
            { type: 'low_battery', time: 270000, details: 'Battery below 5% - Imminent shutdown!' }
        ],
        batteryDrain: 2.5, // Fast drain for demo
        batteryStart: 35
    },

    night_wandering: {
        name: 'Night Wandering',
        description: 'Movement detected during sleep hours',
        duration: 180000, // 3 minutes
        waypoints: [
            { lat: -1.2921, lng: 36.8219, dwell: 30000, label: 'Home (Bedroom)' },
            { lat: -1.2918, lng: 36.8222, dwell: 20000 }, // Kitchen
            { lat: -1.2915, lng: 36.8225, dwell: 30000 }, // Living room
            { lat: -1.2910, lng: 36.8230, dwell: 20000 }, // Front door
            { lat: -1.2905, lng: 36.8235, dwell: 30000 }, // Outside
            { lat: -1.2910, lng: 36.8228, dwell: 30000 }  // Returning
        ],
        riskProfile: [
            { time: 0, risk: 10 },    // Sleeping
            { time: 30000, risk: 40 }, // Up at night
            { time: 60000, risk: 60 }, // Wandering
            { time: 90000, risk: 75 }, // At door
            { time: 120000, risk: 80 }, // Outside!
            { time: 150000, risk: 50 }  // Returning
        ],
        anomalies: [
            { type: 'night_movement', time: 30000, details: 'Movement at 02:30 AM' },
            { type: 'leaving_safe_zone', time: 90000, details: 'Left home zone at night' },
            { type: 'safe_arrival', time: 150000, details: 'Returned to bed' }
        ],
        batteryDrain: 0.5
    },

    safe_arrival: {
        name: 'Safe Arrival Test',
        description: 'Quick arrival/departure cycle for testing alerts',
        duration: 60000,
        waypoints: [
            { lat: -1.2921, lng: 36.8219, dwell: 10000, label: 'Home' },
            { lat: -1.2915, lng: 36.8225, dwell: 5000 },
            { lat: -1.2870, lng: 36.8275, dwell: 20000, label: 'School' },
            { lat: -1.2915, lng: 36.8225, dwell: 5000 },
            { lat: -1.2921, lng: 36.8219, dwell: 10000, label: 'Home' }
        ],
        riskProfile: [
            { time: 0, risk: 12 },
            { time: 10000, risk: 30 },
            { time: 25000, risk: 15 },
            { time: 35000, risk: 30 },
            { time: 50000, risk: 12 }
        ],
        anomalies: [
            { type: 'safe_departure', time: 10000, zone: 'Home' },
            { type: 'safe_arrival', time: 25000, zone: 'School' },
            { type: 'safe_departure', time: 35000, zone: 'School' },
            { type: 'safe_arrival', time: 50000, zone: 'Home' }
        ],
        batteryDrain: 0.5
    }
};

// Default GPS position (Nairobi)
const DEFAULT_POSITION = { lat: -1.2921, lng: 36.8219 };

// Demo state
let demoState = {
    active: false,
    scenario: 'idle',
    scenarioData: null,
    startTime: 0,
    currentWaypointIndex: 0,
    currentPosition: { ...DEFAULT_POSITION },
    currentSpeed: 0,
    currentHeading: 0,
    batteryLevel: 85,
    batteryCharging: false,
    riskScore: 15,
    anomalies: [],
    animationFrame: null,
    lastUpdate: 0,
    scenarioStartTime: 0
};

/**
 * Initialize demo mode
 */
export function initDemoMode() {
    // Check localStorage for persisted demo state
    const saved = localStorage.getItem('ctn_demo_mode');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.enabled) {
                State.demoMode.value = true;
                State.demoScenario.value = parsed.scenario || 'idle';
                State.demoScenarioName.value = DEMO_SCENARIOS[parsed.scenario]?.name || 'Idle';
            }
        } catch (e) {
            console.warn('Failed to parse demo state:', e);
        }
    }

    // Listen for demo mode toggle
    State.demoMode.subscribe((enabled) => {
        if (enabled) {
            startDemo();
        } else {
            stopDemo();
        }
    });

    State.demoScenario.subscribe((scenario) => {
        if (demoState.active && scenario !== demoState.scenario) {
            loadScenario(scenario);
        }
    });
}

/**
 * Start demo mode
 */
function startDemo() {
    if (demoState.active) return;

    demoState.active = true;
    demoState.scenario = State.demoScenario.value || 'idle';
    loadScenario(demoState.scenario);
    runDemoLoop();

    showToast(`Demo mode: ${DEMO_SCENARIOS[demoState.scenario]?.name || 'Idle'}`, 'info');
}

/**
 * Stop demo mode
 */
function stopDemo() {
    if (!demoState.active) return;

    demoState.active = false;
    if (demoState.animationFrame) {
        cancelAnimationFrame(demoState.animationFrame);
        demoState.animationFrame = null;
    }

    // Reset to real data
    State.demoMode.value = false;

    showToast('Demo mode disabled', 'info');
}

/**
 * Load a scenario
 */
function loadScenario(scenarioId) {
    const scenario = DEMO_SCENARIOS[scenarioId];
    if (!scenario) return;

    demoState.scenario = scenarioId;
    demoState.scenarioData = scenario;
    demoState.startTime = Date.now();
    demoState.scenarioStartTime = Date.now();
    demoState.currentWaypointIndex = 0;
    demoState.currentPosition = { ...(scenario.waypoints[0] || DEFAULT_POSITION) };
    demoState.batteryLevel = scenario.batteryStart || 85;
    demoState.batteryCharging = false;
    demoState.riskScore = scenario.riskProfile[0]?.risk || 15;
    demoState.anomalies = [...(scenario.anomalies || [])];
    demoState.lastUpdate = Date.now();

    State.demoScenario.value = scenarioId;
    State.demoScenarioName.value = scenario.name;

    // Update state
    updateDemoState();

    // Trigger first anomalies
    checkAnomalies();
}

/**
 * Main demo loop
 */
function runDemoLoop() {
    if (!demoState.active) return;

    const now = Date.now();
    const deltaTime = now - demoState.lastUpdate;
    demoState.lastUpdate = now;
    const elapsed = now - demoState.scenarioStartTime;

    // Update simulation
    updatePosition(deltaTime, elapsed);
    updateBattery(deltaTime);
    updateRiskScore(elapsed);
    checkAnomalies(elapsed);
    checkScenarioEnd(elapsed);

    // Update state
    updateDemoState();

    // Continue loop
    demoState.animationFrame = requestAnimationFrame(runDemoLoop);
}

/**
 * Update GPS position based on waypoints
 */
function updatePosition(deltaTime, elapsed) {
    const scenario = demoState.scenarioData;
    if (!scenario || !scenario.waypoints.length) return;

    const waypoints = scenario.waypoints;
    let currentWp = waypoints[demoState.currentWaypointIndex];
    let nextWp = waypoints[demoState.currentWaypointIndex + 1];

    if (!nextWp) {
        // At final waypoint, stay there
        demoState.currentSpeed = 0;
        return;
    }

    // Check if we should move to next waypoint
    const timeAtCurrentWp = elapsed - getTimeAtWaypoint(demoState.currentWaypointIndex);
    const dwellTime = currentWp.dwell || 5000;

    if (timeAtCurrentWp >= dwellTime) {
        // Move to next waypoint
        demoState.currentWaypointIndex++;
        currentWp = nextWp;
        nextWp = waypoints[demoState.currentWaypointIndex + 1];
        if (!nextWp) return;
    }

    // Interpolate between waypoints
    const travelStartTime = getTimeAtWaypoint(demoState.currentWaypointIndex) + dwellTime;
    const travelDuration = getTimeAtWaypoint(demoState.currentWaypointIndex + 1) - travelStartTime;
    const travelElapsed = elapsed - travelStartTime;
    const progress = Math.max(0, Math.min(1, travelElapsed / Math.max(1, travelDuration)));

    // Linear interpolation
    demoState.currentPosition = {
        lat: currentWp.lat + (nextWp.lat - currentWp.lat) * progress,
        lng: currentWp.lng + (nextWp.lng - currentWp.lng) * progress
    };

    // Calculate speed (meters per second)
    const distance = calculateDistance(currentWp, nextWp);
    demoState.currentSpeed = distance / Math.max(1, travelDuration / 1000); // m/s

    // Calculate heading
    demoState.currentHeading = calculateHeading(currentWp, nextWp);

    // Add GPS noise for realism
    const noise = (scenario.gpsNoise || 5) / 111000; // meters to degrees approx
    demoState.currentPosition.lat += (Math.random() - 0.5) * noise;
    demoState.currentPosition.lng += (Math.random() - 0.5) * noise;
}

/**
 * Get cumulative time at waypoint index
 */
function getTimeAtWaypoint(index) {
    const scenario = demoState.scenarioData;
    if (!scenario || index <= 0) return 0;

    let time = 0;
    for (let i = 0; i < index && i < scenario.waypoints.length - 1; i++) {
        time += (scenario.waypoints[i].dwell || 5000);
        // Add travel time to next waypoint
        if (i + 1 < scenario.waypoints.length) {
            const dist = calculateDistance(scenario.waypoints[i], scenario.waypoints[i + 1]);
            const speed = 1.4; // ~5 km/h walking
            time += (dist / speed) * 1000;
        }
    }
    return time;
}

/**
 * Calculate distance between two points in meters
 */
function calculateDistance(p1, p2) {
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Calculate heading from p1 to p2 in degrees
 */
function calculateHeading(p1, p2) {
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const heading = Math.atan2(y, x) * 180 / Math.PI;
    return (heading + 360) % 360;
}

/**
 * Update battery level
 */
function updateBattery(deltaTime) {
    const scenario = demoState.scenarioData;
    const drainRate = (scenario?.batteryDrain || 1) / 60000; // % per ms

    if (demoState.batteryCharging) {
        demoState.batteryLevel = Math.min(100, demoState.batteryLevel + 0.05 * deltaTime / 1000);
    } else {
        demoState.batteryLevel = Math.max(0, demoState.batteryLevel - drainRate * deltaTime);
    }
}

/**
 * Update risk score based on scenario profile
 */
function updateRiskScore(elapsed) {
    const scenario = demoState.scenarioData;
    if (!scenario || !scenario.riskProfile.length) return;

    const profile = scenario.riskProfile;
    let targetRisk = profile[0].risk;

    for (let i = 0; i < profile.length - 1; i++) {
        if (elapsed >= profile[i].time && elapsed < profile[i + 1].time) {
            // Interpolate between risk points
            const t = (elapsed - profile[i].time) / (profile[i + 1].time - profile[i].time);
            targetRisk = profile[i].risk + (profile[i + 1].risk - profile[i].risk) * t;
            break;
        } else if (elapsed >= profile[profile.length - 1].time) {
            targetRisk = profile[profile.length - 1].risk;
        }
    }

    // Smooth transition
    demoState.riskScore += (targetRisk - demoState.riskScore) * 0.02;
}

/**
 * Check and trigger anomalies
 */
function checkAnomalies(elapsed) {
    const scenario = demoState.scenarioData;
    if (!scenario) return;

    for (const anomaly of scenario.anomalies) {
        if (!anomaly.triggered && elapsed >= anomaly.time) {
            triggerAnomaly(anomaly);
            anomaly.triggered = true;
        }
    }
}

/**
 * Trigger an anomaly event
 */
function triggerAnomaly(anomaly) {
    const alertData = {
        type: 'alert',
        alertType: anomaly.type,
        message: `⚠️ ${getAnomalyLabel(anomaly.type)}: ${anomaly.details || ''}`,
        timestamp: Date.now()
    };

    // Dispatch to state (will trigger toast and update alerts)
    State.updateFromAlert(alertData);

    // Play sound if available
    playNotificationSound(anomaly.type);
}

/**
 * Get human-readable anomaly label
 */
function getAnomalyLabel(type) {
    const labels = {
        safe_arrival: 'Safe Arrival',
        safe_departure: 'Safe Departure',
        route_deviation: 'Route Deviation',
        long_stop: 'Long Stop',
        running: 'Running Detected',
        wandering: 'Wandering',
        leaving_school: 'Left School',
        leaving_safe_zone: 'Left Safe Zone',
        night_movement: 'Night Movement',
        repeated_movement: 'Repeated Movement',
        unexpected_movement: 'Unexpected Movement',
        panic: 'PANIC BUTTON',
        low_battery: 'Low Battery'
    };
    return labels[type] || type;
}

/**
 * Play notification sound
 */
function playNotificationSound(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'panic') {
            // Urgent pattern
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
        } else if (type === 'low_battery') {
            // Descending
            oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(300, audioCtx.currentTime + 0.3);
        } else {
            // Standard notification
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
        }

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        // Audio not supported or blocked
    }
}

/**
 * Check if scenario ended
 */
function checkScenarioEnd(elapsed) {
    const scenario = demoState.scenarioData;
    if (scenario && scenario.duration > 0 && elapsed >= scenario.duration) {
        // Scenario complete - loop or stop
        if (scenario.loop) {
            demoState.scenarioStartTime = Date.now();
            // Reset anomalies
            scenario.anomalies.forEach(a => a.triggered = false);
        } else {
            // Go back to idle
            loadScenario('idle');
        }
    }
}

/**
 * Update global state with demo data
 */
function updateDemoState() {
    // Update GPS
    State.gps.value = {
        ...State.gps.value,
        latitude: demoState.currentPosition.lat,
        longitude: demoState.currentPosition.lng,
        speed: demoState.currentSpeed * 3.6, // m/s to km/h
        heading: demoState.currentHeading,
        hasFix: true,
        satellites: 8 + Math.floor(Math.random() * 4),
        accuracy: 5 + Math.random() * 5,
        altitude: 1650
    };

    // Update Battery
    const pct = Math.round(demoState.batteryLevel);
    State.battery.value = {
        ...State.battery.value,
        percentage: pct,
        voltage: percentageToVoltage(pct),
        charging: demoState.batteryCharging,
        state: demoState.batteryCharging ? 'Charging' : (pct > 80 ? 'Full' : pct > 50 ? 'Good' : pct > 20 ? 'Normal' : pct > 10 ? 'Low' : 'Critical'),
        runtimeHours: demoState.batteryCharging ? 0 : Math.max(0, pct / (demoState.scenarioData?.batteryDrain || 1)),
        health: 'Good'
    };

    // Update Behaviour
    State.behaviour.value = {
        ...State.behaviour.value,
        riskScore: Math.round(demoState.riskScore),
        stateCode: getStateCode(demoState.riskScore),
        state: getStateLabel(demoState.riskScore),
        anomalyCount: demoState.scenarioData?.anomalies?.filter(a => a.triggered).length || 0
    };

    // Update demo scenario name
    State.demoScenarioName.value = DEMO_SCENARIOS[demoState.scenario]?.name || 'Idle';
}

/**
 * Convert percentage to voltage (LiPo curve)
 */
function percentageToVoltage(pct) {
    // Approximate LiPo voltage curve
    if (pct >= 100) return 4.2;
    if (pct >= 90) return 4.15;
    if (pct >= 80) return 4.1;
    if (pct >= 70) return 4.0;
    if (pct >= 60) return 3.9;
    if (pct >= 50) return 3.8;
    if (pct >= 40) return 3.7;
    if (pct >= 30) return 3.6;
    if (pct >= 20) return 3.5;
    if (pct >= 10) return 3.35;
    if (pct >= 5) return 3.2;
    return 3.0;
}

/**
 * Get state code from risk score
 */
function getStateCode(risk) {
    if (risk >= 70) return 3; // EMERGENCY
    if (risk >= 50) return 2; // WARNING
    if (risk >= 30) return 1; // WATCH
    return 0; // SAFE
}

/**
 * Get state label from risk score
 */
function getStateLabel(risk) {
    if (risk >= 70) return 'EMERGENCY';
    if (risk >= 50) return 'WARNING';
    if (risk >= 30) return 'WATCH';
    return 'SAFE';
}

/**
 * Public API: Set scenario
 */
export function setDemoScenario(scenarioId) {
    if (!DEMO_SCENARIOS[scenarioId]) return false;

    State.demoScenario.value = scenarioId;
    return true;
}

/**
 * Public API: Trigger panic button
 */
export function triggerDemoPanic() {
    if (!demoState.active) return;

    triggerAnomaly({ type: 'panic', details: 'Panic button pressed!' });
    demoState.riskScore = 95;
    updateDemoState();
}

/**
 * Public API: Toggle charging
 */
export function toggleDemoCharging(charging) {
    demoState.batteryCharging = charging;
}

/**
 * Public API: Set battery drain rate
 */
export function setDemoDrainRate(rate) {
    if (demoState.scenarioData) {
        demoState.scenarioData.batteryDrain = rate;
    }
}

/**
 * Persist demo state to localStorage
 */
export function persistDemoState() {
    localStorage.setItem('ctn_demo_mode', JSON.stringify({
        enabled: demoState.active,
        scenario: demoState.scenario
    }));
}

/**
 * Clear demo state
 */
export function clearDemoState() {
    localStorage.removeItem('ctn_demo_mode');
}

// Initialize on load
if (typeof window !== 'undefined') {
    window.ctnDemo = {
        setScenario: setDemoScenario,
        triggerPanic: triggerDemoPanic,
        toggleCharging: toggleDemoCharging,
        setDrainRate: setDemoDrainRate,
        getState: () => ({ ...demoState })
    };
}