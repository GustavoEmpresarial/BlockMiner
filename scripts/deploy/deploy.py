#!/usr/bin/env python3
"""
Deploy BlockMiner (current/) para a VM, sem git no servidor (sem `git fetch` / GitHub).

Ported from legacy/scripts/deploy/deploy.py — BEM mais simples de propósito, porque
current/ tem uma topologia real diferente da do legacy:
  - 4 serviços no docker-compose.yml (db, redis, app, nginx), não 6 — sem `worker`/
    `telegram-worker` separados (tudo roda como cron in-process dentro do `app`, ver
    docs/PROGRESSO.txt item 10c e seguintes).
  - Sem client/ nesta árvore ainda (congelado em legacy/) — nenhuma lógica de
    preservar/mesclar assets do Vite entre deploys, porque não há build de frontend
    aqui ainda.
  - Sem backend/_server_vendor (árvore TS única) — nenhum passo de sync de symlink.
  - Só o endpoint `GET /health` existe hoje (confirmado em server/bootstrap/server.ts) —
    não há /health/live nem /health/ready ainda, então só checamos /health.

From repo root:

  python3 scripts/deploy/deploy.py
  python3 scripts/deploy/deploy.py --zip /tmp/blockminer-current-deploy-*.zip
  BLOCKMINER_DEPLOY_ZIP=/path/to/file.zip python3 scripts/deploy/deploy.py

Credentials: `scripts/deploy/vm_config_secret.py` (copy from `vm_config_secret.example.py`)
or env `VM_IP`, `VM_USER`, `VM_PASSWORD`.

Never overwrites server `.env` / `.env.production` (backed up before extract, restored after).

Optional env:
  BLOCKMINER_DEPLOY_ZIP=path         — upload this .zip instead of `git archive` (same as --zip)
  VM_APP_ROOT=/root/blockminer-current — remote app directory (must exist)
  BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 — `docker compose build --no-cache app`
  BLOCKMINER_SKIP_RECONCILE=1        — do NOT remove stale source files (revert to additive extract)
  SKIP_DOCKER=1                      — only upload + extract tracked files (no compose)

Requires: paramiko, local `git`, remote `docker` + same compose layout as production deploy.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shlex
import subprocess
import sys
import tempfile
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


def _docker_no_cache_enabled() -> bool:
    v = os.environ.get("BLOCKMINER_DOCKER_BUILD_NO_CACHE", "").strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def _skip_docker() -> bool:
    return os.environ.get("SKIP_DOCKER", "").strip().lower() in ("1", "true", "yes", "y", "on")


def load_secret(host_override: str = "", password_override: str = "", user_override: str = "") -> tuple[str, str, str]:
    # --host vence tudo. Sem isto, vm_config_secret.py tem prioridade sobre VM_IP,
    # então `VM_IP=<nova-vm> deploy` faria deploy silenciosamente na VM ANTIGA.
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
            "Missing credentials: create scripts/deploy/vm_config_secret.py from vm_config_secret.example.py "
            "or set VM_IP and VM_PASSWORD (and optionally VM_USER)."
        )
    return ip, login, pw


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Deploy BlockMiner (current/) tree to VM over SSH (Paramiko)")
    p.add_argument(
        "--zip",
        metavar="PATH",
        default=os.environ.get("BLOCKMINER_DEPLOY_ZIP", "").strip() or None,
        help="Local .zip to upload instead of git-archive HEAD (or set BLOCKMINER_DEPLOY_ZIP)",
    )
    p.add_argument("--host", default="", help="Target VM IP. Overrides vm_config_secret.py AND VM_IP.")
    p.add_argument("--password", default="", help="Root password for --host (else VM_PASSWORD)")
    p.add_argument("--user", default="", help="SSH user for --host (default root)")
    return p.parse_args(argv)


def _resolve_zip_path(raw: str) -> Path:
    z = Path(raw).expanduser()
    if not z.is_absolute():
        z = (REPO_ROOT / z).resolve()
    if not z.is_file():
        raise SystemExit(f"ZIP not found or not a file: {z}")
    if z.suffix.lower() != ".zip":
        raise SystemExit(f"Expected a .zip file, got: {z}")
    return z


def _remote_script(app_root: str, *, archive_basename: str) -> str:
    no_cache = "export BLOCKMINER_DOCKER_BUILD_NO_CACHE=1\n" if _docker_no_cache_enabled() else ""
    skip_reconcile = (
        "export BLOCKMINER_SKIP_RECONCILE=1\n"
        if os.environ.get("BLOCKMINER_SKIP_RECONCILE", "").strip().lower() in ("1", "true", "yes", "y", "on")
        else ""
    )
    remote_arc = f"/tmp/{archive_basename}"
    # Nunca deixa a extração sobrescrever segredos do lado do servidor: faz backup dos
    # arquivos de env, extrai, restaura no APP_ROOT final.
    env_restore_loop = """for f in .env .env.production; do
  if [[ -f "$BM_ENV_BACKUP/$f" ]]; then cp -a "$BM_ENV_BACKUP/$f" "$APP_ROOT/$f"; fi
