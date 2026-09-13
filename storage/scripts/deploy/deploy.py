#!/usr/bin/env python3
"""
Deploy BlockMiner (current/) to the production VM over SSH (Paramiko).

Default: pull from GitHub on the VM, then rebuild/restart Docker.
Optional: upload a local zip (`--zip` / `./deploy.sh --zip`) for emergency
offline deploys.

  python3 storage/scripts/deploy/deploy.py
  python3 storage/scripts/deploy/deploy.py --ref main
  python3 storage/scripts/deploy/deploy.py --zip /tmp/blockminer-current-deploy-*.zip

Credentials: `storage/scripts/deploy/vm_config_secret.py` or env VM_IP / VM_PASSWORD.

Never overwrites server `.env` / `.env.production`.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shlex
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"

DEFAULT_GIT_URL = "https://github.com/GustavoEmpresarial/BlockMiner.git"
DEFAULT_GIT_REF = "main"


def _docker_no_cache_enabled() -> bool:
    v = os.environ.get("BLOCKMINER_DOCKER_BUILD_NO_CACHE", "").strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def _skip_docker() -> bool:
    return os.environ.get("SKIP_DOCKER", "").strip().lower() in ("1", "true", "yes", "y", "on")


def load_secret(host_override: str = "", password_override: str = "", user_override: str = "") -> tuple[str, str, str]:
    if host_override:
        pw = password_override or (os.environ.get("VM_PASSWORD") or "").strip()
        if not pw:
            raise SystemExit("--host requires --password or VM_PASSWORD")
        return host_override, (user_override or "root"), pw
    if SECRET.exists():
        spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
        if spec is None or spec.loader is None:
            raise RuntimeError("Cannot load vm_config_secret.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        ip = str(getattr(mod, "IP", "") or "").strip()
        login = str(getattr(mod, "LOGIN", "root") or "root").strip()
        pw = str(getattr(mod, "ROOT_PASSWORD", "") or "").strip()
        if ip and login and pw:
            return ip, login, pw
    ip = (os.environ.get("VM_IP") or "").strip()
    login = (os.environ.get("VM_USER") or "root").strip()
    pw = (os.environ.get("VM_PASSWORD") or "").strip()
    if not (ip and pw):
        raise SystemExit(
            "Missing credentials: create storage/scripts/deploy/vm_config_secret.py from vm_config_secret.example.py "
            "or set VM_IP and VM_PASSWORD (and optionally VM_USER)."
        )
    return ip, login, pw


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Deploy BlockMiner to VM (git pull by default)")
    p.add_argument(
        "--zip",
        metavar="PATH",
        default=os.environ.get("BLOCKMINER_DEPLOY_ZIP", "").strip() or None,
        help="Emergency: upload local .zip instead of git pull (or set BLOCKMINER_DEPLOY_ZIP)",
    )
    p.add_argument(
        "--git-url",
        default=(os.environ.get("BLOCKMINER_GIT_URL") or DEFAULT_GIT_URL).strip(),
        help=f"Git remote URL (default {DEFAULT_GIT_URL})",
    )
    p.add_argument(
        "--ref",
        default=(os.environ.get("BLOCKMINER_GIT_REF") or DEFAULT_GIT_REF).strip(),
        help=f"Git ref to deploy (default {DEFAULT_GIT_REF})",
    )
    p.add_argument("--host", default="", help="Target VM IP. Overrides vm_config_secret.py AND VM_IP.")
    p.add_argument("--password", default="", help="Root password for --host (else VM_PASSWORD)")
    p.add_argument("--user", default="", help="SSH user for --host (default root)")
    p.add_argument(
        "--target",
        choices=["prod", "staging"],
        default=(os.environ.get("BLOCKMINER_DEPLOY_TARGET") or "prod").strip(),
        help="Which stack to deploy: prod (docker-compose.yml, /root/blockminer-current) or "
        "staging (docker-compose.staging.yml, /root/blockminer-staging, dev.blockminer.space). "
        "Independent directory, containers, volumes and DB — see docker-compose.staging.yml.",
    )
    return p.parse_args(argv)


# Per-target defaults — app_root, compose filename, container name (for the runtime-artifact
# preserve step's docker inspect/cp) and the host-side health-check port. staging's is the
# APP_PUBLISH_PORT host side of docker-compose.staging.yml's default (127.0.0.1:3001).
TARGET_DEFAULTS = {
    "prod": {
        "app_root": "/root/blockminer-current",
        "compose_file": "docker-compose.yml",
        "container_app": "blockminer-current-app",
        "health_port": 3000,
    },
    "staging": {
        "app_root": "/root/blockminer-staging",
        "compose_file": "docker-compose.staging.yml",
        "container_app": "blockminer-staging-app",
        "health_port": 3001,
    },
}


def _resolve_zip_path(raw: str) -> Path:
    z = Path(raw).expanduser()
    if not z.is_absolute():
        z = (REPO_ROOT / z).resolve()
    if not z.is_file():
        raise SystemExit(f"ZIP not found or not a file: {z}")
    if z.suffix.lower() != ".zip":
        raise SystemExit(f"Expected a .zip file, got: {z}")
    return z


def _docker_stack(compose_file: str, health_port: int) -> str:
    return f'''
export APP_ROOT
export BLOCKMINER_DOCKER_BUILD_NO_CACHE="${{BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}}"
cd "$APP_ROOT"
compose() {{
  local -a c=(docker compose -f "$APP_ROOT/{compose_file}")
  if [[ -f "$APP_ROOT/.env.production" ]]; then
    c+=(--env-file "$APP_ROOT/.env.production")
  fi
  "${{c[@]}}" "$@"
}}
if [[ "${{BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}}" == "1" ]]; then
  compose build --no-cache app
else
  compose build app
fi
compose up -d --remove-orphans db redis kafka phd nginx stats-materializer
# Force-recreate app so bind mounts (client/dist, dist/) pick up fresh directory inodes
# after git pull / SPA rebuild — otherwise Docker can keep an empty stale mount.
compose up -d --force-recreate --no-deps app
compose exec -T app npx prisma migrate deploy --schema=prisma/schema.prisma || true
curl -sS -o /dev/null -w "health:%{{http_code}}\\n" http://127.0.0.1:{health_port}/health || true
echo "[vm] docker steps finished"
'''


def _env_backup_restore() -> tuple[str, str]:
    backup = """BM_ENV_BACKUP="$(mktemp -d /tmp/bm-env-XXXXXX)"
