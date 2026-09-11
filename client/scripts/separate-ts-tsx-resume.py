#!/usr/bin/env python3
"""Resume/finish feature ts/tsx separation after partial run."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

FEATURES = Path("/home/gustavo/Documentos/BlockMiner2.1/current/client/src/features")
SRC = Path("/home/gustavo/Documentos/BlockMiner2.1/current/client/src")

KEEP_TSX_NAMES = {"ProtectedLayout.tsx", "AdminLayout.tsx"}

IMPORT_RE = re.compile(
    r"""(?P<prefix>(?:import|export)\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+|))(?P<q>['"])(?P<spec>\.[^'"]+)(?P=q)"""
)
SIDE_IMPORT_RE = re.compile(
    r"""(?P<prefix>import\s*\(\s*|import\s+)(?P<q>['"])(?P<spec>\.[^'"]+)(?P=q)"""
)


def is_page_tsx(name: str) -> bool:
    return name.endswith("Page.tsx")


def should_keep_root_tsx(name: str) -> bool:
    return is_page_tsx(name) or name in KEEP_TSX_NAMES


def rel_import(from_file: Path, to_file: Path) -> str:
    target = to_file
    if target.suffix in {".ts", ".tsx", ".js", ".jsx"} and not target.name.endswith(".d.ts"):
        target = target.with_suffix("")
    rel = os.path.relpath(target, start=from_file.parent).replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel


def main() -> None:
    mapping: dict[Path, Path] = {}  # old abs -> new abs

    # 1) Remove conflicting re-export stub
    stub = FEATURES / "games" / "gameCooldownStore.ts"
    if stub.exists():
        text = stub.read_text(encoding="utf-8")
        if "from './lib/gameCooldownStore'" in text or 'from "./lib/gameCooldownStore"' in text:
            stub.unlink()
            print("removed games/gameCooldownStore.ts re-export stub")

    # 2) Infer mapping for already-moved files (feat/lib/X was feat/X, feat/components/X was feat/X)
    for feat in FEATURES.iterdir():
        if not feat.is_dir():
            continue
        for folder in ("lib", "components"):
            d = feat / folder
            if not d.is_dir():
                continue
            for f in d.iterdir():
                if not f.is_file() or f.suffix not in {".ts", ".tsx"}:
                    continue
                old = (feat / f.name).resolve()
                # Only treat as moved-from-root if we believe it came from root
                # (old path shouldn't still exist)
                if not (feat / f.name).exists():
                    mapping[old] = f.resolve()

    # Also infer for special subdirs already partially moved? none yet for arenas etc.

    # 3) Plan and apply remaining root moves
    moves: list[tuple[Path, Path]] = []
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        lib = feat / "lib"
        components = feat / "components"
        for f in sorted(feat.iterdir()):
            if not f.is_file() or f.suffix not in {".ts", ".tsx"}:
                continue
            if f.name == "index.ts":
                continue
            if f.suffix == ".ts":
                dst = lib / f.name
                if dst.exists():
                    print(f"SKIP conflict {f} -> {dst}")
                    continue
                moves.append((f, dst))
            elif f.suffix == ".tsx" and not should_keep_root_tsx(f.name):
                dst = components / f.name
                if dst.exists():
                    print(f"SKIP conflict {f} -> {dst}")
                    continue
                moves.append((f, dst))

    # Special subdirs
    def plan_subdir_split(subdir: Path) -> None:
        if not subdir.is_dir():
            return
        files = [f for f in subdir.iterdir() if f.is_file() and f.suffix in {".ts", ".tsx"}]
        has_ts = any(f.suffix == ".ts" and f.name != "index.ts" for f in files)
        has_tsx = any(f.suffix == ".tsx" for f in files)
        if not (has_ts and has_tsx):
            return
        lib = subdir / "lib"
        components = subdir / "components"
        for f in files:
            if f.name == "index.ts":
                continue
            if f.suffix == ".ts":
                dst = lib / f.name
                if not dst.exists():
                    moves.append((f, dst))
            elif f.suffix == ".tsx" and not is_page_tsx(f.name):
                dst = components / f.name
                if not dst.exists():
                    moves.append((f, dst))

    plan_subdir_split(FEATURES / "games" / "arenas")
    plan_subdir_split(FEATURES / "games" / "game-2048")

    gsession = FEATURES / "games" / "gameSession"
    if gsession.is_dir():
        lib = gsession / "lib"
        for f in sorted(gsession.iterdir()):
            if f.is_file() and f.suffix == ".ts" and f.name != "index.ts":
                dst = lib / f.name
                if not dst.exists():
                    moves.append((f, dst))
            elif f.is_file() and f.suffix == ".tsx":
                dst = gsession / "components" / f.name
                if not dst.exists():
                    moves.append((f, dst))

    # Extra one-level subdirs that mix (excluding lib/components)
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        for sub in sorted(feat.iterdir()):
            if not sub.is_dir() or sub.name in {"lib", "components", "node_modules"}:
                continue
            if sub in {
                FEATURES / "games" / "arenas",
                FEATURES / "games" / "game-2048",
                FEATURES / "games" / "gameSession",
            }:
                continue
            plan_subdir_split(sub)

    print(f"Applying {len(moves)} remaining moves")
    for src, dst in moves:
        dst.parent.mkdir(parents=True, exist_ok=True)
        old = src.resolve()
        shutil.move(str(src), str(dst))
        mapping[old] = dst.resolve()
        print(f"  MOVE {src.relative_to(FEATURES)} -> {dst.relative_to(FEATURES)}")

    # 4) Rewrite imports
    inverse = {new: old for old, new in mapping.items()}
    changed = 0

    def rewrite_spec(importer_new: Path, importer_old: Path, spec: str) -> str | None:
        if not spec.startswith("."):
            return None
        old_base = importer_old.parent / spec
        old_candidates = [
            Path(str(old_base) + ".ts").resolve(),
            Path(str(old_base) + ".tsx").resolve(),
            Path(str(old_base) + ".js").resolve(),
            Path(str(old_base) + ".jsx").resolve(),
            old_base.resolve(),
            (Path(str(old_base)) / "index.ts").resolve(),
            (Path(str(old_base)) / "index.tsx").resolve(),
        ]
        old_target = None
        for cand in old_candidates:
            if cand in mapping:
                old_target = cand
                break
        if old_target is None:
            for cand in old_candidates:
                if cand.exists() and cand.is_file():
                    old_target = cand
                    break
                if cand.name.startswith("index.") and cand.exists():
                    old_target = cand
                    break
        if old_target is None:
            return None
        new_target = mapping.get(old_target, old_target)
        new_spec = rel_import(importer_new, new_target)
        return new_spec if new_spec != spec else None

    for path in SRC.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        if "node_modules" in path.parts:
            continue
        path_r = path.resolve()
        old_importer = inverse.get(path_r, path_r)
        text = path.read_text(encoding="utf-8")
        orig = text

        def make_repl(m: re.Match[str]) -> str:
            spec = m.group("spec")
            new_spec = rewrite_spec(path_r, old_importer, spec)
            if not new_spec:
                return m.group(0)
            return f"{m.group('prefix')}{m.group('q')}{new_spec}{m.group('q')}"

        text2 = IMPORT_RE.sub(make_repl, text)
        text2 = SIDE_IMPORT_RE.sub(make_repl, text2)
        if text2 != orig:
            path.write_text(text2, encoding="utf-8")
            changed += 1
            print(f"  REWRITE {path.relative_to(SRC)}")

    print(f"rewrote {changed} files")

    # 5) Fix barrels
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        idx = feat / "index.ts"
        if not idx.exists():
            continue
        text = idx.read_text(encoding="utf-8")
        orig = text

        def fix_barrel_spec(spec: str) -> str:
            if not spec.startswith("."):
                return spec
            # Resolve from index against mapping / filesystem
            base = feat
            # strip leading ./
            clean = spec[2:] if spec.startswith("./") else spec
            # try as-is
            for folder in ("", "components", "lib"):
                root = base / folder if folder else base
                for ext in (".tsx", ".ts"):
                    # clean may be "Sidebar" or "components/Sidebar" or "game-2048/Game2048Page"
                    cand = (root / clean).with_suffix("") if False else None
                    p = root / clean
                    # if clean has no ext
                    for e in (".tsx", ".ts", ""):
                        trial = Path(str(p) + e) if e else p
                        if trial.is_file():
                            return rel_import(idx, trial)
                    if (p / "index.ts").is_file():
                        return rel_import(idx, p / "index.ts")
                    if (p / "index.tsx").is_file():
                        return rel_import(idx, p / "index.tsx")
            # bare name → components then lib
            name = Path(clean).name
            for folder in ("components", "lib", ""):
                root = base / folder if folder else base
                for ext in (".tsx", ".ts"):
                    trial = root / f"{name}{ext}"
                    if trial.is_file():
                        return rel_import(idx, trial)
            return spec

        def repl(m: re.Match[str]) -> str:
            spec = m.group("spec")
            new_spec = fix_barrel_spec(spec)
            return f"{m.group('prefix')}{m.group('q')}{new_spec}{m.group('q')}"

        text2 = IMPORT_RE.sub(repl, text)
        if text2 != orig:
            idx.write_text(text2, encoding="utf-8")
            print(f"  BARREL {feat.name}/index.ts")

    print("done")


if __name__ == "__main__":
    main()
