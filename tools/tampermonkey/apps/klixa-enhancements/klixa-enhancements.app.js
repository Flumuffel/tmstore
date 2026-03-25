/* ==TMStoreApp==
@id klixa-enhancements
@name Klixa Enhancements
@author PHO
@version 2.1.1
@description Legacy Enhancements
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/.*$
@changelog Darkmode wird ohne Buttons automatisch aktiviert
@changelog Kürzeln in Online-Liste sortierbar
@changelog Schwarze Balken in Online-Liste rot
@changelog Gleitzeit-Gadget angepasst
@changelog Profil-Button neben Schnellbefehl (#fast_cmd)
@settings kuerzel string ""
==/TMStoreApp== */

function tmStoreGetKlixaSettings() {
    try {
        if (typeof window.__TM_STORE_GET_APP_SETTINGS === "function") {
            return window.__TM_STORE_GET_APP_SETTINGS("klixa-enhancements") || {};
        }
        if (window.__TM_STORE_CONTEXT && window.__TM_STORE_CONTEXT.appId === "klixa-enhancements") {
            return window.__TM_STORE_CONTEXT.appSettings || {};
        }
    } catch (e) {}
    return {};
}

function tmStoreDeriveKuerzelFromLoginText() {
    try {
        const txt = (document.body && (document.body.innerText || document.body.textContent)) ? String(document.body.innerText || document.body.textContent) : "";
        const m = txt.match(/Eingeloggt\s+als:\s*([^\n\r]+)/i);
        if (!m) return "";
        const name = String(m[1] || "").trim();
        if (!name) return "";
        const parts = name.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return "";
        const first = parts[0];
        const last = parts[parts.length - 1];
        const normalize = (s) =>
            String(s || "")
                .replace(/ü/g, "Ue").replace(/Ü/g, "UE")
                .replace(/ö/g, "Oe").replace(/Ö/g, "OE")
                .replace(/ä/g, "Ae").replace(/Ä/g, "AE")
                .replace(/ß/g, "SS");
        const f = normalize(first).charAt(0).toUpperCase();
        const l = normalize(last).substring(0, 2).toUpperCase();
        const code = (f + l).replace(/[^A-Z]/g, "");
        return code.length >= 2 ? code : "";
    } catch (e) {
        return "";
    }
}

function tmStoreGetProfileKuerzel() {
    const s = tmStoreGetKlixaSettings();
    const explicit = (s && s.kuerzel != null) ? String(s.kuerzel).trim() : "";
    if (explicit) return explicit.toUpperCase();
    return tmStoreDeriveKuerzelFromLoginText();
}

function tmStoreSendFastCmd(cmd) {
    try {
        let tries = 0;
        const maxTries = 25; // wie im Store-@author Verhalten
        const timer = window.setInterval(function () {
            tries += 1;
            const input = document.querySelector("#fast_cmd");
            if (!input) {
                if (tries >= maxTries) window.clearInterval(timer);
                return;
            }

            input.focus();
            input.value = cmd;
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
        }, 350);
        return true;
    } catch (e) {
        return false;
    }
}

function tmStoreEnsureProfileButton() {
    try {
        const form = document.querySelector("#fast_cmd_div > form");
        const input = document.querySelector("#fast_cmd");
        if (!form || !input) return;
        if (form.querySelector("[data-tmstore-profile-btn='1']")) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-tmstore-profile-btn", "1");
        const initialK = tmStoreGetProfileKuerzel();
        btn.title = initialK ? ("Zum eigenen Profil (a " + initialK + ")") : "Zum eigenen Profil (a <Kürzel>)";
        btn.textContent = initialK ? ("@" + initialK) : "@";
        btn.style.marginRight = "8px";
        btn.style.padding = "6px 10px";
        btn.style.borderRadius = "10px";
        btn.style.border = "1px solid rgb(186, 215, 57)";
        btn.style.background = "rgb(33, 37, 41)";
        btn.style.color = "rgb(186, 215, 57)";
        btn.style.cursor = "pointer";
        btn.style.fontWeight = "800";
        btn.style.lineHeight = "1";

        btn.addEventListener("click", function () {
            const kuerzel = tmStoreGetProfileKuerzel();
            if (!kuerzel) return;
            btn.title = "Zum eigenen Profil (a " + kuerzel + ")";
            btn.textContent = "@" + kuerzel;
            tmStoreSendFastCmd("a " + kuerzel);
        });

        form.insertBefore(btn, input);

        // Wenn Settings/DOM später kommen, Tooltip dynamisch aktualisieren.
        window.setTimeout(function () {
            const k = tmStoreGetProfileKuerzel();
            if (k) {
                btn.title = "Zum eigenen Profil (a " + k + ")";
                btn.textContent = "@" + k;
            }
        }, 800);
    } catch (e) {}
}

// 1. Online-Benutzerliste anpassen
const onlineElement = document.getElementById("online");
if (onlineElement) {
    const elemCopy = onlineElement.cloneNode(true);
    onlineElement.parentNode.replaceChild(elemCopy, onlineElement);

    const list = document.querySelector(".simply-scroll-list");
    const listItems = list.querySelectorAll("li");

    appendNames(listItems);
    sortNames(listItems);
}

// 2. Gleitzeit-Gadget anpassen
document.querySelectorAll('.gadget').forEach((gadget) => {
    const title = gadget.querySelector('.gadget_title');
    if (title && title.textContent.includes('Tagesarbeitszeit / Gleitzeit-Saldo')) {
        gadget.style.height = 'auto';
        gadget.style.overflow = 'visible';
        convertTimesInElement(gadget); // Zeitkonvertierung direkt hinzugefügt
    }
});

