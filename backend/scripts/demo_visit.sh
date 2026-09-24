#!/usr/bin/env bash
# Usage: scripts/demo_visit.sh demo_photos/counter_bad.jpg [merchant_id] [fse_id]
set -euo pipefail
API=${API:-http://localhost:8000/api}
PHOTO=$1; MID=${2:-1}; FID=${3:-1}
read LAT LNG < <(curl -s "$API/merchants/$MID" | python3 -c 'import sys,json; m=json.load(sys.stdin)["merchant"]; print(m["lat"], m["lng"])')
VISIT=$(curl -s -F merchant_id=$MID -F fse_id=$FID -F lat=$LAT -F lng=$LNG -F capture_source=camera \
  -F captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) -F analyze=true -F "photo=@$PHOTO;type=image/jpeg" "$API/visits")
ID=$(echo "$VISIT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "visit $ID created"
for _ in $(seq 1 60); do
  STATUS=$(curl -s "$API/visits/$ID" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
  [ "$STATUS" != "analyzing" ] && break; sleep 1
done
curl -s "$API/visits/$ID" | python3 -c '
import sys, json
v = json.load(sys.stdin)
for s in v["pipeline_log"]:
    step, summary = s["step"], s["summary"]
    print(f"  {step:<18} {summary}")
print("status:", v["status"], "| decision:", v["decision"], "| authenticity:", v["authenticity"]["score"], v["authenticity"]["verdict"])'
