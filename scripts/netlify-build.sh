#!/usr/bin/env bash
# Netlify production build: static site + bundle a Linux CPython with smartpy-tezos for the API function.
# Netlify Functions (Node) do not ship system Python; the standalone interpreter is copied into the zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

install_portable_python_linux() {
  local arch="$1"
  local release="20241016"
  local pyver="3.12.7+20241016"
  local name="cpython-${pyver}-${arch}-unknown-linux-gnu-install_only.tar.gz"
  local url="https://github.com/indygreg/python-build-standalone/releases/download/${release}/${name}"

  echo "[netlify-build] Downloading ${name}..."
  rm -rf vendor/kiln-python
  mkdir -p vendor
  curl -fsSL "$url" | tar -xz -C vendor
  if [ -d vendor/python ]; then
    mv vendor/python vendor/kiln-python
  else
    echo "[netlify-build] Expected vendor/python after extract from ${url}" >&2
    exit 1
  fi

  local pybin=""
  for cand in vendor/kiln-python/bin/python3.13 vendor/kiln-python/bin/python3.12 vendor/kiln-python/bin/python3.11 vendor/kiln-python/bin/python3.10 vendor/kiln-python/bin/python3; do
    if [ -x "${cand}" ]; then
      pybin="${cand}"
      break
    fi
  done
  if [ -z "${pybin}" ]; then
    echo "[netlify-build] No python binary under vendor/kiln-python/bin" >&2
    ls -la vendor/kiln-python/bin >&2 || true
    exit 1
  fi

  echo "[netlify-build] Installing smartpy-tezos into bundled Python (${pybin})..."
  "${pybin}" -m ensurepip --upgrade >/dev/null
  "${pybin}" -m pip install --upgrade pip setuptools wheel >/dev/null
  "${pybin}" -m pip install --no-cache-dir smartpy-tezos
}

if [ "${NETLIFY:-}" = "true" ] && [ "$(uname -s)" = "Linux" ]; then
  case "$(uname -m)" in
    x86_64) install_portable_python_linux x86_64 ;;
    aarch64) install_portable_python_linux aarch64 ;;
    *)
      echo "[netlify-build] Unsupported build arch $(uname -m); skipping bundled Python." >&2
      ;;
  esac
else
  echo "[netlify-build] Skipping bundled Python (set NETLIFY=true on Linux for production SmartPy)."
fi

echo "[netlify-build] Running Vite production build..."
npm run build
