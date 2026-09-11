#!/usr/bin/env python3
"""Bump SPA bundle to inv2plus43 + load transparency enhance script."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC_VER = "42"
DST_VER = "43"


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing {src_index}")

    text = src_index.read_text(encoding="utf-8")
    text = text.replace(f"inv2plus{SRC_VER}.js", f"inv2plus{DST_VER}.js")
    text = text.replace("inv2plus42.js", f"inv2plus{DST_VER}.js")
    dst_index.write_text(text, encoding="utf-8")
    print(f"wrote {dst_index}")

    src_css = ASSETS / f"index-inv2plus{SRC_VER}.css"
    dst_css = ASSETS / f"index-inv2plus{DST_VER}.css"
    if src_css.is_file():
        shutil.copy2(src_css, dst_css)
        print(f"copied {dst_css}")

    for lang in ("pt-BR", "en", "es"):
        loc_src = ASSETS / f"{lang}-inv2plus{SRC_VER}.js"
        if not loc_src.is_file():
            loc_src = ASSETS / f"{lang}-inv2plus40.js"
        loc_dst = ASSETS / f"{lang}-inv2plus{DST_VER}.js"
        if loc_src.is_file():
            text_loc = loc_src.read_text(encoding="utf-8")
            if f"inv2plus{DST_VER}" not in text_loc:
                text_loc = text_loc.replace(f"inv2plus{SRC_VER}", f"inv2plus{DST_VER}")
                text_loc = text_loc.replace("inv2plus42", f"inv2plus{DST_VER}")
            loc_dst.write_text(text_loc, encoding="utf-8")
            print(f"wrote {loc_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39", "40", "41", "42"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{DST_VER}.css")

    enhance_tag = f'<script type="module" src="/assets/transparency-enhance-inv2plus{DST_VER}.js"></script>'
    if enhance_tag not in html_text:
        html_text = html_text.replace("</head>", f"    {enhance_tag}\n  </head>")

    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{DST_VER}")


if __name__ == "__main__":
    main()
