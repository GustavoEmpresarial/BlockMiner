#!/usr/bin/env python3
"""Patch client dist bundle for cooling-fan shop/offers (inv2plus34 → inv2plus35)."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC = ASSETS / "index-inv2plus34.js"
DST = ASSETS / "index-inv2plus37.js"


def patch_index(text: str) -> str:
    if "purchase-fan" in text:
        raise SystemExit("index already patched for fans")

    # Idempotency paths
    text = text.replace(
        '"/shop/purchase","/offer-events/purchase"',
        '"/shop/purchase","/shop/purchase-fan","/offer-events/purchase","/offer-events/purchase-fan"',
    )

    # Fan purchase helpers — __bm* avoids collisions (xLe is ETH regex, oLe/uLe are wallet components)
    text = text.replace(
        'function rLe(e){return G.post("/shop/purchase",e)}',
        'function rLe(e){return G.post("/shop/purchase",e)}function __bmShopFanBuy(e){return G.post("/shop/purchase-fan",e)}',
    )

    # Offers cache + API
    text = text.replace(
        "function __bmWriteOffersCache(e,r){return __bmOffersCache={events:e,roomOffers:r,fetchedAtMs:Date.now()}}",
        "function __bmWriteOffersCache(e,r,fo){return __bmOffersCache={events:e,roomOffers:r,fanOffers:fo??__bmOffersCache?.fanOffers??null,fetchedAtMs:Date.now()}}",
    )
    text = text.replace(
        'function sLe(e){return G.post("/offer-events/purchase",e)}',
        'function sLe(e){return G.post("/offer-events/purchase",e)}function __bmOfferFanBuy(e){return G.post("/offer-events/purchase-fan",e)}',
    )

    # --- Shop page (nLe) ---
    old_nle_state = (
        '[e,t]=p.useState([]),[shopCur,setShopCur]=p.useState("BLK"),[r,n]=p.useState(!0),'
        '[s,i]=p.useState(!1),[l,o]=p.useState(null),[c,u]=p.useState(!1),[f,h]=p.useState(1),{fetchAll:x}=Hr()'
    )
    new_nle_state = (
        '[e,t]=p.useState([]),[shopCur,setShopCur]=p.useState("BLK"),[fans,setFans]=p.useState([]),'
        '[fanSalesAt,setFanSalesAt]=p.useState(null),[fanModal,setFanModal]=p.useState(null),'
        '[fanQty,setFanQty]=p.useState(1),[fanBuying,setFanBuying]=p.useState(!1),'
        '[r,n]=p.useState(!0),[s,i]=p.useState(!1),[l,o]=p.useState(null),[c,u]=p.useState(!1),[f,h]=p.useState(1),{fetchAll:x}=Hr()'
    )
    if old_nle_state not in text:
        raise SystemExit("nLe state hook not found")
    text = text.replace(old_nle_state, new_nle_state)

    old_nle_load = (
        "v.data.ok&&v.data.miners&&(t(v.data.miners),setShopCur(v.data.currency||\"BLK\"))"
    )
    new_nle_load = (
        "v.data.ok&&(v.data.miners&&t(v.data.miners),setShopCur(v.data.currency||\"BLK\"),"
        "Array.isArray(v.data.fans)&&setFans(v.data.fans),v.data.fanSalesAvailableAt&&setFanSalesAt(v.data.fanSalesAvailableAt))"
    )
    if old_nle_load not in text:
        raise SystemExit("nLe load handler not found")
    text = text.replace(old_nle_load, new_nle_load)

    fan_buy_handler = (
        'const y=w=>{if(!w?.id||!Number.isFinite(Number(w?.price))||Number(w.price)<=0){'
        'D.error(dn("shop.invalid_miner",{defaultValue:"Este equipamento não está disponível para compra."}));return}'
        'o(w),h(1),u(!0)},b=async()=>{'
    )
    fan_buy_insert = (
        'const y=w=>{if(!w?.id||!Number.isFinite(Number(w?.price))||Number(w.price)<=0){'
        'D.error(dn("shop.invalid_miner",{defaultValue:"Este equipamento não está disponível para compra."}));return}'
        'o(w),h(1),u(!0)},'
        'bFan=async()=>{if(fanBuying||!fanModal)return;const w=Math.min(SS,Math.max(1,Number(fanQty)||1));'
        'if(!Number.isInteger(w)){D.error(dn("shop.invalid_quantity",{defaultValue:"Quantidade inválida."}));return}'
        'try{setFanBuying(!0);const v=typeof crypto<"u"&&typeof crypto.randomUUID=="function"?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2,11)}`,'
        'N=await __bmShopFanBuy({sku:fanModal.sku,quantity:w,idempotencyKey:v});if(N.data.ok){D.success(dn("fans.purchase_success_detail",{defaultValue:"Ventilador(es) adicionado(s)!",count:w,credits:w})),x(),setFanModal(null)}}'
        'catch(v){const N=St(v)?v.response?.data:void 0,k=N&&typeof N=="object"&&"message"in N&&typeof N.message=="string"?N.message:dn("common.error");D.error(k)}finally{setFanBuying(!1)}},'
        'b=async()=>{'
    )
    if fan_buy_handler not in text:
        raise SystemExit("nLe purchase handler anchor not found")
    text = text.replace(fan_buy_handler, fan_buy_insert)

    fans_section = (
        'fans.length>0&&a.jsxs("section",{className:"space-y-6",children:['
        'a.jsxs("div",{className:"flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-800 pb-4",children:['
        'a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:dn("shop.fans_section_title",{defaultValue:"Ventilação"})}),'
        'fanSalesAt&&a.jsxs("p",{className:"text-xs text-amber-400 font-bold",children:[dn("shop.sales_opens_at",{defaultValue:"Vendas abrem em"})," ",new Date(fanSalesAt).toLocaleString("pt-BR")]})]}),'
        'a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:fans.map(w=>a.jsxs("div",{className:"bg-surface border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-xl",children:['
        'a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-6 border border-gray-800 mb-4 flex items-center justify-center",children:w.imageUrl?a.jsx("img",{src:w.imageUrl,className:"w-full h-full object-contain",alt:dn(w.nameKey,{defaultValue:"Ventilador"})}):null}),'
        'a.jsx("h3",{className:"text-xl font-black text-white",children:dn(w.nameKey,{defaultValue:"Sistema de ventilação"})}),'
        'a.jsx("p",{className:"text-xs text-gray-500 mt-1",children:dn(w.descriptionKey,{defaultValue:"Instale embaixo do rack no inventário."})}),'
        'a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between mt-4",children:['
        'a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency||shopCur||"BLK"]}),'
        'a.jsx("button",{disabled:!w.isPurchaseLive,onClick:()=>{setFanModal(w),setFanQty(1)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:w.isPurchaseLive?dn("shop.buy",{defaultValue:"Comprar"}):dn("offers.coming_soon",{defaultValue:"Em breve"})})]})]},w.sku))})]}),'
    )

    grid_anchor = 'a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6",children:e.map(w=>'
    if grid_anchor not in text:
        raise SystemExit("nLe miners grid not found")
    text = text.replace(grid_anchor, fans_section + grid_anchor, 1)

    fan_modal = (
        ',fanModal&&ks.createPortal(a.jsx("div",{className:"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md",children:a.jsxs("div",{className:"bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md p-10 space-y-6 relative",children:['
        'a.jsx("button",{onClick:()=>setFanModal(null),className:"absolute top-4 right-4 text-gray-500",children:a.jsx(wt,{className:"w-6 h-6"})}),'
        'a.jsx("h3",{className:"text-2xl font-black text-white text-center",children:dn("shop.modal_title",{defaultValue:"Confirmar compra"})}),'
        'a.jsx("p",{className:"text-center text-gray-400",children:dn(fanModal.nameKey,{defaultValue:"Ventilador"})}),'
        'a.jsxs("div",{className:"flex items-center justify-between",children:[a.jsx("span",{className:"text-xs font-bold text-gray-500 uppercase",children:dn("shop.quantity",{defaultValue:"Quantidade"})}),'
        'a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("button",{onClick:()=>setFanQty(w=>Math.max(1,w-1)),className:"px-2 py-1 bg-gray-800 rounded",children:"-"}),'
        'a.jsx("span",{className:"font-black text-white",children:fanQty}),a.jsx("button",{onClick:()=>setFanQty(w=>Math.min(SS,w+1)),className:"px-2 py-1 bg-gray-800 rounded",children:"+"})]})]}),'
        'a.jsxs("p",{className:"text-center text-xl font-black text-white",children:[(Number(fanModal.price)*fanQty).toFixed(2)," ",fanModal.currency||shopCur||"BLK"]}),'
        'a.jsx("button",{onClick:bFan,disabled:fanBuying,className:"w-full py-4 bg-primary text-white rounded-2xl font-black uppercase disabled:opacity-50",children:fanBuying?dn("common.loading",{defaultValue:"Carregando..."}):dn("shop.confirm_payment",{defaultValue:"Confirmar pagamento"})})]})}),document.body)'
    )
    portal_anchor = ",c&&l&&ks.createPortal(a.jsx(\"div\",{className:\"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300\""
    if portal_anchor not in text:
        raise SystemExit("nLe miner modal portal not found")
    text = text.replace(portal_anchor, fan_modal + portal_anchor, 1)

    # --- Offers page (lLe) ---
    old_lle_state = (
        '[n,s]=p.useState(()=>__c?.events??[]),[rOff,setROff]=p.useState(()=>__c?.roomOffers??null),[i,l]=p.useState(()=>__c==null),'
        '[o,c]=p.useState(null),[u,f]=p.useState(1),[h,x]=p.useState(!1),[BR,setBR]=p.useState(!1)'
    )
    new_lle_state = (
        '[n,s]=p.useState(()=>__c?.events??[]),[rOff,setROff]=p.useState(()=>__c?.roomOffers??null),'
        '[fanOff,setFanOff]=p.useState(()=>__c?.fanOffers??null),[fanModal,setFanModal]=p.useState(null),'
        '[i,l]=p.useState(()=>__c==null),[o,c]=p.useState(null),[u,f]=p.useState(1),[h,x]=p.useState(!1),[BR,setBR]=p.useState(!1)'
    )
    if old_lle_state not in text:
        raise SystemExit("lLe state not found")
    text = text.replace(old_lle_state, new_lle_state)

    old_lle_load = (
        'let ro=body.roomOffers??null;if(!replaceRooms&&ro==null){const prev=__bmReadOffersCache()?.roomOffers??null;'
        'if(prev?.isLive&&(prev.rooms?.length??0)>0)ro=prev}s(ev),setROff(ro),__bmWriteOffersCache(ev,ro),hasLoaded.current=!0'
    )
    new_lle_load = (
        'let ro=body.roomOffers??null;let fo=body.fanOffers??null;if(!replaceRooms&&ro==null){const prev=__bmReadOffersCache()?.roomOffers??null;'
        'if(prev?.isLive&&(prev.rooms?.length??0)>0)ro=prev}s(ev),setROff(ro),setFanOff(fo),__bmWriteOffersCache(ev,ro,fo),hasLoaded.current=!0'
    )
    if old_lle_load not in text:
        raise SystemExit("lLe load not found")
    text = text.replace(old_lle_load, new_lle_load)

    text = text.replace(
        '__bmOffersCache=null,s([]),setROff(null),l(!1)',
        '__bmOffersCache=null,s([]),setROff(null),setFanOff(null),l(!1)',
    )

    fan_offer_confirm = (
        'NF=async()=>{if(!fanModal||h)return;try{x(!0);const k=await __bmOfferFanBuy({sku:fanModal.sku,quantity:u});'
        'if(k.data.ok){D.success(e("offers.purchase_ok")),r(),setFanModal(null),w()}}catch(k){D.error(e("common.error"))}finally{x(!1)}},'
    )
    confirm_buy_anchor = 'N=async()=>{if(!(!o?.miner||h))try{x(!0);const k=await sLe({eventMinerId:o.miner.id,quantity:u});'
    if confirm_buy_anchor not in text:
        raise SystemExit("lLe purchase handler not found")
    text = text.replace(confirm_buy_anchor, fan_offer_confirm + confirm_buy_anchor)

    fan_offers_ui = (
        'fanOff?.isLive&&(fanOff.items?.length??0)>0&&a.jsxs("div",{className:"space-y-6",children:['
        'a.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-800",children:['
        'a.jsxs("div",{className:"flex items-center gap-3",children:[a.jsx("span",{className:"px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[9px] font-black text-cyan-300 uppercase",children:fanOff.isPurchaseLive?e("offers.live"):e("offers.coming_soon")}),'
        'a.jsx("h2",{className:"text-xl font-black text-white uppercase italic",children:fanOff.title})]}),'
        'fanOff.salesAvailableAt&&a.jsx("span",{className:"text-xs text-gray-500",children:$y(fanOff.salesAvailableAt,t)})]}),'
        'fanOff.description&&a.jsx("p",{className:"text-sm text-gray-500",children:fanOff.description}),'
        'a.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6",children:(fanOff.items||[]).map(w=>a.jsxs("div",{className:"bg-surface border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-xl",children:['
        'a.jsx("div",{className:"aspect-square bg-gray-900/50 rounded-3xl p-4 border border-gray-800 flex items-center justify-center mb-4",children:w.imageUrl?a.jsx("img",{src:w.imageUrl,className:"w-full h-full object-contain",alt:e(w.nameKey)}):null}),'
        'a.jsx("h3",{className:"text-xl font-black text-white",children:e(w.nameKey)}),a.jsx("p",{className:"text-xs text-gray-500",children:e(w.descriptionKey)}),'
        'a.jsxs("div",{className:"pt-4 border-t border-gray-800/50 flex items-center justify-between mt-4",children:['
        'a.jsxs("div",{children:[w.listPrice>w.price&&a.jsxs("span",{className:"text-sm text-gray-500 line-through mr-2",children:[w.listPrice," ",w.currency]}),'
        'a.jsxs("span",{className:"text-lg font-black text-white italic",children:[w.price," ",w.currency]})]}),'
        'a.jsx("button",{disabled:!fanOff.isPurchaseLive||!w.isPurchaseLive||h,onClick:()=>{f(1),setFanModal(w)},className:"px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase disabled:opacity-40",children:fanOff.isPurchaseLive?e("offers.buy"):e("offers.coming_soon")})]})]},w.sku))})]}),'
    )

    room_anchor = 'rOff?.isLive&&(rOff.rooms?.length??0)>0&&a.jsxs("div",{className:"space-y-6",children:['
    if room_anchor not in text:
        raise SystemExit("lLe room offers section not found")
    text = text.replace(room_anchor, fan_offers_ui + room_anchor, 1)

    text = text.replace(
        'n.length===0&&!(rOff?.isLive&&(rOff.rooms?.length??0)>0)&&a.jsx("div",{className:"rounded-3xl border border-dashed border-gray-800 p-16 text-center text-gray-500",children:e("offers.empty")})',
        'n.length===0&&!(rOff?.isLive&&(rOff.rooms?.length??0)>0)&&!(fanOff?.isLive&&(fanOff.items?.length??0)>0)&&a.jsx("div",{className:"rounded-3xl border border-dashed border-gray-800 p-16 text-center text-gray-500",children:e("offers.empty")})',
    )

    fan_offer_modal = (
        ',fanModal&&ks.createPortal(a.jsx("div",{className:"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md",children:a.jsxs("div",{className:"bg-surface border border-gray-800 rounded-[3rem] w-full max-w-md p-10 space-y-6",children:['
        'a.jsx("h3",{className:"text-2xl font-black text-white text-center",children:e("offers.confirm_title")}),'
        'a.jsx("p",{className:"text-center text-gray-400",children:e(fanModal.nameKey)}),'
        'a.jsxs("p",{className:"text-center text-xl font-black text-white",children:[(Number(fanModal.price)*u).toFixed(2)," ",fanModal.currency]}),'
        'a.jsx("button",{onClick:NF,disabled:h,className:"w-full py-4 bg-primary text-white rounded-2xl font-black uppercase disabled:opacity-50",children:e("offers.confirm_payment")})]})}),document.body)'
    )
    offer_portal = ',o&&ks.createPortal(a.jsx("div",{className:"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300"'
    if offer_portal not in text:
        raise SystemExit("lLe modal portal not found")
    text = text.replace(offer_portal, fan_offer_modal + offer_portal, 1)

    # --- Inventory2 fan credits ---
    text = text.replace(
        "[$,F]=p.useState({}),[K,B]=p.useState({}),[O,L]=p.useState(null)",
        "[$,F]=p.useState({}),[K,B]=p.useState({}),[fanCr,setFanCr]=p.useState(0),[O,L]=p.useState(null)",
    )
    text = text.replace(
        "for(const jt of Ar.value.data.rooms)gt[jt.roomNumber]=jt.mounted;B(gt)}",
        "for(const jt of Ar.value.data.rooms)gt[jt.roomNumber]=jt.mounted;B(gt),typeof Ar.value.data.fanCredits===\"number\"&&setFanCr(Math.max(0,Ar.value.data.fanCredits))}",
    )
    text = text.replace(
        "At=Math.max(0,Ke.length-bt.length)",
        "At=fanCr",
    )
    text = text.replace(
        'if(ot.data?.ok&&Array.isArray(ot.data.mounted)){$t(ot.data.mounted),D.success(e("inventory2.fan_mounted"));return}',
        'if(ot.data?.ok&&Array.isArray(ot.data.mounted)){$t(ot.data.mounted),typeof ot.data.fanCredits==="number"&&setFanCr(Math.max(0,ot.data.fanCredits)),D.success(e("inventory2.fan_mounted"));return}',
    )
    text = text.replace(
        'D.error(xt==="FAN_NEED_RACK"?e("inventory2.fan_need_rack"):Ae(ot,e("inventory2.fan_error")))',
        'D.error(xt==="FAN_NEED_RACK"?e("inventory2.fan_need_rack"):xt==="FAN_NO_CREDITS"?e("inventory2.fan_no_credits",{defaultValue:"Sem ventiladores disponíveis."}):Ae(ot,e("inventory2.fan_error")))',
    )
    # unmount fan
    text = text.replace(
        'if(ze.data?.ok&&Array.isArray(ze.data.mounted)){$t(ze.data.mounted),D.success(e("inventory2.fan_stored"));return}',
        'if(ze.data?.ok&&Array.isArray(ze.data.mounted)){$t(ze.data.mounted),typeof ze.data.fanCredits==="number"&&setFanCr(Math.max(0,ze.data.fanCredits)),D.success(e("inventory2.fan_stored"));return}',
    )

    return text


def patch_locale(text: str, lang: str) -> str:
    if "fans_section_title" in text:
        return text

    shop_patch = {
        "pt-BR": (
            'currency:"BLK",purchase_error:"Erro ao processar a compra."}}',
            'currency:"BLK",purchase_error:"Erro ao processar a compra.",fans_section_title:"Ventilação",'
            'fans_section_desc:"Sistemas de refrigeração para racks.",miners_section_title:"Mineradoras",'
            'fan_badge:"Refrigeração",sales_opens_at:"Vendas abrem em"}}',
        ),
        "en": (
            'insufficient_balance:"Insufficient BLK balance.",purchase_error:"Error processing the purchase."}}',
            'insufficient_balance:"Insufficient BLK balance.",purchase_error:"Error processing the purchase.",'
            'fans_section_title:"Cooling",fans_section_desc:"Cooling systems for racks.",miners_section_title:"Miners",'
            'fan_badge:"Cooling",sales_opens_at:"Sales open on"}}',
        ),
        "es": (
            'insufficient_balance:"Saldo BLK insuficiente.",currency:"BLK",purchase_error:"Error al procesar la compra."}}',
            'insufficient_balance:"Saldo BLK insuficiente.",currency:"BLK",purchase_error:"Error al procesar la compra.",'
            'fans_section_title:"Ventilación",fans_section_desc:"Sistemas de refrigeración para racks.",miners_section_title:"Miners",'
            'fan_badge:"Refrigeración",sales_opens_at:"Ventas abren el"}}',
        ),
    }[lang]

    if shop_patch[0] not in text:
        raise SystemExit(f"{lang} shop locale anchor not found")
    text = text.replace(shop_patch[0], shop_patch[1])

    inv_patch = {
        "pt-BR": (
            'fan_error:"Não foi possível mover o ventilador."',
            'fan_error:"Não foi possível mover o ventilador.",fan_no_credits:"Você não tem ventiladores disponíveis. Compre na loja ou ofertas."',
        ),
        "en": (
            'fan_error:"Could not move the fan."',
            'fan_error:"Could not move the fan.",fan_no_credits:"You have no fans available. Buy them in the shop or offers."',
        ),
        "es": (
            'fan_error:"Could not move the fan."',
            'fan_error:"No se pudo mover el ventilador.",fan_no_credits:"No tienes ventiladores disponibles. Cómpralos en la tienda u ofertas."',
        ),
    }[lang]
    if inv_patch[0] in text:
        text = text.replace(inv_patch[0], inv_patch[1])

    fans_blob = {
        "pt-BR": (
            ',shop:T,',
            ',fans:{cooling_fan_name:"Ventilador",cooling_fan_desc:"Unidade para um rack.",'
            'cooling_fan_system_name:"Sistema de ventilação",cooling_fan_system_desc:"Bandeja com 3 ventiladores.",'
            'purchase_success_detail:"{{count}} ventilador(es) adicionado(s)!"},shop:T,',
        ),
        "en": (
            ',shop:R,',
            ',fans:{cooling_fan_name:"Cooling fan",cooling_fan_desc:"Unit for one rack.",'
            'cooling_fan_system_name:"Cooling fan system",cooling_fan_system_desc:"Tray with 3 fans.",'
            'purchase_success_detail:"{{count}} fan unit(s) added!"},shop:R,',
        ),
        "es": (
            ',shop:E,',
            ',fans:{cooling_fan_name:"Ventilador",cooling_fan_desc:"Unidad para un rack.",'
            'cooling_fan_system_name:"Sistema de ventilación",cooling_fan_system_desc:"Bandeja con 3 ventiladores.",'
            'purchase_success_detail:"{{count}} ventilador(es) añadido(s)!"},shop:E,',
        ),
    }[lang]
    if fans_blob[0] not in text:
        raise SystemExit(f"{lang} shop export anchor not found")
    text = text.replace(fans_blob[0], fans_blob[1])

    return text


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")

    if DST.is_file():
        DST.unlink()
        print(f"removed stale {DST}")

    patched = patch_index(SRC.read_text(encoding="utf-8"))
    DST.write_text(patched, encoding="utf-8")
    print(f"wrote {DST} ({len(patched)} bytes)")

    for lang in ("pt-BR", "en", "es"):
        loc_src = ASSETS / f"{lang}-inv2plus34.js"
        loc_dst = ASSETS / f"{lang}-inv2plus37.js"
        if not loc_src.is_file():
            print(f"skip locale {lang} (missing)")
            continue
        loc_dst.write_text(patch_locale(loc_src.read_text(encoding="utf-8"), lang), encoding="utf-8")
        print(f"wrote {loc_dst}")

    css_src = ASSETS / "index-inv2plus34.css"
    css_dst = ASSETS / "index-inv2plus37.css"
    if css_src.is_file():
        shutil.copy2(css_src, css_dst)
        print(f"copied {css_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    html_text = html_text.replace("index-inv2plus34.js", "index-inv2plus37.js")
    html_text = html_text.replace("index-inv2plus35.js", "index-inv2plus37.js")
    html_text = html_text.replace("index-inv2plus36.js", "index-inv2plus37.js")
    html_text = html_text.replace("index-inv2plus34.css", "index-inv2plus37.css")
    html_text = html_text.replace("index-inv2plus35.css", "index-inv2plus37.css")
    html_text = html_text.replace("index-inv2plus36.css", "index-inv2plus37.css")
    html.write_text(html_text, encoding="utf-8")
    print("updated index.html → inv2plus37")


if __name__ == "__main__":
    main()
