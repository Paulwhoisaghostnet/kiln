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
CONTRACT_ENTRYPOINT_RE = re.compile(r"\bCONTRACT\s+%([A-Za-z0-9_]+)\b", re.IGNORECASE)
BURN_PLACEHOLDER_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FA2_FIXTURE_CONTRACT_PATH = PROJECT_ROOT / "contracts" / "tokens" / "test-silver.tz"
FA2_FIXTURE_STORAGE_PATH = PROJECT_ROOT / "contracts" / "tokens" / "test-silver.storage.tz"
FA2_FIXTURE_ENTRYPOINTS = {
    "admin",
    "assets",
    "balance_of",
    "burn_tokens",
    "confirm_admin",
    "create_token",
    "mint_tokens",
    "pause",
    "set_admin",
    "tokens",
    "transfer",
    "update_operators",
}


@dataclass
class RuntimeConfig:
    image: str
    box_script: str
    block_time: str
    rpc_wait_seconds: int
    start_timeout_seconds: int
    docker_bin: str


@dataclass(frozen=True)
class ContractEntrypointRequirement:
    entrypoint: str
    parameter_type: str


@dataclass(frozen=True)
class DependencyFixturePlan:
    kind: str
    requirements: tuple[ContractEntrypointRequirement, ...]


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


def copy_source_to_container(
    config: RuntimeConfig,
    container_name: str,
    source: str,
    tmp_files: list[Path],
    *,
    alias: str,
) -> str:
    remote_path = f"/tmp/{alias}.tz"
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".tz",
        prefix="kiln-shadowbox-",
        delete=False,
        encoding="utf-8",
    ) as handle:
        handle.write(source)
        tmp_file = Path(handle.name)
        tmp_files.append(tmp_file)

    run([config.docker_bin, "cp", str(tmp_file), f"{container_name}:{remote_path}"], timeout=15)
    return remote_path


def originate_shadowbox_contract(
    config: RuntimeConfig,
    container_name: str,
    *,
    alias: str,
    remote_path: str,
    initial_storage: str,
) -> subprocess.CompletedProcess[str]:
    return docker_exec(
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
            initial_storage,
            "--burn-cap",
            "10",
            "--force",
        ],
        timeout=75,
    )


def tokenize_michelson(source: str) -> list[str]:
    tokens: list[str] = []
    index = 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if char == "#":
            while index < len(source) and source[index] != "\n":
                index += 1
            continue
        if char == '"':
            start = index
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                    continue
                if source[index] == '"':
                    index += 1
                    break
                index += 1
            tokens.append(source[start:index])
            continue
        if char in "(){};":
            tokens.append(char)
            index += 1
            continue

        start = index
        while (
            index < len(source)
            and not source[index].isspace()
            and source[index] not in '(){};"#'
        ):
            index += 1
        tokens.append(source[start:index])
    return tokens


def tokens_to_michelson(tokens: list[str]) -> str:
    text = " ".join(tokens)
    return (
        text.replace("( ", "(")
        .replace(" )", ")")
        .replace("{ ", "{")
        .replace(" }", "}")
        .replace(" ;", ";")
    )


def tokens_have_single_outer_parens(tokens: list[str]) -> bool:
    if len(tokens) < 2 or tokens[0] != "(" or tokens[-1] != ")":
        return False

    depth = 0
    for index, token in enumerate(tokens):
        if token == "(":
            depth += 1
        elif token == ")":
            depth -= 1
            if depth == 0 and index != len(tokens) - 1:
                return False
    return depth == 0


def entrypoint_branch_type(parameter_type: str, entrypoint: str) -> str:
    tokens = tokenize_michelson(parameter_type)
    if tokens_have_single_outer_parens(tokens):
        tokens = tokens[1:-1]
    if not tokens:
        tokens = ["unit"]

    primitive = tokens[0]
    if primitive.startswith("%"):
        tokens = ["unit", *tokens]
        primitive = "unit"
    return tokens_to_michelson(["(", primitive, f"%{entrypoint}", *tokens[1:], ")"])


def build_or_type(branches: list[str]) -> str:
    if not branches:
        return "unit"
    expr = branches[-1]
    for branch in reversed(branches[:-1]):
        expr = f"(or {branch} {expr})"
    return expr


