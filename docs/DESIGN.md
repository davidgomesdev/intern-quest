# Intern Quest: DESIGN (visual + technical)

Status: APPROVED (D1-D5 accepted as recommended). Visual design is superseded by `docs/mockup/` (see `DESIGN-VISUAL.md`); page size is 50 and only Estado, Nº, Nome, Cidade, Distrito and Áreas are sortable (SPEC §6.1, §6.4). SPEC.md is authoritative; where this doc and the spec disagree, the spec wins and the gap is listed in §9.
Principle: the laziest thing that works. Python stdlib for scripts, plain DOM APIs in the browser, no dependencies, no build.

## 1. File layout

```
index.html                 page shell + 6,345 row lines (the only data file)
app.css                    all styles
app.js                     all behaviour (≈250 lines)
.nojekyll                  serve files raw, skip the Jekyll build
README.md  SPEC.md  DESIGN.md
scripts/sync               OPP → index.html (also the seed, see §5.1)
scripts/check              row/file/diff validator (CI + local)
scripts/test               runs every check in §7
tests/opp-a.html  tests/opp-b.html   tiny OPP fixtures (3–4 rows each)
.github/workflows/check.yml
.claude/skills/fill-entity/SKILL.md  subagent skill (written later)
```

Why:
- **CSS/JS in sibling files, not inline.** Code PRs then never touch `index.html`, so the CI rule "an entity PR changes exactly one line of index.html" stays strict without exceptions for code edits. The browser can cache both files separately from the 2–3 MB data page.
- **Extensionless Python scripts** (`#!/usr/bin/env python3`), matching the spec's `scripts/sync`. They share no module. Each is small enough to copy the row regex.
- **`.nojekyll`.** Without it, Pages runs Jekyll, which renders `*.md` and ignores dot-dirs. With it the files are served as they are, which is faster and has no surprises.

## 2. index.html structure

```html
<!doctype html><html lang="pt-PT"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Intern Quest · Estágios de Psicologia</title>
  <script>document.documentElement.classList.add('js')</script>   <!-- 1 line, before CSS -->
  <link rel="stylesheet" href="app.css"><script src="app.js" defer></script>
</head><body>
  <header>title, disclaimer (§6.5), OPP link</header>
  <noscript><p>Sem JavaScript: tabela completa, sem filtros. Use Ctrl+F.</p></noscript>
  <form id="filters">…§4…</form>
  <p id="count" aria-live="polite"></p> <nav id="pager"></nav>
  <table><thead><tr><th scope="col" data-k="status"><button>Estado</button></th>…11…</tr></thead>
  <tbody id="rows">
<tr id="e0001"><td>⬜</td><td>0001</td><td>…</td>…</tr>      ← 6,345 lines, one per entity
  </tbody></table>
  <footer>source link, last sync date</footer>
</body></html>
```

- **Raw rows and paged rendering:** CSS `.js #rows:not(.ready){display:none}` hides the full tbody before first paint, so the browser parses the 6,345 rows but never lays them out. `app.js` (deferred) reads them once into `ROWS`, keeps a reference to each `<tr>`, and then calls `tbody.replaceChildren(...pageRows)` to show only the current page. The rendered rows are the original nodes moved in and out of the tbody, so the code never builds rows from strings.
- **No JS:** the `js` class is never added, so the whole table shows, `#filters`/`#pager` are hidden (`html:not(.js) #filters{display:none}`) and the `<noscript>` note shows. Áreas show as raw slugs and URLs are plain text. That is acceptable for read-only use.
- **Row lines** start at column 0 with no indentation, so `grep '^<tr id="e0001">'` works.
- **Page weight** (measured on the real 6,345 names with `gzip -6`):

| State | Raw | gzip (Pages serves gzip: verified `content-encoding: gzip`) |
|---|---|---|
| Seed, all ⬜ | 1.05 MB | 150 KB |
| All ✅ (≈330 B/row, synthetic values) | 2.6 MB | ≈215 KB synthetic, realistic ≈500–700 KB |

