#include "Alerts.h"

#include "Config.h"
#include "Storage.h"
#include "Telegram.h"
#include "Utilities.h"
#include "GPS.h"
#include "WiFiManager.h"
#include "Battery.h"
#include "Behaviour.h"
#include <FS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

#define ALERTS_HISTORY_FILE "/alerts_history.json"
#define ALERTS_CONFIG_FILE "/alerts_config.json"
#define MAX_PENDING_ALERTS 20
#define MAX_ALERT_HISTORY 50

// Static storage
static Alert pendingAlerts[MAX_PENDING_ALERTS];
static uint8_t pendingAlertCount = 0;
static Alert alertHistory[MAX_ALERT_HISTORY];
static uint8_t alertHistoryCount = 0;
static AlertConfig alertConfig;
static bool alertsInitialised = false;
static unsigned long lastGPSFixTime = 0;
static bool gpsWasFixed = false;
static unsigned long lastDailySummaryCheck = 0;
static bool lowBatteryAlertSent[3] = {false, false, false}; // 20%, 10%, 5%

// Forward declarations for helper functions
static void addToHistory(const Alert& alert);
static void sendAlertNow(Alert& alert);
static String formatTelegramAlert(Alert& alert);
static String alertTypeToString(AlertType type);
static String priorityToString(AlertPriority p);
static String getTimeString(unsigned long timestamp);
static unsigned long getCurrentHour();
static float getTotalDistanceToday();

// Initialisation
void initialiseAlerts() {
    loadAlertConfig(alertConfig);
    loadAlertHistory();
    alertsInitialised = true;
    lastGPSFixTime = millis();
    gpsWasFixed = gpsHasFix();
    lastDailySummaryCheck = millis();
    Serial.println("Alerts system initialised");
}

// Main Service Loop
void serviceAlerts() {
    if (!alertsInitialised || !alertConfig.enabled) return;
    unsigned long now = millis();

    // Check GPS loss
    if (alertConfig.gpsLossAlerts) {
        bool gpsFixed = gpsHasFix();
        if (gpsWasFixed && !gpsFixed) {
            // GPS just lost
            lastGPSFixTime = now;
        } else if (!gpsWasFixed && gpsFixed) {
            // GPS restored
            sendGPSRestoredAlert(getGoogleMapsLink());
            lastGPSFixTime = now;
        } else if (!gpsFixed && (now - lastGPSFixTime > alertConfig.gpsLossThreshold)) {
            // GPS lost for threshold duration
            sendGPSLossAlert(now - lastGPSFixTime, getGoogleMapsLink());
            lastGPSFixTime = now; // Prevent repeated alerts
        }
        gpsWasFixed = gpsFixed;
    }

    // Check battery levels
    if (alertConfig.lowBatteryAlerts) {
        uint8_t batteryPercent = getBatteryPercentage();
        String loc = getGoogleMapsLink();
        if (batteryPercent <= alertConfig.lowBatteryThreshold5 && !lowBatteryAlertSent[2]) {
            sendLowBatteryAlert(batteryPercent, loc);
            lowBatteryAlertSent[2] = true;
        } else if (batteryPercent <= alertConfig.lowBatteryThreshold10 && !lowBatteryAlertSent[1]) {
            sendLowBatteryAlert(batteryPercent, loc);
            lowBatteryAlertSent[1] = true;
        } else if (batteryPercent <= alertConfig.lowBatteryThreshold20 && !lowBatteryAlertSent[0]) {
            sendLowBatteryAlert(batteryPercent, loc);
            lowBatteryAlertSent[0] = true;
        } else if (batteryPercent > alertConfig.lowBatteryThreshold20) {
            // Reset flags when battery recovers
            lowBatteryAlertSent[0] = lowBatteryAlertSent[1] = lowBatteryAlertSent[2] = false;
        }
    }

    // Check daily summary
    if (alertConfig.dailySummaryEnabled) {
        unsigned long hour = getCurrentHour();
        if (hour == alertConfig.dailySummaryTime && (now - lastDailySummaryCheck > 3600000)) {
            sendDailySummaryAlert();
            lastDailySummaryCheck = now;
        }
    }

    // Retry pending alerts
    retryQueuedAlerts();
}