def extract_contract_entrypoint_requirements(source: str) -> list[ContractEntrypointRequirement]:
    tokens = tokenize_michelson(source)
    requirements: list[ContractEntrypointRequirement] = []
    seen: set[tuple[str, str]] = set()
    index = 0
    while index < len(tokens):
        if tokens[index] != "CONTRACT":
            index += 1
            continue

        entrypoint = "default"
        type_start = index + 1
        if type_start < len(tokens) and tokens[type_start].startswith("%"):
            entrypoint = tokens[type_start][1:]
            type_start += 1

        type_tokens: list[str] = []
        depth = 0
        cursor = type_start
        while cursor < len(tokens):
            token = tokens[cursor]
            if token == ";" and depth == 0:
                break
            if token in {"(", "{"}:
                depth += 1
            elif token in {")", "}"}:
                depth -= 1
            type_tokens.append(token)
            cursor += 1

        parameter_type = tokens_to_michelson(type_tokens).strip()
        key = (entrypoint, parameter_type)
        if entrypoint and parameter_type and key not in seen:
            requirements.append(
                ContractEntrypointRequirement(
                    entrypoint=entrypoint,
                    parameter_type=parameter_type,
                )
            )
            seen.add(key)
        index = max(cursor + 1, index + 1)
    return requirements


def infer_dependency_fixture_plan(source: str, initial_storage: str) -> DependencyFixturePlan | None:
    if not extract_external_kt1_addresses(initial_storage):
        return None

    requirements = tuple(extract_contract_entrypoint_requirements(source))
    if not requirements:
        return DependencyFixturePlan(kind="address-sink", requirements=())

    required_entrypoints = {item.entrypoint.lower() for item in requirements}
    if required_entrypoints <= FA2_FIXTURE_ENTRYPOINTS:
        return DependencyFixturePlan(kind="fa2", requirements=requirements)

    return DependencyFixturePlan(kind="generic", requirements=requirements)


def build_generic_fixture_contract_source(
    requirements: tuple[ContractEntrypointRequirement, ...],
) -> str:
    branches: list[str] = []
    default_requirement = next(
        (item for item in requirements if item.entrypoint.lower() == "default"),
        None,
    )
    if default_requirement:
        branches.append(entrypoint_branch_type(default_requirement.parameter_type, "default"))
    else:
        branches.append("(unit %default)")

    for requirement in requirements:
        if requirement.entrypoint.lower() == "default":
            continue
        branch = entrypoint_branch_type(requirement.parameter_type, requirement.entrypoint)
        if branch not in branches:
            branches.append(branch)

    parameter_type = build_or_type(branches)
    return f"parameter {parameter_type};\nstorage unit;\ncode {{ CDR ; NIL operation ; PAIR }};\n"


def contract_source_uses_entrypoint(source: str, entrypoint: str) -> bool:
    return any(
        match.group(1).lower() == entrypoint.lower()
        for match in CONTRACT_ENTRYPOINT_RE.finditer(source)
    )


def source_needs_fa2_fixture(source: str, initial_storage: str) -> bool:
    plan = infer_dependency_fixture_plan(source, initial_storage)
    return bool(plan and plan.kind == "fa2")


def extract_external_kt1_addresses(initial_storage: str) -> list[str]:
    unique: list[str] = []
    for address in KT1_RE.findall(initial_storage):
        if address not in unique:
            unique.append(address)
    return unique


def replace_external_kt1_addresses(
    initial_storage: str,
    replacements: dict[str, str],
) -> tuple[str, int]:
    replaced_count = 0

    def replace_match(match: re.Match[str]) -> str:
        nonlocal replaced_count
        original = match.group(1)
        replacement = replacements.get(original)
        if not replacement:
            return original
        replaced_count += 1
        return replacement

    return KT1_RE.sub(replace_match, initial_storage), replaced_count


def read_fa2_fixture_contract_source() -> str:
    return FA2_FIXTURE_CONTRACT_PATH.read_text(encoding="utf-8")


def read_fa2_fixture_initial_storage() -> str:
    return FA2_FIXTURE_STORAGE_PATH.read_text(encoding="utf-8").strip().replace(
        BURN_PLACEHOLDER_ADDRESS,
        wallet_address("bert"),
    )


def build_fa2_fixture_create_token_arg(token_id: int) -> str:
    owner = escape_michelson_string(wallet_address("bert"))
    return f"{{ Pair {token_id} (Pair {owner} (Pair 1000000 {{}})) }}"


def build_fa2_fixture_mint_arg(wallet: str, token_ids: list[int]) -> str:
    receiver = escape_michelson_string(wallet_address(wallet))
    items = "; ".join(f"Pair {token_id} (Pair {receiver} 1000000)" for token_id in token_ids)
    return f"{{ {items} }}"