This is far below the Pages limits (1 GB site, 100 GB/month soft bandwidth). DOM: ≈76k elements parsed but not laid out. Pages sends `cache-control: max-age=600`.

## 3. JS design (app.js)

Data, built once in `parse()`:

```
ROWS: Array<Row>        // file order = Nº asc
Row = { el: HTMLTableRowElement, id: 'e0001', n: 1, ok: bool, removed: bool,
        nome, cidade, distrito, morada, adicional, web, email, tel: string|null,   // null = missing
        areas: string[],             // slugs; ['desconhecido'] if <i>desconhecido</i>; [] if empty
        kNome, kCidade: string,      // norm() keys for "contains"
        done: bool }                 // enhance() applied
MISSING = cell is empty OR its only child is <i> (indisponível/desconhecido) → null
```

Functions (one line each):
- `norm(s)` = `s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim()`.
- `parse()` reads `tbody.rows` into `ROWS` using `td.textContent` (this decodes `&amp;`) and `el.dataset.removed`.
- `buildOptions()` fills `<datalist id="cidades">`, the Cidade `<select>` and the Distrito `<select>` from distinct non-null values. It sorts them with `COLL`. Distrito also gets the option "Desconhecido".
- `readState()` / `writeState()`: `URLSearchParams(location.hash.slice(1))` ↔ `S`. Writes use `history.replaceState` so typing adds no history entries. Only non-default keys are written. A `hashchange` listener calls `readState(); update()`.
- `matches(r)` ANDs the following tests:
  - `kNome.includes(norm(S.nome))`
  - `kCidade.includes(norm(S.cidade))` (text box) and `cidade === S.c` (dropdown)
  - `distrito === S.d` (`S.d === 'desconhecido'` matches null)
  - áreas: `S.a.some(a => r.areas.includes(a))` (any-of only)
  - status `ok`/`todo`
  - `S.rem || !removed`
- `sortRows(list)` sorts a copy by `S.ord`/`S.dir`. Nº is compared numerically. Text uses `COLL = new Intl.Collator('pt', {sensitivity:'base', numeric:true})`. Áreas sort by their first label. Nulls and empty values sort **last in both directions**.
- `enhance(r)` runs once per row, the first time the row is shown:
  - Status cell → `<span role="img" aria-label="Preenchido|Por preencher">✅</span>`.
  - Áreas → chips.
  - Website → `<a href target=_blank rel=noopener>hostname</a>`; e-mail → `mailto:`; phone → `tel:` with spaces stripped.
  - Removed rows get a badge after Nome.
- `update()` runs `filtered = ROWS.filter(matches)`, then `sortRows`, then clamps `S.p`. It then calls `render(slice)` and `renderCount()`, and finally `writeState()`.
- `render(slice)`: `slice.forEach(enhance); tbody.replaceChildren(...slice.map(r=>r.el)); tbody.classList.add('ready')`.
- `renderCount()` writes "312 de 6345 · 1204 preenchidas" and "página 2 de 4". `Intl.NumberFormat('pt-PT')` prints 6345 without a separator, so its output is shown as is.

State `S` and its hash keys (short Portuguese words, shareable):

| key | meaning | default |
|---|---|---|
| `nome` | Nome contains | `''` |
| `cidade` | Cidade contains (text box with datalist) | `''` |
| `c` | Cidade exact (dropdown) | `''` |
| `d` | Distrito exact, or `desconhecido` | `''` |
| `a` | áreas, comma-separated slugs | `''` |
| `estado` | `todos` / `ok` / `todo` | `todos` |
| `rem` | `1` = show rows removed from OPP | off |
| `ord`, `dir` | sort column key, `asc`/`desc` | `n`, `asc` |
| `p` | page (50 rows) | `1` |

Events: one `input` listener on `#filters` (delegation) resets `S.p = 1` and calls `update()`. Each update takes about 5 ms for 6,345 rows, so there is no debounce. Each header `<button>` toggles the sort. "Limpar" clears `S` and the hash. Filtering runs on every keystroke and needs no index.

## 4. Visual design

**Tone:** a quiet, dense reference tool, like a well-set timetable. It has one accent colour, no cards on desktop and no decoration. The data is the interface.

