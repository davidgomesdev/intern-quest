# Intern Quest: SPEC (functional)

Status: FINAL (functional). Visual/technical design still to be done. Nothing is implemented. Items marked **[CALL]** are my decisions, not yours; please check them.

## 1. Purpose

Help a psychology graduate find an internship (Ano Profissional Júnior) **in or near a city, and/or in an área de atuação**. The list of eligible entities comes from the Ordem dos Psicólogos Portugueses (OPP). The OPP list only has names, so this project enriches each entity with location and contact data.

## 2. Source data

- URL: `https://www.ordemdospsicologos.pt/pt/estagios/entidades` (single page, one `<table class="mainlisting">`, columns `Nº Protocolo`, `Nome`).
- **6,345 entities** (not 7,498: 7,498 is the highest protocol number; gaps are protocols not currently listed).
- 6,345 unique protocol numbers, 6,342 unique names (3 repeated names). The protocol number is the primary key, never the name.
- The OPP list is informational only and does not mean an open vacancy. The site must say so (see 6.5).
- The initial table is generated from the source page by `scripts/sync.py` run on an empty `index.html` (no separate seed script).

## 3. Deliverable

A single static page `index.html`, hosted on GitHub Pages, containing every entity. No backend, no framework, no build step at view time. Vanilla JS and CSS, inline or in two sibling files.

Repo contents (small on purpose): `index.html`, its CSS and JS files, `README.md`, `SPEC.md`, the subagent skill, `scripts/sync.py` (also seeds an empty table), `scripts/check.py` (PR validation), `scripts/test.py`, and the CI workflow under `.github/workflows/`. Exact layout is set in the design doc.

## 4. Data model (one entity)

| # | Column | Type | Notes |
|---|--------|------|-------|
| 1 | Status | emoji | `⬜` NOT-FILLED, `✅` FILLED |
| 2 | Nº | int | OPP protocol number; also the row id |
| 3 | Nome | text | From OPP; never edited by subagents |
| 4 | Cidade | text | One city (concelho). See 4.2 |
| 5 | Distrito | text | Best effort: only if clearly visible on the entity's webpage, else `<i>desconhecido</i>` |
| 6 | Morada | text | Street address, as found |
| 7 | Áreas | tokens | From the fixed list in 4.1; one or more |
| 8 | Adicional | text | Free text: anything the entity says that the fixed list does not capture |
| 9 | Website | URL | Best effort |
| 10 | E-mail | text | Public contact e-mail |
| 11 | Telefone | text | International format `+<country code> <digits>`, spaces allowed (e.g. `+351 212 345 678`). Rendered as a `tel:` link; the label drops a leading `+351 ` (see section 5) |

### 4.1 Fixed list of áreas de atuação **[CALL: list is my proposal]**

Slug (stored) → label (shown):

- `clinica` → Clínica e da Saúde
- `neuropsicologia` → Neuropsicologia
- `psicoterapia` → Psicoterapia
- `educacao` → Educação
- `organizacoes` → Trabalho, Social e Organizações
- `justica` → Justiça / Forense
- `comunitaria` → Comunitária / Intervenção Social
- `desporto` → Desporto
- `desconhecido` → Desconhecido

Rules:
- At least one value. `desconhecido` is used only when no other area can be determined, and never together with another.
- Stored in the cell as `<i>desconhecido</i>` (italic, same convention as `indisponível`). It is the only áreas value that is not a bare slug. The filter treats it as the slug `desconhecido`.
- Anything that does not fit goes in Adicional, not in a new slug.
- Changing the list later is a deliberate, separate PR touching the whole file.

### 4.2 Missing values

A field the subagent could not find is written as `<i>indisponível</i>`, never left empty. Empty means "not yet researched". Exception: Áreas and Distrito use `<i>desconhecido</i>` instead (same meaning: the subagent could not determine it). Distrito is never inferred from the city or from memory; it is filled only when the entity's own page states it. The status emoji, not the cell content, says whether research happened.

### 4.3 Status

