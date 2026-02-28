#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3301}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/xlang-smoke-ui.log"

wait_for_server() {
  local retries=50
  local delay=0.4
  for _ in $(seq 1 "$retries"); do
    if curl -fsS "$BASE_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  echo "Server did not become ready at ${BASE_URL}" >&2
  return 1
}

assert_contains() {
  local path="$1"
  local pattern="$2"
  local html
  html="$(curl -sS "${BASE_URL}${path}")"
  if ! echo "$html" | rg -q "$pattern"; then
    echo "Expected pattern '${pattern}' was not found on route '${path}'" >&2
    return 1
  fi
}

echo "Building app..."
npm run build >/dev/null

echo "Starting app for smoke checks on port ${PORT}..."
npm run start -- -H 127.0.0.1 -p "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_server

echo "Running route assertions..."
assert_contains "/" "German videos by CEFR level"
assert_contains "/admin" "Upload Video Content"
assert_contains "/saved" "Saved Vocabulary"
assert_contains "/this-route-does-not-exist" "Not found"

echo "Smoke UI checks passed."
