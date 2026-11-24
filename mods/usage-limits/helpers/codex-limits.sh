#!/bin/sh
NOT_INSTALLED=127
NO_READING=1
DEADLINE_S=15
EXIT_GRACE_ROUNDS=10
SNAPSHOT_DAYS=14
NEWEST_LOGS=30

CODEX=$(command -v "${HERDR_USAGE_CODEX_BIN:-codex}" 2>/dev/null) || exit "$NOT_INSTALLED"

REPLY_TO_THE_READ='"id":2[,}]'

answered() { grep -q "$REPLY_TO_THE_READ" "$1" 2>/dev/null; }

requests_held_open_until_answered() {
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"herdr-usage-limits","version":"1.0"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"account/rateLimits/read","params":{}}'
  while [ "$(date +%s)" -lt "$end" ] && [ -f "$out" ] && ! answered "$out"; do
    sleep 0.2
  done
}

{
  dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-codex-limits.XXXXXX") || exit "$NO_READING"
  out="$dir/out"
  pid=
  trap '[ -z "$pid" ] || kill "$pid" 2>/dev/null; rm -rf "$dir"' EXIT
  trap 'exit "$NO_READING"' HUP INT TERM
  : >"$out"
  end=$(($(date +%s) + DEADLINE_S))

  requests_held_open_until_answered 2>/dev/null | "$CODEX" app-server >"$out" 2>/dev/null &
  pid=$!

  while [ "$(date +%s)" -lt "$end" ]; do
    if answered "$out"; then break; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  if answered "$out"; then
    i=0
    while [ "$i" -lt "$EXIT_GRACE_ROUNDS" ] && kill -0 "$pid" 2>/dev/null; do
      sleep 0.2
      i=$((i + 1))
    done
  fi
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null

  if grep -m1 "$REPLY_TO_THE_READ" "$out"; then exit 0; fi
  rm -rf "$dir"
  trap - EXIT HUP INT TERM
}

newest_logged_snapshot() {
  find "$1" -name '*.jsonl' -mtime -"$SNAPSHOT_DAYS" -exec ls -t {} + 2>/dev/null | head -"$NEWEST_LOGS" | while IFS= read -r f; do
    line=$(grep -h '"rate_limits":{' "$f" 2>/dev/null | tail -1)
    if [ -n "$line" ]; then
      printf '{"snapshot":%s}\n' "$line"
      break
    fi
  done
}

sessions="${CODEX_HOME:-$HOME/.codex}/sessions"
if [ -d "$sessions" ]; then
  snapshot=$(newest_logged_snapshot "$sessions")
  if [ -n "$snapshot" ]; then
    printf '%s\n' "$snapshot"
    exit 0
  fi
fi

exit "$NO_READING"
