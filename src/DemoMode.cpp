#include "DemoMode.h"

#include "Config.h"
#include "GPS.h"
#include "Storage.h"
#include "Behaviour.h"
#include "Alerts.h"
#include "Battery.h"
#include "BatterySimulator.h"
#include "Logger.h"
#include "Utilities.h"

#include <ArduinoJson.h>

//----------------------------------------------------
// Demo Scenarios (matching DemoMode.h enum) - FORWARD DECLARATION ONLY
// The actual enum is defined in DemoMode.h
//----------------------------------------------------

// Waypoint structure for GPS simulation
struct Waypoint {
    double lat;
    double lon;
    float speed;      // km/h
    float course;     // degrees
    unsigned long dwellMs; // Pause at this waypoint
};

// Pre-defined scenarios with waypoints
static const Waypoint _walkToSchoolWaypoints[] = {
    // Home -> School walk (approx 1.5km, 20 min)
    { -1.2921, 36.8219, 4.0, 45, 0 },       // Home
    { -1.2905, 36.8205, 4.0, 50, 0 },       // Street corner
    { -1.2880, 36.8185, 4.0, 60, 0 },       // Main road
    { -1.2855, 36.8160, 4.0, 60, 0 },       // Crossing
    { -1.2830, 36.8140, 4.0, 55, 300000 },  // School gate (5 min dwell)
    { -1.2820, 36.8135, 0.0, 0, 0 }         // Inside school
};

static const Waypoint _routeDeviationWaypoints[] = {
    // Normal route then deviation
    { -1.2921, 36.8219, 4.0, 45, 0 },       // Home
    { -1.2905, 36.8205, 4.0, 50, 0 },       // Normal path
    { -1.2880, 36.8185, 4.0, 60, 0 },       // Last known good
    { -1.2950, 36.8100, 5.0, 120, 0 },      // Deviation starts
    { -1.3000, 36.8050, 6.0, 150, 0 },      // Further off route
    { -1.3050, 36.8000, 3.0, 200, 180000 }  // Stop in unknown area (3 min)
};

static const Waypoint _panicButtonWaypoints[] = {
    { -1.2921, 36.8219, 0.0, 0, 0 }         // Static location
};

static const Waypoint _nightWanderingWaypoints[] = {
    { -1.2850, 36.8150, 2.0, 10, 0 },       // Slow movement
    { -1.2845, 36.8145, 1.5, 45, 0 },       // Wandering
    { -1.2855, 36.8155, 2.0, 350, 0 },      // Back and forth
    { -1.2850, 36.8150, 1.5, 180, 0 }
};

static const Waypoint _safeArrivalWaypoints[] = {
    { -1.2921, 36.8219, 4.0, 45, 0 },       // Home
    { -1.2910, 36.8210, 4.0, 50, 0 },       // Approaching home
    { -1.2921, 36.8219, 0.0, 0, 300000 }    // Home (5 min dwell)
};

//----------------------------------------------------
// State Variables
//----------------------------------------------------
static bool _demoActive = false;
static DemoScenario _currentScenario = DEMO_IDLE;
static uint8_t _waypointIndex = 0;
static unsigned long _waypointStartTime = 0;
static unsigned long _lastGpsUpdate = 0;
static unsigned long _scenarioStartTime = 0;
static bool _batteryDrainEnabled = true;
static float _customDrainRate = 1.0;

// Current simulated position
static double _currentLat = _walkToSchoolWaypoints[0].lat;
static double _currentLon = _walkToSchoolWaypoints[0].lon;
static float _currentSpeed = 0;
static float _currentCourse = 0;

//----------------------------------------------------
// Helper Functions
//----------------------------------------------------
static void interpolatePosition(double lat1, double lon1, double lat2, double lon2, float progress) {
    _currentLat = lat1 + (lat2 - lat1) * progress;
    _currentLon = lon1 + (lon2 - lon1) * progress;
}

static void injectGPSToSystem(double lat, double lon, float speed, float course) {
    // Inject into GPS module (if GPS has demo injection functions)
    gpsInjectPosition(lat, lon, speed, course);
}

