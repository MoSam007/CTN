#ifndef UTILITIES_H
#define UTILITIES_H

#include <Arduino.h>

//----------------------------------------------------
// Distance
//----------------------------------------------------

double haversine(
    double lat1,
    double lon1,
    double lat2,
    double lon2);

//----------------------------------------------------
// URL
//----------------------------------------------------

String urlEncode(const String& text);

//----------------------------------------------------
// Maths
//----------------------------------------------------

float clampFloat(
    float value,
    float minimum,
    float maximum);

int clampInt(
    int value,
    int minimum,
    int maximum);

//----------------------------------------------------
// Mapping
//----------------------------------------------------

float mapFloat(
    float x,
    float in_min,
    float in_max,
    float out_min,
    float out_max);

//----------------------------------------------------
// Formatting
//----------------------------------------------------

String formatVoltage(float voltage);

String formatPercentage(int percentage);

#endif