#!/usr/bin/env python3
import argparse
import datetime
import json
import re
from pathlib import Path


HEADER_PATTERN = re.compile(
    r"/\*\s*==TMStoreApp==(?P<body>.*?)==/TMStoreApp==\s*\*/",
    re.DOTALL,
)


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "ja"}


def parse_header(content: str) -> dict:
    m = HEADER_PATTERN.search(content)
    if not m:
        raise ValueError("TMStoreApp-Header nicht gefunden")

    data = {}
    changelog = []

    for raw_line in m.group("body").splitlines():
        line = raw_line.strip()
        if not line.startswith("@"):
            continue
        if " " not in line:
            continue
        key, value = line[1:].split(" ", 1)
        key = key.strip()
        value = value.strip()
        if key == "changelog":
            changelog.append(value)
        else:
            data[key] = value

    data["changelog"] = changelog
    return data


def build_app_entry(meta: dict, rel_js_path: str, raw_base: str) -> dict:
    app_id = meta["id"]
    css_value = meta.get("css", "").strip()
    css_url = ""
    if css_value:
        js_path = Path(rel_js_path)
        css_rel = str((js_path.parent / css_value).as_posix())
        css_url = f"{raw_base}/{css_rel}"

    return {
        "id": app_id,
        "name": meta.get("name", app_id),
        "description": meta.get("description", ""),
        "version": meta.get("version", "0.0.0"),
        "status": meta.get("status", "pending"),
        "approved": parse_bool(meta.get("approved", "false")),
        "bundleUrl": f"{raw_base}/{rel_js_path}",
        "cssUrl": css_url,
        "match": meta.get("match", r"^https:\/\/intranet\.klixa\.ch\/.*$"),
        "sha256": meta.get("sha256", ""),
        "changelog": meta.get("changelog", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate tm-store apps.json from app headers")
    parser.add_argument("--repo-owner", required=True)
    parser.add_argument("--repo-name", required=True)
    parser.add_argument("--ref", default="main")
    parser.add_argument("--apps-dir", default="tools/tampermonkey/apps")
    parser.add_argument("--output", default="api/tm-store/apps.json")
    args = parser.parse_args()

    apps_dir = Path(args.apps_dir)
    output = Path(args.output)
    raw_base = f"https://raw.githubusercontent.com/{args.repo_owner}/{args.repo_name}/refs/heads/{args.ref}"

    apps = []
    for js_file in sorted(apps_dir.rglob("*.app.js")):
        content = js_file.read_text(encoding="utf-8")
        meta = parse_header(content)
        required = ["id", "version", "match"]
        missing = [k for k in required if not meta.get(k)]
        if missing:
            raise ValueError(f"{js_file}: fehlende Felder: {', '.join(missing)}")

        rel_js_path = str(js_file.as_posix())
        apps.append(build_app_entry(meta, rel_js_path, raw_base))

    payload = {
        "updatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {
            "type": "github",
            "repository": f"https://github.com/{args.repo_owner}/{args.repo_name}",
            "ref": args.ref,
            "generatedBy": "tools/tampermonkey/build_registry.py",
        },
        "apps": apps,
        "submissionQueue": [],
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