// 3. Schwarze Balken ersetzen
function replaceBlackBordersWithRed() {
    const images = document.querySelectorAll('.simply-scroll-list li img');
    images.forEach((img) => {
        const borderBottomColor = window.getComputedStyle(img).borderBottomColor;
        if (borderBottomColor === 'rgb(0, 0, 0)') {
            img.style.borderBottom = '3px solid rgb(221, 50, 21)';
        } else if ( borderBottomColor === 'rgb(51, 255, 0)') {
            img.style.borderBottom = '3px solid rgb(186, 215, 57)';
        }
    });
}
replaceBlackBordersWithRed();

// Hilfsfunktionen für Namensanzeige
function appendNames(listItems) {
    listItems.forEach((li) => {
        const img = li.querySelector("img");
        const fullName = img.getAttribute("alt").trim();
        const nameParts = fullName.split(/\s+/);

        let firstNormal = null;
        let firstUpper = null;

        // Hilfsfunktion zum Ersetzen von Umlauten
        const normalizeUmlauts = (str) =>
            str.replace(/ü/g, "Ü")
               .replace(/ö/g, "Ö")
               .replace(/ä/g, "Ä");

        // Prüft, ob ein Wort (nach Umlaut-Ersetzung) komplett GROSS ist
        const isAllUpper = (str) => {
            const normalized = normalizeUmlauts(str);
            return /^[A-ZÄÖÜ\-]+$/.test(normalized);
        };

        for (const part of nameParts) {
            if (!firstNormal && !isAllUpper(part)) {
                firstNormal = part;
            }
            if (!firstUpper && isAllUpper(part)) {
                firstUpper = part;
            }
            if (firstNormal && firstUpper) break;
        }

        let initials = "";
        if (firstNormal && firstUpper) {
            const firstChar = firstNormal.charAt(0).toUpperCase();
            const upperPart = normalizeUmlauts(firstUpper);
            initials = firstChar + upperPart.substring(0, 2).toUpperCase();
        }

        const span = document.createElement("span");
        span.textContent = initials;
        span.classList.add("showName");
        li.appendChild(span);
    });
}




function sortNames(listItems) {
    const arr = Array.from(listItems);
    arr.sort((a, b) => {
        const text1 = a.querySelector("span").textContent;
        const text2 = b.querySelector("span").textContent;
        return text1.localeCompare(text2);
    });
    arr.forEach((li) => li.parentNode.appendChild(li));
}

// Zeitkonvertierungsfunktionen
function convertDecimalToTime(decimal) {
    const hours = Math.floor(decimal);
    const minutes = Math.round((decimal - hours) * 60);
    const minutesStr = minutes < 10 ? "0" + minutes : minutes;
    return hours + ":" + minutesStr;
}

function convertTimesInElement(parentElement) {
    const tds = parentElement.querySelectorAll("td");
    tds.forEach(td => {
        const regex = /(-?\d+(\.\d+)?)\s*h/; // Verbessertes Regex mit optionalem Leerzeichen
        const match = td.textContent.match(regex);
        if (match) {
            let value = parseFloat(match[1]);
            let sign = value < 0 ? "-" : "";
            const converted = convertDecimalToTime(Math.abs(value));
            td.textContent = td.textContent.replace(match[0], sign + converted);
        }
    });
}

