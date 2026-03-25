/* ==TMStoreApp==
@id glz-tracker
@name GLZ Tracker
@author PHO
@version 1.0.7
@description GLZ Live Tracker
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/?(?:[?#].*)?$
@onDocumentLoad
==/TMStoreApp== */


const STYLE = `
      #glz-tracker {
        position: fixed;
        top: 80px;
        right: 10px;
        width: 240px;
        background: rgb(33, 37, 41);
        border: 1px solid rgb(222, 226, 230);
        border-radius: 6px;
        padding: 12px;
        font-family: monospace;
        font-size: 13px;
        color: rgb(222, 226, 230);
        z-index: 9999;
        user-select: none;
      }
      #glz-tracker h4 {
        margin: 0 0 10px 0;
        font-size: 13px;
        color: rgb(186, 215, 57);
        border-bottom: 1px solid rgb(73, 80, 87);
        padding-bottom: 6px;
        font-weight: 600;
        cursor: grab;
      }
      #glz-tracker h4:active { cursor: grabbing; }
      .glz-section-label {
        font-size: 10px;
        text-transform: uppercase;
        color: rgb(108, 117, 125);
        margin: 10px 0 4px 0;
        letter-spacing: 0.05em;
      }
      .glz-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 4px 0;
      }
      .glz-label { color: rgb(173, 181, 189); font-size: 12px; }
      .glz-value { font-weight: bold; }
      .glz-big { font-size: 17px; font-weight: bold; }
      .glz-positive { color: rgb(186, 215, 57) !important; }
      .glz-negative { color: rgb(221, 54, 25) !important; }
      .glz-neutral  { color: rgb(222, 226, 230) !important; }
      .glz-divider { border: none; border-top: 1px solid rgb(73, 80, 87); margin: 8px 0; }
      .glz-live-dot {
        display: inline-block; width: 7px; height: 7px;
        border-radius: 50%; background: rgb(186, 215, 57);
        margin-right: 5px; animation: glz-blink 1.2s infinite; vertical-align: middle;
      }
      @keyframes glz-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      #glz-progress-bar-bg {
        width: 100%; height: 6px; background: rgb(73, 80, 87);
        border-radius: 3px; margin: 8px 0 4px 0; overflow: hidden;
      }
      #glz-progress-bar {
        height: 100%; border-radius: 3px; background: rgb(221, 54, 25);
        transition: width 1s linear; max-width: 100%;
      }
    `;

const HTML = `
      <div id="glz-tracker">
        <h4 id="glz-drag-handle"><span class="glz-live-dot"></span>GLZ Tracker</h4>
  
        <div class="glz-section-label">Woche</div>
        <div class="glz-row">
          <span class="glz-label">WAZ ist</span>
          <span id="glz-waz-ist" class="glz-value glz-neutral">–</span>
        </div>
        <div class="glz-row">
          <span class="glz-label">WAZ soll</span>
          <span id="glz-waz-soll" class="glz-value glz-neutral">–</span>
        </div>
        <div class="glz-row">
          <span class="glz-label">WAZ diff</span>
          <span id="glz-waz-diff" class="glz-value glz-neutral">–</span>
        </div>
        <div class="glz-row">
          <span class="glz-label">GLZ Saldo</span>
          <span id="glz-saldo" class="glz-value glz-neutral">–</span>
        </div>
  
        <hr class="glz-divider">
        <div class="glz-section-label">Heute</div>
        <div class="glz-row">
          <span class="glz-label">Tot Stz (live)</span>
          <span id="glz-tag-ist" class="glz-value glz-neutral">–</span>
        </div>
        <div class="glz-row">
          <span class="glz-label">Tagessoll</span>
          <span id="glz-taz-soll" class="glz-value glz-neutral">–</span>
        </div>
        <div id="glz-progress-bar-bg"><div id="glz-progress-bar" style="width:0%"></div></div>
        <div class="glz-row" style="margin-top:4px;">
          <span class="glz-label">Noch / Über</span>
          <span id="glz-tag-remaining" class="glz-big glz-neutral">–</span>
        </div>
        <div class="glz-row">
          <span class="glz-label">Feierabend um</span>
          <span id="glz-end-time" class="glz-big glz-neutral">–</span>
        </div>
  
        <hr class="glz-divider">
        <div class="glz-row" style="font-size:11px; color: rgb(173,181,189);">
          <span>Eingestempelt</span>
          <span id="glz-login-time">–</span>
        </div>
        <div class="glz-row" style="font-size:11px; color: rgb(173,181,189);">
          <span>Pause</span>
          <span id="glz-pause-time">–</span>
        </div>
        <div class="glz-row" style="font-size:11px; color: rgb(173,181,189);">
          <span>Erkannte Arbeitstage</span>
          <span id="glz-workdays-debug">–</span>
        </div>
      </div>
    `;

