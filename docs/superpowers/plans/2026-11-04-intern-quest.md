# Intern Quest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the static GitHub Pages site listing the 6,345 OPP internship entities, plus the scripts and CI that let subagents fill one row per PR.

**Architecture:** `index.html` holds one `<tr>` line per entity. `app.js` reads those rows once and shows 100 at a time with filters, sort and URL-hash state. Three stdlib-Python scripts (`sync`, `check`, `test`) generate, validate and test the data file.

**Tech Stack:** Python 3 stdlib (extensionless scripts), vanilla HTML/CSS/JS, GitHub Actions, headless Chrome for the page test.

**Spec:** `SPEC.md` (authoritative) and `docs/DESIGN.md` (approved; names, wireframes and script behaviour). Where this plan restates a value, it is copied from them. Where `docs/DESIGN.md` disagrees with `SPEC.md`, the spec wins; see "Overrides" below.

## Global Constraints

- No framework, no build step, no dependencies. Python stdlib only. Vanilla JS/CSS in sibling files `app.css`, `app.js`.
- One entity = one line in `index.html`, starting at column 0: `<tr id="e0001">` + 11 `<td>` + `</tr>`. Column order: Status, Nº, Nome, Cidade, Distrito, Morada, Áreas, Adicional, Website, E-mail, Telefone.
- Ids: protocol number zero-padded to **at least** 4 digits (`e0001`, `e10000`); row regex uses `e[0-9]{4,}`.
- Status emoji: `⬜` NOT-FILLED, `✅` FILLED. Missing value on a ✅ row: `<i>indisponível</i>`; Áreas and Distrito use `<i>desconhecido</i>`. Empty cell only on ⬜ rows.
- Áreas slugs: `clinica neuropsicologia psicoterapia educacao organizacoes justica comunitaria desporto`, space-separated in the cell, plus `<i>desconhecido</i>` alone. Never both.
- Telefone stored as `+<country code> <digits>` (e.g. `+351 212 345 678`); shown as a `tel:` link whose label drops a leading `+351 `.
- Removed-from-OPP rows get `data-removed="1"` after the id; they are never deleted. Orchestrator grep: `^<tr id="e[0-9]*"><td>⬜` (skips removed rows).
- Page size 100 rows. Filters only on Nome, Cidade (text + dropdown), Distrito (dropdown), Áreas (any/all), Estado, "mostrar removidas". Every column sortable; missing values sort last in both directions.
- Source: `https://www.ordemdospsicologos.pt/pt/estagios/entidades`, `table.mainlisting`, columns `Nº Protocolo`, `Nome`. `sync` aborts below 1,000 parsed rows (override flag `--min-rows` for tests).
- Git: work in a worktree on branch `feat/initial-implementation`; conventional commits; no co-author trailers; never `--no-verify` or unsigned commits; open a PR with `gh pr create`; never merge. The repo-local git config already sets the noreply email and key `91F8FED4E82FB60F`.
- UI language Portuguese (`lang="pt-PT"`); disclaimer per SPEC 6.5 visible on the page.

## Overrides of docs/DESIGN.md (SPEC.md changed after the design was drafted)

- Row regex id group is `(\d{4,})`, not `(\d{4})`; `sync` formats ids with `f"e{n:04d}"`.
- Telefone cell rule is `\+\d{1,3}(?: ?\d+)+` (not `\d[\d ]*\d`), or `IND`.
- `enhance()` renders the phone as `<a href="tel:+351212345678">212 345 678</a>` (href = stored value without spaces; label strips leading `+351 `; other country codes show in full).

## Review Focus

- A name containing `&`, `<`, `"` or accents: `sync` must escape it, `check` must accept it, the page must show it decoded (task 3, task 5).
- OPP fetch returns an empty or partial page: `sync` aborts with a non-zero exit and leaves `index.html` byte-identical (task 3).
- Three duplicate names exist in the real data: rows are keyed by id; `sync` must not merge or drop them (task 3).
- Garbage or stale URL hash (`#p=999`, `#a=bogus`, `#ord=zzz`): page ignores unknown values, clamps the page, shows no error (task 5).
- Filter with zero matches: count reads `0 de N`, table body empty, pager buttons disabled (task 5).

