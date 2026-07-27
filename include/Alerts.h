#ifndef ALERTS_H
#define ALERTS_H

#include <Arduino.h>
#include <ArduinoJson.h>

/*************************************************
 * Alert Types
 *************************************************/
enum AlertType {
    ALERT_SAFE_ARRIVAL,
    ALERT_SAFE_DEPARTURE,
    ALERT_LOW_BATTERY_20,
    ALERT_LOW_BATTERY_10,
    ALERT_LOW_BATTERY_5,
    ALERT_BATTERY_CRITICAL,
    ALERT_GPS_LOSS,
    ALERT_GPS_RESTORED,
    ALERT_DAILY_SUMMARY,
    ALERT_WIFI_DISCONNECTED,
    ALERT_WIFI_RECONNECTED,
    ALERT_PANIC_BUTTON,
    ALERT_ROUTE_DEVIATION,
    ALERT_SPEED_EXCEEDED,
    ALERT_INACTIVITY,
    ALERT_DEVICE_RESTART,
    ALERT_FIRMWARE_UPDATE,
    ALERT_SAFE_ZONE_CREATED,
    ALERT_CONFIG_CHANGED,
    // Behaviour AI Alert Types
    ALERT_BEHAVIOUR_WARNING,
    ALERT_BEHAVIOUR_EMERGENCY,
    ALERT_BEHAVIOUR_ROUTE_DEVIATION,
    ALERT_BEHAVIOUR_LONG_STOP,
    ALERT_BEHAVIOUR_RUNNING,
    ALERT_BEHAVIOUR_WANDERING,
    ALERT_BEHAVIOUR_SCHOOL_EXIT,
    ALERT_BEHAVIOUR_SAFE_ZONE_EXIT,
    ALERT_BEHAVIOUR_NIGHT_MOVEMENT,
    ALERT_BEHAVIOUR_REPEATED_MOVEMENT,
    ALERT_BEHAVIOUR_UNEXPECTED_MOVEMENT
};

enum AlertPriority {
    ALERT_PRIORITY_LOW = 0,
    ALERT_PRIORITY_NORMAL = 1,
    ALERT_PRIORITY_HIGH = 2,
    ALERT_PRIORITY_CRITICAL = 3
};

struct Alert {
    AlertType type;
    AlertPriority priority;
    String title;
    String message;
    String location;
    unsigned long timestamp;
    bool acknowledged;
    uint8_t retryCount;
    
    Alert() : type(ALERT_SAFE_ARRIVAL), priority(ALERT_PRIORITY_NORMAL),
              timestamp(0), acknowledged(false), retryCount(0) {}
};

struct AlertConfig {
    bool enabled;
    bool telegramEnabled;
    bool webDashboardEnabled;
    bool lowBatteryAlerts;
    bool gpsLossAlerts;
    bool safeZoneAlerts;
    bool dailySummaryEnabled;
    uint8_t lowBatteryThreshold20;
    uint8_t lowBatteryThreshold10;
    uint8_t lowBatteryThreshold5;
    unsigned long gpsLossThreshold;
    unsigned long dailySummaryTime;
    uint8_t maxRetries;
    unsigned long retryInterval;
    
    AlertConfig() : enabled(true), telegramEnabled(true), webDashboardEnabled(true),
                    lowBatteryAlerts(true), gpsLossAlerts(true), safeZoneAlerts(true),
                    dailySummaryEnabled(true), lowBatteryThreshold20(20), lowBatteryThreshold10(10),
                    lowBatteryThreshold5(5), gpsLossThreshold(60000), dailySummaryTime(20),
                    maxRetries(3), retryInterval(30000) {}
};

void initialiseAlerts();
void serviceAlerts();

bool triggerAlert(AlertType type, const String& title, const String& message, 
                  const String& location = "", AlertPriority priority = ALERT_PRIORITY_NORMAL);
bool triggerAlertWithData(AlertType type, const String& title, const String& message, 
                          const String& location, AlertPriority priority, 
                          JsonObject data);

bool sendSafeArrivalAlert(const String& zoneName, const String& location);
bool sendSafeDepartureAlert(const String& zoneName, const String& location);
bool sendLowBatteryAlert(uint8_t batteryPercent, const String& location);
bool sendGPSLossAlert(unsigned long durationMs, const String& location);
bool sendGPSRestoredAlert(const String& location);
bool sendDailySummaryAlert();
bool sendWiFiDisconnectedAlert();
bool sendWiFiReconnectedAlert(const String& ssid);
bool sendPanicButtonAlert(const String& location);
bool sendRouteDeviationAlert(const String& expectedRoute, const String& actualRoute, const String& location);
bool sendSpeedExceededAlert(float speed, float maxSpeed, const String& location);
bool sendInactivityAlert(unsigned long inactiveMs, const String& location);
bool sendDeviceRestartAlert(const String& reason);
bool sendFirmwareUpdateAlert(const String& version, bool success);
bool sendSafeZoneCreatedAlert(const String& zoneName);
bool sendConfigChangedAlert(const String& configName);

// Behaviour AI Alerts
bool sendBehaviourWarningAlert(const String& description, const String& location);
bool sendBehaviourEmergencyAlert(const String& description, const String& location);
bool sendBehaviourRouteDeviationAlert(const String& expectedRoute, const String& actualRoute, const String& location);
bool sendLongStopAlert(unsigned long durationMs, const String& location);
bool sendRunningAlert(float speed, const String& location);
bool sendWanderingAlert(const String& location);
bool sendSchoolExitAlert(const String& location);
bool sendSafeZoneExitAlert(const String& zoneName, const String& location);
bool sendNightMovementAlert(float speed, const String& location);
bool sendRepeatedMovementAlert(uint8_t count, const String& location);
bool sendUnexpectedMovementAlert(const String& location);

// New format functions matching requirements
bool sendLowBatteryAlert(uint8_t batteryPercent);
bool sendSafeArrivalAlert(const String& zoneName, double lat, double lon, uint8_t batteryPercent);
bool sendBehaviourAlert(const String& description, const String& riskLevel, const String& recommendation, double lat, double lon);

uint8_t getPendingAlertCount();
bool hasPendingAlerts();
void acknowledgeAlert(uint8_t index);
bool acknowledgeAndRemoveAlert(uint8_t index);
void clearAcknowledgedAlerts();
void clearAllAlerts();

bool saveAlertHistory();
bool loadAlertHistory();
uint8_t getAlertHistoryCount();
Alert* getAlertHistory(uint8_t index);
void clearAlertHistory();

bool loadAlertConfig(AlertConfig& config);
bool saveAlertConfig(const AlertConfig& config);
AlertConfig getAlertConfig();

void printAlertStats();

// Alert Queue Management
void retryQueuedAlerts();

#endif // ALERTS_H
