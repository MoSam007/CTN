#include "GPS.h"
#include "Config.h"
#include "Logger.h"

SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus gps;

//----------------------------------------------------
// Statistics tracking
//----------------------------------------------------
static unsigned long gpsCharsProcessed = 0;
static unsigned long gpsSentencesWithFix = 0;
static unsigned long gpsFailedChecksum = 0;
static unsigned long gpsLastFixTime = 0;
static unsigned long gpsStatsLastPrint = 0;
static bool gpsHardwareOK = false;

//----------------------------------------------------
// Initialise GPS
//----------------------------------------------------
void initialiseGPS()
{
    gpsSerial.begin(GPS_BAUDRATE);

    Serial.println();
    Serial.println("Initialising GPS (NEO-6M)...");
    Serial.print("RX Pin: "); Serial.println(GPS_RX_PIN);
    Serial.print("TX Pin: "); Serial.println(GPS_TX_PIN);
    Serial.print("Baudrate: "); Serial.println(GPS_BAUDRATE);
    Serial.println("Waiting for satellite fix...");

    // Quick hardware check
    gpsHardwareOK = true;
    resetGPSStats();
}

//----------------------------------------------------
// Read GPS Continuously
//----------------------------------------------------
void updateGPS()
{
    while (gpsSerial.available())
    {
        char c = gpsSerial.read();
        gpsCharsProcessed++;

        if (gps.encode(c))
        {
            // Valid sentence parsed
            if (gps.location.isValid())
            {
                gpsSentencesWithFix++;
                gpsLastFixTime = millis();
            }
        }
        else
        {
            // Check for checksum failures
            if (gps.failedChecksum() > gpsFailedChecksum)
            {
                gpsFailedChecksum = gps.failedChecksum();
            }
        }

#if GPS_DEBUG_NMEA
        if (c == '\n')
        {
            // We'd need to buffer the sentence to print it
            // This is a simplified version - just log the char
        }
#endif
    }

    // Periodic stats logging
    if (millis() - gpsStatsLastPrint > GPS_DEBUG_STATS_INTERVAL)
    {
        printGPSStats();
        gpsStatsLastPrint = millis();
    }
}

//----------------------------------------------------
// Accessors
//----------------------------------------------------

double getLatitude()
{
    if (gps.location.isValid())
        return gps.location.lat();

    return 0.0;
}

double getLongitude()
{
    if (gps.location.isValid())
        return gps.location.lng();

    return 0.0;
}

double getSpeed()
{
    if (gps.speed.isValid())
        return gps.speed.kmph();

    return 0.0;
}

double getAltitude()
{
    if (gps.altitude.isValid())
        return gps.altitude.meters();

    return 0.0;
}

double getCourse()
{
    if (gps.course.isValid())
        return gps.course.deg();

    return 0.0;
}

uint32_t getSatelliteCount()
{
    if (gps.satellites.isValid())
        return gps.satellites.value();

    return 0;
}

double getHDOP()
{
    if (gps.hdop.isValid())
        return gps.hdop.hdop();

    return 99.9;
}

bool gpsHasFix()
{
    return gps.location.isValid();
}

bool gpsLocationValid()
{
    return gps.location.isValid();
}

bool gpsTimeValid()
{
    return gps.time.isValid();
}

//----------------------------------------------------
// Google Maps URL
//----------------------------------------------------
String getGoogleMapsLink()
{
    if (!gps.location.isValid())
        return "No GPS Fix";

    String url = "https://maps.google.com/?q=";
    url += String(getLatitude(), 6);
    url += ",";
    url += String(getLongitude(), 6);

    return url;
}

