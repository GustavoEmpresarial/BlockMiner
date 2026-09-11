#!/usr/bin/env python3
"""Fix fan shop/offers UI: locale chunk version, CoolingFanUnit visual, i18n fallbacks, price layout."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
VER = "38"
SRC = ASSETS / "index-inv2plus37.js"
DST = ASSETS / f"index-inv2plus{VER}.js"


def patch_bundle(text: str) -> str:
    if "__bmFanUiFix38" in text:
        raise SystemExit("bundle already has UI fix 38")

    # Locale lazy-imports still pointed at inv2plus34 — keys like fans.cooling_fan_name never loaded
    text = text.replace("inv2plus34.js", f"inv2plus{VER}.js")

    old_offers = (
        'fanOff?.isLive&&(fanOff.items?.length??0)>0&&a.jsxs("div",{className:"space-y-6",children:[a.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800",children:[a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("span",{className:"px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[9px] font-black text-cyan-300 uppercase",children:fanOff.isPurchaseLive?e("offers.live"):e("offers.coming_soon")}),a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:fanOff.title})]}),fanOff.salesAvailableAt&&a.jsx("span",{className:"text-xs text-gray-500",children:$y(fanOff.salesAvailableAt,t)})]}),fanOff.description&&a.jsx("p",{className:"text-sm text-gray-500",children:fanOff.description}),a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:(fanOff.items||[]).map(w=>a.jsxs("div",{className:"bg-surface border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-xl",children:[a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-4 border border-gray-800 flex items-center justify-center mb-4",children:w.imageUrl?a.jsx("img",{src:w.imageUrl,className:"w-full h-full object-contain",alt:e(w.nameKey)}):null}),a.jsx("h3",{className:"text-xl font-black text-white",children:e(w.nameKey)}),a.jsx("p",{className:"text-xs text-gray-500",children:e(w.descriptionKey)}),a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between mt-4",children:[a.jsxs("div",{children:[w.listPrice>w.price&&a.jsxs("span",{className:"text-sm text-gray-500 line-through mr-2",children:[w.listPrice," ",w.currency]}),a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency]})]}),a.jsx("button",{disabled:!fanOff.isPurchaseLive||!w.isPurchaseLive||h,onClick:()=>{f(1),setFanModal(w)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:fanOff.isPurchaseLive?e("offers.buy"):e("offers.coming_soon")})]})]},w.sku))})]}),'
    )

    new_offers = (
        'fanOff?.isLive&&(fanOff.items?.length??0)>0&&a.jsxs("div",{className:"space-y-6 __bmFanUiFix38",children:[a.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800",children:[a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("span",{className:"px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[9px] font-black text-cyan-300 uppercase",children:fanOff.isPurchaseLive?e("offers.live"):e("offers.coming_soon")}),a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:fanOff.title})]}),fanOff.salesAvailableAt&&a.jsx("span",{className:"text-xs text-gray-500",children:$y(fanOff.salesAvailableAt,t)})]}),fanOff.description&&a.jsx("p",{className:"text-sm text-gray-500",children:fanOff.description}),a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:(fanOff.items||[]).map(w=>a.jsxs("div",{className:"bg-surface border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-xl",children:[a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-4 border border-gray-800 flex items-center justify-center mb-4 overflow-hidden",children:a.jsx(c4,{spinning:!0,className:"h-auto w-full max-w-md"})}),a.jsx("h3",{className:"text-xl font-black text-white",children:w.sku==="cooling_fan_system"?e("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):e("fans.cooling_fan_name",{defaultValue:"Ventilador"})}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:w.sku==="cooling_fan_system"?e("fans.cooling_fan_system_desc",{defaultValue:"Bandeja com 3 ventiladores — instale embaixo de um rack."}):e("fans.cooling_fan_desc",{defaultValue:"Unidade de ventilação para um rack."})}),a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between gap-4 mt-4",children:[a.jsxs("div",{className:"flex flex-col",children:[w.listPrice>w.price&&a.jsxs("span",{className:"text-sm font-bold text-gray-500 line-through",children:[w.listPrice," ",w.currency]}),a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency]})]}),a.jsx("button",{disabled:!fanOff.isPurchaseLive||!w.isPurchaseLive||h,onClick:()=>{f(1),setFanModal(w)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:fanOff.isPurchaseLive?e("offers.buy"):e("offers.coming_soon")})]})]},w.sku))})]}),'
    )

    if old_offers not in text:
        raise SystemExit("offers fan UI block not found")
    text = text.replace(old_offers, new_offers)

    old_shop_img = (
        'a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 mb-4 flex items-center justify-center",children:w.imageUrl?a.jsx("img",{src:w.imageUrl,className:"w-full h-full object-contain",alt:dn(w.nameKey,{defaultValue:"Ventilador"})}):null}),a.jsx("h3",{className:"text-xl font-black text-white",children:dn(w.nameKey,{defaultValue:"Sistema de ventilação"})}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:dn(w.descriptionKey,{defaultValue:"Instale embaixo do rack no inventário."})})'
    )
    new_shop_img = (
        'a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 mb-4 flex items-center justify-center overflow-hidden",children:a.jsx(c4,{spinning:!0,className:"h-auto w-full max-w-md"})}),a.jsx("h3",{className:"text-xl font-black text-white",children:w.sku==="cooling_fan_system"?dn("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):dn("fans.cooling_fan_name",{defaultValue:"Ventilador"})}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:w.sku==="cooling_fan_system"?dn("fans.cooling_fan_system_desc",{defaultValue:"Bandeja com 3 ventiladores — instale embaixo de um rack."}):dn("fans.cooling_fan_desc",{defaultValue:"Unidade de ventilação para um rack."})})'
    )
    if old_shop_img not in text:
        raise SystemExit("shop fan UI block not found")
    text = text.replace(old_shop_img, new_shop_img)

    old_fan_modal = 'a.jsx("p",{className:"text-center text-gray-400",children:e(fanModal.nameKey)})'
    new_fan_modal = (
        'a.jsx("p",{className:"text-center text-gray-400",children:fanModal.sku==="cooling_fan_system"?e("fans.cooling_fan_system_name",{defaultValue:"Sistema de ventilação"}):e("fans.cooling_fan_name",{defaultValue:"Ventilador"})})'
    )
    text = text.replace(old_fan_modal, new_fan_modal)

    return text


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")
    patched = patch_bundle(SRC.read_text(encoding="utf-8"))
    DST.write_text(patched, encoding="utf-8")
    print(f"wrote {DST}")

    for lang in ("pt-BR", "en", "es"):
        loc37 = ASSETS / f"{lang}-inv2plus37.js"
        loc38 = ASSETS / f"{lang}-inv2plus{VER}.js"
        if loc37.is_file():
            shutil.copy2(loc37, loc38)
            print(f"copied {loc38}")
        else:
            loc34 = ASSETS / f"{lang}-inv2plus34.js"
            if loc34.is_file():
                shutil.copy2(loc34, loc38)
                print(f"copied fallback {loc38}")

    css37 = ASSETS / "index-inv2plus37.css"
    css38 = ASSETS / f"index-inv2plus{VER}.css"
    if css37.is_file():
        shutil.copy2(css37, css38)

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{VER}")


if __name__ == "__main__":
    main()
