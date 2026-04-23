#!/usr/bin/env python3
"""
Ephemeral Tezos runtime runner for Kiln Shadowbox command-provider mode.

Contract:
  flextesa_runner.py <input.json> <output.json>

Input schema is produced by src/lib/shadowbox-runtime.ts.
Output schema is consumed by src/lib/shadowbox-runtime.ts.
"""

from __future__ import annotations

import json
import os
import random
import re
import shlex
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


ADDRESS_RE = re.compile(r"^(tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$")
INT_RE = re.compile(r"^-?\d+$")
HEX_RE = re.compile(r"^0x[0-9a-fA-F]+$")
KT1_RE = re.compile(r"(KT1[1-9A-HJ-NP-Za-km-z]{33})")
OPHASH_RE = re.compile(r"\b(o[pn][A-Za-z0-9]{30,})\b")
LEVEL_RE = re.compile(r"level[:\s]+(\d+)", re.IGNORECASE)


@dataclass
class RuntimeConfig:
    image: str
    box_script: str
    block_time: str
    rpc_wait_seconds: int
    start_timeout_seconds: int
    docker_bin: str


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def read_config() -> RuntimeConfig:
    return RuntimeConfig(
        image=os.environ.get("KILN_SHADOWBOX_FLEXTESA_IMAGE", "oxheadalpha/flextesa:latest").strip(),
        box_script=os.environ.get("KILN_SHADOWBOX_FLEXTESA_BOX_SCRIPT", "nairobibox").strip(),
        block_time=os.environ.get("KILN_SHADOWBOX_FLEXTESA_BLOCK_TIME", "2").strip() or "2",
        rpc_wait_seconds=env_int("KILN_SHADOWBOX_FLEXTESA_RPC_WAIT_SECONDS", 45),
        start_timeout_seconds=env_int("KILN_SHADOWBOX_FLEXTESA_START_TIMEOUT_SECONDS", 180),
        docker_bin=os.environ.get("KILN_SHADOWBOX_DOCKER_BIN", "docker").strip() or "docker",
    )