// Alert Triggering
bool triggerAlert(AlertType type, const String& title, const String& message,
                  const String& location, AlertPriority priority) {
    if (!alertsInitialised || !alertConfig.enabled) return false;
    if (pendingAlertCount >= MAX_PENDING_ALERTS) {
        Serial.println("Alert queue full, dropping oldest");
        // Remove oldest non-acknowledged alert
        for (uint8_t i = 0; i < pendingAlertCount - 1; i++) {
            if (!pendingAlerts[i].acknowledged) {
                pendingAlerts[i] = pendingAlerts[i + 1];
            }
        }
        pendingAlertCount--;
    }
    Alert& alert = pendingAlerts[pendingAlertCount++];
    alert.type = type;
    alert.title = title;
    alert.message = message;
    alert.location = location;
    alert.timestamp = millis();
    alert.priority = priority;
    alert.acknowledged = false;
    alert.retryCount = 0;
    // Add to history
    addToHistory(alert);
    // Send immediately
    sendAlertNow(alert);
    return true;
}

bool triggerAlertWithData(AlertType type, const String& title, const String& message,
                          const String& location, AlertPriority priority,
                          JsonObject data) {
    return triggerAlert(type, title, message, location, priority);
}

// Convenience Functions
bool sendSafeArrivalAlert(const String& zoneName, const String& location) {
    if (!alertConfig.safeZoneAlerts) return false;
    return triggerAlert(ALERT_SAFE_ARRIVAL,
        "Safe Arrival: " + zoneName,
        "Child has arrived at " + zoneName,
        location, ALERT_PRIORITY_HIGH);
}

bool sendSafeDepartureAlert(const String& zoneName, const String& location) {
    if (!alertConfig.safeZoneAlerts) return false;
    return triggerAlert(ALERT_SAFE_DEPARTURE,
        "Safe Zone Departure: " + zoneName,
        "Child has left " + zoneName,
        location, ALERT_PRIORITY_HIGH);
}

bool sendLowBatteryAlert(uint8_t batteryPercent, const String& location) {
    String title, msg;
    AlertPriority priority = ALERT_PRIORITY_NORMAL;
    if (batteryPercent <= 5) {
        title = "CRITICAL: Battery at " + String(batteryPercent) + "%";
        msg = "Battery critically low! Please charge immediately.";
        priority = ALERT_PRIORITY_CRITICAL;
    } else if (batteryPercent <= 10) {
        title = "WARNING: Battery at " + String(batteryPercent) + "%";
        msg = "Battery very low. Charge soon.";
        priority = ALERT_PRIORITY_HIGH;
    } else {
        title = "Battery Low: " + String(batteryPercent) + "%";
        msg = "Battery is running low. Consider charging.";
        priority = ALERT_PRIORITY_NORMAL;
    }
    return triggerAlert(ALERT_LOW_BATTERY_20, title, msg, location, priority);
}

bool sendLowBatteryAlert(uint8_t batteryPercent) {
    // Use the format from requirements: ⚠ Battery Low / Battery: XX% / Please recharge the device.
    if (telegramConfigured() && alertConfig.telegramEnabled) {
        return telegramSendLowBatteryAlert(batteryPercent);
    }
    return false;
}

bool sendSafeArrivalAlert(const String& zoneName, double lat, double lon, uint8_t batteryPercent) {
    // Use the format from requirements: ✅ Safe Arrival / Child has arrived at Home / Time: / Battery: / Location: Lat/Long
    if (telegramConfigured() && alertConfig.telegramEnabled) {
        String timeStr = String(millis() / 1000) + "s";
        return telegramSendSafeArrivalAlert(zoneName, timeStr, batteryPercent, String(lat, 6), String(lon, 6));
    }
    return false;
}

