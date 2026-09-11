#!/usr/bin/env python3
"""Bump SPA bundle to inv2plus45 — tournament machine prize inbox messaging."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC_VER = "44"
DST_VER = "45"

REWARD_UI_OLD = 'n("tournaments.rewardCredited")'
REWARD_UI_NEW = (
    'n(e.myPrize?.prizeType==="MACHINE"?"tournaments.rewardMachineInbox":"tournaments.rewardCredited")'
)

LOCALE_PATCHES = {
    "pt-BR": (
        'rewardCredited:"Recompensa creditada"',
        'rewardCredited:"Recompensa creditada",rewardMachineInbox:"Máquina no Inventário — toque em Coletar"',
    ),
    "en": (
        'rewardCredited:"Reward credited"',
        'rewardCredited:"Reward credited",rewardMachineInbox:"Machine in Inventory — tap Collect"',
    ),
    "es": (
        'rewardCredited:"Recompensa acreditada"',
        'rewardCredited:"Recompensa acreditada",rewardMachineInbox:"Máquina en Inventario — pulsa Colectar"',
    ),
}


def patch_index(text: str) -> str:
    if REWARD_UI_OLD not in text:
        raise SystemExit("missing tournament rewardCredited UI anchor")
    return text.replace(REWARD_UI_OLD, REWARD_UI_NEW, 1)


def patch_locale(text: str, lang: str) -> str:
    old, new = LOCALE_PATCHES[lang]
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"missing locale patch anchor for {lang}")
    return text.replace(old, new, 1)


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing {src_index}")

    text = src_index.read_text(encoding="utf-8")
    text = text.replace(f"inv2plus{SRC_VER}.js", f"inv2plus{DST_VER}.js")
    text = text.replace("inv2plus44.js", f"inv2plus{DST_VER}.js")
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
                text_loc = text_loc.replace("inv2plus44", f"inv2plus{DST_VER}")
            text_loc = patch_locale(text_loc, lang)
            loc_dst.write_text(text_loc, encoding="utf-8")
            print(f"wrote {loc_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{DST_VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{DST_VER}")


if __name__ == "__main__":
    main()
