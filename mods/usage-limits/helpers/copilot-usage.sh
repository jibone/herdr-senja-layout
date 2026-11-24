#!/bin/sh
NOT_INSTALLED=127
NO_READING=1
LOGIN_SHELL_DEADLINE_ROUNDS=50
TOKEN_MARK=herdr-usage-limits-token=
PRINT_TOKEN="printf '\\n%s%s\\n' \"\$0\" \"\${GH_TOKEN:-\$GITHUB_TOKEN}\""
FIELDS='{plan: .copilot_plan, reset: .quota_reset_date_utc, quotas: .quota_snapshots}'

GH=$(command -v "${HERDR_USAGE_GH_BIN:-gh}" 2>/dev/null) || exit "$NOT_INSTALLED"

dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-copilot-usage.XXXXXX") || exit "$NO_READING"
trap 'rm -rf "$dir"' EXIT

ask_gh() {
  "$GH" api /copilot_internal/user --jq "$FIELDS" </dev/null >"$dir/out" 2>"$dir/err"
}

token_your_terminal_sets() {
  "${SHELL:-/bin/sh}" -ilc "$PRINT_TOKEN" "$TOKEN_MARK" </dev/null >"$dir/shell" 2>/dev/null &
  pid=$!
  i=0
  while [ "$i" -lt "$LOGIN_SHELL_DEADLINE_ROUNDS" ] && kill -0 "$pid" 2>/dev/null; do
    sleep 0.2
    i=$((i + 1))
  done
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  sed -n "s/^$TOKEN_MARK//p" "$dir/shell" | tail -1
}

ask_gh_with_your_terminals_token() {
  token=$(token_your_terminal_sets)
  [ -n "$token" ] || return 1
  GH_TOKEN=$token "$GH" api /copilot_internal/user --jq "$FIELDS" </dev/null >"$dir/out" 2>"$dir/err"
}

if ask_gh || { grep -q 'gh auth login' "$dir/err" && ask_gh_with_your_terminals_token; }; then
  grep -m1 '^{' "$dir/out" && exit 0
fi
if grep -q 'HTTP 404' "$dir/err"; then exit "$NOT_INSTALLED"; fi
if grep -q 'gh auth login' "$dir/err"; then
  printf '%s\n' '{"error":"gh is not signed in: run gh auth login"}'
fi
exit "$NO_READING"