def run(
    argv: list[str],
    *,
    timeout: int = 30,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv,
        check=check,
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def docker_exec(
    config: RuntimeConfig,
    container_name: str,
    args: list[str],
    *,
    timeout: int = 45,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return run([config.docker_bin, "exec", container_name, *args], timeout=timeout, check=check)


def wait_for_rpc(port: int, timeout_seconds: int) -> bool:
    deadline = time.time() + timeout_seconds
    url = f"http://127.0.0.1:{port}/chains/main/blocks/head/header"
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True
        except (URLError, TimeoutError, OSError):
            pass
        time.sleep(1)
    return False


def escape_michelson_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def pair_chain(values: list[str]) -> str:
    if len(values) == 1:
        return values[0]
    expr = values[-1]
    for value in reversed(values[:-1]):
        expr = f"(Pair {value} {expr})"
    return expr


def to_michelson_literal(value: Any) -> str | None:
    if value is None:
        return "Unit"
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return "Unit"
        lowered = stripped.lower()
        if lowered == "true":
            return "True"
        if lowered == "false":
            return "False"
        if INT_RE.fullmatch(stripped):
            return stripped
        if HEX_RE.fullmatch(stripped):
            return stripped
        if stripped == "Unit":
            return "Unit"
        if ADDRESS_RE.fullmatch(stripped):
            return escape_michelson_string(stripped)
        return escape_michelson_string(stripped)
    if isinstance(value, dict):
        keys = set(value.keys())
        if {"address", "amount"} <= keys:
            address = to_michelson_literal(value.get("address"))
            amount = to_michelson_literal(value.get("amount"))
            if address and amount:
                return f"(Pair {address} {amount})"
        if {"to", "amount"} <= keys:
            receiver = to_michelson_literal(value.get("to"))
            amount = to_michelson_literal(value.get("amount"))
            if receiver and amount:
                return f"(Pair {receiver} {amount})"
        if len(value) == 1:
            return to_michelson_literal(next(iter(value.values())))
        values: list[str] = []
        for key in sorted(value.keys()):
            literal = to_michelson_literal(value[key])
            if literal is None:
                return None
            values.append(literal)
        return pair_chain(values)
    if isinstance(value, list):
        if not value:
            return "Unit"
        values: list[str] = []
        for item in value:
            literal = to_michelson_literal(item)
            if literal is None:
                return None
            values.append(literal)
        return pair_chain(values)
    return None


def wallet_address(wallet: str) -> str:
    if wallet == "ernie":
        return "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6"
    if wallet == "user":
        return "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6"
    return "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"


def wallet_alias(wallet: str) -> str:
    if wallet == "ernie":
        return "bob"
    if wallet == "user":
        return "bob"
    return "alice"


def build_arg(entrypoint: str, wallet: str, args: list[Any]) -> str | None:
    if not args:
        return "Unit"

    if (
        len(args) == 1
        and isinstance(args[0], (int, str))
        and str(args[0]).strip().lstrip("-").isdigit()
        and entrypoint in {"mint", "mint_tokens", "create_token", "mint_editions"}
    ):
        return f'(Pair {escape_michelson_string(wallet_address(wallet))} {str(args[0]).strip()})'

    if (
        len(args) == 1
        and isinstance(args[0], (int, str))
        and str(args[0]).strip().lstrip("-").isdigit()
        and entrypoint == "transfer"
    ):
        amount = str(args[0]).strip()
        target = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6"
        return f'(Pair {escape_michelson_string(target)} {amount})'

    if len(args) == 1:
        return to_michelson_literal(args[0])

    literals: list[str] = []
    for item in args:
        literal = to_michelson_literal(item)
        if literal is None:
            return None
        literals.append(literal)
    return pair_chain(literals)


def parse_contract_address(text: str) -> str | None:
    match = KT1_RE.search(text)
    return match.group(1) if match else None


def parse_operation_hash(text: str) -> str | None:
    match = OPHASH_RE.search(text)
    return match.group(1) if match else None


def parse_level(text: str) -> int | None:
    match = LEVEL_RE.search(text)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def write_output(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: flextesa_runner.py <input.json> <output.json>", file=sys.stderr)
        return 2

    input_path = Path(argv[1])
    output_path = Path(argv[2])
    config = read_config()

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    steps_in = payload.get("steps", [])
    if not isinstance(steps_in, list):
        steps_in = []

    container_name = f"kiln-shadowbox-{uuid.uuid4().hex[:12]}"
    port = random.randint(24000, 28999)
    warnings: list[str] = []
    step_results: list[dict[str, Any]] = []
    contract_address: str | None = None

    runner_output: dict[str, Any] = {
        "passed": False,
        "warnings": warnings,
        "steps": step_results,
    }

    tmp_file: Path | None = None

    try:
        run(
            [
                config.docker_bin,
                "run",
                "--rm",
                "--name",
                container_name,
                "--detach",
                "-p",
                f"127.0.0.1:{port}:20000",
                "-e",
                f"block_time={config.block_time}",
                config.image,
                config.box_script,
                "start",
            ],
            timeout=config.start_timeout_seconds,
        )

        if not wait_for_rpc(port, config.rpc_wait_seconds):
            warnings.append("Flextesa RPC did not become ready before timeout.")
            write_output(output_path, runner_output)
            return 0

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".tz",
            prefix="kiln-shadowbox-",
            delete=False,
            encoding="utf-8",
        ) as handle:
            handle.write(str(payload.get("michelson", "")))
            tmp_file = Path(handle.name)

        run([config.docker_bin, "cp", str(tmp_file), f"{container_name}:/tmp/shadowbox-contract.tz"], timeout=15)

        try:
            originate = docker_exec(
                config,
                container_name,
                [
                    "octez-client",
                    "-M",
                    "client",
                    "originate",
                    "contract",
                    "shadowbox",
                    "transferring",
                    "0",
                    "from",
                    "alice",
                    "running",
                    "/tmp/shadowbox-contract.tz",
                    "--init",
                    str(payload.get("initialStorage", "Unit")),
                    "--burn-cap",
                    "10",
                    "--force",
                ],
                timeout=75,
            )
        except subprocess.CalledProcessError as error:
            error_text = f"{error.stdout}\n{error.stderr}".strip()
            warnings.append(f"Origination failed: {error_text or 'Unknown error.'}")
            write_output(output_path, runner_output)
            return 0
        except subprocess.TimeoutExpired:
            warnings.append("Origination timed out in shadowbox runtime.")
            write_output(output_path, runner_output)
            return 0

        originate_text = f"{originate.stdout}\n{originate.stderr}"
        contract_address = parse_contract_address(originate_text)
        if not contract_address:
            warnings.append("Could not parse KT1 address from origination output.")
            write_output(output_path, runner_output)
            return 0

        runner_output["contractAddress"] = contract_address

        for index, raw_step in enumerate(steps_in):
            if not isinstance(raw_step, dict):
                continue
            label = str(raw_step.get("label") or f"Step {index + 1}")
            wallet = str(raw_step.get("wallet") or "bert")
            entrypoint = str(raw_step.get("entrypoint") or "").strip()
            args = raw_step.get("args")
            step_args = args if isinstance(args, list) else []

            if not entrypoint:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": "unknown",
                        "status": "failed",
                        "note": "Entrypoint is required.",
                    }
                )
                continue

            arg_expr = build_arg(entrypoint, wallet, step_args)
            if arg_expr is None:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": "Unable to convert args into Michelson expression.",
                    }
                )
                continue

            account = wallet_alias(wallet)
            try:
                call = docker_exec(
                    config,
                    container_name,
                    [
                        "octez-client",
                        "-M",
                        "client",
                        "transfer",
                        "0",
                        "from",
                        account,
                        "to",
                        contract_address,
                        "--entrypoint",
                        entrypoint,
                        "--arg",
                        arg_expr,
                        "--burn-cap",
                        "2",
                        "--force",
                    ],
                    timeout=75,
                )
                call_text = f"{call.stdout}\n{call.stderr}"
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "passed",
                        "note": "Entrypoint call applied in ephemeral runtime.",
                        "operationHash": parse_operation_hash(call_text),
                        "level": parse_level(call_text),
                    }
                )
            except subprocess.CalledProcessError as error:
                error_text = f"{error.stdout}\n{error.stderr}".strip()
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": error_text or "Entrypoint call failed.",
                    }
                )
            except subprocess.TimeoutExpired:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": "Entrypoint call timed out.",
                    }
                )

        passed = all(step.get("status") == "passed" for step in step_results)
        runner_output["passed"] = passed
        write_output(output_path, runner_output)
        return 0
    except Exception as error:  # noqa: BLE001
        warnings.append(f"Shadowbox runner error: {error}")
        write_output(output_path, runner_output)
        return 0
    finally:
        if tmp_file and tmp_file.exists():
            try:
                tmp_file.unlink()
            except OSError:
                pass
        subprocess.run(
            [config.docker_bin, "kill", container_name],
            text=True,
            capture_output=True,
            check=False,
        )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