**Typography:** `system-ui` stack. Body 15px/1.45 and table 14px/1.35. Nº and Telefone use `font-variant-numeric: tabular-nums`. Headings use weight 600 only.

**Colour tokens** (`:root`, dark values under `@media (prefers-color-scheme: dark)`, plus `color-scheme: light dark`):

| token | light | dark | use |
|---|---|---|---|
| `--bg` | `#fbfaf7` | `#16181b` | page |
| `--fg` | `#1d2125` | `#e6e4df` | text |
| `--muted` | `#6b7177` | `#9aa0a6` | indisponível/desconhecido, labels |
| `--line` | `#e3e0d8` | `#2c3036` | borders, zebra base |
| `--zebra` | `#f3f1ec` | `#1c1f23` | alt rows |
| `--accent` | `#0e6e66` | `#5cc8bb` | links, focus ring, active chips, sort arrow |
| `--chip` | `#e5f1ef` | `#1f3532` | chip background |
| `--warn` | `#9a4b00` | `#f0a35e` | "removida da OPP" badge, disclaimer border |

All text/background pairs meet WCAG AA (4.5:1). The implementation step must verify each pair with a contrast checker.

**Desktop layout:**
- Content area `max-width: none`, 16px gutters. The table spans the full width inside `overflow-x:auto` and has a sticky `thead`.
- Cell padding `4px 8px`; rows are about 28px tall when cells do not wrap; zebra striping.
- Column widths: Estado 2.5em centred; Nº 4.5em; Nome `min-width:22ch`. Morada and Adicional have `max-width:28ch` and wrap; Website shows the hostname only.
- Sort indicator: ▲/▼ in `--accent`, kept in sync with `aria-sort` on the `th`.

**Missing values:** `td i { color: var(--muted) }` turns `<i>indisponível</i>` and `<i>desconhecido</i>` into muted italic grey, so they read as "searched, nothing found". Empty cells on ⬜ rows stay blank.

**Status:** the emoji as-is (⬜/✅), centred, wrapped in `role="img"` with an aria-label (§3). ⬜ rows get no other styling, so the emoji carries the meaning.

**Chips:** each área is a pill with the `--chip` background, 12px text, 2px 8px padding and 999px radius, using the label from SPEC §4.1. `desconhecido` uses a dashed border, a transparent background and muted italic text.

**Filter bar** is a `<form id="filters">` inside `<details open>`. JS removes `open` on narrow screens at init. Contents:
- Row 1: Nome · Cidade text box with `list="cidades"` · Cidade `<select>` "Todas as cidades" · Distrito `<select>` · Estado `<select>` · "Limpar" button.
- Row 2: a `<fieldset><legend>Áreas</legend>` of 9 checkbox chips (real `<input type=checkbox>` + label, styled as pills, accent fill when checked), and the checkbox "mostrar removidas".
- The `<summary>` shows "Filtros (n ativos)".

Two Cidade controls are kept because Firefox for Android does not support `<datalist>` (caniuse). There the text box degrades to plain "contains" search and the `<select>` remains the exact-match picker.

**Mobile (< 720px), stacked cards via CSS only:**
- `table, tbody, tr, td {display:block}` and `thead` visually hidden.
- Each `tr` becomes a card with a 1px `--line` border and 12px padding.
- `td:empty {display:none}`, so ⬜ cards show only the status, Nº and Nome.
- Labels come from `td:nth-child(6)::before{content:"Morada: "}`, and likewise for Adicional and Telefone. Cidade and Distrito sit on one line ("Cascais · Lisboa"). Nome is bold at 16px.
- A `<select id="ord">` "Ordenar por" appears only on mobile, because the column headers are hidden.

**Accessibility:**
- `lang="pt-PT"`; a real table with `th scope="col"`.
- Each sort control is a `<button>` inside its `th`, with `aria-sort` on the `th`.
- Every input has a `<label>`; chips are native checkboxes.
- `#count` is `aria-live="polite"`.
- `:focus-visible` shows a 2px `--accent` outline.
- Links opened in a new tab carry visually hidden "(abre noutra janela)" text.
- Pager buttons are `<button>` elements with clear labels ("Página seguinte").
- `prefers-reduced-motion` is irrelevant because the page has no animation.