//----------------------------------------------------
// Debug Information
//----------------------------------------------------
void printGPSStatus()
{
    Serial.println();
    Serial.println("================ GPS STATUS ================");

    if (!gps.location.isValid())
    {
        Serial.println("Status      : Waiting for Fix...");
        Serial.print("Satellites  : ");
        Serial.println(getSatelliteCount());
        Serial.print("Chars recv  : ");
        Serial.println(gpsCharsProcessed);
        Serial.print("Failed CS   : ");
        Serial.println(gpsFailedChecksum);
        Serial.println("============================================");
        return;
    }

    Serial.print("Latitude    : ");
    Serial.println(getLatitude(), 6);

    Serial.print("Longitude   : ");
    Serial.println(getLongitude(), 6);

    Serial.print("Altitude    : ");
    Serial.print(getAltitude());
    Serial.println(" m");

    Serial.print("Speed       : ");
    Serial.print(getSpeed());
    Serial.println(" km/h");

    Serial.print("Heading     : ");
    Serial.print(getCourse());
    Serial.println(" deg");

    Serial.print("Satellites  : ");
    Serial.println(getSatelliteCount());

    Serial.print("HDOP        : ");
    Serial.println(getHDOP());

    Serial.print("Google Maps : ");
    Serial.println(getGoogleMapsLink());

    printGPSFixQuality();

    Serial.println("============================================");
}

void printGPSDebugInfo()
{
    Serial.println();
    Serial.println("========== GPS DEBUG INFO ==========");

    // Basic status
    Serial.print("Fix Valid   : ");
    Serial.println(gps.location.isValid() ? "YES" : "NO");

    Serial.print("Location Age: ");
    Serial.print(gps.location.age());
    Serial.println(" ms");

    Serial.print("Time Valid  : ");
    Serial.println(gps.time.isValid() ? "YES" : "NO");

    Serial.print("Time Age    : ");
    Serial.print(gps.time.age());
    Serial.println(" ms");

    Serial.print("Date Valid  : ");
    Serial.println(gps.date.isValid() ? "YES" : "NO");

    Serial.print("Date Age    : ");
    Serial.print(gps.date.age());
    Serial.println(" ms");

    Serial.print("Speed Valid : ");
    Serial.println(gps.speed.isValid() ? "YES" : "NO");

    Serial.print("Course Valid: ");
    Serial.println(gps.course.isValid() ? "YES" : "NO");

    Serial.print("Alt Valid   : ");
    Serial.println(gps.altitude.isValid() ? "YES" : "NO");

    Serial.print("Sat Valid   : ");
    Serial.println(gps.satellites.isValid() ? "YES" : "NO");

    Serial.print("HDOP Valid  : ");
    Serial.println(gps.hdop.isValid() ? "YES" : "NO");

    // Raw data counts
    Serial.print("Chars Proc  : ");
    Serial.println(gpsCharsProcessed);

    Serial.print("Sentences OK: ");
    Serial.println(gps.sentencesWithFix());

    Serial.print("Failed CS   : ");
    Serial.println(gps.failedChecksum());

    Serial.print("Passed CS   : ");
    Serial.println(gps.passedChecksum());

    // Time since last fix
    if (gpsLastFixTime > 0)
    {
        Serial.print("Time Fix    : ");
        Serial.print((millis() - gpsLastFixTime) / 1000);
        Serial.println(" sec ago");
    }

    // GPS fix quality
    printGPSFixQuality();

    Serial.println("====================================");
}

void printGPSSatelliteInfo()
{
    Serial.println();
    Serial.println("========== GPS SATELLITE INFO ==========");

    if (!gps.satellites.isValid())
    {
        Serial.println("No satellite data available");
        Serial.println("=========================================");
        return;
    }

    Serial.print("Satellites in view: ");
    Serial.println(gps.satellites.value());

    // TinyGPS++ doesn't expose individual satellite data (SNR, elevation, azimuth)
    // This would require parsing raw NMEA GSV sentences
    Serial.println("Note: Individual satellite SNR/Elevation/Azimuth");
    Serial.println("      requires raw NMEA GSV parsing (not in TinyGPS++)");

    Serial.println("=========================================");
}

