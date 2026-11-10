#!/bin/sh
# Wait for CI on the current branch's PR, merge if clean. Prints ONE verdict line.
# Usage: scripts/ci_merge.sh   (run in the batch worktree, after the PR exists)
URL=$(gh pr view --json url --jq .url) || { echo "no PR"; exit 1; }
watch() { MSG=$(gh pr checks --watch --fail-fast --interval 30 2>&1); }
sleep 20
watch && rc=0 || rc=$?
case $MSG in *"no checks reported"*) sleep 30; watch && rc=0 || rc=$?
  case $MSG in *"no checks reported"*) echo "no CI checks $URL"; exit 1;; esac;;
esac
[ $rc -eq 0 ] || { echo "CI failed $URL"; exit 1; }

SHA=$(git rev-parse HEAD)
RUNS=$(gh api "repos/{owner}/{repo}/commits/$SHA/check-runs")
ALERT=$(echo "$RUNS" | jq -r '.check_runs[] | select(.conclusion != "success") | .name' | head -1)
if [ -z "$ALERT" ]; then
  for id in $(echo "$RUNS" | jq -r '.check_runs[].id'); do
    ALERT=$(gh api "repos/{owner}/{repo}/check-runs/$id/annotations" \
      --jq '.[] | select(.annotation_level != "notice") | "\(.annotation_level): \(.message)"' | head -1)
    [ -n "$ALERT" ] && break
  done
fi
[ -z "$ALERT" ] && [ "$(gh pr view --json comments,reviews --jq '(.comments | length) + (.reviews | length)')" != 0 ] && ALERT="PR has comments/reviews"
[ -n "$ALERT" ] && { echo "alert, not merged $URL: $ALERT"; exit 1; }

if OUT=$(gh pr merge --rebase 2>&1); then echo "merged $URL"; else echo "merge refused: $OUT"; exit 1; fi
