#!/usr/bin/env python3
"""Bump SPA bundle to inv2plus44 — fix inventário → Minhas Máquinas refresh."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "dist" / "assets"
SRC_VER = "43"
DST_VER = "44"

# Route /inventory → Inventory2Page (C8e) instead of legacy MachinesPage (w8e).
ROUTE_OLD = 'path:"/inventory",element:a.jsx(w8e,{})'
ROUTE_NEW = 'path:"/inventory",element:a.jsx(C8e,{})'

# InventarioPage (eLe): notify Minhas Máquinas after machine collect.
# Full ternary replacement — must close the `? (` group with `))` before `:`.
COLLECT_OLD = (
    'rewardType==="machine"?D.success(e("inventario.collected_machine_toast"),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}}):'
    'D.success(e("inventario.collected_toast")'
)
COLLECT_NEW = (
    'rewardType==="machine"?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collected_machine_toast"),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}})):'
    'D.success(e("inventario.collected_toast")'
)
COLLECT_ALL_OLD = (
    'machines>0?D.success(e("inventario.collect_all_machines_toast",{count:T,machines}),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}}):'
    'D.success(e("inventario.collect_all_toast",{count:T})'
)
COLLECT_ALL_NEW = (
    'machines>0?(window.dispatchEvent(new CustomEvent("bm-inventory-changed")),'
    'D.success(e("inventario.collect_all_machines_toast",{count:T,machines}),'
    '{action:{label:e("inventario.go_to_machines"),onClick:()=>t("/inventory")}})):'
    'D.success(e("inventario.collect_all_toast",{count:T})'
)

# Inventory2Page (C8e): socket + custom-event refresh after mount fetch.
C8E_MOUNT_OLD = "p.useEffect(()=>(se(),()=>{U.current?.abort()}),[se]);"
C8E_MOUNT_NEW = (
    "const inv2SockInit=Hr(pe=>pe.initSocket),inv2Sock=Hr(pe=>pe.socket),"
    "inv2DebRef=p.useRef(null),inv2Sched=p.useCallback(()=>{"
    "inv2DebRef.current!=null||(inv2DebRef.current=window.setTimeout(()=>{"
    "inv2DebRef.current=null,se({background:!0})},160))},[se]);"
    "p.useEffect(()=>(inv2SockInit(),se(),()=>{U.current?.abort(),"
    "inv2DebRef.current!=null&&(clearTimeout(inv2DebRef.current),inv2DebRef.current=null)}),[se,inv2SockInit]),"
    "p.useEffect(()=>{if(!inv2Sock)return;const pe=()=>inv2Sched();"
    "return inv2Sock.on('inventory:update',pe),inv2Sock.on('machines:update',pe),"
    "()=>{inv2Sock.off('inventory:update',pe),inv2Sock.off('machines:update',pe)}},[inv2Sock,inv2Sched]),"
    "p.useEffect(()=>{const pe=()=>inv2Sched();"
    "return window.addEventListener('bm-inventory-changed',pe),"
    "()=>window.removeEventListener('bm-inventory-changed',pe)},[inv2Sched]);"
)


def patch_index(text: str) -> str:
    if ROUTE_OLD not in text:
        raise SystemExit(f"missing route patch anchor: {ROUTE_OLD[:60]}...")
    text = text.replace(ROUTE_OLD, ROUTE_NEW, 1)
    if COLLECT_OLD not in text:
        raise SystemExit("missing inventario collect patch anchor")
    text = text.replace(COLLECT_OLD, COLLECT_NEW, 1)
    if COLLECT_ALL_OLD not in text:
        raise SystemExit("missing inventario collect-all patch anchor")
    text = text.replace(COLLECT_ALL_OLD, COLLECT_ALL_NEW, 1)
    if C8E_MOUNT_OLD not in text:
        raise SystemExit("missing Inventory2Page mount patch anchor")
    text = text.replace(C8E_MOUNT_OLD, C8E_MOUNT_NEW, 1)
    return text


def main() -> None:
    src_index = ASSETS / f"index-inv2plus{SRC_VER}.js"
    dst_index = ASSETS / f"index-inv2plus{DST_VER}.js"
    if not src_index.is_file():
        raise SystemExit(f"missing {src_index}")

    text = src_index.read_text(encoding="utf-8")
    text = text.replace(f"inv2plus{SRC_VER}.js", f"inv2plus{DST_VER}.js")
    text = text.replace("inv2plus43.js", f"inv2plus{DST_VER}.js")
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
        if not loc_src.is_file():
            loc_src = ASSETS / f"{lang}-inv2plus40.js"
        loc_dst = ASSETS / f"{lang}-inv2plus{DST_VER}.js"
        if loc_src.is_file():
            text_loc = loc_src.read_text(encoding="utf-8")
            if f"inv2plus{DST_VER}" not in text_loc:
                text_loc = text_loc.replace(f"inv2plus{SRC_VER}", f"inv2plus{DST_VER}")
                text_loc = text_loc.replace("inv2plus43", f"inv2plus{DST_VER}")
            loc_dst.write_text(text_loc, encoding="utf-8")
            print(f"wrote {loc_dst}")

    html = ROOT / "client" / "dist" / "index.html"
    html_text = html.read_text(encoding="utf-8")
    for old in ("34", "35", "36", "37", "38", "39", "40", "41", "42", "43"):
        html_text = html_text.replace(f"index-inv2plus{old}.js", f"index-inv2plus{DST_VER}.js")
        html_text = html_text.replace(f"index-inv2plus{old}.css", f"index-inv2plus{DST_VER}.css")

    enhance_tag = f'<script type="module" src="/assets/transparency-enhance-inv2plus43.js"></script>'
    if enhance_tag not in html_text:
        enhance_tag43 = enhance_tag
        if enhance_tag43 in html_text:
            pass
        else:
            alt = '<script type="module" src="/assets/transparency-enhance-inv2plus42.js"></script>'
            if alt in html_text:
                html_text = html_text.replace(alt, enhance_tag)

    html.write_text(html_text, encoding="utf-8")
    print(f"updated index.html → inv2plus{DST_VER}")


if __name__ == "__main__":
    main()
