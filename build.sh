#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -d "node_modules" ]; then
    echo "Installing workspace dependencies..."
    npm install
fi

# ==========================================
# 1. Build Rust/WASM
# ==========================================
pushd demangle >/dev/null

if [ -d "/opt/wasi-sdk" ]; then
    export WASI_SDK_PATH="/opt/wasi-sdk"
    export CXX_wasm32_wasi="$WASI_SDK_PATH/bin/clang++"
    export CC_wasm32_wasi="$WASI_SDK_PATH/bin/clang"
    export AR_wasm32_wasi="$WASI_SDK_PATH/bin/llvm-ar"
    export RUSTFLAGS="-L ${WASI_SDK_PATH}/share/wasi-sysroot/lib/wasm32-wasi"
fi

echo "Building WASM..."
wasm-pack build --target web

echo "Patching JS Glue..."
JS_FILE="pkg/demangle.js"
perl -i -pe 'BEGIN{undef $/;} s/import\s*\*\s*as\s+([a-zA-Z0-9_]+)\s+from\s*.wasi_snapshot_preview1.;/
const $1 = {
    fd_write: function() { return 0; },
    fd_close: function() { return 0; },
    fd_seek: function() { return 0; },
};
/smg' "$JS_FILE"

popd >/dev/null

WORKER_SRC_WASM="worker/src/wasm"
CXXFILT_WASM="cxxfilt/wasm"
mkdir -p "$WORKER_SRC_WASM" "$CXXFILT_WASM"

echo "Copying demangle WASM into worker src..."
cp demangle/pkg/demangle_bg.wasm "$WORKER_SRC_WASM/"
cp demangle/pkg/demangle.js "$WORKER_SRC_WASM/"

echo "Copying demangle glue into cxxfilt/wasm..."
cp demangle/pkg/demangle.d.ts "$CXXFILT_WASM/"
cp demangle/pkg/demangle.js "$CXXFILT_WASM/"
cp demangle/pkg/demangle_bg.wasm "$CXXFILT_WASM/"

# ==========================================
# 2. Build Frontends into a staging dir, swap atomically
# ==========================================
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/cxxfilt-public.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

echo "Building cxxfilt..."
npm run build -w cxxfilt-web

echo "Staging cxxfilt assets..."
cp cxxfilt/index.html "$STAGE/"
cp cxxfilt/styles.css "$STAGE/"
mkdir -p "$STAGE/dist" "$STAGE/wasm"
cp -R cxxfilt/dist/. "$STAGE/dist/"
cp demangle/pkg/demangle_bg.wasm "$STAGE/wasm/"
cp demangle/pkg/demangle.js "$STAGE/wasm/"

echo "Building cxxlayout..."
npm run build -w cxxlayout

echo "Staging cxxlayout assets..."
mkdir -p "$STAGE/layout/dist" "$STAGE/layout/wasm"
cp cxxlayout/index.html "$STAGE/layout/"
cp cxxlayout/styles.css "$STAGE/layout/"
cp -R cxxlayout/dist/. "$STAGE/layout/dist/"
cp -R cxxlayout/wasm/. "$STAGE/layout/wasm/"

PUBLIC="worker/public"
OLD="${PUBLIC}.old"
if [ -d "$PUBLIC" ]; then
    rm -rf "$OLD"
    mv "$PUBLIC" "$OLD"
fi
mv "$STAGE" "$PUBLIC"
trap - EXIT
rm -rf "$OLD"

echo "Build complete! Ready to deploy from worker/."
