#!/usr/bin/env python3
"""Fail deploy if SPA entry/lazy chunks are missing or point at a dead entry.

Supports Vite hashed entries (`assets/index-<hash>.js`) and, while
SPA_COMPAT_KEEP is set, optional legacy `index-inv2plusN.js` files that must
exist on disk but are not required to be the live HTML entry.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root (…/current), not storage/
DIST = ROOT / "client" / "dist"
ASSETS = DIST / "assets"
HTML = DIST / "index.html"

# Vite default: assets/index-<hash>.js (hash may include letters, digits, _ -)
VITE_ENTRY_RE = re.compile(r"^index-[A-Za-z0-9_-]+\.js$")
INV2PLUS_ENTRY_RE = re.compile(r"^index-inv2plus(\d+)\.js$")
# Relative import of another hashed chunk / entry from a lazy tab
REL_JS_IMPORT_RE = re.compile(r"""from\s*["']\./([^"']+\.js)["']""")
LAZY_TAB_RE = re.compile(
    r"(?:Summary|Earnings|Power|Machines|Network|History|Tools|Boosts)Tab-[A-Za-z0-9_-]+\.js"
)


def main() -> int:
    if not HTML.is_file():
        print(f"verify-spa-dist: missing {HTML}", file=sys.stderr)
        return 1

    text = HTML.read_text(encoding="utf-8")
    html_refs = re.findall(r'(?:src|href)="/assets/([^"]+)"', text)
    missing: list[str] = []
    for ref in html_refs:
        if not (ASSETS / ref).is_file():
            missing.append(ref)

    # Live entry = first module script that looks like the Vite app bundle.
    entry_name: str | None = None
    for ref in html_refs:
        base = Path(ref).name
        if VITE_ENTRY_RE.match(base) and "inv2plus" not in base:
            entry_name = base
            break
    if entry_name is None:
        # Temporary fallback while cutting over from hand-renamed entries.
        for ref in html_refs:
            base = Path(ref).name
            if INV2PLUS_ENTRY_RE.match(base):
                entry_name = base
                break
    if entry_name is None:
        print(
            "verify-spa-dist: index.html has no Vite assets/index-*.js entry",
            file=sys.stderr,
        )
        return 1

    entry_path = ASSETS / entry_name
    if not entry_path.is_file():
        print(f"verify-spa-dist: missing entry {entry_name}", file=sys.stderr)
        return 1

    entry_text = entry_path.read_text(encoding="utf-8", errors="ignore")
    lazy_names = sorted(set(LAZY_TAB_RE.findall(entry_text)))
    # Also accept string paths "assets/SummaryTab-….js" in the preload map.
    lazy_names = sorted(
        set(lazy_names)
        | set(
            re.findall(
                r"(?:Summary|Earnings|Power|Machines|Network|History|Tools|Boosts)Tab-[A-Za-z0-9_-]+\.js",
                entry_text,
            )
        )
    )

    dead_entry_refs: list[str] = []
    wrong_entry: list[str] = []
    for name in lazy_names:
        path = ASSETS / name
        if not path.is_file():
            missing.append(name)
            continue
        body = path.read_text(encoding="utf-8", errors="ignore")
        for imp in set(REL_JS_IMPORT_RE.findall(body)):
            # Lazy tabs typically import the shared entry as ./index-<hash>.js
            if VITE_ENTRY_RE.match(imp) and "inv2plus" not in imp and imp != entry_name:
                wrong_entry.append(f"{name} -> {imp} (want {entry_name})")
            if not (ASSETS / imp).is_file():
                dead_entry_refs.append(f"{name} imports missing {imp}")

    compat = (os.environ.get("SPA_COMPAT_KEEP") or "").strip()
    if compat:
        # Ensure at least the named compat generation is present (cached clients).
        compat_files = list(ASSETS.glob(f"*{compat}*"))
        if not compat_files:
            print(
                f"verify-spa-dist: SPA_COMPAT_KEEP={compat} but no matching assets",
                file=sys.stderr,
            )
            return 1

    errors = 0
    if missing:
        errors += 1
        print("verify-spa-dist: missing assets:", file=sys.stderr)
        for name in missing:
            print(f"  - /assets/{name}", file=sys.stderr)
    if wrong_entry:
        errors += 1
        print("verify-spa-dist: lazy chunks import wrong entry:", file=sys.stderr)
        for line in wrong_entry:
            print(f"  - {line}", file=sys.stderr)
    if dead_entry_refs:
        errors += 1
        print(f"verify-spa-dist: {len(dead_entry_refs)} dead entry import(s):", file=sys.stderr)
        for line in dead_entry_refs[:30]:
            print(f"  - {line}", file=sys.stderr)
        if len(dead_entry_refs) > 30:
            print(f"  ... +{len(dead_entry_refs) - 30} more", file=sys.stderr)

    if errors:
        return 1

    print(
        f"verify-spa-dist: OK (html={len(html_refs)} refs, entry={entry_name}, "
        f"lazy={len(lazy_names)}, compat={compat or 'off'})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
