#include "Behaviour.h"

#include "Config.h"
#include "GPS.h"
#include "Telegram.h"
#include "Utilities.h"
#include "Storage.h"
#include "Alerts.h"
#include "Logger.h"
#include "Battery.h"

#include <LittleFS.h>
#include <ArduinoJson.h>

//--------------------------------------------------
// Configuration
//--------------------------------------------------
#define BEHAVIOUR_CONFIG_FILE "/config/behaviour.json"
#define ANOMALY_HISTORY_FILE "/logs/anomalies.json"
#define LEARNED_ROUTES_FILE "/data/routes.json"

#define MAX_ROUTE_POINTS 50
#define MAX_ANOMALY_HISTORY 30
#define MAX_ZONE_POINTS 10

// Movement thresholds from Config.h (fallback defaults)
#ifndef MOVEMENT_THRESHOLD
#define MOVEMENT_THRESHOLD 5.0
#endif
#ifndef MAX_RUNNING_SPEED
#define MAX_RUNNING_SPEED 8.0
#endif
#ifndef INACTIVITY_TIME
#define INACTIVITY_TIME 60000
#endif

//--------------------------------------------------
// Static Variables
//--------------------------------------------------
static BehaviourState currentState = SAFE;
static BehaviourState previousState = SAFE;
static int riskScore = 100;

static double previousLatitude = 0;
static double previousLongitude = 0;

static unsigned long lastMovementTime = 0;
static unsigned long lastUpdateTime = 0;

static bool firstFix = true;
static bool behaviourInitialized = false;

// Learned routes and locations
static RoutePoint homeLocation;
static RoutePoint schoolLocation;
static RoutePoint learnedRoutes[MAX_ROUTE_POINTS];
static uint8_t routePointCount = 0;
static bool homeLearned = false;
static bool schoolLearned = false;

// Anomaly tracking
static AnomalyEvent anomalyHistory[MAX_ANOMALY_HISTORY];
static uint8_t anomalyCount = 0;
static uint8_t anomalyHead = 0;

// Movement tracking for anomalies
static unsigned long stopStartTime = 0;
static bool currentlyStopped = false;
static uint8_t repeatedMovementCount = 0;
static double lastMovementLat = 0;
static double lastMovementLon = 0;
static unsigned long lastMovementTimestamp = 0;

// Statistics
static BehaviourStats stats;
static BehaviourConfig config;

// Configuration loaded flag
static bool configLoaded = false;

//--------------------------------------------------
// Forward Declarations (Internal)
//--------------------------------------------------
static void loadConfiguration();
static void saveConfiguration();
static double haversineDist(double lat1, double lon1, double lat2, double lon2);
static unsigned long getMinutesSinceMidnight();
static bool isNightTime();
static bool isInSchoolHours();
static bool isNearLocation(double lat, double lon, const RoutePoint& location, float threshold);
static void updateRiskScore(double speed, bool insideZone, bool homeZone, bool schoolZone);
static void updateStateMachine();
static void handleStateChange(BehaviourState from, BehaviourState to);
static void checkRouteDeviation(double lat, double lon);
static void checkLongStop();
static void checkRunning(double speed);
static void checkWandering(double speed);
static void checkSchoolLeaving(double lat, double lon);
static void checkSafeZoneExit(double lat, double lon);
static void checkNightMovement(double speed);
static void checkRepeatedMovement(double lat, double lon);
static void learnLocations(double lat, double lon, float speed);
static void addAnomalyEvent(const AnomalyEvent& event);
static void saveAnomalyEvent(const AnomalyEvent& event);
static void loadAnomalyHistory();
static void saveLearnedRoutes();
static void loadLearnedRoutes();
static void triggerBehaviourAlert(AlertType type, const String& title, const String& message, const String& location, AlertPriority priority);

//--------------------------------------------------
// Internal Helper Functions
//--------------------------------------------------

static void loadConfiguration() {
    if (configLoaded) return;
    loadBehaviourConfig(config);
    configLoaded = true;
    LOG_INFO(LogModule::BEHAV, "Behaviour config loaded (minVisits=%d, rate=%.2f)",
             config.minVisitsToLearn, config.learningRate);
}

static void saveConfiguration() {
    saveBehaviourConfig(config);
}

static double haversineDist(double lat1, double lon1, double lat2, double lon2) {
    return haversine(lat1, lon1, lat2, lon2);
}

static unsigned long getMinutesSinceMidnight() {
    unsigned long ms = millis();
    unsigned long totalMinutes = ms / 60000;  // Approximate, but works for relative timing
    return totalMinutes % (24 * 60);
}

static bool isNightTime() {
    unsigned long minutes = getMinutesSinceMidnight();
    unsigned long hour = minutes / 60;
    return (hour >= config.nightStartHour) || (hour < config.nightEndHour);
}

static bool isInSchoolHours() {
    unsigned long minutes = getMinutesSinceMidnight();
    unsigned long hour = minutes / 60;
    // School hours: 7:00-18:00
    return (hour >= 7 && hour < 18);
}

static bool isNearLocation(double lat, double lon, const RoutePoint& location, float threshold) {
    if (location.latitude == 0 && location.longitude == 0) return false;
    double dist = haversineDist(lat, lon, location.latitude, location.longitude);
    return dist <= threshold;
}

