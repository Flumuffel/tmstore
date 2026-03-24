(function () {
  "use strict";

  var STYLE_ID = "tm-darkmode-style";
  var CSS_URL = "https://raw.githubusercontent.com/your-org/your-tm-store-repo/main/tools/tampermonkey/apps/darkmode.css";
  var OPT_OUT_KEY = "tm_darkmode_optout_v1";

  function loadOptOutList() {
    try {
      var raw = localStorage.getItem(OPT_OUT_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveOptOutList(list) {
    localStorage.setItem(OPT_OUT_KEY, JSON.stringify(list));
  }

  function currentPathKey() {
    return window.location.pathname || "/";
  }

  function injectCssLink() {
    if (document.getElementById(STYLE_ID)) return;
    var link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  function applyClass() {
    document.documentElement.classList.add("tm-darkmode");
    document.body.classList.add("tm-darkmode");
  }

  function removeClass() {
    document.documentElement.classList.remove("tm-darkmode");
    document.body.classList.remove("tm-darkmode");
  }

  function addToggleButton() {
    if (document.getElementById("tm-darkmode-toggle")) return;
    var target = document.getElementById("fast_cmd_div") || document.body;
    var btn = document.createElement("button");
    btn.id = "tm-darkmode-toggle";
    btn.type = "button";
    btn.textContent = "Darkmode";
    btn.style.marginLeft = "8px";
    btn.style.padding = "6px 8px";
    btn.style.border = "1px solid #4e5b78";
    btn.style.background = "#1a2131";
    btn.style.color = "#e8edf8";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", function () {
      var active = document.documentElement.classList.toggle("tm-darkmode");
      document.body.classList.toggle("tm-darkmode", active);
    });
    target.appendChild(btn);

    var pageBtn = document.createElement("button");
    pageBtn.id = "tm-darkmode-page-toggle";
    pageBtn.type = "button";
    pageBtn.style.marginLeft = "6px";
    pageBtn.style.padding = "6px 8px";
    pageBtn.style.border = "1px solid #4e5b78";
    pageBtn.style.background = "#1a2131";
    pageBtn.style.color = "#e8edf8";
    pageBtn.style.cursor = "pointer";
    function refreshPageButtonText() {
      var optOut = loadOptOutList();
      pageBtn.textContent = optOut[currentPathKey()] ? "Darkmode fuer Seite AN" : "Darkmode fuer Seite AUS";
    }
    pageBtn.addEventListener("click", function () {
      var optOut = loadOptOutList();
      var key = currentPathKey();
      optOut[key] = !optOut[key];
      saveOptOutList(optOut);
      if (optOut[key]) {
        removeClass();
      } else {
        applyClass();
      }
      refreshPageButtonText();
    });
    refreshPageButtonText();
    target.appendChild(pageBtn);
  }

  function boot() {
    injectCssLink();
    var optOut = loadOptOutList();
    var disabledOnPage = !!optOut[currentPathKey()];
    if (document.body) {
      if (!disabledOnPage) applyClass();
      addToggleButton();
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        if (!disabledOnPage) applyClass();
        addToggleButton();
      });
    }
  }

  boot();
})();
