(function () {
  "use strict";

  var STYLE_ID = "tm-darkmode-style";
  var CSS_URL = "https://raw.githubusercontent.com/Flumuffel/tmstore/main/tools/tampermonkey/apps/darkmode.css";

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

  function showAppliedToast() {
    if (document.getElementById("tm-darkmode-toast")) return;
    var toast = document.createElement("div");
    toast.id = "tm-darkmode-toast";
    toast.textContent = "Darkmode aktiv";
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.bottom = "22px";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "8px 12px";
    toast.style.borderRadius = "999px";
    toast.style.background = "rgba(10, 18, 34, 0.86)";
    toast.style.border = "1px solid #465f90";
    toast.style.color = "#e8f0ff";
    toast.style.fontSize = "12px";
    toast.style.fontWeight = "700";
    toast.style.zIndex = "999999";
    toast.style.backdropFilter = "blur(4px)";
    document.body.appendChild(toast);
    window.setTimeout(function () {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2600);
  }

  function boot() {
    injectCssLink();
    if (document.body) {
      applyClass();
      showAppliedToast();
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        applyClass();
        showAppliedToast();
      });
    }
  }

  boot();
})();