static void updateRiskScore(double speed, bool insideZone, bool homeZone, bool schoolZone) {
    riskScore = 100;

    // Speed anomaly
    if (speed > config.runningSpeedThreshold) {
        riskScore -= 25;
        LOG_WARN(LogModule::BEHAV, "Running detected: %.1f km/h", speed);
    } else if (speed > config.wanderingSpeedThreshold && speed < 5.0) {
        riskScore -= 10;  // Wandering pace
    }

    // Inactivity
    if (millis() - lastMovementTime > config.maxStopDuration) {
        riskScore -= 30;
        if (!currentlyStopped) {
            LOG_WARN(LogModule::BEHAV, "Long stop detected: %lu ms", millis() - lastMovementTime);
        }
    }

    // Zone-based scoring
    if (homeZone) {
        riskScore += 20;  // Home is safe
    } else if (schoolZone && isInSchoolHours()) {
        riskScore += 15;  // School during hours is safe
    } else if (!insideZone) {
        riskScore -= 25;  // Outside known safe zones
    }

    // Night time penalty
    if (isNightTime() && speed > 1.0) {
        riskScore -= 20;
        LOG_WARN(LogModule::BEHAV, "Night movement detected");
    }

    // Clamp
    riskScore = constrain(riskScore, 0, 100);
}

static void updateStateMachine() {
    previousState = currentState;

    if (riskScore > config.watchThreshold) {
        currentState = SAFE;
    } else if (riskScore > config.warningThreshold) {
        currentState = WATCH;
    } else if (riskScore > config.emergencyThreshold) {
        currentState = WARNING;
    } else {
        currentState = EMERGENCY;
    }

    if (currentState != previousState) {
        LOG_INFO(LogModule::BEHAV, "State: %s -> %s (risk=%d)",
                 behaviourStateToString(previousState).c_str(),
                 behaviourStateToString(currentState).c_str(), riskScore);

        // Trigger alerts on state changes
        handleStateChange(previousState, currentState);
    }
}

static void handleStateChange(BehaviourState from, BehaviourState to) {
    if (to == WARNING) {
        triggerBehaviourAlert(ALERT_BEHAVIOUR_WARNING, "Behaviour Warning",
                              "Unusual behaviour pattern detected",
                              "Lat: " + String(getLatitude(), 6) + ", Lon: " + String(getLongitude(), 6),
                              ALERT_PRIORITY_HIGH);
    } else if (to == EMERGENCY) {
        triggerBehaviourAlert(ALERT_BEHAVIOUR_EMERGENCY, "Behaviour Emergency",
                              "Critical behaviour anomaly detected",
                              "Lat: " + String(getLatitude(), 6) + ", Lon: " + String(getLongitude(), 6),
                              ALERT_PRIORITY_CRITICAL);
    }
}

static void checkRouteDeviation(double lat, double lon) {
    if (routePointCount < config.minVisitsToLearn) return;  // Not enough data yet

    // Find nearest learned route point
    double minDist = 999999;
    uint8_t nearestIdx = 255;

    for (uint8_t i = 0; i < routePointCount; i++) {
        double dist = haversineDist(lat, lon, learnedRoutes[i].latitude, learnedRoutes[i].longitude);
        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    }

    if (nearestIdx != 255 && minDist > config.maxDeviationDistance) {
        // Route deviation detected!
        AnomalyEvent event;
        event.type = ANOMALY_ROUTE_DEVIATION;
        event.confidence = constrain((uint8_t)(minDist / config.maxDeviationDistance * 100), 0, 100);
        event.description = "Route deviation: " + String(minDist, 0) + "m from learned path";
        event.latitude = lat;
        event.longitude = lon;
        event.timestamp = millis();
        event.speed = getSpeed();
        addAnomalyEvent(event);

        if (config.enableRouteDeviationAlerts) {
            triggerBehaviourAlert(ALERT_BEHAVIOUR_ROUTE_DEVIATION, "Route Deviation",
                                  "Deviated " + String(minDist, 0) + "m from learned path",
                                  "Lat: " + String(lat, 6) + ", Lon: " + String(lon, 6),
                                  ALERT_PRIORITY_HIGH);
        }
    }
}

static void checkLongStop() {
    if (currentlyStopped) {
        unsigned long stopDuration = millis() - stopStartTime;
        if (stopDuration > config.maxStopDuration) {
            AnomalyEvent event;
            event.type = ANOMALY_LONG_STOP;
            event.confidence = 90;
            event.description = "Extended stop: " + String(stopDuration / 1000) + " seconds";
            event.latitude = previousLatitude;
            event.longitude = previousLongitude;
            event.timestamp = millis();
            event.duration = stopDuration;
            event.speed = 0;
            addAnomalyEvent(event);

            if (config.enableLongStopAlerts) {
                triggerBehaviourAlert(ALERT_BEHAVIOUR_LONG_STOP, "Extended Stop",
                                      "No movement for " + String(stopDuration / 60000) + " minutes",
                                      "Lat: " + String(previousLatitude, 6) + ", Lon: " + String(previousLongitude, 6),
                                      ALERT_PRIORITY_HIGH);
            }
            currentlyStopped = false;  // Only alert once per stop
        }
    }
}