//Klixa-Logo-Anpassung
(function() {
    const newLogoURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABiCAYAAAAV35wWAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyppVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NjcyOSwgMjAxMi8wNS8wMy0xMzo0MDowMyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIEVsZW1lbnRzIDEyLjAgV2luZG93cyIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpGQjRERUZBNTM1NTAxMUVBQjZEOUUwNkM1QTkzQjRGNCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpGQjRERUZBNjM1NTAxMUVBQjZEOUUwNkM1QTkzQjRGNCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOkZCNERFRkEzMzU1MDExRUFCNkQ5RTA2QzVBOTNCNEY0IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOkZCNERFRkE0MzU1MDExRUFCNkQ5RTA2QzVBOTNCNEY0Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+4Pb01QAAIJJJREFUeNrsXQl8VNXVPzPZF8geskAIUARRtEiRVitQtbhUq23R1qIWurjX+lU/W1vr0mpLtdYqWq17a9W6VLQLqIi7taiIiLIIaCCsWciekGSW3v97Z+Dm5S33zUwyM8kcf+cnmXfvW+695579XM/y1bM3E1GpwF6yBo/AHoG7BL4r8C6B71FiwgiBCwV+ReBnBObx99lBpsA1AmcFgz5femohHTXlr5SWMjJ0/RGB8wS2m/TNEXiOwCfjaRBWbjyPmjvWUoo3g5JgDakCC3jRqMAogZ8VuIAX2V8T7HtBEE8LnBpGXztCwvilCyy0uJ5chQkK3ggI6yaBZQn2vXeGSRyRQjC51IYXgQDKBR6bQN86U+Dc5JQnYbAIhGK0G4cLRyenOwmDTSAjE+hbK5PTnYTBJhBvAn1regyf7UkutcQEKNv7BProgJk3jX8fzgClulOgn/+GmbfdRtlG2wCZm3lzyd6EnoQ4JxDI5ik8+QHeaa8U+L1hOiaNAs8X+B9p9/fwIvdZ9LlI4OUWBIS+e5NLLXEJpMbk9/8XeOIwldvhBP27M4PpA0kCGGY6SLPAhmE6JjttlQlPCvX6W2nj9sXUse/T5AoaBhxEeZscRvqHo769veEZ2t20nMoLTxA4l/eaA11TvZlaKEpGegl5PUlH+lAkkOEKShan1JQcCgYDglCW0I6GZ/t183hTKcWTSRlpJTQia4LgPGn7CSgQ7KXczGqaUP795GgnCWQIU5LHK4gg25IR+QPd1NFdQ21dm/tc8Qf2UeGI6UkCSRLI8GZEHo9ASidvSnp/wvJmJocoSSARw48EHkJ6qL0VwEQNf8V1A2xYqCLd/O1x0FNwvZuV/fdJNxd39lf0W8jnbxeiWq7ZPaDUzBfY5vBOUHy6BP5WYJ3qhwSCPoH7QMJuxwDRyp8XeKjACtJ9ZrHQVdsZW/m7kYaxnbF7uBDINwX+QbHtYhp4q1uJwIvD6LeedL/K6/tXtdBH2ru20Ibtt9KhY39h1udDgbMEVrtYuAtVX6jX10T7euo1QnUBlwi8hschHgGbaI3AVQKfF7icHCySKhCvoSITBd6u2PYFgf8Xx4R+sMClAo/ow/a8WVTb8AzV1D1q1gcTu4DUPfBoe67qC3X3NpIv0KGJeopwH29CJXE8zpBjDxJ4lsCHBG4U+ARzvCFFINjW/kh6lqMT7OGdzR/noiLkqJ/0+1BBJJ/u/gt19ZhudK8K/J2LZywSOF6loc/fQYFALyka7G6kxIyqwJifwSIudqGxQ4VArhJ4vAu2vylBJmyOwOI+g+9JFbt5PW2re8Kqz/UC31S8P/Jz7lBa9R5l7eM0gT9LeGuJzlXe4+9JaAKZy8q2CkAEeyqBJqrUbIcHF9nV9KIgFFMVCgrnhQrKeghOEnhZlN4XBHcbDR2AnvYMj2dCEkgJ74AqmuMbAn+aoJNk2MxThcK8h+qaX7Pqs1bgz1084waBM6LwrreHK5bEOUB8PzsRCeQ2Vs6doIl3ga4EnByvucTjpfpWW0kKCvKzis/I5rG0dLQEg34n2+x5pFdpGaqA2gSHqzSMFzPvD1hOVAGIEB/G4B1rSbeWhfwgMAygygvMqxURUY0ng5rb11DnvlrKzhxj990zFJ/1BYG/JN1v0w90Bd2SRLBwbnLx+m+TXvaokW+aqigFRALZLHFgsKaQ7pfJddEfmbDwHZ2YCAQyTeAtim3vFviXGL0nHFJmfplXSLe5h69FCg7S42uhutbXqDpzvlWzGtIdp6r1tZCysIJ0n0BfDmKZ1qKZSrG75ik+40WBX40Dbg5RcD5vIqqm6BMEfoMcUhtiLWJl8aJXqcu1ympHjDHAAfhxxKYWTwrVN7/h1AxGiftc3HYxmZrLLW1YMJCoFrfYIfD7cSLqbhX4a+Z+L7rod2m86yC/EXikQrsWnoy2OCQQWJqaI1ZOvOnU2rmhX2CjBWdYq3hb6HS/V2x7kkvDxw95YcYTIOTka2zEUYGjBB4WrwTydRYZVAC2+PeHsNIo9nQv9frbqL7ldaemzTxuAcVbz2e0gyKBt5J6cQlw/SVxOpSI0YJ/rFNRBz8pHgmkitRt7A+Tbpob8oAYLZh7YWVygJdZpFCFW8neQgguM0nxXqhR/JM4H8o1bDhQgdnxSCBQBEcrtFsn8Mc0TABiVlvXJmrpUDLSwUr1quKtobhaxbadS+pxXD0st7cmwHA+rdjucDujRCwIBIr2KQrtoPzB/DuMcuM9WjJVXYuSCA1b7WUuFuuJrL/IMNmFjhJS4l9LkMFcyTqJE5TabdaDTSAI4f6VYttr6UDpnWEDXk86NbS+RYFgj0rz98ldrBQW+Oekub+N9Q8VQNT0ogQaSjiUP1HUQ8rjgUDyWbRSqXAIW//NNAzB602j9n2fUHP7B27EVTde9jt1f14QeoRqMe96VnwTrZDHJ4rt4oKDYLc6VKHdFp6MYQoezdO9u3mFm04wudYqtj3S68l4LhgMXOHi/rCabUrAwdyh2K441gSyUFERhFyN7Ls6GsYAZb2xZaVWf0sRQBzKC7545JEnjMqfXYi8EAV4UOBjCTqUqgOYG0sCQfyQaigJ8h9W0DAHmHs7e3ZQU/saN92QVHKvKpeaPPrHlJleppUgsoH1Jop9/LJeXZ9IYwSo+opSXV9QBDuZNHQ2HzLSChTutYx0z3oSMLDBINU1v0Klece46YbFDO/wIU4NszIqaFLlJfRBzTViaaWSiY8Qiws5+I2x3i94/YwjPeYKwZplrFjDAoXAw0yJMEIf4ie1rFTbdRwpgcxi3SJdelAqf8ThpObrAKAaxYUuKH7IQwrErLZ3qMfXROmpBardEJIDP8XzKnOLqpB721dRbf3TZtVVkFfycgw+fQTrqlhb00l3cCJqt5BicIxEpARyiMpu5QCwZ8LfsTVJFpK8IHb1ru5d1ND6X6ooPMlN15dIN8derdL4IMFFmtvXUvu+T+VaXa8z5x8sgIUTfhqcPDzHxcY6KOwr1gDO8VySJMyIxEt7msPaxLH7K+Wyo37w5NGXaXoPSqmS7j+4iOxrkUULUPEFYTAb2BBwdjwRR6wJpIl1lAeSpGClrKdr/hCk5LqEUC57i0rjopEzqXrUfM1qFgh0XynwQ4HkhMGgL9xPg8h0P+kxU4gGGBWvcxDLhKmHKPHOWR9kDpKi6SC7m16kiqKTyR9wk3oRXCvEtKsz00oXq4ju48u+Q53dtU92dNfe5/WkKXG3nt5mjXhd1NcC/JDFtxGJMAexJBCkr2ZQeNUKh5Gynkmbd99Ln+x5mNw5soMQmaqnjv0FlebPVnhOFh0+7sYq0QvWR0cHCQoHbdl1P23aeZdV+VQj5DHX+EYijX+sU24h68KClTTv2ixFsdIF9+hw2/G0QLDn8g07/kB5OYdQRlqxSp+ZYuEjSvhylcZ6wTsl7oGHI7r2mCgMCMy3yPVAXgxO9mrjv3v5WihXAPIfyixNT2QCAaDeK8yS7yWJwWa/dldHFzL+4hRPllYIYuOO2+mw6l+q9kV6ASwD/3Jq2NO7V6tg7wDprICHQxxgmbBuojDEatKDM7GhwjcDLzlkTjvXAJT+h2NJIDAp4ky/LOk38FukMZ6iaJGAbfE60pP/kxAd+D0TiXbQz87G56gwdxqNLv6aan/kjrxDemlX29WrAIjePt7l+4MIUJzjHwI/oPDz3iM2QkVKICgQbFXdEPnNyAT8tsJ9TiW9ysTzybUdMUCnmydzH0QIb9r5JyoQRJKTWa1yD3itURf4HNvV56zMzyR3CW8QmeDDuZuiU38gK9IbREphdvwVJkY4AFULDEDUSkmu74hgKuk+kH4LuVuIQ+trb1FJ55XFk+/YNUhLHaGFxNjA5S42YYjYqMR+M0WvOEdJrAnECTpJPUEKMURnJdd42JDJO2++qaiQkq0lYtXUPeLmnuAiB1luz+kVdirAZJYMVGA1SxDRDqmfEu8EAkDyk2qtop+Ruwp5STgA1/ImYwkw5cI06yJKuJjFZNN1kpNZZecDOZFsyp9KAOvTBRT91OoU5qhxTyAA1QocCD24JLnWXQMWo2NRPf3ot/aenXuX4lirXYr3Po4sQt5HZk8WnGlkKETFCHMU748w/bcHYEymMBdLCAJ5mdSPKkDoQUVyzSsDQr/vVJ1LobLf5SHPDS5EX8B1ZFJxMTtjjHactUlOCfSOzyje++kBGpcTKApujMGMxcKkqJjrRtEwKvUTBUCh6fGKbSHrX83TfpeLTQuiEsqY5hgvFI2YIThIPwJB7rtKjD46bhiAMcEHnhGtGw0WQPBVDUy8MBry4zCA75KDKVaCLh7XdsnpCCuTat72NDNRuSR/luZrCfb1iqQq6h+IGG4fgHGBceDIRCMQAEKbmxTaYQe6Krn+bQGVEN2U4QEHX6lNund/YZltpF7+FYBkrD4O3bzsg2lE1kQtulcCUItK8hscKVlRHhfcM2qVHwebQLYwq1YBHAN9TJIOLBcBrEuqdv7nDhBT0Hg+Osr//8nlJlcm/4BgSEPoe7ciZ0h3oauoAop+fCFRCQSAFN0axXe7JkkLpgCL1bGKbVHT6mKHHR07ruqhRNB3+lRjLC84gTLSS2Uigf9LtTLNaVEcl8+Ru5rFcUkge3kXUoHjmZNEA4JDhDjmkO7zUAWkFTgVUAvlsqtmQMGhu3C/Bi+Iozz/eK1sqsEgoALfIvXC2XaAuD8c9xxOnklKPBEIAOVpVI8zuFJR4XOCjDhY3AUR9kdOxR10oKyNE0B0UnWdv0wmYSo2AC/7fk/1mJJ5lJaaL4eyqOYKY0HfQpGZZCcI/DepnXFpBmPjjUC6eIBV4AiyMDG6AHiEZ8cBgZzrYnEbIZX1DtUiGahp5faMc2T6qVaMR5WRP4R2X3jVK/tmPSJ6QtVChmINfw1zjlHR4hUyPwhnB4+DE8DRerjVoMcKwA5xmuoshbY4XepklpMbDOKSnCRjBB8rgnjGuDggENTCxVFyK6X3Dh0IGpC+J2Bg/x5WPD+v+ByYTy9kcdYN+FjUApHkK7T/MulR21oFlHGjzqE9Ta9Qt68RAZLI2XiY1E+tgiiNSIqfs1HBSdxDaaAreNOxCprF8z/L93UidhQs/C8bGDy8bjbGkkCwMODNVT0As4KGhod9Kg28j+cGF5zACB+w0q5q2bqWd/A3M9JKaFzZubRu2yLypmiMEhwPvhrVAm7gAv/kjXCpwLdIL6vaxZs5KtGjUie85Mc4cOP1bExYpvjsIuZkffSaWGcUgg0/I/D0OFrA/jD67Iuj98dOGGkK8z3M7VTyx9NYLwKXbqsSukhj29uCk7yEXHUsbviz7nf5/EOpb6FzP+/qXhdziOIQ9RHqr8F4qIuFyeyNowXWEkafeCm2HTq/0BeFe8H6tV2xLcSY/ebVg0f/WIvT8uvOwwdIuWawrZXJ6/LdV0QwnzFX0mVAJOfdcbLAIPtvDKNfvBwwiqjbj+ybKFfvdFUxnvQobC3/A0Wxp1Zfq+WgsG/kQhq8Ek8/o77O6I8SnUBCcuyGOCHWcBY7gv46Yvzu2GQUzlAPuikA8TjpQY2qcEdITyzI/SwdUnUVBQSBBCkAkQfZiTcN4PdDzF1oIl4+lhAEgpwBi7wBAOKzkLu+O4YLDIqgZT1bhHTbpKuC6/wyhu9+D8vcCuChzLRSN/e+ysUujNOL95vvywqOp4MqLya/H0OrTf5PWBGOduYgNrYvkl6M0Ajwx9wS1wSC8/a83lSteAC8rf6+gW0hWM2K3iORyo0uASZRVGc5jkzOJsG7+/ztlJ1eSWmpedq/LQgFu+M5bIEZDK899LZ3+Znnq+odyADMyRzrVie7mNRr9Z7FOoAGMP1WlZ4hzzmsU/BtIaVhc4RjAEK7gNfNKgfRE/UR1rmdG8/y1Zb+M8TIlNhYdWAnhknwLbsHYEGVFc6lgyou1ILkmjrW0ta6x6m1c70gmAwk8Jh1Q04IvKPY6nIpfOeaHXSzlQMBlJ8aBw4cAxGquZnjaHTJ12hM8enU62ujmrpHadfe56i7t1FLYTURVzAuyOOuJt1znuqwyIPmHBeLuZ/ykMZ98N6f8HsrK+SYC+SRz5x0j6YnuARYtcYqPC+NJYKnQt/W62umtzYsFGNWr1WtlyCbNybkbsB8O57sz7D0s270Not/y8hdSaAMnpsx5JzajYlttCOQiCFEHIdVX6cVYj4w+X6qbVhCG7ffxjJxPNSvOyCjwxsMK0xVyZlUWXwKpXr7Oni7enbTNkHkO/b+WyueZkEokb2FEEg8XvfvbiXeBoLdNCr/SzRp9GWCSMoHdUQxnm+s+ybt66mTj1gwIyxsKkiTrSTdUZnBBIkicUgR/phx0MzqnmXvTu/HglM8ma5mB5YKo4yOvyuLvkJTq6+3rJ+0u2k5ra25np8bW59l6N0hAo4t/ZaQnS8Sk5ltrxX27hGE8iRtb/yHRijgiCqFn6NHIEFdCQ70iLbpFkSqE83E8vOpetTZMRvfjdtv18ap19cS1XEacALZsutBiThSqL1rC+1pflUrhe+xNQl69hMU2HZu1gSx647W5HRAqthVK4tOcSxsvHPvMvpo668HnJNAlwgEevp9A0pnggPgPX2BThpTdLrYZX/k6t5dPbs0sRFHpu3rrdNztIO4b4YtZ8H79D0P3aPtsOjjRCAgZMwPRCUcX1BReIIY82yQTL/F6fVkiPkZTzE4oKnfOGFTrK1fQp3dOzQz8IDMNTYMMXjRWE8es8Jf0A8aWlfy7uMxJQ6fv01gp5icGVQ04nPiY8OvZo/y/mtrrhsQTqKfY+HXCjiX5B3DCzYg/p+mEQaKn+VkVGkh21AkYeEJV1zqFWPS1rVJEyVaOj6iXU0vCM7SqHEiuTyOrrD6KT/nMCrOO1rTw3C9u6de9Fmuy+qUSSkpqRZE1auN+/iyheK7pvQTAeMd8H0fik2xvuU1HpvoiKd6uH2QRmZPoh5fK3V174yYCD0OlfEGDUJEgh1Q1lfCHyz9gBcsIBwOA/l7sNm6zln+Rjsbl4oJa9YXgmANINbqsrNpVN7sfhsCFs+2+ieF6CbEEX8Dc5Q0TYcAcYBTjy9bQOUFc6Ou9wyq0CU2rZo9j9Dm3fdpmxg2q0gJAxvO2NIzqKzgy2IcG2h97e81jmXcoBKSQAD1LW/SR9tuFDuwbu3Qq2V4+OM8+wc2JI5BhDFyuBBh5OdOperSs6g0b5Ym88ZWtNhJW/f8jVo6N4gJPJNK82c5bgIQ1WDI2N7wrBiP3TQyaxJVib4gDBRJGCrQ0rmONtTeSnvb39vPSTG3XvOTd/tx06DQ4QtHzBCb4LepeMRMw4YTpC27HqDNu+7Vxhv31q2TPf3FUE0vSt2/fkIEFVcEAujsrtWsW72CReblHir0mzLtlFev2GHAXXxCyQPrRHXA5o412gdj9wHh4MNBGFVCyR6VPyfOFMGg9p/HpeupSzsvfa0g9KMjEmPjGcABtjc+S60d67R57xScF5sKHIwhncw4lrCQoljEhIrztLm2G1eY5kGE6Ifi3aPyj6WsjHJtzUCP6/G3aMGVHftqqDB3OhWMmKalEGsEayAQbGvwdGaTfQ4zSBB5GTi7YRupH9+cyffHTKOo9Sor9nuAc1hDU/tqwaYfpbqW1ykjrYgmVV4q2OtxdnoMHEpmtnw86AXS/QsA+GBm8O9udxAPjweceCqOMKQVl3M/HDmw3sWzEPI9jvtiLD+Mw/WP1Y1cnjweSxRzeI1sqttA5MKpuzv3LqVde59nnxOLmpzWO7r4dJpYeRGlKW4auA+4TakQa80MR9CpIRLnZn6m77oDgUiYL7AuqA5dAlcK/KHAPMO9zLBUYBP3XazQXgkbWt8RSvF6lbb/sPmWL3KbLIHrgpHDxwJzFd7pXanPP118d7HA7VLfm6M1nlHGTIGbDGPzpGr/TiEtbNy+mF754FRa+u4R9PpHZ4oN8c1Be/9US8O5Okc4khFxNojofGawtyhY0aIIiB6oisJ9KvleduVvoByNlP5GIhDCMFRO2zqbnxGCwjiWoowSxjReO44OPzg1cZY7DC2QGHDGCUTuwQKjDNPO7BCnQ7WGrL4sFn2BWTrwRCYGxNV0SwtiCdmfb9fNBLSMYnPkGtI/caiLXFDgPP7tA5P2r/G1L/J3Y2LliNk/82/HcBukxL7hcoORCQRK0/kK/bL5vSkBCKSbCf+r0lrxkEunDIgCusNgEoeZiBXCQoGNzA4b+W+rtkewmCXDaXHK7kP4hPSuRxquVQls52t/Mul7tdT3VybXH+BrHQLHObzHGIFthrFrUug3z0SkezXOx7xMYDO/6xYWZSneMRrRvOAEKGIm55Yj5LmAEhP28PdAof9tGP1/zX1xj50ObbHr50jcG6IIYpDOdeh3QcgaLO3KhZQ8oSvqEC23NZKFEE4M9zsicVFOEmHYt0uixHwWDYitRahj5HTUFuIj5rGOU8jWM1iGcCjPqwM0JlhwkZxXsZnUw7iLJFHjTR63CUwgKKljFvY/h/QIWGJxDla5iRKxtdpYk2ax+DyBRTsfbwi4z99J/RCbYr7PbBattchXtqThOAM3+R6VvDaOYksX1hJSH5Cq+6niPbA+vk56SaRc3mxQLP0RC6tgNenR6n5pk/+PpHZ8ifTsyPZoiFgy3iSx/Jcs7heC2x0sH79hK5kVPMFWt2iLWE7oJGK5QVlUulPgHdLf51n0eVxqA+vhWv53i8AKiz6wpj3tYHXbIfBEh/eFW+BSgXts7tPNc+exEbE2C0wTuECyahoBbU9xeJ9KgU85vMs1Ju/yVUO7gMCjBXoFPib9vjXaCVPyYSiHSIpjkHcG2UJ2mI1l50lWqDN5R8SZ3YiNR15zKOsQOQSP0cDkigwWyIo16tnKZ3qfb/Jt8rl/23i8vRYKv9HiFToDuoWNKRjPeyXjRAWP52QbDvQA9yuVxNFXWbzeLPnSMHffs/MHk54B+SCLlPu4f420q4Ob3Mncykq6QIJbqPLKDn5/cN5neb3hXRAubjwsyEd9K9CDix/Mz/tWtJV0o22+QaLAafy7l69hR/A7KJWLpP5vCzzIcL1c4DtSmwsSmIP8VLrXDfzb69Jvxh30Funa9fzbKoVvuU5qM8/k+qMK/pRrDf6vnxp8X5jjK6Q2D9lwkL3Sv+/kOQZHSRV4qoGrLLDgZC9Jbf4scKShDThCPV/vFThDugYDQZHA30n3+LvATm57v8CvCzw22gSSLnCD9NDjDNfH80tYEcgktv6EWP5oi+dgIfi43bsmLDRRCESeoCv5tzOl3/5l2Bj2SHMyhn9/WWo/1+I5J/OkYzFWW1giA3yPlSbXp0jzAviGxXMg8tZymwdtCCQE37O4z/VSmztMrstjtEJgisV9LpDa3WNy/WLpei+vzZOdHIWRBRz1dQq5FeHOkBR5+Bis6jK9zaEc8FEcykrqxwkoYsl5r6HQiyWsNMJheBL7VlAS8zuSaIODL2slg0cIRlk8ZymjFWzl5xeySIPQWjmVVTawPMQKvRm0shEhg5wPSsL8WhWUkw0wFRYiYwh+S9Zp4S/wd2SxnyqUsmxlsLrCOE7RJpBs6lvTtdVlf/nYLCz+eyx0DHxkuaSzVCcogcgLuln6NugGd/EG810mkPmSle2PBrO0E4HIesQRPM6hnP8c1l9ypDXhNbGcheApB4/5FsVvf9DmWqvBeSpDjqS/+nh8zjQxcQf4u7yStQzEb3W67w6DDjggBIIzGkqkj9wewYI5ltQPiUlURT3PhIMQK5s49gGBiAhmXEgHSnFi914rta0zmF/tuPPPeXG58WJnSZyui9wFU1oBimqvc5BErKCAzeOh9at6fozXYb2vIpNi39EmkOOke24m9fL3ZiLZYmb9Tos/1bBgEgXSDVYnmUBamHuiCBoqcNwoLRzjEXZNFlYxGWDZ+ZG0665mu/9W9hmErD1FFnOSIu3K0Shr2krhF9pLkQgc97mFrWBeh3XVyb4aK9gwkI7CkKizQPr7xTDuIX/ACjbXDVWQzbJdJrsXRJBLWZQsl2Tq/5rsxnYEcqpEHLXshHzFxNx8jY1JtokdkjlsXt0W4bcHKPzaYU28geTwwn9Q0scigTanHTtSwABPkx72QBj3eM8gEgxlyJbk/g7q7zXfQ/3LZpodgNrsQCByhfZfmBAHsQ+g1EbceUf6+5QYj1urJJ7lsiFjwCAaBAIuhPgj+TSjmym8ItBPSFaGMxV0kOIE1j9G0oFj4drIPPQb9XY/5B0S1i2zsy5kwioymVNZL7HSCZ0iiB+X/o1C1Ec5tD+KrB3B0YBHpX9fRX3D/o3gsRAdo0YgaaxMelksyGTKhcf1YpZnrzJYOW5UFMmMgMLR90nPhUd9nsU7QZxDzdi5Lr43TZJjZV0g2txUBaoUCGQTW50m8oYRsNhR/ZKRo9zEOmPGTUKAsPlzDGNkTJhfwXMR4nzP8PsYlX2sC+QFIbbrNopO8KTZOkGMVSherpr0SItpFgr9IuaAVS7WCEzqKJ/6fRVHYZAz1zZyZtgm/rvHJPYF8VUZNo4x2VHYw/dcZGgzwuBNDrBHHRmIN7IDaqN0/Q0Xjrm7+d3bDN/2qcDpg+Qo9HJmY1uY32DEaoMTr1lyOgKPNcwRPMZnC5wvxTFtlGK6AhwrZeYJX2O411put5jvJWc4tgqcGGa4+3SD13694ZuAU9mZLLd7gaMNFrEzeJd0/TYHR+HV/FsOYrBCDlk3aZJ2AWHLTLzmZlggcKeh/9MWHtmHFJ4Nr/1XXCwmlZRbNwRyQxgLOkVajCG4LwICyTJsGEH20Ft5poMm+SczOVxDhlUmzxqlEPQIeF/g500IrEWRQMYbiB5wl0m7yQLfVHif5UxQrgnEyooFdn8JizGpBosD/g1nFUKj1zA7VXUONbG8O5/ZbyYdCDM2Kp4LWNyCI2g6K5EpLHN/zKLcEy7NhW9I3yfLqCmkHuoNP0DI2xpOkQSM3/M8Zj72YyyKQASBBQz5IT9g8SCL50UGnL/yFluzprCY1MLj8RvWF/F3Dx0ouG2mQ8JwgLDyL/P8HMY6jpf7o8/f2Fezz2RNLWFDwlayP+ruE9Z1TpV8MassTLNzSA/EPIuNDQU8xqH1+RfSgynNxNPNLJ55Jf8O3gupGPDpNfxPgAEALDRr0wZoDioAAAAASUVORK5CYII='; // your base64 image here

    function replaceLogo() {
        const logo = document.querySelector('img.kx_logo');
        if (logo && logo.src !== newLogoURL) {
            logo.src = newLogoURL;
        }
    }

    replaceLogo();

    // Bei frühem App-Start kann das Logo noch fehlen -> nachziehen, wenn es später im DOM auftaucht.
    try {
        const observeTarget = document.body || document.documentElement;
        if (observeTarget && typeof MutationObserver === "function") {
            const obs = new MutationObserver(function () {
                replaceLogo();
            });
            obs.observe(observeTarget, { childList: true, subtree: true });
        }
    } catch (e) {}
})();

