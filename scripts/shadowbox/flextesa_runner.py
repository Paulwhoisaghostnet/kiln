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


def wait_for_client_operations(
    config: RuntimeConfig,
    container_name: str,
    timeout_seconds: int,
) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            docker_exec(
                config,
                container_name,
                [
                    "octez-client",
                    "-M",
                    "client",
                    "get",
                    "balance",
                    "for",
                    "alice",
                ],
                timeout=10,
            )
            return True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
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


def comb_pair(values: list[str]) -> str:
    return f"(Pair {' '.join(values)})"


def tokenize_type_expression(source: str) -> list[str]:
    return re.findall(r"\(|\)|[^\s()]+", source)


def parse_type_expression(source: str) -> Any:
    tokens = tokenize_type_expression(source)
    index = 0

    def parse_node() -> Any:
        nonlocal index
        if index >= len(tokens):
            return None
        token = tokens[index]
        index += 1
        if token == "(":
            children: list[Any] = []
            while index < len(tokens) and tokens[index] != ")":
                child = parse_node()
                if child is not None:
                    children.append(child)
            if index < len(tokens) and tokens[index] == ")":
                index += 1
            return children
        if token == ")":
            return None
        return token

    nodes: list[Any] = []
    while index < len(tokens):
        node = parse_node()
        if node is not None:
            nodes.append(node)
    if len(nodes) == 1:
        return nodes[0]
    return nodes


def type_head(node: Any) -> str | None:
    if isinstance(node, str):
        return node.lower()
    if isinstance(node, list) and node and isinstance(node[0], str):
        return node[0].lower()
    return None


def type_args(node: Any) -> list[Any]:
    if not isinstance(node, list):
        return []
    return [
        child
        for child in node[1:]
        if not (isinstance(child, str) and (child.startswith("%") or child.startswith("@") or child.startswith(":")))
    ]


def sample_args_for_type_node(node: Any, wallet: str) -> list[str]:
    head = type_head(node)
    if not head:
        return []

    if isinstance(node, str):
        if head == "unit":
            return ["Unit"]
        if head in {"nat", "int", "mutez"}:
            return ["1"]
        if head == "bool":
            return ["True"]
        if head == "string":
            return [escape_michelson_string("shadowbox")]
        if head == "bytes":
            return ["0x00"]
        if head in {"address", "key_hash"}:
            return [escape_michelson_string(wallet_address(wallet))]
        if head == "timestamp":
            return [escape_michelson_string("1970-01-01T00:00:00Z")]
        if head == "chain_id":
            return [escape_michelson_string("NetXsqzbfFenSTS")]
        return []

    args = type_args(node)
    if head == "pair":
        child_samples = [sample_args_for_type_node(child, wallet) for child in args]
        if any(not samples for samples in child_samples):
            return []
        values = [samples[0] for samples in child_samples]
        if len(values) < 2:
            return values
        candidates = [comb_pair(values)]
        nested = pair_chain(values)
        if nested not in candidates:
            candidates.append(nested)
        return candidates
    if head == "or" and len(args) >= 2:
        left = sample_args_for_type_node(args[0], wallet)
        right = sample_args_for_type_node(args[1], wallet)
        candidates: list[str] = []
        if left:
            candidates.append(f"(Left {left[0]})")
        if right:
            candidates.append(f"(Right {right[0]})")
        return candidates
    if head == "option" and args:
        inner = sample_args_for_type_node(args[0], wallet)
        return [f"(Some {inner[0]})", "None"] if inner else ["None"]
    if head in {"list", "set"} and args:
        inner = sample_args_for_type_node(args[0], wallet)
        return [f"{{ {inner[0]} }}", "{}"] if inner else ["{}"]
    if head in {"map", "big_map"} and len(args) >= 2:
        key = sample_args_for_type_node(args[0], wallet)
        value = sample_args_for_type_node(args[1], wallet)
        return [f"{{ Elt {key[0]} {value[0]} }}", "{}"] if key and value else ["{}"]
    return []


def build_type_arg_candidates(parameter_type: str | None, wallet: str) -> list[str]:
    if not parameter_type:
        return []
    return sample_args_for_type_node(parse_type_expression(parameter_type), wallet)


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
            return "{}"
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