static void checkRunning(double speed) {
    if (speed > config.runningSpeedThreshold) {
        AnomalyEvent event;
        event.type = ANOMALY_RUNNING;
        event.confidence = constrain((uint8_t)(speed / config.runningSpeedThreshold * 80), 0, 100);
        event.description = "Running detected: " + String(speed, 1) + " km/h";
        event.latitude = getLatitude();
        event.longitude = getLongitude();
        event.timestamp = millis();
        event.speed = speed;
        addAnomalyEvent(event);

        if (config.enableRunningAlerts) {
            triggerBehaviourAlert(ALERT_BEHAVIOUR_RUNNING, "Running Detected",
                                  "Child running at " + String(speed, 1) + " km/h",
                                  "Lat: " + String(getLatitude(), 6) + ", Lon: " + String(getLongitude(), 6),
                                  ALERT_PRIORITY_HIGH);
        }
    }
}

static void checkWandering(double speed) {
    if (speed > config.wanderingSpeedThreshold && speed < 5.0) {
        // Slow, aimless movement could indicate wandering
        // Check if not in a known zone
        bool inZone = false;
        SafeZone zones[MAX_SAFE_ZONES];
        uint8_t zoneCount = 0;
        if (loadSafeZones(zones, zoneCount, MAX_SAFE_ZONES)) {
            double lat = getLatitude();
            double lon = getLongitude();
            for (uint8_t i = 0; i < zoneCount; i++) {
                if (zones[i].enabled) {
                    double d = haversineDist(lat, lon, zones[i].latitude, zones[i].longitude);
                    if (d <= zones[i].radius) {
                        inZone = true;
                        break;
                    }
                }
            }
        }
        if (!inZone && !homeLearned && !schoolLearned) {
            AnomalyEvent event;
            event.type = ANOMALY_WANDERING;
            event.confidence = 60;
            event.description = "Wandering outside known zones";
            event.latitude = getLatitude();
            event.longitude = getLongitude();
            event.timestamp = millis();
            event.speed = speed;
            addAnomalyEvent(event);

            if (config.enableWanderingAlerts) {
                triggerBehaviourAlert(ALERT_BEHAVIOUR_WANDERING, "Wandering Detected",
                                      "Child wandering outside known zones",
                                      "Lat: " + String(getLatitude(), 6) + ", Lon: " + String(getLongitude(), 6),
                                      ALERT_PRIORITY_HIGH);
            }
        }
    }
}

static void checkSchoolLeaving(double lat, double lon) {
    if (!schoolLearned) return;
    if (!isInSchoolHours()) return;

    static bool wasAtSchool = false;

    if (isNearLocation(lat, lon, schoolLocation, 100)) {
        wasAtSchool = true;
    } else if (wasAtSchool) {
        // Left school during school hours!
        AnomalyEvent event;
        event.type = ANOMALY_LEAVING_SCHOOL_UNEXPECTEDLY;
        event.confidence = 85;
        event.description = "Left school during school hours";
        event.latitude = lat;
        event.longitude = lon;
        event.timestamp = millis();
        event.speed = getSpeed();
        addAnomalyEvent(event);

        if (config.enableSchoolAlerts) {
            triggerBehaviourAlert(ALERT_BEHAVIOUR_SCHOOL_EXIT, "School Exit Detected",
                                  "Child left school during school hours",
                                  "Lat: " + String(lat, 6) + ", Lon: " + String(lon, 6),
                                  ALERT_PRIORITY_CRITICAL);
        }
        wasAtSchool = false;
    }
}

static void checkSafeZoneExit(double lat, double lon) {
    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t zoneCount = 0;
    if (!loadSafeZones(zones, zoneCount, MAX_SAFE_ZONES)) return;

    static bool wasInZone[MAX_SAFE_ZONES] = {false};
    bool anyZone = false;

    for (uint8_t i = 0; i < zoneCount; i++) {
        if (!zones[i].enabled) continue;
        anyZone = true;
        double dist = haversineDist(lat, lon, zones[i].latitude, zones[i].longitude);
        bool nowInZone = (dist <= zones[i].radius);

        if (wasInZone[i] && !nowInZone) {
            // Exited safe zone!
            AnomalyEvent event;
            event.type = ANOMALY_LEAVING_SAFE_ZONE;
            event.confidence = 80;
            event.description = "Left safe zone: " + zones[i].name;
            event.latitude = lat;
            event.longitude = lon;
            event.timestamp = millis();
            event.speed = getSpeed();
            addAnomalyEvent(event);

            if (config.enableSafeZoneAlerts) {
                triggerBehaviourAlert(ALERT_BEHAVIOUR_SAFE_ZONE_EXIT, "Safe Zone Exit",
                                      "Child left safe zone: " + zones[i].name,
                                      "Lat: " + String(lat, 6) + ", Lon: " + String(lon, 6),
                                      ALERT_PRIORITY_HIGH);
            }
        }
        wasInZone[i] = nowInZone;
    }
}

static void checkNightMovement(double speed) {
    if (isNightTime() && speed > 2.0) {
        AnomalyEvent event;
        event.type = ANOMALY_NIGHT_MOVEMENT;
        event.confidence = 70;
        event.description = "Movement during night hours: " + String(speed, 1) + " km/h";
        event.latitude = getLatitude();
        event.longitude = getLongitude();
        event.timestamp = millis();
        event.speed = speed;
        addAnomalyEvent(event);

        if (config.enableNightMovementAlerts) {
            triggerBehaviourAlert(ALERT_BEHAVIOUR_NIGHT_MOVEMENT, "Night Movement",
                                  "Movement during night hours: " + String(speed, 1) + " km/h",
                                  "Lat: " + String(getLatitude(), 6) + ", Lon: " + String(getLongitude(), 6),
                                  ALERT_PRIORITY_HIGH);
        }
    }
}

