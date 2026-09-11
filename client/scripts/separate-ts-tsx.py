#!/usr/bin/env python3
"""
Separate .ts / .tsx within current/client/src/features per convention:

  features/<name>/
    index.ts
    *Page.tsx (+ ProtectedLayout / AdminLayout)
    components/   # other .tsx
    lib/          # other .ts

Also cleans mixed subfolders: games/arenas, games/game-2048, games/gameSession.
"""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

FEATURES = Path("/home/gustavo/Documentos/BlockMiner2.1/current/client/src/features")
SRC = Path("/home/gustavo/Documentos/BlockMiner2.1/current/client/src")

# Root-level .tsx that stay at feature root (not moved to components/)
KEEP_TSX_NAMES = {
    "ProtectedLayout.tsx",
    "AdminLayout.tsx",
}

IMPORT_RE = re.compile(
    r"""(?P<prefix>(?:import|export)\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+|))(?P<q>['"])(?P<spec>\.[^'"]+)(?P=q)"""
)
# Also: dynamic import("...") and side-effect import "..."
SIDE_IMPORT_RE = re.compile(
    r"""(?P<prefix>import\s*\(\s*|import\s+)(?P<q>['"])(?P<spec>\.[^'"]+)(?P=q)"""
)


def is_page_tsx(name: str) -> bool:
    return name.endswith("Page.tsx")


def should_keep_root_tsx(name: str) -> bool:
    return is_page_tsx(name) or name in KEEP_TSX_NAMES


def rel_import(from_file: Path, to_file: Path) -> str:
    """Relative import path without extension, POSIX, always starts with ./ or ../"""
    # Strip known extensions for import target
    target = to_file
    for ext in (".tsx", ".ts", ".jsx", ".js"):
        if target.name.endswith(ext) and not target.name.endswith(".d.ts"):
            # keep .d.ts as-is conceptually but we don't import with ext
            break
    # For module path, drop .ts/.tsx
    stem_path = target
    if stem_path.suffix in {".ts", ".tsx", ".js", ".jsx"} and not stem_path.name.endswith(".d.ts"):
        stem_path = stem_path.with_suffix("")
    rel = os.path.relpath(stem_path, start=from_file.parent)
    rel = rel.replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel


