#ifndef GPS_H
#define GPS_H

#include <Arduino.h>
#include <TinyGPS++.h>
#include <SoftwareSerial.h>

//----------------------------------------------------
// GPS Debug Configuration
//----------------------------------------------------
#define GPS_DEBUG_VERBOSE 1       // Enable verbose GPS logging
#define GPS_DEBUG_NMEA 1          // Enable raw NMEA sentence logging (verbose)
#define GPS_DEBUG_STATS_INTERVAL 15000  // Stats logging interval (ms)

//----------------------------------------------------
// Public Functions
//----------------------------------------------------

void initialiseGPS();
void updateGPS();
void printGPSStatus();

//----------------------------------------------------
// GPS Data Accessors
//----------------------------------------------------

double getLatitude();
double getLongitude();
double getSpeed();
double getAltitude();
double getCourse();

uint32_t getSatelliteCount();
double getHDOP();

bool gpsHasFix();
bool gpsLocationValid();
bool gpsTimeValid();

String getGoogleMapsLink();

//----------------------------------------------------
// GPS Debug Functions
//----------------------------------------------------

void printGPSDebugInfo();              // Detailed debug info
void printGPSRawNMEA();                // Print raw NMEA sentences
void printGPSSatelliteInfo();          // Satellite details (SNR, elevation, azimuth)
void printGPSFixQuality();             // Fix quality metrics
void printGPSStats();                  // Statistics summary
void resetGPSStats();                  // Reset statistics counters

//----------------------------------------------------
// GPS Health Check
//----------------------------------------------------

bool isGPSHardwareOK();               // Hardware connectivity check
unsigned long getGPSTimeSinceFix();   // Time since last valid fix
unsigned long getGPSCharsProcessed(); // Total chars processed
unsigned long getGPSSentencesWithFix(); // Valid sentences count
unsigned long getGPSFailedChecksum(); // Failed checksum count

#endif