static void checkRepeatedMovement(double lat, double lon) {
    double dist = haversineDist(lat, lon, lastMovementLat, lastMovementLon);
    unsigned long timeDiff = millis() - lastMovementTimestamp;

    if (dist < 50 && timeDiff < 300000) {  // Within 50m and 5 minutes
        repeatedMovementCount++;
        if (repeatedMovementCount >= config.maxRepeatedMovements) {
            AnomalyEvent event;
            event.type = ANOMALY_SUSPICIOUS_REPEATED_MOVEMENT;
            event.confidence = constrain(repeatedMovementCount * 10, 0, 100);
            event.description = "Suspicious repeated movement pattern (" + String(repeatedMovementCount) + " times)";
            event.latitude = lat;
            event.longitude = lon;
            event.timestamp = millis();
            event.speed = getSpeed();
            addAnomalyEvent(event);

            if (config.enableRepeatedMovementAlerts) {
                triggerBehaviourAlert(ALERT_BEHAVIOUR_REPEATED_MOVEMENT, "Repeated Movement",
                                      "Suspicious back-and-forth movement detected (" + String(repeatedMovementCount) + " times)",
                                      "Lat: " + String(lat, 6) + ", Lon: " + String(lon, 6),
                                      ALERT_PRIORITY_HIGH);
            }
            repeatedMovementCount = 0;  // Reset after alert
        }
    } else {
        repeatedMovementCount = 0;
    }

    lastMovementLat = lat;
    lastMovementLon = lon;
    lastMovementTimestamp = millis();
}

static void learnLocations(double lat, double lon, float speed) {
    unsigned long currentTime = getMinutesSinceMidnight();

    // Learn home location (most frequent evening/night location)
    if (!homeLearned || (isNightTime() && homeLocation.visitCount < 100)) {
        if (isNightTime() && speed < 2.0) {  // Stationary at night
            if (!homeLearned) {
                homeLocation.latitude = lat;
                homeLocation.longitude = lon;
                homeLocation.typicalTime = currentTime;
                homeLocation.typicalSpeed = speed;
                homeLocation.visitCount = 1;
                homeLocation.zoneName = "Home";
                homeLearned = true;
                stats.homeVisits++;
                LOG_INFO(LogModule::BEHAV, "Home learned: %.6f, %.6f", lat, lon);
            } else {
                // Refine home location using exponential moving average
                homeLocation.latitude = homeLocation.latitude * (1 - config.learningRate) + lat * config.learningRate;
                homeLocation.longitude = homeLocation.longitude * (1 - config.learningRate) + lon * config.learningRate;
                homeLocation.visitCount++;
            }
        }
    }

    // Learn school location (most frequent weekday morning location)
    if (!schoolLearned && isInSchoolHours() && speed < 2.0) {
        if (!schoolLearned) {
            schoolLocation.latitude = lat;
            schoolLocation.longitude = lon;
            schoolLocation.typicalTime = currentTime;
            schoolLocation.typicalSpeed = speed;
            schoolLocation.visitCount = 1;
            schoolLocation.zoneName = "School";
            schoolLearned = true;
            stats.schoolVisits++;
            LOG_INFO(LogModule::BEHAV, "School learned: %.6f, %.6f", lat, lon);
        } else {
            schoolLocation.latitude = schoolLocation.latitude * (1 - config.learningRate) + lat * config.learningRate;
            schoolLocation.longitude = schoolLocation.longitude * (1 - config.learningRate) + lon * config.learningRate;
            schoolLocation.visitCount++;
        }
    }

    // Learn route points (movement between known locations)
    if (speed > 2.0 && routePointCount < MAX_ROUTE_POINTS) {
        // Add route point if significant movement
        double distFromLast = 0;
        if (routePointCount > 0) {
            distFromLast = haversineDist(lat, lon,
                learnedRoutes[routePointCount - 1].latitude,
                learnedRoutes[routePointCount - 1].longitude);
        }

        if (routePointCount == 0 || distFromLast > 100) {  // New point every 100m
            RoutePoint& rp = learnedRoutes[routePointCount];
            rp.latitude = lat;
            rp.longitude = lon;
            rp.typicalTime = currentTime;
            rp.typicalSpeed = speed;
            rp.visitCount = 1;
            rp.zoneName = "Route";
            routePointCount++;
            stats.routePointsLearned++;
            LOG_DEBUG(LogModule::BEHAV, "Route point %d: %.6f, %.6f", routePointCount, lat, lon);
        } else if (routePointCount > 0) {
            // Update existing route point
            RoutePoint& rp = learnedRoutes[routePointCount - 1];
            rp.visitCount++;
            rp.typicalSpeed = rp.typicalSpeed * (1 - config.learningRate) + speed * config.learningRate;
        }
    }
}

static void addAnomalyEvent(const AnomalyEvent& event) {
    anomalyHistory[anomalyHead] = event;
    anomalyHead = (anomalyHead + 1) % MAX_ANOMALY_HISTORY;
    if (anomalyCount < MAX_ANOMALY_HISTORY) anomalyCount++;

    stats.anomaliesDetected++;
    stats.lastAnomalyTime = millis();
    stats.lastAnomalyType = event.type;

    LOG_WARN(LogModule::BEHAV, "Anomaly: %s (conf=%d%%)", event.description.c_str(), event.confidence);

    // Save anomaly to persistent storage
    saveAnomalyEvent(event);
}

