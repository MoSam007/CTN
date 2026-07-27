#ifndef BATTERY_SIMULATOR_H
#define BATTERY_SIMULATOR_H

#include <Arduino.h>
#include "Battery.h"

/*************************************************
 * Battery Simulator
 * Mirrors the exact API of Battery.h for seamless
 * transition when real hardware (voltage divider) is added.
 *************************************************/

// BatteryState and BatteryHealth enums are now defined in Battery.h
// Re-use BatteryState enum from Battery.h
#ifndef BATTERY_H
enum BatteryState
{
    BATTERY_DISCHARGING,
    BATTERY_CHARGING,
    BATTERY_FULL,
    BATTERY_UNKNOWN
};
#endif

//--------------------------------------------------
// Public API (mirrors Battery.h exactly)
//--------------------------------------------------
void batterySimulatorBegin();          // Replaces initialiseBattery()
void batterySimulatorUpdate();         // Replaces updateBattery()

float batteryGetVoltage();             // Same as Battery.h getBatteryVoltage()
uint8_t batteryGetPercentage();        // Same as Battery.h getBatteryPercentage()
BatteryState batteryGetState();        // Same as Battery.h getBatteryState()
String batteryStateToString(BatteryState state); // Same as Battery.h
void printBatteryStatus();             // Same as Battery.h

bool batteryLow();                     // Same as Battery.h
bool batteryCritical();                // Same as Battery.h

//--------------------------------------------------
// Simulator Control (for Demo Mode)
//--------------------------------------------------
void batterySimulatorSetPlugged(bool plugged);
void batterySimulatorSetDrainRate(float percentPerMin);
void batterySimulatorSetHealth(BatteryHealth health);
void batterySimulatorSetPercentage(uint8_t percent);
void batterySimulatorReset();

// Alternate names for DemoMode compatibility
void batterySimulatorSetDrainRatePercentPerMin(float percentPerMin);
void batterySimulatorSetPercent(uint8_t percent);
bool batterySimulatorGetPlugged();
uint8_t batterySimulatorGetPercent();

// Demo injection aliases
void batteryInjectPercentage(uint8_t percent);

//--------------------------------------------------
// Additional helper functions
//--------------------------------------------------
BatteryHealth getBatteryHealth();
float getBatteryRuntimeHours();
bool batteryIsCharging();
String batterySimulatorGetStatusJson();

// Aliases to match Battery.h naming convention exactly
float getBatteryVoltage();
int getBatteryPercentage();
BatteryState getBatteryState();
bool isBatteryCharging();
float getBatteryRuntimeEstimate();

#endif // BATTERY_SIMULATOR_H