Desktop wireframe:

```
+----------------------------------------------------------------------------------+
| Intern Quest  Entidades de estágio (Ano Profissional Júnior) · OPP               |
| ! Lista informativa da OPP: não implica vaga. Dados recolhidos automaticamente,  |
|   podem ter erros. Confirme no site da entidade. Fonte: ordemdospsicologos.pt    |
+----------------------------------------------------------------------------------+
| v Filtros (2 ativos)                                                             |
| Nome [__________]  Cidade [gaia_____]  [Todas as cidades v]  Distrito [Porto  v] |
| Estado [Todos v]                                                     [ Limpar ]  |
| Áreas (Clínica)(Neuropsicologia)(Psicoterapia)[Educação](Organizações)(Justiça)  |
|       (Comunitária)(Desporto)(Desconhecido)   [ ] removidas|
+----------------------------------------------------------------------------------+
| 312 de 6345 · 1204 preenchidas               [ Anterior ] página 2 de 4 [Seguinte]|
+----+------+--------------------+---------+--------+-------------+---------------+--
| Es | Nº ▲ | Nome               | Cidade  | Distr. | Morada      | Áreas         |…
+----+------+--------------------+---------+--------+-------------+---------------+--
| ✅ | 0001 | Centro Doutor João | Cascais | Lisboa | Rua X 12,   | (Clínica)     |…
|    |      | dos Santos - Casa… |         |        | 2750-000 C… | (Educação)    |…
| ⬜ | 0004 | Centro Social e C… |         |        |             |               |…
+----+------+--------------------+---------+--------+-------------+---------------+--
   …Adicional | Website     | E-mail            | Telefone
   …Interv. p.| exemplo.pt  | geral@exemplo.pt  | indisponível (muted italic)
```

Mobile wireframe:

```
+--------------------------------+
| Intern Quest                   |
| ! Informativo, não é vaga. ... |
| > Filtros (2 ativos)  [Limpar] |
| Ordenar [Nº crescente      v]  |
| 312 de 6345      < 2 / 4 >     |
+--------------------------------+
| ✅ 0001                         |
| Centro Doutor João dos Santos  |
| - Casa da Praia (IPSS)         |
| Cascais · Lisboa               |
| Morada: Rua X 12, 2750-000 ... |
| (Clínica) (Educação)           |
| Adicional: Intervenção precoce |
| exemplo.pt · geral@exemplo.pt  |
| Telefone: indisponível         |
+--------------------------------+
| ⬜ 0004                         |
| Centro Social e Cultural Nossa |
| Senhora do Ó de Aguim          |
+--------------------------------+
```

## 5. Scripts

### 5.1 `scripts/sync [--from FILE] [--file index.html]` (seed included)

- **Input:** the OPP page from the network (`urllib`), or `--from` a saved HTML file (used by tests and offline runs). It is parsed with `html.parser` into `{id:int → name}` from `table.mainlisting`. It aborts if it finds fewer than 1,000 rows, which guards against a broken fetch flagging everything as removed.
- **index.html:** lines matching `^<tr id="e(\d{4})"` are rows; every other line passes through untouched.
- **Rules:**
  - New ids become `⬜` rows (name via `html.escape(name, quote=False)`), inserted in sorted position.
  - A removed id gets ` data-removed="1"` added to its `<tr>` if not already present.
  - A renamed id is reported only.
- **Output:** the file is rewritten in place only if its bytes changed. The report goes to stdout:

  ```
  last id before/after: 7498/7503
  +5 new: e7499 …
  -1 removed: e0123
  ~2 renamed: e0456 "old" -> "new"
  ```

  Exit code 0. The script prints "no changes" and leaves the file alone if `+`, `-` and `~` are all zero.