static void saveAnomalyEvent(const AnomalyEvent& event) {
    if (!LittleFS.exists("/logs")) {
        LittleFS.mkdir("/logs");
    }

    JsonDocument doc;
    JsonArray anomalies = doc["anomalies"].to<JsonArray>();

    // Load existing
    if (LittleFS.exists(ANOMALY_HISTORY_FILE)) {
        File file = LittleFS.open(ANOMALY_HISTORY_FILE, "r");
        if (file) {
            JsonDocument existing;
            deserializeJson(existing, file);
            file.close();

            JsonArray existingAnomalies = existing["anomalies"];
            for (JsonObject a : existingAnomalies) {
                if (anomalies.size() < MAX_ANOMALY_HISTORY - 1) {
                    anomalies.add(a);
                }
            }
        }
    }

    // Add new
    JsonObject newAnomaly = anomalies.add<JsonObject>();
    newAnomaly["type"] = (int)event.type;
    newAnomaly["confidence"] = event.confidence;
    newAnomaly["description"] = event.description;
    newAnomaly["lat"] = event.latitude;
    newAnomaly["lon"] = event.longitude;
    newAnomaly["timestamp"] = event.timestamp;
    newAnomaly["duration"] = event.duration;
    newAnomaly["speed"] = event.speed;

    // Save
    File file = LittleFS.open(ANOMALY_HISTORY_FILE, "w");
    if (file) {
        serializeJson(doc, file);
        file.close();
    }
}

static void loadAnomalyHistory() {
    if (!LittleFS.exists(ANOMALY_HISTORY_FILE)) return;

    File file = LittleFS.open(ANOMALY_HISTORY_FILE, "r");
    if (!file) return;

    JsonDocument doc;
    deserializeJson(doc, file);
    file.close();

    JsonArray anomalies = doc["anomalies"];
    anomalyCount = 0;
    anomalyHead = 0;

    for (JsonObject a : anomalies) {
        if (anomalyCount >= MAX_ANOMALY_HISTORY) break;
        AnomalyEvent& event = anomalyHistory[anomalyCount];
        event.type = (AnomalyType)a["type"].as<int>();
        event.confidence = a["confidence"].as<uint8_t>();
        event.description = a["description"].as<String>();
        event.latitude = a["lat"].as<double>();
        event.longitude = a["lon"].as<double>();
        event.timestamp = a["timestamp"].as<unsigned long>();
        event.duration = a["duration"].as<unsigned long>();
        event.speed = a["speed"].as<float>();
        anomalyCount++;
    }
    anomalyHead = anomalyCount % MAX_ANOMALY_HISTORY;
}

static void saveLearnedRoutes() {
    if (!LittleFS.exists("/data")) {
        LittleFS.mkdir("/data");
    }

    JsonDocument doc;
    doc["homeLearned"] = homeLearned;
    doc["schoolLearned"] = schoolLearned;
    doc["home"]["lat"] = homeLocation.latitude;
    doc["home"]["lon"] = homeLocation.longitude;
    doc["home"]["visits"] = homeLocation.visitCount;
    doc["school"]["lat"] = schoolLocation.latitude;
    doc["school"]["lon"] = schoolLocation.longitude;
    doc["school"]["visits"] = schoolLocation.visitCount;

    JsonArray routes = doc["routes"].to<JsonArray>();
    for (uint8_t i = 0; i < routePointCount; i++) {
        JsonObject rp = routes.add<JsonObject>();
        rp["lat"] = learnedRoutes[i].latitude;
        rp["lon"] = learnedRoutes[i].longitude;
        rp["time"] = learnedRoutes[i].typicalTime;
        rp["speed"] = learnedRoutes[i].typicalSpeed;
        rp["visits"] = learnedRoutes[i].visitCount;
    }

    File file = LittleFS.open(LEARNED_ROUTES_FILE, "w");
    if (file) {
        serializeJson(doc, file);
        file.close();
    }
}

static void loadLearnedRoutes() {
    if (!LittleFS.exists(LEARNED_ROUTES_FILE)) return;

    File file = LittleFS.open(LEARNED_ROUTES_FILE, "r");
    if (!file) return;

    JsonDocument doc;
    deserializeJson(doc, file);
    file.close();

    homeLearned = doc["homeLearned"].as<bool>();
    schoolLearned = doc["schoolLearned"].as<bool>();

    if (doc["home"]["lat"]) {
        homeLocation.latitude = doc["home"]["lat"].as<double>();
        homeLocation.longitude = doc["home"]["lon"].as<double>();
        homeLocation.visitCount = doc["home"]["visits"].as<uint8_t>();
    }

    if (doc["school"]["lat"]) {
        schoolLocation.latitude = doc["school"]["lat"].as<double>();
        schoolLocation.longitude = doc["school"]["lon"].as<double>();
        schoolLocation.visitCount = doc["school"]["visits"].as<uint8_t>();
    }

    routePointCount = 0;
    JsonArray routes = doc["routes"];
    for (JsonObject rp : routes) {
        if (routePointCount >= MAX_ROUTE_POINTS) break;
        learnedRoutes[routePointCount].latitude = rp["lat"].as<double>();
        learnedRoutes[routePointCount].longitude = rp["lon"].as<double>();
        learnedRoutes[routePointCount].typicalTime = rp["time"].as<unsigned long>();
        learnedRoutes[routePointCount].typicalSpeed = rp["speed"].as<float>();
        learnedRoutes[routePointCount].visitCount = rp["visits"].as<uint8_t>();
        routePointCount++;
    }

    LOG_INFO(LogModule::BEHAV, "Routes loaded: home=%d, school=%d, points=%d",
             homeLearned, schoolLearned, routePointCount);
}

