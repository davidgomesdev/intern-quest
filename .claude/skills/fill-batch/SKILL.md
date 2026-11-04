---
name: fill-batch
description: Use when given a list of OPP protocol numbers (optionally a Cidade, default Lisboa, and a count N; or nothing for 5 random Lisboa ones) to fill in index.html, one subagent per entity.
---

# Fill a batch of entities

You dispatch; you never edit `index.html` yourself. Each entity gets one subagent running the `fill-entity` skill, and each subagent opens its own PR.

## 1. Build the id list

Args: an optional city (any non-numeric words, e.g. `Lisboa`, `Vila Nova de Gaia`) followed by an optional count N, or a list of ids. City defaults to `Lisboa`.

- `Lisboa 5` → 5 from Lisboa. `5` → 5 from Lisboa. `Porto 3` → 3 from Porto. Nothing → 5 random from Lisboa.
- Explicit ids: zero-pad each to at least 4 digits (`7` → `0007`). The city is ignored.

Unfilled rows have an empty Cidade cell, so the city is matched against the Nome (case-insensitive). Entities in the city whose name omits it are not picked up; that is a known limit.

Count N: first N matching unfilled rows. Nothing: 5 random ones. `CITY` is the city, as given.

```bash
grep -i '^<tr id="e[0-9]*"><td>⬜.*CITY' index.html | grep -o '^<tr id="e[0-9]*"' | grep -o '[0-9]\{4,\}' | head -N              # count
grep -i '^<tr id="e[0-9]*"><td>⬜.*CITY' index.html | grep -o '^<tr id="e[0-9]*"' | grep -o '[0-9]\{4,\}' | sort -R | head -5   # random
```

If fewer than N match, use what there is and say so in the report.

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

Do not retry failures automatically, and never merge a PR yourself. Each subagent merges its own PR only after CI passes; a PR whose CI failed stays open for a human.
