#ifndef BATTERY_H
#define BATTERY_H

#include <Arduino.h>

enum BatteryState
{
    BATTERY_DISCHARGING,
    BATTERY_CHARGING,
    BATTERY_FULL,
    BATTERY_UNKNOWN
};

// Battery health
enum BatteryHealth
{
    BATTERY_HEALTH_GOOD,
    BATTERY_HEALTH_FAIR,
    BATTERY_HEALTH_POOR
};

void initialiseBattery();

void updateBattery();

float getBatteryVoltage();

int getBatteryPercentage();

BatteryState getBatteryState();

String batteryStateToString(
    BatteryState state);

void printBatteryStatus();

bool batteryLow();

bool batteryCritical();

// Battery Health & Runtime (for advanced monitoring)
bool isBatteryCharging();

float getBatteryRuntimeEstimate();  // Estimated hours remaining
BatteryHealth getBatteryHealth();   // Health enum: GOOD/FAIR/POOR

#endif