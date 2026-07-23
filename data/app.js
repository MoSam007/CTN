/**
 * CTN AP Dashboard - Main Application
 * Vanilla JavaScript, ES6 modules pattern
 * Mobile-first, responsive, works on ESP8266
 */

(function() {
  "use strict";

  // ============================================================
  // Configuration & Constants
  // ============================================================
  const CONFIG = {
    apiBase: "/api",
    updateInterval: 5000,
    scanTimeout: 15000,
    toastDuration: 4000,
  };

  const STATE = {
    currentPage: "overview",
    theme: "light",
    wifiNetworks: [],
    savedNetworks: [],
    isScanning: false,
    updateTimer: null,
    pendingAction: null,
  };

  // ============================================================
  // Utility Functions
  // ============================================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d) parts.push(d + "d");
    if (h) parts.push(h + "h");
    if (m) parts.push(m + "m");
    parts.push(s + "s");
    return parts.join(" ");
  };

  const formatRSSI = (rssi) => {
    if (rssi >= -50) return { quality: 100, class: "signal-excellent", label: "Excellent" };
    if (rssi >= -60) return { quality: 80, class: "signal-good", label: "Good" };
    if (rssi >= -70) return { quality: 60, class: "signal-fair", label: "Fair" };
    if (rssi >= -80) return { quality: 40, class: "signal-poor", label: "Weak" };
    return { quality: 20, class: "signal-poor", label: "Very Weak" };
  };

  const signalBars = (quality) => {
    const bars = [];
    for (let i = 1; i <= 4; i++) {
      bars.push(`<span class="signal-bar"></span>`);
    }
    return bars.join("");
  };

  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };
// ============================================================
// API Client
// ============================================================
const api = {
  async request(endpoint, options = {}) {
    const url = CONFIG.apiBase + endpoint;
    const config = {
      headers: { "Content-Type": "application/json" },
      ...options,
    };
    
    if (config.body && typeof config.body === "object") {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: "GET" });
  },

  post(endpoint, data) {
    return this.request(endpoint, { method: "POST", body: data });
  },

  put(endpoint, data) {
    return this.request(endpoint, { method: "PUT", body: data });
  },

  delete(endpoint, data) {
    return this.request(endpoint, { method: "DELETE", body: data });
  },

  // Device Status
  getStatus() { return this.get("/status"); },
  getDevice() { return this.get("/device"); },
  getBattery() { return this.get("/battery"); },
  getGPS() { return this.get("/gps"); },

  // WiFi
  getWiFiStatus() { return this.get("/wifi/status"); },
  scanWiFi() { return this.get("/wifi/scan"); },
  getSavedWiFi() { return this.get("/wifi/saved"); },
  connectWiFi(ssid, password) { 
    return this.post("/wifi/connect", { ssid, password }); 
  },
  saveWiFi(ssid, password, priority = 0) { 
    return this.post("/wifi/save", { ssid, password, priority }); 
  },
  updateWiFi(ssid, password, priority) { 
    return this.put("/wifi/update", { ssid, password, priority }); 
  },
  removeWiFi(ssid) { 
    return this.delete("/wifi/remove", { ssid }); 
  },

  // Telegram
  getTelegramStatus() { return this.get("/telegram/status"); },
  saveTelegram(config) { return this.post("/telegram/save", config); },
  testTelegram() { return this.post("/telegram/test"); },

  // Device Control
  restartDevice() { return this.post("/device/restart"); },
  factoryReset() { return this.post("/device/reset"); },
};

// ============================================================
// Toast Notifications
// ============================================================
const toast = {
  container: null,
  
  init() {
    this.container = $("#toast-container");
  },

  show(message, type = "info", duration = CONFIG.toastDuration) {
    if (!this.container) this.init();
    
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;
    
    el.querySelector(".toast-close").addEventListener("click", () => this.dismiss(el));
    
    this.container.appendChild(el);
    
    if (duration > 0) {
      setTimeout(() => this.dismiss(el), duration);
    }
    
    return el;
  },

  dismiss(el) {
    el.style.animation = "slideIn 0.2s ease reverse";
    setTimeout(() => el.remove(), 200);
  },

  success(msg, dur) { return this.show(msg, "success", dur); },
  error(msg, dur) { return this.show(msg, "error", dur); },
  warning(msg, dur) { return this.show(msg, "warning", dur); },
  info(msg, dur) { return this.show(msg, "info", dur); },
};