static void triggerBehaviourAlert(AlertType type, const String& title, const String& message, const String& location, AlertPriority priority) {
    bool sent = triggerAlert(type, title, message, location, priority);
    if (sent) stats.alertsSent++;
    else LOG_ERROR(LogModule::BEHAV, "Failed to send alert: %s", title.c_str());
}

//--------------------------------------------------
// Public API Implementation
//--------------------------------------------------

void initialiseBehaviour() {
    LOG_INFO(LogModule::BEHAV, "Initialising Behaviour AI Engine...");

    // Load configuration
    loadConfiguration();

    // Load learned routes
    loadLearnedRoutes();

    // Load anomaly history
    loadAnomalyHistory();

    // Initialize state
    riskScore = 100;
    currentState = SAFE;
    previousState = SAFE;
    lastMovementTime = millis();
    lastUpdateTime = millis();
    firstFix = true;

    stats = BehaviourStats();

    behaviourInitialized = true;

    LOG_INFO(LogModule::BEHAV, "Behaviour AI Engine Ready (home=%d, school=%d, routes=%d)",
             homeLearned, schoolLearned, routePointCount);
}

void updateBehaviour() {
    if (!behaviourInitialized) {
        initialiseBehaviour();
    }

    if (!gpsHasFix()) {
        LOG_VERBOSE(LogModule::BEHAV, "Waiting for GPS fix...");
        return;
    }

    stats.totalUpdates++;
    lastUpdateTime = millis();

    double lat = getLatitude();
    double lon = getLongitude();
    double speed = getSpeed();

    // First fix handling
    if (firstFix) {
        previousLatitude = lat;
        previousLongitude = lon;
        lastMovementTime = millis();
        firstFix = false;
        LOG_INFO(LogModule::BEHAV, "First GPS fix acquired");
        return;
    }

    // Calculate distance moved
    double moved = haversineDist(previousLatitude, previousLongitude, lat, lon);

    // Movement detection
    if (moved > MOVEMENT_THRESHOLD) {
        previousLatitude = lat;
        previousLongitude = lon;
        lastMovementTime = millis();

        if (currentlyStopped) {
            currentlyStopped = false;
            stopStartTime = 0;
        }
    } else if (!currentlyStopped && moved < 1.0) {
        // Just stopped
        currentlyStopped = true;
        stopStartTime = millis();
    }

    // Check zones
    bool insideZone = false;
    bool homeZone = false;
    bool schoolZone = false;

    SafeZone zones[MAX_SAFE_ZONES];
    uint8_t zoneCount = 0;
    if (loadSafeZones(zones, zoneCount, MAX_SAFE_ZONES)) {
        for (uint8_t i = 0; i < zoneCount; i++) {
            if (!zones[i].enabled) continue;
            double d = haversineDist(lat, lon, zones[i].latitude, zones[i].longitude);
            if (d <= zones[i].radius) {
                insideZone = true;
                if (zones[i].name.equalsIgnoreCase("home") || zones[i].name.equalsIgnoreCase("house")) {
                    homeZone = true;
                } else if (zones[i].name.equalsIgnoreCase("school")) {
                    schoolZone = true;
                }
                break;
            }
        }
    }

    // Check learned locations
    if (homeLearned && isNearLocation(lat, lon, homeLocation, 50)) {
        homeZone = true;
    }
    if (schoolLearned && isNearLocation(lat, lon, schoolLocation, 50)) {
        schoolZone = true;
    }

    // Run all anomaly checks
    checkRouteDeviation(lat, lon);
    checkLongStop();
    checkRunning(speed);
    checkWandering(speed);
    checkSchoolLeaving(lat, lon);
    checkSafeZoneExit(lat, lon);
    checkNightMovement(speed);
    checkRepeatedMovement(lat, lon);

    // Learn locations and routes
    learnLocations(lat, lon, speed);

    // Update risk score and state machine
    updateRiskScore(speed, insideZone, homeZone, schoolZone);
    updateStateMachine();

    // Periodic saves
    static unsigned long lastSave = 0;
    if (millis() - lastSave > 60000) {  // Every minute
        saveLearnedRoutes();
        saveConfiguration();
        lastSave = millis();
    }

    // Debug output
    if (stats.totalUpdates % 30 == 0) {  // Every 30 updates
        LOG_DEBUG(LogModule::BEHAV, "Risk=%d, State=%s, Speed=%.1f, Zone=%s, RoutePts=%d",
                  riskScore, behaviourStateToString(currentState).c_str(), speed,
                  insideZone ? "YES" : "NO", routePointCount);
    }
}

void panicAlert() {
    LOG_ERROR(LogModule::BEHAV, "!!! PANIC ALERT TRIGGERED !!!");

    AnomalyEvent event;
    event.type = ANOMALY_UNEXPECTED_MOVEMENT;
    event.confidence = 100;
    event.description = "PANIC BUTTON ACTIVATED";
    event.latitude = getLatitude();
    event.longitude = getLongitude();
    event.timestamp = millis();
    event.speed = getSpeed();
    addAnomalyEvent(event);

    // Use new format matching requirements
    String lat = String(getLatitude(), 6);
    String lon = String(getLongitude(), 6);
    String googleMapsLink = "https://maps.google.com/?q=" + lat + "," + lon;
    uint8_t batteryPercent = getBatteryPercentage();

    telegramSendPanicAlert(lat, lon, googleMapsLink, batteryPercent, DEVICE_NAME);
}

