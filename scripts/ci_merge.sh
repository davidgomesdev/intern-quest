#!/bin/sh
# Queue the current branch's PR to rebase-merge once required checks pass. Prints ONE verdict line.
# No polling: GitHub merges it (or doesn't, if CI fails). Saves the GraphQL budget.
# Usage: scripts/ci_merge.sh   (run in the batch worktree, after the PR exists)
URL=$(gh pr view --json url --jq .url) || { echo "no PR"; exit 1; }
# Without required checks, --auto merges at once, skipping CI. Refuse instead.
gh api "repos/{owner}/{repo}/branches/main/protection/required_status_checks" >/dev/null 2>&1 \
  || { echo "merge refused: main has no required status checks $URL"; exit 1; }
if OUT=$(gh pr merge --auto --rebase 2>&1); then echo "auto-merge queued $URL"; else echo "merge refused: $OUT"; exit 1; fi