bool sendBehaviourAlert(const String& description, const String& riskLevel, const String& recommendation, double lat, double lon) {
    // Use the format from requirements: ⚠ Behaviour Alert / Route deviation detected / Risk Level: / Recommendation: / Location: Lat/Long
    if (telegramConfigured() && alertConfig.telegramEnabled) {
        return telegramSendBehaviourAlert(description, riskLevel, recommendation, String(lat, 6), String(lon, 6));
    }
    return false;
}

bool sendGPSLossAlert(unsigned long durationMs, const String& location) {
    String msg = "GPS signal lost for " + String(durationMs / 1000) + " seconds";
    return triggerAlert(ALERT_GPS_LOSS, "GPS Signal Lost", msg, location, ALERT_PRIORITY_HIGH);
}

bool sendGPSRestoredAlert(const String& location) {
    return triggerAlert(ALERT_GPS_RESTORED, "GPS Signal Restored",
        "GPS fix has been reacquired", location, ALERT_PRIORITY_NORMAL);
}

bool sendDailySummaryAlert() {
    String msg = "Daily Summary: ";
    msg += "Risk: " + behaviourStateToString(getBehaviourState()) + " ";
    msg += "| Battery: " + String(getBatteryPercentage()) + "% ";
    msg += "| GPS: " + String(getSatelliteCount()) + " sats ";
    msg += "| Distance: " + String(getTotalDistanceToday(), 1) + "m";
    return triggerAlert(ALERT_DAILY_SUMMARY, "Daily Summary", msg, getGoogleMapsLink(), ALERT_PRIORITY_LOW);
}

bool sendWiFiDisconnectedAlert() {
    return triggerAlert(ALERT_WIFI_DISCONNECTED, "WiFi Disconnected",
        "Device lost WiFi connection. Switching to AP mode if configured.",
        getGoogleMapsLink(), ALERT_PRIORITY_HIGH);
}

bool sendWiFiReconnectedAlert(const String& ssid) {
    return triggerAlert(ALERT_WIFI_RECONNECTED, "WiFi Reconnected",
        "Connected to " + ssid, getGoogleMapsLink(), ALERT_PRIORITY_NORMAL);
}

bool sendPanicButtonAlert(const String& location) {
    return triggerAlert(ALERT_PANIC_BUTTON, "PANIC BUTTON PRESSED",
        "Emergency button activated by child!", location, ALERT_PRIORITY_CRITICAL);
}

bool sendRouteDeviationAlert(const String& expectedRoute, const String& actualRoute, const String& location) {
    return triggerAlert(ALERT_ROUTE_DEVIATION, "Route Deviation Detected",
        "Expected: " + expectedRoute + " | Actual: " + actualRoute,
        location, ALERT_PRIORITY_HIGH);
}

bool sendSpeedExceededAlert(float speed, float maxSpeed, const String& location) {
    String msg = "Speed " + String(speed, 1) + " km/h exceeds limit " + String(maxSpeed, 1) + " km/h";
    return triggerAlert(ALERT_SPEED_EXCEEDED, "Speed Limit Exceeded", msg, location, ALERT_PRIORITY_HIGH);
}

bool sendInactivityAlert(unsigned long inactiveMs, const String& location) {
    String msg = "No movement detected for " + String(inactiveMs / 60000) + " minutes";
    return triggerAlert(ALERT_INACTIVITY, "Extended Inactivity", msg, location, ALERT_PRIORITY_NORMAL);
}

bool sendDeviceRestartAlert(const String& reason) {
    return triggerAlert(ALERT_DEVICE_RESTART, "Device Restarted",
        "Device restarted: " + reason, getGoogleMapsLink(), ALERT_PRIORITY_NORMAL);
}

bool sendFirmwareUpdateAlert(const String& version, bool success) {
    String title = success ? "Firmware Updated" : "Firmware Update Failed";
    String msg = success ? "Updated to version " + version : "Failed to update to version " + version;
    return triggerAlert(ALERT_FIRMWARE_UPDATE, title, msg, getGoogleMapsLink(),
        success ? ALERT_PRIORITY_NORMAL : ALERT_PRIORITY_HIGH);
}