def mutez_to_tez_string(value: Any) -> str | None:
    try:
        mutez = int(value)
    except (TypeError, ValueError):
        return None
    if mutez < 0:
        return None
    whole = mutez // 1_000_000
    frac = mutez % 1_000_000
    if frac == 0:
        return str(whole)
    return f"{whole}.{str(frac).zfill(6).rstrip('0')}"


def build_update_operators_args(wallet: str, args: list[Any]) -> list[str]:
    token_id = "0"
    if args and isinstance(args[0], (int, str)) and str(args[0]).strip().lstrip("-").isdigit():
        token_id = str(args[0]).strip()
    owner = escape_michelson_string(wallet_address(wallet))
    operator = escape_michelson_string(
        wallet_address("ernie" if wallet != "ernie" else "bert"),
    )
    return [
        f"{{ Left (Pair {owner} (Pair {operator} {token_id})) }}",
        f"{{ Pair {owner} (Pair {operator} {token_id}) }}",
    ]


def build_purchase_arg_candidates() -> list[str]:
    return [
        '(Pair 1 1 "shadowbox")',
        '(Pair 1 (Pair 1 "shadowbox"))',
        '(Pair 0 1 "shadowbox")',
        '(Pair 0 (Pair 1 "shadowbox"))',
    ]


