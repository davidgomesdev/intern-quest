---
name: fill-batch
description: Use when given a list of OPP protocol numbers (a count N, or nothing for 5 random ones) to fill in index.html. Subagents research in parallel; the orchestrator commits one entity per commit and opens one PR.
---

# Fill a batch of entities

Two phases. Subagents (running `fill-entity`) only research and write `OUT/eID.json`; they never touch git, `gh` or `index.html`. You, the orchestrator, are the only one who edits `index.html`, commits, pushes and talks to GitHub: one branch, one commit per entity, one PR. Nothing writes the same file, so there is nothing to race on.

## 1. Build the id list

Given ids: zero-pad each to at least 4 digits (`7` → `0007`).
Given a count N instead: take the first N unfilled rows.

```bash
grep -o '^<tr id="e[0-9]*"><td>⬜' index.html | head -N | grep -o '[0-9]\{4,\}'
```

Given nothing: take 5 random unfilled rows.

```bash
grep -o '^<tr id="e[0-9]*"><td>⬜' index.html | sort -R | head -5 | grep -o '[0-9]\{4,\}'
```

## 2. Keep only dispatchable ids

```bash
grep '^<tr id="eID"[ >]' index.html
```

Drop, and report why, any id that has no match (unknown or `data-removed`) or is already `✅`. Adjacent rows are fine: commits are applied one after another on one branch.

## 3. Research (parallel)

Pick the output directory from the scratchpad directory in your system prompt (never `/tmp`):

```bash
OUT=<scratchpad>/rows-$(date -u +%Y%m%d-%H%M%S); mkdir -p "$OUT"
```

One Agent call per id, all in the same message so they run in parallel, at most 10 per message (send further messages for the rest). Every call uses exactly:

- `model`: `haiku` (Haiku 5.5)
- `effort`: `medium`
- `description`: `Research eID`
- `prompt`: `Use the fill-entity skill for entity ID. Repo: <absolute path of this repo>. OUT: <absolute OUT>.`

Give only those three things. The subagent reads the name itself.

## 4. Apply (sequential, you)

Worktree and branch, once. `<stamp>` is the `OUT` timestamp:

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git worktree add -b feat/fill-batch-<stamp> ../intern-quest-wt-fill-<stamp> origin/main
cd ../intern-quest-wt-fill-<stamp>
```

For each id whose subagent reported `ok` and whose `OUT/eID.json` exists, in ascending order:

If the JSON has a `flags` array, the orchestrator records each flag in the row's Adicional before applying: prefix the joined flags with `Revisar: ` and append them after any existing `adicional` text, separated by `; `. Write this into the JSON's `adicional` field, never into the row by hand. Flags are review notes for a human; they do not stop the commit.

```bash
scripts/apply_row.py ID "$OUT/eID.json"   # builds the row from the JSON
git diff --numstat          # must print exactly: 1  1  index.html
scripts/check.py index.html
git add index.html
git commit -m "feat(data): fill eID"
scripts/check.py --diff HEAD~1      # this commit only
```

If any step fails, run `git reset --hard HEAD` (drops that entity's half-done change, keeps earlier commits), record `FAILED: <reason>` for the id, and go on to the next. Do not hand-edit a bad row; `apply_row.py` is the only thing that writes one. No co-author trailers. Never use `--no-verify` or skip signing. If a hook or signing fails, stop the whole batch and report the exact error.

If no commit was made, remove the worktree and report; do not open a PR.

## 5. Push, PR (once)

```bash
git push -u origin feat/fill-batch-<stamp>
gh pr create --title "feat(data): fill N entities" --body "<body>"
```

Body: a `## Entities` list with one line per entity you dispatched in step 3, written after every subagent has finished and step 4 is done:

- committed: `- eID (NOME): ok, URL1, URL2` (URLs from the `sources` array of its JSON; `no sources found` if empty)
- failed at any stage (subagent `FAILED`, missing JSON, `apply_row.py` or `check.py` error): `- eID (NOME): FAILED: <reason>`

Nothing else per entity: no research notes, no skipped ids (those only go in the final report). Use `—` for NOME when the subagent never found a row.
 GitHub calls can time out: retry a failed `push` or `gh` up to 3 times, waiting 10, 30, 60 seconds. If it still fails, stop and report the exact error; the worktree and branch stay for a human.

## 6. Wait for CI, merge

This skill overrides the global "never merge" rule: merge only after CI succeeds with no warnings or alerts.

```bash
sleep 20   # let checks register
gh pr checks --watch --fail-fast
```

- Exit 0 (all pass): look for alerts before merging:

  ```bash
  SHA=$(git rev-parse HEAD)
  # every check must be exactly "success" (neutral, skipped, etc. count as alerts)
  gh api repos/{owner}/{repo}/commits/$SHA/check-runs --jq '.check_runs[] | select(.conclusion != "success") | .name'
  # any warning/failure annotation on any check
  for id in $(gh api repos/{owner}/{repo}/commits/$SHA/check-runs --jq '.check_runs[].id'); do
    gh api repos/{owner}/{repo}/check-runs/$id/annotations --jq '.[] | select(.annotation_level != "notice") | "\(.annotation_level): \(.message)"'
  done
  # any review or comment on the PR
  gh pr view --json comments,reviews --jq '(.comments | length) + (.reviews | length)'
  ```

  Any output from the first two, or a count above 0 from the third, is an alert: do not merge, report `alert, not merged <PR URL>: <first alert>`. Otherwise `gh pr merge --rebase` (keeps one commit per entity on `main`; no `--delete-branch`, the branch is checked out in the worktree, and the repo deletes it on merge).
- Non-zero exit (a check failed): do not merge. Report `CI failed <PR URL>`.
- "no checks reported" after a second attempt 30s later: do not merge. Report `no CI checks <PR URL>`.
- Merge refused (conflict, branch protection): do not retry or bypass. Report `merge refused: <reason>`.

Then clean up: `cd "$(git rev-parse --git-common-dir)/.." && git worktree remove ../intern-quest-wt-fill-<stamp>` (skip it when the PR was not merged, so a human can look).

## 7. Report

One table, then the counts. A committed entity's result is the PR URL plus its merge state; the rest are the reasons recorded above:

```
| id    | nome                          | result                                  |
|-------|-------------------------------|-----------------------------------------|
| e0001 | Centro Doutor João dos Santos | merged https://github.com/…/pull/12     |
| e0002 | Clínica Exemplo, Lda.         | FAILED: check.py: Telefone invalid      |
| e0003 | Escola Exemplo                | skipped: already ✅                     |
| e0009 | —                             | skipped: no row                         |
```

Nome is the third `<td>` of the row from step 2 (copy it exactly). Use `—` only when the id has no row. If the PR did not merge (alert, CI failed, refused), every committed id shows `not merged <reason> <PR URL>`.

Then: `Remaining ⬜: ` + output of `grep -c '^<tr id="e[0-9]*"><td>⬜' index.html` run on the updated `main` checkout.

Do not retry failures automatically.