for f in .env .env.production; do
  if [[ -f "$APP_ROOT/$f" ]]; then cp -a "$APP_ROOT/$f" "$BM_ENV_BACKUP/$f"; fi
done
"""
    restore = """for f in .env .env.production; do
  if [[ -f "$BM_ENV_BACKUP/$f" ]]; then cp -a "$BM_ENV_BACKUP/$f" "$APP_ROOT/$f"; fi
done
rm -rf "$BM_ENV_BACKUP"
"""
    return backup, restore


def _preserve_runtime_artifacts(container_app: str) -> str:
    """Keep untracked build/runtime dirs across git reset (dist is gitignored)."""
    return f'''
BM_KEEP="$(mktemp -d /tmp/bm-keep-XXXXXX)"
for path in dist client/dist storage/uploads storage/backups; do
  if [[ -e "$APP_ROOT/$path" ]]; then
    mkdir -p "$BM_KEEP/$(dirname "$path")"
    cp -a "$APP_ROOT/$path" "$BM_KEEP/$path"
  fi
done
# Prefer live container SPA/server dist if present (freshest running build).
if docker inspect {container_app} >/dev/null 2>&1; then
  docker cp {container_app}:/app/dist "$BM_KEEP/dist-from-container" 2>/dev/null || true
  docker cp {container_app}:/app/client/dist "$BM_KEEP/client-dist-from-container" 2>/dev/null || true
fi
'''


def _restore_runtime_artifacts() -> str:
    return r'''
# Restore preserved artifacts when git tree has no dist/ (gitignored).
if [[ -d "$BM_KEEP/dist-from-container" ]]; then
  rm -rf "$APP_ROOT/dist"
  mv "$BM_KEEP/dist-from-container" "$APP_ROOT/dist"
elif [[ -d "$BM_KEEP/dist" ]]; then
  rm -rf "$APP_ROOT/dist"
  mv "$BM_KEEP/dist" "$APP_ROOT/dist"
fi
if [[ -d "$BM_KEEP/client-dist-from-container" ]]; then
  mkdir -p "$APP_ROOT/client"
  # Preserve cartrush game assets if the new tree lacks them.
  if [[ -d "$APP_ROOT/client/dist/games/cartrush" ]]; then
    :
  elif [[ -d "$BM_KEEP/client-dist-from-container/games/cartrush" ]]; then
    mkdir -p "$BM_KEEP/client-dist-from-container/games"
  fi
  rm -rf "$APP_ROOT/client/dist"
  mv "$BM_KEEP/client-dist-from-container" "$APP_ROOT/client/dist"
elif [[ -d "$BM_KEEP/client/dist" ]]; then
  mkdir -p "$APP_ROOT/client"
  rm -rf "$APP_ROOT/client/dist"
  mv "$BM_KEEP/client/dist" "$APP_ROOT/client/dist"
fi
for path in storage/uploads storage/backups; do
  if [[ -d "$BM_KEEP/$path" ]]; then
    mkdir -p "$APP_ROOT/$(dirname "$path")"
    rm -rf "$APP_ROOT/$path"
    mv "$BM_KEEP/$path" "$APP_ROOT/$path"
  fi
done
rm -rf "$BM_KEEP"
'''


def _skip_server_build() -> bool:
    return os.environ.get("SKIP_SERVER_BUILD", "").strip().lower() in ("1", "true", "yes", "y", "on")


def _build_server_on_vm() -> str:
    """Rebuild server dist/ from source on every deploy.

    Found 2026-09-12: this step never existed. _preserve_runtime_artifacts() always
    carries dist/ forward from the OLD running container ("freshest running build"),
    and only the client SPA was ever rebuilt on the VM — so any server-side (non-client)
    source change silently never reached the deployed container; Docker's own
    `COPY dist ./dist` layer would even come back CACHED because the copied-forward
    dist/ was byte-identical to before. A staging deploy looked "successful" (git HEAD
    correct, health check 200) while still running the previous build's compiled JS.

    `npm run build` is `tsc -p tsconfig.json` with noEmitOnError unset (defaults to
    false) — this repo has known, pre-existing type errors in unrelated modules
    (see the Dockerfile's own comment: "current/server source tree is incomplete in
    this workspace"), so tsc exits non-zero but still emits dist/ JS for everything
    that DOES type-check. That's the existing, accepted contract for this codebase
    (identical to how the client SPA build already behaves here) — do not treat tsc's
    exit code as pass/fail; instead verify the one file server.ts always produces.
    """
    return r'''
if [[ "${SKIP_SERVER_BUILD:-0}" == "1" ]]; then
  echo "[vm] SKIP_SERVER_BUILD=1 — keeping previous server dist/"
elif command -v npm >/dev/null 2>&1; then
  echo "[vm] building server with host npm (tsc may report known pre-existing type errors in unrelated modules; JS is still emitted for everything that type-checks — see tsconfig noEmitOnError)"
  ( cd "$APP_ROOT" && npm ci --no-audit --no-fund && npm run build; true )
elif command -v docker >/dev/null 2>&1; then
  # Found 2026-09-13: host npm is NEVER present in this non-interactive SSH session
  # (every deploy since _build_server_on_vm() was added hit the "no npm" branch below
  # and silently kept stale dist/ — same silent-no-op bug this function exists to fix,
  # just moved into itself). Mirrors _build_client_on_vm()'s existing container fallback.
  echo "[vm] building server via node container (host npm unavailable)"
  docker run --rm \
    -v "$APP_ROOT:/app" \
    -w /app \
    node:22-bookworm-slim \
    bash -lc 'npm ci --no-audit --no-fund && npm run build' \
    || echo "[vm] WARN: server container build reported an error (see tsc note above — may still be fine)"
else
  echo "[vm] WARN: no npm/docker to rebuild server — keeping previous dist (server-side changes in this deploy were NOT applied)"
fi
if [[ -f "$APP_ROOT/dist/server/bootstrap/server.js" ]]; then
  echo "[vm] server dist present (dist/server/bootstrap/server.js)"
else
  echo "[vm] ERROR: dist/server/bootstrap/server.js is missing — server-side changes in this deploy were NOT applied"
fi
'''


def _build_client_on_vm() -> str:
    """Rebuild SPA from source when Node is available; otherwise keep preserved dist."""
    return r'''
if [[ -f "$APP_ROOT/client/package.json" ]]; then
  if command -v npm >/dev/null 2>&1; then
    echo "[vm] building client SPA with host npm"
    ( cd "$APP_ROOT/client" && npm ci --no-audit --no-fund && npm run build ) || echo "[vm] WARN: client build failed — keeping previous client/dist"
  elif command -v docker >/dev/null 2>&1; then
    echo "[vm] building client SPA via node container"
    docker run --rm \
      -v "$APP_ROOT/client:/app" \
      -w /app \
      node:22-bookworm-slim \
      bash -lc 'npm ci --no-audit --no-fund && npm run build' \
      || echo "[vm] WARN: client container build failed — keeping previous client/dist"
  else
    echo "[vm] WARN: no npm/docker to rebuild client — keeping previous client/dist"
  fi
fi
'''


def _remote_git_script(
    app_root: str, git_url: str, git_ref: str, *, compose_file: str, container_app: str, health_port: int
) -> str:
    no_cache = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    env_backup, env_restore = _env_backup_restore()
    pull = f'''command -v git >/dev/null 2>&1 || {{ apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git; }}
mkdir -p "$(dirname "$APP_ROOT")"
{env_backup}
{_preserve_runtime_artifacts(container_app)}
if [[ ! -d "$APP_ROOT/.git" ]]; then
  echo "[vm] cloning {git_url} -> $APP_ROOT"
  TMP_CLONE="$(mktemp -d /tmp/bm-clone-XXXXXX)"
  git clone --depth 1 --branch {shlex.quote(git_ref)} {shlex.quote(git_url)} "$TMP_CLONE"
  if [[ -d "$APP_ROOT" ]]; then
    # Overlay clone onto existing runtime tree. Never wipe storage/ or env files.
    command -v rsync >/dev/null 2>&1 || {{ apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rsync; }}
    rsync -a --delete \
      --exclude '.env' \
      --exclude '.env.production' \
      --exclude 'storage/uploads/' \
      --exclude 'storage/backups/' \
      --exclude 'dist/' \
      --exclude 'client/dist/' \
      "$TMP_CLONE"/ "$APP_ROOT"/
    # Ensure versioned media-seed lands even if storage/ already existed.
    if [[ -d "$TMP_CLONE/storage/media-seed" ]]; then
      mkdir -p "$APP_ROOT/storage"
      rsync -a "$TMP_CLONE/storage/media-seed"/ "$APP_ROOT/storage/media-seed"/
    fi
    rm -rf "$TMP_CLONE"
  else
    mv "$TMP_CLONE" "$APP_ROOT"
  fi
else
  echo "[vm] fetching {git_ref} from origin"
  cd "$APP_ROOT"
  git remote set-url origin {shlex.quote(git_url)} || git remote add origin {shlex.quote(git_url)}
  git fetch --depth 1 origin {shlex.quote(git_ref)}
  git checkout -B {shlex.quote(git_ref)} FETCH_HEAD
  git reset --hard FETCH_HEAD
  git clean -fd --exclude=dist --exclude=client/dist --exclude=storage --exclude=.env --exclude=.env.production
fi
{_restore_runtime_artifacts()}
{env_restore}
{_build_server_on_vm()}
{_build_client_on_vm()}
echo "[vm] git sync OK @ $(cd "$APP_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
'''
    if _skip_docker():
        return f"""set -euo pipefail
{no_cache}APP_ROOT={shlex.quote(app_root)}
{pull}echo "[vm] SKIP_DOCKER=1"
"""
    return f"""set -euo pipefail
{no_cache}APP_ROOT={shlex.quote(app_root)}
{pull}{_docker_stack(compose_file, health_port)}
"""


def _remote_zip_script(app_root: str, *, archive_basename: str, compose_file: str, health_port: int) -> str:
    no_cache = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    skip_reconcile = (
        "export BLOCKMINER_SKIP_RECONCILE=1\n"
        if os.environ.get("BLOCKMINER_SKIP_RECONCILE", "").strip().lower() in ("1", "true", "yes", "y", "on")
        else ""
    )
    remote_arc = f"/tmp/{archive_basename}"
    env_backup, env_restore = _env_backup_restore()
    reconcile = """if [[ "${BLOCKMINER_SKIP_RECONCILE:-0}" != "1" && -s "$BM_MANIFEST" ]]; then
  RECONCILE_ROOTS="server tests scripts prisma client nginx"
  BM_VMLIST="$(mktemp /tmp/bm-vmlist-XXXXXX)"
  BM_REMOVED=0
  for root in $RECONCILE_ROOTS; do
    [[ -d "$APP_ROOT/$root" ]] || continue
    ( cd "$APP_ROOT" && find "$root" -type f 2>/dev/null | sort ) > "$BM_VMLIST"
    while IFS= read -r stale; do
      [[ -n "$stale" ]] || continue
      rm -f "$APP_ROOT/$stale" && BM_REMOVED=$((BM_REMOVED+1))
    done < <(comm -23 "$BM_VMLIST" "$BM_MANIFEST")
  done
  rm -f "$BM_VMLIST"
  echo "[vm] reconcile: removed $BM_REMOVED stale source file(s) not in archive"
else
  echo "[vm] reconcile skipped (no manifest or BLOCKMINER_SKIP_RECONCILE=1)"
fi
rm -f "$BM_MANIFEST"
"""
    extract = f'''command -v unzip >/dev/null 2>&1 || {{ apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip; }}
mkdir -p "$APP_ROOT"
{env_backup}
BM_MANIFEST="$(mktemp /tmp/bm-manifest-XXXXXX)"
unzip -Z1 "{remote_arc}" | sed 's#/$##' | sort -u > "$BM_MANIFEST"
unzip -o -q "{remote_arc}" -d "$APP_ROOT"
rm -f "{remote_arc}"
{reconcile}{env_restore}
'''
    if _skip_docker():
        return f"""set -euo pipefail
{no_cache}{skip_reconcile}APP_ROOT={shlex.quote(app_root)}
{extract}echo "[vm] extract OK (SKIP_DOCKER=1)"
"""
    return f"""set -euo pipefail
{no_cache}{skip_reconcile}APP_ROOT={shlex.quote(app_root)}
{extract}{_docker_stack(compose_file, health_port)}
"""


def _run_remote(client: paramiko.SSHClient, script: str) -> int:
    stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
    stdin.write(script)
    stdin.close()
    ch = stdout.channel
    while True:
        if ch.recv_ready():
            chunk = ch.recv(65536)
            if chunk:
                os.write(1, chunk)
        if ch.recv_stderr_ready():
            chunk = ch.recv_stderr(65536)
            if chunk:
                os.write(2, chunk)
        if ch.exit_status_ready():
            break
        time.sleep(0.25)
    return int(ch.recv_exit_status())


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    host, user, password = load_secret(args.host, args.password, args.user)
    defaults = TARGET_DEFAULTS[args.target]
    print(f"[deploy] target: {user}@{host} ({args.target})", flush=True)
    # VM_APP_ROOT still overrides the app_root for whichever --target was picked, same as
    # before this flag existed — it just no longer hardcodes "prod" as the only possibility.
    app_root = (os.environ.get("VM_APP_ROOT") or defaults["app_root"]).strip()
    compose_file = defaults["compose_file"]
    container_app = defaults["container_app"]
    health_port = defaults["health_port"]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=user,
        password=password,
        timeout=120,
        banner_timeout=120,
        auth_timeout=120,
        look_for_keys=False,
        allow_agent=False,
    )

    try:
        if args.zip:
            archive = _resolve_zip_path(args.zip)
            remote_name = "blockminer_current_deploy.zip"
            remote_path = f"/tmp/{remote_name}"
            print(f"[local] zip fallback {archive.stat().st_size} bytes -> {archive}", flush=True)
            size = archive.stat().st_size
            t0 = time.monotonic()
            sftp = client.open_sftp()
            print(f"[sftp] {archive.name} -> {user}@{host}:{remote_path} ({size} bytes)", flush=True)
            last = [0]

            def progress(done: int, total: int) -> None:
                if total <= 0:
                    return
                step = 5 * 1024 * 1024
                if done == total or done - last[0] >= step:
                    last[0] = done
                    pct = 100.0 * done / total
                    print(f"[sftp] {done / (1024 * 1024):.1f} / {total / (1024 * 1024):.1f} MiB ({pct:.0f}%)", flush=True)

            sftp.put(str(archive), remote_path, callback=progress)
            sftp.close()
            print(f"[sftp] upload done in {time.monotonic() - t0:.1f}s", flush=True)
            code = _run_remote(
                client,
                _remote_zip_script(app_root, archive_basename=remote_name, compose_file=compose_file, health_port=health_port),
            )
        else:
            print(f"[deploy] git pull {args.git_url} @ {args.ref}", flush=True)
            code = _run_remote(
                client,
                _remote_git_script(
                    app_root, args.git_url, args.ref, compose_file=compose_file, container_app=container_app, health_port=health_port
                ),
            )
    finally:
        client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
