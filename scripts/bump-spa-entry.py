#!/usr/bin/env python3
"""
Bump SPA entry + rename lazy stats chunks so browsers cannot reuse stale bodies.

Hand-patched client/dist often rewrites imports inside SummaryTab-inv2plus54.js
while keeping the same URL. Cached old bodies still import dead entries
(index-inv2plus53.js → 404 → "Failed to fetch dynamically imported module").

Usage (from repo root):
  python3 scripts/bump-spa-entry.py --from 112 --to 113
  python3 scripts/bump-spa-entry.py --from 112 --to 113 --dry-run
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
HTML = ROOT / "client" / "dist" / "index.html"

STATS_TAB_PREFIXES = (
    "SummaryTab",
    "EarningsTab",
    "PowerTab",
    "MachinesTab",
    "NetworkTab",
    "HistoryTab",
    "ToolsTab",
)

CHART_PREFIXES = (
    "EarningsChartsPanel",
    "PowerChartsPanel",
    "MachinesPowerChart",
)

ENTRY_REF_RE = re.compile(r"index-inv2plus\d+\.js")


def _rename_pair(prefix: str, old_ver: str, new_ver: str) -> tuple[str, str] | None:
    old = f"{prefix}-inv2plus{old_ver}.js"
    new = f"{prefix}-inv2plus{new_ver}.js"
    if (ASSETS / old).is_file():
        return old, new
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", required=True, help="Current entry version, e.g. 112")
    ap.add_argument("--to", dest="dst", required=True, help="New entry version, e.g. 113")
    ap.add_argument("--tab-from", dest="tab_from", default="54", help="Current stats tab suffix")
    ap.add_argument("--chart-from", dest="chart_from", default="56", help="Current chart panel suffix")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src, dst = str(args.src), str(args.dst)
    if src == dst:
        print("from == to", file=sys.stderr)
        return 1

    src_index = ASSETS / f"index-inv2plus{src}.js"
    dst_index = ASSETS / f"index-inv2plus{dst}.js"
    if not src_index.is_file():
        print(f"missing entry: {src_index}", file=sys.stderr)
        return 1
    if dst_index.is_file() and not args.dry_run:
        print(f"destination already exists: {dst_index}", file=sys.stderr)
        return 1

    renames: list[tuple[str, str]] = []
    for prefix in STATS_TAB_PREFIXES:
        pair = _rename_pair(prefix, args.tab_from, dst)
        if pair:
            renames.append(pair)
    for prefix in CHART_PREFIXES:
        pair = _rename_pair(prefix, args.chart_from, dst)
        if pair:
            renames.append(pair)

    print(f"entry {src} -> {dst}")
    print(f"renames ({len(renames)}):")
    for a, b in renames:
        print(f"  {a} -> {b}")

    if args.dry_run:
        return 0

    # 1) Write renamed lazy chunks with entry + self-refs updated.
    for old_name, new_name in renames:
        old_path = ASSETS / old_name
        text = old_path.read_text(encoding="utf-8")
        text = ENTRY_REF_RE.sub(f"index-inv2plus{dst}.js", text)
        for o, n in renames:
            text = text.replace(o, n)
        (ASSETS / new_name).write_text(text, encoding="utf-8")
        print(f"wrote {new_name}")

    # 2) New entry from previous entry.
    index_text = src_index.read_text(encoding="utf-8")
    index_text = ENTRY_REF_RE.sub(f"index-inv2plus{dst}.js", index_text)
    for old_name, new_name in renames:
        index_text = index_text.replace(old_name, new_name)
    # also rewrite bare inv2plus{src}.js leftovers in mapDeps-style strings
    index_text = index_text.replace(f"inv2plus{src}.js", f"inv2plus{dst}.js")
    dst_index.write_text(index_text, encoding="utf-8")
    print(f"wrote {dst_index.name}")

    # 3) CSS: prefer existing dst, else copy from src / newest.
    src_css = ASSETS / f"index-inv2plus{src}.css"
    dst_css = ASSETS / f"index-inv2plus{dst}.css"
    if not dst_css.is_file():
        # Prefer currently linked CSS in HTML (often lags JS bumps).
        html_now = HTML.read_text(encoding="utf-8")
        linked = re.findall(r"index-inv2plus(\d+)\.css", html_now)
        copied = False
        for ver in linked:
            cand = ASSETS / f"index-inv2plus{ver}.css"
            if cand.is_file():
                shutil.copy2(cand, dst_css)
                print(f"copied {dst_css.name} from {cand.name}")
                copied = True
                break
        if not copied and src_css.is_file():
            shutil.copy2(src_css, dst_css)
            print(f"copied {dst_css.name} from {src_css.name}")
        if not dst_css.is_file():
            candidates = sorted(ASSETS.glob("index-inv2plus*.css"), key=lambda p: p.stat().st_mtime)
            if candidates:
                shutil.copy2(candidates[-1], dst_css)
                print(f"copied {dst_css.name} from {candidates[-1].name}")
    if not dst_css.is_file():
        print(f"missing CSS for entry {dst}", file=sys.stderr)
        return 1

    # 4) Retarget every JS chunk to the new entry + renamed lazy URLs.
    updated = 0
    for path in ASSETS.glob("*.js"):
        if path.name == dst_index.name:
            continue
        if path.name in {n for _, n in renames}:
            continue
        text = path.read_text(encoding="utf-8")
        new = ENTRY_REF_RE.sub(f"index-inv2plus{dst}.js", text)
        for old_name, new_name in renames:
            new = new.replace(old_name, new_name)
        if new != text:
            path.write_text(new, encoding="utf-8")
            updated += 1
    print(f"retargeted {updated} other chunk(s)")

    # 5) index.html
    html = HTML.read_text(encoding="utf-8")
    html = re.sub(r"index-inv2plus\d+\.js", f"index-inv2plus{dst}.js", html)
    html = re.sub(r"index-inv2plus\d+\.css", f"index-inv2plus{dst}.css", html, count=1)
    HTML.write_text(html, encoding="utf-8")
    print(f"updated index.html -> index-inv2plus{dst}.js + css")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
