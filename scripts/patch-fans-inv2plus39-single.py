#!/usr/bin/env python3
"""Single fan SKU: update bundle UI strings + locale chunks (inv2plus38 → inv2plus39)."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
VER = "39"
SRC = ASSETS / "index-inv2plus38.js"
DST = ASSETS / f"index-inv2plus{VER}.js"

FAN_NAME = 'e("fans.cooling_system_name",{defaultValue:"Sistema de refrigeração"})'
FAN_DESC = (
    'e("fans.cooling_system_desc",{defaultValue:"Bandeja com ventiladores — instale embaixo de um rack no inventário."})'
)
SHOP_NAME = 'dn("fans.cooling_system_name",{defaultValue:"Sistema de refrigeração"})'
SHOP_DESC = (
    'dn("fans.cooling_system_desc",{defaultValue:"Bandeja com ventiladores — instale embaixo de um rack no inventário."})'
)


def patch_bundle(text: str) -> str:
    if "__bmFanSingle39" in text:
        raise SystemExit("bundle already patched for single fan SKU")

    text = text.replace("inv2plus38.js", f"inv2plus{VER}.js")

    offers_title = (
        'w.sku==="cooling_fan_system"?e("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):'
        'e("fans.cooling_fan_name",{defaultValue:"Ventilador"})'
    )
    offers_desc = (
        'w.sku==="cooling_fan_system"?e("fans.cooling_fan_system_desc",{defaultValue:"Bandeja com 3 ventiladores — instale embaixo de um rack."}):'
        'e("fans.cooling_fan_desc",{defaultValue:"Unidade de ventilação para um rack."})'
    )
    if offers_title not in text:
        raise SystemExit("offers fan title block not found")
    text = text.replace(offers_title, FAN_NAME)
    text = text.replace(offers_desc, FAN_DESC)

    shop_title = (
        'w.sku==="cooling_fan_system"?dn("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):'
        'dn("fans.cooling_fan_name",{defaultValue:"Ventilador"})'
    )
    shop_desc = (
        'w.sku==="cooling_fan_system"?dn("fans.cooling_fan_system_desc",{defaultValue:"Bandeja com 3 ventiladores — instale embaixo de um rack."}):'
        'dn("fans.cooling_fan_desc",{defaultValue:"Unidade de ventilação para um rack."})'
    )
    if shop_title not in text:
        raise SystemExit("shop fan title block not found")
    text = text.replace(shop_title, SHOP_NAME)
    text = text.replace(shop_desc, SHOP_DESC)

    modal_title = (
        'fanModal.sku==="cooling_fan_system"?e("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):'
        'e("fans.cooling_fan_name",{defaultValue:"Ventilador"})'
    )
    text = text.replace(modal_title, FAN_NAME)

    text = text.replace('space-y-6 __bmFanUiFix38', "space-y-6 __bmFanSingle39 __bmFanUiFix38")
    return text


def patch_locale(text: str, lang: str) -> str:
    old_pt = (
        'fans:{cooling_fan_name:"Ventilador",cooling_fan_desc:"Unidade para um rack.",'
        'cooling_fan_system_name:"Sistema de ventilação",cooling_fan_system_desc:"Bandeja com 3 ventiladores.",'
        'purchase_success_detail:"{{count}} ventilador(es) adicionado(s)!"}'
    )
    new_pt = (
        'fans:{cooling_system_name:"Sistema de refrigeração",'
        'cooling_system_desc:"Bandeja com ventiladores — instale embaixo de um rack no inventário.",'
        'purchase_success_detail:"{{count}} sistema(s) de refrigeração adicionado(s)!"}'
    )
    old_en = (
        'fans:{cooling_fan_name:"Cooling fan",cooling_fan_desc:"Unit for one rack.",'
        'cooling_fan_system_name:"Cooling fan system",cooling_fan_system_desc:"Tray with 3 fans.",'
        'purchase_success_detail:"{{count}} fan unit(s) added!"}'
    )
    new_en = (
        'fans:{cooling_system_name:"Cooling system",'
        'cooling_system_desc:"Fan tray — install under a rack in inventory.",'
        'purchase_success_detail:"{{count}} cooling system(s) added!"}'
    )
    old_es = (
        'fans:{cooling_fan_name:"Ventilador",cooling_fan_desc:"Unidad para un rack.",'
        'cooling_fan_system_name:"Sistema de ventilación",cooling_fan_system_desc:"Bandeja con 3 ventiladores.",'
        'purchase_success_detail:"{{count}} ventilador(es) añadido(s)!"}'
    )
    new_es = (
        'fans:{cooling_system_name:"Sistema de refrigeración",'
        'cooling_system_desc:"Bandeja con ventiladores — instálala bajo un rack en el inventario.",'
        'purchase_success_detail:"{{count}} sistema(s) de refrigeración añadido(s)!"}'
    )
    mapping = {"pt-BR": (old_pt, new_pt), "en": (old_en, new_en), "es": (old_es, new_es)}
    old, new = mapping[lang]
    if old not in text:
        raise SystemExit(f"{lang} fans blob not found")
    text = text.replace(old, new)

    shop_title = {
        "pt-BR": ('fans_section_title:"Ventilação"', 'fans_section_title:"Refrigeração"'),
        "en": ('fans_section_title:"Cooling"', 'fans_section_title:"Cooling"'),
        "es": ('fans_section_title:"Ventilación"', 'fans_section_title:"Refrigeración"'),
    }[lang]
    if shop_title[0] in text and shop_title[0] != shop_title[1]:
        text = text.replace(shop_title[0], shop_title[1])
    return text


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")

    patched = patch_bundle(SRC.read_text(encoding="utf-8"))
    DST.write_text(patched, encoding="utf-8")
    print(f"wrote {DST}")

    for lang in ("pt-BR", "en", "es"):
        loc38 = ASSETS / f"{lang}-inv2plus38.js"
        loc39 = ASSETS / f"{lang}-inv2plus{VER}.js"
        if not loc38.is_file():
            raise SystemExit(f"missing {loc38}")
        loc39.write_text(patch_locale(loc38.read_text(encoding="utf-8"), lang), encoding="utf-8")
        print(f"wrote {loc39}")

    css38 = ASSETS / "index-inv2plus38.css"
    css39 = ASSETS / f"index-inv2plus{VER}.css"
    if css38.is_file():
        shutil.copy2(css38, css39)

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{VER}")


if __name__ == "__main__":
    main()
