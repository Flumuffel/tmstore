// ==UserScript==
// @name         Klixa TM Store Loader
// @namespace    klixa.tm.store
// @version      0.2.0
// @description  Loads approved Intranet apps from GitHub Raw manifest
// @match        https://intranet.klixa.ch/*
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

  var GITHUB_OWNER = "your-org";
  var GITHUB_REPO = "your-tm-store-repo";
  var GITHUB_REF = "main";
  var RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/" + GITHUB_REF;
  var MANIFEST_URL = RAW_BASE + "/api/tm-store/apps.json";
  var REPO_URL = "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO;
  var CACHE_KEY = "tm_store_cache_v1";
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
    loaded: {}
  };

  function now() {
    return Date.now();
  }

  function logInfo(msg, data) {
    console.info("[TM-STORE]", msg, data || "");
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
    return payload;
  }

  function isApprovedAndPublished(app) {
    return app && app.status === "published" && app.approved === true;
  }

  function appIsEnabled(appId, settings) {
    return !!(settings.enabledApps && settings.enabledApps[appId]);
  }

  async function runApp(app) {
    var code = await gmRequestText(app.bundleUrl);
    if (app.sha256) {
      var hash = await sha256Hex(code);
      if (!hash || !equalsIgnoreCase(hash, app.sha256)) {
        throw new Error("SHA256 mismatch for " + app.id);
      }
    }
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
    } catch (err) {
      console.error("[TM-STORE] Failed to run app " + app.id, err);
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
        }).catch(function (err) {
          console.error("[TM-STORE] app toggle load failed", err);
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
    return (
      "<article class='tm-store-card'>" +
        "<div class='tm-store-card-head'>" +
          "<h4>" + app.name + "</h4>" +
          "<span>v" + app.version + "</span>" +
        "</div>" +
        "<p>" + app.description + "</p>" +
        "<div class='tm-store-meta'>Status: " + app.status + " | ID: " + app.id + "</div>" +
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
      ".tm-store-fab{position:fixed;right:16px;bottom:16px;z-index:999999;background:#1f2940;color:#e8eefc;border:1px solid #4d5f88;border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:700}" +
      ".tm-store-overlay{position:fixed;inset:0;background:rgba(2,6,15,.65);z-index:999998;display:none}" +
      ".tm-store-panel{position:absolute;right:20px;top:20px;width:min(680px,calc(100% - 40px));max-height:calc(100% - 40px);overflow:auto;background:#111827;color:#eef2ff;border:1px solid #334155;border-radius:12px;padding:14px}" +
      ".tm-store-top{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:12px}" +
      ".tm-store-card{background:#1a2234;border:1px solid #344560;border-radius:10px;padding:10px}" +
      ".tm-store-card h4{margin:0}" +
      ".tm-store-card p{margin:8px 0;color:#c2cde3}" +
      ".tm-store-card ul{margin:8px 0 0 18px;padding:0;color:#9eb0d1}" +
      ".tm-store-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-meta{font-size:12px;color:#8fa0c3}" +
      ".tm-store-btn{margin-top:10px;padding:7px 10px;border-radius:8px;border:1px solid #566991;background:#2b3b59;color:#eef2ff;cursor:pointer}" +
      ".tm-store-btn.is-on{background:#7f1d1d;border-color:#ef4444}" +
      ".tm-store-close{background:#1f2940;color:#e8eefc;border:1px solid #4d5f88;border-radius:8px;padding:6px 10px;cursor:pointer}" +
      ".tm-store-link{color:#9dc2ff;text-decoration:none}"
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
        overlay.style.display = "block";
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
          "<button class='tm-store-close' id='tm-store-close' type='button'>Schliessen</button>" +
        "</div>" +
        "<p>Quelle: <a class='tm-store-link' target='_blank' href='" + REPO_URL + "'>" + REPO_URL + "</a></p>" +
        "<p>Governance: Apps werden ueber Pull Requests + Reviews in GitHub freigegeben.</p>" +
        "<div class='tm-store-grid'>" + cards + "</div>" +
      "</div>";

    var close = document.getElementById("tm-store-close");
    close.addEventListener("click", function () {
      overlay.style.display = "none";
    });

    var toggles = overlay.querySelectorAll("[data-app-toggle]");
    for (var j = 0; j < toggles.length; j += 1) {
      toggles[j].addEventListener("click", function (evt) {
        var appId = evt.target.getAttribute("data-app-toggle");
        toggleApp(appId);
      });
    }
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
        return;
      }
      payload = fallback.registry ? fallback.registry : fallback;
      logInfo("Using cached registry");
    }

    var apps = payload.apps || [];
    RUNTIME.apps = apps;
    if (document.body) {
      renderStoreOverlay(apps, settings);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        renderStoreOverlay(apps, settings);
      });
    }
    for (var i = 0; i < apps.length; i += 1) {
      var app = apps[i];
      if (!isApprovedAndPublished(app)) continue;
      if (!appIsEnabled(app.id, settings)) continue;
      if (app.match && !new RegExp(app.match).test(window.location.href)) continue;
      await runApp(app);
      RUNTIME.loaded[app.id] = true;
    }
  }

  boot().catch(function (err) {
    console.error("[TM-STORE] Boot error", err);
  });
})();
