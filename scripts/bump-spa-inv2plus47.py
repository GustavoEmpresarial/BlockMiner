#!/usr/bin/env python3
"""Bump SPA bundle to inv2plus47 — fix inventário collect ternary parentheses (inv2plus44 bug)."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC_VER = "45"
DST_VER = "47"

# inv2plus44 wrapped dispatch + toast in `? (` but omitted the closing `)` before `:`.
COLLECT_BROKEN = (
    'rewardType==="machine"?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collected_machine_toast"),{action:{label:e("inventario.go_to_machines"),'
    'onClick:()=>t("/inventory")}}):D.success(e("inventario.collected_toast")'
)
COLLECT_FIXED = (
    'rewardType==="machine"?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collected_machine_toast"),{action:{label:e("inventario.go_to_machines"),'
    'onClick:()=>t("/inventory")}})):D.success(e("inventario.collected_toast")'
)

COLLECT_ALL_BROKEN = (
    'machines>0?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collect_all_machines_toast",{count:T,machines}),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}}):'
    'D.success(e("inventario.collect_all_toast",{count:T})'
)
COLLECT_ALL_FIXED = (
    'machines>0?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collect_all_machines_toast",{count:T,machines}),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}})):'
    'D.success(e("inventario.collect_all_toast",{count:T})'
)


def patch_index(text: str) -> str:
    if COLLECT_BROKEN not in text:
        if COLLECT_FIXED in text:
            return text
        raise SystemExit("missing broken inventario collect anchor")
    text = text.replace(COLLECT_BROKEN, COLLECT_FIXED, 1)
    if COLLECT_ALL_BROKEN not in text:
        if COLLECT_ALL_FIXED in text:
            return text
        raise SystemExit("missing broken inventario collect-all anchor")
    return text.replace(COLLECT_ALL_BROKEN, COLLECT_ALL_FIXED, 1)


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing {src_index}")

    text = src_index.read_text(encoding="utf-8")
    text = text.replace(f"inv2plus{SRC_VER}.js", f"inv2plus{DST_VER}.js")
    text = text.replace("inv2plus45.js", f"inv2plus{DST_VER}.js")
    text = patch_index(text)
    dst_index.write_text(text, encoding="utf-8")
    print(f"wrote {dst_index}")

    src_css = ASSETS / f"index-inv2plus{SRC_VER}.css"
    dst_css = ASSETS / f"index-inv2plus{DST_VER}.css"
    if src_css.is_file():
        shutil.copy2(src_css, dst_css)
        print(f"copied {dst_css}")

    for lang in ("pt-BR", "en", "es"):
        loc_src = ASSETS / f"{lang}-inv2plus{SRC_VER}.js"
        loc_dst = ASSETS / f"{lang}-inv2plus{DST_VER}.js"
        if loc_src.is_file():
            text_loc = loc_src.read_text(encoding="utf-8")
            if f"inv2plus{DST_VER}" not in text_loc:
                text_loc = text_loc.replace(f"inv2plus{SRC_VER}", f"inv2plus{DST_VER}")
                text_loc = text_loc.replace("inv2plus45", f"inv2plus{DST_VER}")
            loc_dst.write_text(text_loc, encoding="utf-8")
            print(f"wrote {loc_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{DST_VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{DST_VER}")


if __name__ == "__main__":
    main()
