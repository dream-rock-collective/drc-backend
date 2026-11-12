#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
export PATH="$temp:$PATH"
export PG_TEST_CALL="$temp/call"

cat > "$temp/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$PWD" == "$PG_TEST_ROOT" ]]
[[ "$1 $2 $3 $4 $5 $6" == 'compose exec -T postgres sh -c' ]]
printf '%s' "$7" > "$PG_TEST_CALL"
if [[ "$7" == *pg_restore* ]]; then
  cat > "$PG_TEST_CALL.input"
fi
exit "${PG_TEST_EXIT:-0}"
SH
chmod +x "$temp/docker"
export PG_TEST_ROOT="$root"
cd "$temp"

"$root/scripts/pg-dump" > /dev/null
[[ $(cat "$PG_TEST_CALL") == *'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom'* ]]
printf 'archive' | "$root/scripts/pg-import"
[[ $(cat "$PG_TEST_CALL") == *'--clean --if-exists --no-owner --no-acl --single-transaction' ]]
[[ $(cat "$PG_TEST_CALL.input") == archive ]]
if "$root/scripts/pg-dump" unexpected 2>/dev/null; then exit 1; fi
if "$root/scripts/pg-import" unexpected < /dev/null 2>/dev/null; then exit 1; fi
export PG_TEST_EXIT=7
status=0
"$root/scripts/pg-dump" || status=$?
[[ "$status" == 7 ]]
status=0
"$root/scripts/pg-import" < /dev/null || status=$?
[[ "$status" == 7 ]]
echo 'Database transfer script checks passed.'
