/* ==TMStoreApp==
@id ticket-extras
@name Ticket Extras
@author LWE
@version 1.0.2
@description Öffnet Kunden aus Ticketliste per Icon (k{nummer})
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
  var ICON_BTN_CLASS = "tm-ticket-extras-btn";
  var PROCESSED_ROW_ATTR = "data-tm-ticket-extras-processed";

  function addStyle() {
    if (document.getElementById("tm-ticket-extras-style")) return;
    var style = document.createElement("style");
    style.id = "tm-ticket-extras-style";
    style.textContent =
      "." + ICON_WRAP_CLASS + "{display:flex;align-items:center;justify-content:center;margin-bottom:4px}" +
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
    if (!m) return "";
    var raw = String(m[1] || "").trim();
    if (raw.length > 2) raw = raw.slice(0, -2); // Wunsch: letzte 2 Zeichen abschneiden
    var onlyDigits = raw.replace(/\D/g, "");
    if (onlyDigits) return onlyDigits;
    // Fallback auf führende Zahl, falls Format abweicht
    var lead = String(m[1] || "").match(/^\d+/);
    return lead ? String(lead[0]) : "";
  }

  function isTicketRow(tr) {
    if (!tr || !tr.querySelectorAll) return false;
    // In deiner Tabelle haben Ticket-Zeilen z.B. id="overview_row_9636"
    return /^overview_row_\d+$/.test(String(tr.id || ""));
  }

  function injectIntoTable(table) {
    if (!table) return;
    var rows = table.querySelectorAll("tbody tr");
    if (!rows || !rows.length) return;

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!isTicketRow(row)) continue;
      if (row.getAttribute(PROCESSED_ROW_ATTR) === "1") continue;

      var number = extractCustomerNumber(row);
      if (!number) continue;

      // Gewünschte Position: in die erste Befehls-Zelle vor die vorhandenen edit/brief Icons.
      var commandCell = row.querySelector("td");
      if (!commandCell) continue;
      if (commandCell.querySelector("[data-tm-ticket-extras-btn='1']")) {
        row.setAttribute(PROCESSED_ROW_ATTR, "1");
        continue;
      }

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
      commandCell.insertBefore(wrap, commandCell.firstChild);
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

