#ifndef DEMO_MODE_H
#define DEMO_MODE_H

#include <Arduino.h>
#include <ArduinoJson.h>

/*************************************************
 * Demo Mode - Simulated Data for Hackathon Demo
 * Provides realistic GPS walks, behaviour anomalies,
 * battery drain, and scripted alerts when hardware unavailable
 *************************************************/

//--------------------------------------------------
// Demo Scenarios (matching hackathon demo requirements)
//--------------------------------------------------
enum DemoScenario
{
    DEMO_IDLE = 0,
    DEMO_WALK_TO_SCHOOL,
    DEMO_ROUTE_DEVIATION,
    DEMO_PANIC_BUTTON,
    DEMO_LOW_BATTERY,
    DEMO_NIGHT_WANDERING,
    DEMO_SAFE_ARRIVAL,
    DEMO_MAX
};

//--------------------------------------------------
// Public API
//--------------------------------------------------
void demoModeBegin();
void demoModeLoop();
void demoModeSetScenario(DemoScenario scenario);
void demoModeSetScenarioByName(const String& name);
void demoModeStop();
bool demoModeIsActive();
String demoModeGetStatusJson();

void demoModeInjectGPS(double lat, double lon, float speed, float course);
void demoModeInjectBattery(uint8_t percent);
void demoModeInjectBehaviour(int riskScore, uint8_t anomalyType);
void demoModeTriggerAlert(uint8_t alertType);

void demoModeSetPlugged(bool plugged);
void demoModeSetDrainRate(float percentPerMin);
void demoModeSetBatteryDrainEnabled(bool enabled);
void demoModeSetCustomDrainRate(float rate);

// Scenario name lookup
const char* demoScenarioToString(DemoScenario scenario);

// WebSocket command handler (for frontend demo control)
void demoModeHandleWSCommand(JsonDocument& doc);

#endif // DEMO_MODE_H