/* ==TMStoreApp==
@id klixa-enhancements
@name Klixa Enhancements
@version 1.0.0
@description Zusatzfunktionen für Online-Liste, Gleitzeit-Ansicht und erweitertes Dark-UI
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/.*$
@changelog Neue Enhancement-App in eigenem Ordner
@changelog Online-Liste mit Kürzeln sortieren und Gleitzeit optimieren
==/TMStoreApp== */

(function () {
  "use strict";

  function addGlobalStyle(css) {
    var head = document.getElementsByTagName("head")[0];
    if (!head) return;
    var style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = css;
    head.appendChild(style);
  }

  function normalizeUmlauts(str) {
    return String(str || "")
      .replace(/ü/g, "Ü")
      .replace(/ö/g, "Ö")
      .replace(/ä/g, "Ä");
  }

  function isAllUpper(str) {
    var normalized = normalizeUmlauts(str);
    return /^[A-ZÄÖÜ\-]+$/.test(normalized);
  }

  function appendNames(listItems) {
    listItems.forEach(function (li) {
      if (li.querySelector(".showName")) return;
      var img = li.querySelector("img");
      if (!img) return;
      var fullName = (img.getAttribute("alt") || "").trim();
      if (!fullName) return;
      var nameParts = fullName.split(/\s+/);
      var firstNormal = null;
      var firstUpper = null;

      for (var i = 0; i < nameParts.length; i += 1) {
        var part = nameParts[i];
        if (!firstNormal && !isAllUpper(part)) firstNormal = part;
        if (!firstUpper && isAllUpper(part)) firstUpper = part;
        if (firstNormal && firstUpper) break;
      }

      var initials = "";
      if (firstNormal && firstUpper) {
        initials =
          firstNormal.charAt(0).toUpperCase() +
          normalizeUmlauts(firstUpper).substring(0, 2).toUpperCase();
      }

      var span = document.createElement("span");
      span.textContent = initials;
      span.classList.add("showName");
      li.appendChild(span);
    });
  }

  function sortNames(listItems) {
    var arr = Array.from(listItems);
    arr.sort(function (a, b) {
      var text1 = ((a.querySelector("span") || {}).textContent || "").trim();
      var text2 = ((b.querySelector("span") || {}).textContent || "").trim();
      return text1.localeCompare(text2);
    });
    arr.forEach(function (li) {
      li.parentNode.appendChild(li);
    });
  }

  function convertDecimalToTime(decimal) {
    var hours = Math.floor(decimal);
    var minutes = Math.round((decimal - hours) * 60);
    var minutesStr = minutes < 10 ? "0" + minutes : String(minutes);
    return hours + ":" + minutesStr;
  }

  function convertTimesInElement(parentElement) {
    var tds = parentElement.querySelectorAll("td");
    tds.forEach(function (td) {
      var regex = /(-?\d+(\.\d+)?)\s*h/;
      var match = td.textContent.match(regex);
      if (match) {
        var value = parseFloat(match[1]);
        var sign = value < 0 ? "-" : "";
        var converted = convertDecimalToTime(Math.abs(value));
        td.textContent = td.textContent.replace(match[0], sign + converted);
      }
    });
  }

  function replaceBlackBordersWithCustom() {
    var images = document.querySelectorAll(".simply-scroll-list li img");
    images.forEach(function (img) {
      var borderBottomColor = window.getComputedStyle(img).borderBottomColor;
      if (borderBottomColor === "rgb(0, 0, 0)") {
        img.style.borderBottom = "3px solid rgb(221, 50, 21)";
      } else if (borderBottomColor === "rgb(51, 255, 0)") {
        img.style.borderBottom = "3px solid rgb(186, 215, 57)";
      }
    });
  }

  function updateOnlineList() {
    var onlineElement = document.getElementById("online");
    if (!onlineElement) return;
    var list = document.querySelector(".simply-scroll-list");
    if (!list) return;
    var listItems = list.querySelectorAll("li");
    if (!listItems.length) return;
    appendNames(listItems);
    sortNames(listItems);
  }

  function adjustGleitzeitGadget() {
    document.querySelectorAll(".gadget").forEach(function (gadget) {
      var title = gadget.querySelector(".gadget_title");
      if (title && title.textContent.includes("Tagesarbeitszeit / Gleitzeit-Saldo")) {
        gadget.style.height = "auto";
        gadget.style.overflow = "visible";
        convertTimesInElement(gadget);
      }
    });
  }

  function applyEnhancementStyles() {
    addGlobalStyle(
      "#online{width:max-content;background-color:rgb(33,37,41);border-radius:2px;border:rgb(222,226,230) thin solid;padding-bottom:0}" +
        ".simply-scroll-list li{display:flex;flex-direction:column;align-items:center;gap:.5em;padding-bottom:1em}" +
        ".showName{writing-mode:horizontal-tb;rotate:0;transform-origin:top left;font-size:65%;overflow:visible;text-align:center;display:block}" +
        ".quicklinks{max-width:unset !important;background-repeat:repeat-x !important;min-width:1px !important;height:auto}" +
        ".simply-scroll-clip,.simply-scroll-list,.quicklinks{overflow:visible !important}" +
        ".simply-scroll-list,.header_wrap{height:auto !important}" +
        "#fast_cmd_div{position:absolute;top:5px;left:calc(100vw - 20px);transform:translateX(-100%)}" +
        "#fast_cmd_div > form{display:flex;justify-content:center;align-items:center}"
    );

    addGlobalStyle(
      "body,.corners_wrapper,#centermid,#stempeluhr_div_active,#stempeluhr_div,.menubot_in,.menutop_in,.menue_kat,a,p,form,input,select,textarea,.ui-widget-content,.ui-widget-header{background:none;background-color:rgb(52,58,64);color:rgb(222,226,230)!important}" +
        ".gadget{border:rgb(222,226,230) thin solid;background:rgb(33,37,41)}" +
        ".gadget_title{background-color:rgb(52,58,64)}" +
        "tr.even,.week_content_gray{background-color:rgb(43,48,53)}" +
        "tr.odd,.week_content{background-color:rgb(73,80,87)}" +
        "tr.even:hover,tr.odd:hover,a:hover{background-color:rgb(102,106,111)!important}" +
        "a{background-color:transparent}" +
        ".footer_bar{border-top:1px solid rgb(222,226,230)!important;border-radius:2px;background-color:rgb(33,37,41)!important}" +
        ".highcharts-background,circle{fill:rgb(52,58,64)!important}" +
        "text{fill:rgb(222,226,230)!important}" +
        ".chosen-drop,.chosen-single,input[type='button']{background:rgb(52,58,64)!important}" +
        "td[style='color:green'],span[style='color: #33ff00;']{color:rgb(186,215,57)!important}" +
        "td[style*='background-color: red']{filter:brightness(.95) contrast(1.1)}"
    );
  }

  function replaceLogo() {
    var logo = document.querySelector("img.kx_logo");
    if (!logo) return;
    logo.style.filter = "drop-shadow(0 1px 4px rgba(0,0,0,0.35)) brightness(1.05)";
  }

  function init() {
    applyEnhancementStyles();
    updateOnlineList();
    adjustGleitzeitGadget();
    replaceBlackBordersWithCustom();
    replaceLogo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
