#include "BatterySimulator.h"

#include "Config.h"
#include "Logger.h"
#include <ArduinoJson.h>

#include <Arduino.h>

//----------------------------------------------------
// State Variables
//----------------------------------------------------
static bool _simulatorInitialized = false;
static bool _pluggedIn = false;
static float _drainRatePercentPerMin = 1.0;  // Default 1%/min drain

// Simulated battery state
static float _simVoltage = 4.2;       // Start at full charge (4.2V)
static float _simPercentage = 100.0;  // 0-100%
static BatteryState _simState = BATTERY_DISCHARGING;
static BatteryHealth _simHealth = BATTERY_HEALTH_GOOD;
static float _simRuntimeHours = 20.0; // ~20 hours at full charge

// LiPo voltage curve (non-linear): voltage vs percentage
// Typical 3.7V LiPo: 4.2V=100%, 3.7V=50%, 3.3V=0%
static const struct {
    float voltage;
    float percentage;
} _voltageCurve[] = {
    {4.20, 100.0},
    {4.15, 95.0},
    {4.10, 90.0},
    {4.05, 85.0},
    {4.00, 80.0},
    {3.95, 70.0},
    {3.90, 60.0},
    {3.85, 50.0},
    {3.80, 40.0},
    {3.75, 30.0},
    {3.70, 20.0},
    {3.65, 15.0},
    {3.60, 10.0},
    {3.55, 5.0},
    {3.50, 2.0},
    {3.30, 0.0}
};

static const uint8_t _curvePoints = sizeof(_voltageCurve) / sizeof(_voltageCurve[0]);

// Last update time for drain calculation
static unsigned long _lastUpdateMs = 0;

// Charge cycle tracking for health degradation
static float _totalDischarged = 0;
static uint16_t _chargeCycles = 0;

//----------------------------------------------------
// Helper: Interpolate percentage from voltage using LiPo curve
//----------------------------------------------------
static float voltageToPercentage(float voltage) {
    // Clamp voltage
    if (voltage >= 4.20f) return 100.0f;
    if (voltage <= 3.30f) return 0.0f;

    // Find segment in curve
    for (uint8_t i = 0; i < _curvePoints - 1; i++) {
        if (voltage <= _voltageCurve[i].voltage && voltage >= _voltageCurve[i + 1].voltage) {
            float v1 = _voltageCurve[i].voltage;
            float v2 = _voltageCurve[i + 1].voltage;
            float p1 = _voltageCurve[i].percentage;
            float p2 = _voltageCurve[i + 1].percentage;

            // Linear interpolation in this segment
            float t = (voltage - v1) / (v2 - v1);
            return p1 + (p2 - p1) * t;
        }
    }
    return 0.0f;
}

//----------------------------------------------------
// Helper: Interpolate voltage from percentage
//----------------------------------------------------
static float percentageToVoltage(float percentage) {
    if (percentage >= 100.0f) return 4.20f;
    if (percentage <= 0.0f) return 3.30f;

    for (uint8_t i = 0; i < _curvePoints - 1; i++) {
        if (percentage <= _voltageCurve[i].percentage && percentage >= _voltageCurve[i + 1].percentage) {
            float p1 = _voltageCurve[i].percentage;
            float p2 = _voltageCurve[i + 1].percentage;
            float v1 = _voltageCurve[i].voltage;
            float v2 = _voltageCurve[i + 1].voltage;

            float t = (percentage - p1) / (p2 - p1);
            return v1 + (v2 - v1) * t;
        }
    }
    return 3.30f;
}

//----------------------------------------------------
// Public API (mirrors Battery.h exactly)
//----------------------------------------------------

void batterySimulatorBegin() {
    _simulatorInitialized = true;
    _lastUpdateMs = millis();
    _simVoltage = 4.20f;
    _simPercentage = 100.0f;
    _simState = BATTERY_DISCHARGING;
    _simHealth = BATTERY_HEALTH_GOOD;
    _simRuntimeHours = 20.0f;
    _pluggedIn = false;
    _drainRatePercentPerMin = 1.0f;
    _totalDischarged = 0.0f;
    _chargeCycles = 0;

    LOG_INFO(LogModule::BATT, "Battery simulator initialized: %.2fV (%.0f%%)", _simVoltage, _simPercentage);
}

