---
name: fill-batch
description: Use when given a list of OPP protocol numbers (a count N, or nothing for 5 random ones) to fill in index.html, one subagent per entity.
---

# Fill a batch of entities

You dispatch; you never edit `index.html` yourself. Each entity gets one subagent running the `fill-entity` skill, and each subagent opens its own PR.

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
| id    | nome                         | result                       |
|-------|------------------------------|------------------------------|
| e0001 | Centro Doutor João dos Santos | https://github.com/…/pull/12 |
| e0002 | Clínica Exemplo, Lda.        | FAILED: <reason>             |
| e0003 | Escola Exemplo               | skipped: already ✅          |
| e0005 | Associação Exemplo           | deferred: next batch         |
| e0009 | —                            | skipped: no row              |
```

Nome is the third `<td>` of the row from step 2 (copy it exactly). Use `—` only when the id has no row.

Then: `Remaining ⬜: ` + output of `grep -c '^<tr id="e[0-9]*"><td>⬜' index.html`.

Do not retry failures automatically, and never merge a PR. A human reviews each one.
