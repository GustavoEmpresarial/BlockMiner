#!/usr/bin/env python3
"""
Delete unreachable / obsolete client SPA assets.

Keeps only the module graph reachable from client/dist/index.html (scripts,
styles, recursive JS imports). Also scrubs stale copies under client/public/assets.

Dry-run by default:

  python3 scripts/purge-spa-orphans.py
  python3 scripts/purge-spa-orphans.py --apply
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "client" / "dist"
ASSETS = DIST / "assets"
HTML = DIST / "index.html"
PUBLIC_ASSETS = ROOT / "client" / "public" / "assets"

IMPORT_RE = re.compile(
    r"""(?:import\s*\(\s*["']([^"']+)["']\s*\)|from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|/assets/([\w.@/-]+\.(?:js|css|mjs)))"""
)

# Vite entry often embeds a modulepreload manifest as plain string paths
# (e.g. "assets/index-Cz7Qjy_M.js") that import() does not rewrite.
MANIFEST_ASSET_RE = re.compile(
    r"""["'](?:\.?/)?assets/([\w.@/-]+\.(?:js|css|mjs))["']"""
)

# Optional one-generation compat keep (e.g. SPA_COMPAT_KEEP=inv2plus115).
# When unset/empty, only the HTML-reachable Vite graph is retained.


def resolve_ref(ref: str, from_file: Path | None) -> Path | None:
    ref = ref.split("?")[0].strip()
    if not ref:
        return None
    if ref.startswith("/assets/"):
        return ASSETS / ref[len("/assets/") :]
    if ref.startswith("./") or ref.startswith("../"):
        if from_file is None:
            return None
        return (from_file.parent / ref).resolve()
    if "/" not in ref and ref.endswith((".js", ".css", ".mjs")):
        return ASSETS / ref
    return None


def under_assets(p: Path) -> bool:
    try:
        p = p.resolve()
        assets = ASSETS.resolve()
        return p == assets or assets in p.parents
    except Exception:
        return False


def html_entry_refs(html_text: str) -> set[Path]:
    out: set[Path] = set()
    for m in re.finditer(r"""(?:src|href)=["'](/assets/[^"']+)["']""", html_text):
        p = resolve_ref(m.group(1), None)
        if p and p.is_file():
            out.add(p.resolve())
    for m in re.finditer(r"""["'](/assets/[^"']+\.(?:js|css))["']""", html_text):
        p = resolve_ref(m.group(1), None)
        if p and p.is_file():
            out.add(p.resolve())
    return out


def js_refs(path: Path) -> set[Path]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    found: set[Path] = set()
    for m in IMPORT_RE.finditer(text):
        ref = next((g for g in m.groups() if g), None)
        if not ref:
            continue
        if ref.startswith(("http://", "https://", "data:", "blob:")):
            continue
        # group 4 is filename after /assets/
        if m.group(4) == ref:
            p = resolve_ref(f"/assets/{ref}", path)
        else:
            p = resolve_ref(ref, path)
        if p is None:
            continue
        try:
            p = p.resolve()
        except Exception:
            continue
        if p.is_file() and under_assets(p):
            found.add(p)
    for m in MANIFEST_ASSET_RE.finditer(text):
        p = resolve_ref(f"/assets/{m.group(1)}", path)
        if p is None:
            continue
        try:
            p = p.resolve()
        except Exception:
            continue
        if p.is_file() and under_assets(p):
            found.add(p)
    return found


def reachable() -> set[Path]:
    if not HTML.is_file():
        raise SystemExit(f"missing {HTML}")
    html = HTML.read_text(encoding="utf-8")
    # Seeds = ONLY what HTML actually loads (no "keep every site-integrity-v*").
    seeds = html_entry_refs(html)

    seen: set[Path] = set()
    q: deque[Path] = deque(seeds)
    while q:
        cur = q.popleft()
        if cur in seen:
            continue
        seen.add(cur)
        if cur.suffix.lower() in {".js", ".mjs"}:
            for nxt in js_refs(cur):
                if nxt not in seen:
                    q.append(nxt)
    return seen


def public_orphans(keep_names: set[str]) -> list[Path]:
    if not PUBLIC_ASSETS.is_dir():
        return []
    out: list[Path] = []
    for p in PUBLIC_ASSETS.rglob("*"):
        if not p.is_file():
            continue
        # Keep if same basename is still part of the live SPA graph / HTML.
        if p.name in keep_names:
            continue
        out.append(p)
    return sorted(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Actually delete orphans")
    args = ap.parse_args()

    keep = reachable()
    all_files = {p.resolve() for p in ASSETS.rglob("*") if p.is_file()}
    compat = (os.environ.get("SPA_COMPAT_KEEP") or "").strip()
    if compat:
        # Keep one cached generation (e.g. inv2plus115) until SPA_COMPAT_KEEP is cleared.
        for p in ASSETS.iterdir():
            if p.is_file() and compat in p.name:
                keep.add(p.resolve())
    orphans = sorted(all_files - keep, key=lambda p: str(p))

    # Safety: never delete live HTML refs even if the graph walker missed them
    html = HTML.read_text(encoding="utf-8")
    for m in re.finditer(
        r"/assets/([\w.@/-]+\.(?:js|css|mjs))",
        html,
    ):
        name = Path(m.group(1)).name
        p = (ASSETS / name).resolve()
        if p in orphans:
            orphans.remove(p)
            keep.add(p)

    keep_names = {p.name for p in keep}
    pub_orphans = public_orphans(keep_names)

    print(f"reachable: {len(keep)}")
    print(f"dist orphans: {len(orphans)}")
    print(f"public/assets orphans: {len(pub_orphans)}")
    print(f"SPA_COMPAT_KEEP: {compat or 'off'}")

    # Highlight noisy families
    for label, rx in [
        ("site-integrity", r"^site-integrity-"),
        ("client-error-collector", r"^client-error-collector-"),
        ("index-inv2plus", r"^index-inv2plus\d+"),
        ("Tab/StatCard old", r"(Tab|StatCard|PeriodPills)-"),
    ]:
        hits = [p.name for p in orphans if re.search(rx, p.name)]
        if hits:
            print(f"  {label}: {len(hits)} (e.g. {hits[:5]})")

    for p in pub_orphans:
        print(f"  public: {p.relative_to(ROOT)}")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to delete.")
        return 0

    deleted = 0
    bytes_freed = 0
    for p in [*orphans, *pub_orphans]:
        try:
            bytes_freed += p.stat().st_size
            p.unlink()
            deleted += 1
        except OSError as e:
            print(f"fail {p}: {e}", file=sys.stderr)
    print(f"deleted {deleted} files ({bytes_freed / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
