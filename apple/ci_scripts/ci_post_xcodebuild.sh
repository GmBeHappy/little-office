#!/bin/sh
set -eu

# Validate the signed archive, not only source settings.
if [ "${CI_XCODEBUILD_ACTION:-}" != archive ] || [ "${CI_XCODEBUILD_EXIT_CODE:-0}" != 0 ]; then
    exit 0
fi

if [ "${CI_PRODUCT_PLATFORM:-}" = macOS ]; then
    entitlements=$(mktemp)
    trap 'rm -f "$entitlements"' EXIT HUP INT TERM
    codesign --display --entitlements - --xml "${CI_ARCHIVE_PATH:?}/Products/Applications/Little Office.app" > "$entitlements"
    # WebRTC uses UDP: sandboxed UDP needs both outgoing and incoming access.
    for permission in com.apple.security.app-sandbox com.apple.security.network.client com.apple.security.network.server; do
        if [ "$(/usr/libexec/PlistBuddy -c "Print :$permission" "$entitlements")" != true ]; then
            echo "error: macOS media archive requires $permission" >&2
            exit 1
        fi
    done
    printf '%s\n' 'macOS sandbox and media network entitlements validated.'
    exit 0
fi

if [ "${CI_PRODUCT_PLATFORM:-}" != iOS ]; then
    exit 0
fi

# ASC error 90362: ReplayKit process mode must be in NSExtension.
plist="${CI_ARCHIVE_PATH:?}/Products/Applications/Little Office.app/PlugIns/LittleOfficeBroadcast.appex/Info.plist"
mode=$(/usr/libexec/PlistBuddy -c 'Print :NSExtension:RPBroadcastProcessMode' "$plist")
if [ "$mode" != RPBroadcastProcessModeSampleBuffer ]; then
    echo 'error: Broadcast extension requires NSExtension.RPBroadcastProcessMode = RPBroadcastProcessModeSampleBuffer' >&2
    exit 1
fi
printf '%s\n' 'Broadcast extension packaging validated.'
