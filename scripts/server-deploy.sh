#!/usr/bin/env bash
# Canonical Shadownet Kiln deploy script for the Hetzner host.
#
# Pulls latest source, reinstalls deps, rebuilds client+server bundles,
# prunes dev deps, bootstraps the reference corpus if missing, and
# restarts the systemd service.
#
# Designed to be called either from:
#   - an SSH shell on the host (manual smoke deploys), or
#   - the .github/workflows/deploy-hetzner.yml workflow (remote SSH exec).
#
# Preconditions (satisfied by scripts/server-provision.sh):
#   - `kiln` user exists.
#   - /opt/platform/repos/shadownet-kiln is a clone of the deploy branch.
#   - /opt/platform/venvs/kiln exists with smartpy-tezos installed.
#   - /opt/platform/repos/shadownet-kiln/.env exists.
#   - kiln.service is installed at /etc/systemd/system/kiln.service.

set -euo pipefail

REPO_ROOT="/opt/platform/repos/shadownet-kiln"
VENV_ROOT="/opt/platform/venvs/kiln"
SERVICE_USER="kiln"
DEPLOY_BRANCH="${KILN_DEPLOY_BRANCH:-main}"
REFERENCE_ROOT="${KILN_REFERENCE_ROOT:-/var/lib/kiln/reference}"
HEALTHCHECK_URL="${KILN_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
ENV_FILE="${REPO_ROOT}/.env"

log() { printf '[kiln-deploy] %s\n' "$*"; }

if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  echo "ERROR: ${REPO_ROOT} is not a git checkout. Run server-provision.sh first." >&2
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/.env" ]]; then
  echo "ERROR: ${REPO_ROOT}/.env missing. Populate it before deploying." >&2
  exit 1
fi

# All repo mutations run as the kiln user so file ownership stays consistent.
run_as_kiln() {
  sudo -u "${SERVICE_USER}" --preserve-env=PATH bash -lc "$1"
}

read_env_value() {
  local key="$1"
  awk -F= -v k="$key" '
    $0 ~ "^[[:space:]]*#" { next }
    $1 == k {
      value=$0
      sub("^[^=]*=", "", value)
      gsub(/\r$/, "", value)
      print value
      exit
    }
  ' "${ENV_FILE}"
}

is_truthy() {
  local raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | xargs)"
  [[ "${raw}" == "1" || "${raw}" == "true" || "${raw}" == "yes" || "${raw}" == "on" ]]
}

log "Fetching latest on ${DEPLOY_BRANCH}..."
run_as_kiln "cd '${REPO_ROOT}' && git fetch origin && git reset --hard 'origin/${DEPLOY_BRANCH}'"

log "Refreshing Python requirements..."
"${VENV_ROOT}/bin/pip" install --quiet -r "${REPO_ROOT}/requirements.txt"

log "Installing Node dependencies (full, then build)..."
run_as_kiln "cd '${REPO_ROOT}' && npm ci --include=dev"
run_as_kiln "cd '${REPO_ROOT}' && npm run build"

log "Pruning dev dependencies for production runtime..."
run_as_kiln "cd '${REPO_ROOT}' && npm prune --omit=dev"

shadowbox_enabled="$(read_env_value KILN_SHADOWBOX_ENABLED)"
shadowbox_provider="$(read_env_value KILN_SHADOWBOX_PROVIDER)"
shadowbox_command="$(read_env_value KILN_SHADOWBOX_COMMAND)"
if is_truthy "${shadowbox_enabled}" && [[ "${shadowbox_provider}" == "command" ]]; then
  log "Shadowbox command-provider enabled; validating runtime prerequisites..."
  if [[ -z "${shadowbox_command}" ]]; then
    echo "ERROR: KILN_SHADOWBOX_COMMAND is required when provider=command." >&2
    exit 1
  fi
  run_as_kiln "docker version >/dev/null"
fi

if [[ ! -f "${REFERENCE_ROOT}/INDEX.json" ]]; then
  log "Reference corpus missing — bootstrapping from mainnet RPC/TzKT..."
  run_as_kiln "
    cd '${REPO_ROOT}' && \
    KILN_REFERENCE_ROOT='${REFERENCE_ROOT}' \
    '${VENV_ROOT}/bin/python' scripts/fetch-reference-mainnet-contracts.py
  " || log "WARN: reference bootstrap failed; continuing (guided features may degrade)"
else
  log "Reference corpus present; skipping bootstrap."
fi

log "Restarting kiln.service..."
systemctl daemon-reload
systemctl restart kiln.service

log "Waiting for health endpoint ${HEALTHCHECK_URL}..."
for attempt in 1 2 3 4 5 6 7 8; do
  if curl -sf "${HEALTHCHECK_URL}" >/dev/null; then
    log "Healthy on attempt ${attempt}."
    log "Deploy complete."
    exit 0
  fi
  sleep 3
done

log "ERROR: health check did not pass. Recent journal:" >&2
journalctl -u kiln.service -n 40 --no-pager >&2 || true
exit 1