---

### Task 1: `scripts/check` row and file validation

**Files:**
- Create: `scripts/check` (executable, `#!/usr/bin/env python3`), `scripts/test` (executable)

**Interfaces:**
- Produces in `check`: `check_row(line: str) -> list[str]` (empty list = valid; messages name the failing cell); `check_file(path: str) -> list[str]` (every line containing `<tr` must pass `check_row`; ids strictly ascending); CLI `scripts/check FILE` prints errors and the ⬜/✅ counts, exit 1 on any error.
- Produces in `test`: a runner that loads `check` and `sync` with `importlib.machinery.SourceFileLoader` (no `.py` extension), runs all test functions named `test_*`, exits non-zero on the first failure.

- [ ] **Step 1: Write failing tests in `scripts/test`**: `test_check_row_accepts` asserts `check_row` returns `[]` for: the ⬜ empty-row example from SPEC §5; the ✅ filled example from SPEC §5 with a `+351 212 345 678` phone; a ✅ row with every cell `<i>indisponível</i>` except Áreas and Distrito as `<i>desconhecido</i>`; a name containing `&amp;`; id `e10000`. `test_check_row_rejects` asserts non-empty for one bad line per rule: 10 cells; 12 cells; unknown status emoji; Nº not matching id; ✅ row with an empty cell; ⬜ row with a non-empty Cidade; unknown slug; duplicate slug; `<i>desconhecido</i>` together with a slug; `<i>desconhecido</i>` in Cidade; website `ftp://x`; e-mail `a@b`; phone `212345678` (no `+`); raw `&` or `<` in Nome; leading space before `<tr`.
- [ ] **Step 2: Run `python3 scripts/test`; expected FAIL** (`check` missing).
- [ ] **Step 3: Implement `check_row` and `check_file`** in `scripts/check` using the regexes and per-cell table of DESIGN §5.2, with the Overrides applied. `IND`/`DESC` allowed only on ✅ rows in the columns the table lists.
- [ ] **Step 4: Run `python3 scripts/test`; expected PASS.**
- [ ] **Step 5: Commit** `feat: add row and file validator`.

### Task 2: `scripts/check --diff`

**Files:**
- Modify: `scripts/check`, `scripts/test`

**Interfaces:**
- Consumes: `check_row`.
- Produces: `check_diff(diff_text: str, changed_files: list[str], branch: str | None) -> list[str]` (pure: takes the `--unified=0` diff of `index.html` and the `--name-only` list) implementing DESIGN §5.2 "Diff checks" (no row change = pass; entity mode; sync mode; else fail naming the line); CLI `scripts/check --diff BASE_REF [--branch NAME]` runs the two git commands against `BASE_REF...HEAD` and calls it, exit 1 on errors. Branch id regex `e(\d{4,})` must equal the row id when present in the branch name.

- [ ] **Step 1: Write failing test `test_check_diff`** that feeds `check_diff` hand-written diff strings (no git repo, no commits) for a 3-row `index.html` and asserts: fill of one row → `[]`; fill of one row with branch `feat/e0002-fill` and row `e0001` → error; two rows filled → error; Nome changed → error; filled row with `data-removed` added → error; a non-row line of `index.html` changed together with a fill → error; another file changed together with a fill → error; sync-mode: a new valid ⬜ row inserted → `[]`; `data-removed="1"` added to an existing row with no other change → `[]`; a new ✅ row inserted → error; only `app.js` changed → `[]`.
- [ ] **Step 2: Run tests; expected FAIL.**
- [ ] **Step 3: Implement `check_diff`** with the CLI wrapper running `git diff --unified=0 BASE...HEAD -- index.html` and `git diff --name-only BASE...HEAD`.
- [ ] **Step 4: Run tests; expected PASS.**
- [ ] **Step 5: Commit** `feat: validate entity and sync diffs`.

### Task 3: `scripts/sync` and the empty shell

