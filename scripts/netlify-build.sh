#!/usr/bin/env bash
# Netlify production build: static site + bundle a Linux CPython with smartpy-tezos for the API function.
# Netlify Functions (Node) do not ship system Python; the standalone interpreter is copied into the zip.
# Netlify rejects function archives over 250 MB; we aggressively prune after install (see prune_kiln_python_for_netlify).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Shrink vendor/kiln-python below Netlify's 250 MB function zip limit while keeping `import smartpy` + compile working.
prune_kiln_python_for_netlify() {
  local root="$1"
  local pybin="$2"
  [ -d "$root" ] || return 0

  echo "[netlify-build] Pruning bundled Python for Netlify size limits..."
  rm -rf "${root}/include" "${root}/share"

  shopt -s nullglob
  for lib in "${root}/lib"/python3.*; do
    [ -d "$lib" ] || continue
    rm -rf \
      "${lib}/test" \
      "${lib}/tests" \
      "${lib}/idlelib" \
      "${lib}/idle_test" \
      "${lib}/tkinter" \
      "${lib}/turtledemo" \
      "${lib}/ensurepip" \
      "${lib}/venv" \
      "${lib}/lib2to3" \
      "${lib}/pydoc_data" \
      "${lib}/sqlite3/test"
  done
  shopt -u nullglob

  # Drop SmartPy / wheel artifacts for other platforms (Linux runtime only).
  find "$root" -type f \( -name '*.exe' -o -name '*macOS*' -o -name '*windows*' -o -name '*Windows*' \) -delete 2>/dev/null || true
  find "$root" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
  find "$root" -type f -name '*.pyc' -delete 2>/dev/null || true

  # Optional test trees under smartpy (not used at compile time).
  find "$root/lib" -path '*/site-packages/smartpy*' -type d \( -name 'tests' -o -name 'test' \) -exec rm -rf {} + 2>/dev/null || true

  # Pip / wheel are not needed after smartpy-tezos is installed; setuptools stays for pkg_resources users.
  "${pybin}" -m pip uninstall -y pip wheel 2>/dev/null || true
  shopt -s nullglob
  for site in "${root}/lib"/python3.*/site-packages; do
    [ -d "$site" ] || continue
    rm -rf "${site}/pip" "${site}/pip-"*.dist-info "${site}/wheel" "${site}/wheel-"*.dist-info
  done
  shopt -u nullglob

  echo "[netlify-build] Bundled Python size after prune: $(du -sh "$root" | cut -f1)"
}

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
  prune_kiln_python_for_netlify "${ROOT}/vendor/kiln-python" "${pybin}"
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
