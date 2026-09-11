#!/usr/bin/env python3
"""Add rack shop/offers (0.15 shop / 0.10 offer) — inv2plus39 → inv2plus40."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
VER = "40"
SRC = ASSETS / "index-inv2plus39.js"
DST = ASSETS / f"index-inv2plus{VER}.js"
RACK_IMG = "/media/racks/default-shelf.svg"


def patch_bundle(text: str) -> str:
    if "__bmRacks40" in text:
        raise SystemExit("bundle already has racks patch 40")

    text = text.replace("inv2plus39.js", f"inv2plus{VER}.js")

    text = text.replace(
        '"/shop/purchase-fan","/offer-events/purchase","/offer-events/purchase-fan"',
        '"/shop/purchase-fan","/shop/purchase-rack","/offer-events/purchase","/offer-events/purchase-fan","/offer-events/purchase-rack"',
    )

    text = text.replace(
        'function __bmShopFanBuy(e){return G.post("/shop/purchase-fan",e)}',
        'function __bmShopFanBuy(e){return G.post("/shop/purchase-fan",e)}function __bmShopRackBuy(e){return G.post("/shop/purchase-rack",e)}',
    )
    text = text.replace(
        'function __bmOfferFanBuy(e){return G.post("/offer-events/purchase-fan",e)}',
        'function __bmOfferFanBuy(e){return G.post("/offer-events/purchase-fan",e)}function __bmOfferRackBuy(e){return G.post("/offer-events/purchase-rack",e)}',
    )

    old_cache_fn = (
        "function __bmWriteOffersCache(e,r,fo){return __bmOffersCache={events:e,roomOffers:r,"
        "fanOffers:fo??__bmOffersCache?.fanOffers??null,fetchedAtMs:Date.now()}}"
    )
    new_cache_fn = (
        "function __bmWriteOffersCache(e,r,fo,rko){return __bmOffersCache={events:e,roomOffers:r,"
        "fanOffers:fo??__bmOffersCache?.fanOffers??null,rackOffers:rko??__bmOffersCache?.rackOffers??null,"
        "fetchedAtMs:Date.now()}}"
    )
    if old_cache_fn not in text:
        raise SystemExit("offers cache fn not found")
    text = text.replace(old_cache_fn, new_cache_fn)

    old_off_state = "[fanOff,setFanOff]=p.useState(()=>__c?.fanOffers??null),[fanModal,setFanModal]=p.useState(null),"
    new_off_state = (
        "[fanOff,setFanOff]=p.useState(()=>__c?.fanOffers??null),[rackOff,setRackOff]=p.useState(()=>__c?.rackOffers??null),"
        "[fanModal,setFanModal]=p.useState(null),[rackModal,setRackModal]=p.useState(null),"
    )
    if old_off_state not in text:
        raise SystemExit("offers fan state not found")
    text = text.replace(old_off_state, new_off_state)

    old_off_load = (
        "let fo=body.fanOffers??null;if(!replaceRooms&&ro==null){const prev=__bmReadOffersCache()?.roomOffers??null;"
        "if(prev?.isLive&&(prev.rooms?.length??0)>0)ro=prev}s(ev),setROff(ro),setFanOff(fo),__bmWriteOffersCache(ev,ro,fo),hasLoaded.current=!0"
    )
    new_off_load = (
        "let fo=body.fanOffers??null;let rko=body.rackOffers??null;if(!replaceRooms&&ro==null){const prev=__bmReadOffersCache()?.roomOffers??null;"
        "if(prev?.isLive&&(prev.rooms?.length??0)>0)ro=prev}s(ev),setROff(ro),setFanOff(fo),setRackOff(rko),__bmWriteOffersCache(ev,ro,fo,rko),hasLoaded.current=!0"
    )
    if old_off_load not in text:
        raise SystemExit("offers load handler not found")
    text = text.replace(old_off_load, new_off_load)

    rack_offers_block = (
        'rackOff?.isLive&&(rackOff.items?.length??0)>0&&a.jsxs("div",{className:"space-y-6 __bmRacks40",children:[a.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800",children:[a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("span",{className:"px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-[9px] font-black text-amber-300 uppercase",children:rackOff.isPurchaseLive?e("offers.live"):e("offers.coming_soon")}),a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:rackOff.title})]}),rackOff.salesAvailableAt&&a.jsx("span",{className:"text-xs text-gray-500",children:$y(rackOff.salesAvailableAt,t)})]}),rackOff.description&&a.jsx("p",{className:"text-sm text-gray-500",children:rackOff.description}),a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:(rackOff.items||[]).map(w=>a.jsxs("div",{className:"bg-surface border border-amber-500/20 rounded-[2.5rem] p-8 shadow-xl",children:[a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-4 border border-gray-800 flex items-center justify-center mb-4 overflow-hidden",children:a.jsx("img",{src:w.imageUrl||"'
        + RACK_IMG
        + '",className:"h-auto w-full max-w-md object-contain",alt:e("racks.mining_rack_name",{defaultValue:"Rack"})})}),a.jsx("h3",{className:"text-xl font-black text-white",children:e("racks.mining_rack_name",{defaultValue:"Rack"})}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:e("racks.mining_rack_desc",{defaultValue:"Prateleira com 8 slots — instale no inventário."})}),a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between gap-4 mt-4",children:[a.jsxs("div",{className:"flex flex-col",children:[w.listPrice>w.price&&a.jsxs("span",{className:"text-sm font-bold text-gray-500 line-through",children:[w.listPrice," ",w.currency]}),a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency]})]}),a.jsx("button",{disabled:!rackOff.isPurchaseLive||!w.isPurchaseLive||h,onClick:()=>{f(1),setRackModal(w)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:rackOff.isPurchaseLive?e("offers.buy"):e("offers.coming_soon")})]})]},w.sku))})]}),'
    )
    fan_off_anchor = "fanOff?.isLive&&(fanOff.items?.length??0)>0&&a.jsxs"
    if fan_off_anchor not in text:
        raise SystemExit("fan offers anchor not found")
    text = text.replace(fan_off_anchor, rack_offers_block + fan_off_anchor, 1)

    old_shop_state = (
        "[fans,setFans]=p.useState([]),[fanSalesAt,setFanSalesAt]=p.useState(null),[fanModal,setFanModal]=p.useState(null),"
        "[fanQty,setFanQty]=p.useState(1),[fanBuying,setFanBuying]=p.useState(!1),"
    )
    new_shop_state = (
        "[racks,setRacks]=p.useState([]),[rackSalesAt,setRackSalesAt]=p.useState(null),[rackModal,setRackModal]=p.useState(null),"
        "[rackQty,setRackQty]=p.useState(1),[rackBuying,setRackBuying]=p.useState(!1),"
        "[fans,setFans]=p.useState([]),[fanSalesAt,setFanSalesAt]=p.useState(null),[fanModal,setFanModal]=p.useState(null),"
        "[fanQty,setFanQty]=p.useState(1),[fanBuying,setFanBuying]=p.useState(!1),"
    )
    if old_shop_state not in text:
        raise SystemExit("shop fan state not found")
    text = text.replace(old_shop_state, new_shop_state)

    old_shop_load = (
        "Array.isArray(v.data.fans)&&setFans(v.data.fans),v.data.fanSalesAvailableAt&&setFanSalesAt(v.data.fanSalesAvailableAt))"
    )
    new_shop_load = (
        "Array.isArray(v.data.racks)&&setRacks(v.data.racks),v.data.rackSalesAvailableAt&&setRackSalesAt(v.data.rackSalesAvailableAt),"
        "Array.isArray(v.data.fans)&&setFans(v.data.fans),v.data.fanSalesAvailableAt&&setFanSalesAt(v.data.fanSalesAvailableAt))"
    )
    if old_shop_load not in text:
        raise SystemExit("shop load not found")
    text = text.replace(old_shop_load, new_shop_load)

    fan_buy_anchor = "bFan=async()=>{if(fanBuying||!fanModal)return;"
    rack_buy = (
        "bRack=async()=>{if(rackBuying||!rackModal)return;const w=Math.min(SS,Math.max(1,Number(rackQty)||1));"
        "if(!Number.isInteger(w)){D.error(dn(\"shop.invalid_quantity\",{defaultValue:\"Quantidade inválida.\"}));return}"
        "try{setRackBuying(!0);const v=typeof crypto<\"u\"&&typeof crypto.randomUUID==\"function\"?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2,11)}`,"
        "N=await __bmShopRackBuy({sku:rackModal.sku,quantity:w,idempotencyKey:v});if(N.data.ok){D.success(dn(\"racks.purchase_success_detail\",{defaultValue:\"{{count}} rack(s) adicionado(s)!\",count:w})),x(),setRackModal(null)}}"
        "catch(v){const N=St(v)?v.response?.data:void 0,k=N&&typeof N==\"object\"&&\"message\"in N&&typeof N.message==\"string\"?N.message:dn(\"common.error\");D.error(k)}finally{setRackBuying(!1)}},"
    )
    if fan_buy_anchor not in text:
        raise SystemExit("shop bFan anchor not found")
    text = text.replace(fan_buy_anchor, rack_buy + fan_buy_anchor, 1)

    racks_section = (
        'racks.length>0&&a.jsxs("section",{className:"space-y-6 __bmRacks40",children:[a.jsxs("div",{className:"flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-800 pb-4",children:[a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:dn("shop.racks_section_title",{defaultValue:"Racks"})}),rackSalesAt&&a.jsxs("p",{className:"text-xs text-amber-400 font-bold",children:[dn("shop.sales_opens_at",{defaultValue:"Vendas abrem em"})," ",new Date(rackSalesAt).toLocaleString("pt-BR")]})]}),a.jsx("p",{className:"text-sm text-gray-500",children:dn("shop.racks_section_desc",{defaultValue:"Prateleiras extras — instale no inventário."})}),a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:racks.map(w=>a.jsxs("div",{className:"bg-surface border border-amber-500/20 rounded-[2.5rem] p-8 shadow-xl",children:[a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 mb-4 flex items-center justify-center overflow-hidden",children:a.jsx("img",{src:w.imageUrl||"'
        + RACK_IMG
        + '",className:"h-full w-full object-contain",alt:dn("racks.mining_rack_name",{defaultValue:"Rack"})})}),a.jsx("h3",{className:"text-xl font-black text-white",children:dn("racks.mining_rack_name",{defaultValue:"Rack"})}),a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:dn("racks.mining_rack_desc",{defaultValue:"Prateleira com 8 slots."})}),a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between mt-4",children:[a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency||shopCur||"BLK"]}),a.jsx("button",{disabled:!w.isPurchaseLive,onClick:()=>{setRackModal(w),setRackQty(1)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:w.isPurchaseLive?dn("shop.buy",{defaultValue:"Comprar"}):dn("offers.coming_soon",{defaultValue:"Em breve"})})]})]},w.sku))})]}),'
    )
    fans_section_anchor = 'fans.length>0&&a.jsxs("section"'
    if fans_section_anchor not in text:
        raise SystemExit("shop fans section not found")
    text = text.replace(fans_section_anchor, racks_section + fans_section_anchor, 1)

    old_fan_portal_btn = 'onClick:bFan,disabled:fanBuying,className:"w-full py-4 bg-primary'
    new_fan_portal_btn = 'onClick:bRack,disabled:rackBuying,className:"w-full py-4 bg-primary'
    # rack modal portal - insert before fanModal portal
    rack_portal = (
        'rackModal&&ks.createPortal(a.jsx("div",{className:"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md",children:a.jsxs("div",{className:"bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md p-10 space-y-6 relative",children:[a.jsx("button",{onClick:()=>setRackModal(null),className:"absolute top-4 right-4 text-gray-500",children:a.jsx(wt,{className:"w-6 h-6"})}),a.jsx("h3",{className:"text-2xl font-black text-white text-center",children:dn("shop.modal_title",{defaultValue:"Confirmar compra"})}),a.jsx("p",{className:"text-center text-gray-400",children:dn("racks.mining_rack_name",{defaultValue:"Rack"})}),a.jsxs("div",{className:"flex items-center justify-between",children:[a.jsx("span",{className:"text-xs font-bold text-gray-500 uppercase",children:dn("shop.quantity",{defaultValue:"Quantidade"})}),a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("button",{onClick:()=>setRackQty(q=>Math.max(1,q-1)),className:"p-2 rounded-xl border border-gray-700",children:a.jsx(O_,{className:"w-4 h-4"})}),a.jsx("span",{className:"font-black text-white w-8 text-center",children:rackQty}),a.jsx("button",{onClick:()=>setRackQty(q=>Math.min(SS,q+1)),className:"p-2 rounded-xl border border-gray-700",children:a.jsx(R_,{className:"w-4 h-4"})})]})]}),a.jsx("button",{onClick:bRack,disabled:rackBuying,className:"w-full py-4 bg-primary text-white rounded-2xl font-black uppercase disabled:opacity-40",children:rackBuying?a.jsx(B_,{className:"w-5 h-5 animate-spin mx-auto"}):dn("shop.confirm_buy",{defaultValue:"Confirmar"})})]})}),document.body),'
    )
    fan_portal_anchor = "fanModal&&ks.createPortal"
    if fan_portal_anchor not in text:
        raise SystemExit("fan modal portal not found")
    text = text.replace(fan_portal_anchor, rack_portal + fan_portal_anchor, 1)

    off_fan_buy = "NF=async()=>{if(!fanModal||h)return;try{x(!0);const k=await __bmOfferFanBuy({sku:fanModal.sku,quantity:u});"
    off_rack_buy = (
        "NR=async()=>{if(!rackModal||h)return;try{x(!0);const k=await __bmOfferRackBuy({sku:rackModal.sku,quantity:u});"
        "if(k.data.ok){D.success(e(\"offers.purchase_ok\")),r(),setRackModal(null),w()}}catch(k){D.error(e(\"common.error\"))}finally{x(!1)}},"
        "NF=async()=>{if(!fanModal||h)return;try{x(!0);const k=await __bmOfferFanBuy({sku:fanModal.sku,quantity:u});"
    )
    if off_fan_buy not in text:
        raise SystemExit("offers NF handler not found")
    text = text.replace(off_fan_buy, off_rack_buy, 1)

    off_rack_portal = (
        'rackModal&&ks.createPortal(a.jsx("div",{className:"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md",children:a.jsxs("div",{className:"bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md p-10 space-y-6",children:[a.jsx("h3",{className:"text-2xl font-black text-white text-center",children:e("offers.confirm_title")}),a.jsx("p",{className:"text-center text-gray-400",children:e("racks.mining_rack_name",{defaultValue:"Rack"})}),a.jsxs("p",{className:"text-center text-xl font-black text-white",children:[(Number(rackModal.price)*u).toFixed(2)," ",rackModal.currency]}),a.jsx("button",{onClick:NR,disabled:h,className:"w-full py-4 bg-primary text-white rounded-2xl font-black uppercase disabled:opacity-50",children:e("offers.confirm_payment")})]})}),document.body),'
    )
    # second fanModal portal (offers page)
    idx = text.find("fanModal&&ks.createPortal", text.find("fanModal&&ks.createPortal") + 1)
    if idx < 0:
        raise SystemExit("offers fan portal not found")
    text = text[:idx] + off_rack_portal + text[idx:]

    # --- inventory2: rack credits from visual-placements + place from credit ---
    text = text.replace(
        "[fanCr,setFanCr]=p.useState(0),",
        "[fanCr,setFanCr]=p.useState(0),[rackCr,setRackCr]=p.useState(0),",
    )
    text = text.replace(
        "for(const jt of Or.value.data.rooms)gt[jt.roomNumber]=jt.placements;F(gt)}",
        "for(const jt of Or.value.data.rooms)gt[jt.roomNumber]=jt.placements;F(gt),typeof Or.value.data.rackCredits===\"number\"&&setRackCr(Math.max(0,Or.value.data.rackCredits))}",
    )
    place_from_credit = (
        "placeRackCredit=async Ue=>{if(!je?.unlocked)return;try{const ze=await r8e({roomNumber:je.roomNumber,floorSlot:Ue,fromCredit:!0});"
        "if(ze.data?.ok&&Array.isArray(ze.data.placements)){F(ot=>({...ot,[je.roomNumber]:ze.data.placements})),typeof ze.data.rackCredits===\"number\"&&setRackCr(Math.max(0,ze.data.rackCredits)),D.success(e(\"inventory2.placed\"));return}"
        "D.error(ze.data?.message||e(\"inventory2.place_error\"))}catch(ze){const ot=Mt.isAxiosError(ze)?ze.response?.data?.code:void 0;"
        "D.error(ot===\"RACK_NO_CREDITS\"?e(\"inventory2.rack_no_credits\"):e(\"inventory2.place_error\"))}},"
    )
    text = text.replace(
        "dt=p.useCallback(async(Ue,ze,ot)=>{if(je?.unlocked)try{",
        place_from_credit + "dt=p.useCallback(async(Ue,ze,ot)=>{if(je?.unlocked)try{",
    )
    text = text.replace(
        "onNoStoredRack:()=>D.error(e(\"inventory2.no_stored_rack\"))})",
        "onNoStoredRack:()=>D.error(e(\"inventory2.no_stored_rack\")),rackCredits:rackCr,onPlaceRackFromCredit:Ue=>void placeRackCredit(Ue)})",
    )
    text = text.replace(
        "onNoStoredRack:_}){const{t:N}=ce()",
        "onNoStoredRack:_,rackCredits:rackCredits=0,onPlaceRackFromCredit:placeFromCredit}){const{t:N}=ce()",
    )
    text = text.replace(
        "emptyClick=I=>{w?.type===\"rack\"?(h(w.visualIndex,I),v?.()):w?.type===\"fan\"?b?.():z.length>0?openPicker(I):_?.()}",
        "emptyClick=I=>{w?.type===\"rack\"?(h(w.visualIndex,I),v?.()):w?.type===\"fan\"?b?.():rackCredits>0&&placeFromCredit?placeFromCredit(I):z.length>0?openPicker(I):_?.()}",
    )

    return text


def patch_locale(text: str, lang: str) -> str:
    racks_blob = {
        "pt-BR": (
            'purchase_success_detail:"{{count}} sistema(s) de refrigeração adicionado(s)!"}',
            'purchase_success_detail:"{{count}} sistema(s) de refrigeração adicionado(s)!"},'
            'racks:{mining_rack_name:"Rack",mining_rack_desc:"Prateleira com 8 slots — instale no inventário.",'
            'purchase_success_detail:"{{count}} rack(s) adicionado(s)!"}',
        ),
        "en": (
            'purchase_success_detail:"{{count}} cooling system(s) added!"}',
            'purchase_success_detail:"{{count}} cooling system(s) added!"},'
            'racks:{mining_rack_name:"Rack",mining_rack_desc:"Shelf with 8 slots — install in inventory.",'
            'purchase_success_detail:"{{count}} rack(s) added!"}',
        ),
        "es": (
            'purchase_success_detail:"{{count}} sistema(s) de refrigeración añadido(s)!"}',
            'purchase_success_detail:"{{count}} sistema(s) de refrigeración añadido(s)!"},'
            'racks:{mining_rack_name:"Rack",mining_rack_desc:"Estantería con 8 slots — instálala en el inventario.",'
            'purchase_success_detail:"{{count}} rack(s) añadido(s)!"}',
        ),
    }[lang]
    if racks_blob[0] not in text:
        raise SystemExit(f"{lang} fans blob anchor not found")
    text = text.replace(racks_blob[0], racks_blob[1])

    shop_racks = {
        "pt-BR": ('fan_badge:"Refrigeração"', 'fan_badge:"Refrigeração",racks_section_title:"Racks",racks_section_desc:"Prateleiras extras — instale no inventário.",rack_badge:"Rack"'),
        "en": ('fan_badge:"Cooling"', 'fan_badge:"Cooling",racks_section_title:"Racks",racks_section_desc:"Extra shelves — install in inventory.",rack_badge:"Rack"'),
        "es": ('fan_badge:"Refrigeración"', 'fan_badge:"Refrigeración",racks_section_title:"Racks",racks_section_desc:"Estanterías extra — instálalas en el inventario.",rack_badge:"Rack"'),
    }[lang]
    if shop_racks[0] in text:
        text = text.replace(shop_racks[0], shop_racks[1])
    return text


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")
    patched = patch_bundle(SRC.read_text(encoding="utf-8"))
    DST.write_text(patched, encoding="utf-8")
    print(f"wrote {DST}")

    for lang in ("pt-BR", "en", "es"):
        loc39 = ASSETS / f"{lang}-inv2plus39.js"
        loc40 = ASSETS / f"{lang}-inv2plus{VER}.js"
        loc40.write_text(patch_locale(loc39.read_text(encoding="utf-8"), lang), encoding="utf-8")
        print(f"wrote {loc40}")

    css39 = ASSETS / "index-inv2plus39.css"
    css40 = ASSETS / f"index-inv2plus{VER}.css"
    if css39.is_file():
        shutil.copy2(css39, css40)

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{VER}.css")
    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{VER}")


if __name__ == "__main__":
    main()