static void updateScenario() {
    unsigned long now = millis();

    switch (_currentScenario) {
        case DEMO_WALK_TO_SCHOOL: {
            uint8_t numWaypoints = sizeof(_walkToSchoolWaypoints) / sizeof(Waypoint);
            if (_waypointIndex < numWaypoints - 1) {
                const Waypoint& wp1 = _walkToSchoolWaypoints[_waypointIndex];
                const Waypoint& wp2 = _walkToSchoolWaypoints[_waypointIndex + 1];

                float distance = haversine(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
                float speed = wp1.speed;
                float durationMs = (distance / speed) * 3600000.0; // ms

                float progress = min(1.0f, (float)(now - _waypointStartTime) / durationMs);
                interpolatePosition(wp1.lat, wp1.lon, wp2.lat, wp2.lon, progress);
                _currentSpeed = speed;
                _currentCourse = wp1.course + (wp2.course - wp1.course) * progress;

                // During walk, risk score gradually increases
                int riskScore = 20 + (int)(progress * 30); // 20 to 50
                behaviourInjectRiskScore(riskScore);

                if (progress >= 1.0f) {
                    if (wp2.dwellMs > 0) {
                        // Dwell at waypoint
                        if (now - _waypointStartTime >= wp2.dwellMs) {
                            _waypointIndex++;
                            _waypointStartTime = now;
                        }
                    } else {
                        _waypointIndex++;
                        _waypointStartTime = now;
                    }
                }
            } else {
                // Arrived at school - trigger safe arrival
                _currentScenario = DEMO_SAFE_ARRIVAL;
                _waypointIndex = 0;
                _waypointStartTime = now;
            }
            break;
        }

        case DEMO_ROUTE_DEVIATION: {
            uint8_t numWaypoints = sizeof(_routeDeviationWaypoints) / sizeof(Waypoint);
            if (_waypointIndex < numWaypoints - 1) {
                const Waypoint& wp1 = _routeDeviationWaypoints[_waypointIndex];
                const Waypoint& wp2 = _routeDeviationWaypoints[_waypointIndex + 1];

                float distance = haversine(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
                float speed = wp1.speed;
                float durationMs = (distance / speed) * 3600000.0;

                float progress = min(1.0f, (float)(now - _waypointStartTime) / durationMs);
                interpolatePosition(wp1.lat, wp1.lon, wp2.lat, wp2.lon, progress);
                _currentSpeed = speed;
                _currentCourse = wp1.course + (wp2.course - wp1.course) * progress;

                // Normal risk until deviation point
                if (_waypointIndex < 2) {
                    int riskScore = 20 + (int)(sin(progress * 3.14) * 10);
                    behaviourInjectRiskScore(riskScore);
                } else {
                    // Deviation detected - high risk
                    int riskScore = 50 + (int)(progress * 40); // 50 to 90
                    behaviourInjectRiskScore(riskScore);
                    if (_waypointIndex == 2) {
                        behaviourInjectAnomaly(ANOMALY_ROUTE_DEVIATION);
                    }
                }

                if (progress >= 1.0f) {
                    _waypointIndex++;
                    _waypointStartTime = now;
                }
            }
            break;
        }

        case DEMO_PANIC_BUTTON: {
            if (_waypointIndex == 0) {
                // Trigger panic alert immediately
                triggerAlert(ALERT_PANIC_BUTTON, "PANIC BUTTON PRESSED",
                           "Emergency button activated by child!", getGoogleMapsLink(), ALERT_PRIORITY_CRITICAL);
                _waypointIndex = 1;
            }
            // Static position
            _currentLat = _panicButtonWaypoints[0].lat;
            _currentLon = _panicButtonWaypoints[0].lon;
            _currentSpeed = 0;
            _currentCourse = 0;
            behaviourInjectRiskScore(100);
            break;
        }

        case DEMO_LOW_BATTERY: {
            // Drain battery quickly
            float drain = _customDrainRate * 10.0; // Fast drain
            float batteryPercent = getBatteryPercentage() - drain * (now - _lastGpsUpdate) / 60000.0;
            batteryInjectPercentage((uint8_t)max(0.0f, batteryPercent));

            // High risk due to low battery
            int riskScore = 60;
            behaviourInjectRiskScore(riskScore);

            if (batteryPercent <= 5) {
                triggerAlert(ALERT_BATTERY_CRITICAL, "CRITICAL: Battery at 5%",
                           "Device will shutdown soon!", getGoogleMapsLink(), ALERT_PRIORITY_CRITICAL);
            } else if (batteryPercent <= 20 && _waypointIndex == 0) {
                triggerAlert(ALERT_LOW_BATTERY_20, "WARNING: Battery at 20%",
                           "Please charge device soon.", getGoogleMapsLink(), ALERT_PRIORITY_HIGH);
                _waypointIndex = 1;
            }
            break;
        }

        case DEMO_NIGHT_WANDERING: {
            uint8_t numWaypoints = sizeof(_nightWanderingWaypoints) / sizeof(Waypoint);
            if (_waypointIndex < numWaypoints - 1) {
                const Waypoint& wp1 = _nightWanderingWaypoints[_waypointIndex];
                const Waypoint& wp2 = _nightWanderingWaypoints[_waypointIndex + 1];

                float distance = haversine(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
                float speed = wp1.speed;
                float durationMs = (distance / speed) * 3600000.0;

                float progress = min(1.0f, (float)(now - _waypointStartTime) / durationMs);
                interpolatePosition(wp1.lat, wp1.lon, wp2.lat, wp2.lon, progress);
                _currentSpeed = speed;
                _currentCourse = wp1.course + (wp2.course - wp1.course) * progress;

                // Night wandering - elevated risk
                int riskScore = 60 + (int)(sin(now / 10000.0) * 20);
                behaviourInjectRiskScore(riskScore);
                behaviourInjectAnomaly(ANOMALY_NIGHT_MOVEMENT);

                if (progress >= 1.0f) {
                    _waypointIndex++;
                    _waypointStartTime = now;
                }
            } else {
                // Loop back
                _waypointIndex = 0;
                _waypointStartTime = now;
            }
            break;
        }

        case DEMO_SAFE_ARRIVAL: {
            uint8_t numWaypoints = sizeof(_safeArrivalWaypoints) / sizeof(Waypoint);
            if (_waypointIndex < numWaypoints - 1) {
                const Waypoint& wp1 = _safeArrivalWaypoints[_waypointIndex];
                const Waypoint& wp2 = _safeArrivalWaypoints[_waypointIndex + 1];

                float distance = haversine(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
                float speed = wp1.speed;
                float durationMs = (distance / speed) * 3600000.0;

                float progress = min(1.0f, (float)(now - _waypointStartTime) / durationMs);
                interpolatePosition(wp1.lat, wp1.lon, wp2.lat, wp2.lon, progress);
                _currentSpeed = speed;
                _currentCourse = wp1.course + (wp2.course - wp1.course) * progress;

                int riskScore = 15;
                behaviourInjectRiskScore(riskScore);

                if (progress >= 1.0f) {
                    if (wp2.dwellMs > 0) {
                        if (now - _waypointStartTime >= wp2.dwellMs) {
                            _waypointIndex++;
                            _waypointStartTime = now;
                        }
                    } else {
                        _waypointIndex++;
                        _waypointStartTime = now;
                    }
                }
            } else {
                // Arrived home
                if (_waypointIndex == numWaypoints - 1) {
                    triggerAlert(ALERT_SAFE_ARRIVAL, "Safe Arrival: Home",
                               "Child has arrived at Home", getGoogleMapsLink(), ALERT_PRIORITY_HIGH);
                    _waypointIndex = numWaypoints; // Don't repeat
                }
                _currentLat = _safeArrivalWaypoints[numWaypoints - 1].lat;
                _currentLon = _safeArrivalWaypoints[numWaypoints - 1].lon;
                _currentSpeed = 0;
                _currentCourse = 0;
                behaviourInjectRiskScore(5);
            }
            break;
        }

        default:
            break;
    }

    _lastGpsUpdate = now;
}

//----------------------------------------------------
// Public API
//----------------------------------------------------

void demoModeBegin() {
    _demoActive = true;
    _currentScenario = DEMO_IDLE;
    _waypointIndex = 0;
    _currentLat = _walkToSchoolWaypoints[0].lat;
    _currentLon = _walkToSchoolWaypoints[0].lon;
    _currentSpeed = 0;
    _currentCourse = 0;
    _lastGpsUpdate = 0;
    _batteryDrainEnabled = true;
    _customDrainRate = 1.0;

    // Reset battery to full for demo
    batteryInjectPercentage(100);

    // Enable demo mode in behaviour
    #if CTN_BEHAVIOUR_ENABLED
    behaviourSetDemoMode(true);
    #endif

    LOG_INFO(LogModule::DEMO, "Demo mode initialized");
}

void demoModeLoop() {
    if (!_demoActive) return;

    updateScenario();

    // Inject data into system modules
    injectGPSToSystem(_currentLat, _currentLon, _currentSpeed, _currentCourse);

    // Update battery simulation if enabled
    if (_batteryDrainEnabled) {
        // Battery drain handled by BatterySimulator.update()
        batterySimulatorUpdate();
        // Inject battery percentage
        batteryInjectPercentage(getBatteryPercentage());
    }

    // Update behaviour risk score
    behaviourInjectRiskScore(behaviourGetRiskScore()); // Already updated in updateScenario
}

void demoModeSetScenario(DemoScenario scenario) {
    _currentScenario = scenario;
    _waypointIndex = 0;
    _waypointStartTime = millis();
    _scenarioStartTime = millis();
    _demoActive = true;

    // Reset battery for new scenario
    batteryInjectPercentage(100);
    batterySimulatorSetPlugged(false);

    switch (scenario) {
        case DEMO_WALK_TO_SCHOOL:
            _customDrainRate = 1.0;
            behaviourInjectRiskScore(20);
            LOG_INFO(LogModule::DEMO, "Scenario: Walk to School");
            break;
        case DEMO_ROUTE_DEVIATION:
            _customDrainRate = 1.5;
            behaviourInjectRiskScore(30);
            LOG_INFO(LogModule::DEMO, "Scenario: Route Deviation");
            break;
        case DEMO_PANIC_BUTTON:
            _customDrainRate = 1.0;
            behaviourInjectRiskScore(100);
            LOG_INFO(LogModule::DEMO, "Scenario: Panic Button");
            break;
        case DEMO_LOW_BATTERY:
            _customDrainRate = 10.0;
            behaviourInjectRiskScore(60);
            batteryInjectPercentage(30);
            LOG_INFO(LogModule::DEMO, "Scenario: Low Battery");
            break;
        case DEMO_NIGHT_WANDERING:
            _customDrainRate = 1.0;
            behaviourInjectRiskScore(50);
            LOG_INFO(LogModule::DEMO, "Scenario: Night Wandering");
            break;
        case DEMO_SAFE_ARRIVAL:
            _customDrainRate = 1.0;
            behaviourInjectRiskScore(10);
            LOG_INFO(LogModule::DEMO, "Scenario: Safe Arrival");
            break;
        default:
            _customDrainRate = 1.0;
            behaviourInjectRiskScore(20);
            break;
    }
}

void demoModeSetScenarioByName(const String& name) {
    DemoScenario scenario = DEMO_IDLE;

    if (name.equalsIgnoreCase("walk") || name.equalsIgnoreCase("school")) {
        scenario = DEMO_WALK_TO_SCHOOL;
    } else if (name.equalsIgnoreCase("deviation")) {
        scenario = DEMO_ROUTE_DEVIATION;
    } else if (name.equalsIgnoreCase("panic")) {
        scenario = DEMO_PANIC_BUTTON;
    } else if (name.equalsIgnoreCase("battery") || name.equalsIgnoreCase("lowbatt")) {
        scenario = DEMO_LOW_BATTERY;
    } else if (name.equalsIgnoreCase("night") || name.equalsIgnoreCase("wandering")) {
        scenario = DEMO_NIGHT_WANDERING;
    } else if (name.equalsIgnoreCase("arrival") || name.equalsIgnoreCase("safe")) {
        scenario = DEMO_SAFE_ARRIVAL;
    } else if (name.equalsIgnoreCase("idle") || name.equalsIgnoreCase("stop")) {
        demoModeStop();
        return;
    }

    demoModeSetScenario(scenario);
}

void demoModeStop() {
    _demoActive = false;
    _currentScenario = DEMO_IDLE;
    _waypointIndex = 0;

    LOG_INFO(LogModule::DEMO, "Demo mode stopped");
}

bool demoModeIsActive() {
    return _demoActive;
}

String demoModeGetStatusJson() {
    JsonDocument doc;
    doc["active"] = _demoActive;
    doc["scenario"] = (int)_currentScenario;
    doc["scenarioName"] = demoScenarioToString(_currentScenario);
    doc["waypoint"] = _waypointIndex;
    doc["uptime"] = _demoActive ? (millis() - _scenarioStartTime) : 0;
    doc["batteryDrainEnabled"] = _batteryDrainEnabled;
    doc["customDrainRate"] = _customDrainRate;
    doc["gps"]["lat"] = _currentLat;
    doc["gps"]["lon"] = _currentLon;
    doc["gps"]["speed"] = _currentSpeed;

    String json;
    serializeJson(doc, json);
    return json;
}

void demoModeInjectGPS(double lat, double lon, float speed, float course) {
    _currentLat = lat;
    _currentLon = lon;
    _currentSpeed = speed;
    _currentCourse = course;
    injectGPSToSystem(lat, lon, speed, course);
}

void demoModeInjectBattery(uint8_t percent) {
    batteryInjectPercentage(percent);
}

void demoModeInjectBehaviour(int riskScore, uint8_t anomalyType) {
    behaviourInjectRiskScore(riskScore);
    if (anomalyType > 0) {
        behaviourInjectAnomaly(static_cast<AnomalyType>(anomalyType));
    }
}

void demoModeTriggerAlert(uint8_t alertType) {
    String location = getGoogleMapsLink();

    switch (alertType) {
        case ALERT_ROUTE_DEVIATION:
            sendRouteDeviationAlert("School Route", "Unknown Path", location);
            break;
        case ALERT_PANIC_BUTTON:
            sendPanicButtonAlert(location);
            break;
        case ALERT_LOW_BATTERY_20:
            sendLowBatteryAlert(20, location);
            break;
        case ALERT_SAFE_ARRIVAL:
            sendSafeArrivalAlert("Home", location);
            break;
        case ALERT_BEHAVIOUR_NIGHT_MOVEMENT:
            sendNightMovementAlert(1.5, location);
            break;
    }
}

void demoModeSetPlugged(bool plugged) {
    batterySimulatorSetPlugged(plugged);
}

void demoModeSetDrainRate(float percentPerMin) {
    _customDrainRate = percentPerMin;
    batterySimulatorSetDrainRate(percentPerMin);
}

void demoModeSetBatteryDrainEnabled(bool enabled) {
    _batteryDrainEnabled = enabled;
}

void demoModeSetCustomDrainRate(float rate) {
    _customDrainRate = rate;
    batterySimulatorSetDrainRate(rate);
}

const char* demoScenarioToString(DemoScenario scenario) {
    switch (scenario) {
        case DEMO_IDLE: return "Idle";
        case DEMO_WALK_TO_SCHOOL: return "Walk to School";
        case DEMO_ROUTE_DEVIATION: return "Route Deviation";
        case DEMO_PANIC_BUTTON: return "Panic Button";
        case DEMO_LOW_BATTERY: return "Low Battery";
        case DEMO_NIGHT_WANDERING: return "Night Wandering";
        case DEMO_SAFE_ARRIVAL: return "Safe Arrival";
        default: return "Unknown";
    }
}

void demoModeHandleWSCommand(JsonDocument& doc) {
    if (!doc["cmd"].is<const char*>()) return;

    String cmd = doc["cmd"].as<String>();

    if (cmd == "scenario") {
        String scenario = doc["scenario"].as<String>();
        demoModeSetScenarioByName(scenario);
    } else if (cmd == "stop") {
        demoModeStop();
    } else if (cmd == "battery") {
        float drain = doc["drainRate"] | 1.0;
        _customDrainRate = drain;
        batterySimulatorSetDrainRate(drain);
    } else if (cmd == "plug") {
        bool plug = doc["state"] | true;
        batterySimulatorSetPlugged(plug);
    } else if (cmd == "gps") {
        double lat = doc["lat"] | 0.0;
        double lon = doc["lon"] | 0.0;
        float speed = doc["speed"] | 0.0;
        float course = doc["course"] | 0.0;
        demoModeInjectGPS(lat, lon, speed, course);
    }
}