def build_arg(entrypoint: str, wallet: str, args: list[Any]) -> str | None:
    if entrypoint == "update_operators":
        return build_update_operators_args(wallet, args)[0]

    if not args:
        return "Unit"

    if (
        len(args) == 1
        and isinstance(args[0], (int, str))
        and str(args[0]).strip().lstrip("-").isdigit()
        and entrypoint
        in {"mint", "mint_tokens", "create_token", "mint_editions", "burn", "burn_tokens"}
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


def build_arg_candidates(
    entrypoint: str,
    wallet: str,
    args: list[Any],
    parameter_type: str | None = None,
    provided_candidates: list[str] | None = None,
) -> list[str]:
    if entrypoint == "update_operators":
        return build_update_operators_args(wallet, args)
    arg = build_arg(entrypoint, wallet, args)
    candidates = [arg] if arg is not None else []
    candidates.extend(provided_candidates or [])
    candidates.extend(build_type_arg_candidates(parameter_type, wallet))
    flexible_reachability_entrypoints = {
        "buy",
        "buy_item",
        "collect",
        "fulfill_ask",
        "purchase",
    }
    if entrypoint == "purchase":
        candidates.extend(build_purchase_arg_candidates())
    if entrypoint in flexible_reachability_entrypoints:
        candidates.extend(["Unit", "1"])
    if len(args) == 1 and isinstance(args[0], (int, str)) and str(args[0]).strip().lstrip("-").isdigit():
        candidates.append("Unit")

    unique: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in unique:
            unique.append(candidate)
    return unique


def parse_contract_address(text: str) -> str | None:
    matches = KT1_RE.findall(text)
    return matches[-1] if matches else None


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


def flatten_michelson_source(source: str) -> str:
    tokens: list[str] = []
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        tokens.append(stripped)
    return " ".join(tokens)


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
    entrypoint_types_in = payload.get("entrypointTypes", {})
    entrypoint_types: dict[str, str] = {}
    if isinstance(entrypoint_types_in, dict):
        entrypoint_types = {
            str(key): str(value)
            for key, value in entrypoint_types_in.items()
            if str(key).strip() and str(value).strip()
        }
    entrypoint_arg_candidates_in = payload.get("entrypointArgCandidates", {})
    entrypoint_arg_candidates: dict[str, list[str]] = {}
    if isinstance(entrypoint_arg_candidates_in, dict):
        for key, value in entrypoint_arg_candidates_in.items():
            if isinstance(value, list):
                candidates = [str(item) for item in value if str(item).strip()]
                if str(key).strip() and candidates:
                    entrypoint_arg_candidates[str(key)] = candidates

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

    tmp_files: list[Path] = []

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

        if not wait_for_client_operations(config, container_name, config.rpc_wait_seconds):
            warnings.append("Flextesa client operation commands did not become ready before timeout.")
            write_output(output_path, runner_output)
            return 0

        contracts_payload = payload.get("contracts", [])
        contract_specs: list[dict[str, str]] = []
        if isinstance(contracts_payload, list) and contracts_payload:
            for index, item in enumerate(contracts_payload):
                if not isinstance(item, dict):
                    continue
                contract_specs.append(
                    {
                        "id": str(item.get("id") or f"contract_{index + 1}"),
                        "michelson": str(item.get("michelson") or ""),
                        "initialStorage": str(item.get("initialStorage") or "Unit"),
                    }
                )
        else:
            contract_specs.append(
                {
                    "id": "shadowbox",
                    "michelson": str(payload.get("michelson", "")),
                    "initialStorage": str(payload.get("initialStorage", "Unit")),
                }
            )

        originated_contracts: list[dict[str, str]] = []

        for contract_index, contract_spec in enumerate(contract_specs):
            alias = f"shadowbox_{contract_index + 1}"
            remote_path = f"/tmp/{alias}.tz"
            contract_source = contract_spec["michelson"]

            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".tz",
                prefix="kiln-shadowbox-",
                delete=False,
                encoding="utf-8",
            ) as handle:
                handle.write(contract_source)
                tmp_file = Path(handle.name)
                tmp_files.append(tmp_file)

            run([config.docker_bin, "cp", str(tmp_file), f"{container_name}:{remote_path}"], timeout=15)

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
                        alias,
                        "transferring",
                        "0",
                        "from",
                        "alice",
                        "running",
                        remote_path,
                        "--init",
                        contract_spec["initialStorage"],
                        "--burn-cap",
                        "10",
                        "--force",
                    ],
                    timeout=75,
                )
            except subprocess.CalledProcessError as error:
                error_text = f"{error.stdout}\n{error.stderr}".strip()
                lower_error = error_text.lower()
                if "misaligned expression" in lower_error:
                    flattened = flatten_michelson_source(contract_source)
                    if flattened and flattened != contract_source:
                        try:
                            tmp_file.write_text(flattened, encoding="utf-8")
                            run(
                                [
                                    config.docker_bin,
                                    "cp",
                                    str(tmp_file),
                                    f"{container_name}:{remote_path}",
                                ],
                                timeout=15,
                            )
                            originate = docker_exec(
                                config,
                                container_name,
                                [
                                    "octez-client",
                                    "-M",
                                    "client",
                                    "originate",
                                    "contract",
                                    alias,
                                    "transferring",
                                    "0",
                                    "from",
                                    "alice",
                                    "running",
                                    remote_path,
                                    "--init",
                                    contract_spec["initialStorage"],
                                    "--burn-cap",
                                    "10",
                                    "--force",
                                ],
                                timeout=75,
                            )
                            warnings.append(
                                f"{contract_spec['id']}: retried origination with normalized Michelson formatting.",
                            )
                        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as retry_error:
                            retry_text = (
                                f"{getattr(retry_error, 'stdout', '')}\n{getattr(retry_error, 'stderr', '')}"
                            ).strip()
                            warnings.append(
                                f"{contract_spec['id']} origination failed: {error_text or 'Unknown error.'}",
                            )
                            warnings.append(
                                f"{contract_spec['id']} retry after formatting normalization failed: {retry_text or 'Unknown error.'}",
                            )
                            if "UNPAIR;" in contract_source:
                                warnings.append(
                                    "Hint: legacy stub sequence `UNPAIR; SWAP; DROP;` is ill-typed for pair-based storage. Use `CDR; NIL operation; PAIR`.",
                                )
                            write_output(output_path, runner_output)
                            return 0
                    else:
                        warnings.append(
                            f"{contract_spec['id']} origination failed: {error_text or 'Unknown error.'}"
                        )
                        if "UNPAIR;" in contract_source:
                            warnings.append(
                                "Hint: legacy stub sequence `UNPAIR; SWAP; DROP;` is ill-typed for pair-based storage. Use `CDR; NIL operation; PAIR`.",
                            )
                        write_output(output_path, runner_output)
                        return 0
                else:
                    warnings.append(
                        f"{contract_spec['id']} origination failed: {error_text or 'Unknown error.'}"
                    )
                    if "UNPAIR;" in contract_source:
                        warnings.append(
                            "Hint: legacy stub sequence `UNPAIR; SWAP; DROP;` is ill-typed for pair-based storage. Use `CDR; NIL operation; PAIR`.",
                        )
                    write_output(output_path, runner_output)
                    return 0
            except subprocess.TimeoutExpired:
                warnings.append(f"{contract_spec['id']} origination timed out in shadowbox runtime.")
                write_output(output_path, runner_output)
                return 0

            originate_text = f"{originate.stdout}\n{originate.stderr}"
            parsed_address = parse_contract_address(originate_text)
            if not parsed_address:
                warnings.append(f"Could not parse KT1 address from {contract_spec['id']} origination output.")
                write_output(output_path, runner_output)
                return 0
            originated_contracts.append({"id": contract_spec["id"], "address": parsed_address})

        if not originated_contracts:
            warnings.append("No contracts were originated in shadowbox runtime.")
            write_output(output_path, runner_output)
            return 0

        contract_address = originated_contracts[0]["address"]
        runner_output["contractAddress"] = contract_address
        runner_output["contracts"] = originated_contracts
        address_by_id = {item["id"]: item["address"] for item in originated_contracts}

        for index, raw_step in enumerate(steps_in):
            if not isinstance(raw_step, dict):
                continue
            label = str(raw_step.get("label") or f"Step {index + 1}")
            wallet = str(raw_step.get("wallet") or "bert")
            entrypoint = str(raw_step.get("entrypoint") or "").strip()
            args = raw_step.get("args")
            step_args = args if isinstance(args, list) else []
            amount_tez = mutez_to_tez_string(raw_step.get("amountMutez", 0))
            assertions = raw_step.get("assertions", [])

            target_contract_address = contract_address
            target_contract_id = raw_step.get("targetContractId")
            if isinstance(target_contract_id, str) and target_contract_id.strip():
                target_contract_address = address_by_id.get(target_contract_id.strip(), "")
                if not target_contract_address:
                    step_results.append(
                        {
                            "label": label,
                            "wallet": wallet,
                            "entrypoint": entrypoint or "unknown",
                            "status": "failed",
                            "note": f"Unknown shadowbox targetContractId {target_contract_id}.",
                        }
                    )
                    continue
            target_contract_hint = raw_step.get("targetContractAddress")
            if isinstance(target_contract_hint, str) and target_contract_hint.strip():
                known_addresses = {item["address"] for item in originated_contracts}
                if target_contract_hint.strip() in known_addresses:
                    target_contract_address = target_contract_hint.strip()
                else:
                    step_results.append(
                        {
                            "label": label,
                            "wallet": wallet,
                            "entrypoint": entrypoint or "unknown",
                            "status": "failed",
                            "note": "targetContractAddress does not match an address originated inside this shadowbox job.",
                        }
                    )
                    continue

            if amount_tez is None:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint or "unknown",
                        "status": "failed",
                        "note": "amountMutez must be a non-negative integer.",
                    }
                )
                continue

            if isinstance(assertions, list) and assertions:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint or "unknown",
                        "status": "failed",
                        "note": "Storage/balance/big-map assertions are not implemented in this runner; no-stub policy blocks treating this step as passed.",
                    }
                )
                continue

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

            arg_exprs = build_arg_candidates(
                entrypoint,
                wallet,
                step_args,
                entrypoint_types.get(entrypoint),
                entrypoint_arg_candidates.get(entrypoint),
            )
            if not arg_exprs:
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
            call_result: subprocess.CompletedProcess[str] | None = None
            last_error_text = ""
            timed_out = False
            for arg_expr in arg_exprs:
                try:
                    call_result = docker_exec(
                        config,
                        container_name,
                        [
                            "octez-client",
                            "-M",
                            "client",
                            "transfer",
                            amount_tez,
                            "from",
                            account,
                            "to",
                            target_contract_address,
                            "--entrypoint",
                            entrypoint,
                            "--arg",
                            arg_expr,
                            "--burn-cap",
                            "2",
                        ],
                        timeout=75,
                    )
                    break
                except subprocess.CalledProcessError as error:
                    last_error_text = f"{error.stdout}\n{error.stderr}".strip()
                except subprocess.TimeoutExpired:
                    timed_out = True
                    last_error_text = "Entrypoint call timed out."
                    break

            if call_result is not None:
                call_text = f"{call_result.stdout}\n{call_result.stderr}"
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
            elif timed_out:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": last_error_text,
                    }
                )
            else:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": last_error_text or "Entrypoint call failed.",
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
        for tmp_file in tmp_files:
            if tmp_file.exists():
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