function injectUI() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', HTML);
}

function makeDraggable() {
  const el = document.getElementById('glz-tracker');
  const handle = document.getElementById('glz-drag-handle');

  // Gespeicherte Position laden
  const savedX = localStorage.getItem('glz-pos-x');
  const savedY = localStorage.getItem('glz-pos-y');
  if (savedX && savedY) {
    el.style.right = 'auto';
    el.style.left = savedX + 'px';
    el.style.top = savedY + 'px';
  }

  let dragging = false;
  let offsetX = 0, offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    el.style.right = 'auto';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    // Position speichern
    localStorage.setItem('glz-pos-x', parseInt(el.style.left));
    localStorage.setItem('glz-pos-y', parseInt(el.style.top));
  });
}

function parseTime(str) {
  if (!str || str.trim() === '–' || str.trim() === '') return null;
  const neg = str.trim().startsWith('-');
  const clean = str.replace('-', '').trim();
  const parts = clean.split(':');
  if (parts.length < 2) return null;
  const mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return neg ? -mins : mins;
}

function formatSecs(totalSecs) {
  const abs = Math.abs(totalSecs);
  const h = Math.floor(abs / 3600);
  const m = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  const s = String(abs % 60).padStart(2, '0');
  return h + ':' + m + ':' + s;
}

function formatMins(mins) {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = String(abs % 60).padStart(2, '0');
  return (mins < 0 ? '-' : '') + h + ':' + m;
}

function todayStr() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return d + '.' + mo;
}