// CSS-Anpassungen
addGlobalStyle(/*css*/ `
/* Dark Mode*/
td #rm_bg,
td#rt,
td#mt,
td#lt,
td #lm_bg,
td#lb,
td#mb,
td#rb,
td#rm,
td#lm,
body,
.corners_wrapper,
#centermid,
#stempeluhr_div_active,
#stempeluhr_div,
.menubot_in,
.menutop_in,
.menue_kat,
a,
p,
span.right-delim,
span.left-delim,
.quicklinks,
.footer_bar > div > div > .center,
.footer_icons > div > div > .icon_bar,
.footer_icons > div > div,
.footer_icons > div,
.footer_bar > div > div,
.footer_bar > div,
.menubot_ac,
.menutop_ac,
.menu ul,
input,
select,
textarea,
form,
.menue_kat_sel,
.ui-widget-content,
.ui-widget-header,
input[type=submit], input[type=reset],
.cluetip-jtip h3#cluetip-title,
.ui-state-default, .ui-widget-content .ui-state-default, .ui-widget-header .ui-state-default{
    background: none;
    background-color: rgb(52, 58, 64);
    color: rgb(222, 226, 230) !important;
}

td#tpl {
    background: none !important;
}

#tab li span,
#tab li a,
#tab .selected span,
#tab li span.last_tab,
p[id="text"] {
    background: none !important;
    color: rgb(222, 226, 230) !important;
}

#tab li a,
p[id="block"],
.dropzone,
input[type=password] {
    background-color: rgb(33, 37, 41) !important;
    border-radius: 2px;
    border: rgb(222, 226, 230) thin solid !important;
}

span[style="background-color:yellow;"],
td[bgcolor="#00FF00"],
fieldset[style="margin:30px 0; background-color:yellow"] {
    color: black;
}

#logo_frame {
    background-color: rgb(33, 37, 41);
    border-radius: 2px;
    border: rgb(222, 226, 230) thin solid;
}

a[title="home"] {
    background-color: rgb(33, 37, 41);
}

a[title="home"]:hover,
img:hover {
    background-color: transparent !important;
}

.gadget_title {
    background-color: rgb(52, 58, 64);
}

.gadget {
    border: rgb(222, 226, 230) thin solid;
    background: rgb(33, 37, 41);
}

#stempeluhr_div_active div {
    display: none;
}

#stempeluhr_div div {
    display: none;
}

#stempeluhr_div_active a {
    background-color: rgb(33, 37, 41);
    color: rgb(186, 215, 57) !important;
    border-radius: 2px;
    border: rgb(186, 215, 57) thin solid;
    padding: 4px 0;
}

#stempeluhr_div a {
    background-color: rgb(33, 37, 41);
    color: rgb(221, 54, 25) !important;
    border-radius: 2px;
    border: rgb(221, 54, 25) thin solid;
    padding: 4px 0;
}

.day_termin {
    background-color: rgb(186, 215, 57) !important;
    color: black !important;
}

tr.even,
.week_content_gray {
    background-color: rgb(43, 48, 53);
}

tr.odd,
.week_content {
    background-color: rgb(73, 80, 87);
}

td[style="color:green"],
span[style="color: #33ff00;"] {
    color: rgb(186, 215, 57) !important;
}

tr.even:hover,
tr.odd:hover,
a:hover {
    background-color: rgb(102, 106, 111) !important;
}

a {
    background-color: transparent;
}

.center,
.footer_icons > div > div,
.footer_icons > div,
.footer_icons > div > div > .icon_bar,
.icon_bar a,
.footer_bar > div > div,
.footer_bar > div {
    background-color: rgb(33, 37, 41) !important;
    color: black !important;
    border-radius: 2px;
}

.footer_bar {
    border-top: 1px solid rgb(222, 226, 230) !important;
    border-radius: 2px;
    background-color: rgb(33, 37, 41) !important;
}

.footer_icons > div {
    border: 1px solid rgb(222, 226, 230);
    border-bottom: none;
}

.highcharts-background {
    fill: rgb(52, 58, 64) !important;
}

circle {
    fill: rgb(52, 58, 64) !important;
}

text {
    fill: rgb(222, 226, 230) !important;
}

.cluetip-jtip #cluetip-outer {
    border: 2px solid rgb(222, 226, 230);
    background-color: rgb(33, 37, 41);
}

.chosen-drop,
.chosen-single,
input[type="button"] {
  background: rgb(52, 58, 64) !important;
}

#online {
    width: max-content;
    background-color: rgb(33, 37, 41);
    border-radius: 2px;
    border: rgb(222, 226, 230) thin solid;
    padding-bottom: 0px;
}
`);