- **Seed = sync on an empty tbody.** The repo starts with the shell `index.html` (an empty `<tbody id="rows">`). The first `scripts/sync` inserts 6,345 new ⬜ rows. That gives determinism and idempotency for free: same input, same bytes; a second run is a no-op. No separate seed script is needed (decision D1).
- **Re-adding:** if an id flagged `data-removed` reappears in OPP, the flag is removed and reported as "re-added".

### 5.2 `scripts/check`

- `scripts/check FILE` lints the whole file (run in CI and locally).
- `scripts/check --diff BASE_REF [--branch NAME]` checks the PR diff.

Row shape. A Python regex; `ESC` is the allowed HTML text:

```python
ESC   = r'(?:[^<>&\n]|&(?:amp|lt|gt|quot|#39);)'
TEXT  = rf'{ESC}+'
IND   = r'<i>indisponível</i>'
DESC  = r'<i>desconhecido</i>'
SLUG  = r'(?:clinica|neuropsicologia|psicoterapia|educacao|organizacoes|justica|comunitaria|desporto)'
ROW   = re.compile(r'^<tr id="e(\d{4})"( data-removed="1")?>((?:<td>(?:' + ESC + r'|<i>(?:indisponível|desconhecido)</i>)*</td>){11})</tr>$')
CELLS = re.compile(r'<td>(.*?)</td>')
```

Per-cell rules, applied after `ROW` matches and `CELLS.findall` returns exactly 11 cells:

| # | cell | allowed when ✅ | when ⬜ |
|---|---|---|---|
| 1 | Status | `✅` | `⬜` |
| 2 | Nº | equals the id digits | same |
| 3 | Nome | `TEXT` | `TEXT` |
| 4, 6, 8 | Cidade, Morada, Adicional | `TEXT` or `IND` | empty |
| 5 | Distrito | `TEXT` or `DESC` | empty |
| 7 | Áreas | `SLUG( SLUG)*` (no duplicates) or `DESC` | empty |
| 9 | Website | `https?://[^\s<>]+` or `IND` | empty |
| 10 | E-mail | `[^\s@<>&]+@[^\s@<>&]+\.[^\s@<>&]+` or `IND` | empty |
| 11 | Telefone | `\d[\d ]*\d` or `IND` | empty |

File checks:
- Every line containing `<tr` matches `ROW`.
- Ids are strictly ascending, which also proves they are unique.
- The file prints its count and the ⬜/✅ split.

Diff checks (`git diff --unified=0 BASE...HEAD -- index.html`; only `<tr` lines count as rows):
- **No row line changed:** pass. This is a code or doc PR.
- **Entity mode:** exactly one `-` row and one `+` row, with these conditions:
  - Both rows have the same id, and Nome is unchanged.
  - The new row is ✅.
  - `data-removed` is unchanged.
  - The diff touches no other line of `index.html` and no other file (`git diff --name-only`).
  - If `--branch` matches `e(\d{4})`, that id must equal the row id.
- **Sync mode:** every `+` row is a valid ⬜ row with a new id, or is an existing row whose only change is ` data-removed="1"` being added or removed.
- **Anything else** fails, with a message naming the offending line.

## 6. CI and Pages

`.github/workflows/check.yml`:

```yaml
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: scripts/check index.html
      - if: github.event_name == 'pull_request'
        env: { BASE: "${{ github.base_ref }}", HEAD: "${{ github.head_ref }}" }
        run: scripts/check --diff "origin/$BASE" --branch "$HEAD"
      - run: scripts/test
```

- Mark `check` as a required status check under branch protection on `main`, and require 1 review. Nothing auto-merges.
- **Pages:** Settings → Pages → "Deploy from a branch" → `main` / `(root)`, as the spec confirms. No deploy workflow is needed; `.nojekyll` makes it a plain file copy.
- **Pages limit:** Pages has a soft limit of 10 builds per hour, and it applies to branch deployments; custom Actions workflows are exempt (GitHub docs). Merging more than 10 entity PRs in an hour may delay a build, but the latest commit still deploys. See D4.

## 7. Test strategy (`scripts/test`, plain Python with asserts)