bool sendSafeZoneCreatedAlert(const String& zoneName) {
    return triggerAlert(ALERT_SAFE_ZONE_CREATED, "Safe Zone Created",
        "New safe zone \"" + zoneName + "\" has been added", getGoogleMapsLink(), ALERT_PRIORITY_LOW);
}

bool sendConfigChangedAlert(const String& configName) {
    return triggerAlert(ALERT_CONFIG_CHANGED, "Configuration Changed",
        "Setting \"" + configName + "\" was modified", getGoogleMapsLink(), ALERT_PRIORITY_LOW);
}

// Behaviour AI Alerts
bool sendBehaviourWarningAlert(const String& description, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_WARNING, "Behaviour Warning",
                        description, location, ALERT_PRIORITY_HIGH);
}

bool sendBehaviourEmergencyAlert(const String& description, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_EMERGENCY, "Behaviour Emergency",
                        description, location, ALERT_PRIORITY_CRITICAL);
}

bool sendBehaviourRouteDeviationAlert(const String& expectedRoute, const String& actualRoute, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_ROUTE_DEVIATION, "Route Deviation",
                        "Expected: " + expectedRoute + " | Actual: " + actualRoute,
                        location, ALERT_PRIORITY_HIGH);
}

bool sendLongStopAlert(unsigned long durationMs, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_LONG_STOP, "Extended Stop",
                        "No movement for " + String(durationMs / 60000) + " minutes",
                        location, ALERT_PRIORITY_HIGH);
}

bool sendRunningAlert(float speed, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_RUNNING, "Running Detected",
                        "Child running at " + String(speed, 1) + " km/h",
                        location, ALERT_PRIORITY_HIGH);
}

bool sendWanderingAlert(const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_WANDERING, "Wandering Detected",
                        "Child wandering outside known zones",
                        location, ALERT_PRIORITY_HIGH);
}

bool sendSchoolExitAlert(const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_SCHOOL_EXIT, "School Exit Detected",
                        "Child left school during school hours",
                        location, ALERT_PRIORITY_CRITICAL);
}

bool sendSafeZoneExitAlert(const String& zoneName, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_SAFE_ZONE_EXIT, "Safe Zone Exit",
                        "Child left safe zone: " + zoneName,
                        location, ALERT_PRIORITY_HIGH);
}

bool sendNightMovementAlert(float speed, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_NIGHT_MOVEMENT, "Night Movement",
                        "Movement during night hours: " + String(speed, 1) + " km/h",
                        location, ALERT_PRIORITY_HIGH);
}

bool sendRepeatedMovementAlert(uint8_t count, const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_REPEATED_MOVEMENT, "Repeated Movement",
                        "Suspicious back-and-forth movement (" + String(count) + " times)",
                        location, ALERT_PRIORITY_HIGH);
}

bool sendUnexpectedMovementAlert(const String& location) {
    return triggerAlert(ALERT_BEHAVIOUR_UNEXPECTED_MOVEMENT, "Unexpected Movement",
                        "Unusual movement pattern detected",
                        location, ALERT_PRIORITY_HIGH);
}

// Internal Helper Functions
void sendAlertNow(Alert& alert) {
    // Send via Telegram
    if (alertConfig.telegramEnabled && telegramConfigured()) {
        String telegramMsg = formatTelegramAlert(alert);
        sendTelegramMessage(telegramMsg);
    }
    // Log to serial
    Serial.println("ALERT: [" + alertTypeToString(alert.type) + "] " + alert.title);
    Serial.println("  " + alert.message);
    if (alert.location.length() > 0) {
        Serial.println("  Location: " + alert.location);
    }
}

