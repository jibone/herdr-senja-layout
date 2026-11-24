#!/bin/sh
NOT_SUBSCRIBED=127
NO_READING=1
DEADLINE_ROUNDS=100
ROUTE=/api/experimental/usage/limits

OC=$(command -v "${HERDR_USAGE_OPENCODE_BIN:-opencode}" 2>/dev/null) || exit "$NOT_SUBSCRIBED"

dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-opencode-go.XXXXXX") || exit "$NO_READING"
pid=
trap '[ -z "$pid" ] || kill "$pid" 2>/dev/null; rm -rf "$dir"' EXIT
trap 'exit "$NO_READING"' HUP INT TERM

cd "$HOME" 2>/dev/null || cd /
"$OC" api GET "$ROUTE" </dev/null >"$dir/reply" 2>/dev/null &
pid=$!

rounds=0
while kill -0 "$pid" 2>/dev/null; do
  [ "$rounds" -lt "$DEADLINE_ROUNDS" ] || exit "$NO_READING"
  sleep 0.2
  rounds=$((rounds + 1))
done
wait "$pid"
answered=$?
pid=

reply=$(sed -n '/^{/,$p' "$dir/reply" | tr -d '\r\n')
compact=$(printf '%s' "$reply" | tr -d ' \t')
case "$compact" in
  *'"data":null'*) exit "$NOT_SUBSCRIBED" ;;
  *'"go":{'*) [ "$answered" -eq 0 ] && printf '%s\n' "$reply" && exit 0 ;;
  *'"data":{'*) exit "$NOT_SUBSCRIBED" ;;
  '{'*'}') printf '%s\n' "$reply" ;;
esac
exit "$NO_READING"
