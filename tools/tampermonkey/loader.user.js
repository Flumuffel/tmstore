// ==UserScript==
// @name         Klixa TM Store Loader
// @namespace    klixa.tm.store
// @version      0.4.25
// @author LWE
// @description  Loads approved Intranet apps from GitHub Raw manifest
// @match        https://intranet.klixa.ch/*
// @updateURL    https://raw.githubusercontent.com/Flumuffel/tmstore/refs/heads/main/tools/tampermonkey/loader.user.js
// @downloadURL  https://raw.githubusercontent.com/Flumuffel/tmstore/refs/heads/main/tools/tampermonkey/loader.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      api.github.com
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  "use strict";
  if (window.__TM_STORE_LOADER_ACTIVE__) {
    return;
  }
  window.__TM_STORE_LOADER_ACTIVE__ = true;

  var GITHUB_OWNER = "Flumuffel";
  var GITHUB_REPO = "tmstore";
  var GITHUB_REF = "main";
  var RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/refs/heads/" + GITHUB_REF;
  var MANIFEST_URL = RAW_BASE + "/api/tm-store/apps.json";
  var LOADER_REMOTE_URL = RAW_BASE + "/tools/tampermonkey/loader.user.js";
  var LOADER_CONTENT_API_URL =
    "https://api.github.com/repos/" +
    GITHUB_OWNER +
    "/" +
    GITHUB_REPO +
    "/contents/tools/tampermonkey/loader.user.js?ref=" +
    encodeURIComponent(GITHUB_REF);
  var REPO_URL = "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO;
  var CACHE_KEY = "tm_store_cache_v1_" + GITHUB_OWNER + "_" + GITHUB_REPO + "_" + GITHUB_REF;
  var SETTINGS_KEY = "tm_store_settings_v1";
  var UPDATE_CHECK_KEY = "tm_store_loader_update_check_v1";
  var UPDATE_ACK_KEY = "tm_store_loader_update_ack_v1";
  var AUTHOR_CMD_STATE_KEY = "tm_store_author_cmd_state_v1";
  var COMMIT_API_COOLDOWN_KEY = "tm_store_commit_api_cooldown_v1";
  var LOADER_LOCAL_VERSION =
    (typeof GM_info !== "undefined" &&
      GM_info &&
      GM_info.script &&
      GM_info.script.version)
      ? String(GM_info.script.version)
      : "0.2.3";
  var LOADER_AUTHOR =
    (typeof GM_info !== "undefined" &&
      GM_info &&
      GM_info.script &&
      GM_info.script.author)
      ? String(GM_info.script.author)
      : "LWE";
  var UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  var DEFAULT_SETTINGS = {
    enabledApps: {
      
    },
    ui: {
      open: false
    },
    update: {
      intervalMs: UPDATE_CHECK_INTERVAL_MS,
      notifyPeriodicToast: true
    },
    appSettings: {}
  };
  var RUNTIME = {
    apps: [],
    registryUpdatedAt: null,
    loaded: {},
    status: [],
    logs: [],
    loadedCss: {},
    fastCmdApplied: {},
    toastSeq: 0,
    updateTimerId: null,
    deferredAppsQueue: [],
    deferredAppsQueuedMap: {},
    deferredAppsRunScheduled: false,
    storeUi: {
      searchQuery: "",
      page: 1
    },
    loaderUpdate: {
      checkedAt: 0,
      remoteVersion: null,
      hasUpdate: false,
      commitTitle: null,
      commitUrl: null,
      commitSha: null,
      commitRateLimitedUntil: 0
    }
  };

  function ensureStoreRoot() {
    var host = document.getElementById("tm-store-root-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "tm-store-root-host";
      document.body.appendChild(host);
    }
    if (!host.shadowRoot) {
      host.attachShadow({ mode: "open" });
    }
    return host.shadowRoot;
  }

  function addLog(level, scope, message, data) {
    var entry = {
      at: new Date().toISOString(),
      level: level || "info",
      scope: scope || "store",
      message: message || "",
      data: data || null
    };
    RUNTIME.logs.push(entry);
    if (RUNTIME.logs.length > 250) {
      RUNTIME.logs.shift();
    }
    try {
      if (entry.level === "error") {
        console.error("[TM-STORE][" + entry.scope + "]", entry.message, entry.data || "");
      } else {
        console.log("[TM-STORE][" + entry.scope + "]", entry.message, entry.data || "");
      }
    } catch (err) {}
  }

  function now() {
    return Date.now();
  }

  function logInfo(msg, data) {
    console.info("[TM-STORE]", msg, data || "");
    addLog("info", "store", msg, data || null);
  }

  function safeParse(json, fallback) {
    try {
      return JSON.parse(json);
    } catch (err) {
      return fallback;
    }
  }

  function parseVersionParts(v) {
    return String(v || "0").split(".").map(function (x) {
      var n = parseInt(x, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  function isVersionNewer(remote, local) {
    var a = parseVersionParts(remote);
    var b = parseVersionParts(local);
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i += 1) {
      var av = a[i] || 0;
      var bv = b[i] || 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return false;
  }

  function extractUserscriptVersion(source) {
    if (!source) return null;
    var match = source.match(/@version\s+([0-9]+(?:\.[0-9]+)*)/);
    return match ? match[1] : null;
  }

  function decodeBase64Utf8(input) {
    try {
      var cleaned = String(input || "").replace(/\s/g, "");
      return decodeURIComponent(escape(atob(cleaned)));
    } catch (err) {
      try {
        return atob(String(input || "").replace(/\s/g, ""));
      } catch (err2) {
        return "";
      }
    }
  }

  function equalsIgnoreCase(a, b) {
    return String(a || "").toLowerCase() === String(b || "").toLowerCase();
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var parts = [];
    for (var i = 0; i < bytes.length; i += 1) {
      parts.push(bytes[i].toString(16).padStart(2, "0"));
    }
    return parts.join("");
  }

  async function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) return null;
    var data = new TextEncoder().encode(text);
    var digest = await window.crypto.subtle.digest("SHA-256", data);
    return toHex(digest);
  }

  function gmRequest(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: {
          Accept: "application/json"
        },
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
            return;
          }
          reject(new Error("HTTP " + res.status + " on " + url));
        },
        onerror: function (err) {
          reject(err);
        }
      });
    });
  }

  function gmRequestText(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: {
          Accept: "text/plain"
        },
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
            return;
          }
          reject(new Error("HTTP " + res.status + " on " + url));
        },
        onerror: function (err) {
          reject(err);
        }
      });
    });
  }

  function loadSettings() {
    var raw = GM_getValue(SETTINGS_KEY, "");
    var parsed = !raw ? DEFAULT_SETTINGS : safeParse(raw, DEFAULT_SETTINGS);
    parsed.enabledApps = parsed.enabledApps || {};
    parsed.ui = parsed.ui || { open: false };
    parsed.update = parsed.update || {};
    if (!parsed.update.intervalMs || Number(parsed.update.intervalMs) < 60 * 1000) {
      parsed.update.intervalMs = UPDATE_CHECK_INTERVAL_MS;
    }
    if (typeof parsed.update.notifyPeriodicToast !== "boolean") {
      parsed.update.notifyPeriodicToast = true;
    }
    parsed.appSettings = parsed.appSettings || {};
    GM_setValue(SETTINGS_KEY, JSON.stringify(parsed));
    return parsed;
  }

  function getUpdateIntervalMs(settings) {
    var val = settings && settings.update ? Number(settings.update.intervalMs) : 0;
    if (!val || val < 60 * 1000) return UPDATE_CHECK_INTERVAL_MS;
    return val;
  }

  function getAppSettings(settings, appId) {
    var map = settings && settings.appSettings ? settings.appSettings : {};
    var value = map[appId];
    if (value && typeof value === "object") return value;
    return {};
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatAppListDate(value) {
    if (!value) return "-";
    var dt = new Date(String(value));
    if (isNaN(dt.getTime())) return String(value);
    try {
      var parts = new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(dt);
      var map = {};
      for (var i = 0; i < parts.length; i += 1) {
        map[parts[i].type] = parts[i].value;
      }
      return map.day + "/" + map.month + "/" + map.year + " " + map.hour + ":" + map.minute;
    } catch (err) {
      return String(value);
    }
  }

  function formatDateTimeBerlin(value, withSeconds) {
    if (!value) return "-";
    var dt = new Date(Number(value) || String(value));
    if (isNaN(dt.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: withSeconds ? "2-digit" : undefined,
        hour12: false
      }).format(dt);
    } catch (err) {
      return "-";
    }
  }

  function formatDurationShort(ms) {
    var total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    if (mins > 0) return mins + "m " + secs + "s";
    return secs + "s";
  }

  function loadUpdateState() {
    var raw = GM_getValue(UPDATE_CHECK_KEY, "");
    if (!raw) return { checkedAt: 0, remoteVersion: null, hasUpdate: false, commitTitle: null, commitUrl: null, commitSha: null, commitRateLimitedUntil: 0 };
    return safeParse(raw, { checkedAt: 0, remoteVersion: null, hasUpdate: false, commitTitle: null, commitUrl: null, commitSha: null, commitRateLimitedUntil: 0 });
  }

  function saveUpdateState(state) {
    GM_setValue(UPDATE_CHECK_KEY, JSON.stringify(state));
  }

  function loadUpdateAck() {
    return GM_getValue(UPDATE_ACK_KEY, "");
  }

  function saveUpdateAck(version) {
    GM_setValue(UPDATE_ACK_KEY, String(version || ""));
  }

  function loadCommitCooldownUntil() {
    return Number(GM_getValue(COMMIT_API_COOLDOWN_KEY, 0)) || 0;
  }

  function saveCommitCooldownUntil(ts) {
    GM_setValue(COMMIT_API_COOLDOWN_KEY, Number(ts || 0));
  }

  function normalizeUpdateStateWithLocalVersion(state) {
    var next = state || loadUpdateState();
    if (next && next.hasUpdate && next.remoteVersion && !isVersionNewer(next.remoteVersion, LOADER_LOCAL_VERSION)) {
      next.hasUpdate = false;
      next.remoteVersion = LOADER_LOCAL_VERSION;
      saveUpdateState(next);
    }
    return next;
  }

  async function fetchLatestLoaderCommit() {
    var cooldownUntil = loadCommitCooldownUntil();
    if (cooldownUntil && now() < cooldownUntil) {
      return { title: null, url: null, sha: null, rateLimitedUntil: cooldownUntil };
    }
    var apiUrl =
      "https://api.github.com/repos/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/commits?path=tools/tampermonkey/loader.user.js&sha=" +
      encodeURIComponent(GITHUB_REF) +
      "&per_page=1";
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: apiUrl,
        headers: {
          Accept: "application/json"
        },
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            var arr = safeParse(res.responseText, []);
            if (!Array.isArray(arr) || !arr.length) {
              resolve({ title: null, url: null, sha: null, rateLimitedUntil: 0 });
              return;
            }
            var c = arr[0] || {};
            var msg = c.commit && c.commit.message ? String(c.commit.message) : "";
            resolve({
              title: msg ? msg.split("\n")[0] : null,
              url: c.html_url || null,
              sha: c.sha ? String(c.sha).slice(0, 7) : null,
              rateLimitedUntil: 0
            });
            return;
          }
          if (res.status === 403) {
            var body = safeParse(res.responseText || "{}", {});
            var message = String((body && body.message) || "");
            if (message.toLowerCase().indexOf("rate limit exceeded") !== -1) {
              var until = now() + (60 * 60 * 1000);
              saveCommitCooldownUntil(until);
              resolve({ title: null, url: null, sha: null, rateLimitedUntil: until });
              return;
            }
          }
          reject(new Error("HTTP " + res.status + " on " + apiUrl));
        },
        onerror: function (err) {
          reject(err);
        }
      });
    });
  }

  function loadCachedRegistry() {
    var raw = GM_getValue(CACHE_KEY, "");
    if (!raw) return null;
    return safeParse(raw, null);
  }

  function saveRegistryCache(registry) {
    GM_setValue(
      CACHE_KEY,
      JSON.stringify({
        updatedAt: now(),
        registry: registry
      })
    );
  }

  async function fetchRegistry() {
    var txt = await gmRequest(MANIFEST_URL);
    var payload = safeParse(txt, null);
    if (!payload || !payload.apps) {
      throw new Error("Invalid registry payload");
    }
    logInfo("Manifest geladen von", MANIFEST_URL);
    addLog("info", "network", "Manifest erfolgreich geladen", { url: MANIFEST_URL });
    return payload;
  }

  async function refreshRegistryInBackground() {
    try {
      var payload = await fetchRegistry();
      saveRegistryCache(payload);
      var apps = payload && Array.isArray(payload.apps) ? payload.apps : [];
      RUNTIME.apps = apps;
      RUNTIME.registryUpdatedAt = payload && payload.updatedAt ? payload.updatedAt : null;
      if (document.body) {
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      }
      addLog("info", "network", "Manifest im Hintergrund aktualisiert", {
        apps: apps.length,
        updatedAt: RUNTIME.registryUpdatedAt || null
      });
      return true;
    } catch (err) {
      addLog("error", "network", "Manifest-Hintergrundupdate fehlgeschlagen", {
        error: err && err.message ? err.message : "Unbekannt"
      });
      return false;
    }
  }

  function isApprovedAndPublished(app) {
    return app && app.status === "published" && app.approved === true;
  }

  function appIsEnabled(appId, settings) {
    return !!(settings.enabledApps && settings.enabledApps[appId]);
  }

  async function runApp(app) {
    if (app.cssUrl) {
      if (!RUNTIME.loadedCss[app.id]) {
        try {
          addLog("info", "app:" + app.id, "Lade App-CSS", { url: app.cssUrl });
          var cssText = await gmRequestText(app.cssUrl);
          GM_addStyle(cssText);
          RUNTIME.loadedCss[app.id] = true;
          addLog("info", "app:" + app.id, "App-CSS injiziert", { bytes: cssText.length });
        } catch (cssErr) {
          addLog("error", "app:" + app.id, "App-CSS konnte nicht geladen werden", {
            url: app.cssUrl,
            error: cssErr && cssErr.message ? cssErr.message : "Unbekannt"
          });
        }
      } else {
        addLog("info", "app:" + app.id, "App-CSS bereits injiziert");
      }
    }

    addLog("info", "app:" + app.id, "Lade App-Bundle", { url: app.bundleUrl, version: app.version });
    var code = await gmRequestText(app.bundleUrl);
    if (app.sha256) {
      var hash = await sha256Hex(code);
      if (!hash || !equalsIgnoreCase(hash, app.sha256)) {
        addLog("error", "app:" + app.id, "SHA256 stimmt nicht", { expected: app.sha256, actual: hash });
        throw new Error("SHA256 mismatch for " + app.id);
      }
    }
    window.__TM_STORE_DEBUG = {
      log: function (scope, message, data) {
        addLog("info", scope || ("app:" + app.id), message || "", data || null);
      },
      error: function (scope, message, data) {
        addLog("error", scope || ("app:" + app.id), message || "", data || null);
      }
    };
    window.__TM_STORE_CONTEXT = {
      appId: app.id,
      appVersion: app.version,
      settingsKey: SETTINGS_KEY,
      repository: REPO_URL,
      cssInjectedByLoader: !!RUNTIME.loadedCss[app.id],
      appSettings: getAppSettings(loadSettings(), app.id)
    };
    window.__TM_STORE_GET_APP_SETTINGS = function (id) {
      return getAppSettings(loadSettings(), id || app.id);
    };
    var wrapped = "(function(window, document){\n" + code + "\n})(window, document);";
    try {
      // Controlled app execution scope for bundled apps.
      // eslint-disable-next-line no-new-func
      var execute = new Function(wrapped);
      execute();
      logInfo("Loaded app " + app.id + "@" + app.version);
      return { ok: true, message: "Geladen" };
    } catch (err) {
      console.error("[TM-STORE] Failed to run app " + app.id, err);
      addLog("error", "app:" + app.id, "App-Ausführung fehlgeschlagen", { error: err && err.message ? err.message : "Unbekannt" });
      return { ok: false, message: "Laufzeitfehler: " + (err && err.message ? err.message : "Unbekannt") };
    }
  }

  function saveSettings(settings) {
    GM_setValue(SETTINGS_KEY, JSON.stringify(settings));
  }

  function toggleApp(appId) {
    var settings = loadSettings();
    settings.enabledApps = settings.enabledApps || {};
    settings.enabledApps[appId] = !settings.enabledApps[appId];
    saveSettings(settings);
    renderStoreOverlay(RUNTIME.apps, settings);
    if (settings.enabledApps[appId]) {
      var found = null;
      for (var i = 0; i < RUNTIME.apps.length; i += 1) {
        if (RUNTIME.apps[i].id === appId) {
          found = RUNTIME.apps[i];
          break;
        }
      }
      if (found && !RUNTIME.loaded[appId]) {
        if (found.onDocumentLoad && document.readyState !== "complete") {
          // Für schnelle Page-Reloads wie F5: App-Ausführung erst nach dem echten "load" starten.
          if (!RUNTIME.deferredAppsQueuedMap[appId]) {
            RUNTIME.deferredAppsQueuedMap[appId] = true;
            RUNTIME.deferredAppsQueue.push(found);
          }
          scheduleDeferredApps();
          // UI bleibt konsistent; Ausführung passiert später.
          return;
        }

        runApp(found).then(function () {
          RUNTIME.loaded[appId] = true;
          RUNTIME.status.push({ appId: appId, ok: true, message: "Geladen (manuell aktiviert)" });
          renderBootFeedback();
        }).catch(function (err) {
          console.error("[TM-STORE] app toggle load failed", err);
          RUNTIME.status.push({ appId: appId, ok: false, message: "Fehler: " + (err && err.message ? err.message : "Unbekannt") });
          renderBootFeedback();
        });
      }
    } else {
      RUNTIME.loaded[appId] = false;
      delete RUNTIME.deferredAppsQueuedMap[appId];
      RUNTIME.status.push({ appId: appId, ok: true, message: "Deaktiviert (ohne Reload)" });
      renderBootFeedback();
      showToast(
        "Apps deaktiviert erkannt",
        "Um alle Änderungen sicher zu sehen, bitte Seite refreshen.",
        {
          variant: "warn",
          duration: 0,
          replaceKey: "app-deactivated-refresh",
          actionLabel: "Refresh",
          onAction: function () {
            window.location.reload();
          }
        }
      );
      renderStoreOverlay(RUNTIME.apps, settings);
    }
  }

  function appCardHtml(app, enabled) {
    var changelog = (app.changelog || []).map(function (line) {
      return "<li>" + line + "</li>";
    }).join("");
    var last = null;
    for (var i = RUNTIME.status.length - 1; i >= 0; i -= 1) {
      if (RUNTIME.status[i].appId === app.id) {
        last = RUNTIME.status[i];
        break;
      }
    }
    var statusBadge = "<span class='tm-badge neutral'>Nicht geladen</span>";
    if (last) {
      statusBadge = last.ok ? "<span class='tm-badge ok'>Geladen</span>" : "<span class='tm-badge fail'>Fehler</span>";
    } else if (enabled) {
      statusBadge = "<span class='tm-badge neutral'>Aktiviert</span>";
    } else {
      statusBadge = "<span class='tm-badge neutral'>Deaktiviert</span>";
    }
    var authorRaw = String(app.author || "").trim();
    var authorLabel = authorRaw ? ("@" + authorRaw) : "@-";
    return (
      "<article class='tm-store-card'>" +
        "<div class='tm-store-card-head'>" +
          "<h4>" + app.name + "</h4>" +
          "<span>v" + app.version + "</span>" +
        "</div>" +
        "<p>" + app.description + "</p>" +
        "<div class='tm-store-card-info'><a href='#' class='tm-store-author-link' data-author-cmd='" + escapeHtml(app.id) + "' data-author-name='" + escapeHtml(authorRaw) + "'>" + escapeHtml(authorLabel) + "</a></div>" +
        "<div class='tm-store-state-row'>" + statusBadge + "</div>" +
        "<ul>" + changelog + "</ul>" +
        "<button data-app-toggle='" + app.id + "' class='tm-store-btn " + (enabled ? "is-on" : "is-off") + "'>" +
          (enabled ? "Deaktivieren" : "Aktivieren") +
        "</button>" +
      "</article>"
    );
  }

  function ensureStoreStyles() {
    var root = ensureStoreRoot();
    if (root.getElementById("tm-store-style")) return;
    var style = document.createElement("style");
    style.id = "tm-store-style";
    style.textContent =
      ".tm-store-fab{position:fixed;right:18px;bottom:18px;z-index:999999;background:linear-gradient(135deg,#6d7dff,#39b7ff);color:#061326;border:none;border-radius:999px;padding:12px 16px;cursor:pointer;font-weight:800;box-shadow:0 12px 28px rgba(0,0,0,.35)}" +
      ".tm-store-fab.has-update{box-shadow:0 0 0 2px rgba(255,95,95,.35),0 12px 28px rgba(0,0,0,.35)}" +
      ".tm-store-fab-badge{position:absolute;top:-6px;right:-4px;width:12px;height:12px;border-radius:50%;background:#ff3a3a;border:2px solid #fff;display:none}" +
      ".tm-store-fab-badge.show{display:block;animation:tmPulse 1.3s infinite}" +
      "@keyframes tmPulse{0%{transform:scale(1);opacity:1}70%{transform:scale(1.35);opacity:.35}100%{transform:scale(1);opacity:1}}" +
      ".tm-store-overlay{position:fixed;inset:0;background:rgba(4,10,22,.7);backdrop-filter:blur(6px);z-index:999998;display:none;align-items:center;justify-content:center;padding:24px}" +
      ".tm-store-panel{width:min(1040px,96vw);max-height:92vh;overflow:auto;background:radial-gradient(circle at 12% -8%,#273c66 0%,#111a31 42%,#0a1120 100%);color:#eef2ff;border:1px solid #4b6290;border-radius:20px;padding:18px;box-shadow:0 30px 70px rgba(0,0,0,.5)}" +
      ".tm-store-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:12px;border-bottom:1px solid rgba(134,159,206,.28)}" +
      ".tm-store-title{display:flex;flex-direction:column;gap:4px}" +
      ".tm-store-subtitle{margin:0;color:#bcd0f5;font-size:13px}" +
      ".tm-store-pills{display:flex;gap:8px;flex-wrap:wrap}" +
      ".tm-store-version-pill{display:inline-flex;align-items:center;gap:6px;width:fit-content;padding:4px 9px;border-radius:999px;background:rgba(73,102,160,.28);border:1px solid rgba(129,168,244,.45);font-size:12px;color:#dce9ff}" +
      ".tm-store-meta{margin:12px 0 0 0;padding:10px 12px;border:1px solid rgba(91,123,184,.3);border-radius:12px;background:rgba(14,24,46,.45)}" +
      ".tm-store-meta p{margin:6px 0;color:#d3def6;font-size:13px}" +
      ".tm-store-search-wrap{margin-top:12px;padding:10px 12px;border:1px solid rgba(91,123,184,.3);border-radius:12px;background:rgba(14,24,46,.45);display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".tm-store-search-input{flex:1;min-width:260px;background:#0d1629;color:#e8f1ff;border:1px solid #4f6591;border-radius:10px;padding:9px 11px;font-size:13px}" +
      ".tm-store-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px}" +
      ".tm-store-card{position:relative;background:linear-gradient(180deg,rgba(39,57,91,.92) 0%,rgba(22,36,63,.94) 100%);border:1px solid #5878b0;border-radius:14px;padding:13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 12px 22px rgba(0,0,0,.25)}" +
      ".tm-store-card::after{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,rgba(148,193,255,.08),rgba(255,255,255,0) 46%);pointer-events:none}" +
      ".tm-store-card h4{margin:0;font-size:17px;letter-spacing:.3px}" +
      ".tm-store-card p{margin:8px 0;color:#cdddff;font-size:14px}" +
      ".tm-store-card ul{margin:8px 0 0 18px;padding:0;color:#aac0e9;font-size:13px}" +
      ".tm-store-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-card-info{font-size:12px;color:#9fb3dd}" +
      ".tm-store-author-link{color:#9dc2ff;text-decoration:none}" +
      ".tm-store-author-link:hover{text-decoration:underline}" +
      ".tm-store-empty{margin-top:14px;padding:12px;border:1px dashed #5e7ab1;border-radius:12px;background:rgba(11,19,37,.55);color:#d5e3ff;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".tm-store-pager{margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".tm-store-pager-info{font-size:12px;color:#bcd0f5}" +
      ".tm-store-state-row{margin-top:8px}" +
      ".tm-badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700}" +
      ".tm-badge.ok{background:#175b35;color:#d5ffe7;border:1px solid #39b86f}" +
      ".tm-badge.fail{background:#631d1d;color:#ffdede;border:1px solid #d14f4f}" +
      ".tm-badge.neutral{background:#243653;color:#dbe8ff;border:1px solid #506c99}" +
      ".tm-store-btn{margin-top:10px;padding:8px 12px;border-radius:10px;border:1px solid #78a2e8;background:linear-gradient(180deg,#3e63a9 0%,#2d4a82 100%);color:#f1f6ff;cursor:pointer;font-weight:700}" +
      ".tm-store-btn.is-on{background:#7f1d1d;border-color:#ef4444}" +
      ".tm-store-close{background:#263d63;color:#e8eefc;border:1px solid #7293cd;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-debug-btn{background:#1f4a38;color:#d7ffe5;border:1px solid #45a67a;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-update-btn{background:#5b3f13;color:#ffe8c8;border:1px solid #d59a42;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-settings-btn{background:#2a3550;color:#e6efff;border:1px solid #7e93bf;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-link{color:#9dc2ff;text-decoration:none}" +
      ".tm-store-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
      ".tm-store-update-banner{margin:12px 0;padding:10px 12px;border:1px solid #8b6a35;border-radius:12px;background:linear-gradient(135deg,rgba(96,60,15,.45),rgba(58,43,24,.35));color:#ffe9cf}" +
      ".tm-store-update-actions{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".tm-store-update-hub{margin-top:12px;padding:12px;border:1px solid #5e6f97;border-radius:14px;background:linear-gradient(155deg,rgba(20,32,58,.82),rgba(9,17,35,.82));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}" +
      ".tm-store-update-hub-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".tm-store-update-hub-title{font-weight:800;font-size:15px;letter-spacing:.2px}" +
      ".tm-store-update-chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid #5878b0;background:#243653;color:#dbe8ff}" +
      ".tm-store-update-chip.ok{background:#173f2d;border-color:#39b86f;color:#d5ffe7}" +
      ".tm-store-update-chip.warn{background:#5b3f13;border-color:#d59a42;color:#ffe8c8}" +
      ".tm-store-update-chip.neutral{background:#243653;border-color:#5878b0;color:#dbe8ff}" +
      ".tm-store-update-hub-grid{margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}" +
      ".tm-store-update-kv{font-size:12px;color:#cbd9f7;background:rgba(18,28,51,.6);border:1px solid rgba(98,121,168,.45);border-radius:10px;padding:8px}" +
      ".tm-store-update-kv strong{color:#eef3ff}" +
      ".tm-store-update-kv.error{border-color:#d14f4f;color:#ffd3d3;background:rgba(58,15,20,.35)}" +
      ".tm-store-update-hub-actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}" +
      ".tm-store-confirm-btn{background:#1c5b33;color:#d7ffe5;border:1px solid #3ca86a;border-radius:8px;padding:6px 10px;cursor:pointer}" +
      ".tm-store-toaster{position:fixed;right:18px;bottom:76px;z-index:1000000;display:flex;flex-direction:column;gap:8px;max-width:420px}" +
      ".tm-store-toast{background:linear-gradient(145deg,rgba(12,20,36,.96),rgba(16,31,58,.94));border:1px solid #4f6fa5;border-radius:12px;color:#eaf2ff;padding:10px 12px;box-shadow:0 18px 40px rgba(0,0,0,.45);backdrop-filter:blur(6px);animation:tmToastIn .22s ease-out}" +
      ".tm-store-toast.ok{border-color:#3ca86a}" +
      ".tm-store-toast.warn{border-color:#d59a42}" +
      ".tm-store-toast.error{border-color:#d14f4f}" +
      ".tm-store-toast-head{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-toast-title{font-size:13px;font-weight:800}" +
      ".tm-store-toast-close{background:transparent;border:0;color:#9dc2ff;cursor:pointer;font-size:14px}" +
      ".tm-store-toast-desc{margin-top:4px;font-size:12px;color:#d7e4ff;line-height:1.4}" +
      ".tm-store-toast-actions{margin-top:8px;display:flex;gap:8px}" +
      ".tm-store-toast-action-btn{background:#223a61;color:#e8eefc;border:1px solid #7293cd;border-radius:8px;padding:6px 10px;cursor:pointer}" +
      "@keyframes tmToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}" +
      ".tm-store-debug{margin-top:12px;border:1px solid #4f6591;border-radius:12px;padding:10px;background:rgba(8,14,29,.65)}" +
      ".tm-store-debug-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}" +
      ".tm-store-debug-pre{font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;line-height:1.35;max-height:240px;overflow:auto;color:#cfe1ff;background:#0b1220;border:1px solid #334a73;border-radius:8px;padding:8px}" +
      ".tm-store-settings{margin-top:12px;border:1px solid #4f6591;border-radius:12px;padding:12px;background:rgba(8,14,29,.72)}" +
      ".tm-store-settings h4{margin:0 0 8px 0}" +
      ".tm-store-settings-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}" +
      ".tm-store-settings-grid{margin-top:12px}" +
      ".tm-store-field{display:flex;flex-direction:column;gap:6px}" +
      ".tm-store-field label{font-size:12px;color:#bdd1f5}" +
      ".tm-store-field select,.tm-store-field textarea,.tm-store-field input{background:#0d1629;color:#e8f1ff;border:1px solid #4f6591;border-radius:8px;padding:8px;font-size:12px}" +
      ".tm-store-field .tm-store-toggle{width:auto;accent-color:#6ea8ff}" +
      ".tm-store-app-settings{margin-top:14px;display:grid;gap:10px}" +
      ".tm-store-app-setting-item{border:1px solid #425a85;border-radius:10px;padding:10px;background:rgba(15,23,42,.5);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}" +
      ".tm-store-app-setting-item-title{font-weight:700;grid-column:1 / -1}" +
      ".tm-store-hidden{display:none !important}"
    ;
    root.appendChild(style);
  }

  function renderStoreOverlay(apps, settings) {
    ensureStoreStyles();
    var root = ensureStoreRoot();
    var fab = root.getElementById("tm-store-fab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "tm-store-fab";
      fab.className = "tm-store-fab";
      fab.type = "button";
      fab.textContent = "TM Store";
      var badge = document.createElement("span");
      badge.id = "tm-store-fab-badge";
      badge.className = "tm-store-fab-badge";
      fab.style.position = "fixed";
      fab.appendChild(badge);
      fab.addEventListener("click", function () {
        var overlay = root.getElementById("tm-store-overlay");
        if (!overlay) return;
        overlay.style.display = "flex";
      });
      root.appendChild(fab);
    }
    var fabBadge = root.getElementById("tm-store-fab-badge");
    if (RUNTIME.loaderUpdate.hasUpdate && loadUpdateAck() !== String(RUNTIME.loaderUpdate.remoteVersion || "")) {
      fab.classList.add("has-update");
      if (fabBadge) fabBadge.classList.add("show");
    } else {
      fab.classList.remove("has-update");
      if (fabBadge) fabBadge.classList.remove("show");
    }

    var overlay = root.getElementById("tm-store-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tm-store-overlay";
      overlay.className = "tm-store-overlay";
      overlay.addEventListener("click", function (evt) {
        if (evt.target === overlay) {
          overlay.style.display = "none";
        }
      });
      root.appendChild(overlay);
    }

    var published = apps.filter(isApprovedAndPublished);
    var query = String((RUNTIME.storeUi && RUNTIME.storeUi.searchQuery) || "").trim().toLowerCase();
    var filtered = published.filter(function (app) {
      if (!query) return true;
      var name = String(app.name || "").toLowerCase();
      var author = String(app.author || "").toLowerCase();
      return name.indexOf(query) !== -1 || author.indexOf(query) !== -1;
    });
    var perPage = 6;
    var totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    var currentPage = Number(RUNTIME.storeUi.page || 1);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    RUNTIME.storeUi.page = currentPage;
    var start = (currentPage - 1) * perPage;
    var pageItems = filtered.slice(start, start + perPage);
    var cards = "";
    for (var i = 0; i < pageItems.length; i += 1) {
      var app = pageItems[i];
      var enabled = appIsEnabled(app.id, settings);
      cards += appCardHtml(app, enabled);
    }
    var emptyState = "";
    if (!pageItems.length) {
      emptyState =
        "<div class='tm-store-empty' id='tm-store-empty'>" +
          "<span>Keine Apps für diesen Filter gefunden.</span>" +
          "<button class='tm-store-close' id='tm-store-filter-reset' type='button'>Filter reset</button>" +
        "</div>";
    }

    var updateBanner = "";
    if (RUNTIME.loaderUpdate.hasUpdate) {
      updateBanner =
        "<div class='tm-store-update-banner'>" +
        "Neues Loader-Update verfügbar. Öffne <strong>Einstellungen</strong> für den neuen Update-Flow." +
        "</div>";
    }
    var updateAcked = loadUpdateAck() === String(RUNTIME.loaderUpdate.remoteVersion || "");
    var updateHas = !!RUNTIME.loaderUpdate.hasUpdate;
    var updateChipClass = updateHas ? (updateAcked ? "neutral" : "warn") : "ok";
    var updateChipText = updateHas ? (updateAcked ? "Update bestätigt" : "Update verfügbar") : "Aktuell";
    var checkedAtText = formatDateTimeBerlin(RUNTIME.loaderUpdate.checkedAt, true);
    var nextCheckTs = RUNTIME.loaderUpdate.checkedAt ? (Number(RUNTIME.loaderUpdate.checkedAt) + Number(getUpdateIntervalMs(settings))) : 0;
    var nextCheckText = nextCheckTs ? formatDateTimeBerlin(nextCheckTs, true) : "sofort";

    overlay.innerHTML =
      "<div class='tm-store-panel'>" +
        "<div class='tm-store-top'>" +
          "<div class='tm-store-title'>" +
            "<h3 style='margin:0'>Klixa Extension Store</h3>" +
            "<p class='tm-store-subtitle'>Apps, Updates und Debugging zentral in einem Store.</p>" +
            "<div class='tm-store-pills'>" +
              "<span class='tm-store-version-pill'>Store-Version: v" + LOADER_LOCAL_VERSION + "</span>" +
              "<span class='tm-store-version-pill'>App-List: " + escapeHtml(formatAppListDate(RUNTIME.registryUpdatedAt)) + "</span>" +
              "<span class='tm-store-version-pill'>Ersteller: <a href='#' class='tm-store-author-link' data-author-cmd='loader-author' data-author-name='" + escapeHtml(LOADER_AUTHOR) + "'>@" + escapeHtml(LOADER_AUTHOR) + "</a></span>" +
            "</div>" +
          "</div>" +
          "<div class='tm-store-actions'>" +
            "<button class='tm-store-settings-btn' id='tm-store-settings-btn' type='button'>Einstellungen</button> " +
            "<button class='tm-store-debug-btn' id='tm-store-debug-btn' type='button'>Debug</button> " +
            "<button class='tm-store-close' id='tm-store-close' type='button'>Schließen</button>" +
          "</div>" +
        "</div>" +
        "<div class='tm-store-meta' id='tm-store-meta'>" +
          "<p><strong>Quelle:</strong> <a class='tm-store-link' target='_blank' href='" + REPO_URL + "'>" + REPO_URL + "</a></p>" +
          "<p><strong>Governance:</strong> Apps werden über Pull Requests + Reviews in GitHub freigegeben.</p>" +
        "</div>" +
        "<div id='tm-store-update-banner-wrap'>" + updateBanner + "</div>" +
        "<div class='tm-store-search-wrap' id='tm-store-search-wrap'>" +
          "<input class='tm-store-search-input' id='tm-store-search-input' type='text' placeholder='Apps suchen (Name oder Author)' value='" + escapeHtml(RUNTIME.storeUi.searchQuery || "") + "'>" +
          "<button class='tm-store-close' id='tm-store-search-clear' type='button'>Clear</button>" +
        "</div>" +
        emptyState +
        "<div class='tm-store-grid' id='tm-store-grid'>" + cards + "</div>" +
        "<div class='tm-store-pager' id='tm-store-pager'>" +
          "<div class='tm-store-pager-info'>Seite " + currentPage + " / " + totalPages + " • Treffer: " + filtered.length + "</div>" +
          "<div>" +
            "<button class='tm-store-close' id='tm-store-page-prev' type='button' " + (currentPage <= 1 ? "disabled" : "") + ">Zurück</button> " +
            "<button class='tm-store-close' id='tm-store-page-next' type='button' " + (currentPage >= totalPages ? "disabled" : "") + ">Weiter</button>" +
          "</div>" +
        "</div>" +
        "<div class='tm-store-settings' id='tm-store-settings' style='display:none'>" +
          "<h4>Einstellungen</h4>" +
          "<div class='tm-store-update-hub'>" +
            "<div class='tm-store-update-hub-head'>" +
              "<div class='tm-store-update-hub-title'>Loader Update-Zentrale</div>" +
              "<span id='tm-update-chip' class='tm-store-update-chip " + updateChipClass + "'>" + updateChipText + "</span>" +
            "</div>" +
            "<div class='tm-store-update-hub-grid'>" +
              "<div class='tm-store-update-kv'><strong>Lokal:</strong> v" + escapeHtml(LOADER_LOCAL_VERSION) + "</div>" +
              "<div class='tm-store-update-kv'><strong>Remote:</strong> <span id='tm-update-remote'>v" + escapeHtml(RUNTIME.loaderUpdate.remoteVersion || "-") + "</span></div>" +
              "<div class='tm-store-update-kv'><strong>Letzte Prüfung:</strong> <span id='tm-update-last-check'>" + escapeHtml(checkedAtText) + "</span></div>" +
              "<div class='tm-store-update-kv'><strong>Nächste Prüfung:</strong> <span id='tm-update-next-check'>" + escapeHtml(nextCheckText) + "</span></div>" +
            "</div>" +
            ((RUNTIME.loaderUpdate.commitRateLimitedUntil && Number(RUNTIME.loaderUpdate.commitRateLimitedUntil) > now())
              ? (
                "<div class='tm-store-update-kv error' style='margin-top:8px'><strong>Letzter Commit:</strong> Commit-Info aktuell rate-limited. Nächster Versuch nach " +
                escapeHtml(formatDurationShort(Number(RUNTIME.loaderUpdate.commitRateLimitedUntil) - now())) +
                " (" + escapeHtml(formatDateTimeBerlin(RUNTIME.loaderUpdate.commitRateLimitedUntil, true)) + ")" +
                ".</div>"
              ) : "") +
            ((RUNTIME.loaderUpdate.commitTitle || RUNTIME.loaderUpdate.commitUrl)
              ? (
                "<div class='tm-store-update-kv' style='margin-top:8px'><strong>Letzter Commit:</strong> " +
                escapeHtml(RUNTIME.loaderUpdate.commitTitle || "-") +
                (RUNTIME.loaderUpdate.commitSha ? " <span style='opacity:.8'>(#" + escapeHtml(RUNTIME.loaderUpdate.commitSha) + ")</span>" : "") +
                (RUNTIME.loaderUpdate.commitUrl ? " <a class='tm-store-link' target='_blank' href='" + RUNTIME.loaderUpdate.commitUrl + "'>GitHub</a>" : "") +
                "</div>"
              ) : "") +
            "<div class='tm-store-update-hub-actions'>" +
              "<button class='tm-store-update-btn' id='tm-store-update-check-btn' type='button'>Jetzt prüfen</button> " +
              (RUNTIME.loaderUpdate.hasUpdate ? "<button class='tm-store-update-btn' id='tm-store-update-now-btn' type='button'>Update installieren</button> " : "") +
              (updateHas && !updateAcked ? "<button class='tm-store-confirm-btn' id='tm-store-update-confirm-btn' type='button'>Als gelesen markieren</button>" : "") +
            "</div>" +
          "</div>" +
          "<div class='tm-store-settings-grid'>" +
            "<div class='tm-store-field'>" +
              "<label>Update-Intervall</label>" +
              "<select id='tm-store-update-interval'>" +
                "<option value='300000'>5 Minuten</option>" +
                "<option value='900000'>15 Minuten</option>" +
                "<option value='1800000'>30 Minuten</option>" +
                "<option value='3600000'>1 Stunde</option>" +
                "<option value='21600000'>6 Stunden</option>" +
                "<option value='43200000'>12 Stunden</option>" +
              "</select>" +
            "</div>" +
            "<div class='tm-store-field'>" +
              "<label for='tm-store-update-periodic-toast'>Intervall-Mitteilungen anzeigen</label>" +
              "<input class='tm-store-toggle' id='tm-store-update-periodic-toast' type='checkbox' " + (settings.update && settings.update.notifyPeriodicToast ? "checked" : "") + ">" +
            "</div>" +
            "<div class='tm-store-field'><label>Hinweis</label><input type='text' value='Update-Flow ist jetzt oben in der Update-Zentrale.' readonly></div>" +
          "</div>" +
          "<div class='tm-store-app-settings' id='tm-store-app-settings'></div>" +
        "</div>" +
        "<div class='tm-store-debug' id='tm-store-debug' style='display:none'>" +
          "<div class='tm-store-debug-head'><strong>Debug-Logs</strong><button class='tm-store-close' id='tm-store-debug-refresh' type='button'>Aktualisieren</button></div>" +
          "<div class='tm-store-debug-pre' id='tm-store-debug-pre'></div>" +
        "</div>" +
      "</div>";

    var close = root.getElementById("tm-store-close");
    close.addEventListener("click", function () {
      overlay.style.display = "none";
    });

    var debugBtn = root.getElementById("tm-store-debug-btn");
    var settingsBtn = root.getElementById("tm-store-settings-btn");
    var updateCheckBtn = root.getElementById("tm-store-update-check-btn");
    var updateNowBtn = root.getElementById("tm-store-update-now-btn");
    var updateConfirmBtn = root.getElementById("tm-store-update-confirm-btn");
    var updateInterval = root.getElementById("tm-store-update-interval");
    var periodicToastToggle = root.getElementById("tm-store-update-periodic-toast");
    var settingsWrap = root.getElementById("tm-store-settings");
    var appSettingsWrap = root.getElementById("tm-store-app-settings");
    var storeGrid = root.getElementById("tm-store-grid");
    var storeMeta = root.getElementById("tm-store-meta");
    var updateBannerWrap = root.getElementById("tm-store-update-banner-wrap");
    var searchWrap = root.getElementById("tm-store-search-wrap");
    var pagerWrap = root.getElementById("tm-store-pager");
    var emptyWrap = root.getElementById("tm-store-empty");
    var debugWrap = root.getElementById("tm-store-debug");
    var debugRefresh = root.getElementById("tm-store-debug-refresh");
    var searchInput = root.getElementById("tm-store-search-input");
    var searchClear = root.getElementById("tm-store-search-clear");
    var filterReset = root.getElementById("tm-store-filter-reset");
    var pagePrev = root.getElementById("tm-store-page-prev");
    var pageNext = root.getElementById("tm-store-page-next");
    function saveSettingsWithToast(next, reason) {
      saveSettings(next);
      startPeriodicUpdateChecks();
      addLog("info", "settings", "Einstellungen gespeichert", {
        reason: reason || "manual",
        intervalMs: next.update && next.update.intervalMs
      });
      showToast("Einstellungen gespeichert", "Änderungen wurden übernommen.");
    }
    function collectAndSaveSettings(reason) {
      var next = loadSettings();
      next.update = next.update || {};
      next.update.intervalMs = parseInt((updateInterval && updateInterval.value) || "", 10) || UPDATE_CHECK_INTERVAL_MS;
      next.update.notifyPeriodicToast = !!(periodicToastToggle && periodicToastToggle.checked);
      next.appSettings = next.appSettings || {};
      for (var idx = 0; idx < published.length; idx += 1) {
        var app = published[idx];
        var schema = Array.isArray(app.settings) ? app.settings : [];
        var current = next.appSettings[app.id] || {};
        for (var sIdx = 0; sIdx < schema.length; sIdx += 1) {
          var s = schema[sIdx];
          var field = root.getElementById("tm-app-setting-" + app.id + "-" + s.key);
          if (!field) continue;
          if (s.type === "toggle") current[s.key] = !!field.checked;
          else if (s.type === "number") current[s.key] = Number(field.value || 0);
          else current[s.key] = String(field.value || "");
        }
        next.appSettings[app.id] = current;
      }
      saveSettingsWithToast(next, reason || "manual");
      return next;
    }
    function setPageView(mode) {
      var settingsActive = mode === "settings";
      var debugActive = mode === "debug";
      if (settingsWrap) settingsWrap.style.display = settingsActive ? "block" : "none";
      if (debugWrap) debugWrap.style.display = debugActive ? "block" : "none";
      var hideMain = settingsActive || debugActive;
      if (storeGrid) storeGrid.classList.toggle("tm-store-hidden", hideMain);
      if (storeMeta) storeMeta.classList.toggle("tm-store-hidden", hideMain);
      if (updateBannerWrap) updateBannerWrap.classList.toggle("tm-store-hidden", hideMain);
      if (searchWrap) searchWrap.classList.toggle("tm-store-hidden", hideMain);
      if (pagerWrap) pagerWrap.classList.toggle("tm-store-hidden", hideMain);
      if (emptyWrap) emptyWrap.classList.toggle("tm-store-hidden", hideMain);
    }
    if (fab) {
      fab.onclick = function () {
        if (overlay) overlay.style.display = "flex";
        setPageView("main");
      };
    }
    function openSettingsView() {
      if (overlay) overlay.style.display = "flex";
      setPageView("settings");
      if (updateInterval) {
        updateInterval.value = String(getUpdateIntervalMs(settings));
      }
    }
    function renderDebugLogs() {
      var target = root.getElementById("tm-store-debug-pre");
      if (!target) return;
      var enabledMap = settings.enabledApps || {};
      var header =
        "Manifest: " + MANIFEST_URL + "\n" +
        "Cache-Key: " + CACHE_KEY + "\n" +
        "Darkmode aktiviert: " + (!!enabledMap.darkmode) + "\n" +
        "Apps im Manifest: " + (apps.length) + "\n" +
        "Status-Einträge: " + (RUNTIME.status.length) + "\n" +
        "Loader lokal: v" + LOADER_LOCAL_VERSION + "\n" +
        "Loader remote: v" + (RUNTIME.loaderUpdate.remoteVersion || "-") + "\n" +
        "Update verfügbar: " + (!!RUNTIME.loaderUpdate.hasUpdate) + "\n" +
        "Logs: " + (RUNTIME.logs.length) + "\n\n";
      var lines = RUNTIME.logs.slice(-120).map(function (l) {
        var data = l.data ? " | " + JSON.stringify(l.data) : "";
        return "[" + formatDateTimeBerlin(l.at, true) + "] [" + l.level.toUpperCase() + "] [" + l.scope + "] " + l.message + data;
      }).join("\n");
      target.textContent = header + (lines || "Keine Logs vorhanden.");
    }
    debugBtn.addEventListener("click", function () {
      var open = debugWrap.style.display !== "none";
      setPageView(open ? "main" : "debug");
      if (!open) {
        renderDebugLogs();
      }
    });
    settingsBtn.addEventListener("click", function () {
      var open = settingsWrap && settingsWrap.style.display !== "none";
      setPageView(open ? "main" : "settings");
      if (!open && updateInterval) {
        updateInterval.value = String(getUpdateIntervalMs(settings));
      }
    });
    debugRefresh.addEventListener("click", renderDebugLogs);
    updateCheckBtn.addEventListener("click", function () {
      updateCheckBtn.disabled = true;
      updateCheckBtn.textContent = "Prüfe...";
      checkLoaderUpdate(true).then(function () {
        renderStoreOverlay(RUNTIME.apps, loadSettings());
        showToast("Update-Check", "Update-Status wurde aktualisiert.");
      }).finally(function () {
        updateCheckBtn.disabled = false;
        updateCheckBtn.textContent = "Jetzt prüfen";
      });
    });
    if (updateNowBtn) {
      updateNowBtn.addEventListener("click", function () {
        var url = LOADER_REMOTE_URL + "?t=" + now() + "&r=" + Math.random().toString(36).slice(2);
        showToast("Update öffnen", "Tampermonkey-Update wird in neuem Tab geöffnet.");
        window.open(url, "_blank");
      });
    }
    if (updateConfirmBtn) {
      updateConfirmBtn.addEventListener("click", function () {
        if (!RUNTIME.loaderUpdate.remoteVersion) {
          showToast("Kein Update", "Aktuell gibt es keine Remote-Version zum Bestätigen.");
          return;
        }
        saveUpdateAck(RUNTIME.loaderUpdate.remoteVersion || "");
        dismissToastByKey("update-unread");
        showToast("Bestätigt", "Update wurde als gelesen markiert.");
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      });
    }
    if (appSettingsWrap) {
      appSettingsWrap.innerHTML = published.map(function (app) {
        var schema = Array.isArray(app.settings) ? app.settings : [];
        var currentSettings = getAppSettings(settings, app.id);
        var fields = schema.map(function (s) {
          var current = currentSettings[s.key];
          if (current == null) current = s.default;
          var id = "tm-app-setting-" + app.id + "-" + s.key;
          if (s.type === "toggle") {
            return (
              "<div class='tm-store-field'>" +
                "<label for='" + id + "'>" + escapeHtml(s.key) + " (toggle)</label>" +
                "<input class='tm-store-toggle' id='" + id + "' data-settings-field='1' data-app-id='" + app.id + "' data-key='" + escapeHtml(s.key) + "' data-type='toggle' type='checkbox' " + (current ? "checked" : "") + ">" +
              "</div>"
            );
          }
          if (s.type === "number") {
            return (
              "<div class='tm-store-field'>" +
                "<label for='" + id + "'>" + escapeHtml(s.key) + " (number)</label>" +
                "<input id='" + id + "' data-settings-field='1' data-app-id='" + app.id + "' data-key='" + escapeHtml(s.key) + "' data-type='number' type='number' value='" + escapeHtml(current) + "'>" +
              "</div>"
            );
          }
          return (
            "<div class='tm-store-field'>" +
              "<label for='" + id + "'>" + escapeHtml(s.key) + " (string)</label>" +
              "<input id='" + id + "' data-settings-field='1' data-app-id='" + app.id + "' data-key='" + escapeHtml(s.key) + "' data-type='string' type='text' value='" + escapeHtml(current) + "'>" +
            "</div>"
          );
        }).join("");
        if (!fields) {
          fields = "<div class='tm-store-field'><label>Keine Header-Settings für diese App definiert.</label></div>";
        }
        return (
          "<div class='tm-store-app-setting-item'>" +
            "<div class='tm-store-app-setting-item-title'>" + escapeHtml(app.name) + "</div>" +
            fields +
          "</div>"
        );
      }).join("");
      var settingFields = appSettingsWrap.querySelectorAll("[data-settings-field='1']");
      for (var f = 0; f < settingFields.length; f += 1) {
        settingFields[f].addEventListener("blur", function () {
          collectAndSaveSettings("focus-loss");
        });
      }
    }
    if (updateInterval) {
      updateInterval.value = String(getUpdateIntervalMs(settings));
      updateInterval.addEventListener("blur", function () {
        collectAndSaveSettings("focus-loss");
      });
    }
    var toggles = overlay.querySelectorAll("[data-app-toggle]");
    for (var j = 0; j < toggles.length; j += 1) {
      toggles[j].addEventListener("click", function (evt) {
        var appId = evt.target.getAttribute("data-app-toggle");
        toggleApp(appId);
      });
    }
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var caretPos = searchInput.selectionStart;
        RUNTIME.storeUi.searchQuery = String(searchInput.value || "");
        RUNTIME.storeUi.page = 1;
        renderStoreOverlay(RUNTIME.apps, loadSettings());
        var nextInput = ensureStoreRoot().getElementById("tm-store-search-input");
        if (nextInput) {
          nextInput.focus();
          var pos = typeof caretPos === "number" ? caretPos : nextInput.value.length;
          try {
            nextInput.setSelectionRange(pos, pos);
          } catch (err) {}
        }
      });
    }
    function resetSearchFilter() {
      RUNTIME.storeUi.searchQuery = "";
      RUNTIME.storeUi.page = 1;
      renderStoreOverlay(RUNTIME.apps, loadSettings());
    }
    if (searchClear) {
      searchClear.addEventListener("click", function () {
        resetSearchFilter();
      });
    }
    if (filterReset) {
      filterReset.addEventListener("click", function () {
        resetSearchFilter();
      });
    }
    if (pagePrev) {
      pagePrev.addEventListener("click", function () {
        RUNTIME.storeUi.page = Math.max(1, Number(RUNTIME.storeUi.page || 1) - 1);
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      });
    }
    if (pageNext) {
      pageNext.addEventListener("click", function () {
        RUNTIME.storeUi.page = Number(RUNTIME.storeUi.page || 1) + 1;
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      });
    }
    var authorLinks = overlay.querySelectorAll("[data-author-cmd]");
    for (var a = 0; a < authorLinks.length; a += 1) {
      authorLinks[a].addEventListener("click", function (evt) {
        evt.preventDefault();
        var appId = evt.currentTarget.getAttribute("data-author-cmd");
        var author = evt.currentTarget.getAttribute("data-author-name");
        if (!author) {
          showToast("Kein Author", "Für diese App ist kein @author gesetzt.");
          return;
        }
        RUNTIME.fastCmdApplied[appId] = false;
        applyAuthorFastCmd(appId, author, { force: true });
        showToast("Author gesendet", "Befehl a " + author + " wurde gesendet.");
      });
    }
    var hasUnreadUpdate = RUNTIME.loaderUpdate.hasUpdate && loadUpdateAck() !== String(RUNTIME.loaderUpdate.remoteVersion || "");
    if (hasUnreadUpdate) {
      showToast(
        "Update verfügbar",
        "Neues Loader-Update erkannt. Öffne die Einstellungen, um zu installieren oder als gelesen zu markieren.",
        {
          variant: "warn",
          duration: 0,
          replaceKey: "update-unread",
          actionLabel: "Zu Einstellungen",
          onAction: function () {
            openSettingsView();
          }
        }
      );
    } else {
      dismissToastByKey("update-unread");
    }
    syncUpdateHubInDom(settings);
  }

  async function checkLoaderUpdate(force) {
    var settings = loadSettings();
    var state = loadUpdateState();
    var intervalMs = getUpdateIntervalMs(settings);
    if (!force && state.checkedAt && (now() - state.checkedAt) < intervalMs) {
      RUNTIME.loaderUpdate = state;
      addLog("info", "update", "Update-Check übersprungen (Intervall aktiv)");
      return state;
    }

    try {
      var remoteSource = "";
      var commitCooldownUntil = loadCommitCooldownUntil();
      var skipGithubApi = commitCooldownUntil && now() < commitCooldownUntil;
      if (!skipGithubApi) {
        try {
          addLog("info", "update", "Prüfe Loader-Update (GitHub API)", { url: LOADER_CONTENT_API_URL });
          var apiTxt = await gmRequest(LOADER_CONTENT_API_URL + "&t=" + now());
          var apiObj = safeParse(apiTxt, null);
          if (apiObj && apiObj.content) {
            remoteSource = decodeBase64Utf8(apiObj.content);
          }
        } catch (apiErr) {
          addLog("error", "update", "GitHub API fehlgeschlagen, nutze Raw-Fallback", {
            error: apiErr && apiErr.message ? apiErr.message : "Unbekannt"
          });
        }
      } else {
        addLog("info", "update", "GitHub API übersprungen (RateLimit-Cooldown aktiv)", {
          until: formatDateTimeBerlin(commitCooldownUntil, true)
        });
      }
      if (!remoteSource) {
        var updateUrl = LOADER_REMOTE_URL + "?t=" + now() + "&r=" + Math.random().toString(36).slice(2);
        addLog("info", "update", "Fallback auf raw.githubusercontent.com", { url: updateUrl });
        remoteSource = await gmRequestText(updateUrl);
      }
      var remoteVersion = extractUserscriptVersion(remoteSource);
      var hasUpdate = !!(remoteVersion && isVersionNewer(remoteVersion, LOADER_LOCAL_VERSION));
      var commit = { title: null, url: null, sha: null, rateLimitedUntil: 0 };
      try {
        commit = await fetchLatestLoaderCommit();
      } catch (commitErr) {
        var msg = commitErr && commitErr.message ? String(commitErr.message) : "Unbekannt";
        if (msg.indexOf("HTTP 403") !== -1) {
          commit.rateLimitedUntil = now() + (60 * 60 * 1000);
          saveCommitCooldownUntil(commit.rateLimitedUntil);
        }
        addLog("error", "update", "Commit-Changelog konnte nicht geladen werden", {
          error: msg
        });
      }
      state = {
        checkedAt: now(),
        remoteVersion: remoteVersion || null,
        hasUpdate: hasUpdate,
        commitTitle: commit.title,
        commitUrl: commit.url,
        commitSha: commit.sha,
        commitRateLimitedUntil: Number(commit.rateLimitedUntil || 0)
      };
      var previous = loadUpdateState();
      if (previous && previous.hasUpdate && !state.hasUpdate && isVersionNewer(previous.remoteVersion, LOADER_LOCAL_VERSION)) {
        state.hasUpdate = true;
        state.remoteVersion = previous.remoteVersion;
        state.commitTitle = previous.commitTitle;
        state.commitUrl = previous.commitUrl;
        state.commitSha = previous.commitSha;
        state.commitRateLimitedUntil = previous.commitRateLimitedUntil || 0;
        addLog("info", "update", "Update-Hinweis bleibt aktiv bis lokale Version nachgezogen hat");
      }
      saveUpdateState(state);
      RUNTIME.loaderUpdate = state;
      addLog("info", "update", "Update-Check abgeschlossen", state);
      return state;
    } catch (err) {
      state = state || loadUpdateState();
      state.checkedAt = now();
      saveUpdateState(state);
      RUNTIME.loaderUpdate = state;
      addLog("error", "update", "Update-Check fehlgeschlagen", {
        error: err && err.message ? err.message : "Unbekannt"
      });
      return state;
    }
  }

  function startPeriodicUpdateChecks() {
    if (RUNTIME.updateTimerId) {
      window.clearTimeout(RUNTIME.updateTimerId);
      RUNTIME.updateTimerId = null;
    }
    function scheduleNextTick() {
      var settings = loadSettings();
      var delay = getUpdateIntervalMs(settings);
      RUNTIME.updateTimerId = window.setTimeout(function () {
        Promise.all([
          checkLoaderUpdate(true),
          refreshRegistryInBackground()
        ]).then(function () {
          var currentSettings = loadSettings();
          if (currentSettings.update && currentSettings.update.notifyPeriodicToast) {
            showToast(
              "Intervall-Check durchgeführt",
              "Loader- und App-Manifest wurden im Hintergrund geprüft.",
              {
                variant: "ok",
                duration: 2000,
                replaceKey: "periodic-check"
              }
            );
          }
          if (document.body) {
            renderStoreOverlay(RUNTIME.apps, currentSettings);
            syncUpdateHubInDom(currentSettings);
          }
        }).finally(function () {
          scheduleNextTick();
        });
      }, delay);
    }
    addLog("info", "update", "Periodischer Update-Check gestartet", {
      intervalMs: getUpdateIntervalMs(loadSettings())
    });
    scheduleNextTick();
  }

  function syncUpdateHubInDom(settings) {
    var root = ensureStoreRoot();
    var statusChip = root.getElementById("tm-update-chip");
    var remote = root.getElementById("tm-update-remote");
    var checked = root.getElementById("tm-update-last-check");
    var next = root.getElementById("tm-update-next-check");
    if (!statusChip || !remote || !checked || !next) return;
    var updateAcked = loadUpdateAck() === String(RUNTIME.loaderUpdate.remoteVersion || "");
    var updateHas = !!RUNTIME.loaderUpdate.hasUpdate;
    statusChip.className = "tm-store-update-chip " + (updateHas ? (updateAcked ? "neutral" : "warn") : "ok");
    statusChip.textContent = updateHas ? (updateAcked ? "Update bestätigt" : "Update verfügbar") : "Aktuell";
    remote.textContent = "v" + (RUNTIME.loaderUpdate.remoteVersion || "-");
    checked.textContent = formatDateTimeBerlin(RUNTIME.loaderUpdate.checkedAt, true);
    var nextCheckTs = RUNTIME.loaderUpdate.checkedAt ? (Number(RUNTIME.loaderUpdate.checkedAt) + Number(getUpdateIntervalMs(settings))) : 0;
    next.textContent = nextCheckTs ? formatDateTimeBerlin(nextCheckTs, true) : "sofort";
  }

  function renderBootFeedback() {}

  function ensureToaster() {
    var root = ensureStoreRoot();
    var host = root.getElementById("tm-store-toaster");
    if (!host) {
      host = document.createElement("div");
      host.id = "tm-store-toaster";
      host.className = "tm-store-toaster";
      root.appendChild(host);
    }
    return host;
  }

  function dismissToastByKey(key) {
    if (!key) return;
    var toaster = ensureToaster();
    var selector = "[data-toast-key='" + String(key).replace(/'/g, "\\'") + "']";
    var existing = toaster.querySelector(selector);
    if (existing) existing.remove();
  }

  function showToast(title, message, options) {
    var opts = options || {};
    var toaster = ensureToaster();
    var variant = opts.variant || "ok";
    var duration = typeof opts.duration === "number" ? opts.duration : 2200;
    var replaceKey = opts.replaceKey ? String(opts.replaceKey) : "";
    if (replaceKey) {
      var existing = toaster.querySelector("[data-toast-key='" + replaceKey.replace(/'/g, "\\'") + "']");
      if (existing) existing.remove();
    }
    var id = "tm-toast-" + (++RUNTIME.toastSeq);
    var card = document.createElement("div");
    card.className = "tm-store-toast " + variant;
    card.id = id;
    if (replaceKey) card.setAttribute("data-toast-key", replaceKey);

    var head = document.createElement("div");
    head.className = "tm-store-toast-head";
    var ttl = document.createElement("div");
    ttl.className = "tm-store-toast-title";
    ttl.textContent = String(title || "Hinweis");
    var closeBtn = document.createElement("button");
    closeBtn.className = "tm-store-toast-close";
    closeBtn.type = "button";
    closeBtn.textContent = "x";
    closeBtn.addEventListener("click", function () {
      card.remove();
    });
    head.appendChild(ttl);
    head.appendChild(closeBtn);
    card.appendChild(head);

    var desc = document.createElement("div");
    desc.className = "tm-store-toast-desc";
    desc.textContent = String(message || "");
    card.appendChild(desc);

    if (opts.actionLabel && typeof opts.onAction === "function") {
      var actions = document.createElement("div");
      actions.className = "tm-store-toast-actions";
      var actionBtn = document.createElement("button");
      actionBtn.className = "tm-store-toast-action-btn";
      actionBtn.type = "button";
      actionBtn.textContent = String(opts.actionLabel);
      actionBtn.addEventListener("click", function () {
        try { opts.onAction(); } catch (err) {}
        card.remove();
      });
      actions.appendChild(actionBtn);
      card.appendChild(actions);
    }

    toaster.appendChild(card);
    while (toaster.children.length > 4) {
      toaster.removeChild(toaster.firstElementChild);
    }
    if (duration > 0) {
      window.setTimeout(function () {
        if (card && card.parentNode) card.remove();
      }, duration);
    }
  }

  function loadAuthorCommandState() {
    var raw = GM_getValue(AUTHOR_CMD_STATE_KEY, "");
    if (!raw) return {};
    return safeParse(raw, {});
  }

  function saveAuthorCommandState(state) {
    GM_setValue(AUTHOR_CMD_STATE_KEY, JSON.stringify(state || {}));
  }

  function applyAuthorFastCmd(appId, authorValue, options) {
    var opts = options || {};
    var author = String(authorValue || "").trim();
    if (!author) return;
    if (!opts.force && RUNTIME.fastCmdApplied[appId]) return;
    var persisted = loadAuthorCommandState();
    var persistedKey = String(appId || "") + "|" + author;
    var lastAt = Number(persisted[persistedKey] || 0);
    if (!opts.force && lastAt && (now() - lastAt) < (10 * 60 * 1000)) {
      addLog("info", "author", "Author-Befehl übersprungen (Throttle aktiv)", { appId: appId, author: author });
      RUNTIME.fastCmdApplied[appId] = true;
      return;
    }
    var tries = 0;
    var maxTries = 25;
    var timer = window.setInterval(function () {
      tries += 1;
      var input = document.querySelector("#fast_cmd");
      if (!input) {
        if (tries >= maxTries) window.clearInterval(timer);
        return;
      }
      input.focus();
      input.value = "a " + author;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      if (input.form && typeof input.form.requestSubmit === "function") {
        input.form.requestSubmit();
      } else if (input.form) {
        input.form.submit();
      }
      RUNTIME.fastCmdApplied[appId] = true;
      persisted[persistedKey] = now();
      saveAuthorCommandState(persisted);
      addLog("info", "author", "Author-Befehl an #fast_cmd gesendet", { appId: appId, author: author });
      window.clearInterval(timer);
    }, 350);
  }

  async function runDeferredApps() {
    // Nur einmal pro "Queue-Phase" ausführen.
    RUNTIME.deferredAppsRunScheduled = false;

    var queuedApps = RUNTIME.deferredAppsQueue.slice();
    RUNTIME.deferredAppsQueue = [];

    var currentSettings = loadSettings();

    for (var j = 0; j < queuedApps.length; j += 1) {
      var deferredApp = queuedApps[j];
      if (!deferredApp) continue;
      if (RUNTIME.loaded[deferredApp.id]) continue;
      if (!isApprovedAndPublished(deferredApp)) continue;
      if (!appIsEnabled(deferredApp.id, currentSettings)) continue;
      if (deferredApp.match && !new RegExp(deferredApp.match).test(window.location.href)) continue;

      try {
        var result2 = await runApp(deferredApp);
        if (result2 && result2.ok) {
          RUNTIME.loaded[deferredApp.id] = true;
        }
        RUNTIME.status.push({
          appId: deferredApp.id,
          ok: !!(result2 && result2.ok),
          message: result2 && result2.message ? result2.message : "Unbekannt"
        });
      } catch (err2) {
        RUNTIME.status.push({
          appId: deferredApp.id,
          ok: false,
          message: "Fehler: " + (err2 && err2.message ? err2.message : "Unbekannt")
        });
      }
    }

    // UI aktualisieren, damit "Geladen" Status nach Deferred-Start sichtbar ist.
    renderStoreOverlay(RUNTIME.apps, currentSettings);
  }

  function scheduleDeferredApps() {
    if (!RUNTIME.deferredAppsQueue.length) return;
    if (RUNTIME.deferredAppsRunScheduled) return;
    RUNTIME.deferredAppsRunScheduled = true;

    if (document.readyState === "complete") {
      runDeferredApps();
    } else {
      window.addEventListener("load", function () {
        runDeferredApps();
      }, { once: true });
    }
  }

  async function runEnabledApps(apps, settings) {
    // Apps, die @onDocumentLoad setzen, werden erst nach "window.load" ausgeführt.
    // Das verhindert Race-Conditions zwischen F5-Reloads und Apps, die auf "load" lauschen.
    for (var i = 0; i < apps.length; i += 1) {
      var app = apps[i];
      if (!isApprovedAndPublished(app)) continue;
      if (RUNTIME.loaded[app.id]) continue;
      if (!appIsEnabled(app.id, settings)) {
        addLog("info", "app:" + app.id, "Übersprungen: deaktiviert");
        continue;
      }
      if (app.match && !new RegExp(app.match).test(window.location.href)) {
        addLog("info", "app:" + app.id, "Übersprungen: URL-Match trifft nicht zu", { match: app.match, url: window.location.href });
        continue;
      }
      try {
        if (app.onDocumentLoad === true) {
          if (!RUNTIME.deferredAppsQueuedMap[app.id]) {
            RUNTIME.deferredAppsQueuedMap[app.id] = true;
            RUNTIME.deferredAppsQueue.push(app);
          }
          continue;
        }
        var result = await runApp(app);
        if (result && result.ok) {
          RUNTIME.loaded[app.id] = true;
        }
        RUNTIME.status.push({
          appId: app.id,
          ok: !!(result && result.ok),
          message: result && result.message ? result.message : "Unbekannt"
        });
      } catch (err) {
        RUNTIME.status.push({
          appId: app.id,
          ok: false,
          message: "Fehler: " + (err && err.message ? err.message : "Unbekannt")
        });
      }
    }

    // Wenn Deferred-Apps gequeued sind, beim echten "load" ausführen.
    scheduleDeferredApps();
  }

  async function boot() {
    RUNTIME.loaderUpdate = normalizeUpdateStateWithLocalVersion(loadUpdateState());
    startPeriodicUpdateChecks();
    checkLoaderUpdate(true).then(function () {
      if (document.body) {
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      }
    });

    var settings = loadSettings();
    var cached = loadCachedRegistry();
    if (cached) {
      var cachedPayload = cached.registry ? cached.registry : cached;
      var cachedApps = cachedPayload && Array.isArray(cachedPayload.apps) ? cachedPayload.apps : [];
      if (cachedApps.length) {
        RUNTIME.apps = cachedApps;
        RUNTIME.registryUpdatedAt = cachedPayload.updatedAt || null;
        if (document.body) {
          renderStoreOverlay(cachedApps, settings);
        } else {
          document.addEventListener("DOMContentLoaded", function () {
            renderStoreOverlay(cachedApps, settings);
          });
        }
        await runEnabledApps(cachedApps, settings);
      }
    }

    var payload;
    try {
      payload = await fetchRegistry();
      saveRegistryCache(payload);
    } catch (err) {
      if (!cached) {
        console.error("[TM-STORE] Registry fetch failed and no cache found", err);
        addLog("error", "network", "Manifest konnte nicht geladen werden und kein Cache vorhanden", {
          url: MANIFEST_URL,
          error: err && err.message ? err.message : "Unbekannt"
        });
        return;
      }
      payload = cached.registry ? cached.registry : cached;
      logInfo("Using cached registry");
      addLog("error", "network", "Manifest-Fehler, Cache wird verwendet", {
        url: MANIFEST_URL,
        error: err && err.message ? err.message : "Unbekannt"
      });
    }

    var apps = payload.apps || [];
    RUNTIME.apps = apps;
    RUNTIME.registryUpdatedAt = payload.updatedAt || null;
    if (document.body) {
      renderStoreOverlay(apps, settings);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        renderStoreOverlay(apps, settings);
      });
    }
    await runEnabledApps(apps, settings);
    if (document.body) {
      renderStoreOverlay(apps, settings);
    }
  }

  boot().catch(function (err) {
    console.error("[TM-STORE] Boot error", err);
  });
})();