String formatTelegramAlert(Alert& alert) {
    String msg = "🚨 *CTN Alert*\n";
    msg += "*Type:* " + alertTypeToString(alert.type) + "\n";
    msg += "*Title:* " + alert.title + "\n";
    msg += "*Message:* " + alert.message + "\n";
    if (alert.location.length() > 0) {
        msg += "*Location:* " + alert.location + "\n";
    }
    msg += "*Time:* " + getTimeString(alert.timestamp) + "\n";
    msg += "*Priority:* " + priorityToString(alert.priority);
    return msg;
}

String alertTypeToString(AlertType type) {
    switch (type) {
        case ALERT_SAFE_ARRIVAL: return "Safe Arrival";
        case ALERT_SAFE_DEPARTURE: return "Safe Departure";
        case ALERT_LOW_BATTERY_20: return "Low Battery 20%";
        case ALERT_LOW_BATTERY_10: return "Low Battery 10%";
        case ALERT_LOW_BATTERY_5: return "Low Battery 5%";
        case ALERT_BATTERY_CRITICAL: return "Battery Critical";
        case ALERT_GPS_LOSS: return "GPS Loss";
        case ALERT_GPS_RESTORED: return "GPS Restored";
        case ALERT_DAILY_SUMMARY: return "Daily Summary";
        case ALERT_WIFI_DISCONNECTED: return "WiFi Disconnected";
        case ALERT_WIFI_RECONNECTED: return "WiFi Reconnected";
        case ALERT_PANIC_BUTTON: return "Panic Button";
        case ALERT_ROUTE_DEVIATION: return "Route Deviation";
        case ALERT_SPEED_EXCEEDED: return "Speed Exceeded";
        case ALERT_INACTIVITY: return "Inactivity";
        case ALERT_DEVICE_RESTART: return "Device Restart";
        case ALERT_FIRMWARE_UPDATE: return "Firmware Update";
        case ALERT_SAFE_ZONE_CREATED: return "Safe Zone Created";
        case ALERT_CONFIG_CHANGED: return "Config Changed";
        // Behaviour AI
        case ALERT_BEHAVIOUR_WARNING: return "Behaviour Warning";
        case ALERT_BEHAVIOUR_EMERGENCY: return "Behaviour Emergency";
        case ALERT_BEHAVIOUR_ROUTE_DEVIATION: return "Route Deviation";
        case ALERT_BEHAVIOUR_LONG_STOP: return "Long Stop";
        case ALERT_BEHAVIOUR_RUNNING: return "Running";
        case ALERT_BEHAVIOUR_WANDERING: return "Wandering";
        case ALERT_BEHAVIOUR_SCHOOL_EXIT: return "School Exit";
        case ALERT_BEHAVIOUR_SAFE_ZONE_EXIT: return "Safe Zone Exit";
        case ALERT_BEHAVIOUR_NIGHT_MOVEMENT: return "Night Movement";
        case ALERT_BEHAVIOUR_REPEATED_MOVEMENT: return "Repeated Movement";
        case ALERT_BEHAVIOUR_UNEXPECTED_MOVEMENT: return "Unexpected Movement";
        default: return "Unknown";
    }
}

String priorityToString(AlertPriority p) {
    switch (p) {
        case ALERT_PRIORITY_LOW: return "🟢 Low";
        case ALERT_PRIORITY_NORMAL: return "🟡 Normal";
        case ALERT_PRIORITY_HIGH: return "🟠 High";
        case ALERT_PRIORITY_CRITICAL: return "🔴 Critical";
        default: return "Unknown";
    }
}

void addToHistory(const Alert& alert) {
    if (alertHistoryCount >= MAX_ALERT_HISTORY) {
        // Shift history
        for (uint8_t i = 0; i < MAX_ALERT_HISTORY - 1; i++) {
            alertHistory[i] = alertHistory[i + 1];
        }
        alertHistoryCount--;
    }
    alertHistory[alertHistoryCount++] = alert;
    saveAlertHistory();
}

// Alert Queue Management
uint8_t getPendingAlertCount() {
    return pendingAlertCount;
}

bool hasPendingAlerts() {
    return pendingAlertCount > 0;
}