void printBehaviourStatus() {
    Serial.println();
    Serial.println("========== BEHAVIOUR ENGINE STATUS ==========");
    Serial.print("State: "); Serial.println(behaviourStateToString(currentState));
    Serial.print("Risk Score: "); Serial.println(riskScore);
    Serial.print("Home Learned: "); Serial.println(homeLearned ? "YES" : "NO");
    if (homeLearned) {
        Serial.print("  Home: "); Serial.print(homeLocation.latitude, 6);
        Serial.print(", "); Serial.println(homeLocation.longitude, 6);
    }
    Serial.print("School Learned: "); Serial.println(schoolLearned ? "YES" : "NO");
    if (schoolLearned) {
        Serial.print("  School: "); Serial.print(schoolLocation.latitude, 6);
        Serial.print(", "); Serial.println(schoolLocation.longitude, 6);
    }
    Serial.print("Route Points: "); Serial.println(routePointCount);
    Serial.print("Anomalies: "); Serial.println(anomalyCount);
    Serial.print("Total Updates: "); Serial.println(stats.totalUpdates);
    Serial.print("Alerts Sent: "); Serial.println(stats.alertsSent);
    Serial.println("=============================================");
}

void printBehaviourStats() {
    Serial.println();
    Serial.println("========== BEHAVIOUR STATISTICS ==========");
    Serial.print("Total Updates: "); Serial.println(stats.totalUpdates);
    Serial.print("Anomalies Detected: "); Serial.println(stats.anomaliesDetected);
    Serial.print("Alerts Sent: "); Serial.println(stats.alertsSent);
    Serial.print("Home Visits: "); Serial.println(homeLocation.visitCount);
    Serial.print("School Visits: "); Serial.println(schoolLocation.visitCount);
    Serial.print("Route Points Learned: "); Serial.println(stats.routePointsLearned);
    if (stats.lastAnomalyTime > 0) {
        Serial.print("Last Anomaly: ");
        Serial.print((int)stats.lastAnomalyType);
        Serial.print(" (");
        Serial.print((millis() - stats.lastAnomalyTime) / 1000);
        Serial.println("s ago)");
    }
    Serial.println("==========================================");
}

void printLearnedRoutes() {
    Serial.println();
    Serial.println("========== LEARNED ROUTES ==========");
    Serial.print("Home: "); Serial.print(homeLearned ? "YES" : "NO");
    if (homeLearned) Serial.print(" (visits: " + String(homeLocation.visitCount) + ")");
    Serial.println();

    Serial.print("School: "); Serial.print(schoolLearned ? "YES" : "NO");
    if (schoolLearned) Serial.print(" (visits: " + String(schoolLocation.visitCount) + ")");
    Serial.println();

    Serial.print("Route Points: "); Serial.println(routePointCount);
    for (uint8_t i = 0; i < routePointCount && i < 10; i++) {
        Serial.print("  ["); Serial.print(i); Serial.print("] ");
        Serial.print(learnedRoutes[i].latitude, 6); Serial.print(", ");
        Serial.print(learnedRoutes[i].longitude, 6); Serial.print(" ");
        Serial.print("visits="); Serial.print(learnedRoutes[i].visitCount);
        Serial.print(" speed="); Serial.print(learnedRoutes[i].typicalSpeed, 1);
        Serial.println("km/h");
    }
    if (routePointCount > 10) {
        Serial.print("  ... and "); Serial.print(routePointCount - 10); Serial.println(" more");
    }
    Serial.println("=====================================");
}

void printAnomalyHistory() {
    Serial.println();
    Serial.println("========== ANOMALY HISTORY ==========");
    Serial.print("Total: "); Serial.println(anomalyCount);

    for (uint8_t i = 0; i < anomalyCount; i++) {
        uint8_t idx = (anomalyHead - 1 - i + MAX_ANOMALY_HISTORY) % MAX_ANOMALY_HISTORY;
        AnomalyEvent& e = anomalyHistory[idx];
        Serial.print("  ["); Serial.print(i); Serial.print("] ");
        Serial.print(e.description);
        Serial.print(" (conf="); Serial.print(e.confidence); Serial.print("%)");
        Serial.print(" type="); Serial.print((int)e.type);
        Serial.println();
    }
    Serial.println("=====================================");
}

//--------------------------------------------------
// Getters
//--------------------------------------------------
int getRiskScore() { return riskScore; }

BehaviourState getBehaviourState() { return currentState; }

String behaviourStateToString(BehaviourState state) {
    switch (state) {
        case SAFE: return "SAFE";
        case WATCH: return "WATCH";
        case WARNING: return "WARNING";
        case EMERGENCY: return "EMERGENCY";
        default: return "UNKNOWN";
    }
}

uint8_t getAnomalyCount() { return anomalyCount; }

AnomalyEvent* getAnomalyEvent(uint8_t index) {
    if (index >= anomalyCount) return nullptr;
    uint8_t idx = (anomalyHead - 1 - index + MAX_ANOMALY_HISTORY) % MAX_ANOMALY_HISTORY;
    return &anomalyHistory[idx];
}

void clearAnomalyHistory() {
    anomalyCount = 0;
    anomalyHead = 0;
    // Use proper initialization instead of memset for String members
    for (uint8_t i = 0; i < MAX_ANOMALY_HISTORY; i++) {
        anomalyHistory[i] = AnomalyEvent();
    }
    LOG_INFO(LogModule::BEHAV, "Anomaly history cleared");
}

