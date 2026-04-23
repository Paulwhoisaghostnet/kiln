#!/usr/bin/env bash
# Server provisioning for the Shadownet Kiln native Hetzner deployment.
#
# Idempotent: safe to re-run. Intended to be executed as root on the Hetzner
# host (e.g. via the GitHub Actions deploy workflow's `workflow_dispatch`).
#
# What this does:
#   1. Installs system-level packages (Node 22, Python, zip, jq).
#   2. Creates the `kiln` service user + runtime directories.
#   3. Creates the Python virtualenv + installs requirements.
#   4. Clones (or fast-forwards) the repo at /opt/platform/repos/shadownet-kiln.
#   5. Installs/refreshes the kiln.service systemd unit from the repo copy.
#   6. Enables the service (but does NOT start it here; server-deploy.sh
#      performs the first build + restart).
#
# Preconditions:
#   - Run as root.
#   - Outbound HTTPS available (for nodesource + git clone).
#   - `.env` for kiln already staged at /opt/platform/repos/shadownet-kiln/.env
#     OR will be scp'd before the first `systemctl start kiln`.
#
# Intentionally does not touch the WTF docker stack.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "server-provision.sh must be run as root" >&2
  exit 1
fi

REPO_URL="${KILN_REPO_URL:-https://github.com/Paulwhoisaghostnet/kiln.git}"
REPO_BRANCH="${KILN_REPO_BRANCH:-main}"
REPO_ROOT="/opt/platform/repos/shadownet-kiln"
VENV_ROOT="/opt/platform/venvs/kiln"
LOG_ROOT="/var/log/kiln"
DATA_ROOT="/var/lib/kiln"
SERVICE_USER="kiln"
SERVICE_FILE_SRC="${REPO_ROOT}/infrastructure/systemd/kiln.service"
SERVICE_FILE_DST="/etc/systemd/system/kiln.service"

log() { printf '[kiln-provision] %s\n' "$*"; }

log "Ensuring system packages (Node 22, python3-venv, zip, jq, git, curl)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git zip jq python3 python3-venv python3-pip ca-certificates gnupg

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE '^v22\.'; then
  log "Installing Node.js 22.x from nodesource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker CLI missing; attempting install..."
  if ! apt-get install -y docker.io; then
    log "docker.io install failed, trying Docker CE package set..."
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
fi

log "Node version: $(node --version), npm: $(npm --version)"
log "Python version: $(python3 --version)"
if command -v docker >/dev/null 2>&1; then
  log "Docker version: $(docker --version)"
else
  log "WARN: Docker CLI still missing; shadowbox command provider will not work."
fi

log "Ensuring service user and directories..."
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${REPO_ROOT}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

log "Ensuring Docker daemon + access for ${SERVICE_USER}..."
systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker >/dev/null 2>&1 || true
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "${SERVICE_USER}" || true
else
  log "WARN: docker group missing; shadowbox command provider may fail."
fi

mkdir -p "${REPO_ROOT%/*}" "${VENV_ROOT%/*}" "${LOG_ROOT}" "${DATA_ROOT}/exports" "${DATA_ROOT}/reference"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${LOG_ROOT}" "${DATA_ROOT}"

log "Ensuring repo clone at ${REPO_ROOT}..."
if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  rm -rf "${REPO_ROOT}"
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "${REPO_ROOT}"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${REPO_ROOT}"

log "Ensuring Python virtualenv at ${VENV_ROOT}..."
if [[ ! -x "${VENV_ROOT}/bin/python" ]]; then
  python3 -m venv "${VENV_ROOT}"
fi
"${VENV_ROOT}/bin/pip" install --upgrade pip >/dev/null
if [[ -f "${REPO_ROOT}/requirements.txt" ]]; then
  "${VENV_ROOT}/bin/pip" install -r "${REPO_ROOT}/requirements.txt"
fi
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${VENV_ROOT}"

if [[ -f "${SERVICE_FILE_SRC}" ]]; then
  log "Installing systemd unit from repo copy..."
  install -m 0644 "${SERVICE_FILE_SRC}" "${SERVICE_FILE_DST}"
  systemctl daemon-reload
  systemctl enable kiln.service >/dev/null
else
  log "WARN: ${SERVICE_FILE_SRC} missing; skipping systemd unit install"
fi

log "Provisioning complete."
log "Next step: run scripts/server-deploy.sh (or the deploy-hetzner workflow)."
log "Remember: .env must exist at ${REPO_ROOT}/.env before first start."
