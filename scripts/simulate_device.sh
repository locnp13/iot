#!/usr/bin/env bash
# Giả lập N thiết bị ESP32 gửi reading lên backend, đúng theo protocol
# trong IoT_Project.ino:
#   POST <serverUrl>
#   Header: Content-Type: application/json
#   Header: Authorization: Bearer <deviceToken>
#   Body:   {"cycle": int, "vRest": float, "deltaV": float, "iMax": float, "rInt": float}
#
# Token KHÔNG được sinh ngẫu nhiên ở đây — mỗi thiết bị thật lấy token 1 lần
# từ dashboard ("Add device"), nên script bắt buộc người dùng truyền token vào.

set -euo pipefail

DEFAULT_URL="http://localhost:3000/api/readings"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$SCRIPT_DIR/.simulate_device_state"

usage() {
  cat <<EOF
Usage: $(basename "$0") -t <token1,token2,...> [options]

Required (chọn 1 trong 2):
  -t, --tokens <list>       Danh sách device token, phân tách bằng dấu phẩy.
                             Mỗi token ứng với đúng 1 thiết bị đã tạo trên dashboard.
  -f, --tokens-file <path>  File chứa token, mỗi dòng 1 token (thay cho -t).

Options:
  -n, --devices <N>         Số thiết bị mô phỏng. Mặc định = số token truyền vào.
                             Nếu chỉ định, N phải bằng số token (1 token = 1 thiết bị).
  -u, --url <url>           Endpoint backend (mặc định: $DEFAULT_URL)
  -c, --cycles <N>          Số chu kỳ đo gửi cho mỗi thiết bị (mặc định 1)
  -i, --interval <sec>      Thời gian nghỉ giữa các chu kỳ (mặc định 0)
  -h, --help                Hiện hướng dẫn này

Ví dụ:
  $(basename "$0") -t "tok_abc,tok_def,tok_ghi" -c 5 -i 2          # gửi vào local server ($DEFAULT_URL)
  $(basename "$0") -f devices.txt -n 10 -u https://myapp.vercel.app/api/readings
EOF
}

TOKENS=()
URL="$DEFAULT_URL"
NUM_DEVICES=0
CYCLES=1
INTERVAL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--tokens)
      IFS=',' read -r -a TOKENS <<< "$2"
      shift 2 ;;
    -f|--tokens-file)
      [[ -f "$2" ]] || { echo "Không tìm thấy file token: $2" >&2; exit 1; }
      TOKENS=()
      while IFS= read -r line; do
        [[ -n "$line" ]] && TOKENS+=("$line")
      done < "$2"
      shift 2 ;;
    -n|--devices)
      NUM_DEVICES="$2"; shift 2 ;;
    -u|--url)
      URL="$2"; shift 2 ;;
    -c|--cycles)
      CYCLES="$2"; shift 2 ;;
    -i|--interval)
      INTERVAL="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Tham số không hợp lệ: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ${#TOKENS[@]} -eq 0 ]]; then
  echo "Lỗi: phải truyền ít nhất 1 device token qua -t hoặc -f." >&2
  usage
  exit 1
fi

if [[ "$NUM_DEVICES" -eq 0 ]]; then
  NUM_DEVICES=${#TOKENS[@]}
elif [[ "$NUM_DEVICES" -ne ${#TOKENS[@]} ]]; then
  echo "Lỗi: -n $NUM_DEVICES nhưng chỉ có ${#TOKENS[@]} token. Mỗi thiết bị cần 1 token riêng." >&2
  exit 1
fi

mkdir -p "$STATE_DIR"

# Sinh số thực ngẫu nhiên trong khoảng [min, max]
RAND_COUNTER=0
rand_float() {
  local min="$1" max="$2"
  RAND_COUNTER=$((RAND_COUNTER + 1))
  local seed=$((RANDOM * 100000 + $$ + RAND_COUNTER))
  awk -v min="$min" -v max="$max" -v seed="$seed" \
    'BEGIN { srand(seed); printf "%.2f", min + rand() * (max - min) }'
}

# Đọc/tăng số chu kỳ (cycle) đã lưu cho thiết bị thứ $1, lưu ở file riêng
# để lần chạy sau tiếp tục tăng thay vì trùng cycle (server bỏ qua reading trùng cycle).
next_cycle_for() {
  local device_idx="$1"
  local f="$STATE_DIR/device_${device_idx}.cycle"
  local last=0
  [[ -f "$f" ]] && last=$(cat "$f")
  local next=$((last + 1))
  echo "$next" > "$f"
  echo "$next"
}

send_reading() {
  local device_idx="$1" token="$2"
  local cycle vRest deltaV iMax rInt

  cycle=$(next_cycle_for "$device_idx")

  # Phạm vi mô phỏng theo pin ~12V qua cầu chia áp (VOLTAGE_MULTIPLIER=4.99 trong firmware)
  vRest=$(rand_float 11.50 13.20)
  deltaV=$(rand_float 0.05 0.60)
  iMax=$(rand_float 3.0 25.0)

  # Công thức Rint giống hệt firmware: (deltaV / iMax) * 1000 (mΩ), chỉ tính khi iMax > 0.5A
  rInt=$(awk -v dv="$deltaV" -v im="$iMax" \
    'BEGIN { r = (im > 0.5) ? (dv / im) * 1000 : 0; printf "%.4f", r }')

  local payload
  payload=$(printf '{"cycle":%s,"vRest":%s,"deltaV":%s,"iMax":%s,"rInt":%s}' \
    "$cycle" "$vRest" "$deltaV" "$iMax" "$rInt")

  local tmp_resp
  tmp_resp=$(mktemp)
  local http_code
  http_code=$(curl -sk -o "$tmp_resp" -w '%{http_code}' \
    -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "$payload")
  local body
  body=$(cat "$tmp_resp")
  rm -f "$tmp_resp"

  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    echo "[device $device_idx] cycle $cycle: OK ($http_code) -> $payload"
  else
    echo "[device $device_idx] cycle $cycle: LOI ($http_code) -> $body" >&2
  fi
}

echo "Mo phong $NUM_DEVICES thiet bi, $CYCLES chu ky/thiet bi, endpoint: $URL"

for ((c = 1; c <= CYCLES; c++)); do
  for ((i = 0; i < NUM_DEVICES; i++)); do
    send_reading "$((i + 1))" "${TOKENS[$i]}"
  done
  if [[ "$c" -lt "$CYCLES" && "$INTERVAL" != "0" ]]; then
    sleep "$INTERVAL"
  fi
done
