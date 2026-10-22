#!/bin/sh
set -eu

# Fixtures are checked in, so Apple builds do not need the web toolchain or a database.
apple_directory="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
swift test --package-path "$apple_directory/LittleOfficeKit"