function addGlobalStyle(css) {
    const head = document.getElementsByTagName("head")[0];
    if (!head) return;
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = css;
    head.appendChild(style);
}

// Nachziehen für DOM-abhängige UI-Änderungen (z.B. bei schnellem Cache-Start)
function tmStoreApplyKlixaDom(reason) {
    try {
        // 1. Online-Benutzerliste anpassen (idempotent)
        const list = document.querySelector(".simply-scroll-list");
        if (list) {
            const listItems = list.querySelectorAll("li");
            if (listItems && listItems.length) {
                // Alte Initials entfernen, damit es nicht doppelt angezeigt wird.
                listItems.forEach((li) => {
                    const old = li.querySelector("span.showName");
                    if (old) old.remove();
                });
                appendNames(listItems);
                sortNames(listItems);
            }
        }

        // 2. Gleitzeit-Gadget anpassen
        document.querySelectorAll(".gadget").forEach((gadget) => {
            const title = gadget.querySelector(".gadget_title");
            if (title && title.textContent.includes("Tagesarbeitszeit / Gleitzeit-Saldo")) {
                gadget.style.height = "auto";
                gadget.style.overflow = "visible";
                convertTimesInElement(gadget);
            }
        });

        // 3. Schwarze Balken ersetzen
        replaceBlackBordersWithRed();
    } catch (e) {}
}

