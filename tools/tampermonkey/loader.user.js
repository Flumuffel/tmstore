// ==UserScript==
// @name         Klixa TM Store Loader
// @namespace    klixa.tm.store
// @version      0.2.1
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
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var GITHUB_OWNER = "Flumuffel";
  var GITHUB_REPO = "tmstore";
  var GITHUB_REF = "main";
  var RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/refs/heads/" + GITHUB_REF;
  var MANIFEST_URL = RAW_BASE + "/api/tm-store/apps.json";
  var REPO_URL = "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO;
  var CACHE_KEY = "tm_store_cache_v1_" + GITHUB_OWNER + "_" + GITHUB_REPO + "_" + GITHUB_REF;
  var SETTINGS_KEY = "tm_store_settings_v1";
  var DEFAULT_SETTINGS = {
    enabledApps: {
      darkmode: true
    },
    ui: {
      open: false
    }
  };
  var RUNTIME = {
    apps: [],
    loaded: {},
    status: [],
    logs: []
  };

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
    if (!raw) {
      GM_setValue(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return safeParse(raw, DEFAULT_SETTINGS);
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

  function isApprovedAndPublished(app) {
    return app && app.status === "published" && app.approved === true;
  }

  function appIsEnabled(appId, settings) {
    return !!(settings.enabledApps && settings.enabledApps[appId]);
  }

  async function runApp(app) {
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
      repository: REPO_URL
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
      window.location.reload();
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
    return (
      "<article class='tm-store-card'>" +
        "<div class='tm-store-card-head'>" +
          "<h4>" + app.name + "</h4>" +
          "<span>v" + app.version + "</span>" +
        "</div>" +
        "<p>" + app.description + "</p>" +
        "<div class='tm-store-meta'>Status: " + app.status + " | ID: " + app.id + "</div>" +
        "<div class='tm-store-state-row'>" + statusBadge + "</div>" +
        "<ul>" + changelog + "</ul>" +
        "<button data-app-toggle='" + app.id + "' class='tm-store-btn " + (enabled ? "is-on" : "is-off") + "'>" +
          (enabled ? "Deaktivieren" : "Aktivieren") +
        "</button>" +
      "</article>"
    );
  }

  function ensureStoreStyles() {
    if (document.getElementById("tm-store-style")) return;
    GM_addStyle(
      ".tm-store-fab{position:fixed;right:18px;bottom:18px;z-index:999999;background:linear-gradient(135deg,#6d7dff,#39b7ff);color:#061326;border:none;border-radius:999px;padding:12px 16px;cursor:pointer;font-weight:800;box-shadow:0 12px 28px rgba(0,0,0,.35)}" +
      ".tm-store-overlay{position:fixed;inset:0;background:rgba(4,10,22,.7);backdrop-filter:blur(6px);z-index:999998;display:none;align-items:center;justify-content:center;padding:24px}" +
      ".tm-store-panel{width:min(960px,96vw);max-height:92vh;overflow:auto;background:radial-gradient(circle at top,#1a2642 0%,#0f1628 58%,#0c1321 100%);color:#eef2ff;border:1px solid #40547a;border-radius:18px;padding:18px;box-shadow:0 30px 60px rgba(0,0,0,.45)}" +
      ".tm-store-top{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:14px}" +
      ".tm-store-card{background:linear-gradient(180deg,#1d2a45 0%,#16223a 100%);border:1px solid #46608d;border-radius:12px;padding:12px}" +
      ".tm-store-card h4{margin:0}" +
      ".tm-store-card p{margin:8px 0;color:#c2cde3}" +
      ".tm-store-card ul{margin:8px 0 0 18px;padding:0;color:#9eb0d1}" +
      ".tm-store-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-meta{font-size:12px;color:#8fa0c3}" +
      ".tm-store-state-row{margin-top:8px}" +
      ".tm-badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700}" +
      ".tm-badge.ok{background:#175b35;color:#d5ffe7;border:1px solid #39b86f}" +
      ".tm-badge.fail{background:#631d1d;color:#ffdede;border:1px solid #d14f4f}" +
      ".tm-badge.neutral{background:#243653;color:#dbe8ff;border:1px solid #506c99}" +
      ".tm-store-btn{margin-top:10px;padding:8px 12px;border-radius:10px;border:1px solid #6586be;background:#2e4270;color:#eef2ff;cursor:pointer;font-weight:700}" +
      ".tm-store-btn.is-on{background:#7f1d1d;border-color:#ef4444}" +
      ".tm-store-close{background:#243653;color:#e8eefc;border:1px solid #5f7baa;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-debug-btn{background:#1e3a2e;color:#d7ffe5;border:1px solid #3f8b67;border-radius:10px;padding:8px 12px;cursor:pointer}" +
      ".tm-store-link{color:#9dc2ff;text-decoration:none}" +
      ".tm-store-feedback{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:999999;background:#101a2e;border:1px solid #4c628f;border-radius:12px;color:#e9f0ff;min-width:360px;max-width:92vw;padding:10px 12px;box-shadow:0 14px 30px rgba(0,0,0,.4)}" +
      ".tm-store-feedback h4{margin:0 0 8px 0;font-size:14px}" +
      ".tm-store-feedback ul{margin:0;padding-left:18px}" +
      ".tm-store-feedback li{font-size:13px;margin:2px 0}" +
      ".tm-store-feedback.ok li{color:#bff5d2}" +
      ".tm-store-feedback.warn li{color:#ffd3d3}" +
      ".tm-store-debug{margin-top:12px;border:1px solid #40547a;border-radius:10px;padding:10px;background:rgba(7,12,24,.55)}" +
      ".tm-store-debug-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}" +
      ".tm-store-debug-pre{font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;line-height:1.35;max-height:240px;overflow:auto;color:#cfe1ff;background:#0b1220;border:1px solid #334a73;border-radius:8px;padding:8px}"
    );
    var styleMarker = document.createElement("meta");
    styleMarker.id = "tm-store-style";
    document.head.appendChild(styleMarker);
  }

  function renderStoreOverlay(apps, settings) {
    ensureStoreStyles();
    var fab = document.getElementById("tm-store-fab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "tm-store-fab";
      fab.className = "tm-store-fab";
      fab.type = "button";
      fab.textContent = "TM Store";
      fab.addEventListener("click", function () {
        var overlay = document.getElementById("tm-store-overlay");
        if (!overlay) return;
        overlay.style.display = "flex";
      });
      document.body.appendChild(fab);
    }

    var overlay = document.getElementById("tm-store-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tm-store-overlay";
      overlay.className = "tm-store-overlay";
      overlay.addEventListener("click", function (evt) {
        if (evt.target === overlay) {
          overlay.style.display = "none";
        }
      });
      document.body.appendChild(overlay);
    }

    var published = apps.filter(isApprovedAndPublished);
    var cards = "";
    for (var i = 0; i < published.length; i += 1) {
      var app = published[i];
      var enabled = appIsEnabled(app.id, settings);
      cards += appCardHtml(app, enabled);
    }

    overlay.innerHTML =
      "<div class='tm-store-panel'>" +
        "<div class='tm-store-top'>" +
          "<h3>Tampermonkey Store</h3>" +
          "<div>" +
            "<button class='tm-store-debug-btn' id='tm-store-debug-btn' type='button'>Debug</button> " +
            "<button class='tm-store-close' id='tm-store-close' type='button'>Schließen</button>" +
          "</div>" +
        "</div>" +
        "<p>Quelle: <a class='tm-store-link' target='_blank' href='" + REPO_URL + "'>" + REPO_URL + "</a></p>" +
        "<p>Governance: Apps werden über Pull Requests + Reviews in GitHub freigegeben.</p>" +
        "<div class='tm-store-grid'>" + cards + "</div>" +
        "<div class='tm-store-debug' id='tm-store-debug' style='display:none'>" +
          "<div class='tm-store-debug-head'><strong>Debug-Logs</strong><button class='tm-store-close' id='tm-store-debug-refresh' type='button'>Aktualisieren</button></div>" +
          "<div class='tm-store-debug-pre' id='tm-store-debug-pre'></div>" +
        "</div>" +
      "</div>";

    var close = document.getElementById("tm-store-close");
    close.addEventListener("click", function () {
      overlay.style.display = "none";
    });

    var debugBtn = document.getElementById("tm-store-debug-btn");
    var debugWrap = document.getElementById("tm-store-debug");
    var debugRefresh = document.getElementById("tm-store-debug-refresh");
    function renderDebugLogs() {
      var target = document.getElementById("tm-store-debug-pre");
      if (!target) return;
      var enabledMap = settings.enabledApps || {};
      var header =
        "Manifest: " + MANIFEST_URL + "\n" +
        "Cache-Key: " + CACHE_KEY + "\n" +
        "Darkmode aktiviert: " + (!!enabledMap.darkmode) + "\n" +
        "Apps im Manifest: " + (apps.length) + "\n" +
        "Status-Einträge: " + (RUNTIME.status.length) + "\n" +
        "Logs: " + (RUNTIME.logs.length) + "\n\n";
      var lines = RUNTIME.logs.slice(-120).map(function (l) {
        var data = l.data ? " | " + JSON.stringify(l.data) : "";
        return "[" + l.at + "] [" + l.level.toUpperCase() + "] [" + l.scope + "] " + l.message + data;
      }).join("\n");
      target.textContent = header + (lines || "Keine Logs vorhanden.");
    }
    debugBtn.addEventListener("click", function () {
      var open = debugWrap.style.display !== "none";
      debugWrap.style.display = open ? "none" : "block";
      if (!open) renderDebugLogs();
    });
    debugRefresh.addEventListener("click", renderDebugLogs);

    var toggles = overlay.querySelectorAll("[data-app-toggle]");
    for (var j = 0; j < toggles.length; j += 1) {
      toggles[j].addEventListener("click", function (evt) {
        var appId = evt.target.getAttribute("data-app-toggle");
        toggleApp(appId);
      });
    }
  }

  function renderBootFeedback() {
    var host = document.getElementById("tm-store-feedback");
    if (!host) {
      host = document.createElement("div");
      host.id = "tm-store-feedback";
      host.className = "tm-store-feedback";
      document.body.appendChild(host);
    }
    var statuses = RUNTIME.status.slice(-8);
    var okCount = 0;
    var failCount = 0;
    var list = statuses.map(function (s) {
      if (s.ok) okCount += 1;
      else failCount += 1;
      var icon = s.ok ? "✅" : "❌";
      return "<li>" + icon + " " + s.appId + ": " + s.message + "</li>";
    }).join("");
    if (!list) {
      list = "<li>Keine App geladen (alles deaktiviert oder nicht passend).</li>";
    }
    host.className = "tm-store-feedback " + (failCount > 0 ? "warn" : "ok");
    host.innerHTML =
      "<h4>TM Store Status • Geladen: " + okCount + " • Fehler: " + failCount + "</h4>" +
      "<ul>" + list + "</ul>";
    window.setTimeout(function () {
      var current = document.getElementById("tm-store-feedback");
      if (current) current.remove();
    }, 7000);
  }

  async function boot() {
    var settings = loadSettings();
    var payload;

    try {
      payload = await fetchRegistry();
      saveRegistryCache(payload);
    } catch (err) {
      var fallback = loadCachedRegistry();
      if (!fallback) {
        console.error("[TM-STORE] Registry fetch failed and no cache found", err);
        addLog("error", "network", "Manifest konnte nicht geladen werden und kein Cache vorhanden", {
          url: MANIFEST_URL,
          error: err && err.message ? err.message : "Unbekannt"
        });
        return;
      }
      payload = fallback.registry ? fallback.registry : fallback;
      logInfo("Using cached registry");
      addLog("error", "network", "Manifest-Fehler, Cache wird verwendet", {
        url: MANIFEST_URL,
        error: err && err.message ? err.message : "Unbekannt"
      });
    }

    var apps = payload.apps || [];
    RUNTIME.apps = apps;
    if (document.body) {
      renderStoreOverlay(apps, settings);
      renderBootFeedback();
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        renderStoreOverlay(apps, settings);
        renderBootFeedback();
      });
    }
    for (var i = 0; i < apps.length; i += 1) {
      var app = apps[i];
      if (!isApprovedAndPublished(app)) continue;
      if (!appIsEnabled(app.id, settings)) {
        addLog("info", "app:" + app.id, "Übersprungen: deaktiviert");
        continue;
      }
      if (app.match && !new RegExp(app.match).test(window.location.href)) {
        addLog("info", "app:" + app.id, "Übersprungen: URL-Match trifft nicht zu", { match: app.match, url: window.location.href });
        continue;
      }
      try {
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
    if (document.body) {
      renderStoreOverlay(apps, settings);
      renderBootFeedback();
    }
  }

  boot().catch(function (err) {
    console.error("[TM-STORE] Boot error", err);
  });
})();
