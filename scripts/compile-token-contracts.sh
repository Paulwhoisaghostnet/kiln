#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/contracts/tokens/fa2_test_tokens.py"

if ! command -v smartpy >/dev/null 2>&1; then
  echo "smartpy CLI not found on PATH. Install with: pip install smartpy-tezos" >&2
  exit 1
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

smartpy compile "$SOURCE_FILE" "$BUILD_DIR" --purge

sync_token() {
  local token_name="$1"
  local scenario_name="$2"
  local source_dir="$BUILD_DIR/$scenario_name"
  local target_base="$ROOT_DIR/contracts/tokens/test-$token_name"

  cp "$source_dir/step_001_cont_0_contract.tz" "$target_base.tz"
  cp "$source_dir/step_001_cont_0_storage.tz" "$target_base.storage.tz"
  cp "$source_dir/step_001_cont_0_storage.json" "$target_base.storage.json"
  cp "$source_dir/step_001_cont_0_contract.json" "$target_base.contract.json"
  cp "$source_dir/step_001_cont_0_types.py" "$target_base.types.py"
}

sync_token "bronze" "test_bronze"
sync_token "silver" "test_silver"
sync_token "gold" "test_gold"
sync_token "platinum" "test_platinum"
sync_token "diamond" "test_diamond"

echo "Synced FA2 token artifacts to contracts/tokens/."
echo "Note: generated storage files use placeholder address tz1burnburnburnburnburnburnburjAYjjX."
