// ==UserScript==
// @name         Klixa TM Store Loader
// @namespace    klixa.tm.store
// @version      0.3.0
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
// ==/UserScript==

(function () {
  "use strict";

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
  var LOADER_LOCAL_VERSION =
    (typeof GM_info !== "undefined" &&
      GM_info &&
      GM_info.script &&
      GM_info.script.version)
      ? String(GM_info.script.version)
      : "0.2.3";
  var UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  var DEFAULT_SETTINGS = {
    enabledApps: {
      
    },
    ui: {
      open: false
    }
  };
  var RUNTIME = {
    apps: [],
    loaded: {},
    status: [],
    logs: [],
    loadedCss: {},
    loaderUpdate: {
      checkedAt: 0,
      remoteVersion: null,
      hasUpdate: false,
      commitTitle: null,
      commitUrl: null,
      commitSha: null
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
    if (!raw) {
      GM_setValue(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return safeParse(raw, DEFAULT_SETTINGS);
  }

  function loadUpdateState() {
    var raw = GM_getValue(UPDATE_CHECK_KEY, "");
    if (!raw) return { checkedAt: 0, remoteVersion: null, hasUpdate: false, commitTitle: null, commitUrl: null, commitSha: null };
    return safeParse(raw, { checkedAt: 0, remoteVersion: null, hasUpdate: false, commitTitle: null, commitUrl: null, commitSha: null });
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

  async function fetchLatestLoaderCommit() {
    var apiUrl =
      "https://api.github.com/repos/" +
      GITHUB_OWNER +
      "/" +
      GITHUB_REPO +
      "/commits?path=tools/tampermonkey/loader.user.js&sha=" +
      encodeURIComponent(GITHUB_REF) +
      "&per_page=1";
    var txt = await gmRequest(apiUrl);
    var arr = safeParse(txt, []);
    if (!Array.isArray(arr) || !arr.length) {
      return { title: null, url: null, sha: null };
    }
    var c = arr[0] || {};
    var msg = c.commit && c.commit.message ? String(c.commit.message) : "";
    return {
      title: msg ? msg.split("\n")[0] : null,
      url: c.html_url || null,
      sha: c.sha ? String(c.sha).slice(0, 7) : null
    };
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
      cssInjectedByLoader: !!RUNTIME.loadedCss[app.id]
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
        "<div class='tm-store-card-info'>Status: " + app.status + " | ID: " + app.id + "</div>" +
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
      ".tm-store-version-pill{display:inline-flex;align-items:center;gap:6px;width:fit-content;padding:4px 9px;border-radius:999px;background:rgba(73,102,160,.28);border:1px solid rgba(129,168,244,.45);font-size:12px;color:#dce9ff}" +
      ".tm-store-meta{margin:12px 0 0 0;padding:10px 12px;border:1px solid rgba(91,123,184,.3);border-radius:12px;background:rgba(14,24,46,.45)}" +
      ".tm-store-meta p{margin:6px 0;color:#d3def6;font-size:13px}" +
      ".tm-store-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:14px;margin-top:14px}" +
      ".tm-store-card{position:relative;background:linear-gradient(180deg,rgba(39,57,91,.92) 0%,rgba(22,36,63,.94) 100%);border:1px solid #5878b0;border-radius:14px;padding:13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 12px 22px rgba(0,0,0,.25)}" +
      ".tm-store-card::after{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,rgba(148,193,255,.08),rgba(255,255,255,0) 46%);pointer-events:none}" +
      ".tm-store-card h4{margin:0;font-size:17px;letter-spacing:.3px}" +
      ".tm-store-card p{margin:8px 0;color:#cdddff;font-size:14px}" +
      ".tm-store-card ul{margin:8px 0 0 18px;padding:0;color:#aac0e9;font-size:13px}" +
      ".tm-store-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".tm-store-card-info{font-size:12px;color:#9fb3dd}" +
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
      ".tm-store-link{color:#9dc2ff;text-decoration:none}" +
      ".tm-store-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
      ".tm-store-update-banner{margin:12px 0;padding:10px 12px;border:1px solid #8b6a35;border-radius:12px;background:linear-gradient(135deg,rgba(96,60,15,.45),rgba(58,43,24,.35));color:#ffe9cf}" +
      ".tm-store-update-actions{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".tm-store-confirm-btn{background:#1c5b33;color:#d7ffe5;border:1px solid #3ca86a;border-radius:8px;padding:6px 10px;cursor:pointer}" +
      ".tm-store-feedback{position:fixed;right:20px;bottom:78px;z-index:999999;background:linear-gradient(135deg,rgba(12,20,36,.96),rgba(16,31,58,.94));border:1px solid #4f6fa5;border-radius:14px;color:#eaf2ff;min-width:300px;max-width:420px;padding:10px 12px;box-shadow:0 18px 40px rgba(0,0,0,.45);backdrop-filter:blur(6px);animation:tmToastIn .22s ease-out}" +
      ".tm-store-feedback h4{margin:0 0 6px 0;font-size:13px}" +
      ".tm-store-feedback ul{margin:0;padding-left:16px}" +
      ".tm-store-feedback li{font-size:12px;margin:2px 0}" +
      ".tm-store-feedback.ok li{color:#bff5d2}" +
      ".tm-store-feedback.warn li{color:#ffd3d3}" +
      "@keyframes tmToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}" +
      ".tm-store-debug{margin-top:12px;border:1px solid #4f6591;border-radius:12px;padding:10px;background:rgba(8,14,29,.65)}" +
      ".tm-store-debug-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}" +
      ".tm-store-debug-pre{font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;line-height:1.35;max-height:240px;overflow:auto;color:#cfe1ff;background:#0b1220;border:1px solid #334a73;border-radius:8px;padding:8px}"
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
    var cards = "";
    for (var i = 0; i < published.length; i += 1) {
      var app = published[i];
      var enabled = appIsEnabled(app.id, settings);
      cards += appCardHtml(app, enabled);
    }

    var updateBanner = "";
    if (RUNTIME.loaderUpdate.hasUpdate) {
      updateBanner =
        "<div class='tm-store-update-banner'>" +
        "Neues Loader-Update verfügbar: v" + RUNTIME.loaderUpdate.remoteVersion +
        " (lokal v" + LOADER_LOCAL_VERSION + ")." +
        (RUNTIME.loaderUpdate.commitTitle ? "<br><strong>Letzter Commit:</strong> " + RUNTIME.loaderUpdate.commitTitle : "") +
        (RUNTIME.loaderUpdate.commitSha ? " <span style='opacity:.8'>(#" + RUNTIME.loaderUpdate.commitSha + ")</span>" : "") +
        (RUNTIME.loaderUpdate.commitUrl ? "<br><a class='tm-store-link' target='_blank' href='" + RUNTIME.loaderUpdate.commitUrl + "'>Commit auf GitHub ansehen</a>" : "") +
        "<div class='tm-store-update-actions'>" +
          "<button class='tm-store-confirm-btn' id='tm-store-update-confirm-btn' type='button'>Gelesen</button>" +
        "</div>" +
        "</div>";
    }

    overlay.innerHTML =
      "<div class='tm-store-panel'>" +
        "<div class='tm-store-top'>" +
          "<div class='tm-store-title'>" +
            "<h3 style='margin:0'>Tampermonkey Store</h3>" +
            "<p class='tm-store-subtitle'>Apps, Updates und Debugging zentral in einem Store.</p>" +
            "<span class='tm-store-version-pill'>Store-Version: v" + LOADER_LOCAL_VERSION + "</span>" +
          "</div>" +
          "<div class='tm-store-actions'>" +
            "<button class='tm-store-update-btn' id='tm-store-update-check-btn' type='button'>Update prüfen</button> " +
            (RUNTIME.loaderUpdate.hasUpdate ? "<button class='tm-store-update-btn' id='tm-store-update-now-btn' type='button'>Jetzt aktualisieren</button> " : "") +
            "<button class='tm-store-debug-btn' id='tm-store-debug-btn' type='button'>Debug</button> " +
            "<button class='tm-store-close' id='tm-store-close' type='button'>Schließen</button>" +
          "</div>" +
        "</div>" +
        "<div class='tm-store-meta'>" +
          "<p><strong>Quelle:</strong> <a class='tm-store-link' target='_blank' href='" + REPO_URL + "'>" + REPO_URL + "</a></p>" +
          "<p><strong>Governance:</strong> Apps werden über Pull Requests + Reviews in GitHub freigegeben.</p>" +
        "</div>" +
        updateBanner +
        "<div class='tm-store-grid'>" + cards + "</div>" +
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
    var updateCheckBtn = root.getElementById("tm-store-update-check-btn");
    var updateNowBtn = root.getElementById("tm-store-update-now-btn");
    var updateConfirmBtn = root.getElementById("tm-store-update-confirm-btn");
    var debugWrap = root.getElementById("tm-store-debug");
    var debugRefresh = root.getElementById("tm-store-debug-refresh");
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
    updateCheckBtn.addEventListener("click", function () {
      checkLoaderUpdate(true).then(function () {
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      });
    });
    if (updateNowBtn) {
      updateNowBtn.addEventListener("click", function () {
        var url = LOADER_REMOTE_URL + "?t=" + now();
        window.open(url, "_blank");
      });
    }
    if (updateConfirmBtn) {
      updateConfirmBtn.addEventListener("click", function () {
        saveUpdateAck(RUNTIME.loaderUpdate.remoteVersion || "");
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      });
    }

    var toggles = overlay.querySelectorAll("[data-app-toggle]");
    for (var j = 0; j < toggles.length; j += 1) {
      toggles[j].addEventListener("click", function (evt) {
        var appId = evt.target.getAttribute("data-app-toggle");
        toggleApp(appId);
      });
    }
  }

  async function checkLoaderUpdate(force) {
    var state = loadUpdateState();
    if (!force && state.checkedAt && (now() - state.checkedAt) < UPDATE_CHECK_INTERVAL_MS) {
      RUNTIME.loaderUpdate = state;
      addLog("info", "update", "Update-Check übersprungen (Intervall aktiv)");
      return state;
    }

    try {
      addLog("info", "update", "Prüfe Loader-Update (GitHub API)", { url: LOADER_CONTENT_API_URL });
      var apiTxt = await gmRequest(LOADER_CONTENT_API_URL + "&t=" + now());
      var apiObj = safeParse(apiTxt, null);
      var remoteSource = "";
      if (apiObj && apiObj.content) {
        remoteSource = decodeBase64Utf8(apiObj.content);
      }
      if (!remoteSource) {
        var updateUrl = LOADER_REMOTE_URL + "?t=" + now() + "&r=" + Math.random().toString(36).slice(2);
        addLog("info", "update", "Fallback auf raw.githubusercontent.com", { url: updateUrl });
        remoteSource = await gmRequestText(updateUrl);
      }
      var remoteVersion = extractUserscriptVersion(remoteSource);
      var hasUpdate = !!(remoteVersion && isVersionNewer(remoteVersion, LOADER_LOCAL_VERSION));
      var commit = { title: null, url: null, sha: null };
      try {
        commit = await fetchLatestLoaderCommit();
      } catch (commitErr) {
        addLog("error", "update", "Commit-Changelog konnte nicht geladen werden", {
          error: commitErr && commitErr.message ? commitErr.message : "Unbekannt"
        });
      }
      state = {
        checkedAt: now(),
        remoteVersion: remoteVersion || null,
        hasUpdate: hasUpdate,
        commitTitle: commit.title,
        commitUrl: commit.url,
        commitSha: commit.sha
      };
      saveUpdateState(state);
      RUNTIME.loaderUpdate = state;
      addLog("info", "update", "Update-Check abgeschlossen", state);
      return state;
    } catch (err) {
      addLog("error", "update", "Update-Check fehlgeschlagen", {
        error: err && err.message ? err.message : "Unbekannt"
      });
      return state;
    }
  }

  function renderBootFeedback() {
    var root = ensureStoreRoot();
    var host = root.getElementById("tm-store-feedback");
    if (!host) {
      host = document.createElement("div");
      host.id = "tm-store-feedback";
      host.className = "tm-store-feedback";
      root.appendChild(host);
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
      "<h4>Systemstatus • Geladen: " + okCount + " • Fehler: " + failCount + "</h4>" +
      "<ul>" + list + "</ul>";
    window.setTimeout(function () {
      var current = root.getElementById("tm-store-feedback");
      if (current) current.remove();
    }, 4200);
  }

  async function boot() {
    RUNTIME.loaderUpdate = loadUpdateState();
    checkLoaderUpdate(false).then(function () {
      if (document.body) {
        renderStoreOverlay(RUNTIME.apps, loadSettings());
      }
    });

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
