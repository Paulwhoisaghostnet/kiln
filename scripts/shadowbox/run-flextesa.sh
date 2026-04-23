#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${KILN_PYTHON:-python3}"

exec "${PYTHON_BIN}" "${ROOT}/scripts/shadowbox/flextesa_runner.py" "$@"