//--------------------------------------------------
// Configuration
//--------------------------------------------------
bool loadBehaviourConfig(BehaviourConfig& cfg) {
    if (!LittleFS.exists(BEHAVIOUR_CONFIG_FILE)) {
        // Create default
        saveBehaviourConfig(cfg);
        return true;
    }

    File file = LittleFS.open(BEHAVIOUR_CONFIG_FILE, "r");
    if (!file) return false;

    JsonDocument doc;
    deserializeJson(doc, file);
    file.close();

    cfg.minVisitsToLearn = doc["minVisitsToLearn"] | 3;
    cfg.learningRate = doc["learningRate"] | 0.1;
    cfg.routeTimeout = doc["routeTimeout"] | 300000;
    cfg.maxDeviationDistance = doc["maxDeviationDistance"] | 50.0;
    cfg.maxStopDuration = doc["maxStopDuration"] | 300000;
    cfg.runningSpeedThreshold = doc["runningSpeedThreshold"] | 10.0;
    cfg.wanderingSpeedThreshold = doc["wanderingSpeedThreshold"] | 2.0;
    cfg.nightStartHour = doc["nightStartHour"] | 22;
    cfg.nightEndHour = doc["nightEndHour"] | 6;
    cfg.maxRepeatedMovements = doc["maxRepeatedMovements"] | 5;
    cfg.watchThreshold = doc["watchThreshold"] | 70;
    cfg.warningThreshold = doc["warningThreshold"] | 50;
    cfg.emergencyThreshold = doc["emergencyThreshold"] | 30;
    cfg.enableRouteDeviationAlerts = doc["enableRouteDeviationAlerts"] | true;
    cfg.enableLongStopAlerts = doc["enableLongStopAlerts"] | true;
    cfg.enableRunningAlerts = doc["enableRunningAlerts"] | true;
    cfg.enableWanderingAlerts = doc["enableWanderingAlerts"] | true;
    cfg.enableSchoolAlerts = doc["enableSchoolAlerts"] | true;
    cfg.enableSafeZoneAlerts = doc["enableSafeZoneAlerts"] | true;
    cfg.enableNightMovementAlerts = doc["enableNightMovementAlerts"] | true;
    cfg.enableRepeatedMovementAlerts = doc["enableRepeatedMovementAlerts"] | true;

    return true;
}

bool saveBehaviourConfig(const BehaviourConfig& cfg) {
    if (!LittleFS.exists("/config")) {
        LittleFS.mkdir("/config");
    }

    JsonDocument doc;
    doc["minVisitsToLearn"] = cfg.minVisitsToLearn;
    doc["learningRate"] = cfg.learningRate;
    doc["routeTimeout"] = cfg.routeTimeout;
    doc["maxDeviationDistance"] = cfg.maxDeviationDistance;
    doc["maxStopDuration"] = cfg.maxStopDuration;
    doc["runningSpeedThreshold"] = cfg.runningSpeedThreshold;
    doc["wanderingSpeedThreshold"] = cfg.wanderingSpeedThreshold;
    doc["nightStartHour"] = cfg.nightStartHour;
    doc["nightEndHour"] = cfg.nightEndHour;
    doc["maxRepeatedMovements"] = cfg.maxRepeatedMovements;
    doc["watchThreshold"] = cfg.watchThreshold;
    doc["warningThreshold"] = cfg.warningThreshold;
    doc["emergencyThreshold"] = cfg.emergencyThreshold;
    doc["enableRouteDeviationAlerts"] = cfg.enableRouteDeviationAlerts;
    doc["enableLongStopAlerts"] = cfg.enableLongStopAlerts;
    doc["enableRunningAlerts"] = cfg.enableRunningAlerts;
    doc["enableWanderingAlerts"] = cfg.enableWanderingAlerts;
    doc["enableSchoolAlerts"] = cfg.enableSchoolAlerts;
    doc["enableSafeZoneAlerts"] = cfg.enableSafeZoneAlerts;
    doc["enableNightMovementAlerts"] = cfg.enableNightMovementAlerts;
    doc["enableRepeatedMovementAlerts"] = cfg.enableRepeatedMovementAlerts;

    File file = LittleFS.open(BEHAVIOUR_CONFIG_FILE, "w");
    if (!file) return false;
    serializeJson(doc, file);
    file.close();
    return true;
}

BehaviourConfig getBehaviourConfig() { return config; }

//--------------------------------------------------
// Manual Triggers (for testing)
//--------------------------------------------------
bool triggerTestAnomaly(AnomalyType type, const String& description) {
    AnomalyEvent event;
    event.type = type;
    event.confidence = 100;
    event.description = "[TEST] " + description;
    event.latitude = getLatitude();
    event.longitude = getLongitude();
    event.timestamp = millis();
    event.speed = getSpeed();
    addAnomalyEvent(event);
    return true;
}

void simulateRouteDeviation() {
    triggerTestAnomaly(ANOMALY_ROUTE_DEVIATION, "Simulated route deviation - 100m from path");
}

void simulateLongStop() {
    triggerTestAnomaly(ANOMALY_LONG_STOP, "Simulated long stop - 10 minutes stationary");
}

void simulateRunning() {
    triggerTestAnomaly(ANOMALY_RUNNING, "Simulated running - 15 km/h detected");
}