// Früh nachträglich anwenden
tmStoreApplyKlixaDom("init");
window.addEventListener("tm-store-window-load", function () {
    tmStoreApplyKlixaDom("tm-store-window-load");
    tmStoreEnsureProfileButton();
});
setTimeout(function () {
    tmStoreApplyKlixaDom("retry-200ms");
    tmStoreEnsureProfileButton();
}, 200);
setTimeout(function () {
    tmStoreApplyKlixaDom("retry-800ms");
    tmStoreEnsureProfileButton();
}, 800);
setTimeout(function () {
    tmStoreApplyKlixaDom("retry-2000ms");
    tmStoreEnsureProfileButton();
}, 2000);

// Sofort versuchen (Cache-Start kann sehr früh sein)
tmStoreEnsureProfileButton();

// CSS-Anpassungen
addGlobalStyle(/*css*/ `
#online {
    width: max-content;
}

.gadget .gadget_title:contains('Tagesarbeitszeit / Gleitzeit-Saldo') {
    height: auto !important;
    overflow: visible !important;
}

.quicklinks {
    max-width: unset !important;
    background-repeat: repeat-x !important;
    min-width: 1px !important;
    height: auto;
}

.simply-scroll-clip,
.simply-scroll-list,
.quicklinks {
    overflow: visible !important;
}

.simply-scroll-list li,
.header_wrap {
    height: auto !important;
}

.simply-scroll-list li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
    padding-bottom: 1em;
}

.showName {
    writing-mode: horizontal-tb;
    rotate: 0;
    transform-origin: top left;
    font-size: 65%;
    overflow: visible;
    text-align: center;
    display: block;
}

.simply-scroll-list {
    width: max-content !important;
}

#fast_cmd_div {
    position: absolute;
    top: 5px;
    left: calc(100vw - 20px);
    transform: translateX(-100%);
}

#fast_cmd_div > form {
    display: flex;
    justify-content: center;
    align-items: center;
}
`);

function addGlobalStyle(css) {
    const head = document.getElementsByTagName("head")[0];
    if (!head) return;
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = css;
    head.appendChild(style);
}