function readGadgetValues() {
  let wazSoll = null, wazIst = null, wazDiff = null, glzSaldo = null;
  let arbeitstageInWeek = null;
  let workdaysFromTaz = 0;
  let workdaysFromWazSoll = null;
  let arbeitstageSource = null;
  let loginTime = null, pauseTime = null, totStzMin = null;
  const today = todayStr();

  const gadgets = document.querySelectorAll('.gadget');
  for (const gadget of gadgets) {
    const title = gadget.querySelector('.gadget_title');
    if (!title || !title.textContent.includes('Tagesarbeitszeit')) continue;

    const rows = gadget.querySelectorAll('tr');

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (!cells.length) continue;
      const rowText = row.textContent;

      if (rowText.includes('WAZ ist') && !rowText.includes('soll')) {
        wazIst = cells[cells.length - 1].textContent.trim();
      }
      if (rowText.includes('WAZ soll') && !rowText.includes('diff')) {
        wazSoll = cells[cells.length - 1].textContent.trim();
        const mWorkdays = String(wazSoll || "").match(/\/\s*(\d{1,2})/);
        if (mWorkdays) {
          const wd = parseInt(mWorkdays[1], 10);
          if (!isNaN(wd) && wd > 0) workdaysFromWazSoll = wd;
        }
      }
      if (rowText.includes('WAZ diff')) {
        wazDiff = cells[cells.length - 1].textContent.trim();
      }
      if (rowText.includes('Neuer GLZ')) {
        glzSaldo = cells[cells.length - 1].textContent.trim();
      }

      // "Heute"-Zeile ist in der GLZ-Tracker-Tabelle häufig nicht immer gleich breit,
      // daher nicht zu streng auf die Anzahl der <td> prüfen.
      if (cells[0] && cells[0].textContent.trim() === today && cells.length >= 3) {
        if (cells[1]) {
          const m = cells[1].innerHTML.match(/(\d{1,2}:\d{2})/);
          if (m && !loginTime) loginTime = m[1];
        }

        if (cells[1]) {
          const allTimes = cells[1].innerHTML.match(/\d{1,2}:\d{2}/g);
          if (allTimes && allTimes.length >= 4) {
            const auslogge = allTimes[1];
            const einlogge2 = allTimes[2];
            const [ah, am] = auslogge.split(':').map(Number);
            const [eh, em] = einlogge2.split(':').map(Number);
            const pauseMins = (eh * 60 + em) - (ah * 60 + am);
            if (pauseMins > 0) {
              const ph = Math.floor(pauseMins / 60);
              const pm = String(pauseMins % 60).padStart(2, '0');
              pauseTime = ph + ':' + pm + ' h';
            }
          }
        }

        const totStzIdx = cells.length - 5;
        var totText = cells[totStzIdx] && cells[totStzIdx].textContent ? cells[totStzIdx].textContent.trim() : "";
        // In manchen Status-Ansichten steht in "Tot Stz" statt einer Uhrzeit einfach "jetzt".
        // Dann berechnen wir "Tot Stz" live aus Login-Zeit minus Pausen (falls berechnet).
        if (totText.toLowerCase().indexOf("jetzt") !== -1) {
          if (loginTime) {
            var tM = loginTime.match(/(\d{1,2}):(\d{2})/);
            if (tM) {
              var loginMins = parseInt(tM[1], 10) * 60 + parseInt(tM[2], 10);
              var now = new Date();
              var nowMins = now.getHours() * 60 + now.getMinutes();
              // Falls die Login-Zeit z.B. kurz nach Mitternacht liegt.
              if (loginMins > nowMins) loginMins -= 1440;

              var pauseMins = 0;
              if (pauseTime) {
                // pauseTime ist z.B. "1:05 h"
                var pm = String(pauseTime).match(/(\d+):(\d{2})\s*h/);
                if (pm) {
                  pauseMins = parseInt(pm[1], 10) * 60 + parseInt(pm[2], 10);
                }
              }

              var elapsed = nowMins - loginMins - pauseMins;
              if (!isNaN(elapsed)) totStzMin = elapsed;
            }
          }
        } else {
          const val = parseTime(totText);
          if (val !== null) totStzMin = val;
        }
      }

      // Arbeitstage automatisch aus den "TAZ"-Zeilen ableiten:
      // WICHTIG: Wir müssen direkte "tr > td"-Zellen nehmen, weil in "Stz" verschachtelte Tabellen
      // sonst die Indizes von querySelectorAll('td') verschieben können.
      var directTds = row && row.querySelectorAll ? row.querySelectorAll(":scope > td") : null;
      if (directTds && directTds.length >= 2) {
        const dateText = (directTds[0] && directTds[0].textContent ? directTds[0].textContent.trim() : "");
        if (/^\d{1,2}\.\d{2}$/.test(dateText)) {
          const tazIdx = directTds.length - 2; // vorletzte direkte Spalte
          const tazText =
            directTds[tazIdx] && directTds[tazIdx].textContent ? directTds[tazIdx].textContent.trim() : "";
          const tazMins = parseTime(tazText);
          if (tazMins !== null && tazMins !== 0) {
            workdaysFromTaz += 1;
          }
        }
      }
    }
  }

  // Priorität: TAZ-Zählung (robuster), sonst WAZ-soll "/n" als Fallback.
  if (workdaysFromTaz > 0) {
    arbeitstageInWeek = workdaysFromTaz;
    arbeitstageSource = "TAZ";
  } else if (workdaysFromWazSoll && workdaysFromWazSoll > 0) {
    arbeitstageInWeek = workdaysFromWazSoll;
    arbeitstageSource = "WAZ_soll";
  }

  return {
    wazSoll,
    wazIst,
    wazDiff,
    glzSaldo,
    loginTime,
    pauseTime,
    totStzMin,
    arbeitstageInWeek,
    arbeitstageSource,
  };
}

