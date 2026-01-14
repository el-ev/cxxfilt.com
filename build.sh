#!/bin/bash
set -e

cd demangle

export WASI_SDK_PATH="/opt/wasi-sdk"

export CXX_wasm32_wasi="$WASI_SDK_PATH/bin/clang++"
export CC_wasm32_wasi="$WASI_SDK_PATH/bin/clang"
export AR_wasm32_wasi="$WASI_SDK_PATH/bin/llvm-ar"
export RUSTFLAGS="-L ${WASI_SDK_PATH}/share/wasi-sysroot/lib/wasm32-wasi"

echo "Building WASM..."
wasm-pack build --target web

if [ $? -ne 0 ]; then
    echo "WASM build failed"
    exit 1
fi

echo "Patching JS Glue..."

JS_FILE="pkg/demangle.js"

perl -i -pe 'BEGIN{undef $/;} s/import\s*\*\s*as\s+([a-zA-Z0-9_]+)\s+from\s*.wasi_snapshot_preview1.;/
const $1 = {
    fd_write: function() { return 0; },
    fd_close: function() { return 0; },
    fd_seek: function() { return 0; },
};
/smg' "$JS_FILE"

SITE_DIR="../cxxfilt.com"

echo "Copying to worker..."
cp pkg/demangle_bg.wasm $SITE_DIR/src/wasm/
cp pkg/demangle.js $SITE_DIR/src/wasm/
cp pkg/demangle.d.ts $SITE_DIR/src/wasm/

echo "Copying to static assets..."
mkdir -p $SITE_DIR/public/wasm/
cp pkg/demangle_bg.wasm $SITE_DIR/public/wasm/
cp pkg/demangle.js $SITE_DIR/public/wasm/
cp pkg/demangle.d.ts $SITE_DIR/public/wasm/

echo "Build complete!"