void acknowledgeAlert(uint8_t index) {
    if (index < pendingAlertCount) {
        pendingAlerts[index].acknowledged = true;
    }
}

bool acknowledgeAndRemoveAlert(uint8_t index) {
    if (index >= pendingAlertCount) return false;

    // Shift remaining alerts down
    for (uint8_t i = index; i < pendingAlertCount - 1; i++) {
        pendingAlerts[i] = pendingAlerts[i + 1];
    }
    pendingAlertCount--;
    return true;
}

void clearAcknowledgedAlerts() {
    uint8_t writeIdx = 0;
    for (uint8_t i = 0; i < pendingAlertCount; i++) {
        if (!pendingAlerts[i].acknowledged) {
            if (writeIdx != i) {
                pendingAlerts[writeIdx] = pendingAlerts[i];
            }
            writeIdx++;
        }
    }
    pendingAlertCount = writeIdx;
}

void clearAllAlerts() {
    pendingAlertCount = 0;
}

// Alert History / Persistence
bool saveAlertHistory() {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for (uint8_t i = 0; i < alertHistoryCount; i++) {
        JsonObject obj = arr.add<JsonObject>();
        obj["type"] = alertHistory[i].type;
        obj["priority"] = alertHistory[i].priority;
        obj["title"] = alertHistory[i].title;
        obj["message"] = alertHistory[i].message;
        obj["location"] = alertHistory[i].location;
        obj["timestamp"] = alertHistory[i].timestamp;
        obj["acknowledged"] = alertHistory[i].acknowledged;
        obj["retryCount"] = alertHistory[i].retryCount;
    }
    File file = LittleFS.open(ALERTS_HISTORY_FILE, "w");
    if (!file) return false;
    serializeJson(doc, file);
    file.close();
    return true;
}

bool loadAlertHistory() {
    if (!LittleFS.exists(ALERTS_HISTORY_FILE)) return false;
    File file = LittleFS.open(ALERTS_HISTORY_FILE, "r");
    if (!file) return false;
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, file);
    file.close();
    if (err) return false;
    JsonArray arr = doc.as<JsonArray>();
    alertHistoryCount = 0;
    for (JsonObject obj : arr) {
        if (alertHistoryCount >= MAX_ALERT_HISTORY) break;
        alertHistory[alertHistoryCount].type = (AlertType)obj["type"].as<int>();
        alertHistory[alertHistoryCount].priority = (AlertPriority)obj["priority"].as<int>();
        alertHistory[alertHistoryCount].title = obj["title"].as<String>();
        alertHistory[alertHistoryCount].message = obj["message"].as<String>();
        alertHistory[alertHistoryCount].location = obj["location"].as<String>();
        alertHistory[alertHistoryCount].timestamp = obj["timestamp"].as<unsigned long>();
        alertHistory[alertHistoryCount].acknowledged = obj["acknowledged"].as<bool>();
        alertHistory[alertHistoryCount].retryCount = obj["retryCount"].as<uint8_t>();
        alertHistoryCount++;
    }
    return true;
}

uint8_t getAlertHistoryCount() {
    return alertHistoryCount;
}

Alert* getAlertHistory(uint8_t index) {
    if (index < alertHistoryCount) {
        return &alertHistory[index];
    }
    return nullptr;
}

void clearAlertHistory() {
    alertHistoryCount = 0;
    LittleFS.remove(ALERTS_HISTORY_FILE);
}