const state = {};

function initState() {
  const {
    wazSoll,
    wazIst,
    wazDiff,
    glzSaldo,
    loginTime,
    pauseTime,
    totStzMin,
    arbeitstageInWeek,
    arbeitstageSource,
  } = readGadgetValues();

  state.totStzMin = totStzMin !== null ? totStzMin : 0;
  state.loadTime = new Date();

  const wazSollMin = parseTime(wazSoll);
  const workdays = arbeitstageInWeek && arbeitstageInWeek > 0 ? arbeitstageInWeek : 5;
  state.tageSollMin = wazSollMin !== null ? Math.round(wazSollMin / workdays) : (8 * 60 + 24);

  document.getElementById('glz-waz-ist').textContent = wazIst || '–';
  document.getElementById('glz-waz-soll').textContent = wazSoll || '–';
  document.getElementById('glz-taz-soll').textContent = formatMins(state.tageSollMin);

  if (wazDiff) {
    const el = document.getElementById('glz-waz-diff');
    el.textContent = wazDiff;
    const v = parseTime(wazDiff);
    if (v !== null) el.className = 'glz-value ' + (v >= 0 ? 'glz-positive' : 'glz-negative');
  }

  if (glzSaldo) {
    const el = document.getElementById('glz-saldo');
    el.textContent = glzSaldo;
    const v = parseTime(glzSaldo);
    if (v !== null) el.className = 'glz-value ' + (v >= 0 ? 'glz-positive' : 'glz-negative');
  }

  document.getElementById('glz-login-time').textContent = loginTime ? loginTime + ' Uhr' : '–';
  document.getElementById('glz-pause-time').textContent = pauseTime || 'keine';
  var workdaysEl = document.getElementById('glz-workdays-debug');
  if (workdaysEl) {
    var src = arbeitstageSource ? String(arbeitstageSource) : "FALLBACK";
    workdaysEl.textContent = workdays + " (" + src + ")";
  }
}

function tick() {
  const now = new Date();
  const secsSinceLoad = Math.floor((now - state.loadTime) / 1000);

  const totStzSecs = state.totStzMin * 60 + secsSinceLoad;
  document.getElementById('glz-tag-ist').textContent = formatSecs(totStzSecs);

  const tagSollSecs = state.tageSollMin * 60;
  const pct = Math.min(100, (totStzSecs / tagSollSecs) * 100);
  const bar = document.getElementById('glz-progress-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 100 ? 'rgb(186, 215, 57)' : 'rgb(221, 54, 25)';

  const remSecs = tagSollSecs - totStzSecs;
  const remEl = document.getElementById('glz-tag-remaining');
  remEl.textContent = (remSecs <= 0 ? '+' : '') + formatSecs(Math.abs(remSecs));
  remEl.className = 'glz-big ' + (remSecs <= 0 ? 'glz-positive' : 'glz-negative');

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const endMins = ((nowMins + Math.ceil(remSecs / 60)) % 1440 + 1440) % 1440;
  const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
  const endM = String(endMins % 60).padStart(2, '0');
  const endEl = document.getElementById('glz-end-time');
  endEl.textContent = endH + ':' + endM + ' Uhr';
  endEl.className = 'glz-big ' + (remSecs <= 0 ? 'glz-positive' : 'glz-negative');
}

function start() {
  // Wenn durch F5/Ctrl+F5 die load-Event bereits durch ist, trotzdem sauber starten.
  injectUI();
  makeDraggable();
  initState();
  tick();
  if (!state._interval) {
    state._interval = setInterval(tick, 1000);
  }
}

if (document.readyState === 'complete') {
  start();
} else {
  window.addEventListener('load', start, { once: true });
}
