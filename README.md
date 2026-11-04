# intern-quest

A static page listing the 6,345 entities in the OPP (Ordem dos Psicólogos Portugueses) psychology-internship list. It is a sortable, filterable table, one `<tr>` per entity in `index.html`. AI subagents fill the contact details one row per pull request.

Live site: https://davidgomesdev.github.io/intern-quest/

The list is informational only. It is not a list of open vacancies; confirm availability with each entity.

## Row contract

One entity is exactly one line in `index.html`. Empty rows start with `⬜`, filled rows with `✅`:

    <tr id="e0001"><td>⬜</td><td>0001</td><td>Name</td><td></td> ... </tr>

The full format and validation rules are in [SPEC.md](SPEC.md) section 5. `scripts/check.py` enforces them.

## Orchestrator

    grep -m1 '^<tr id="e[0-9]*"><td>⬜' index.html   # next unfilled entity
    grep -c '^<tr id="e[0-9]*"><td>⬜' index.html    # how many remain
    scripts/sync.py                                     # import new OPP entities

`scripts/sync.py` fetches the OPP list and inserts new entities in order. It flags removed ones instead of deleting them. Use `--from FILE` for a saved copy.

## Filling one row (subagent)

1. Read the entity's line: `grep '^<tr id="e0001">' index.html`
2. Research it and replace only that line.
3. One entity per PR, on branch `feat/e0001-fill`.

CI checks that an entity PR changes exactly one row of `index.html` (same id and name, now filled) and nothing else. For a sync PR, CI validates only the row lines: each added row must be a valid empty one with a new id, or an existing row may only gain or lose `data-removed="1"`. It does not inspect other lines or files, so a reviewer must check those. A PR that changes no row passes. The `fill-entity` skill that packages these steps is not written yet.

## Checks

    scripts/test.py               # unit tests, plus a headless-Chrome page test
    scripts/check.py index.html   # validate every row

The page test is skipped when no Chrome is found (set `$CHROME` to point at one). CI sets `REQUIRE_CHROME=1`, so a missing Chrome fails the build instead.
