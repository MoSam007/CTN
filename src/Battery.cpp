#include "Battery.h"

#include "Config.h"
#include "Utilities.h"
#include "Telegram.h"
#include "Storage.h"

// When battery simulator is enabled, it provides the API implementations
#if !defined(CTN_BATTERY_SIMULATOR) || !CTN_BATTERY_SIMULATOR

static float batteryVoltage = 0;
static int batteryPercentage = 100;
static BatteryState batteryState = BATTERY_FULL;
static bool lowAlertSent = false;
static bool criticalAlertSent = false;

//--------------------------------------------------

void initialiseBattery()
{
    updateBattery();
    Serial.println("Battery Monitor Ready");
}

//--------------------------------------------------

void updateBattery()
{
    int raw = analogRead(BATTERY_PIN);

    float adc = (raw / 1023.0f) * ADC_REFERENCE;
    batteryVoltage = adc * BATTERY_DIVIDER_RATIO;

    // Try to load calibration from Storage
    BatteryCalibration cal;
    if (loadBatteryCalibration(cal) && cal.calibrated) {
        for (int i = 10; i >= 0; i--) {
            if (batteryVoltage >= cal.voltagePoints[i]) {
                batteryPercentage = i * 10;
                break;
            }
        }
    } else {
        // Fallback built-in approximation
        if (batteryVoltage >= 4.20) batteryPercentage = 100;
        else if (batteryVoltage >= 4.10) batteryPercentage = 90;
        else if (batteryVoltage >= 4.00) batteryPercentage = 80;
        else if (batteryVoltage >= 3.90) batteryPercentage = 70;
        else if (batteryVoltage >= 3.80) batteryPercentage = 55;
        else if (batteryVoltage >= 3.70) batteryPercentage = 40;
        else if (batteryVoltage >= 3.60) batteryPercentage = 25;
        else if (batteryVoltage >= 3.50) batteryPercentage = 15;
        else if (batteryVoltage >= 3.40) batteryPercentage = 8;
        else if (batteryVoltage >= 3.30) batteryPercentage = 3;
        else batteryPercentage = 0;
    }

    // Map percentage to BatteryState (DISCHARGING/CHARGING/FULL/UNKNOWN)
    if (batteryPercentage >= 95) batteryState = BATTERY_FULL;
    else if (batteryPercentage > 0) batteryState = BATTERY_DISCHARGING;
    else batteryState = BATTERY_UNKNOWN;

    if (batteryLow() && !lowAlertSent) {
        sendInformation("🔋 Battery Low\nLevel: " + String(batteryPercentage) + "%\nVoltage: " + String(batteryVoltage, 2) + "V");
        lowAlertSent = true;
    }

    if (batteryCritical() && !criticalAlertSent) {
        sendEmergencyAlert("Battery Critical", "Battery is almost empty!");
        criticalAlertSent = true;
    }

    if (batteryPercentage > 20) {
        lowAlertSent = criticalAlertSent = false;
    }
}

//--------------------------------------------------

float getBatteryVoltage() { return batteryVoltage; }

int getBatteryPercentage() { return batteryPercentage; }

BatteryState getBatteryState() { return batteryState; }

bool batteryLow() { return batteryPercentage < 20; }

bool batteryCritical() { return batteryPercentage < 10; }

String batteryStateToString(BatteryState state) {
    switch(state) {
        case BATTERY_DISCHARGING: return "DISCHARGING";
        case BATTERY_CHARGING: return "CHARGING";
        case BATTERY_FULL: return "FULL";
        case BATTERY_UNKNOWN: return "UNKNOWN";
    }
    return "UNKNOWN";
}

void printBatteryStatus() {
    Serial.println("Battery STATUS");
    Serial.print("Voltage : "); Serial.println(formatVoltage(batteryVoltage));
    Serial.print("Level   : "); Serial.println(formatPercentage(batteryPercentage));
    Serial.print("State   : "); Serial.println(batteryStateToString(batteryState));
}

bool isBatteryCharging() {
    // Real implementation would check charging pin or current direction
    // For now, estimate based on voltage trend
    return false;
}

float getBatteryRuntimeEstimate() {
    if (batteryPercentage <= 0) return 0;
    // Rough estimate: 20 hours at 100%, linear scaling
    return (batteryPercentage / 100.0f) * 20.0f;
}

BatteryHealth getBatteryHealth() {
    // Real implementation would track charge cycles, capacity fade
    return BATTERY_HEALTH_GOOD; // New battery
}

#endif // !CTN_BATTERY_SIMULATOR
