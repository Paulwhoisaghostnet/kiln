#!/usr/bin/env python3
"""Download mainnet FA2 contract artifacts into the reference corpus.

Primary inputs:
  KILN_REFERENCE_ROOT       Target directory (default: ./reference).
  KILN_REFERENCE_MAX_FILES  Hard cap on number of files written (default: 200).
  KILN_REFERENCE_MAX_BYTES  Hard cap on total bytes written (default: 200 MiB).

Run from repo root:
  python3 scripts/fetch-reference-mainnet-contracts.py

The caps prevent this script from silently ballooning disk usage on the
Hetzner host if the upstream RPC starts returning unusually large scripts,
or if we later extend the contract list. If either cap is hit the script
aborts and leaves the partial corpus in place so the next run can retry.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RPC_PRIMARY = "https://mainnet.ecadinfra.com"
RPC_FALLBACK = "https://rpc.tzkt.io/mainnet"
TZKT = "https://api.tzkt.io/v1"
USER_AGENT = "shadownet-kiln-reference-fetch/1.1 (+local)"

DEFAULT_MAX_FILES = 200
DEFAULT_MAX_BYTES = 200 * 1024 * 1024

CONTRACTS: list[tuple[str, str]] = [
    ("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", "wtf-is-a-token"),
    ("KT1GBgCd5dk7v4TSzWvtk1X64TxMyG4r7eRX", "demn-token"),
    ("KT1KRvNVubq64ttPbQarxec5XdS6ZQU4DVD2", "materia"),
    ("KT1LrYH1qE2zipJGfmtvu9grEp3ZRgpd6EYc", "shitcoin"),
    ("KT1MZg99PxMDEENwB4Fi64xkqAVh5d1rv8Z9", "tezos-pepe"),
]


class CorpusCap(Exception):
    """Raised when the fetch would exceed a configured size cap."""


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        print(f"WARN: {name}={raw!r} is not an integer, using default {default}", file=sys.stderr)
        return default
    return max(value, 1)


def resolve_root() -> Path:
    configured = os.environ.get("KILN_REFERENCE_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "reference"


def get_json(url: str) -> object:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def get_contract_script(address: str) -> object:
    for base in (RPC_PRIMARY, RPC_FALLBACK):
        url = f"{base}/chains/main/blocks/head/context/contracts/{address}/script"
        try:
            return get_json(url)
        except (urllib.error.HTTPError, OSError):
            continue
    raise RuntimeError(f"Could not fetch script for {address} from RPC mirrors")


def main() -> int:
    max_files = env_int("KILN_REFERENCE_MAX_FILES", DEFAULT_MAX_FILES)
    max_bytes = env_int("KILN_REFERENCE_MAX_BYTES", DEFAULT_MAX_BYTES)
    root = resolve_root()
    root.mkdir(parents=True, exist_ok=True)

    files_written = 0
    bytes_written = 0

    def write(path: Path, content: str) -> None:
        nonlocal files_written, bytes_written
        encoded = content.encode("utf-8")
        if files_written + 1 > max_files:
            raise CorpusCap(
                f"file cap hit ({files_written} written, cap {max_files})"
            )
        if bytes_written + len(encoded) > max_bytes:
            raise CorpusCap(
                f"byte cap hit ({bytes_written + len(encoded)} > {max_bytes})"
            )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encoded)
        files_written += 1
        bytes_written += len(encoded)

    index: list[dict[str, object]] = []

    try:
        for address, slug in CONTRACTS:
            ddir = root / slug

            meta = get_json(f"{TZKT}/contracts/{address}")
            code = get_json(f"{TZKT}/contracts/{address}/code")
            script = get_contract_script(address)

            write(ddir / "tzkt.contract.json", json.dumps(meta, indent=2) + "\n")
            write(ddir / "contract.code.json", json.dumps(code, indent=2) + "\n")
            write(ddir / "script.mainnet.head.json", json.dumps(script, indent=2) + "\n")
            write(ddir / "mainnet-address.txt", address + "\n")

            index.append(
                {
                    "slug": slug,
                    "address": address,
                    "codeHash": meta.get("codeHash") if isinstance(meta, dict) else None,
                    "typeHash": meta.get("typeHash") if isinstance(meta, dict) else None,
                    "name": (
                        (meta.get("metadata") or {}).get("name")
                        if isinstance(meta, dict)
                        else None
                    ),
                }
            )

        write(root / "INDEX.json", json.dumps(index, indent=2) + "\n")
    except CorpusCap as exc:
        print(
            f"ERROR: reference corpus aborted: {exc} "
            f"(files={files_written}, bytes={bytes_written}).",
            file=sys.stderr,
        )
        print("Raise KILN_REFERENCE_MAX_FILES / KILN_REFERENCE_MAX_BYTES if intentional.", file=sys.stderr)
        return 2

    print(
        f"Wrote {len(CONTRACTS)} bundles ({files_written} files, "
        f"{bytes_written} bytes) under {root}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
