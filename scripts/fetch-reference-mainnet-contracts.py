#!/usr/bin/env python3
"""
Download mainnet FA2 contract artifacts into ./reference/ (gitignored).
Run from repo root: python3 scripts/fetch-reference-mainnet-contracts.py
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

RPC_PRIMARY = "https://mainnet.ecadinfra.com"
RPC_FALLBACK = "https://rpc.tzkt.io/mainnet"
TZKT = "https://api.tzkt.io/v1"
USER_AGENT = "shadownet-kiln-reference-fetch/1.0 (+local)"

CONTRACTS: list[tuple[str, str]] = [
    ("KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", "wtf-is-a-token"),
    ("KT1GBgCd5dk7v4TSzWvtk1X64TxMyG4r7eRX", "demn-token"),
    ("KT1KRvNVubq64ttPbQarxec5XdS6ZQU4DVD2", "materia"),
    ("KT1LrYH1qE2zipJGfmtvu9grEp3ZRgpd6EYc", "shitcoin"),
    ("KT1MZg99PxMDEENwB4Fi64xkqAVh5d1rv8Z9", "tezos-pepe"),
]


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


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "reference"
    root.mkdir(parents=True, exist_ok=True)

    index: list[dict[str, object]] = []

    for address, slug in CONTRACTS:
        ddir = root / slug
        ddir.mkdir(parents=True, exist_ok=True)

        meta = get_json(f"{TZKT}/contracts/{address}")
        code = get_json(f"{TZKT}/contracts/{address}/code")
        script = get_contract_script(address)

        (ddir / "tzkt.contract.json").write_text(
            json.dumps(meta, indent=2) + "\n", encoding="utf-8"
        )
        (ddir / "contract.code.json").write_text(
            json.dumps(code, indent=2) + "\n", encoding="utf-8"
        )
        (ddir / "script.mainnet.head.json").write_text(
            json.dumps(script, indent=2) + "\n", encoding="utf-8"
        )
        (ddir / "mainnet-address.txt").write_text(address + "\n", encoding="utf-8")

        index.append(
            {
                "slug": slug,
                "address": address,
                "codeHash": meta.get("codeHash"),
                "typeHash": meta.get("typeHash"),
                "name": (meta.get("metadata") or {}).get("name"),
            }
        )

    (root / "INDEX.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print("Wrote", len(CONTRACTS), "bundles under", root)


if __name__ == "__main__":
    main()
