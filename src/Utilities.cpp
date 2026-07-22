#include "Utilities.h"

#include <math.h>
#include <ctype.h>

//----------------------------------------------------

double haversine(
    double lat1,
    double lon1,
    double lat2,
    double lon2)
{
    const double R = 6371000.0;

    double dLat = radians(lat2-lat1);
    double dLon = radians(lon2-lon1);

    double a =
        sin(dLat/2)*sin(dLat/2) +
        cos(radians(lat1)) *
        cos(radians(lat2)) *
        sin(dLon/2) *
        sin(dLon/2);

    return 2*R*atan2(sqrt(a),sqrt(1-a));
}

//----------------------------------------------------

String urlEncode(const String& text)
{
    String encoded;

    char buffer[4];

    for(unsigned int i=0;i<text.length();i++)
    {
        char c=text[i];

        if(isalnum((unsigned char)c))
            encoded+=c;

        else if(c==' ')
            encoded+="%20";

        else
        {
            sprintf(buffer,"%%%02X",(unsigned char)c);
            encoded+=buffer;
        }
    }

    return encoded;
}

//----------------------------------------------------

float clampFloat(
    float value,
    float minimum,
    float maximum)
{
    if(value<minimum)
        return minimum;

    if(value>maximum)
        return maximum;

    return value;
}

//----------------------------------------------------

int clampInt(
    int value,
    int minimum,
    int maximum)
{
    if(value<minimum)
        return minimum;

    if(value>maximum)
        return maximum;

    return value;
}

//----------------------------------------------------

float mapFloat(
    float x,
    float in_min,
    float in_max,
    float out_min,
    float out_max)
{
    return (x-in_min)*
    (out_max-out_min)/
    (in_max-in_min)+
    out_min;
}

//----------------------------------------------------

String formatVoltage(float voltage)
{
    return String(voltage,2)+" V";
}

//----------------------------------------------------

String formatPercentage(int percentage)
{
    return String(percentage)+"%";
}