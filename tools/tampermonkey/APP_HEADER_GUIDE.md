# TM Store App Header Guide

Jede App in `tools/tampermonkey/apps/**/*.app.js` braucht einen Header.

Beispiele:

- `tools/tampermonkey/apps/darkmode.app.js`
- `tools/tampermonkey/apps/darkmode/darkmode.app.js`
- `tools/tampermonkey/apps/darky/darky.app.js`

```text
/* ==TMStoreApp==
@id darkmode
@name Darkmode
@version 0.2.5
@description Dunkles Theme für das Intranet
@status published
@approved true
@match ^https:\/\/intranet\.klixa\.ch\/.*$
@css darkmode.css
@changelog Erste produktive Version
==/TMStoreApp== */
```

## Pflichtfelder

- `@id` eindeutige App-ID
- `@version` semantische Version
- `@match` Regex für Ziel-URLs

## Optionale Felder

- `@name`
- `@description`
- `@status` (z. B. `published`)
- `@approved` (`true`/`false`)
- `@css` (Dateiname relativ zur App-Datei)
- `@sha256`
- `@changelog` (mehrfach verwendbar)

## Build lokal

```bash
python tools/tampermonkey/build_registry.py --repo-owner Flumuffel --repo-name tmstore --ref main --apps-dir tools/tampermonkey/apps --output api/tm-store/apps.json
```
