/* ==TMStoreApp==
@id ticket-extras
@name Ticket Extras
@author LWE
@version 1.0.0
@description Öffnet Kunden aus Ticketliste per Icon (k{nummer})
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/.*$
@onDocumentLoad
@changelog Fügt ein Kunden-Icon vor Ticketzeilen hinzu
@changelog Klick sendet k{nummer} an #fast_cmd
==/TMStoreApp== */

(function () {
  "use strict";

  var ICON_CELL_CLASS = "tm-ticket-extras-cell";
  var ICON_BTN_CLASS = "tm-ticket-extras-btn";
  var PROCESSED_ROW_ATTR = "data-tm-ticket-extras-processed";

  function addStyle() {
    if (document.getElementById("tm-ticket-extras-style")) return;
    var style = document.createElement("style");
    style.id = "tm-ticket-extras-style";
    style.textContent =
      "." + ICON_CELL_CLASS + "{width:28px;min-width:28px;text-align:center}" +
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
    var txt = row.textContent || "";
    // Greift z.B. "(420HU)" oder "(751MSR100K)"
    var m = txt.match(/\(([0-9][A-Za-z0-9]*)\)/);
    return m ? String(m[1]).trim() : "";
  }

  function isTicketRow(tr) {
    if (!tr || !tr.querySelectorAll) return false;
    var tds = tr.querySelectorAll("td");
    if (!tds || tds.length < 4) return false;
    // Erste Spalte ist meist ID; zweite ist Knr, dritte Kunde
    var first = (tds[0].textContent || "").trim();
    var second = (tds[1].textContent || "").trim();
    var third = (tds[2].textContent || "").trim();
    if (!/^\d+$/.test(first.replace(/\s+/g, ""))) return false;
    if (!second) return false;
    if (!third) return false;
    return true;
  }

  function injectIntoTable(table) {
    if (!table) return;
    var rows = table.querySelectorAll("tr");
    if (!rows || !rows.length) return;

    // Header anpassen (einmalig)
    var header = rows[0];
    if (header && !header.querySelector("." + ICON_CELL_CLASS)) {
      var th = document.createElement("th");
      th.className = ICON_CELL_CLASS;
      th.textContent = "";
      header.insertBefore(th, header.firstChild);
    }

    for (var i = 1; i < rows.length; i += 1) {
      var row = rows[i];
      if (!isTicketRow(row)) continue;
      if (row.getAttribute(PROCESSED_ROW_ATTR) === "1") continue;

      var number = extractCustomerNumber(row);
      if (!number) continue;

      var firstCell = row.querySelector("td");
      if (!firstCell) continue;

      var cell = document.createElement("td");
      cell.className = ICON_CELL_CLASS;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = ICON_BTN_CLASS;
      btn.title = "Kunde öffnen (k" + number + ")";
      btn.textContent = "@";
      btn.addEventListener("click", (function (nr) {
        return function () {
          sendFastCmd("k" + nr);
        };
      })(number));
      cell.appendChild(btn);
      row.insertBefore(cell, firstCell);
      row.setAttribute(PROCESSED_ROW_ATTR, "1");
    }
  }

  function scan() {
    addStyle();
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i += 1) {
      var t = tables[i];
      var text = (t.textContent || "");
      if (text.indexOf("Meine Tickets") !== -1 || text.indexOf("Knr") !== -1) {
        injectIntoTable(t);
      }
    }
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

