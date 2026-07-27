#ifndef BEHAVIOUR_H
#define BEHAVIOUR_H

#include <Arduino.h>
#include "Storage.h"

/*************************************************
 * Behaviour AI Engine - Child Behaviour Analysis
 * Learns normal routines and detects anomalies
 *************************************************/

//--------------------------------------------------
// Behaviour States
//--------------------------------------------------
enum BehaviourState
{
    SAFE,           // Normal behaviour, within expected patterns
    WATCH,          // Slightly anomalous, monitoring closely
    WARNING,        // Significant anomaly detected
    EMERGENCY       // Critical anomaly or panic
};

//--------------------------------------------------
// Anomaly Types (for detailed alerting)
//--------------------------------------------------
enum AnomalyType
{
    ANOMALY_NONE = 0,
    ANOMALY_ROUTE_DEVIATION,
    ANOMALY_LONG_STOP,
    ANOMALY_RUNNING,
    ANOMALY_WANDERING,
    ANOMALY_LEAVING_SCHOOL_UNEXPECTEDLY,
    ANOMALY_LEAVING_SAFE_ZONE,
    ANOMALY_NIGHT_MOVEMENT,
    ANOMALY_SUSPICIOUS_REPEATED_MOVEMENT,
    ANOMALY_UNEXPECTED_MOVEMENT
};

//--------------------------------------------------
// Anomaly Event Structure
//--------------------------------------------------
struct AnomalyEvent
{
    AnomalyType type;
    uint8_t confidence;           // 0-100% confidence
    String description;           // Human-readable description
    double latitude;              // Location of anomaly
    double longitude;
    unsigned long timestamp;      // When detected
    unsigned long duration;       // Duration (for long stops)
    float speed;                  // Speed at detection
    bool acknowledged;

    AnomalyEvent() : type(ANOMALY_NONE), confidence(0), latitude(0), longitude(0),
                     timestamp(0), duration(0), speed(0), acknowledged(false) {}
};

//--------------------------------------------------
// Route Point (for learned routes)
//--------------------------------------------------
struct RoutePoint
{
    double latitude;
    double longitude;
    unsigned long typicalTime;    // Minutes from midnight when typically here
    float typicalSpeed;           // Typical speed at this point
    uint8_t visitCount;           // How many times visited
    String zoneName;              // "Home", "School", "Route"

    RoutePoint() : latitude(0), longitude(0), typicalTime(0), typicalSpeed(0),
                   visitCount(0), zoneName("") {}
};

//--------------------------------------------------
// Behaviour Configuration
//--------------------------------------------------
struct BehaviourConfig
{
    bool enabled;                     // Master enable
    String sensitivity;               // "low", "medium", "high"
    float maxWalkingSpeed;            // Max walking speed (km/h)
    float runningSpeedThreshold;      // Speed considered "running" (km/h)

    // Learning parameters
    uint8_t minVisitsToLearn;       // Min visits to consider location "learned"
    float learningRate;             // How fast to adapt (0-1.0)
    unsigned long routeTimeout;     // Max time between route points

    // Anomaly thresholds
    float maxDeviationDistance;     // Max meters from learned route
    unsigned long maxStopDuration;  // Max seconds stopped before anomaly
    float wanderingSpeedThreshold;  // Speed considered "wandering" (km/h)
    unsigned long nightStartHour;   // Hour when night starts (0-23)
    unsigned long nightEndHour;     // Hour when night ends (0-23)
    uint8_t maxRepeatedMovements;   // Max same movement before suspicious

    // State machine thresholds
    uint8_t watchThreshold;         // Risk score for WATCH
    uint8_t warningThreshold;       // Risk score for WARNING
    uint8_t emergencyThreshold;     // Risk score for EMERGENCY

