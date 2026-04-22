#!/usr/bin/env bash
# Copy local .env to the Hetzner box without using git.
# Requires either:
#   export KILN_SSH_TARGET='root@<hetzner-ipv4>'
# or a single line in ../.kiln-deploy-host (same format).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${REPO_ROOT}/.ssh-local/kiln-hetzner-ed25519"
ENV="${REPO_ROOT}/.env"
HOSTFILE="${REPO_ROOT}/.kiln-deploy-host"

REMOTE="${KILN_SSH_TARGET:-}"
if [[ -z "${REMOTE}" && -f "${HOSTFILE}" ]]; then
  REMOTE="$(head -1 "${HOSTFILE}" | tr -d '\r\n' | sed 's/#.*//;s/^[[:space:]]*//;s/[[:space:]]*$//')"
fi
if [[ -z "${REMOTE}" ]]; then
  echo "Missing SSH target. Either:" >&2
  echo "  export KILN_SSH_TARGET='root@<hetzner-ipv4>'" >&2
  echo "or put that same string on line 1 of: ${HOSTFILE}" >&2
  exit 1
fi
if [[ ! -f "${KEY}" ]]; then
  echo "Missing ${KEY} (deploy private key)." >&2
  exit 1
fi
if [[ ! -f "${ENV}" ]]; then
  echo "Missing ${ENV}" >&2
  exit 1
fi

SSH_BASE=(ssh -i "${KEY}" -o StrictHostKeyChecking=accept-new)
SCP_BASE=(scp -i "${KEY}" -o StrictHostKeyChecking=accept-new)

echo "Uploading .env -> ${REMOTE}:/tmp/kiln.env.upload ..."
"${SCP_BASE[@]}" "${ENV}" "${REMOTE}:/tmp/kiln.env.upload"

echo "Installing to /opt/platform/repos/shadownet-kiln/.env (kiln:kiln, 600) ..."
"${SSH_BASE[@]}" "${REMOTE}" 'bash -s' <<'REMOTE'
set -euo pipefail
TMP=/tmp/kiln.env.upload
DEST=/opt/platform/repos/shadownet-kiln/.env
if [[ ! -d /opt/platform/repos/shadownet-kiln ]]; then
  echo "ERROR: /opt/platform/repos/shadownet-kiln missing. Run Kiln GitHub Actions provision first." >&2
  rm -f "${TMP}"
  exit 1
fi
if [[ "${EUID}" -eq 0 ]]; then
  install -m 600 -o kiln -g kiln "${TMP}" "${DEST}"
elif command -v sudo >/dev/null 2>&1; then
  sudo install -m 600 -o kiln -g kiln "${TMP}" "${DEST}"
else
  echo "ERROR: need root or sudo on the server to chown to kiln." >&2
  exit 1
fi
rm -f "${TMP}"
echo "OK: ${DEST}"
REMOTE

echo "Done."
