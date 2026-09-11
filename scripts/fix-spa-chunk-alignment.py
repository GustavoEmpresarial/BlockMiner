#!/usr/bin/env python3
"""Align lazy chunks to the SPA entry bundle and bust immutable browser cache.

When we patch client/dist in place, hashed lazy chunks (e.g. SummaryTab-DF6n1o-8.js)
keep the same URL but change imports — browsers/CDN keep the old body forever
(Cache-Control: immutable). This script:

1. Bumps manual entry index-inv2plus{N} → index-inv2plus{N+1}
2. Retargets every lazy chunk import to the new entry
3. Renames stats tab chunks to *-inv2plus{N+1}.js (new URLs → cache miss)
4. Removes orphan legacy entry index-emucuB7Z.js
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
HTML = ROOT / "client" / "dist" / "index.html"

SRC_VER = "52"
DST_VER = "53"

# Stats lazy tabs: rename so browsers cannot reuse pre-fix immutable cache.
STATS_TAB_RENAMES: dict[str, str] = {
    "SummaryTab-DF6n1o-8.js": f"SummaryTab-inv2plus{DST_VER}.js",
    "EarningsTab-c-7yg7tl.js": f"EarningsTab-inv2plus{DST_VER}.js",
    "PowerTab-C0h3aiMZ.js": f"PowerTab-inv2plus{DST_VER}.js",
    "MachinesTab-Dr7hGI1l.js": f"MachinesTab-inv2plus{DST_VER}.js",
    "NetworkTab-DgqgOW_Q.js": f"NetworkTab-inv2plus{DST_VER}.js",
    "HistoryTab-yi9qjxUF.js": f"HistoryTab-inv2plus{DST_VER}.js",
    "ToolsTab-BKYKPPLM.js": f"ToolsTab-inv2plus{DST_VER}.js",
}

LEGACY_ENTRIES = ("index-emucuB7Z.js",)


def _replace_entry_refs(text: str, src: str, dst: str) -> str:
    text = text.replace(f"index-inv2plus{src}.js", f"index-inv2plus{DST_VER}.js")
    text = text.replace(f"inv2plus{src}.js", f"inv2plus{DST_VER}.js")
    for legacy in LEGACY_ENTRIES:
        text = text.replace(legacy, f"index-inv2plus{DST_VER}.js")
    return text


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing entry bundle: {src_index}")

    # 1) Rename stats tab files (content already aligned to inv2plus52).
    for old_name, new_name in STATS_TAB_RENAMES.items():
        old_path = ASSETS / old_name
        new_path = ASSETS / new_name
        if not old_path.is_file():
            raise SystemExit(f"missing stats chunk: {old_path}")
        text = old_path.read_text(encoding="utf-8")
        text = _replace_entry_refs(text, SRC_VER, DST_VER)
        text = text.replace(old_name, new_name)
        new_path.write_text(text, encoding="utf-8")
        print(f"renamed {old_name} -> {new_name}")

    # 2) New entry bundle from previous entry.
    index_text = src_index.read_text(encoding="utf-8")
    index_text = _replace_entry_refs(index_text, SRC_VER, DST_VER)
    for old_name, new_name in STATS_TAB_RENAMES.items():
        index_text = index_text.replace(old_name, new_name)
    dst_index.write_text(index_text, encoding="utf-8")
    print(f"wrote {dst_index.name}")

    src_css = ASSETS / f"index-inv2plus{SRC_VER}.css"
    dst_css = ASSETS / f"index-inv2plus{DST_VER}.css"
    if dst_css.is_file():
        pass
    elif src_css.is_file():
        shutil.copy2(src_css, dst_css)
        print(f"copied {dst_css.name} from inv2plus{SRC_VER}")
    else:
        # Entry JS bumps often outpace CSS (index.html may still link inv2plus47.css).
        linked_css = None
        for m in re.finditer(r'index-inv2plus(\d+)\.css', html_text := HTML.read_text(encoding="utf-8")):
            linked_css = ASSETS / f"index-inv2plus{m.group(1)}.css"
        if linked_css and linked_css.is_file():
            shutil.copy2(linked_css, dst_css)
            print(f"copied {dst_css.name} from {linked_css.name}")
        else:
            # Fall back to newest inv2plus*.css in assets.
            candidates = sorted(ASSETS.glob("index-inv2plus*.css"), key=lambda p: p.stat().st_mtime)
            if candidates:
                shutil.copy2(candidates[-1], dst_css)
                print(f"copied {dst_css.name} from {candidates[-1].name}")
    if not dst_css.is_file():
        raise SystemExit(
            f"missing CSS for index-inv2plus{DST_VER}: create {dst_css.name} "
            f"(copy from index-inv2plus47.css or run vite build)"
        )

    # 5) index.html → new JS entry only; bump CSS href only when dst css exists.
    html_text = HTML.read_text(encoding="utf-8")
    for old in range(34, int(SRC_VER) + 1):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
    html_text = html_text.replace(f"index-inv2plus{SRC_VER}.js", f"index-inv2plus{DST_VER}.js")
    if dst_css.is_file():
        html_text = re.sub(
            r'index-inv2plus\d+\.css',
            f"index-inv2plus{DST_VER}.css",
            html_text,
            count=1,
        )
    HTML.write_text(html_text, encoding="utf-8")
    print(f"updated index.html -> index-inv2plus{DST_VER}.js")

    # 3) Retarget all asset chunks to the new entry (including __vite__mapDeps strings).
    updated = 0
    for path in ASSETS.glob("*.js"):
        if path.name == dst_index.name:
            continue
        text = path.read_text(encoding="utf-8")
        new_text = _replace_entry_refs(text, SRC_VER, DST_VER)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            updated += 1
    print(f"retargeted imports in {updated} asset file(s) -> index-inv2plus{DST_VER}.js")

    # 4) Locale bundles (manual inv2plus names).
    for lang in ("pt-BR", "en", "es"):
        loc_src = ASSETS / f"{lang}-inv2plus{SRC_VER}.js"
        loc_dst = ASSETS / f"{lang}-inv2plus{DST_VER}.js"
        if loc_src.is_file():
            loc_text = _replace_entry_refs(loc_src.read_text(encoding="utf-8"), SRC_VER, DST_VER)
            loc_dst.write_text(loc_text, encoding="utf-8")
            print(f"wrote {loc_dst.name}")

    # 6) Drop legacy React entry (second copy that breaks useContext).
    for legacy in LEGACY_ENTRIES:
        legacy_path = ASSETS / legacy
        if legacy_path.is_file():
            legacy_path.unlink()
            print(f"removed orphan {legacy}")

    # Sanity: no emucu refs left.
    bad = list(ASSETS.glob("*.js"))
    emucu_hits = [p.name for p in bad if "index-emucuB7Z" in p.read_text(encoding="utf-8")]
    if emucu_hits:
        raise SystemExit(f"still references index-emucuB7Z in: {emucu_hits[:10]}")

    print("OK: SPA chunks aligned to index-inv2plus%s" % DST_VER)


if __name__ == "__main__":
    main()