// ============================================================
// Modal Dialog
// ============================================================
const modal = {
  overlay: null,
  title: null,
  message: null,
  confirmBtn: null,
  cancelBtn: null,
  resolve: null,

  init() {
    this.overlay = $("#modal-overlay");
    this.title = $("#modal-title");
    this.message = $("#modal-message");
    this.confirmBtn = $("#modal-confirm");
    this.cancelBtn = $("#modal-cancel");
    
    this.cancelBtn.addEventListener("click", () => this.close(false));
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.overlay.classList.contains("hidden")) {
        this.close(false);
      }
    });
  },

  confirm(title, message, confirmText = "Confirm", danger = true) {
    return new Promise((resolve) => {
      if (!this.overlay) this.init();
      
      this.title.textContent = title;
      this.message.textContent = message;
      this.confirmBtn.textContent = confirmText;
      this.confirmBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
      this.resolve = resolve;
      
      this.overlay.classList.remove("hidden");
      this.confirmBtn.focus();
      
      const handler = () => {
        this.confirmBtn.removeEventListener("click", handler);
        this.close(true);
      };
      this.confirmBtn.addEventListener("click", handler);
    });
  },

  close(confirmed) {
    this.overlay.classList.add("hidden");
    if (this.resolve) {
      this.resolve(confirmed);
      this.resolve = null;
    }
  },
};

