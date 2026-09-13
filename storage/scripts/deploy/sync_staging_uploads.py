#!/usr/bin/env python3
"""
Sync storage/uploads/media from the prod VM into the staging VM.

Why this exists: staging's DB is refreshed from a trimmed prod pg_dump (see the
comment at the top of docker-compose.staging.yml), so rows in `miners`,
`user_owned_machines`, `user_miners`, `support_messages`, etc. reference real
uploaded files (e.g. /media/miners/1780321812460-a416288557be.webp). But
storage/uploads/ is gitignored and staging's own copy only ever gets the small
seed set written at container boot (server/modules/media/media.seed.ts) — the
real uploaded files never get there on their own. Result: broken/missing
images on staging (machines, support attachments, etc.) after every DB
refresh, until this is run.

Usage (from current/):
  python3 storage/scripts/deploy/sync_staging_uploads.py
  python3 storage/scripts/deploy/sync_staging_uploads.py --dry-run

Run this every time staging's DB is refreshed from a prod pg_dump.

Safety: uses `rsync -a --ignore-existing`, so it only ADDS files that are
missing on staging — it never overwrites or deletes anything already there.
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

try:
    import paramiko
except ImportError as e:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    raise SystemExit(1) from e

SCRIPT_DIR = Path(__file__).resolve().parent
SECRET = SCRIPT_DIR / "vm_config_secret.py"

PROD_UPLOADS = "/root/blockminer-current/storage/uploads/"
STAGING_UPLOADS = "/root/blockminer-staging/storage/uploads/"


def load_secret() -> tuple[str, str, str]:
    if not SECRET.exists():
        raise SystemExit(f"Missing {SECRET} — see vm_config_secret.example.py")
    spec = importlib.util.spec_from_file_location("vm_config_secret", SECRET)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load vm_config_secret.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.IP, mod.LOGIN, mod.ROOT_PASSWORD


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Show what would be copied without copying anything.")
    args = parser.parse_args(argv)

    host, user, password = load_secret()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, banner_timeout=30, auth_timeout=30)

    rsync_flags = "-avn" if args.dry_run else "-a"
    cmd = f"rsync {rsync_flags} --ignore-existing {PROD_UPLOADS} {STAGING_UPLOADS}"
    print(f"[local] running on VM: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    exit_status = stdout.channel.recv_exit_status()
    print(out)
    if err.strip():
        print("STDERR:", err, file=sys.stderr)
    client.close()
    return exit_status


if __name__ == "__main__":
    raise SystemExit(main())