1. **check:** a list of about 15 inline lines (good and bad, one bad line per rule in §5.2) asserting accept or reject. Run `--diff` on two temporary git commits for entity mode, sync mode and a 2-line entity diff that must fail.
2. **sync:** a temporary copy of the empty shell, then:
   - `sync --from tests/opp-a.html` gives 3 ⬜ rows.
   - A second run is byte-identical (seed determinism and idempotency).
   - `sync --from tests/opp-b.html` (one new id *below* the max, one id gone, one renamed) inserts in sorted position, flags rather than deletes, and only reports the rename.
   - A third run is a no-op.
3. **page:** build `tests/page.html` = the real `index.html` shell with 6 fixture rows (mixed ✅/⬜, áreas, one removed). Run `google-chrome --headless --dump-dom 'file://…/page.html#cidade=lisboa&a=clinica'` (Chrome is preinstalled on `ubuntu-latest`). Assert:
   - `#count` text is the expected "2 de 5".
   - The first row id is as expected after `ord=nome&dir=desc`.
   - No `data-err` attribute is present. The fixture page has `window.onerror = e => document.documentElement.dataset.err = e`, which catches console errors without any framework.
4. **real file:** `scripts/check index.html` (already a CI step).

This adds no test framework and no dependencies. Locally, test 3 is skipped when no Chrome binary is found.

## 8. Decisions (all accepted as recommended)

1. **D1: merge the seed into `scripts/sync`.** Seed = sync on an empty tbody. Recommendation: **yes**. It removes one script and makes seed determinism follow from idempotency.
2. **D2: CSS/JS as sibling files** (`app.css`, `app.js`) rather than inline in `index.html`. Recommendation: **siblings**, so entity PRs and code PRs never touch the same file.
3. **D3: mobile layout.** Stacked cards below 720px, or a horizontally scrolling 11-column table. Recommendation: **cards**, because a scrolling table is unusable on a phone and cards need only CSS plus one sort `<select>`.
4. **D4: Pages deploy.** Keep "Deploy from branch main /root" (spec), or switch to an Actions deploy workflow that serves the same files and avoids the 10 builds/hour soft limit. Recommendation: **keep branch deploy**, merge in batches, and switch only if builds visibly lag.
5. **D5: missing values when sorting descending.** Recommendation: empty, indisponível and desconhecido stay **last in both directions**, so they never flood the top of the list.

## 9. Spec issues (items 1, 2, 3, 6 fixed in SPEC.md: grep pattern, repo contents, `tel:` phone format with `+<cc> <digits>` validation, ids of at least 4 digits with `e[0-9]{4,}`)

1. **`data-removed` vs the grep contract (§5, §7.1).** `grep -m1 '<td>⬜</td>'` will hand removed rows to subagents. Fix: the orchestrator uses `grep -m1 '^<tr id="e[0-9]*"><td>⬜'`, which excludes rows with the attribute. The subagent read `grep '^<tr id="e0001">'` then finds nothing for a removed row, which is correct, but the skill must say "no match means stop".
2. **§3 repo contents is incomplete.** It omits `scripts/sync`, `scripts/check`, the CI workflow, `app.css`/`app.js`, `.nojekyll` and test fixtures.
3. **Telefone "digits and spaces only" (§4).** This forbids `+351`, extensions and a second number. Either allow `\+?\d[\d ]*\d` and `;`-separated numbers, or accept the loss (extra numbers go in Adicional). The same applies to a second e-mail. The validator follows the spec until you decide.
4. **§6.2 says filters exist "only" on Nome/Cidade/Áreas/Distrito,** but Status (§6.2) and "show removed" (§7.5) are filters too. This is wording only.
5. **§8 seed check "all start ⬜".** This holds only on an empty file. The seed must never run against a populated `index.html` (solved by D1).
6. **Ids are 4 digits (`e0001`).** They overflow at protocol 10000 (max today: 7498). The regex hard-codes `\d{4}`; widening it later is a whole-file change.
7. **§7.4 "any line other than the entity's changed".** The spec does not say how CI knows the entity. This design uses the diff itself plus the `feat/eNNNN-fill` branch name.