- `⬜` = nobody has researched this entity.
- `✅` = a subagent researched it, and every field holds either a value or `<i>indisponível</i>` (Áreas: at least one slug or `<i>desconhecido</i>`; Distrito: a value or `<i>desconhecido</i>`).
- A ✅ row with all fields indisponível is valid ("searched, found nothing").

## 5. File format (the contract between orchestrator and subagents)

One entity = **one line** in `index.html`, inside the `<tbody>`. Line shape, exact:

```
<tr id="e0001"><td>⬜</td><td>0001</td><td>Centro Doutor João dos Santos - Casa da Praia (IPSS)</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
```

Filled example:

```
<tr id="e0001"><td>✅</td><td>0001</td><td>Centro Doutor João dos Santos - Casa da Praia (IPSS)</td><td>Cascais</td><td>Lisboa</td><td>Rua X 12, 2750-000 Cascais</td><td>clinica educacao</td><td>Intervenção precoce</td><td>https://example.pt</td><td>geral@example.pt</td><td><i>indisponível</i></td></tr>
```

Rules:
- Eleven `<td>` per row, fixed order as in section 4. Always in the same shape, so a regex or `sed` can replace the whole line.
- Lines are sorted by protocol number and never reordered.
- Text is HTML-escaped (`&amp;`, `&lt;`). Emails and URLs stored as plain text; JS makes them links at render time. Telefone becomes `<a href="tel:+351212345678">212 345 678</a>`: the `href` is the stored number without spaces, the label drops a leading `+351 ` (non-Portuguese numbers show in full).
- Ids are the protocol number zero-padded to **at least** 4 digits (`e0001`, `e9999`, `e10000`); never truncated. Row regex uses `e[0-9]{4,}`.
- Áreas cell: space-separated slugs (not `;`). The UI turns them into chips and a multi-select filter, so the raw token form is never what the user sees **[CALL]**. Chosen because it is the cheapest form to edit and to match with `grep -w`.
- Subagent read: `grep '^<tr id="e0001">' index.html`.
- Subagent write: replace that one line; touch no other line.
- Orchestrator: `grep -m1 '^<tr id="e[0-9]*"><td>⬜' index.html` (next work), `grep -c '^<tr id="e[0-9]*"><td>⬜' index.html` (remaining). Rows flagged `data-removed="1"` have an attribute after the id, so these patterns skip them.

## 6. The page

### 6.1 Table
All 11 columns shown. **Sortable columns: Estado, Nº, Nome, Cidade, Distrito, Áreas only**; the others (Morada, Adicional, Website, E-mail, Telefone) are not sortable. Header click sorts (asc/desc, toggling), numeric sort for Nº, locale-aware sort (pt) for text, first área label for Áreas. `indisponível`, `desconhecido` and empty cells sort last in both directions.

### 6.2 Filters
- Status: All / ✅ / ⬜ (default: **All**).
- Filters exist **only** on Nome, Cidade, Áreas (plus Distrito, see below). All other columns are neither sortable nor filterable.
- Nome: text "contains" box, accent- and case-insensitive.
- Cidade: text search with autocomplete from the cities present, plus exact-match dropdown **[CALL: both]**.
- Áreas: multi-select; **any-of** semantics only (an entity matches if it has at least one selected área). No all-of toggle.
- Distrito: exact-match dropdown **[CALL: added, since district is the "near" mechanism; drop it if you disagree]**.
- Filters combine with AND. A "clear all" button, and a visible "N of 6,345 shown" count.
- Filter and sort state is kept in the URL hash so a view can be shared and bookmarked.

### 6.3 Near a city
v1: "near" means same city or same district. Distrito is best effort (often `<i>desconhecido</i>`), so a district filter will miss entities with unknown district; the city filter remains the reliable one. Distance search is **out of scope** for v1 (see 9).

### 6.4 Performance
6,345 rows in one DOM table must stay responsive. Rendering is by filtered slice (virtual or paged, 50 rows per page) **[CALL]**; the raw rows stay in the HTML so `grep` works and the page works without JS for reading.

### 6.5 Disclaimers
A visible note: the list is from OPP, informational, and does not imply a vacancy; data is gathered automatically and may be wrong; link to the OPP source page and to the entity's own site.