done
rm -rf "$BM_ENV_BACKUP"
"""
    env_backup_loop = """BM_ENV_BACKUP="$(mktemp -d /tmp/bm-env-XXXXXX)"
for f in .env .env.production; do
  if [[ -f "$APP_ROOT/$f" ]]; then cp -a "$APP_ROOT/$f" "$BM_ENV_BACKUP/$f"; fi
done
"""
    # Reconcilia diretórios de source com o arquivo enviado, pra que arquivos deletados
    # no repo também desapareçam da VM (a extração é aditiva por padrão). Restrito às
    # raízes de source reais de current/ — NUNCA toca em .env*, storage/, node_modules,
    # dist ou volumes.
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
{env_backup_loop}
BM_MANIFEST="$(mktemp /tmp/bm-manifest-XXXXXX)"
unzip -Z1 "{remote_arc}" | sed 's#/$##' | sort -u > "$BM_MANIFEST"
unzip -o -q "{remote_arc}" -d "$APP_ROOT"
rm -f "{remote_arc}"
{reconcile}{env_restore_loop}
'''
    docker_stack = r'''
export APP_ROOT
export BLOCKMINER_DOCKER_BUILD_NO_CACHE="${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}"
cd "$APP_ROOT"
compose() {
  local -a c=(docker compose -f "$APP_ROOT/docker-compose.yml")
  if [[ -f "$APP_ROOT/.env.production" ]]; then
    c+=(--env-file "$APP_ROOT/.env.production")
  fi
  "${c[@]}" "$@"
}
if [[ "${BLOCKMINER_DOCKER_BUILD_NO_CACHE:-0}" == "1" ]]; then
  compose build --no-cache app
else
  compose build app
fi
# phd reuses the app image (same compose file). Build app first, then bring the stack up.
compose up -d --remove-orphans db redis kafka app phd nginx stats-materializer
compose exec -T app npx prisma migrate deploy --schema=prisma/schema.prisma || true
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:3000/health || true
echo "[vm] docker steps finished"
'''
    if _skip_docker():
        return f"""set -euo pipefail
{no_cache}{skip_reconcile}APP_ROOT={shlex.quote(app_root)}
{extract}echo "[vm] extract OK (SKIP_DOCKER=1)"
"""
    k8s_stack = r'''
export APP_ROOT
cd "$APP_ROOT"
if command -v kubectl >/dev/null 2>&1 && [[ -d "$APP_ROOT/deploy/k8s" ]]; then
  echo "[vm] applying Kustomize deploy/k8s (BLOCKMINER_USE_K8S=1)"
  kubectl apply -k "$APP_ROOT/deploy/k8s" || true
  echo "[vm] k8s apply finished"
else
  echo "[vm] kubectl or deploy/k8s missing — cannot USE_K8S"
  exit 1
fi
'''
    # Opt-in K8s cutover: BLOCKMINER_USE_K8S=1. After default flips to K8s, SKIP_K8S=1 keeps Compose.
    use_k8s = os.environ.get("BLOCKMINER_USE_K8S", "").strip().lower() in ("1", "true", "yes", "on")
    skip_k8s = os.environ.get("SKIP_K8S", "").strip().lower() in ("1", "true", "yes", "on")
    if use_k8s and not skip_k8s:
        return f"""set -euo pipefail
{no_cache}{skip_reconcile}APP_ROOT={shlex.quote(app_root)}
{extract}{k8s_stack}
"""
    return f"""set -euo pipefail
{no_cache}{skip_reconcile}APP_ROOT={shlex.quote(app_root)}
{extract}{docker_stack}
"""


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if not args.zip:
        raise SystemExit(
            "current/ deploy requires --zip (or BLOCKMINER_DEPLOY_ZIP) — use ./deploy.sh, "
            "que gera o zip via `git ls-files` + `dist/` já buildado antes de chamar este script."
        )
    archive = _resolve_zip_path(args.zip)
    remote_name = "blockminer_current_deploy.zip"
    print(f"[local] using zip {archive.stat().st_size} bytes -> {archive}", flush=True)

    remote_path = f"/tmp/{remote_name}"
    host, user, password = load_secret(args.host, args.password, args.user)
    print(f"[deploy] target: {user}@{host}", flush=True)
    app_root = (os.environ.get("VM_APP_ROOT") or "/root/blockminer-current").strip()

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

    # No PTY: avoids an interactive prompt hanging the session after long docker steps.
    stdin, stdout, stderr = client.exec_command("bash -s", get_pty=False)
    stdin.write(_remote_script(app_root, archive_basename=remote_name))
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
    code = ch.recv_exit_status()
    client.close()
    return int(code)


if __name__ == "__main__":
    raise SystemExit(main())