def build_fa2_fixture_operator_arg(owner_wallet: str, operator_address: str, token_ids: list[int]) -> str:
    owner = escape_michelson_string(wallet_address(owner_wallet))
    operator = escape_michelson_string(operator_address)
    items = "; ".join(
        f"Left (Pair {owner} (Pair {operator} {token_id}))" for token_id in token_ids
    )
    return f"{{ {items} }}"


def transfer_to_contract(
    config: RuntimeConfig,
    container_name: str,
    *,
    source_alias: str,
    target_address: str,
    entrypoint: str,
    arg: str,
    amount_tez: str = "0",
    burn_cap: str = "2",
) -> subprocess.CompletedProcess[str]:
    return docker_exec(
        config,
        container_name,
        [
            "octez-client",
            "-M",
            "client",
            "transfer",
            amount_tez,
            "from",
            source_alias,
            "to",
            target_address,
            "--entrypoint",
            entrypoint,
            "--arg",
            arg,
            "--burn-cap",
            burn_cap,
        ],
        timeout=75,
    )


def seed_fa2_fixture_balances(
    config: RuntimeConfig,
    container_name: str,
    fixture_address: str,
) -> None:
    transfer_to_contract(
        config,
        container_name,
        source_alias="alice",
        target_address=fixture_address,
        entrypoint="create_token",
        arg=build_fa2_fixture_create_token_arg(1),
    )
    transfer_to_contract(
        config,
        container_name,
        source_alias="alice",
        target_address=fixture_address,
        entrypoint="mint_tokens",
        arg=build_fa2_fixture_mint_arg("ernie", [0, 1]),
    )


def approve_fa2_fixture_operator(
    config: RuntimeConfig,
    container_name: str,
    *,
    fixture_address: str,
    operator_address: str,
) -> None:
    for owner_wallet in ["bert", "ernie"]:
        transfer_to_contract(
            config,
            container_name,
            source_alias=wallet_alias(owner_wallet),
            target_address=fixture_address,
            entrypoint="update_operators",
            arg=build_fa2_fixture_operator_arg(owner_wallet, operator_address, [0, 1]),
        )