### 6.6 Accessibility
Real `<table>` with `<th scope="col">`, keyboard-operable sort, labels on all filter inputs, status conveyed by emoji **and** an accessible text (`title`/`aria-label`: "Preenchido" / "Por preencher").

## 7. Workflow

### 7.1 Orchestrator (a Claude session, not part of the site)
1. `grep -m1 '^<tr id="e[0-9]*"><td>⬜' index.html` → pick the next entity (or N entities for N parallel subagents).
2. Spawn one subagent per entity, giving it only the protocol number.
3. Subagent opens one PR. The orchestrator never edits `index.html` itself.
4. A human reviews and merges. Nothing is merged automatically.

### 7.2 Subagent (skill to be written later)
1. Read its line with `grep`.
2. Research by web search using the entity name (and city if present), preferring the entity's own site.
3. Rewrite only its own line per section 5, set status ✅.
4. Branch name `feat/e0001-fill` style, per the user's global git rules: new worktree, conventional commit, push, `gh pr create`, report the PR URL. No `--no-verify`, no signing bypass, no co-author trailers.
5. One entity per PR. Diff must be exactly one changed line.

### 7.3 Merge conflicts
Neighbouring-line PRs can conflict. A CI check (see 7.4) plus rebase resolves them; the orchestrator should dispatch non-adjacent entities in the same batch when possible.

### 7.4 CI check on every PR **[CALL]**
A small script that fails the PR if:
- more than one line of `index.html` changed, or any line other than the entity's changed;
- the line does not match the section 5 shape (11 cells, valid status, valid áreas slugs, or exactly `<i>desconhecido</i>` alone);
- a ✅ row contains an empty cell;
- a URL does not start with `http://` or `https://`, an e-mail is not shaped like one, or a phone does not match `+<country code> <digits>`.

### 7.5 Syncing new entities from OPP **[CALL]**

Command: `scripts/sync.py` (Python stdlib, no deps). The orchestrator runs it, then opens **one sync PR**. This is the only PR allowed to change more than one entity line, and it may only add or flag lines, never fill them.

- Last known id: `grep -o '<tr id="e[0-9]*"' index.html | tail -1`. Printed as information.
- Real comparison is by **set of ids**, not only the max id. OPP ids have gaps and a new entity could in principle appear below the current max.
- Fetch the OPP page, parse as in section 2, then:
  - **New id** (in OPP, not in `index.html`): insert a `⬜` row in sorted position, name from OPP.
  - **Removed id** (in `index.html`, gone from OPP): do not delete. Add the attribute `data-removed="1"` to the `<tr>`; the page shows a "removed from OPP" badge and hides it by default behind a filter. The report lists it for a human.
  - **Renamed id** (same id, different name): do not edit. Report only; a human decides.
- Output: a short report (`+N new`, `-N removed`, `~N renamed`, last id before/after). No changes and no PR if all three are zero.
- Idempotent: running it twice in a row changes nothing the second time.
- CI check 7.4 gets a sync-PR mode: only new `⬜` rows, or `data-removed` added, nothing else.
- Cadence: manual for v1. A scheduled run is a non-goal for now.

## 8. Quality

- `scripts/sync.py` is deterministic: running it twice yields byte-identical output.
- Seed check: 6,345 rows, ids unique, all start `⬜`.
- Sync check: against a fixture, one new id is inserted in sorted position, one removed id is flagged not deleted, a second run is a no-op.
- Page check: opens with no console errors; sorting and filtering produce the expected counts on a small fixture.
- No test frameworks beyond what the checks above need.

## 9. Non-goals (v1)

- Distance or map search ("near city").
- Vacancy tracking, application status, or notifications.
- Editing from the page.
- Re-verifying already ✅ entities; a staleness mechanism.
- Scraping behind logins or contacting entities.

## 10. Resolved questions

1. Áreas list in 4.1: approved.
2. District: added as a best-effort column (only if clearly on the entity's page, else `<i>desconhecido</i>`).
3. Filters: only Nome, Cidade, Áreas (plus my Distrito dropdown, to be confirmed).

## 11. Confirmed

- Distrito dropdown filter (6.2): confirmed.
- Repo `intern-quest`, GitHub Pages served from the `main` branch root: confirmed.
