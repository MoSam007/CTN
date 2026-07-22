#ifndef BATTERY_H
#define BATTERY_H

#include <Arduino.h>

enum BatteryState
{
    BATTERY_FULL,
    BATTERY_GOOD,
    BATTERY_NORMAL,
    BATTERY_LOW,
    BATTERY_CRITICAL
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

#endif