void batterySimulatorUpdate() {
    if (!_simulatorInitialized) return;

    unsigned long now = millis();
    float deltaMinutes = (now - _lastUpdateMs) / 60000.0f;

    if (deltaMinutes <= 0.0f) return;

    if (_pluggedIn) {
        // Charging: ~2% per minute (2 hours for 0-100%)
        float chargeRate = 2.0f; // % per minute
        _simPercentage = min(100.0f, _simPercentage + chargeRate * deltaMinutes);
        _simVoltage = percentageToVoltage(_simPercentage);

        if (_simPercentage >= 100.0f) {
            _simPercentage = 100.0f;
            _simVoltage = 4.20f;
            _simState = BATTERY_FULL;
            _pluggedIn = false; // Auto-unplug when full (simulated)
            _chargeCycles++;
        } else {
            _simState = BATTERY_CHARGING;
        }

        // Charging increases runtime estimate
        _simRuntimeHours = (_simPercentage / 100.0f) * 20.0f;
    } else {
        // Discharging
        float drain = _drainRatePercentPerMin * deltaMinutes;
        _simPercentage = max(0.0f, _simPercentage - drain);
        _simVoltage = percentageToVoltage(_simPercentage);

        if (_simPercentage <= 0.0f) {
            _simPercentage = 0.0f;
            _simVoltage = 3.30f;
            _simState = BATTERY_DISCHARGING; // Dead
        } else {
            _simState = BATTERY_DISCHARGING;
        }

        // Runtime estimate based on current drain rate
        if (_drainRatePercentPerMin > 0.0f) {
            _simRuntimeHours = (_simPercentage / _drainRatePercentPerMin) / 60.0f;
        } else {
            _simRuntimeHours = 0.0f;
        }

        // Health degrades slowly with cycles
        _totalDischarged += drain;
        if (_totalDischarged >= 100.0f) {
            _totalDischarged -= 100.0f;
            _chargeCycles++;
            // Degrade health by 0.5% per full cycle
            if (_simHealth > BATTERY_HEALTH_POOR) {
                _simHealth = (BatteryHealth)(_simHealth + 1);
            }
        }
    }

    _lastUpdateMs = now;
}

float getBatteryVoltage() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simVoltage;
}

int getBatteryPercentage() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return (int)constrain(_simPercentage, 0.0f, 100.0f);
}

BatteryState getBatteryState() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simState;
}

//----------------------------------------------------
// Battery.h API Aliases (for seamless compatibility)
//----------------------------------------------------

bool isBatteryCharging() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _pluggedIn && _simPercentage < 100.0f;
}

float getBatteryRuntimeEstimate() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simRuntimeHours;
}

String batteryStateToString(BatteryState state) {
    switch (state) {
        case BATTERY_FULL: return "Full";
        case BATTERY_CHARGING: return "Charging";
        case BATTERY_DISCHARGING: return "Discharging";
        default: return "Unknown";
    }
}

void printBatteryStatus() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }

    Serial.println("=== Battery Status (SIMULATED) ===");
    Serial.printf("Voltage: %.2fV\n", _simVoltage);
    Serial.printf("Percentage: %d%%\n", (int)_simPercentage);
    Serial.printf("State: %s\n", batteryStateToString(_simState).c_str());
    Serial.printf("Health: %s\n",
        _simHealth == BATTERY_HEALTH_GOOD ? "Good" :
        _simHealth == BATTERY_HEALTH_FAIR ? "Fair" : "Poor");
    Serial.printf("Runtime: %.1f hours\n", _simRuntimeHours);
    Serial.printf("Plugged: %s\n", _pluggedIn ? "Yes" : "No");
    Serial.printf("Drain Rate: %.1f%%/min\n", _drainRatePercentPerMin);
    Serial.printf("Charge Cycles: %d\n", _chargeCycles);
    Serial.println("================================");
}

bool batteryLow() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simPercentage <= 20.0f;
}

