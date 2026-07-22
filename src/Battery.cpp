#include "Battery.h"

#include "Config.h"
#include "Utilities.h"
#include "Telegram.h"
#include "Storage.h"

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

    if (batteryPercentage >= 80) batteryState = BATTERY_FULL;
    else if (batteryPercentage >= 60) batteryState = BATTERY_GOOD;
    else if (batteryPercentage >= 40) batteryState = BATTERY_NORMAL;
    else if (batteryPercentage >= 20) batteryState = BATTERY_LOW;
    else batteryState = BATTERY_CRITICAL;

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
        case BATTERY_FULL: return "FULL";
        case BATTERY_GOOD: return "GOOD";
        case BATTERY_NORMAL: return "NORMAL";
        case BATTERY_LOW: return "LOW";
        case BATTERY_CRITICAL: return "CRITICAL";
    }
    return "UNKNOWN";
}

void printBatteryStatus() {
    Serial.println("Battery STATUS");
    Serial.print("Voltage : "); Serial.println(formatVoltage(batteryVoltage));
    Serial.print("Level   : "); Serial.println(formatPercentage(batteryPercentage));
    Serial.print("State   : "); Serial.println(batteryStateToString(batteryState));
}