// Configuration
bool loadAlertConfig(AlertConfig& config) {
    if (!LittleFS.exists(ALERTS_CONFIG_FILE)) return false;
    File file = LittleFS.open(ALERTS_CONFIG_FILE, "r");
    if (!file) return false;
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, file);
    file.close();
    if (err) return false;
    config.enabled = doc["enabled"] | true;
    config.telegramEnabled = doc["telegramEnabled"] | true;
    config.webDashboardEnabled = doc["webDashboardEnabled"] | true;
    config.lowBatteryAlerts = doc["lowBatteryAlerts"] | true;
    config.gpsLossAlerts = doc["gpsLossAlerts"] | true;
    config.safeZoneAlerts = doc["safeZoneAlerts"] | true;
    config.dailySummaryEnabled = doc["dailySummaryEnabled"] | true;
    config.lowBatteryThreshold20 = doc["lowBatteryThreshold20"] | 20;
    config.lowBatteryThreshold10 = doc["lowBatteryThreshold10"] | 10;
    config.lowBatteryThreshold5 = doc["lowBatteryThreshold5"] | 5;
    config.gpsLossThreshold = doc["gpsLossThreshold"] | 60000;
    config.dailySummaryTime = doc["dailySummaryTime"] | 20;
    config.maxRetries = doc["maxRetries"] | 3;
    config.retryInterval = doc["retryInterval"] | 30000;
    return true;
}

bool saveAlertConfig(const AlertConfig& config) {
    JsonDocument doc;
    doc["enabled"] = config.enabled;
    doc["telegramEnabled"] = config.telegramEnabled;
    doc["webDashboardEnabled"] = config.webDashboardEnabled;
    doc["lowBatteryAlerts"] = config.lowBatteryAlerts;
    doc["gpsLossAlerts"] = config.gpsLossAlerts;
    doc["safeZoneAlerts"] = config.safeZoneAlerts;
    doc["dailySummaryEnabled"] = config.dailySummaryEnabled;
    doc["lowBatteryThreshold20"] = config.lowBatteryThreshold20;
    doc["lowBatteryThreshold10"] = config.lowBatteryThreshold10;
    doc["lowBatteryThreshold5"] = config.lowBatteryThreshold5;
    doc["gpsLossThreshold"] = config.gpsLossThreshold;
    doc["dailySummaryTime"] = config.dailySummaryTime;
    doc["maxRetries"] = config.maxRetries;
    doc["retryInterval"] = config.retryInterval;
    File file = LittleFS.open(ALERTS_CONFIG_FILE, "w");
    if (!file) return false;
    serializeJson(doc, file);
    file.close();
    return true;
}

AlertConfig getAlertConfig() {
    return alertConfig;
}

// Statistics
void printAlertStats() {
    Serial.println("=== ALERT STATISTICS ===");
    Serial.print("Pending: "); Serial.println(pendingAlertCount);
    Serial.print("History: "); Serial.println(alertHistoryCount);
    Serial.print("Config enabled: "); Serial.println(alertConfig.enabled ? "Yes" : "No");
    Serial.println("========================");
}

// Retry Queued Alerts (called from serviceAlerts and main loop)
void retryQueuedAlerts() {
    unsigned long now = millis();
    for (uint8_t i = 0; i < pendingAlertCount; i++) {
        if (!pendingAlerts[i].acknowledged &&
            pendingAlerts[i].retryCount < alertConfig.maxRetries &&
            (now - pendingAlerts[i].timestamp > alertConfig.retryInterval * (pendingAlerts[i].retryCount + 1))) {
            pendingAlerts[i].retryCount++;
            sendAlertNow(pendingAlerts[i]);
        }
    }
}

// Helper functions (static implementations)
static unsigned long getCurrentHour() {
    // Simple hour calculation from uptime (assuming device started at midnight UTC for simplicity)
    // In a real implementation, you'd use NTP or GPS time
    return (millis() / 3600000) % 24;
}

static float getTotalDistanceToday() {
    // Placeholder - would need to track distance over time
    // For now, return 0 as this requires persistent storage
    return 0.0f;
}

static String getTimeString(unsigned long timestamp) {
    // Format timestamp as HH:MM:SS
    unsigned long seconds = timestamp / 1000;
    unsigned long h = (seconds / 3600) % 24;
    unsigned long m = (seconds / 60) % 60;
    unsigned long s = seconds % 60;
    char buf[16];
    sprintf(buf, "%02lu:%02lu:%02lu", h, m, s);
    return String(buf);
}