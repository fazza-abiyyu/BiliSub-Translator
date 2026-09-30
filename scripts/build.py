#!/usr/bin/env python3
"""
Build BiliSub extension packages per browser target.

Source of truth: ../manifest.json (chromium-style, service_worker only).
This script generates:
  - Out/<name>-firefox-<version>.xpi   — with scripts fallback + browser_specific_settings
  - Out/<name>-edge-<version>.zip      — chromium-style, clean
  - Out/<name>-chrome-<version>.zip     — same as edge

Usage: python3 scripts/build.py          # build all
       python3 scripts/build.py firefox
       python3 scripts/build.py edge
       python3 scripts/build.py chrome
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "Out"

FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "interceptor.js",
    "interceptor-injector.js",
    "popup.html",
    "popup.js",
    "styles.css",
    "images",
]

FIREFOX_GECKO = {
    "id": "bilisub@translations",
    "strict_min_version": "142.0",
    "data_collection_permissions": {
        "required": ["websiteContent"],
        "optional": []
    }
}


def load_manifest():
    with open(ROOT / "manifest.json") as f:
        return json.load(f)


def patch_firefox(m):
    m["background"] = {
        "service_worker": "background.js",
        "scripts": ["background.js"],
    }
    m["browser_specific_settings"] = {"gecko": FIREFOX_GECKO}
    return m


def patch_chromium(m):
    # Base manifest is already chromium-compatible; nothing to do.
    # Keep function explicit so future patches stay here.
    return m


def pack(target: str, manifest_patch_fn, ext: str, label: str):
    m = load_manifest()
    version = m["version"]
    name = m["name"].lower()
    out_file = OUT / f"{name}-{target}-{version}.{ext}"

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for f in FILES:
            src = ROOT / f
            dst = tmp / f
            if src.is_dir():
                shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".DS_Store"))
            else:
                shutil.copy2(src, dst)

        patched = manifest_patch_fn(json.loads(json.dumps(m)))
        with open(tmp / "manifest.json", "w") as f:
            json.dump(patched, f, indent=2)
            f.write("\n")

        OUT.mkdir(exist_ok=True)
        if out_file.exists():
            out_file.unlink()

        subprocess.run(
            ["zip", "-r", str(out_file), "."],
            cwd=tmp, check=True, capture_output=True,
        )

    size_kb = out_file.stat().st_size // 1024
    print(f"  ✅ {label:8s} → {out_file.name}  ({size_kb} KB)")
    return out_file


def main():
    targets = sys.argv[1:] or ["firefox", "edge", "chrome"]

    print(f"🔨 Building BiliSub v{load_manifest()['version']}")
    print(f"📦 Output: {OUT}/\n")

    ok = True
    for t in targets:
        try:
            if t == "firefox":
                pack("firefox", patch_firefox, "xpi", "Firefox")
            elif t == "edge":
                pack("edge", patch_chromium, "zip", "Edge")
            elif t == "chrome":
                pack("chrome", patch_chromium, "zip", "Chrome")
            else:
                print(f"  ⚠️  unknown target: {t}")
                ok = False
        except Exception as e:
            print(f"  ❌ {t}: {e}")
            ok = False

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