// ============================================================
// Theme Management
// ============================================================
const theme = {
  init() {
    const toggle = $("#theme-toggle");
    const saved = localStorage.getItem("ctn-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    STATE.theme = saved || (prefersDark ? "dark" : "light");
    this.apply(STATE.theme);
    
    toggle.addEventListener("click", () => this.toggle());
  },

  apply(theme) {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("ctn-theme", theme);
    STATE.theme = theme;
  },

  toggle() {
    this.apply(STATE.theme === "light" ? "dark" : "light");
  },
};

// ============================================================
// Navigation
// ============================================================
const navigation = {
  init() {
    const navItems = $$(".nav-item");
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) this.switchPage(page);
      });
    });
  },

  switchPage(page) {
    $$(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    $$(".page").forEach((pg) => {
      pg.classList.toggle("active", pg.id === `page-${page}`);
    });

    STATE.currentPage = page;
    pageLoader.load(page);
    window.location.hash = page;
  },

  getCurrentPage() {
    return STATE.currentPage;
  },
};
// ============================================================
// Page Loaders
// ============================================================
const pageLoader = {
  load(page) {
    switch (page) {
      case "overview":
        this.loadOverview();
        break;
      case "wifi":
        this.loadWiFi();
        break;
      case "battery":
        this.loadBattery();
        break;
      case "gps":
        this.loadGPS();
        break;
      case "diagnostics":
        this.loadDiagnostics();
        break;
      case "settings":
        this.loadSettings();
        break;
    }
  },

  async loadOverview() {
    try {
      const [status, device] = await Promise.all([
        api.getStatus(),
        api.getDevice(),
      ]);
      
      this.updateOverviewCards(status);
      this.updateDeviceInfo(device);
      this.updateNetworkInfo(status);
    } catch (error) {
      console.error("Overview load failed:", error);
    }
  },

  updateOverviewCards(status) {
    const bat = status.battery || {};
    $("#battery-percentage").textContent = bat.percentage !== undefined ? bat.percentage + "%" : "--%";
    $("#battery-voltage").textContent = bat.voltage !== undefined ? bat.voltage.toFixed(2) + " V" : "-- V";
    $("#battery-state").textContent = bat.state || "Unknown";

    const gps = status.gps || {};
    $("#gps-satellites").textContent = gps.satellites || "--";
    $("#gps-fix").textContent = gps.hasFix ? "Fix Acquired" : "No Fix";
    $("#gps-hdop").textContent = gps.hdop ? "HDOP: " + gps.hdop.toFixed(1) : "HDOP: --";

    const wifi = status.wifi || {};
    const signal = wifi.signalQuality !== undefined ? wifi.signalQuality : (wifi.rssi ? formatRSSI(wifi.rssi).quality : 0);
    $("#wifi-signal").textContent = signal + "%";
    $("#wifi-ssid").textContent = wifi.ssid || "Not connected";
    $("#wifi-ip").textContent = wifi.ip || "--";

    const fw = status.firmware || {};
    $("#firmware-version").textContent = "v" + (fw.version || "--");
    $("#free-heap").textContent = fw.freeHeap ? Math.round(fw.freeHeap / 1024) + " KB free" : "--";
    $("#uptime").textContent = fw.uptime ? "Uptime: " + formatUptime(fw.uptime) : "--";
  },

  updateDeviceInfo(device) {
    $("#device-id").textContent = device.deviceName || "--";
    $("#chip-id").textContent = device.chipId ? "0x" + device.chipId.toString(16).toUpperCase() : "--";
    $("#flash-size").textContent = device.flashChipSize ? formatBytes(device.flashChipSize) : "--";
    $("#cpu-freq").textContent = device.cpuFreqMHz ? device.cpuFreqMHz + " MHz" : "--";
    $("#reset-reason").textContent = device.resetReason || "--";
    $("#behaviour-state").textContent = status?.state?.behaviour || "--";
    $("#risk-score").textContent = status?.state?.riskScore !== undefined ? status.state.riskScore : "--";
  },

  updateNetworkInfo(status) {
    const wifi = status.wifi || {};
    $("#connection-state").textContent = wifi.connected ? "Connected" : (wifi.apMode ? "AP Mode" : "Disconnected");
    $("#gateway").textContent = wifi.gateway || "--";
    $("#dns").textContent = wifi.dns || "--";
    $("#subnet").textContent = wifi.subnetMask || "--";
    $("#mac").textContent = wifi.macAddress || "--";
    $("#internet").textContent = wifi.internet ? "Online" : "Offline";
  },

  async loadWiFi() {
    await Promise.all([
      this.loadCurrentWiFi(),
      this.loadSavedWiFi(),
    ]);
  },

  async loadCurrentWiFi() {
    try {
      const status = await api.getWiFiStatus();
      
      const connected = status.connected;
      $("#cur-status").textContent = connected ? "Connected" : (status.apMode ? "AP Mode" : "Disconnected");
      $("#cur-status").className = "info-value " + (connected ? "status-connected" : (status.apMode ? "status-ap" : "status-disconnected"));
      $("#cur-ssid").textContent = status.ssid || "--";
      $("#cur-signal").textContent = status.signalQuality !== undefined ? status.signalQuality + "%" : "--";
      $("#cur-ip").textContent = status.ip || "--";
      
      $("#btn-reconnect").disabled = !connected;
      $("#btn-disconnect").disabled = !connected;
    } catch (error) {
      console.error("WiFi status load failed:", error);
    }
  },

  async loadSavedWiFi() {
    try {
      const data = await api.getSavedWiFi();
      STATE.savedNetworks = data.savedNetworks || [];
      this.renderSavedNetworks();
    } catch (error) {
      console.error("Saved WiFi load failed:", error);
    }
  },

  renderSavedNetworks() {
    const list = $("#saved-list");
    
    if (STATE.savedNetworks.length === 0) {
      list.innerHTML = `<li class="network-empty">No saved networks</li>`;
      return;
    }

    list.innerHTML = STATE.savedNetworks.map((net, idx) => `
      <li class="network-item saved" data-ssid="${escapeHtml(net.ssid)}">
        <div class="network-info">
          <div class="network-ssid">${escapeHtml(net.ssid)}</div>
          <div class="network-meta">
            <span>Priority: ${net.priority}</span>
            <span>Auto-connect: ${net.autoConnect ? "Yes" : "No"}</span>
          </div>
        </div>
        <div class="network-actions">
          <button class="btn btn-secondary btn-connect" data-ssid="${escapeHtml(net.ssid)}">Connect</button>
          <button class="btn btn-danger btn-remove" data-ssid="${escapeHtml(net.ssid)}">Remove</button>
        </div>
      </li>
    `).join("");

    $$(".btn-connect", list).forEach((btn) => {
      btn.addEventListener("click", () => this.connectToSaved(btn.dataset.ssid));
    });
    $$(".btn-remove", list).forEach((btn) => {
      btn.addEventListener("click", () => this.removeSaved(btn.dataset.ssid));
    });
  },

  async connectToSaved(ssid) {
    const cred = STATE.savedNetworks.find((n) => n.ssid === ssid);
    if (!cred) return;
    
    toast.info(`Connecting to ${ssid}...`);
    try {
      await api.connectWiFi(ssid, cred.password);
      toast.success(`Connected to ${ssid}`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      toast.error(`Failed to connect: ${error.message}`);
    }
  },

  async removeSaved(ssid) {
    const confirmed = await modal.confirm(
      "Remove Network",
      `Are you sure you want to remove "${ssid}" from saved networks?`,
      "Remove"
    );
    
    if (!confirmed) return;
    
    try {
      await api.removeWiFi(ssid);
      toast.success(`Removed ${ssid}`);
      this.loadSavedWiFi();
    } catch (error) {
      toast.error(`Failed to remove: ${error.message}`);
    }
  },

  async scanNetworks() {
    if (STATE.isScanning) return;
    
    STATE.isScanning = true;
    const scanBtn = $("#btn-scan");
    const scanStatus = $("#scan-status");
    const scanError = $("#scan-error");
    const networkList = $("#network-list");
    
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<span class="spinner"></span> Scanning...`;
    scanStatus.classList.remove("hidden");
    scanError.classList.add("hidden");
    networkList.innerHTML = `<li class="network-empty">Scanning...</li>`;

    try {
      await api.scanWiFi();
      
      let attempts = 0;
      const maxAttempts = 30;
      
      const poll = async () => {
        if (attempts >= maxAttempts) {
          throw new Error("Scan timeout");
        }
        
        try {
          const result = await api.get("/wifi/scan");
          
          if (!result.scanning) {
            STATE.wifiNetworks = result.networks || [];
            this.renderNetworkList();
            return;
          }
        } catch (e) {
          // Ignore polling errors
        }
        
        attempts++;
        setTimeout(poll, 500);
      };
      
      await poll();
    } catch (error) {
      scanError.textContent = `Scan failed: ${error.message}`;
      scanError.classList.remove("hidden");
      networkList.innerHTML = `<li class="network-empty">Scan failed. Click "Scan" to retry.</li>`;
    } finally {
      STATE.isScanning = false;
      scanBtn.disabled = false;
      scanBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Scan`;
      scanStatus.classList.add("hidden");
    }
  },

  renderNetworkList() {
    const list = $("#network-list");
    const savedSSIDs = new Set(STATE.savedNetworks.map((n) => n.ssid));
    
    if (STATE.wifiNetworks.length === 0) {
      list.innerHTML = `<li class="network-empty">No networks found</li>`;
      return;
    }

    STATE.wifiNetworks.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
    
    list.innerHTML = STATE.wifiNetworks.map((net) => {
      const isSaved = savedSSIDs.has(net.ssid);
      const rssi = formatRSSI(net.rssi);
      const security = net.secure ? "WPA/WPA2" : "Open";
      
      return `
        <li class="network-item ${isSaved ? "saved" : ""}" data-ssid="${escapeHtml(net.ssid)}">
          <div class="network-info">
            <div class="network-ssid">${escapeHtml(net.ssid)} ${isSaved ? '<span style="font-size:10px;color:var(--color-primary);margin-left:6px;">✓ Saved</span>' : ''}</div>
            <div class="network-meta">
              <span class="network-security">${security}</span>
              <span>Ch ${net.channel}</span>
              <span>${net.rssi} dBm</span>
            </div>
            <div class="network-signal ${rssi.class}">
              ${signalBars(rssi.quality)}
              <span>${rssi.label}</span>
            </div>
          </div>
          <div class="network-actions">
            <button class="btn ${isSaved ? "btn-secondary" : "btn-primary"} btn-connect-scan" 
                    data-ssid="${escapeHtml(net.ssid)}" 
                    data-secure="${net.secure}"
                    ${isSaved ? "" : 'data-need-pass="true"'} >
              ${isSaved ? "Connect" : "Join"}
            </button>
          </div>
        </li>
      `;
    }).join("");

    $$(".btn-connect-scan", list).forEach((btn) => {
      btn.addEventListener("click", () => this.joinNetwork(btn));
    });
  },

  async joinNetwork(btn) {
    const ssid = btn.dataset.ssid;
    const secure = btn.dataset.secure === "true";
    const needPass = btn.dataset.needPass === "true";
    
    let password = "";
    if (secure && needPass) {
      password = prompt(`Enter password for "${ssid}":`);
      if (password === null) return;
    }
    
    btn.disabled = true;
    btn.textContent = "Connecting...";
    toast.info(`Connecting to ${ssid}...`);
    
    try {
      const result = await api.connectWiFi(ssid, password);
      toast.success(`Connected to ${ssid}`);
      
      if (needPass && password) {
        await api.saveWiFi(ssid, password);
      }
      
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error(`Failed to connect: ${error.message}`);
      btn.disabled = false;
      btn.textContent = "Join";
    }
  },

  async loadBattery() {
    try {
      const data = await api.getBattery();
      this.updateBatteryUI(data);
    } catch (error) {
      console.error("Battery load failed:", error);
    }
  },

  updateBatteryUI(data) {
    const pct = data.percentage || 0;
    const fill = $("#battery-fill");
    const pctEl = $("#battery-percentage");
    
    fill.style.width = pct + "%";
    pctEl.textContent = pct + "%";
    
    fill.classList.remove("warning", "critical");
    if (pct <= 20) fill.classList.add("critical");
    else if (pct <= 40) fill.classList.add("warning");
    
    $("#bat-voltage").textContent = data.voltage ? data.voltage.toFixed(2) + " V" : "-- V";
    $("#bat-state").textContent = data.state || "Unknown";
    $("#bat-charging").textContent = data.charging ? "Yes" : "No";
    $("#bat-health").textContent = data.health || "--";
    $("#bat-runtime").textContent = data.runtimeEstimateHours ? data.runtimeEstimateHours.toFixed(1) + " hours" : "-- hours";
    $("#bat-power-mode").textContent = "Normal";
  },

  async loadGPS() {
    try {
      const data = await api.getGPS();
      this.updateGPSUI(data);
    } catch (error) {
      console.error("GPS load failed:", error);
    }
  },

  updateGPSUI(data) {
    const hasFix = data.hasFix;
    const indicator = $("#gps-fix-indicator");
    const fixText = $("#gps-fix-text");
    const mapsLink = $("#maps-link");
    
    indicator.classList.toggle("has-fix", hasFix);
    fixText.textContent = hasFix ? "GPS Fix Acquired" : "Searching for satellites...";
    
    if (hasFix && data.latitude && data.longitude) {
      mapsLink.href = `https://maps.google.com/?q=${data.latitude},${data.longitude}`;
      mapsLink.disabled = false;
    } else {
      mapsLink.href = "#";
      mapsLink.disabled = true;
    }
    
    $("#gps-lat").textContent = data.latitude ? data.latitude.toFixed(6) : "--";
    $("#gps-lon").textContent = data.longitude ? data.longitude.toFixed(6) : "--";
    $("#gps-sat-count").textContent = data.satellites || "--";
    $("#gps-hdop").textContent = data.hdop ? data.hdop.toFixed(1) : "--";
    $("#gps-accuracy").textContent = data.accuracy ? data.accuracy.toFixed(1) + " m" : "--";
    $("#gps-fix-type").textContent = hasFix ? "3D Fix" : "No Fix";
    $("#gps-speed").textContent = data.speed ? data.speed.toFixed(1) + " km/h" : "-- km/h";
    $("#gps-heading").textContent = data.heading ? data.heading.toFixed(0) + "°" : "--°";
    $("#gps-altitude").textContent = data.altitude ? data.altitude.toFixed(0) + " m" : "-- m";
    $("#gps-time-valid").textContent = data.timeValid ? "Yes" : "No";
    $("#gps-time").textContent = "--";
    $("#gps-date").textContent = "--";
  },

  async loadDiagnostics() {
    try {
      const [device, status] = await Promise.all([
        api.getDevice(),
        api.getStatus(),
      ]);
      
      this.updateDiagnosticsUI(device, status);
    } catch (error) {
      console.error("Diagnostics load failed:", error);
    }
  },

  updateDiagnosticsUI(device, status) {
    const freeHeap = device.freeHeap || 0;
    const maxBlock = device.heapFragmentation ? Math.round(freeHeap * (1 - device.heapFragmentation / 100)) : 0;
    const totalHeap = 81920;
    const usedPct = Math.round((1 - freeHeap / totalHeap) * 100);
    
    $("#diag-free-heap").textContent = formatBytes(freeHeap);
    $("#diag-max-block").textContent = formatBytes(maxBlock);
    $("#diag-frag").textContent = device.heapFragmentation ? device.heapFragmentation.toFixed(1) + "%" : "--%";
    $("#diag-mem-progress").style.width = Math.min(usedPct, 100) + "%";
    
    const flashSize = device.flashChipSize || 0;
    const sketchSize = device.sketchSize || 0;
    const freeSketch = device.freeSketchSpace || 0;
    const flashUsedPct = flashSize ? Math.round((sketchSize / flashSize) * 100) : 0;
    
    $("#diag-flash-size").textContent = formatBytes(flashSize);
    $("#diag-sketch-size").textContent = formatBytes(sketchSize);
    $("#diag-free-sketch").textContent = formatBytes(freeSketch);
    $("#diag-flash-progress").style.width = Math.min(flashUsedPct, 100) + "%";
    
    $("#diag-cpu-freq").textContent = device.cpuFreqMHz ? device.cpuFreqMHz + " MHz" : "--";
    $("#diag-chip-id").textContent = device.chipId ? "0x" + device.chipId.toString(16).toUpperCase() : "--";
    $("#diag-flash-chip-id").textContent = device.flashChipId ? "0x" + device.flashChipId.toString(16).toUpperCase() : "--";
    
    $("#diag-fw").textContent = device.firmwareVersion || "--";
    $("#diag-uptime").textContent = device.uptime ? formatUptime(device.uptime) : "--";
    $("#diag-reset").textContent = device.resetReason || "--";
    $("#diag-last-reboot").textContent = "Just now";
    
    const wifi = status.wifi || {};
    $("#diag-rssi").textContent = wifi.rssi ? wifi.rssi + " dBm" : "--";
    $("#diag-channel").textContent = "--";
    $("#diag-wifi-mode").textContent = wifi.apMode ? "AP Mode" : (wifi.connected ? "Station" : "Disconnected");
    
    const rawData = {
      device,
      status: {
        battery: status.battery,
        gps: status.gps,
        wifi: status.wifi,
        firmware: status.firmware,
        state: status.state,
      },
      timestamp: new Date().toISOString(),
    };
    
    $("#diag-json").textContent = JSON.stringify(rawData, null, 2);
    
    $("#btn-download-diag").onclick = () => {
      const blob = new Blob([JSON.stringify(rawData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ctn-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  },

  async loadSettings() {
    try {
      const [device, tgStatus] = await Promise.all([
        api.getDevice(),
        api.getTelegramStatus(),
      ]);

      $("#device-name").value = device.deviceName || "CTN-001";
      $("#fw-version").value = device.firmwareVersion || "1.0";
      $("#ota-version").textContent = device.firmwareVersion || "1.0";
      $("#footer-fw").textContent = device.firmwareVersion || "1.0";

      // Telegram Settings
      this.updateTelegramUI(tgStatus);

      $("#tg-save").onclick = async () => {
        const config = {
          botToken: $("#tg-bot-token").value.trim(),
          chatId: $("#tg-chat-id").value.trim(),
          enabled: $("#tg-enabled").checked,
        };

        if (!config.botToken || !config.chatId) {
          toast.error("Bot Token and Chat ID are required");
          return;
        }

        try {
          await api.saveTelegram(config);
          toast.success("Telegram configuration saved");
          // Refresh status
          const status = await api.getTelegramStatus();
          this.updateTelegramUI(status);
        } catch (error) {
          toast.error("Save failed: " + error.message);
        }
      };

      $("#tg-test").onclick = async () => {
        try {
          $("#tg-test").disabled = true;
          $("#tg-test").textContent = "Sending...";
          await api.testTelegram();
          toast.success("Test message sent!");
        } catch (error) {
          toast.error("Test failed: " + error.message);
        } finally {
          $("#tg-test").disabled = false;
          $("#tg-test").innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Send Test Message`;
        }
      };

      $("#btn-restart").onclick = async () => {
        const confirmed = await modal.confirm(
          "Restart Device",
          "This will reboot the device. You will need to reconnect to the AP.",
          "Restart"
        );

        if (confirmed) {
          toast.info("Restarting device...");
          try {
            await api.restartDevice();
            setTimeout(() => window.location.reload(), 3000);
          } catch (error) {
            toast.error("Restart failed: " + error.message);
          }
        }
      };

      $("#btn-factory-reset").onclick = async () => {
        const confirmed = await modal.confirm(
          "Factory Reset",
          "This will erase ALL saved WiFi credentials and restart the device in AP mode. This cannot be undone.",
          "Factory Reset",
          true
        );

        if (confirmed) {
          toast.warning("Performing factory reset...");
          try {
            await api.factoryReset();
            setTimeout(() => window.location.reload(), 3000);
          } catch (error) {
            toast.error("Factory reset failed: " + error.message);
          }
        }
      };

      $("#btn-export-settings").onclick = async () => {
        try {
          const [device, wifi] = await Promise.all([
            api.getDevice(),
            api.getSavedWiFi(),
          ]);

          const exportData = {
            device: {
              deviceName: device.deviceName,
              firmwareVersion: device.firmwareVersion,
              chipId: device.chipId,
            },
            wifi: {
              savedNetworks: wifi.savedNetworks.map(n => ({
                ssid: n.ssid,
                priority: n.priority,
                autoConnect: n.autoConnect,
              })),
            },
            exportedAt: new Date().toISOString(),
          };

          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `ctn-settings-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);

          toast.success("Settings exported");
        } catch (error) {
          toast.error("Export failed: " + error.message);
        }
      };

    } catch (error) {
      console.error("Settings load failed:", error);
    }
  },

  updateTelegramUI(status) {
    const configured = status.configured;
    const enabled = status.enabled;
    const hasToken = status.hasToken;
    const hasChatId = status.hasChatId;

    $("#tg-status").classList.remove("hidden");
    $("#tg-status").className = "telegram-status " + (configured ? "status-configured" : "status-not-configured");
    $("#tg-status").textContent = configured
      ? `✓ Configured ${enabled ? "(Enabled)" : "(Disabled)"}`
      : "⚠ Not configured";

    if (configured) {
      // Mask token for display
      // We don't have the actual token from the API for security
      // User will need to re-enter if they want to change
      $("#tg-bot-token").placeholder = hasToken ? "••••••••••••••••••••••••••••••••••••" : "Enter bot token";
      $("#tg-chat-id").placeholder = hasChatId ? "•••••••••" : "Enter chat ID";
      $("#tg-enabled").checked = enabled;
    }
  },
};
// ============================================================
// Auto-refresh
// ============================================================
const autoRefresh = {
  start() {
    this.stop();
    STATE.updateTimer = setInterval(() => {
      pageLoader.load(STATE.currentPage);
      this.updateFooter();
    }, CONFIG.updateInterval);
  },

  stop() {
    if (STATE.updateTimer) {
      clearInterval(STATE.updateTimer);
      STATE.updateTimer = null;
    }
  },

  updateFooter() {
    api.getDevice().then(device => {
      if (device.uptime) {
        $("#footer-uptime").textContent = "Uptime: " + formatUptime(device.uptime);
      }
      $("#footer-ip").textContent = window.location.hostname;
    }).catch(() => {});
  },
};

// ============================================================
// Event Listeners
// ============================================================
function bindEvents() {
  $("#btn-scan").addEventListener("click", () => pageLoader.scanNetworks());
  
  $("#btn-reconnect").addEventListener("click", async () => {
    toast.info("Reconnecting...");
    try {
      const status = await api.getWiFiStatus();
      if (status.ssid) {
        await api.connectWiFi(status.ssid, "");
        toast.success("Reconnected");
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      toast.error("Reconnect failed: " + error.message);
    }
  });
  
  $("#btn-disconnect").addEventListener("click", async () => {
    const confirmed = await modal.confirm(
      "Disconnect WiFi",
      "This will disconnect from the current network and enter AP mode.",
      "Disconnect"
    );
    
    if (confirmed) {
      try {
        await api.factoryReset();
        setTimeout(() => window.location.reload(), 3000);
      } catch (error) {
        toast.error("Disconnect failed: " + error.message);
      }
    }
  });
}

// ============================================================
// Initialization
// ============================================================
async function init() {
  theme.init();
  toast.init();
  modal.init();
  navigation.init();
  bindEvents();
  
  const hash = window.location.hash.slice(1);
  if (hash && $("#page-" + hash)) {
    navigation.switchPage(hash);
  } else {
    navigation.switchPage("overview");
  }
  
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.slice(1);
    if (hash && $("#page-" + hash)) {
      navigation.switchPage(hash);
    }
  });
  
  autoRefresh.start();
  autoRefresh.updateFooter();
  
  console.log("CTN AP Dashboard initialized");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.CTN = {
  api,
  toast,
  modal,
  navigation,
  pageLoader,
  STATE,
};
})();
