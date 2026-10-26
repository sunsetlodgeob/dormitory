#!/bin/sh
# 確認をぜんぶ動かす（ブラウザの確認 tests/e2e/*.test.js と、Apps Script の確認 tests/gas/run.js）
#   sh tests/run-all.sh                 … ぜんぶ（30 分ほど）
#   sh tests/run-all.sh home meibo      … 名前に home か meibo を含むものだけ
#   PORT=8821 sh tests/run-all.sh       … ポートを変える（ふだんは、それぞれの確認に割り当てたポート）
# 1 つずつ順に動かす（同じポートを使っても、ぶつからない）。
# 1 つでも失敗すると、最後に一覧を出して、終了コード 1 で終わる。
cd "$(dirname "$0")/.." || exit 1

pass=0
failed=''
logdir=${LOG_DIR:-$(mktemp -d 2>/dev/null || echo /tmp/ob-tests)}
mkdir -p "$logdir"

FILTERS="$*"
# 名前をしぼったときに、動かすものか
want() {
  [ -z "$FILTERS" ] && return 0
  for w in $FILTERS; do
    case "$1" in *"$w"*) return 0 ;; esac
  done
  return 1
}

run() {
  name=$1
  shift
  want "$name" || return 0
  log="$logdir/$name.log"
  start=$(date +%s)
  printf '%-34s ' "$name"
  if "$@" >"$log" 2>&1; then
    pass=$((pass + 1))
    echo "ok    ($(( $(date +%s) - start ))s)"
  else
    failed="$failed $name"
    echo "しっぱい ($(( $(date +%s) - start ))s)  記録：$log"
    tail -n 15 "$log" | sed 's/^/    /'
  fi
}

for f in tests/e2e/*.test.js; do
  run "$(basename "$f" .test.js)" node "$f"
done
run gas node tests/gas/run.js

echo
if [ -n "$failed" ]; then
  echo "しっぱい：$failed（ok は $pass 件）"
  exit 1
fi
echo "ぜんぶ ok（$pass 件）"
