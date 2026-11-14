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
grep '^<tr id="eID"[ >]' index.html | cut -c1-80
```

Drop, and report why, any id that has no match (unknown or `data-removed`) or is already `✅` or `🔒` (the first 80 chars show it; both are done and never re-queried). Adjacent rows are fine: commits are applied one after another on one branch.

## 3. Research (parallel)

Pick the output directory from the scratchpad directory in your system prompt (never `/tmp`):

```bash
OUT=<scratchpad>/rows-$(date -u +%Y%m%d-%H%M%S); mkdir -p "$OUT"
```

One Agent call per id, all in the same message so they run in parallel, at most 10 per message (send further messages for the rest). Every call uses exactly:

- `model`: `haiku` (Haiku 5.5)
- `effort`: `medium`
- `description`: `Research eID`
- `prompt`: `Use the fill-entity skill for entity ID. Repo: <absolute path of this repo>. OUT: <absolute OUT>. Final reply: exactly one line, ok, private or FAILED: <reason>.`

Give only those things. The subagent reads the name itself.

## 4. Apply (sequential, you)

Worktree and branch, once. `<stamp>` is the `OUT` timestamp:

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git worktree add -b feat/fill-batch-<stamp> ../intern-quest-wt-fill-<stamp> origin/main
cd ../intern-quest-wt-fill-<stamp>
```

One call applies every id, in ascending order:

```bash
scripts/apply_batch.py "$OUT" 0001 0002 0003:"web search unavailable" ...
```

Pass each dispatched id: bare if its subagent replied `ok` or `private`, `ID:reason` if it replied `FAILED: reason`. The script does the whole per-entity routine and prints one line per id (`eID ok` / `eID private` / `eID FAILED: reason`):

- merges the JSON's `flags` into `adicional` as `Revisar: …` (review notes; they do not stop the commit),
- `apply_row.py`, checks `git diff --numstat` is exactly `1  1  index.html`, `check.py index.html`, commit `feat(data): fill eID`, `check.py --diff HEAD~1`,
- on any failure `git reset --hard HEAD` (keeps earlier commits) and goes on.

It writes `OUT/body.md` (the PR `## Entities` list) and `OUT/report.tsv` (id, nome, result). Do not hand-edit a bad row; `apply_row.py` is the only thing that writes one. No co-author trailers, never `--no-verify` or skip signing. If a hook or signing fails the script exits 3 with the exact error: stop the whole batch and report it.

Do not read the JSONs or `index.html` yourself.

If no commit was made, remove the worktree and report; do not open a PR.

## 5. Push, PR (once)

```bash
git push -u origin feat/fill-batch-<stamp>
gh pr create --title "feat(data): fill N entities" --body-file "$OUT/body.md"
```

Body: `OUT/body.md`, as written by step 4 (`--body-file "$OUT/body.md"`). One line per dispatched entity (a 🔒 one reads `🔒 private individual, not published`), nothing else: no research notes, no skipped ids (those only go in the final report).
 GitHub calls can time out: retry a failed `push` or `gh` up to 3 times, waiting 10, 30, 60 seconds. If it still fails, stop and report the exact error; the worktree and branch stay for a human.

## 6. Queue the merge

This skill overrides the global "never merge" rule: GitHub merges only after the required CI check passes.

```bash
scripts/ci_merge.sh
```

It turns on auto-merge (`gh pr merge --auto --rebase`) and returns at once; it does not wait for CI. It prints one verdict line: `auto-merge queued <URL>` or `merge refused: <reason>`. Never retry or bypass a refusal. A CI failure leaves the PR open for a human.

Then clean up: `cd "$(git rev-parse --git-common-dir)/.." && git worktree remove ../intern-quest-wt-fill-<stamp>` (skip it when the merge was refused, so a human can look).

## 7. Report

One table, then the counts. Rows come from `OUT/report.tsv`; a committed entity's result is the step 6 verdict line, the rest are the reasons recorded above:

```
| id    | nome                          | result                                  |
|-------|-------------------------------|-----------------------------------------|
| e0001 | Centro Doutor João dos Santos | auto-merge queued https://github.com/…/pull/12 |
| e0002 | Clínica Exemplo, Lda.         | FAILED: check.py: Telefone invalid      |
| e0003 | Escola Exemplo                | skipped: already ✅                     |
| e0004 | Fulano de Tal                 | 🔒 private individual, not published (auto-merge queued https://github.com/…/pull/12) |
| e0009 | —                             | skipped: no row                         |
```

Nome is in `report.tsv` (copied exactly from the row); ids dropped in step 2 use `—` when they have no row, else the third `<td>`. If the merge was refused, every committed id shows `not merged <reason> <PR URL>`.

A 🔒 row counts as done, not as a failure; list it as above and do not count it under FAILED.

Then: `Remaining ⬜: ` + output of `grep -c '^<tr id="e[0-9]*"><td>⬜' index.html` run on the updated `main` checkout (queued PRs are not merged yet, so they still count).

Do not retry failures automatically.