void printGPSFixQuality()
{
    Serial.println("--- Fix Quality Metrics ---");

    // HDOP interpretation
    double hdop = getHDOP();
    Serial.print("HDOP: ");
    Serial.print(hdop);
    if (hdop < 1.0) Serial.println(" [Excellent]");
    else if (hdop < 2.0) Serial.println(" [Good]");
    else if (hdop < 5.0) Serial.println(" [Moderate]");
    else if (hdop < 10.0) Serial.println(" [Poor]");
    else Serial.println(" [Very Poor]");

    // Location precision estimate
    if (gps.location.isValid())
    {
        // Rough accuracy estimate: HDOP * 1.5m (typical GPS accuracy)
        double estAccuracy = hdop * 1.5;
        Serial.print("Est. Accuracy: ~");
        Serial.print(estAccuracy, 1);
        Serial.println(" meters");
    }

    // Fix age
    unsigned long fixAge = gps.location.age();
    if (fixAge < 1000) Serial.println("Fix Age: < 1 sec [Current]");
    else if (fixAge < 5000) Serial.println("Fix Age: 1-5 sec [Recent]");
    else if (fixAge < 30000) Serial.println("Fix Age: 5-30 sec [Stale]");
    else Serial.println("Fix Age: > 30 sec [Very Stale]");

    // Satellite count quality
    uint32_t sats = getSatelliteCount();
    Serial.print("Satellites: ");
    Serial.print(sats);
    if (sats >= 10) Serial.println(" [Excellent]");
    else if (sats >= 7) Serial.println(" [Good]");
    else if (sats >= 4) Serial.println(" [Minimum]");
    else Serial.println(" [Insufficient]");
}

void printGPSRawNMEA()
{
    Serial.println();
    Serial.println("========== RAW NMEA SENTENCES ==========");
    Serial.println("Note: Enable GPS_DEBUG_NMEA in GPS.h for");
    Serial.println("      real-time NMEA sentence logging");
    Serial.println("=========================================");
}

void printGPSStats()
{
    static unsigned long lastTotalSentences = 0;
    unsigned long currentTotal = gps.sentencesWithFix() + gps.failedChecksum() + gps.passedChecksum();

    if (gpsCharsProcessed == 0 && currentTotal == 0)
        return; // No data yet

    Serial.println();
    Serial.println("========== GPS STATISTICS ==========");
    Serial.print("Chars Processed : ");
    Serial.println(gpsCharsProcessed);
    Serial.print("Total Sentences : ");
    Serial.println(currentTotal);
    Serial.print("  With Fix      : ");
    Serial.println(gps.sentencesWithFix());
    Serial.print("  Passed CS     : ");
    Serial.println(gps.passedChecksum());
    Serial.print("  Failed CS     : ");
    Serial.println(gps.failedChecksum());
    Serial.print("Fix Quality     : ");
    if (gps.location.isValid()) Serial.println("VALID");
    else Serial.println("NO FIX");
    Serial.print("Sats in View    : ");
    Serial.println(getSatelliteCount());
    Serial.print("HDOP            : ");
    Serial.println(getHDOP());
    if (gpsLastFixTime > 0)
    {
        Serial.print("Last Fix        : ");
        Serial.print((millis() - gpsLastFixTime) / 1000);
        Serial.println(" sec ago");
    }
    Serial.println("=====================================");

    lastTotalSentences = currentTotal;
}

void resetGPSStats()
{
    gpsCharsProcessed = 0;
    gpsSentencesWithFix = 0;
    gpsFailedChecksum = 0;
    gpsLastFixTime = 0;
    gpsStatsLastPrint = millis();
    Serial.println("GPS statistics reset");
}

//----------------------------------------------------
// GPS Health Check
//----------------------------------------------------
bool isGPSHardwareOK()
{
    // Check if we're receiving any data at all
    if (gpsCharsProcessed == 0 && millis() > 10000)
    {
        LOG_WARN(LogModule::GPS, "No GPS data received after 10s - check wiring");
        gpsHardwareOK = false;
    }
    else if (gpsCharsProcessed > 0)
    {
        gpsHardwareOK = true;
    }

    return gpsHardwareOK;
}

unsigned long getGPSTimeSinceFix()
{
    if (gpsLastFixTime == 0)
        return 0xFFFFFFFF; // Never had a fix
    return millis() - gpsLastFixTime;
}

unsigned long getGPSCharsProcessed()
{
    return gpsCharsProcessed;
}

unsigned long getGPSSentencesWithFix()
{
    return gpsSentencesWithFix;
}

unsigned long getGPSFailedChecksum()
{
    return gpsFailedChecksum;
}