bool batteryCritical() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simPercentage <= 5.0f;
}

//----------------------------------------------------
// Simulator Control Functions
//----------------------------------------------------

void batterySimulatorSetPlugged(bool plugged) {
    _pluggedIn = plugged;

    if (plugged && _simPercentage < 100.0f) {
        _simState = BATTERY_CHARGING;
        LOG_INFO(LogModule::BATT, "Battery simulator: Plugged in (charging)");
    } else if (!plugged) {
        _simState = BATTERY_DISCHARGING;
        LOG_INFO(LogModule::BATT, "Battery simulator: Unplugged (discharging)");
    }

    // If full and plugged, show FULL state
    if (plugged && _simPercentage >= 100.0f) {
        _simState = BATTERY_FULL;
    }
}

void batterySimulatorSetDrainRate(float percentPerMin) {
    _drainRatePercentPerMin = constrain(percentPerMin, 0.1f, 50.0f);
    LOG_DEBUG(LogModule::BATT, "Battery simulator drain rate: %.1f%%/min", _drainRatePercentPerMin);
}

void batterySimulatorSetHealth(BatteryHealth health) {
    _simHealth = health;
}

void batterySimulatorSetPercentage(uint8_t percent) {
    _simPercentage = constrain((float)percent, 0.0f, 100.0f);
    _simVoltage = percentageToVoltage(_simPercentage);
    LOG_DEBUG(LogModule::BATT, "Battery simulator set: %d%% (%.2fV)", percent, _simVoltage);
}

void batterySimulatorReset() {
    _simVoltage = 4.20f;
    _simPercentage = 100.0f;
    _simState = BATTERY_DISCHARGING;
    _simHealth = BATTERY_HEALTH_GOOD;
    _simRuntimeHours = 20.0f;
    _pluggedIn = false;
    _drainRatePercentPerMin = 1.0f;
    _totalDischarged = 0.0f;
    _chargeCycles = 0;
    _lastUpdateMs = millis();
    LOG_INFO(LogModule::BATT, "Battery simulator reset to full charge");
}

//----------------------------------------------------
// Demo Mode Injection Functions
//----------------------------------------------------

void batteryInjectPercentage(uint8_t percent) {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    batterySimulatorSetPercentage(percent);
}

uint8_t batterySimulatorGetPercent() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return (uint8_t)constrain(_simPercentage, 0.0f, 100.0f);
}

//----------------------------------------------------
// Additional Helper Functions
//----------------------------------------------------

BatteryHealth getBatteryHealth() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simHealth;
}

float getBatteryRuntimeHours() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _simRuntimeHours;
}

bool batteryIsCharging() {
    if (!_simulatorInitialized) {
        batterySimulatorBegin();
    }
    return _pluggedIn && _simPercentage < 100.0f;
}

String batterySimulatorGetStatusJson() {
    JsonDocument doc;
    doc["initialized"] = _simulatorInitialized;
    doc["voltage"] = _simVoltage;
    doc["percentage"] = _simPercentage;
    doc["state"] = (int)_simState;
    doc["stateStr"] = batteryStateToString(_simState);
    doc["health"] = (int)_simHealth;
    doc["healthStr"] = (_simHealth == BATTERY_HEALTH_GOOD) ? "Good" :
                       (_simHealth == BATTERY_HEALTH_FAIR) ? "Fair" : "Poor";
    doc["runtimeHours"] = _simRuntimeHours;
    doc["pluggedIn"] = _pluggedIn;
    doc["drainRatePercentPerMin"] = _drainRatePercentPerMin;
    doc["chargeCycles"] = _chargeCycles;

    String json;
    serializeJson(doc, json);
    return json;
}

//----------------------------------------------------
// Battery.h API Aliases (match Battery.h API exactly for drop-in replacement)
//----------------------------------------------------

void initialiseBattery() {
    batterySimulatorBegin();
}

void updateBattery() {
    batterySimulatorUpdate();
}

//----------------------------------------------------
// Battery.h API implementations (isBatteryCharging, getBatteryRuntimeEstimate, getBatteryHealth)