def originate_dependency_fixture(
    config: RuntimeConfig,
    container_name: str,
    tmp_files: list[Path],
    *,
    fixture_index: int,
    external_address: str,
    plan: DependencyFixturePlan,
) -> dict[str, str]:
    fixture_alias = f"shadowbox_dep_{fixture_index}"
    if plan.kind == "fa2":
        source = read_fa2_fixture_contract_source()
        initial_storage = read_fa2_fixture_initial_storage()
    else:
        source = build_generic_fixture_contract_source(plan.requirements)
        initial_storage = "Unit"

    fixture_remote_path = copy_source_to_container(
        config,
        container_name,
        source,
        tmp_files,
        alias=fixture_alias,
    )
    fixture_origination = originate_shadowbox_contract(
        config,
        container_name,
        alias=fixture_alias,
        remote_path=fixture_remote_path,
        initial_storage=initial_storage,
    )
    fixture_address = parse_contract_address(
        f"{fixture_origination.stdout}\n{fixture_origination.stderr}",
    )
    if not fixture_address:
        raise RuntimeError(f"Could not parse KT1 address from {fixture_alias} fixture origination output.")

    if plan.kind == "fa2":
        seed_fa2_fixture_balances(config, container_name, fixture_address)

    return {
        "id": f"shadowbox:dependency:{fixture_index}",
        "address": fixture_address,
        "externalAddress": external_address,
        "kind": plan.kind,
        "entrypoints": ",".join(item.entrypoint for item in plan.requirements),
    }


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
    del parameter_type
    if entrypoint == "update_operators":
        return build_update_operators_args(wallet, args)
    arg = build_arg(entrypoint, wallet, args)
    using_provided_candidates = bool(provided_candidates)
    candidates = [*(provided_candidates or [])]
    if not using_provided_candidates and arg is not None:
        candidates.append(arg)

    flexible_reachability_entrypoints = {
        "buy",
        "buy_item",
        "collect",
        "fulfill_ask",
        "purchase",
    }
    if not using_provided_candidates and entrypoint == "purchase":
        candidates.extend(build_purchase_arg_candidates())
    if not using_provided_candidates and entrypoint in flexible_reachability_entrypoints:
        candidates.extend(["Unit", "1"])
    if (
        not using_provided_candidates
        and len(args) == 1
        and isinstance(args[0], (int, str))
        and str(args[0]).strip().lstrip("-").isdigit()
    ):
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
        support_contracts: list[dict[str, str]] = []
        dependency_fixture_by_external_address: dict[str, dict[str, str]] = {}

        for contract_index, contract_spec in enumerate(contract_specs):
            alias = f"shadowbox_{contract_index + 1}"
            remote_path = f"/tmp/{alias}.tz"
            contract_source = contract_spec["michelson"]
            initial_storage = contract_spec["initialStorage"]

            dependency_plan = infer_dependency_fixture_plan(contract_source, initial_storage)
            if dependency_plan:
                replacements: dict[str, str] = {}
                for external_address in extract_external_kt1_addresses(initial_storage):
                    fixture = dependency_fixture_by_external_address.get(external_address)
                    if not fixture:
                        fixture_index = len(dependency_fixture_by_external_address) + 1
                        try:
                            fixture = originate_dependency_fixture(
                                config,
                                container_name,
                                tmp_files,
                                fixture_index=fixture_index,
                                external_address=external_address,
                                plan=dependency_plan,
                            )
                        except (
                            OSError,
                            RuntimeError,
                            subprocess.CalledProcessError,
                            subprocess.TimeoutExpired,
                        ) as error:
                            error_text = (
                                f"{getattr(error, 'stdout', '')}\n{getattr(error, 'stderr', '')}"
                            ).strip()
                            warnings.append(
                                f"Dependency fixture setup failed for external KT1 {external_address}: {error_text or error}",
                            )
                            write_output(output_path, runner_output)
                            return 0

                        dependency_fixture_by_external_address[external_address] = fixture
                        support_contracts.append(fixture)

                    replacements[external_address] = fixture["address"]

                initial_storage, replacement_count = replace_external_kt1_addresses(
                    initial_storage,
                    replacements,
                )
                if replacement_count > 0:
                    mapping = ", ".join(
                        f"{source} -> {target}" for source, target in replacements.items()
                    )
                    entrypoints = ", ".join(item.entrypoint for item in dependency_plan.requirements)
                    detail = (
                        f" using {dependency_plan.kind} fixture(s)"
                        if not entrypoints
                        else f" using {dependency_plan.kind} fixture(s) for {entrypoints}"
                    )
                    warnings.append(
                        f"{contract_spec['id']}: mapped {replacement_count} external KT1 reference(s) into Flextesa{detail}: {mapping}.",
                    )

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
                        initial_storage,
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
                                    initial_storage,
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

        fa2_fixtures = [
            fixture
            for fixture in dependency_fixture_by_external_address.values()
            if fixture.get("kind") == "fa2"
        ]
        if fa2_fixtures:
            try:
                for target_contract in originated_contracts:
                    for fixture in fa2_fixtures:
                        approve_fa2_fixture_operator(
                            config,
                            container_name,
                            fixture_address=fixture["address"],
                            operator_address=target_contract["address"],
                        )
                warnings.append(
                    "Shadowbox FA2 fixtures preloaded token_ids 0 and 1 for Bert/Ernie and approved originated target contracts as operators.",
                )
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
                error_text = (
                    f"{getattr(error, 'stdout', '')}\n{getattr(error, 'stderr', '')}"
                ).strip()
                warnings.append(f"FA2 fixture operator setup failed: {error_text or error}")
                write_output(output_path, runner_output)
                return 0

        contract_address = originated_contracts[0]["address"]
        all_contracts = [*originated_contracts, *support_contracts]
        runner_output["contractAddress"] = contract_address
        runner_output["contracts"] = all_contracts
        address_by_id = {item["id"]: item["address"] for item in all_contracts}

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
            failed_arg_exprs: list[str] = []
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
                    failed_arg_exprs.append(arg_expr)
                    last_error_text = f"{error.stdout}\n{error.stderr}".strip()
                except subprocess.TimeoutExpired:
                    failed_arg_exprs.append(arg_expr)
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
                        "note": f"Tried arg candidates: {', '.join(failed_arg_exprs)}\n{last_error_text}",
                    }
                )
            else:
                step_results.append(
                    {
                        "label": label,
                        "wallet": wallet,
                        "entrypoint": entrypoint,
                        "status": "failed",
                        "note": (
                            f"Tried arg candidates: {', '.join(failed_arg_exprs)}\n"
                            f"{last_error_text or 'Entrypoint call failed.'}"
                        ),
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