def resolve_import(importer: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    base = (importer.parent / spec).resolve()
    candidates = [
        base,
        Path(str(base) + ".ts"),
        Path(str(base) + ".tsx"),
        Path(str(base) + ".js"),
        Path(str(base) + ".jsx"),
        base / "index.ts",
        base / "index.tsx",
    ]
    for c in candidates:
        if c.is_file():
            return c.resolve()
    return None


def plan_feature_root(feat: Path) -> list[tuple[Path, Path]]:
    moves: list[tuple[Path, Path]] = []
    lib = feat / "lib"
    components = feat / "components"
    for f in sorted(feat.iterdir()):
        if not f.is_file():
            continue
        if f.suffix not in {".ts", ".tsx"}:
            continue
        if f.name == "index.ts":
            continue
        if f.suffix == ".ts":
            moves.append((f, lib / f.name))
        elif f.suffix == ".tsx":
            if should_keep_root_tsx(f.name):
                continue
            moves.append((f, components / f.name))
    return moves


def plan_subdir_split(subdir: Path) -> list[tuple[Path, Path]]:
    """Split a mixed leaf folder: *.ts (except index.ts) → lib/, non-Page *.tsx → components/, keep *Page.tsx + index."""
    if not subdir.is_dir():
        return []
    files = [f for f in subdir.iterdir() if f.is_file() and f.suffix in {".ts", ".tsx"}]
    has_ts = any(f.suffix == ".ts" and f.name != "index.ts" for f in files)
    has_tsx = any(f.suffix == ".tsx" for f in files)
    if not (has_ts and has_tsx):
        return []
    moves: list[tuple[Path, Path]] = []
    lib = subdir / "lib"
    components = subdir / "components"
    for f in files:
        if f.name == "index.ts":
            continue
        if f.suffix == ".ts":
            moves.append((f, lib / f.name))
        elif f.suffix == ".tsx" and not is_page_tsx(f.name):
            # if components/ already exists and file would go there, still ok
            # only move if not already under components (we're iterating subdir root only)
            moves.append((f, components / f.name))
    return moves


def plan_gameSession(subdir: Path) -> list[tuple[Path, Path]]:
    """gameSession: move root .ts → lib/, keep components/ as-is."""
    if not subdir.is_dir():
        return []
    moves: list[tuple[Path, Path]] = []
    lib = subdir / "lib"
    for f in sorted(subdir.iterdir()):
        if not f.is_file():
            continue
        if f.suffix == ".ts" and f.name != "index.ts":
            moves.append((f, lib / f.name))
        elif f.suffix == ".tsx":
            # shouldn't have loose tsx; park in components/
            moves.append((f, subdir / "components" / f.name))
    return moves


def apply_moves(moves: list[tuple[Path, Path]]) -> dict[Path, Path]:
    mapping: dict[Path, Path] = {}
    for src, dst in moves:
        src_r = src.resolve()
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            raise SystemExit(f"Destination exists: {dst} (from {src})")
        shutil.move(str(src), str(dst))
        mapping[src_r] = dst.resolve()
        print(f"  MOVE {src.relative_to(FEATURES.parent)} → {dst.relative_to(FEATURES.parent)}")
    return mapping


def rewrite_imports(mapping: dict[Path, Path]) -> int:
    """Rewrite relative imports using old→new path mapping.

    For each file (post-move location), resolve imports as they were written relative
    to the *pre-move* importer path, then emit a path relative to the *post-move* location.
    """
    if not mapping:
        return 0

    inverse = {new: old for old, new in mapping.items()}
    # All ts/tsx under SRC after moves
    changed_files = 0

    for path in SRC.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        if "node_modules" in path.parts:
            continue

        path_r = path.resolve()
        old_importer = inverse.get(path_r, path_r)
        text = path.read_text(encoding="utf-8")
        orig = text

        def rewrite_spec(spec: str) -> str | None:
            if not spec.startswith("."):
                return None
            # Resolve against OLD importer directory (even if paths don't exist on disk)
            old_base = (old_importer.parent / spec)
            old_candidates: list[Path] = []
            for ext in (".ts", ".tsx", ".js", ".jsx"):
                old_candidates.append(Path(str(old_base) + ext).resolve())
            old_candidates.append(old_base.resolve())
            old_candidates.append((Path(str(old_base)) / "index.ts").resolve())
            old_candidates.append((Path(str(old_base)) / "index.tsx").resolve())

            old_target: Path | None = None
            for cand in old_candidates:
                if cand in mapping or cand.exists():
                    old_target = cand
                    break
            # Prefer mapping hit even if exists() is false
            for cand in old_candidates:
                if cand in mapping:
                    old_target = cand
                    break
            if old_target is None:
                # Maybe import already points at post-move location
                new_base = (path_r.parent / spec)
                for ext in (".ts", ".tsx", ".js", ".jsx", ""):
                    cand = Path(str(new_base) + ext).resolve() if ext else new_base.resolve()
                    if cand.exists() and cand.is_file():
                        return None  # already valid
                    if (cand / "index.ts").exists() or (cand / "index.tsx").exists():
                        return None
                return None

            new_target = mapping.get(old_target, old_target)
            if not new_target.exists() and old_target in mapping:
                new_target = mapping[old_target]
            new_spec = rel_import(path_r, new_target)
            if new_spec == spec or new_spec == spec.replace(".ts", "").replace(".tsx", ""):
                # normalize comparison without exts
                if rel_import(path_r, new_target) == spec:
                    return None
            return new_spec

        def make_repl(m: re.Match[str]) -> str:
            spec = m.group("spec")
            q = m.group("q")
            prefix = m.group("prefix")
            new_spec = rewrite_spec(spec)
            if not new_spec:
                return m.group(0)
            return f"{prefix}{q}{new_spec}{q}"

        text2 = IMPORT_RE.sub(make_repl, text)
        text2 = SIDE_IMPORT_RE.sub(make_repl, text2)

        if text2 != orig:
            path.write_text(text2, encoding="utf-8")
            changed_files += 1
            print(f"  REWRITE {path.relative_to(SRC)}")
    return changed_files


def fix_index_barrels() -> None:
    """Update feature index.ts export paths after moves."""
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        idx = feat / "index.ts"
        if not idx.exists():
            continue
        text = idx.read_text(encoding="utf-8")
        orig = text

        def fix_spec(spec: str) -> str:
            if not spec.startswith("."):
                return spec
            # Try resolve from index location
            resolved = resolve_import(idx, spec)
            if resolved:
                return rel_import(idx, resolved)
            # Try lib/ and components/ prefixes if bare ./Name
            name = spec.split("/")[-1]
            for folder in ("lib", "components"):
                for ext in (".ts", ".tsx"):
                    cand = feat / folder / f"{name}{ext}"
                    if not name.endswith(ext) and cand.exists():
                        return rel_import(idx, cand)
                    # spec may already include filename without ext
                # ./foo where foo.tsx moved to components
                for ext in (".ts", ".tsx"):
                    cand = feat / folder / f"{Path(name).stem}{ext}"
                    if cand.exists() and "/" not in spec.strip("./"):
                        return rel_import(idx, cand)
            # ./Foo from ./Foo — check components/Foo.tsx and lib/Foo.ts
            stem = Path(spec).name
            for folder, ext in (("components", ".tsx"), ("lib", ".ts"), ("components", ".ts"), ("lib", ".tsx")):
                cand = feat / folder / f"{stem}{ext}"
                if cand.exists():
                    return rel_import(idx, cand)
            return spec

        def repl(m: re.Match[str]) -> str:
            spec = m.group("spec")
            q = m.group("q")
            prefix = m.group("prefix")
            new_spec = fix_spec(spec)
            return f"{prefix}{q}{new_spec}{q}"

        text2 = IMPORT_RE.sub(repl, text)
        if text2 != orig:
            idx.write_text(text2, encoding="utf-8")
            print(f"  BARREL {feat.name}/index.ts")


def main() -> None:
    all_moves: list[tuple[Path, Path]] = []

    print("=== Plan feature roots ===")
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        all_moves.extend(plan_feature_root(feat))

    # Special subdirs
    print("=== Plan special subdirs ===")
    arenas = FEATURES / "games" / "arenas"
    all_moves.extend(plan_subdir_split(arenas))

    g2048 = FEATURES / "games" / "game-2048"
    all_moves.extend(plan_subdir_split(g2048))

    gsession = FEATURES / "games" / "gameSession"
    all_moves.extend(plan_gameSession(gsession))

    # Any other mixed immediate subdirs under features (one level deep nested modules)
    for feat in sorted(FEATURES.iterdir()):
        if not feat.is_dir():
            continue
        for sub in sorted(feat.iterdir()):
            if not sub.is_dir():
                continue
            if sub.name in {"lib", "components", "node_modules"}:
                continue
            # skip already handled
            if sub in {arenas, g2048, gsession}:
                continue
            # Don't flatten deep trees (admin/overview, stats/components, etc.) —
            # only split if THIS directory itself mixes ts+tsx at its root.
            planned = plan_subdir_split(sub)
            # Avoid moving files that are already only pages — plan_subdir_split handles it
            # Skip subdirs that are already properly structured with only one type + index
            if planned:
                # Don't pull pages into components; plan_subdir_split already keeps *Page.tsx
                # Skip if sub is named components or lib somehow
                print(f"  extra split: {sub.relative_to(FEATURES)} ({len(planned)} moves)")
                all_moves.extend(planned)

    # Deduplicate by src
    seen: set[Path] = set()
    unique: list[tuple[Path, Path]] = []
    for s, d in all_moves:
        sr = s.resolve()
        if sr in seen:
            continue
        seen.add(sr)
        unique.append((s, d))

    print(f"\n=== Applying {len(unique)} moves ===")
    mapping = apply_moves(unique)

    print("\n=== Rewriting imports ===")
    n = rewrite_imports(mapping)
    print(f"rewrote {n} files")

    print("\n=== Fixing barrels ===")
    fix_index_barrels()

    # Write mapping for debug
    map_file = FEATURES.parent.parent / ".feature-ts-tsx-move-map.txt"
    with map_file.open("w") as fh:
        for a, b in sorted(mapping.items(), key=lambda x: str(x[0])):
            fh.write(f"{a} -> {b}\n")
    print(f"\nDone. map → {map_file}")


if __name__ == "__main__":
    main()
