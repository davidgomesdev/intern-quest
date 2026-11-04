---
name: fill-batch
description: Use when given a list of OPP protocol numbers (or a count N) to fill in index.html, one subagent per entity.
---

# Fill a batch of entities

You dispatch; you never edit `index.html` yourself. Each entity gets one subagent running the `fill-entity` skill, and each subagent opens its own PR.

## 1. Build the id list

Given ids: zero-pad each to at least 4 digits (`7` → `0007`).
Given a count N instead: take the first N unfilled rows.

```bash
grep -o '^<tr id="e[0-9]*"><td>⬜' index.html | head -N | grep -o '[0-9]\{4,\}'
```

## 2. Keep only dispatchable ids

For each id:

```bash
grep -n '^<tr id="eID">' index.html                 # line number + row
git ls-remote --heads origin feat/eID-fill          # open branch?
```

Drop, and report why, any id that:
- has no match (unknown or `data-removed`),
- is already `✅`,
- already has a remote branch `feat/eID-fill`.

Then drop any id whose line number is exactly 1 more than another kept id's. Neighbouring lines make their PRs conflict (SPEC §7.3). Report those as "deferred: next batch".

## 3. Spawn

One Agent call per id, all in the same message so they run in parallel, at most 10 per message. Every call uses exactly:

- `model`: `haiku` (Haiku 5.5)
- `effort`: `medium`
- `description`: `Fill eID`
- `prompt`: `Use the fill-entity skill for entity ID. Repo: <absolute path of this repo>.`

Give only the id and the repo path. The subagent reads the name itself.

## 4. Report

When all subagents finish, print one table, then the counts:

```
| id    | result                 |
|-------|------------------------|
| e0001 | https://github.com/…/pull/12 |
| e0002 | FAILED: <reason>       |
| e0003 | skipped: already ✅    |
| e0005 | deferred: next batch   |
```

Then: `Remaining ⬜: ` + output of `grep -c '^<tr id="e[0-9]*"><td>⬜' index.html`.

Do not retry failures automatically, and never merge a PR. A human reviews each one.