    // Alert settings
    bool enableRouteDeviationAlerts;
    bool enableLongStopAlerts;
    bool enableRunningAlerts;
    bool enableWanderingAlerts;
    bool enableSchoolAlerts;
    bool enableSafeZoneAlerts;
    bool enableNightMovementAlerts;
    bool enableRepeatedMovementAlerts;

    BehaviourConfig() : enabled(true), sensitivity("medium"), maxWalkingSpeed(7.0), runningSpeedThreshold(12.0),
                        minVisitsToLearn(3), learningRate(0.1), routeTimeout(300000),
                        maxDeviationDistance(50.0), maxStopDuration(300000),  // 5 min
                        wanderingSpeedThreshold(2.0),
                        nightStartHour(22), nightEndHour(6),
                        maxRepeatedMovements(5),
                        watchThreshold(70), warningThreshold(50), emergencyThreshold(30),
                        enableRouteDeviationAlerts(true), enableLongStopAlerts(true),
                        enableRunningAlerts(true), enableWanderingAlerts(true),
                        enableSchoolAlerts(true), enableSafeZoneAlerts(true),
                        enableNightMovementAlerts(true), enableRepeatedMovementAlerts(true) {}
};

//--------------------------------------------------
// Behaviour Statistics
//--------------------------------------------------
struct BehaviourStats
{
    unsigned long totalUpdates;
    unsigned long anomaliesDetected;
    unsigned long alertsSent;
    unsigned long homeVisits;
    unsigned long schoolVisits;
    unsigned long routePointsLearned;
    float averageWalkingSpeed;
    unsigned long lastAnomalyTime;
    AnomalyType lastAnomalyType;

    BehaviourStats() : totalUpdates(0), anomaliesDetected(0), alertsSent(0),
                       homeVisits(0), schoolVisits(0), routePointsLearned(0),
                       averageWalkingSpeed(0), lastAnomalyTime(0), lastAnomalyType(ANOMALY_NONE) {}
};

//--------------------------------------------------
// Initialisation
//--------------------------------------------------
void initialiseBehaviour();

//--------------------------------------------------
// Main Behaviour Loop
//--------------------------------------------------
void updateBehaviour();

//--------------------------------------------------
// Panic
//--------------------------------------------------
void panicAlert();

//--------------------------------------------------
// Debug & Status
//--------------------------------------------------
void printBehaviourStatus();
void printBehaviourStats();
void printLearnedRoutes();
void printAnomalyHistory();

//--------------------------------------------------
// Getters
//--------------------------------------------------
int getRiskScore();
BehaviourState getBehaviourState();
String behaviourStateToString(BehaviourState state);
uint8_t getAnomalyCount();
AnomalyEvent* getAnomalyEvent(uint8_t index);
void clearAnomalyHistory();

//--------------------------------------------------
// Configuration
//--------------------------------------------------
bool loadBehaviourConfig(BehaviourConfig& config);
bool saveBehaviourConfig(const BehaviourConfig& config);
BehaviourConfig getBehaviourConfig();

//--------------------------------------------------
// Learned Locations
//--------------------------------------------------
bool isHomeLearned();
bool isSchoolLearned();
RoutePoint getHomeLocation();
RoutePoint getSchoolLocation();

//--------------------------------------------------
// Learned Routes
//--------------------------------------------------
#define MAX_ROUTE_POINTS 50
bool loadLearnedRoutes(RoutePoint* routes, uint8_t& count, uint8_t maxCount);

//--------------------------------------------------
// Manual Triggers (for testing)
//--------------------------------------------------
bool triggerTestAnomaly(AnomalyType type, const String& description);
void simulateRouteDeviation();
void simulateLongStop();
void simulateRunning();

//--------------------------------------------------
// Demo Mode Injection API
//--------------------------------------------------
void behaviourInjectRiskScore(int riskScore);
void behaviourInjectAnomaly(AnomalyType type);
int behaviourGetRiskScore();
void behaviourSetDemoMode(bool enabled);

#endif // BEHAVIOUR_H