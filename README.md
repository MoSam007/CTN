# CTN - Child Tracking Necklace

A professional-grade IoT child safety tracking system built on ESP8266 (NodeMCU/ESP-12E) featuring dual dashboards: an **AP Configuration Dashboard** served directly from the device's LittleFS filesystem, and a **Parent Web Dashboard** for cloud-hosted monitoring with interactive maps and geofencing.

![CTN Dashboard Preview](docs/images/dashboard-preview.png)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Hardware Requirements](#hardware-requirements)
- [Software Stack](#software-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Firmware API Reference](#firmware-api-reference)
- [Dashboard Documentation](#dashboard-documentation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Core Firmware Capabilities
- **Dual WiFi Mode**: Station mode with multi-network priority + automatic AP fallback for initial setup
- **Commercial-grade WiFiManager**: Background scanning, auto-reconnect, connection health monitoring, signal quality reporting
- **GPS Tracking**: NMEA parsing via TinyGPS++, satellite count, HDOP, accuracy, speed, heading, altitude
- **Battery Management**: ADC-based voltage monitoring with 11-point calibration curve, percentage estimation, charging detection, runtime prediction
- **Behaviour Analysis**: Movement pattern learning, home/school detection, risk scoring, anomaly alerts
- **Panic Button**: Triple-tap detection with immediate alert transmission
- **Geofencing**: Safe zone monitoring (home/school/custom) with entry/exit alerts
- **Telegram Integration**: Bot-based alert delivery with Markdown formatting
- **OTA Updates**: Secure over-the-air firmware updates with rollback protection
- **Diagnostics**: Real-time heap/flash/CPU/WiFi monitoring, JSON export

### AP Dashboard (Device-hosted, LittleFS)
| Page | Features |
|------|----------|
| **Overview** | Real-time status cards (battery, GPS, WiFi, firmware), device info, network details |
| **WiFi** | Network scanning with signal visualization, saved network management, priority ordering |
| **Battery** | Animated visual battery, voltage/state/health/runtime breakdown, history placeholder |
| **GPS** | Fix status with pulsing indicator, coordinates, Google Maps deep-link, signal quality |
| **Diagnostics** | Memory/flash/CPU metrics with progress bars, raw JSON viewer & download |
| **Settings** | Device identity, restart/factory reset, OTA status, configuration export |

### Parent Web Dashboard (Cloud-hosted)
| Page | Features |
|------|----------|
| **Map** | Leaflet.js with OpenStreetMap/satellite layers, custom CTN pulsing marker, safezone circles, fit-bounds |
| **Timeline** | Date-picker navigation, event markers (movement/stop/alert/geofence), detailed tooltips, export |
| **Alerts** | Tabbed filtering (panic/behaviour/battery/geofence), unread highlighting, browser notifications |
| **Safe Zones** | Full CRUD with modal forms, type badges (🏠 Home/🏫 School/📍 Custom), enable/disable, map sync |
| **Settings** | Multi-device management, API base URL, auto-refresh interval, notification permissions, data export/clear |

### Shared Design System
- **CSS Custom Properties**: Light/dark mode, spacing scale, typography, shadows, transitions
- **Component Library**: Cards, buttons, forms, modals, toasts, badges, progress bars, signal bars
- **Mobile-first**: Responsive grids, touch-friendly targets, collapsible navigation
- **Accessibility**: Focus-visible outlines, ARIA labels, semantic HTML, reduced motion support

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CTN System Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐         WiFi/Internet         ┌──────────────────────┐  │
│  │   ESP8266    │ ◄─────────────────────────────► │  Parent Web Dashboard │  │
│  │  (NodeMCU)   │   REST API (HTTP/JSON)         │  (Static SPA)         │  │
│  │              │                                   │                       │  │
│  │ ┌──────────┐ │                                   │ ┌────────────────┐ │  │
│  │ │  GPS     │ │                                   │ │  Leaflet Map   │ │  │
│  │ │  Module  │ │                                   │ │  + Markers     │ │  │
│  │ └──────────┘ │                                   │ └────────────────┘ │  │
│  │ ┌──────────┐ │                                   │ ┌────────────────┐ │  │
│  │ │ Battery  │ │                                   │ │  Timeline      │ │  │
│  │ │ Monitor  │ │                                   │ │  Alerts        │ │  │
│  │ └──────────┘ │                                   │ │  Safe Zones    │ │  │
│  │ ┌──────────┐ │                                   │ │  Settings      │ │  │
│  │ │  Panic   │ │                                   │ └────────────────┘ │  │
│  │ │  Button  │ │                                   └──────────────────────┘  │
│  │ └──────────┘ │                                             ▲                │
│  │ ┌──────────┐ │                              AP Mode        │                │
│  │ │ LittleFS │ │◄────────────────────────────────────────────┘                │
│  │ │(AP Dash) │ │   HTTP (192.168.4.1)                                          │
│  │ └──────────┘ │                                                             │
│  └──────────────┘                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initial Setup**: Device boots → AP Mode (SSID: `CTN-Setup`, Pass: `childtracker`) → User connects → AP Dashboard served from LittleFS → WiFi credentials entered → Device connects to WiFi → AP Mode disabled
2. **Normal Operation**: Device on WiFi → GPS + sensors polled → Data stored locally → REST API serves status to Parent Dashboard
3. **Alerts**: Panic button / geofence breach / low battery / behaviour anomaly → Telegram bot notification + Parent Dashboard alert (if connected)
4. **Configuration**: Parent Dashboard → REST API → LittleFS persistence → Device applies settings on next cycle

---

## Hardware Requirements

| Component | Specification | Notes |
|-----------|---------------|-------|
| **MCU** | ESP8266 NodeMCU v3 (ESP-12E) | 4MB Flash, 80/160MHz |
| **GPS** | Neo-6M / Neo-7M / Neo-8M UART | 9600 baud, 1Hz update |
| **Battery** | LiPo 3.7V 500-2000mAh | With protection circuit |
| **Charging** | TP4056 or MCP73831 | Micro-USB/USB-C input |
| **Voltage Divider** | 100kΩ + 220kΩ (3.2:1) | For ADC battery monitoring |
| **Panic Button** | Tactile switch | GPIO0 (D3) with pull-up |
| **LED Indicator** | WS2812B or single-color | GPIO2 (D4) for status |
| **Enclosure** | IP67 rated recommended | For wearable form factor |

### Pin Assignments (Config.h)

| Function | GPIO | NodeMCU Pin | Notes |
|----------|------|-------------|-------|
| GPS TX | GPIO14 | D5 | To GPS RX |
| GPS RX | GPIO12 | D6 | From GPS TX |
| Battery ADC | A0 | A0 | Via voltage divider |
| Panic Button | GPIO0 | D3 | Active LOW, triple-tap |
| Status LED | GPIO2 | D4 | Active LOW (built-in) |
| Charging Detect | GPIO13 | D7 | Optional, from TP4056 |

---

## Software Stack

### Firmware (PlatformIO + Arduino Framework)
| Library | Version | Purpose |
|---------|---------|---------|
| ESPAsyncWebServer | 3.0+ | Async HTTP/REST server |
| ESPAsyncTCP | 1.2+ | Async TCP for web server |
| ArduinoJson | 7.0+ | JSON serialization |
| TinyGPSPlus | 1.0+ | NMEA parsing |
| ESP8266LittleFS | 1.0+ | Filesystem for AP Dashboard |
| ESP8266HTTPClient | 1.0+ | HTTP client for Telegram/OTA |
| ESP8266WiFi | 1.0+ | WiFi management |

### Dashboards (Vanilla JS/ES6)
| Technology | Purpose |
|------------|---------|
| **CSS Custom Properties** | Design tokens, theming |
| **Leaflet.js 1.9+** | Interactive maps (Parent Dashboard) |
| **Fetch API** | REST communication |
| **localStorage** | Offline persistence (Parent Dashboard) |
| **Browser Notifications API** | Alert notifications |
| **Service Worker Ready** | PWA support (manifest.json included) |

---

## Project Structure

```
CTN/
├── include/                    # Firmware headers
│   ├── Config.h               # Pin definitions, constants, thresholds
│   ├── APDashboard.h          # AP Dashboard wrapper
│   ├── WebDashboard.h         # REST API declarations
│   ├── WiFiManager.h          # Multi-network WiFi manager
│   ├── Storage.h              # LittleFS JSON persistence
│   ├── Battery.h              # Battery monitoring & calibration
│   ├── GPS.h                  # GPS/NMEA handling
│   ├── Behaviour.h            # Movement analysis & risk scoring
│   ├── Alerts.h               # Alert generation & Telegram
│   ├── Diagnostics.h          # System health metrics
│   ├── OTA.h                  # Over-the-air updates
│   ├── Telegram.h             # Telegram bot integration
│   ├── Logger.h               # Structured logging
│   └── Utilities.h            # Helpers (timing, strings, math)
│
├── src/                        # Firmware implementations
│   ├── main.cpp               # Setup/loop, panic button, task scheduler
│   ├── APDashboard.cpp        # LittleFS mount + web server init
│   ├── WebDashboard.cpp       # REST API endpoint handlers
│   ├── WiFiManager.cpp        # Connection management, AP fallback
│   ├── Storage.cpp            # All JSON config persistence
│   ├── Battery.cpp            # ADC reading, calibration, estimation
│   ├── GPS.cpp                # TinyGPSPlus wrapper, fix tracking
│   ├── Behaviour.cpp          # Pattern learning, geofence check
│   ├── Alerts.cpp             # Alert queue, Telegram sending
│   ├── Diagnostics.cpp        # Heap/flash/CPU/WiFi stats
│   ├── OTA.cpp                # ArduinoOTA + custom HTTP OTA
│   ├── Telegram.cpp           # Bot API, message formatting
│   ├── Logger.cpp             # Log levels, formatted output
│   └── Utilities.cpp          # Shared helpers
│
├── data/                       # LittleFS filesystem (AP Dashboard)
│   ├── index.html             # SPA with 6 pages
│   ├── styles.css             # Complete design system
│   ├── app.js                 # API client, navigation, page loaders
│   ├── manifest.json          # PWA manifest
│   └── assets/                # Logo, icons (add your own)
│
├── parent-dashboard/           # Cloud-hosted Parent Dashboard
│   ├── index.html             # 5-page SPA structure
│   ├── css/
│   │   └── styles.css         # Shared design tokens + map overrides
│   └── js/
│       └── app.js             # Full app: Leaflet, state, persistence, API
│
├── platformio.ini             # PlatformIO configuration
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **PlatformIO IDE** (VS Code extension recommended) or **PlatformIO Core CLI**
- **Python 3.8+** (for PlatformIO)
- **Git** for version control

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/CTN.git
cd CTN

# Install PlatformIO (if not using IDE)
pip install platformio

# Install dependencies (PlatformIO handles this automatically on first build)
pio lib install
```

### Configuration

Edit `include/Config.h` for your hardware:

```cpp
// GPS Serial pins
#define GPS_RX_PIN        12   // D6 - GPS TX
#define GPS_TX_PIN        14   // D5 - GPS RX

// Battery ADC calibration (11-point curve)
#define BATTERY_ADC_PIN   A0
#define BATTERY_DIVIDER_RATIO  3.2f   // (R1+R2)/R2 for 100k+220k

// Panic button
#define PANIC_BUTTON_PIN  0    // D3 - Active LOW
#define PANIC_TAP_WINDOW  800  // ms between taps
#define PANIC_TAP_COUNT   3    // Triple-tap

// WiFi AP fallback
#define AP_SSID           "CTN-Setup"
#define AP_PASSWORD       "childtracker"
#define AP_FALLBACK_TIMEOUT 60  // seconds

// Telegram (optional)
#define TELEGRAM_BOT_TOKEN "YOUR_BOT_TOKEN"
#define TELEGRAM_CHAT_ID   "YOUR_CHAT_ID"
```

### Building Firmware

```bash
# Build for NodeMCU v2 (ESP-12E)
pio run --environment nodemcuv2

# Build with verbose output
pio run --environment nodemcuv2 -v
```

### Flashing

```bash
# Flash firmware via USB
pio run --environment nodemcuv2 --target upload

# Upload LittleFS filesystem (AP Dashboard)
pio run --environment nodemcuv2 --target uploadfs

# Monitor serial output
pio device monitor --environment nodemcuv2 --baud 115200
```

### First Boot & WiFi Setup

1. Power on the device
2. Connect phone/computer to WiFi **`CTN-Setup`** (password: **`childtracker`**)
3. Open browser to **`http://192.168.4.1`**
4. Go to **WiFi** page → **Scan** → Select your network → Enter password → **Join**
5. Device reboots, connects to your WiFi, AP mode disables
6. Note the assigned IP address (shown in serial monitor or on AP Dashboard before reboot)

---

## Firmware API Reference

All endpoints return JSON. Base path: `/api`

### Device Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/status` | Complete device status (battery, GPS, WiFi, firmware, state) |
| GET | `/device` | Device info (name, chip ID, flash, CPU, reset reason, uptime) |
| POST | `/device/restart` | Soft reboot |
| POST | `/device/reset` | Factory reset (erases LittleFS, restarts in AP mode) |

### Battery
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/battery` | Voltage, percentage, state, charging, health, runtime estimate |

### GPS
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gps` | Latitude, longitude, satellites, HDOP, accuracy, speed, heading, altitude, time |

### WiFi Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wifi/status` | Current connection (SSID, RSSI, IP, signal quality, internet) |
| GET | `/wifi/scan` | Trigger scan, returns `{scanning: true}` then poll for results |
| GET | `/wifi/saved` | List saved networks with priority/auto-connect |
| POST | `/wifi/connect` | `{ssid, password}` - Connect immediately |
| POST | `/wifi/save` | `{ssid, password, priority}` - Save for auto-reconnect |
| PUT | `/wifi/update` | `{ssid, password, priority}` - Update saved network |
| DELETE | `/wifi/remove` | `{ssid}` - Remove saved network |

### Safe Zones (Device-side)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/safezones` | List all configured zones |
| POST | `/safezones` | Add zone `{name, type, lat, lon, radius, enabled}` |
| PUT | `/safezones/:index` | Update zone |
| DELETE | `/safezones/:index` | Remove zone |

### Example Response: `/api/status`
```json
{
  "battery": {
    "voltage": 3.82,
    "percentage": 78,
    "state": "discharging",
    "charging": false,
    "health": "good",
    "runtimeEstimateHours": 42.5
  },
  "gps": {
    "hasFix": true,
    "latitude": -1.2921,
    "longitude": 36.8219,
    "satellites": 8,
    "hdop": 1.2,
    "accuracy": 4.5,
    "speed": 0.8,
    "heading": 145,
    "altitude": 1650,
    "timeValid": true
  },
  "wifi": {
    "connected": true,
    "apMode": false,
    "ssid": "HomeNetwork",
    "rssi": -52,
    "signalQuality": 85,
    "ip": "192.168.1.42",
    "gateway": "192.168.1.1",
    "internet": true
  },
  "firmware": {
    "version": "1.2.0",
    "freeHeap": 38240,
    "uptime": 3661
  },
  "state": {
    "behaviour": "stationary",
    "riskScore": 12,
    "inSafeZone": true,
    "currentZone": "Home"
  }
}
```

---

## Dashboard Documentation

### AP Dashboard (Device-hosted)

**Access**: `http://<device-ip>/` (WiFi) or `http://192.168.4.1/` (AP Mode)

**Features**:
- **No external dependencies** - Fully self-contained in LittleFS
- **Real-time updates** - 5-second auto-refresh via REST API
- **Dark/Light mode** - Persisted in browser localStorage
- **Touch-optimized** - 48px minimum touch targets
- **Offline-capable** - Cached via Service Worker (PWA manifest included)

**Navigation**: Bottom tab bar (mobile) / top nav (desktop) with 6 pages

### Parent Dashboard (Cloud-hosted)

**Deployment**: Any static hosting (GitHub Pages, Netlify, Vercel, Firebase, Apache, Nginx)

```bash
# Local testing
cd parent-dashboard
python -m http.server 8080
# Open http://localhost:8080
```

**Configuration**:
1. Open **Settings** page
2. Click **Add Device** → Enter device name + API URL (e.g., `http://192.168.1.42/api`)
3. Select device from header dropdown
4. Enable **Browser Notifications** for panic alerts

**Map Page**:
- Click map to set safezone coordinates (when adding/editing)
- Custom CTN marker with pulsing animation
- Safezone circles: Blue (Home), Green (School), Amber (Custom)
- Layer control: OpenStreetMap / Satellite
- Center button: Fly to device location

**Safe Zones**:
- Types: Home (0), School (1), Custom (2)
- Radius: 10-5000 meters
- Toggle enable/disable without deletion
- Changes sync to map immediately

**Alerts**:
- Auto-fetch from device (stored locally)
- Filter tabs: All / Panic / Behaviour / Battery / Safezone
- Unread highlighting with animated indicator
- Clear all with confirmation

**Notifications**:
- Request permission on first interaction
- Panic button alerts: High priority, persistent, sound (if supported)
- Works when tab is backgrounded (Service Worker ready)

---

## Configuration Files

### platformio.ini
```ini
[env:nodemcuv2]
platform = espressif8266
board = nodemcuv2
framework = arduino
monitor_speed = 115200
upload_speed = 921600

; LittleFS configuration
board_build.filesystem = littlefs
board_build.ldscript = eagle.flash.4m2m.ld

lib_deps =
    me-no-dev/ESPAsyncWebServer @ ^3.0.0
    me-no-dev/ESPAsyncTCP @ ^1.2.0
    bblanchon/ArduinoJson @ ^7.0.0
    mikalhart/TinyGPSPlus @ ^1.0.0
    arduino-libraries/ESP8266LittleFS @ ^1.0.0
```

### Config.h Key Settings
```cpp
// Timing intervals (seconds)
#define GPS_UPDATE_INTERVAL      1
#define BEHAVIOUR_INTERVAL       5
#define WIFI_SCAN_INTERVAL       60
#define BATTERY_UPDATE_INTERVAL  10
#define TELEGRAM_ALERT_COOLDOWN  30

// Thresholds
#define BATTERY_LOW_THRESHOLD    20      // %
#define BATTERY_CRITICAL_THRESHOLD 10   // %
#define HDOP_MAX_ACCEPTABLE      2.5
#define SATELLITES_MIN_FIX       4

// Safe zone defaults
#define DEFAULT_HOME_RADIUS      100
#define DEFAULT_SCHOOL_RADIUS    150
#define MAX_SAFE_ZONES           10
```

---

## Deployment

### Firmware Deployment (Production)

1. **Version bump** in `Config.h`: `FIRMWARE_VERSION`
2. **Build release**: `pio run --environment nodemcuv2`
3. **Test locally** with serial monitor
4. **OTA update** (if device online):
   ```bash
   # Via web interface or curl
   curl -X POST http://<device-ip>/api/device/ota \
        -F "firmware=@.pio/build/nodemcuv2/firmware.bin"
   ```

### Parent Dashboard Deployment

**GitHub Pages**:
```bash
# In repo settings: Pages → Deploy from branch → /parent-dashboard
# Or use gh-pages branch with GitHub Actions
```

**Netlify/Vercel**:
```bash
# Connect repo, set build command: (none), publish directory: parent-dashboard
```

**Traditional Hosting**:
```bash
# Upload parent-dashboard/ contents to web root
# Ensure HTTPS for notifications API
```

### SSL/TLS (Required for Notifications)
- Browser Notifications API requires **HTTPS** (or localhost)
- Use Let's Encrypt (Certbot) or Cloudflare Tunnel for custom domains
- For local testing: `mkcert` for trusted local certificates

---

## Security Considerations

### Firmware
- [ ] Change default AP password (`childtracker`) in `Config.h`
- [ ] Disable debug logging in production: `DEBUG_MODE = false`
- [ ] Use HTTPS for OTA updates (validate certificate)
- [ ] Implement API authentication (HMAC/API key) for production
- [ ] Disable factory reset endpoint in production or add confirmation token
- [ ] Secure Telegram bot token (not in repo - use secrets)

### Network
- [ ] Isolate IoT devices on separate VLAN
- [ ] Block internet access for ESP8266 except NTP/OTA/Telegram
- [ ] Use WPA3/WPA2-AES for WiFi
- [ ] Consider ESP8266 SSL/TLS limitations (no SNI, limited cipher suites)

### Data Privacy
- [ ] No personal data stored on device (only MAC, location)
- [ ] Parent Dashboard stores data in browser localStorage only
- [ ] No cloud backend - fully peer-to-peer
- [ ] Export/delete functionality for GDPR compliance

---

## Development Workflow

### Adding a New Firmware Module

1. Create `include/NewModule.h` with declarations
2. Create `src/NewModule.cpp` with implementation
3. Add to `main.cpp` initialization sequence
4. Expose REST endpoints in `WebDashboard.cpp`
5. Update AP Dashboard (`data/app.js`) and Parent Dashboard (`parent-dashboard/js/app.js`) if UI needed

### Adding a Dashboard Page

**AP Dashboard (LittleFS)**:
1. Add `<section id="page-new">` in `data/index.html`
2. Add nav item in `data/index.html` header
3. Style in `data/styles.css`
4. Add loader in `data/app.js` pageLoader
5. Register in navigation

**Parent Dashboard**:
1. Add `<section id="page-new">` in `parent-dashboard/index.html`
2. Add nav item (sidebar)
3. Style in `parent-dashboard/css/styles.css`
4. Add loader in `parent-dashboard/js/app.js` pageLoader
5. Register in navigation

### Code Style

- **C++**: Arduino style (2-space indent, camelCase functions, PascalCase classes)
- **JavaScript**: ES6 modules pattern, 2-space indent, const/let, async/await
- **CSS**: BEM-ish naming, custom properties for all values, mobile-first media queries

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Device stuck in AP mode | No WiFi credentials saved | Use AP Dashboard to configure WiFi |
| GPS never gets fix | Indoor / antenna issue | Move outdoors, check antenna connection |
| Battery shows 0% | ADC not calibrated | Calibrate in Battery page or Config.h |
| Parent Dashboard "Connection Failed" | Wrong API URL / CORS | Check device IP, ensure HTTP (not HTTPS) for local |
| Notifications don't appear | HTTPS required | Use localhost or valid SSL cert |
| LittleFS upload fails | Partition size mismatch | Check `board_build.ldscript` matches flash size |
| OTA fails | Insufficient free space | Check free sketch space in Diagnostics |

### Debug Logging

Enable in `Config.h`:
```cpp
#define DEBUG_MODE true
#define DEBUG_LEVEL LOG_VERBOSE
```

Then monitor:
```bash
pio device monitor --environment nodemcuv2 --baud 115200
```

---

## Performance Benchmarks

| Metric | Value | Notes |
|--------|-------|-------|
| Boot time | ~2.5s | LittleFS mount + WiFi connect |
| API response | 15-40ms | AsyncWebServer, no blocking |
| RAM free (idle) | ~38KB | 80KB total heap |
| Flash used | ~480KB | 4MB total, 1.5MB for OTA |
| GPS parse time | <1ms | TinyGPSPlus incremental |
| WiFi scan | 3-8s | Non-blocking callback |
| Safezone check | <0.1ms | Haversine distance |

---

## Roadmap

- [ ] **BLE companion app** for direct phone pairing (no WiFi needed)
- [ ] **LoRaWAN support** for long-range tracking
- [ ] **ML-based anomaly detection** on MCU (TensorFlow Lite Micro)
- [ ] **Voice alerts** via onboard speaker
- [ ] **Multi-child support** (multiple devices per Parent Dashboard)
- [ ] **Geofence scheduler** (time-based zones)
- [ ] **Battery optimization** (deep sleep between GPS fixes)
- [ ] **Firmware signing** for secure OTA

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Convention
```
feat:     New feature
fix:      Bug fix
docs:     Documentation
style:    Formatting (no logic change)
refactor: Code restructuring
test:     Adding tests
chore:    Maintenance
```

---

## License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2026 CTN Project Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Acknowledgments

- **ESPAsyncWebServer** by me-no-dev - Async HTTP server
- **TinyGPSPlus** by mikalhart - NMEA parser
- **ArduinoJson** by bblanchon - JSON library
- **Leaflet.js** - Interactive maps for Parent Dashboard
- **PlatformIO** - Build system and library management
- **OpenStreetMap** - Map tiles

---

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/CTN/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/CTN/discussions)
- **Wiki**: [Project Wiki](https://github.com/yourusername/CTN/wiki)

---

**Built with ❤️ for child safety**