**Files:**
- Create: `scripts/sync`, `index.html` (shell with empty `<tbody id="rows">`, header, disclaimer, `<form id="filters">`, count, pager, 11-column `<thead>`, footer; markup per DESIGN §2 and §4 "Filter bar"; links `app.css`/`app.js`), `.nojekyll` (empty), `tests/opp-a.html`, `tests/opp-b.html`
- Modify: `scripts/test`

**Interfaces:**
- Produces: `parse_opp(html_text: str) -> dict[int, str]` (from `table.mainlisting`, whitespace-normalised, HTML-unescaped names); `row_line(n: int, name: str) -> str` (⬜ row, name escaped with `html.escape(name, quote=False)`); `sync_lines(lines: list[str], opp: dict[int, str], min_rows: int = 1000) -> tuple[list[str], dict]` where the dict has keys `new`, `removed`, `readded`, `renamed` (lists of ids / `(id, old, new)`), `last_before`, `last_after`; raises `ValueError` if `len(opp) < min_rows`. CLI `scripts/sync [--from FILE] [--file index.html] [--min-rows N]` prints the report of DESIGN §5.1, writes only if bytes changed, exit 1 on abort.
- Consumes: `check_row` (tests only).

- [ ] **Step 1: Create the fixtures.** `opp-a.html`: 3 rows (ids 1, 4, 9) in the real `mainlisting` markup, one name `Escola A & B <Lda> "Café"` (escaped as the real site does). `opp-b.html`: id 1 renamed, id 4 absent, new ids 2 (below the max) and 12, and two rows with the identical name.
- [ ] **Step 2: Write failing tests** (run with `min_rows=1`): `test_sync_seed` (shell + A → exactly 3 ⬜ rows, all pass `check_row`, escaped name correct, second run byte-identical); `test_sync_update` (after B: id 2 inserted between 1 and 4; id 4 gets `data-removed="1"` and stays; id 1 only reported renamed, line unchanged; ids 12 and the duplicate-name rows both present; third run byte-identical); `test_sync_readd` (B then A re-adds id 4 and removes the flag, report lists it); `test_sync_abort` (empty page → `ValueError` raised and CLI leaves the file byte-identical, exit 1); `test_sync_wide_id` (id 10000 → `e10000` sorted after `e9999`).
- [ ] **Step 3: Run tests; expected FAIL.**
- [ ] **Step 4: Implement** per DESIGN §5.1: lines matching `^<tr id="e(\d{4,})"` are rows, everything else passes through; insert new rows in sorted position; use `urllib.request` with a descriptive User-Agent for the network fetch.
- [ ] **Step 5: Run tests; expected PASS.**
- [ ] **Step 6: Commit** `feat: add OPP sync script and page shell`.

### Task 4: Seed the real data

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Run `scripts/sync`** (network). Expected: report `+6345 new`, exit 0.
- [ ] **Step 2: Verify:** `scripts/check index.html` exits 0 reporting 6345 ⬜ / 0 ✅; `scripts/sync` again prints `no changes`; `grep -c '^<tr id="e' index.html` prints 6345; `grep -o '<tr id="e[0-9]*"' index.html | tail -1` ends with `e7498`.
- [ ] **Step 3: Verify the diff check accepts it:** commit, then `scripts/check --diff main` exits 0 (sync mode).
- [ ] **Step 4: Commit** `feat: seed 6345 OPP entities`.

### Task 5: Page (`app.css`, `app.js`) and page test

**Files:**
- Create: `app.css`, `app.js`, `tests/rows.txt`
- Modify: `scripts/test`

**Interfaces:**
- Consumes: shell element ids from task 3: `#filters`, `#count`, `#pager`, `#rows`, `th[data-k]`.
- Produces: the behaviour of DESIGN §3 (functions `norm, parse, buildOptions, readState, writeState, matches, sortRows, enhance, update, render, renderCount`, state keys `nome cidade c d a modo estado rem ord dir p`) and the visual design of DESIGN §4 (tokens, dark mode, cards below 720px, chips, a11y list). Unknown slugs in `a` and unknown `ord` values are ignored; `p` is clamped to `[1, last]`; `#count` text starts with `N de M`; pager buttons are disabled when there is no previous/next page.

