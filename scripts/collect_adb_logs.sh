#!/usr/bin/env bash
# ==============================================================================
# RescueNet Multi-Device ADB Log Collector & Unified Timeline Generator (Phase 15)
# Queries all connected Android handsets via ADB, streams RescueNet logcat tags,
# and merges them into a synchronized chronological timeline.
# ==============================================================================

set -euo pipefail

OUTPUT_DIR="./logs/field_test_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"
TIMELINE_FILE="$OUTPUT_DIR/unified_timeline.log"

echo "================================================================="
echo "🔍 Discovering connected Android handsets via ADB..."
echo "================================================================="

DEVICES=$(adb devices | grep -v "List" | awk '{print $1}' | tr -d '\r' | grep -v '^$' || true)

if [ -z "$DEVICES" ]; then
    echo "⚠️  No Android devices detected. Connect phones via USB or ADB-over-Wi-Fi."
    exit 1
fi

DEVICE_COUNT=$(echo "$DEVICES" | wc -l)
echo "✓ Detected $DEVICE_COUNT connected device(s):"

PIDS=()
for SERIAL in $DEVICES; do
    MODEL=$(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')
    LOG_FILE="$OUTPUT_DIR/${SERIAL}_${MODEL}.log"
    echo "   📱 Device [$SERIAL] ($MODEL) -> Logging to $LOG_FILE"

    # Stream filtered logcat with UTC timestamps
    adb -s "$SERIAL" logcat -v time -s RescueNet:* RescueMesh:* RescueBle:* ReactNativeJS:* > "$LOG_FILE" 2>&1 &
    PIDS+=($!)
done

echo ""
echo "🚀 Collecting multi-hop packet logs in real time. Press [Ctrl+C] to stop and merge timeline..."

trap cleanup INT TERM

cleanup() {
    echo ""
    echo "🛑 Halting log collection across all devices..."
    for PID in "${PIDS[@]}"; do
        kill "$PID" 2>/dev/null || true
    done

    echo "📊 Merging per-device logs into chronological unified timeline: $TIMELINE_FILE"
    
    # Prefix each log line with device identifier and sort by timestamp
    for SERIAL in $DEVICES; do
        MODEL=$(adb -s "$SERIAL" shell getprop ro.product.model 2>/dev/null || echo "Unknown")
        LOG_FILE="$OUTPUT_DIR/${SERIAL}_${MODEL}.log"
        if [ -f "$LOG_FILE" ]; then
            awk -v dev="[$MODEL|$SERIAL]" '{print $0, dev}' "$LOG_FILE"
        fi
    done | sort -k1,2 > "$TIMELINE_FILE"

    echo "✨ Multi-device timeline generated: $TIMELINE_FILE"
    exit 0
}

while true; do
    sleep 1
done
