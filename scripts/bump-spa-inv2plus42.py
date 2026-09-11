#!/usr/bin/env python3
"""Bump manual SPA bundle version (content copy + aligned locale chunk names)."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC_VER = "41"
DST_VER = "42"


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing {src_index}")

    text = src_index.read_text(encoding="utf-8")
    text = text.replace(f"inv2plus{SRC_VER}.js", f"inv2plus{DST_VER}.js")
    text = text.replace("inv2plus40.js", f"inv2plus{DST_VER}.js")
    dst_index.write_text(text, encoding="utf-8")
    print(f"wrote {dst_index}")

    src_css = ASSETS / f"index-inv2plus{SRC_VER}.css"
    dst_css = ASSETS / f"index-inv2plus{DST_VER}.css"
    if src_css.is_file():
        shutil.copy2(src_css, dst_css)
        print(f"copied {dst_css}")

    for lang in ("pt-BR", "en", "es"):
        loc_src = ASSETS / f"{lang}-inv2plus40.js"
        if not loc_src.is_file():
            loc_src = ASSETS / f"{lang}-inv2plus{SRC_VER}.js"
        loc_dst = ASSETS / f"{lang}-inv2plus{DST_VER}.js"
        if loc_src.is_file():
            shutil.copy2(loc_src, loc_dst)
            print(f"copied {loc_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39", "40", "41"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{DST_VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{DST_VER}")


if __name__ == "__main__":
    main()