`tests/rows.txt` holds six fixture rows: e0001 ✅ Cascais/Lisboa, `clinica educacao`, `+351 212 345 678`; e0002 ⬜ empty; e0003 ✅ Lisboa/Lisboa, `clinica`; e0004 ✅ Porto/Porto, `neuropsicologia`, `+44 20 7946 0958`; e0005 ✅ all `<i>indisponível</i>` with Áreas and Distrito `<i>desconhecido</i>`; e0006 ⬜ `data-removed="1"` named `Café &amp; Co`.

- [ ] **Step 1: Write failing test `test_page`**. It builds a temp HTML from `index.html` (drop lines starting `<tr id="e`, insert `tests/rows.txt`, add `<base href="file://REPO/">` and `window.onerror=e=>document.documentElement.dataset.err=e`), runs headless Chrome `--dump-dom` per hash (Chrome path from `$CHROME`, then `google-chrome`, `chromium`, the macOS app path; skip with a printed notice if none), and asserts on the dumped DOM: no `data-err`; `#a=clinica` count starts `2 de 5`; `#a=clinica,educacao&modo=all` → `1 de 5`; `#cidade=lisboa` → `1 de 5` (accent-insensitive: also `#cidade=LISBOA`); `#d=desconhecido` → `1 de 5`; `#estado=todo` → `1 de 5`; `#rem=1` → `6 de 6`; `#nome=zzz` → `0 de 5`, empty tbody, pager buttons disabled; `#ord=nome&dir=desc` first row is the id whose Nome sorts last in `pt` collation (compute it from `tests/rows.txt` in the test and assert it); `#ord=cidade&dir=desc` puts e0002 and e0005 (missing Cidade) last, and same with `dir=asc`; `#p=999&a=bogus&ord=zzz` → `5 de 5`, no error; e0001 phone renders `href="tel:+351212345678"` with label `212 345 678`; e0004 label is `+44 20 7946 0958`; with `#rem=1` the `Café & Co` text decodes correctly.
- [ ] **Step 2: Run tests; expected FAIL** (no `app.js`).
- [ ] **Step 3: Implement `app.js` and `app.css`** per DESIGN §3 and §4. Raw rows are moved in and out of the tbody, never rebuilt from strings.
- [ ] **Step 4: Run tests; expected PASS.**
- [ ] **Step 5: Manual check** (record the result in the PR body): `python3 -m http.server` in the repo root, open `http://localhost:8000` on the real 6,345 rows at desktop width and at 390px; sort Nome both ways, filter `#cidade=porto`, toggle dark mode; confirm no console errors and first paint without a flash of the full table.
- [ ] **Step 6: Verify contrast:** each colour pair in DESIGN §4 meets 4.5:1 in light and dark (any online or CLI contrast checker); adjust the token if one fails.
- [ ] **Step 7: Commit** `feat: add filterable, sortable table page`.

### Task 6: CI, README, hand-off

**Files:**
- Create: `.github/workflows/check.yml` (exactly DESIGN §6), `README.md`

- [ ] **Step 1: Write `.github/workflows/check.yml`** per DESIGN §6, and `README.md`: what the project is, orchestrator commands (the grep pair, `scripts/sync`), the one-line row contract (link to `SPEC.md` §5), how to run `scripts/test`. Keep it under 60 lines.
- [ ] **Step 2: Run `scripts/test` and `scripts/check index.html`; expected both exit 0.**
- [ ] **Step 3: Commit** `ci: add check workflow and README`; push the branch; `gh pr create`; report branch name and PR URL. Do not merge.
- [ ] **Step 4 (human, after merge):** repo Settings → Pages → "Deploy from a branch" → `main` / root; branch protection on `main` requiring the `check` job and 1 review. Verify `https://davidgomesdev.github.io/intern-quest/` loads and shows `6345`.

## Out of scope for this plan

The subagent skill `.claude/skills/fill-entity/SKILL.md` (SPEC §7.2); the user will write it next, after this plan ships.
