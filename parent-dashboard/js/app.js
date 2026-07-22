/**
 * CTN Parent Dashboard - Main Application
 * Vanilla JavaScript, ES6 modules pattern
 * Communicates with ESP8266 REST API
 * Mobile-first, responsive, premium IoT dashboard
 */

(function() {
  "use strict";

  // ============================================================
  // Configuration & Constants
  // ============================================================
  const CONFIG = {
    storageKey: "ctn-parent-dashboard",
    defaultRefreshInterval: 10000,
    mapDefaultCenter: [-1.2921, 36.8219],
    mapDefaultZoom: 13,
    toastDuration: 4000,
  };

  const STATE = {
    devices: [],
    currentDevice: null,
    apiBase: "",
    currentPage: "map",
    theme: "light",
    map: null,
    marker: null,
    safezoneLayers: [],
    timelineData: [],
    alerts: [],
    safezones: [],
    isLoading: false,
    updateTimer: null,
    notificationsEnabled: true,
    notificationPermission: "default",
    editingSafezone: null,
    autoRefreshInterval: CONFIG.defaultRefreshInterval,
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

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "--";
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  };

  const formatRSSI = (rssi) => {
    if (rssi >= -50) return { quality: 100, class: "signal-excellent", label: "Excellent" };
    if (rssi >= -60) return { quality: 80, class: "signal-good", label: "Good" };
    if (rssi >= -70) return { quality: 60, class: "signal-fair", label: "Fair" };
    if (rssi >= -80) return { quality: 40, class: "signal-poor", label: "Weak" };
    return { quality: 20, class: "signal-poor", label: "Very Weak" };
  };

  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  const getBehaviourScoreClass = (score) => {
    if (score >= 90) return "excellent";
    if (score >= 70) return "good";
    if (score >= 50) return "fair";
    if (score >= 30) return "poor";
    return "critical";
  };

  const getBehaviourScoreLabel = (score) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    if (score >= 30) return "Poor";
    return "Critical";
  };

  // ============================================================
  // API Client
  // ============================================================
  const api = {
    async request(endpoint, options = {}) {
      if (!STATE.apiBase) throw new Error("No device selected");
      const url = STATE.apiBase.replace(/\/+$/, "") + endpoint;
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
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
      } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
      }
    },
    get(endpoint) { return this.request(endpoint, { method: "GET" }); },
    post(endpoint, data) { return this.request(endpoint, { method: "POST", body: data }); },
    put(endpoint, data) { return this.request(endpoint, { method: "PUT", body: data }); },
    delete(endpoint, data) { return this.request(endpoint, { method: "DELETE", body: data }); },

    getStatus() { return this.get("/api/status"); },
    getDevice() { return this.get("/api/device"); },
    getBattery() { return this.get("/api/battery"); },
    getGPS() { return this.get("/api/gps"); },
    getWiFiStatus() { return this.get("/api/wifi/status"); },
    scanWiFi() { return this.get("/api/wifi/scan"); },
    getSavedWiFi() { return this.get("/api/wifi/saved"); },
    connectWiFi(ssid, password) { return this.post("/api/wifi/connect", { ssid, password }); },
    saveWiFi(ssid, password, priority = 0) { return this.post("/api/wifi/save", { ssid, password, priority }); },
    updateWiFi(ssid, password, priority) { return this.put("/api/wifi/update", { ssid, password, priority }); },
    removeWiFi(ssid) { return this.delete("/api/wifi/remove", { ssid }); },
    restartDevice() { return this.post("/api/device/restart"); },
    factoryReset() { return this.post("/api/device/reset"); },
  };

  // ============================================================
  // Storage Persistence
  // ============================================================
  const storage = {
    load() {
      try {
        const data = localStorage.getItem(CONFIG.storageKey);
        if (data) {
          const parsed = JSON.parse(data);
          STATE.devices = parsed.devices || [];
          STATE.currentDevice = parsed.currentDevice || null;
          STATE.apiBase = parsed.apiBase || "";
          STATE.notificationsEnabled = parsed.notificationsEnabled !== false;
          STATE.autoRefreshInterval = parsed.autoRefreshInterval || CONFIG.defaultRefreshInterval;
          return true;
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
      return false;
    },

    save() {
      try {
        const data = {
          devices: STATE.devices,
          currentDevice: STATE.currentDevice,
          apiBase: STATE.apiBase,
          notificationsEnabled: STATE.notificationsEnabled,
          autoRefreshInterval: STATE.autoRefreshInterval,
        };
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error("Failed to save settings:", e);
        return false;
      }
    },

    addDevice(device) {
      STATE.devices.push(device);
      this.save();
    },

    removeDevice(deviceId) {
      STATE.devices = STATE.devices.filter(d => d.id !== deviceId);
      if (STATE.currentDevice === deviceId) {
        STATE.currentDevice = null;
        STATE.apiBase = "";
      }
      this.save();
    },

    setCurrentDevice(deviceId) {
      const device = STATE.devices.find(d => d.id === deviceId);
      if (device) {
        STATE.currentDevice = deviceId;
        STATE.apiBase = device.apiUrl;
        this.save();
        return true;
      }
      return false;
    },
  };

  // ============================================================
  // Toast Notifications
  // ============================================================
  const toast = {
    container: null,

    init() { this.container = $("#toast-container"); },

    show(message, type = "info", duration = CONFIG.toastDuration) {
      if (!this.container) this.init();
      const el = document.createElement("div");
      el.className = `toast ${type}`;
      el.innerHTML = `<span>${escapeHtml(message)}</span><button class="toast-close" aria-label="Dismiss">&times;</button>`;
      el.querySelector(".toast-close").addEventListener("click", () => this.dismiss(el));
      this.container.appendChild(el);
      if (duration > 0) setTimeout(() => this.dismiss(el), duration);
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
    currentForm: null,

    init() {
      this.overlay = $("#modal-overlay");
      this.title = $("#modal-title");
      this.message = $("#modal-message");
      this.confirmBtn = $("#modal-confirm");
      this.cancelBtn = $("#modal-cancel");
      this.cancelBtn.addEventListener("click", () => this.close(false));
      this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.close(false); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.overlay.classList.contains("hidden")) this.close(false); });
    },

    confirm(title, message, confirmText = "Confirm", danger = false) {
      return new Promise((resolve) => {
        if (!this.overlay) this.init();
        this.title.textContent = title;
        this.message.textContent = message;
        this.confirmBtn.textContent = confirmText;
        this.confirmBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
        this.resolve = resolve;
        this.currentForm = null;
        this.overlay.classList.remove("hidden");
        this.confirmBtn.focus();
        const handler = () => { this.confirmBtn.removeEventListener("click", handler); this.close(true); };
        this.confirmBtn.addEventListener("click", handler);
      });
    },

    form(title, message, formId, confirmText = "Save") {
      return new Promise((resolve) => {
        if (!this.overlay) this.init();
        this.title.textContent = title;
        this.message.textContent = message;
        this.confirmBtn.textContent = confirmText;
        this.confirmBtn.className = "btn btn-primary";
        this.resolve = resolve;
        this.currentForm = formId;
        this.overlay.classList.remove("hidden");
        this.confirmBtn.focus();
        const handler = () => {
          this.confirmBtn.removeEventListener("click", handler);
          const form = document.getElementById(formId);
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries());
          form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.id] = cb.checked; });
          this.close(true, data);
        };
        this.confirmBtn.addEventListener("click", handler);
      });
    },

    close(confirmed, data = null) {
      this.overlay.classList.add("hidden");
      if (this.resolve) {
        this.resolve(confirmed ? data : false);
        this.resolve = null;
        this.currentForm = null;
      }
    },
  };

  // ============================================================
  // Device Modal
  // ============================================================
  const deviceModal = {
    overlay: null,
    confirmBtn: null,
    cancelBtn: null,
    resolve: null,

    init() {
      this.overlay = $("#device-modal-overlay");
      this.confirmBtn = $("#device-modal-confirm");
      this.cancelBtn = $("#device-modal-cancel");
      this.cancelBtn.addEventListener("click", () => this.close(false));
      this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.close(false); });
    },

    open() {
      return new Promise((resolve) => {
        if (!this.overlay) this.init();
        document.getElementById("device-form").reset();
        this.resolve = resolve;
        this.overlay.classList.remove("hidden");
        document.getElementById("dev-name").focus();
        const handler = () => {
          this.confirmBtn.removeEventListener("click", handler);
          const formData = new FormData(document.getElementById("device-form"));
          const data = Object.fromEntries(formData.entries());
          this.close(true, data);
        };
        this.confirmBtn.addEventListener("click", handler);
      });
    },

    close(confirmed, data = null) {
      this.overlay.classList.add("hidden");
      if (this.resolve) { this.resolve(confirmed ? data : false); this.resolve = null; }
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
    toggle() { this.apply(STATE.theme === "light" ? "dark" : "light"); },
  };

  // ============================================================
  // Navigation
  // ============================================================
  const navigation = {
    init() {
      $$(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
          e.preventDefault();
          const page = item.dataset.page;
          if (page) this.switchPage(page);
        });
      });
    },
    switchPage(page) {
      $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === page));
      $$(".page").forEach(pg => pg.classList.toggle("active", pg.id === `page-${page}`));
      STATE.currentPage = page;
      pageLoader.load(page);
      window.location.hash = page;
    },
    getCurrentPage() { return STATE.currentPage; },
  };

  // ============================================================
  // Page Loaders
  // ============================================================
  const pageLoader = {
    async load(page) {
      if (STATE.isLoading) return;
      STATE.isLoading = true;
      try {
        switch (page) {
          case "map": await this.loadMapPage(); break;
          case "timeline": await this.loadTimelinePage(); break;
          case "alerts": await this.loadAlertsPage(); break;
          case "safezones": await this.loadSafezonesPage(); break;
          case "settings": await this.loadSettingsPage(); break;
        }
      } catch (error) {
        console.error(`${page} page load failed:`, error);
        toast.error(`Failed to load ${page} page`);
      } finally {
        STATE.isLoading = false;
      }
    },

    async loadMapPage() {
      if (!STATE.currentDevice) { this.showNoDevice("map"); return; }
      await Promise.all([this.loadDeviceStatus(), this.loadSafezones()]);
      if (!STATE.map) this.initMap();
      else this.renderSafezonesOnMap();
      this.updateMapLocation();
    },

    showNoDevice(pageId) {
      const page = $(`#page-${pageId}`);
      if (!page) return;
      const container = page.querySelector(".grid") || page.querySelector(".main") || page;
      const statsGrid = page.querySelector(".grid-map-stats");
      if (statsGrid) statsGrid.innerHTML = '<div class="card card-wide" style="text-align:center;padding:3rem"><p>Select a device from the dropdown to view map</p></div>';
    },

    async loadDeviceStatus() {
      try {
        const [status, device, battery, gps] = await Promise.all([
          api.getStatus(), api.getDevice(), api.getBattery(), api.getGPS()
        ]);
        this.updateDeviceSelector();
        this.updateMapStats(status, device, battery, gps);
        this.updateFooter(status, device);
      } catch (error) {
        console.error("Device status load failed:", error);
        this.updateConnectionStatus(false);
      }
    },

    updateDeviceSelector() {
      const select = $("#device-select");
      const currentValue = select.value;
      select.innerHTML = `<option value="">Select Device...</option>` +
        STATE.devices.map(d => `<option value="${d.id}" ${d.id === currentValue ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("");
      if (STATE.currentDevice) select.value = STATE.currentDevice;
    },

    updateMapStats(status, device, battery, gps) {
      const batPct = battery.percentage || 0;
      $("#map-battery").textContent = batPct + "%";
      $("#map-battery-state").textContent = battery.state || "Unknown";

      $("#map-satellites").textContent = gps.satellites || "--";
      $("#map-hdop").textContent = gps.hdop ? "HDOP: " + gps.hdop.toFixed(1) : "HDOP: --";

      const wifi = status.wifi || {};
      const signal = wifi.signalQuality !== undefined ? wifi.signalQuality : (wifi.rssi ? formatRSSI(wifi.rssi).quality : 0);
      $("#map-wifi-signal").textContent = signal + "%";
      $("#map-wifi-ssid").textContent = wifi.ssid || "--";

      const behaviourState = status.state?.behaviour || "unknown";
      const riskScore = status.state?.riskScore || 0;
      const score = Math.max(0, 100 - riskScore);
      const scoreClass = getBehaviourScoreClass(score);
      $("#map-behaviour-score").textContent = score;
      $("#map-behaviour-score").className = "card-value behaviour-score " + scoreClass;
      $("#map-behaviour-state").textContent = behaviourState;

      this.updateConnectionStatus(wifi.connected);
    },

    updateConnectionStatus(connected) {
      const badge = $("#device-status");
      if (connected) { badge.textContent = "Connected"; badge.className = "status-badge status-connected"; }
      else { badge.textContent = "Disconnected"; badge.className = "status-badge status-disconnected"; }
    },

    updateFooter(status, device) {
      $("#footer-last-update").textContent = "Last update: " + formatRelativeTime(Date.now());
    },

    initMap() {
      const mapEl = $("#map");
      if (!mapEl) return;

      STATE.map = L.map("map", {
        center: CONFIG.mapDefaultCenter,
        zoom: CONFIG.mapDefaultZoom,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      });

      const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      });
      const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "&copy; Esri, Maxar, GeoEye",
        maxZoom: 19,
      });
      osmLayer.addTo(STATE.map);
      L.control.layers({"OpenStreetMap": osmLayer, "Satellite": satelliteLayer}, null, {position: "topright"}).addTo(STATE.map);

      STATE.marker = L.marker([0, 0], {
        icon: L.divIcon({
          className: "ctn-marker",
          html: `<div class="ctn-marker-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg><div class="ctn-marker-pulse"></div></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
      });

      this.renderSafezonesOnMap();

      STATE.map.on("click", (e) => {
        if (STATE.editingSafezone === "new") {
          document.getElementById("sz-lat").value = e.latlng.lat.toFixed(6);
          document.getElementById("sz-lon").value = e.latlng.lng.toFixed(6);
        }
      });

      // Handle center map button
      $("#btn-center-map").onclick = () => {
        if (STATE.marker && STATE.marker.getLatLng()) {
          STATE.map.setView(STATE.marker.getLatLng(), 16, { animate: true });
        }
      };
    },

    renderSafezonesOnMap() {
      if (!STATE.map) return;
      STATE.safezoneLayers.forEach(layer => STATE.map.removeLayer(layer));
      STATE.safezoneLayers = [];

      STATE.safezones.forEach((zone) => {
        if (!zone.enabled) return;
        const color = zone.type === 0 ? "#1E88E5" : (zone.type === 1 ? "#2E7D32" : "#F57F17");
        const circle = L.circle([zone.latitude, zone.longitude], {
          radius: zone.radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          className: "ctn-safezone",
        }).addTo(STATE.map);
        circle.bindPopup(`<div style="min-width:150px"><strong>${escapeHtml(zone.name)}</strong><br>Type: ${zone.type === 0 ? "Home" : zone.type === 1 ? "School" : "Custom"}<br>Radius: ${zone.radius}m</div>`);
        STATE.safezoneLayers.push(circle);
      });

      if (STATE.safezones.length > 0 && (!STATE.marker || !STATE.marker.getLatLng())) {
        const group = L.featureGroup(STATE.safezoneLayers);
        STATE.map.fitBounds(group.getBounds().pad(0.2));
      }
    },

    updateMapLocation() {
      api.getGPS().then(gps => {
        if (gps.hasFix && gps.latitude && gps.longitude) {
          const latlng = [gps.latitude, gps.longitude];
          if (STATE.marker) STATE.marker.setLatLng(latlng).addTo(STATE.map);
          $("#map-location").textContent = gps.latitude.toFixed(6) + ", " + gps.longitude.toFixed(6);
          $("#map-accuracy").textContent = gps.accuracy ? gps.accuracy.toFixed(1) + " m" : "--";
          $("#map-speed").textContent = gps.speed ? gps.speed.toFixed(1) + " km/h" : "--";
          $("#map-last-update").textContent = formatRelativeTime(Date.now());

          const mapsLink = $("#maps-link");
          if (mapsLink) { mapsLink.href = `https://maps.google.com/?q=${gps.latitude},${gps.longitude}`; mapsLink.disabled = false; }
        } else {
          $("#map-location").textContent = "No GPS fix";
          $("#map-accuracy").textContent = "--";
          $("#map-speed").textContent = "--";
          $("#map-last-update").textContent = "--";
        }
      }).catch(err => {
        console.error("GPS update failed:", err);
        $("#map-location").textContent = "Error loading GPS";
      });
    },

    async loadTimelinePage() {
      if (!STATE.currentDevice) { this.showNoDeviceMessage("timeline"); return; }
      const date = $("#timeline-date").value || new Date().toISOString().split("T")[0];
      STATE.timelineData = this.getStoredTimelineForDate(date);
      this.renderTimeline();
    },

    getStoredTimelineForDate(date) { return []; },

    renderTimeline() {
      const container = $("#timeline-container");
      if (!container) return;
      if (STATE.timelineData.length === 0) {
        container.innerHTML = `<div class="timeline-empty"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-text-muted);"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg><p>No timeline data for this date</p><p class="timeline-hint">Data will appear when device reports location</p></div>`;
        return;
      }
      container.innerHTML = STATE.timelineData.map(item => `
        <div class="timeline-item">
          <div class="timeline-marker ${item.type}">${this.getTimelineMarkerIcon(item.type)}</div>
          <div class="timeline-content">
            <div class="timeline-header"><span class="timeline-type">${escapeHtml(item.typeLabel)}</span><span class="timeline-time">${formatDateTime(item.timestamp)}</span></div>
            <div class="timeline-details">
              ${item.details.map(d => `<div class="timeline-detail"><span class="timeline-detail-label">${escapeHtml(d.label)}</span><span class="timeline-detail-value">${escapeHtml(d.value)}</span></div>`).join("")}
            </div>
          </div>
        </div>
      `).join("");
    },

    getTimelineMarkerIcon(type) {
      switch (type) {
        case "movement": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12l3-3 7 7 10-10"/></svg>`;
        case "stop": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/></svg>`;
        case "alert": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
        case "safezone-entry": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
        case "safezone-exit": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="14" x2="22" y2="19"/><line x1="22" y1="14" x2="17" y2="19"/></svg>`;
        default: return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/></svg>`;
      }
    },

    async loadAlertsPage() {
      if (!STATE.currentDevice) { this.showNoDeviceMessage("alerts"); return; }
      STATE.alerts = this.getStoredAlerts();
      this.renderAlerts();

      // Bind tab filters
      $$(".alert-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          $$(".alert-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          this.renderAlerts(tab.dataset.filter);
        });
      });
    },

    getStoredAlerts() {
      try {
        const key = `ctn-alerts-${STATE.currentDevice}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      } catch { return []; }
    },

    saveAlerts() {
      try {
        const key = `ctn-alerts-${STATE.currentDevice}`;
        localStorage.setItem(key, JSON.stringify(STATE.alerts));
      } catch (e) { console.error("Failed to save alerts:", e); }
    },

    renderAlerts(filter = "all") {
      const list = $("#alert-list");
      if (!list) return;

      let alerts = STATE.alerts;
      if (filter !== "all") alerts = alerts.filter(a => a.type === filter);

      if (alerts.length === 0) {
        list.innerHTML = `<div class="timeline-empty"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-text-muted);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>No alerts</p></div>`;
        $("#btn-clear-alerts").disabled = true;
        return;
      }
      $("#btn-clear-alerts").disabled = false;

      list.innerHTML = alerts.map(alert => `
        <div class="alert-item ${alert.unread ? "unread" : ""}">
          <div class="alert-type ${alert.type}">${this.getAlertIcon(alert.type)}</div>
          <div class="alert-content">
            <div class="alert-title">${escapeHtml(alert.title)}</div>
            <div class="alert-message">${escapeHtml(alert.message)}</div>
            <div class="alert-meta"><span>${escapeHtml(alert.location || "")}</span>${alert.details ? `<span>${escapeHtml(alert.details)}</span>` : ""}</div>
          </div>
          <div class="alert-time">${formatRelativeTime(alert.timestamp)}</div>
        </div>
      `).join("");
    },

    getAlertIcon(type) {
      switch (type) {
        case "panic": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        case "behaviour": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
        case "battery": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="23" y1="9" x2="23" y2="15"/></svg>`;
        case "safezone": return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
        default: return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
      }
    },

    async loadSafezonesPage() {
      if (!STATE.currentDevice) { this.showNoDeviceMessage("safezones"); return; }
      await this.loadSafezones();
      this.renderSafezones();
      if (STATE.map) this.renderSafezonesOnMap();
    },

    loadSafezones() {
      return new Promise((resolve) => {
        try {
          const key = `ctn-safezones-${STATE.currentDevice}`;
          const data = localStorage.getItem(key);
          STATE.safezones = data ? JSON.parse(data) : [];
        } catch { STATE.safezones = []; }
        resolve();
      });
    },

    saveSafezones() {
      try {
        const key = `ctn-safezones-${STATE.currentDevice}`;
        localStorage.setItem(key, JSON.stringify(STATE.safezones));
      } catch (e) { console.error("Failed to save safezones:", e); }
    },

    renderSafezones() {
      const grid = $("#safezones-grid");
      if (!grid) return;

      if (STATE.safezones.length === 0) {
        grid.innerHTML = `
          <div class="card card-wide" style="text-align: center; padding: var(--space-12); grid-column: 1 / -1;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-text-muted); margin-bottom: var(--space-4);"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <h3 style="margin-bottom: var(--space-2);">No Safe Zones</h3>
            <p style="color: var(--color-text-muted); margin-bottom: var(--space-6);">Add geofences to receive arrival/departure alerts</p>
            <button id="btn-add-first-safezone" class="btn btn-primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Your First Safe Zone</button>
          </div>
        `;
        $("#btn-add-first-safezone")?.addEventListener("click", () => this.openSafezoneModal());
        return;
      }

      grid.innerHTML = STATE.safezones.map((zone, index) => `
        <div class="safezone-card">
          <div class="safezone-header">
            <div class="safezone-name">
              <h4>${escapeHtml(zone.name)}</h4>
              <span class="safezone-type-badge ${zone.type === 0 ? "home" : zone.type === 1 ? "school" : "custom"}">
                ${zone.type === 0 ? "Home" : zone.type === 1 ? "School" : "Custom"}
              </span>
            </div>
            <div class="safezone-actions">
              <button class="btn btn-secondary btn-sm btn-edit" data-index="${index}" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="btn btn-danger btn-sm btn-delete" data-index="${index}" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
          <div class="safezone-details">
            <div class="safezone-detail"><span class="safezone-detail-label">Coordinates</span><span class="safezone-detail-value">${zone.latitude.toFixed(6)}, ${zone.longitude.toFixed(6)}</span></div>
            <div class="safezone-detail"><span class="safezone-detail-label">Radius</span><span class="safezone-detail-value">${zone.radius} m</span></div>
            <div class="safezone-detail"><span class="safezone-detail-label">Status</span><span class="safezone-detail-value">${zone.enabled ? "Enabled" : "Disabled"}</span></div>
          </div>
          <div class="safezone-status">
            <span class="status-dot ${zone.enabled ? "active" : "inactive"}"></span>
            <span style="font-size: var(--text-sm); color: var(--color-text-secondary);">
              ${zone.enabled ? "Monitoring active" : "Monitoring disabled"}
            </span>
          </div>
        </div>
      `).join("");

      $$(".btn-edit", grid).forEach(btn => btn.addEventListener("click", () => this.openSafezoneModal(parseInt(btn.dataset.index))));
      $$(".btn-delete", grid).forEach(btn => btn.addEventListener("click", async () => {
        const index = parseInt(btn.dataset.index);
        const confirmed = await modal.confirm("Delete Safe Zone", `Are you sure you want to delete "${STATE.safezones[index].name}"?`, "Delete");
        if (confirmed) {
          STATE.safezones.splice(index, 1);
          this.saveSafezones();
          this.renderSafezones();
          this.renderSafezonesOnMap();
          toast.success("Safe zone deleted");
        }
      }));
    },

    openSafezoneModal(editIndex = null) {
      STATE.editingSafezone = editIndex;
      const form = document.getElementById("safezone-form");
      form.reset();

      const modalTitle = $("#modal-title");
      const modalMessage = $("#modal-message");

      if (editIndex !== null && STATE.safezones[editIndex]) {
        const zone = STATE.safezones[editIndex];
        modalTitle.textContent = "Edit Safe Zone";
        modalMessage.textContent = "Modify the geofence configuration";
        document.getElementById("sz-name").value = zone.name;
        document.getElementById("sz-type").value = zone.type;
        document.getElementById("sz-lat").value = zone.latitude;
        document.getElementById("sz-lon").value = zone.longitude;
        document.getElementById("sz-radius").value = zone.radius;
        document.getElementById("sz-enabled").checked = zone.enabled;
      } else {
        modalTitle.textContent = "Add Safe Zone";
        modalMessage.textContent = "Configure a geofence area for arrival/departure alerts";
        document.getElementById("sz-type").value = "2";
        document.getElementById("sz-radius").value = "100";
        document.getElementById("sz-enabled").checked = true;
      }

      modal.overlay.classList.remove("hidden");
      document.getElementById("sz-name").focus();
    },

    async saveSafezone(data) {
      const zone = {
        name: data["sz-name"],
        type: parseInt(data["sz-type"]),
        latitude: parseFloat(data["sz-lat"]),
        longitude: parseFloat(data["sz-lon"]),
        radius: parseInt(data["sz-radius"]),
        enabled: data["sz-enabled"] === "on" || data["sz-enabled"] === true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (STATE.editingSafezone !== null && STATE.safezones[STATE.editingSafezone]) {
        zone.createdAt = STATE.safezones[STATE.editingSafezone].createdAt;
        STATE.safezones[STATE.editingSafezone] = zone;
      } else {
        STATE.safezones.push(zone);
      }

      this.saveSafezones();
      this.renderSafezones();
      this.renderSafezonesOnMap();

      toast.success(STATE.editingSafezone !== null ? "Safe zone updated" : "Safe zone added");
      STATE.editingSafezone = null;
      modal.overlay.classList.add("hidden");
    },

    async loadSettingsPage() {
      try {
        const device = STATE.currentDevice ? await api.getDevice() : null;
        if (device) {
          $("#device-name").value = device.deviceName || "CTN-001";
          $("#fw-version").value = device.firmwareVersion || "1.0";
          $("#ota-version").textContent = device.firmwareVersion || "1.0";
        }
        $("#api-base-url").value = STATE.apiBase || "";
        $("#auto-refresh").value = STATE.autoRefreshInterval.toString();
        $("#enable-notifications").checked = STATE.notificationsEnabled;

        const select = $("#device-select");
        if (select) {
          select.addEventListener("change", (e) => {
            if (e.target.value) { storage.setCurrentDevice(e.target.value); pageLoader.load(STATE.currentPage); }
          });
        }

        // Settings event handlers
        $("#btn-add-device").onclick = async () => {
          const data = await deviceModal.open();
          if (data) {
            const device = { id: "dev-" + Date.now(), name: data["dev-name"], apiUrl: data["dev-api-url"] };
            storage.addDevice(device);
            pageLoader.updateDeviceSelector();
            toast.success("Device added");
          }
        };

        $("#btn-test-connection").onclick = async () => {
          if (!STATE.currentDevice) { toast.warning("Select a device first"); return; }
          try { await api.getDevice(); toast.success("Connection successful"); }
          catch (e) { toast.error("Connection failed: " + e.message); }
        };

        $("#btn-export-all").onclick = async () => {
          try {
            const [device, alerts, safezones] = await Promise.all([
              api.getDevice().catch(() => null),
              Promise.resolve(this.getStoredAlerts()),
              Promise.resolve(STATE.safezones),
            ]);
            const exportData = { device, alerts, safezones, settings: { devices: STATE.devices }, exportedAt: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `ctn-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
            toast.success("Data exported");
          } catch (e) { toast.error("Export failed: " + e.message); }
        };

        $("#btn-clear-local-data").onclick = async () => {
          const confirmed = await modal.confirm("Clear Local Data", "This will remove all stored device data, alerts, and settings. This cannot be undone.", "Clear All", true);
          if (confirmed) {
            Object.keys(localStorage).forEach(k => { if (k.startsWith("ctn-")) localStorage.removeItem(k); });
            STATE.devices = []; STATE.currentDevice = null; STATE.apiBase = ""; STATE.alerts = []; STATE.safezones = [];
            storage.save(); pageLoader.updateDeviceSelector(); toast.success("Local data cleared");
          }
        };

        // Auto-refresh interval change
        $("#auto-refresh").addEventListener("change", (e) => {
          STATE.autoRefreshInterval = parseInt(e.target.value);
          storage.save();
          autoRefresh.start();
        });

        $("#enable-notifications").addEventListener("change", (e) => {
          STATE.notificationsEnabled = e.target.checked;
          storage.save();
          if (STATE.notificationsEnabled && STATE.notificationPermission === "default") {
            Notification.requestPermission().then(p => { STATE.notificationPermission = p; });
          }
        });
      } catch (error) { console.error("Settings load failed:", error); }
    },

    showNoDeviceMessage(pageId) {
      const page = $(`#page-${pageId}`);
      if (!page) return;
      const container = page.querySelector(".grid") || page.querySelector(".card");
      if (container) container.innerHTML = '<div class="card" style="text-align:center;padding:3rem"><p>Select a device from the header dropdown</p></div>';
    },
  };

  // ============================================================
  // Auto-refresh
  // ============================================================
  const autoRefresh = {
    start() {
      this.stop();
      if (STATE.autoRefreshInterval > 0) {
        STATE.updateTimer = setInterval(() => {
          pageLoader.load(STATE.currentPage);
          this.updateFooter();
        }, STATE.autoRefreshInterval);
      }
    },
    stop() {
      if (STATE.updateTimer) { clearInterval(STATE.updateTimer); STATE.updateTimer = null; }
    },
    updateFooter() {
      if (STATE.currentDevice) {
        api.getDevice().then(device => {
          if (device?.uptime) $("#footer-last-update").textContent = "Last update: " + formatRelativeTime(Date.now());
        }).catch(() => {});
      }
    },
  };

  // ============================================================
  // Event Binding
  // ============================================================
  function bindEvents() {
    // Timeline date change
    $("#timeline-date")?.addEventListener("change", () => pageLoader.load("timeline"));

    // Export timeline
    $("#btn-export-timeline")?.addEventListener("click", () => {
      const exportData = { timeline: STATE.timelineData, date: $("#timeline-date").value, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `ctn-timeline-${$("#timeline-date").value}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
      toast.success("Timeline exported");
    });

    // Clear alerts
    $("#btn-clear-alerts")?.addEventListener("click", async () => {
      const confirmed = await modal.confirm("Clear All Alerts", "This will remove all alerts from the list. This cannot be undone.", "Clear");
      if (confirmed) { STATE.alerts = []; pageLoader.saveAlerts(); pageLoader.renderAlerts($(".alert-tab.active")?.dataset.filter || "all"); toast.success("All alerts cleared"); }
    });

    // Add safezone
    $("#btn-add-safezone")?.addEventListener("click", () => pageLoader.openSafezoneModal());

    // Modal confirm handler
    modal.confirmBtn?.addEventListener("click", async () => {
      if (modal.currentForm === "safezone-form") {
        const formData = new FormData(document.getElementById("safezone-form"));
        const data = Object.fromEntries(formData.entries());
        document.getElementById("safezone-form").querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.id] = cb.checked; });
        await pageLoader.saveSafezone(data);
        modal.close(true);
      }
    });

    // Map layers button
    $("#btn-map-layers")?.addEventListener("click", () => {
      if (STATE.map) {
        const controls = STATE.map._controlCorners.topright;
        if (controls) controls.style.display = controls.style.display === "none" ? "block" : "none";
      }
    });

    // Notification permission request on first interaction
    document.addEventListener("click", () => {
      if (STATE.notificationsEnabled && STATE.notificationPermission === "default") {
        Notification.requestPermission().then(p => { STATE.notificationPermission = p; });
      }
    }, { once: true });
  }

  // ============================================================
  // Alert Simulation (for demo/testing)
  // ============================================================
  function simulateAlerts() {
    window.addTestAlert = (type = "panic") => {
      const alert = {
        id: "alert-" + Date.now(),
        type: type,
        title: type === "panic" ? "PANIC BUTTON ACTIVATED" : (type === "battery" ? "Low Battery" : "Behaviour Alert"),
        message: type === "panic" ? "Emergency panic button pressed!" : (type === "battery" ? "Battery below 20%" : "Unusual movement detected"),
        timestamp: Date.now(),
        unread: true,
        location: "Current GPS location",
        details: "Tap for more info",
      };
      STATE.alerts.unshift(alert);
      pageLoader.saveAlerts();
      pageLoader.renderAlerts($(".alert-tab.active")?.dataset.filter || "all");
      showNotification(alert.title, alert.message, type);
    };
  }

  function showNotification(title, message, type = "info") {
    if (!STATE.notificationsEnabled) return;
    if (STATE.notificationPermission === "granted") {
      new Notification(title, { body: message, icon: "/assets/logo.svg", tag: "ctn-alert-" + Date.now() });
    } else if (STATE.notificationPermission === "default") {
      Notification.requestPermission().then(perm => { STATE.notificationPermission = perm; if (perm === "granted") showNotification(title, message, type); });
    }
    toast.show(message, type);
  }

  // ============================================================
  // Initialization
  // ============================================================
  async function init() {
    theme.init();
    toast.init();
    modal.init();
    deviceModal.init();
    navigation.init();
    bindEvents();
    simulateAlerts();

    storage.load();
    pageLoader.updateDeviceSelector();

    const hash = window.location.hash.slice(1);
    if (hash && $("#page-" + hash)) navigation.switchPage(hash);
    else navigation.switchPage("map");

    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.slice(1);
      if (hash && $("#page-" + hash)) navigation.switchPage(hash);
    });

    autoRefresh.start();

    console.log("CTN Parent Dashboard initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for debugging
  window.CTN = { api, toast, modal, navigation, pageLoader, storage, STATE, CONFIG };
})();