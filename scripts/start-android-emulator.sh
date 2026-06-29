#!/usr/bin/env bash
# Start the Android emulator and forward the Vite dev server port into it.
#
# Usage:
#   ./scripts/start-android-emulator.sh                # default AVD, port 5173
#   AVD=My_Other_AVD PORT=3000 ./scripts/start-android-emulator.sh
#   ./scripts/start-android-emulator.sh --no-reverse   # skip adb reverse
#   ./scripts/start-android-emulator.sh --cold         # skip snapshot, full cold boot
#
# After boot, in the emulator's Chrome browser open:
#   http://localhost:<PORT>
# (works as a secure context thanks to `adb reverse`)

set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"

if [[ ! -x "$EMULATOR_BIN" ]]; then
    echo "Error: emulator not found at $EMULATOR_BIN" >&2
    echo "Set ANDROID_HOME or install the Android SDK." >&2
    exit 1
fi

# Pick AVD: env override, else first available
if [[ -n "${AVD:-}" ]]; then
    AVD_NAME="$AVD"
else
    AVD_NAME="$("$EMULATOR_BIN" -list-avds | head -n1)"
fi

if [[ -z "$AVD_NAME" ]]; then
    echo "Error: no AVDs found. Create one with Android Studio's Device Manager." >&2
    exit 1
fi

PORT="${PORT:-5173}"
DO_REVERSE=1
COLD_BOOT=0

for arg in "$@"; do
    case "$arg" in
        --no-reverse) DO_REVERSE=0 ;;
        --cold)       COLD_BOOT=1 ;;
        -h|--help)
            sed -n '2,14p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

# Already running?
if "$ADB" devices | grep -qE '^emulator-[0-9]+\s+device$'; then
    echo "An emulator is already running."
    "$ADB" devices
else
    echo "Starting AVD: $AVD_NAME"
    LOG=/tmp/emulator-$AVD_NAME.log
    EXTRA=()
    [[ $COLD_BOOT -eq 1 ]] && EXTRA+=(-no-snapshot-load)
    nohup "$EMULATOR_BIN" -avd "$AVD_NAME" \
        -gpu host \
        -accel on \
        -netdelay none -netspeed full \
        -no-boot-anim \
        "${EXTRA[@]}" \
        > "$LOG" 2>&1 &
    disown
    echo "Emulator PID $! (logs: $LOG)"

    echo -n "Waiting for device"
    "$ADB" wait-for-device
    until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]]; do
        echo -n "."
        sleep 2
    done
    echo " booted."
fi

if [[ $DO_REVERSE -eq 1 ]]; then
    echo "Forwarding host port $PORT into emulator (adb reverse tcp:$PORT)"
    "$ADB" reverse tcp:"$PORT" tcp:"$PORT"
    echo
    echo "  Inside the emulator's Chrome, open:  http://localhost:$PORT"
    echo
fi

"$ADB" devices
