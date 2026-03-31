#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# BL4 AIO Editor — Desktop Build Script
# Builds the web frontend + API, bundles into Electron, produces .exe installer.
#
# Usage:
#   ./desktop/build-desktop.sh            # build Windows .exe
#   ./desktop/build-desktop.sh --publish  # build + push to GitHub Releases
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/desktop"

echo "═══════════════════════════════════════════════════"
echo "  BL4 AIO Editor — Desktop Build"
echo "═══════════════════════════════════════════════════"

# 1. Build web frontend
echo ""
echo "▸ Building web frontend..."
cd "$ROOT/web"
npm run build
echo "  ✓ Web built → web/dist/"

# 2. Build API
echo ""
echo "▸ Building API..."
cd "$ROOT/api"
npm run build
echo "  ✓ API built → api/dist/"

# 3. Copy into desktop packaging dirs
echo ""
echo "▸ Copying build artifacts..."
rm -rf "$DESKTOP/web-dist" "$DESKTOP/api-dist"
cp -r "$ROOT/web/dist" "$DESKTOP/web-dist"
cp -r "$ROOT/api/dist" "$DESKTOP/api-dist"

# Also copy API data files needed at runtime
mkdir -p "$DESKTOP/api-dist/data"
cp "$ROOT/api/data/parts.json" "$DESKTOP/api-dist/data/" 2>/dev/null || true
cp "$ROOT/master_search/db/universal_parts_db.json" "$DESKTOP/api-dist/data/" 2>/dev/null || true
cp "$ROOT/api/data/legendary_effects.json" "$DESKTOP/api-dist/data/" 2>/dev/null || true
cp "$ROOT/godrolls.json" "$DESKTOP/api-dist/" 2>/dev/null || true

echo "  ✓ Artifacts copied"

# 4. Install desktop dependencies (if needed)
echo ""
echo "▸ Installing desktop dependencies..."
cd "$DESKTOP"
npm install --production=false
echo "  ✓ Dependencies installed"

# 5. Build Electron app
echo ""
echo "▸ Building Electron app..."
if [[ "${1:-}" == "--publish" ]]; then
  npx electron-builder --win --publish always
  echo "  ✓ Built + published to GitHub Releases"
else
  npx electron-builder --win
  echo "  ✓ Built → desktop/release/"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Done! Installer is in desktop/release/"
echo "═══════════════════════════════════════════════════"
