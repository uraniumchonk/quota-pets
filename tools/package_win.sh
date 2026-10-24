#!/usr/bin/env bash
# Build dist/quota-pets-win-x64.zip from the official Electron Windows zip + app/.
set -euo pipefail
cd "$(dirname "$0")/.."
VER=44.7.0
Z=dist/electron-v$VER-win32-x64.zip
mkdir -p dist
[ -f "$Z" ] || curl -sSL -o "$Z" https://github.com/electron/electron/releases/download/v$VER/$(basename "$Z")
OUT=dist/QuotaPets
rm -rf "$OUT" && mkdir -p "$OUT"
unzip -q "$Z" -d "$OUT"
mv "$OUT/electron.exe" "$OUT/QuotaPets.exe"
rm -f "$OUT/resources/default_app.asar"
mkdir -p "$OUT/resources/app"
cp -r app/main.cjs app/winbind.cjs app/preload.cjs app/package.json app/icon.png app/renderer app/pets "$OUT/resources/app/"
cp README.zh-TW.md "$OUT/說明.md"; cp README.md LICENSE ART-LICENSE.md AGENTS.md "$OUT/"
if [ -f dist/rcedit-x64.exe ] && command -v wine >/dev/null; then
  cp app/icon.ico dist/icon.ico
  WINEDEBUG=-all wine dist/rcedit-x64.exe "$OUT/QuotaPets.exe" --set-icon dist/icon.ico \
    --set-version-string ProductName "QuotaPets" --set-version-string FileDescription "QuotaPets" >/dev/null 2>&1 || echo "rcedit failed, keeping default icon"
fi
(cd dist && rm -f quota-pets-win-x64.zip && zip -qr -9 quota-pets-win-x64.zip QuotaPets)
ls -la dist/quota-pets-win-x64.zip
