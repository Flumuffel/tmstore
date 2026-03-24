# Tampermonkey Store - GitHub Security, QA und Rollout

## Sicherheitsleitplanken

- Loader akzeptiert nur Apps mit `status=published` und `approved=true`.
- Loader laedt Manifest und Bundles nur von `raw.githubusercontent.com`.
- Fallback auf lokalen Registry-Cache bei Manifest-Ausfall.
- Optionaler Hash-Check (`sha256`) pro App vor Ausfuehrung.
- Store-Governance erfolgt ueber GitHub Branch Protection + Required Reviews.

## Testszenarien (MVP)

1. **Loader-Boot**
   - Loader installieren.
   - Seite `https://intranet.klixa.ch/` laden.
   - Erwartet: Darkmode-App wird geladen, keine JS-Fehler.

2. **Cache-Fallback**
   - GitHub-Raw Manifest temporaer nicht erreichbar machen.
   - Seite neu laden.
   - Erwartet: letzte funktionierende App-Liste aus Cache wird genutzt.

3. **MA-Store-UI**
   - Intranet laden und `TM Store` Overlay oeffnen.
   - App ein/aus toggeln.
   - Erwartet: Status in Tampermonkey-Storage bleibt erhalten.

4. **Repo-Governance**
   - App-Manifest/App-Code in Feature-Branch anpassen.
   - PR eroefnen, Review abschliessen, in `main` mergen.
   - Erwartet: Loader uebernimmt neue Version nach naechstem Poll/Reload.

5. **Darkmode-Regression**
   - Kernbereiche pruefen: Menu, Gadgets, Tabellen, Formulare.
   - Erwartet: Lesbarkeit und Klickbarkeit bleiben erhalten.

## Gestufter Rollout

1. **Pilotgruppe** (IT/Power-User): Loader + Darkmode fuer wenige Benutzer.
2. **Abteilungsweise Freigabe**: schrittweise Aktivierung nach stabiler Pilotphase.
3. **Globaler Rollout**: Loader als Standard, Releases nur via GitHub PR-Review.
4. **Betrieb**: monatliche Review der Manifest-Aenderungen und Release-Tags.

## Empfohlene GitHub-Regeln

1. Branch Protection auf `main` aktivieren.
2. Mindestens 1-2 Required Reviews fuer Manifest/App-Aenderungen.
3. Optional: nur signierte Commits erlauben.
4. Optional: Releases ueber Tags pinnen und Loader auf Tag-Ref ausrichten.

## Go-Live Checkliste (konkret)

1. In `tools/tampermonkey/loader.user.js` setzen:
   - `GITHUB_OWNER` auf deinen GitHub Owner
   - `GITHUB_REPO` auf deinen Repo-Namen
   - optional `GITHUB_REF` auf Tag statt `main`
2. In `api/tm-store/apps.json` setzen:
   - `source.repository` auf dein Repo
   - `source.ref` passend zu `GITHUB_REF`
   - `bundleUrl` und `cssUrl` auf deine echten Raw-URLs
3. Im Repo sicherstellen:
   - `api/tm-store/apps.json` existiert und ist gueltiges JSON
   - `tools/tampermonkey/apps/darkmode.app.js` und `darkmode.css` sind committed
4. In Tampermonkey:
   - Loader-Script neu installieren/aktualisieren
   - Seite `https://intranet.klixa.ch/` neu laden
   - unten rechts `TM Store` oeffnen und Darkmode aktivieren
5. Optional vor produktiv:
   - `sha256` je App in `apps.json` fuellen, damit Integritaetscheck aktiv ist
