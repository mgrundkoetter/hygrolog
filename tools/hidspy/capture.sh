#!/bin/zsh
# Records the USB-HID traffic between ElitechLog and the logger (macOS only).
# Builds the interposer, makes an ad-hoc signed copy of ElitechLog (the original stays untouched)
# and starts it with the interposer loaded. Packets land in hid.log next to this script.
set -euo pipefail
cd "${0:A:h}"
WORK="${TMPDIR:-/tmp}/hygrolog-hidspy"
mkdir -p "$WORK"

clang -dynamiclib -arch arm64 -arch x86_64 -framework IOKit -framework CoreFoundation -o "$WORK/hidspy.dylib" hidspy.c

rm -rf "$WORK/ElitechLogSpy.app"
cp -R /Applications/ElitechLog.app "$WORK/ElitechLogSpy.app"
codesign --force --deep --sign - "$WORK/ElitechLogSpy.app"

echo "Mitschnitt läuft, Pakete gehen nach $PWD/hid.log (Beenden: App schließen)"
HIDSPY_LOG="$PWD/hid.log" DYLD_INSERT_LIBRARIES="$WORK/hidspy.dylib" \
  "$WORK/ElitechLogSpy.app/Contents/MacOS/ElitechLog" > "$WORK/app.out" 2>&1
