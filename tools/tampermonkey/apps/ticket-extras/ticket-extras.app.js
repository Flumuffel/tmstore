/* ==TMStoreApp==
@id ticket-extras
@name Ticket Extras
@author LWE
@version 1.0.3
@description Öffnet Kunden aus Ticketliste per Icon
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/.*$
@onDocumentLoad
@changelog Fügt ein Kunden-Icon vor Ticketzeilen hinzu
==/TMStoreApp== */

(function () {
  "use strict";

  var TARGET_TABLE_ID = "tbl_t3_tickets";
  var ICON_WRAP_CLASS = "tm-ticket-extras-wrap";
  var ICON_HEADER_CLASS = "tm-ticket-extras-header";
  var ICON_ROW_CELL_CLASS = "tm-ticket-extras-row-cell";
  var ICON_BTN_CLASS = "tm-ticket-extras-btn";
  var PROCESSED_ROW_ATTR = "data-tm-ticket-extras-processed";

  function addStyle() {
    if (document.getElementById("tm-ticket-extras-style")) return;
    var style = document.createElement("style");
    style.id = "tm-ticket-extras-style";
    style.textContent =
      "." + ICON_HEADER_CLASS + "{width:42px;min-width:42px;text-align:center}" +
      "." + ICON_ROW_CELL_CLASS + "{width:42px;min-width:42px;text-align:center}" +
      "." + ICON_WRAP_CLASS + "{display:flex;align-items:center;justify-content:center}" +
      "." + ICON_BTN_CLASS + "{width:22px;height:22px;border-radius:6px;border:1px solid #7aa92f;background:#2b3138;color:#d8ff7a;cursor:pointer;font-weight:800;line-height:1}" +
      "." + ICON_BTN_CLASS + ":hover{filter:brightness(1.1)}";
    document.head.appendChild(style);
  }

  function sendFastCmd(command) {
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
      input.value = command;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      if (input.form && typeof input.form.requestSubmit === "function") {
        input.form.requestSubmit();
      } else if (input.form) {
        input.form.submit();
      }
      window.clearInterval(timer);
    }, 250);
  }

  function extractCustomerNumber(row) {
    if (!row) return "";
    var tds = row.querySelectorAll("td");
    if (!tds || tds.length < 4) return "";
    // Original-Layout: [cmd, id, knr, kunde, ...]
    // Wir lesen explizit aus Kunde-Spalte, nicht aus gesamter Zeile.
    var kundeText = String((tds[3] && tds[3].textContent) || "").trim();
    if (!kundeText) return "";
    // Erwartet z.B. "(2305MC)" -> wir brauchen "2305"
    var m = kundeText.match(/\((\d+[A-Za-z0-9]*)\)/);
    if (!m) return "";
    var raw = String(m[1] || "").trim();
    // Nur dann 2 Zeichen schneiden, wenn es wirklich 2 Buchstaben am Ende sind.
    if (/[A-Za-z]{2}$/.test(raw)) raw = raw.slice(0, -2);
    var lead = raw.match(/^\d+/);
    return lead ? String(lead[0]) : "";
  }

  function isTicketRow(tr) {
    if (!tr || !tr.querySelectorAll) return false;
    // In deiner Tabelle haben Ticket-Zeilen z.B. id="overview_row_9636"
    return /^overview_row_\d+$/.test(String(tr.id || ""));
  }

  function injectIntoTable(table) {
    if (!table) return;
    var headerRow = table.querySelector("thead tr");
    if (headerRow && !headerRow.querySelector("." + ICON_HEADER_CLASS)) {
      var th = document.createElement("th");
      th.className = ICON_HEADER_CLASS;
      th.textContent = "T+";
      // Direkt vor ID (Index 1, da Index 0 die bestehende Befehlsspalte ist)
      if (headerRow.children.length > 1) {
        headerRow.insertBefore(th, headerRow.children[1]);
      } else {
        headerRow.appendChild(th);
      }
    }

    var rows = table.querySelectorAll("tbody tr");
    if (!rows || !rows.length) return;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!isTicketRow(row)) continue;
      if (row.getAttribute(PROCESSED_ROW_ATTR) === "1") continue;

      var number = extractCustomerNumber(row);
      if (!number) continue;

      // Gewünschte Position: eigene Spalte direkt vor ID.
      if (row.querySelector("." + ICON_ROW_CELL_CLASS + " [data-tm-ticket-extras-btn='1']")) {
        row.setAttribute(PROCESSED_ROW_ATTR, "1");
        continue;
      }

      var cell = document.createElement("td");
      cell.className = ICON_ROW_CELL_CLASS;
      var wrap = document.createElement("span");
      wrap.className = ICON_WRAP_CLASS;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = ICON_BTN_CLASS;
      btn.setAttribute("data-tm-ticket-extras-btn", "1");
      btn.title = "Kunde öffnen (k" + number + ")";
      btn.textContent = "@";
      btn.addEventListener("click", (function (nr) {
        return function () {
          sendFastCmd("k" + nr);
        };
      })(number));
      wrap.appendChild(btn);
      cell.appendChild(wrap);

      // Vor ID einfügen (Index 1)
      if (row.children.length > 1) {
        row.insertBefore(cell, row.children[1]);
      } else {
        row.appendChild(cell);
      }
      row.setAttribute(PROCESSED_ROW_ATTR, "1");
    }
  }

  function scan() {
    addStyle();
    var table = document.getElementById(TARGET_TABLE_ID);
    if (!table) return;
    injectIntoTable(table);
  }

  function start() {
    scan();
    var obs = new MutationObserver(function () {
      scan();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

