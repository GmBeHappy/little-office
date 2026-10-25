#!/bin/sh
set -eu

# Validate the packaged extension, not just the source plist (ASC error 90362).
if [ "${CI_PRODUCT_PLATFORM:-}" != iOS ] || [ "${CI_XCODEBUILD_ACTION:-}" != archive ] || [ "${CI_XCODEBUILD_EXIT_CODE:-0}" != 0 ]; then
    exit 0
fi

plist="${CI_ARCHIVE_PATH:?}/Products/Applications/Little Office.app/PlugIns/LittleOfficeBroadcast.appex/Info.plist"
mode=$(/usr/libexec/PlistBuddy -c 'Print :NSExtension:RPBroadcastProcessMode' "$plist")
if [ "$mode" != RPBroadcastProcessModeSampleBuffer ]; then
    echo 'error: Broadcast extension requires NSExtension.RPBroadcastProcessMode = RPBroadcastProcessModeSampleBuffer' >&2
    exit 1
fi
printf '%s\n' 'Broadcast extension packaging validated.'
