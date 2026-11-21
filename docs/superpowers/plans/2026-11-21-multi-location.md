# Multiple Locations per Entity: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An entity row carries every location it works from; filters match any of them, and the row shows the location (and contact) that fits the reader's district first.

**Architecture:** The row stays one line with 11 cells; the visible cells hold the first location, the full list lives in an escaped-JSON `data-loc` attribute. `scripts/apply_row.py` is still the only writer and orders locations; `scripts/check.py` validates them; `app.js` re-picks the shown location and contact on every render from the current filter. A new 🔄 status queues rows for two new skills (`refill-batch` / `refill-entity`).

**Tech Stack:** Python 3 stdlib scripts, vanilla JS (`app.js`), plain test runner `scripts/test.py` (page checks in headless Chrome), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-21-multi-location-design.md`

## Global Constraints

- `index.html`: one line per entity, eleven `<td>`, rows sorted by id, never reordered (`SPEC.md` §5).
- `scripts/apply_row.py` is the only thing that writes a row.
- No new dependencies. Python stdlib only; no JS libraries.
- Run everything with `scripts/test.py` (all tests) and `scripts/check.py index.html`; both must pass at every commit.
- Commits: conventional commits, no co-author trailers, never `--no-verify` / skip signing. Work on branch `feat/multi-location` off `docs/multi-location-design`; PR to `main`, never merge it.
- Copy (Portuguese, exact): `Outras localizações`, `Todas as localizações`, `Por todo o país (N distritos)`, `(recomendado)`, `É o contacto da sede da entidade.`, `É o contacto da localização no distrito selecionado.`, `A rever localizações`, CSV column `Distritos`.
- District order (rank), fixed: Lisboa, Porto, Coimbra, Faro, Setúbal, Braga, Aveiro, Leiria, Santarém, Viseu, Madeira, Açores, Viana do Castelo, Vila Real, Castelo Branco, Évora, Guarda, Beja, Bragança, Portalegre (user's first four, then 2021 census population).

## Review Focus

1. **Filter changes after the first render**: cells were built once (`enhance`); a reader moving from `d=Lisboa` to `d=Porto` must see the Porto location, not a stale Lisboa one. Test: Task 5 sweep over both hashes on one page.
2. **Local filter on a non-first location** (`d=Lisboa&c=Cascais` when the first location is the Lisboa head office): Cascais is shown and gets "(recomendado)". Test: Task 5.
3. **Only mobiles / only loose numbers, district selected**: no "(recomendado)", first mobile shown. Test: Task 5.
4. **Quotes, `&`, `<` in a Morada** survive JSON → attribute escaping → `check.py` → page. Test: Task 2 and Task 3.
5. **Locations whose Distrito is unknown** (`null`): Distrito cell `desconhecido`, `d=desconhecido` still matches, no crash in ranking. Test: Task 2 (check) and Task 5 (page).

---

### Task 1: District rank and phone-prefix lookup

**Files:**
- Modify: `lookup/distritos.txt` (reorder to the rank above)
- Create: `lookup/prefixos.txt`
- Modify: `scripts/check.py:24-27` (LOOKUP glob), `scripts/embed_lookup.py`, `index.html` (the `<script id="lookup">` line, plus a new `<script type="application/json" id="prefixos">` line right after it)
- Test: `scripts/test.py`

**Interfaces:**
- Produces (Python, `check.py`): `DISTRITOS: list[str]` (file order = rank); `RANK: dict[str, int]`; `LOOKUP` unchanged in meaning and excluding both `distritos` and `prefixos`; `PREFIXOS: dict[str, list[str]]` (prefix → distritos).
- Produces (page): `#lookup` JSON keys in rank order; `#prefixos` JSON `{"21": ["Lisboa", "Setúbal"], ...}`.

`lookup/prefixos.txt` format: one line per geographic prefix, `prefix<TAB>Distrito[<TAB>Distrito]`, `#` comments. Start from this table and verify each line against ANACOM's Plano Nacional de Numeração (geographic range `2`); where a code area crosses a district border, add the second district:

```
21 Lisboa Setúbal · 22 Porto · 231 Aveiro · 232 Viseu · 233 Coimbra · 234 Aveiro · 235 Coimbra · 236 Leiria · 238 Guarda
239 Coimbra · 241 Santarém · 242 Portalegre · 243 Santarém · 244 Leiria · 245 Portalegre · 249 Santarém · 251 Viana do Castelo
252 Braga · 253 Braga · 254 Vila Real · 255 Porto · 256 Aveiro · 258 Viana do Castelo · 259 Vila Real · 261 Lisboa · 262 Leiria
263 Lisboa · 265 Setúbal · 266 Évora · 268 Évora · 269 Setúbal · 271 Guarda · 272 Castelo Branco · 273 Bragança · 274 Castelo Branco
275 Castelo Branco · 276 Vila Real · 277 Castelo Branco · 278 Bragança · 279 Bragança · 281 Faro · 282 Faro · 283 Beja · 284 Beja
285 Beja · 286 Beja · 289 Faro · 291 Madeira · 292 Açores · 295 Açores · 296 Açores
```

- [ ] **Step 1: Write the failing tests** in `scripts/test.py`

```python
def test_district_rank():
    assert check.DISTRITOS[:4] == ["Lisboa", "Porto", "Coimbra", "Faro"]
    assert sorted(check.DISTRITOS) == sorted(check.LOOKUP) and len(check.DISTRITOS) == 20
    assert "prefixos" not in check.LOOKUP

def test_prefixos():
    assert check.PREFIXOS["21"] == ["Lisboa", "Setúbal"] and check.PREFIXOS["289"] == ["Faro"]
    assert all(d in check.RANK for ds in check.PREFIXOS.values() for d in ds)
    assert all(re.fullmatch(r"2\d{1,2}", p) for p in check.PREFIXOS)
```

Extend `test_lookup_embedded` to also assert `embed.prefix_line()` is a line of `index.html`, and that the `#lookup` JSON keys come out in `check.DISTRITOS` order.

- [ ] **Step 2: Run** `scripts/test.py` → FAIL on `test_district_rank` (`DISTRITOS` missing).
- [ ] **Step 3: Implement**: reorder `distritos.txt`; write `prefixos.txt`; in `check.py` read `DISTRITOS`, `RANK`, `PREFIXOS`, exclude `prefixos` from `LOOKUP`; in `embed_lookup.py` emit `#lookup` in rank order and add `prefix_line()` (same compact JSON style), writing/replacing the `#prefixos` line after `#lookup`; run `scripts/embed_lookup.py`.
- [ ] **Step 4: Run** `scripts/test.py` and `scripts/check.py index.html` → PASS.
- [ ] **Step 5: Commit** `feat(data): rank districts by size and map phone prefixes to districts`

---

### Task 2: Row format: 🔄 status and `data-loc` in `check.py`

**Files:**
- Modify: `scripts/check.py` (`ROW`, `check_row`, `main` counts)
- Test: `scripts/test.py`

**Interfaces:**
- Consumes: `DISTRITOS`, `RANK`, `LOOKUP` (Task 1).
- Produces:
  - Attribute `data-loc="…"` on `<tr>`, after `data-removed` / `data-src`: HTML-escaped (`&amp; &lt; &gt; &quot;`) compact JSON `{"l": [Loc...], "t": [str...], "e": [str...]}`. `Loc = {"local": str|null, "distrito": str|null, "morada": str|null, "telefone": str|null, "email": str|null, "main"?: true}`. Keys with null may be omitted.
  - `LOC_ATTR = re.compile(r' data-loc="([^"<>]*)"')`
  - `loc_key(i: int, loc: dict) -> tuple` — sort key `(not loc.get("main"), RANK.get(loc.get("distrito"), 99), i)`.
  - `visible(data: dict) -> list[str]` — the 5 cell values `[local, distrito, morada, email, telefone]` (escaped, with placeholders) for the first location: `l[0]` fields; e-mail `l[0].email or e[0]`; telefone `l[0].telefone or t[0]`; Distrito placeholder `<i>desconhecido</i>`, others `<i>indisponível</i>`.
  - `needs_loc(data: dict) -> bool` — `len(l) > 1 or` more than one distinct phone (all locations' `telefone` + `t`) `or` more than one distinct e-mail.

Rules `check_row` adds:
- Status `🔄` is valid and follows every ✅ rule (cells, lookup, `data-src` allowed). `data-loc` allowed only on ✅ / 🔄.
- `data-loc` must unescape to JSON of the shape above; each location: `distrito` in `DISTRITOS` or null; `local` in `LOOKUP[distrito]` or null, and non-null `local` needs a `distrito`; `telefone` matches `PHONE`, `email` matches `EMAIL`; strings non-empty; every `t` / `e` item matches `PHONE` / `EMAIL`.
- At most one `main`; locations sorted by `loc_key` (so `main` is first).
- `needs_loc(data)` is true (otherwise the attribute must be absent) and cells 3, 4, 5, 9, 10 equal `visible(data)`.
- `main()` prints the 🔄 count too: `rows: N  ⬜ a  ✅ b  🔄 c  🔒 d`.

- [ ] **Step 1: Write the failing tests**

```python
LOC2 = {"l": [{"local": "Lisboa", "distrito": "Lisboa", "morada": 'Rua "A" & <B>', "telefone": "+351 213 000 000", "main": True},
              {"local": "Porto", "distrito": "Porto", "morada": "Rua P 1"}], "t": [], "e": ["geral@x.pt"]}

def loc_attr(d): return ' data-loc="' + html.escape(json.dumps(d, ensure_ascii=False, separators=(",", ":"))) + '"'

def loc_row(d, status="✅", **over):
    v = check.visible(d)
    cells = filled(**over) if over else list(FILLED_CELLS)
    cells[0] = status; cells[3:6] = v[:3]; cells[9:11] = v[3:]
    return row(cells, attr=loc_attr(d))

def test_check_loc():
    assert check.check_row(loc_row(LOC2)) == []
    assert check.check_row(loc_row(LOC2, "🔄")) == []
    assert check.check_row(row(["🔄"] + FILLED_CELLS[1:])) == []
    bad = lambda **kv: check.check_row(loc_row({**LOC2, **kv}))
    assert bad(l=[{**LOC2["l"][0], "local": "Porto"}, LOC2["l"][1]])           # Local not in its Distrito
    assert bad(l=[LOC2["l"][1], LOC2["l"][0]])                                  # main not first
    assert bad(l=[{**x, "main": True} for x in LOC2["l"]])                       # two mains
    assert bad(l=[LOC2["l"][0]], e=[])                                           # nothing the cells lack: attribute must be absent
    assert bad(t=["212"])                                                        # bad phone
    unk = {"l": [{"morada": "Rua U"}, {"morada": "Rua V"}], "t": [], "e": []}
    assert check.check_row(loc_row(unk)) == []                                   # unknown Distrito: placeholders, valid
    assert check.check_row(loc_row(LOC2).replace("<td>Rua P", "<td>Rua Q")) == [] # only cells are compared, not the 2nd location
    swapped = loc_row(LOC2).replace("<td>Lisboa</td><td>Lisboa</td>", "<td>Porto</td><td>Porto</td>")
    assert check.check_row(swapped)                                              # visible cells must equal visible()
    assert check.check_row(row(["⬜", "0001", "X"] + [""] * 8, attr=loc_attr(LOC2)))  # not on ⬜
```

- [ ] **Step 2: Run** `scripts/test.py` → FAIL (`check.visible` missing).
- [ ] **Step 3: Implement** the interfaces and rules above in `check.py`; `ROW` accepts ` data-loc="[^"<>]*"` among the attributes.
- [ ] **Step 4: Run** `scripts/test.py`, `scripts/check.py index.html` → PASS (no row has `data-loc` yet).
- [ ] **Step 5: Commit** `feat(check): validate 🔄 rows and per-row location lists`

---

### Task 3: `apply_row.py`: locations JSON, ordering, refill guard

**Files:**
- Modify: `scripts/apply_row.py` (load `check.py` with `SourceFileLoader`, as `embed_lookup.py` does)
- Test: `scripts/test.py` (`test_apply_row` and new tests)

**Interfaces:**
- Consumes: `check.loc_key`, `check.visible`, `check.needs_loc` (Task 2).
- Produces: `build(old: str, d: dict) -> str` accepting the research JSON of spec §6.1: `locations` (list of Loc), `telefones`, `emails`, `areas`, `adicional`, `website`, `sources`, optional `private`, optional `cleared` (list of field names: `areas adicional website locations telefones emails`). Old flat keys (`local distrito morada telefone email`) still work as one location + `t` / `e`.

Behaviour:
- Locations: drop entries with every field empty; dedupe exact repeats; keep only the first `main`; sort with `check.loc_key` (stable, source order). Phones / e-mails: dedupe, keep source order; drop a `t` / `e` value already on a location.
- Cells 3, 4, 5, 9, 10 from `check.visible`; `data-loc` written (attributes in the order `data-removed`, `data-src`, `data-loc`) only when `check.needs_loc`.
- New status always ✅ (or 🔒 for `private`).
- **Refill guard**, only when the old row is 🔄: a field the new JSON leaves empty keeps the old row's value unless it is named in `cleared` — Áreas, Adicional, Website individually; locations as a whole (old visible Local / Distrito / Morada, or the old `data-loc` list, kept when `locations` is empty); phones and e-mails likewise. `sources` = old `data-src` URLs, then new ones, deduped.

- [ ] **Step 1: Write the failing tests**

```python
def test_apply_row_locations():
    old = row(["⬜", "0001", "X"] + [""] * 8)
    d = {"locations": [{"local": "Porto", "distrito": "Porto", "morada": "Rua P"},
                       {"local": "Faro", "distrito": "Faro", "morada": 'Rua "F" & 1'},
                       {"local": "Lisboa", "distrito": "Lisboa", "morada": "Sede", "telefone": "+351 213 000 000", "main": True}],
         "telefones": ["+351 912 000 000", "+351 213 000 000"], "emails": ["a@x.pt"], "areas": ["justica"], "sources": ["https://x.pt"]}
    new = apply_row.build(old, d)
    assert check.check_row(new) == []
    data = json.loads(html.unescape(re.search(r'data-loc="([^"]*)"', new).group(1)))
    assert [x["distrito"] for x in data["l"]] == ["Lisboa", "Porto", "Faro"]      # main, then rank
    assert data["t"] == ["+351 912 000 000"]                                       # the Lisboa number lives on its location
    assert "<td>Lisboa</td><td>Lisboa</td><td>Sede</td>" in new
    flat = apply_row.build(old, {"local": "Cascais", "distrito": "Lisboa", "morada": "Rua A", "telefone": "+351 214 000 000"})
    assert "data-loc" not in flat and "<td>Cascais</td>" in flat and check.check_row(flat) == []

def test_apply_row_refill_keeps():
    old = row(["🔄"] + FILLED_CELLS[1:], attr=' data-src="https://old.pt"')
    new = apply_row.build(old, {"areas": [], "website": None, "sources": ["https://new.pt"]})
    c = re.findall(r"<td>(.*?)</td>", new)
    assert c[0] == "✅" and c[3:6] == FILLED_CELLS[3:6] and c[6] == "clinica educacao" and c[8] == "https://example.pt"
    assert 'data-src="https://old.pt https://new.pt"' in new
    gone = apply_row.build(old, {"website": None, "cleared": ["website"]})
    assert re.findall(r"<td>(.*?)</td>", gone)[8] == IND
    fresh = apply_row.build(row(["⬜", "0001", "X"] + [""] * 8), {"website": None})
    assert re.findall(r"<td>(.*?)</td>", fresh)[8] == IND                         # guard only on 🔄
```

- [ ] **Step 2: Run** `scripts/test.py` → FAIL.
- [ ] **Step 3: Implement** `build` per the behaviour above; update the module docstring's key list.
- [ ] **Step 4: Run** `scripts/test.py` → PASS (existing `test_apply_row`, `test_apply_batch` still pass).
- [ ] **Step 5: Commit** `feat(data): write every location of an entity from research`

---

### Task 4: Diff rules, refill batches, CI auto-merge

**Files:**
- Modify: `scripts/check.py` (`check_diff`, `_entity`), `scripts/apply_batch.py`, `.github/workflows/check.yml`
- Test: `scripts/test.py` (`test_check_diff`, `test_apply_batch`)

**Interfaces:**
- Produces: `scripts/apply_batch.py [--refill] OUT ID...`; with `--refill` the commit message is `feat(data): refill eID` and `OUT/body.md` heading stays `## Entities`.
- Batch branch prefixes: `BATCH = ('feat/fill-batch-', 'feat/refill-batch-')` in `check.py`.

Rules:
- `_entity(old, new, branch, batch: bool)`: as today, plus 🔄 → ✅ / 🔒 allowed (it already accepts any old). **Migration shapes**, accepted only when `batch` is false: ✅ → 🔄 with only the status cell changed (attributes identical); ✅ without `data-src` → ⬜ with all data cells empty and no `data-src` / `data-loc`.
- `check_diff` passes `batch = bool(branch) and branch.startswith(BATCH)`; the "one entity's id in the branch name" check is unchanged.
- Workflow: `scope` and `merge` jobs run for `feat/fill-batch-` **or** `feat/refill-batch-` heads; update both comments.

- [ ] **Step 1: Write the failing tests** (extend `test_check_diff`, using its `diff()` helper)

```python
    done = row(FILLED_CELLS, attr=' data-src="https://x.pt"')
    pend = done.replace("<td>✅</td>", "<td>🔄</td>", 1)
    bare = row(FILLED_CELLS)
    zero = row(["⬜", "0001", FILLED_CELLS[2]] + [""] * 8)
    assert check.check_diff(diff((done, pend)), ["index.html"], "chore/migrate-locations") == []
    assert check.check_diff(diff((bare, zero)), ["index.html"], "chore/migrate-locations") == []
    assert check.check_diff(diff((done, pend)), ["index.html"], "feat/fill-batch-20261121")      # not on batch branches
    assert check.check_diff(diff((done, zero)), ["index.html"], "x")                             # has data-src: may not go ⬜
    assert check.check_diff(diff((pend, done.replace("Cascais", "Sintra"))), ["index.html"], "feat/refill-batch-1") == []
```

Extend `test_apply_batch` with one `--refill` run asserting the commit subject `feat(data): refill e0001`.

- [ ] **Step 2: Run** `scripts/test.py` → FAIL.
- [ ] **Step 3: Implement** the rules, the `--refill` flag and the workflow change.
- [ ] **Step 4: Run** `scripts/test.py` → PASS.
- [ ] **Step 5: Commit** `feat(check): accept the 🔄 migration and refill batches`

---

### Task 5: Page: filters, shown location, contacts, expand, exports

**Files:**
- Modify: `app.js` (`parse`, `fillLocais`, `matches`, `enhance`, `render`, `KEY`, `emails`, `ACT.csv`, tooltip handler), `app.css`, `index.html` (static shell only: nothing in rows)
- Create: `tests/rows-loc.txt` (fixture, built with `apply_row.build` so it passes `check.check_row`)
- Test: `scripts/test.py` (new sweep `loc`, new `_part_locations` in `PAGE_PARTS`, a lists scenario for CSV / e-mails)

**Interfaces:**
- Consumes: `#lookup` key order = rank, `#prefixos` (Task 1); `data-loc` shape (Task 2).
- Produces (in `app.js`; names fixed so tests and later readers agree):
  - row fields: `r.locs` (Loc[], from `data-loc` or, without it, one Loc from cells 3–5, 9, 10), `r.tels`, `r.mails` (entity-level), `r.dists` (distinct non-null distritos, in `r.locs` order), `r.pend` (status 🔄; `r.ok` is true for ✅ and 🔄).
  - `shown(r) -> Loc[]` — `r.locs` reordered for the current `S`: locations with `local === S.c` first, then `distrito === S.d`, then the rest; stable.
  - `rec(r) -> Loc|null` — `shown(r)[0]` if it matches `S.c` (when set) or `S.d` (when set); else that location if it has `main` and no `S.c` / `S.d`; else null.
  - `contacts(r, kind: 'telefone'|'email') -> string[]` — spec §4: shown location's own; then (phones only) entity landlines whose `#prefixos` districts include the selected / shown district; then landlines by best rank of their prefix's districts; then mobiles (`+351 9`) and anything else, source order. E-mail: own, then `r.mails` in order. Prefix of `+351 2xxxxxxxx`: first 2 digits if `21` / `22`, else first 3.
  - `distLabel(r) -> string` — `S.d` set: `D` or `D (+N)`; else 0 → placeholder, 1–3 → joined `, `, 4–8 → first 3 + ` +N`, ≥ 9 → `Por todo o país (N distritos)`. `title` lists all `r.dists`.
  - `place(r)` — called in `render` for every row of the slice, every time: rewrites cells 3, 4, 5, 9, 10 from `shown(r)` / `contacts` / `distLabel`, keeps the "Local fica em …" warning, adds the tag and the expand.
- Display rules:
  - Tag: after the first phone / e-mail when it is `rec(r)`'s own: `<span class="rec">(recomendado)</span>` + `<i class="help" data-tip="…">?</i>` with `É o contacto da localização no distrito selecionado.` (S.c / S.d set) or `É o contacto da sede da entidade.`. The tooltip handler shows `h.dataset.tip` when present, else the current 🔒 text.
  - Expand (in the Morada cell; my call): `<details class="locs"><summary>Outras localizações</summary><ul>…</ul></details>`, summary `Todas as localizações` when `r.dists.length >= 9`. One `<li>` per location: `Distrito · Local · Morada · phone · e-mail` (missing parts skipped), in `shown(r)` order; the first location is left out unless ≥ 9 districts. A last `<li>` `Outros contactos: …` lists entity phones / e-mails not shown in the cells (my call, so no number is unreachable). No expand when there is nothing to list.
  - Filters: `S.c` matches if any location's `local === S.c`; `S.d` matches if any location's `distrito === S.d` or its `local` is in `LOC[S.d]`; `d=desconhecido` matches when no location has a distrito. `fillLocais` counts a row once per distinct local.
  - Sort keys `local` / `distrito`: `r.locs[0]` (stable, not filter-dependent).
  - 🔄: status icon 🔄, label and title `A rever localizações` (with sources: `A rever localizações · ver fontes`); counted as filled everywhere.
  - `emails()` and CSV use `contacts(r, 'email')[0]`; CSV Local / Distrito / Morada / Telefone from `shown(r)[0]` / `contacts`; new column `Distritos` after `Distrito`: `r.dists.join('; ')`.

Fixture `tests/rows-loc.txt` (ids e0011–e0014):
- e0011 "Rede Nacional": 10 locations, one per district from Lisboa to Madeira in rank order except Lisboa is `main` at "Sede"; Lisboa location phone `+351 213 000 001`, Porto location phone `+351 222 000 002`.
- e0012 "Três Sítios": no main; locations Faro, Porto, Coimbra (no own contacts); `telefones` `["+351 912 000 000", "+351 289 000 000", "+351 222 000 000"]`.
- e0013 "Clínicas": Lisboa (freguesia `Arroios`, distrito Lisboa), Cascais (distrito Lisboa, phone `+351 214 000 003`), Porto; no main.
- e0014 "Só Móveis": Braga, Aveiro, no own contacts; `telefones` `["+351 936 000 000", "+351 917 000 000"]`; second location Distrito `null` (Morada only).

- [ ] **Step 1: Write the failing page assertions** in `_part_locations` (sweep `loc` over `LOCH = [ALL, ALL + "d=Porto", ALL + "d=Lisboa&c=Cascais", ALL + "d=Faro", ALL + "d=desconhecido"]`, all on one page so filter changes after the first render are exercised):

```python
    # cell(dom, rid, i): text of cell i of row rid (write it next to _text; 0-based like CELLS)
    a = loc(ALL)
    assert cell(a, "e0011", 4).startswith("Por todo o país (10 distritos)") and "Todas as localizações" in a
    assert cell(a, "e0012", 4).startswith("Porto, Coimbra, Faro")             # rank order, 3 districts, no +N
    assert cell(a, "e0013", 4).startswith("Lisboa, Porto")                    # two Lisboa sites count once
    assert "(recomendado)" in cell(a, "e0011", 10) and "É o contacto da sede da entidade." in a
    assert "222 000 000" in cell(a, "e0012", 10) and "(recomendado)" not in cell(a, "e0012", 10)  # Porto prefix ranks above Faro's
    assert "936 000 000" in cell(a, "e0014", 10) and "(recomendado)" not in cell(a, "e0014", 10)  # mobiles: first listed
    assert cell(a, "e0014", 4).startswith("Braga")                            # unknown Distrito not counted
    p = loc(ALL + "d=Porto")
    assert cell(p, "e0011", 4).startswith("Porto (+9)") and "222 000 002" in cell(p, "e0011", 10)
    assert "(recomendado)" in cell(p, "e0011", 10) and "É o contacto da localização no distrito selecionado." in p
    assert "222 000 000" in cell(p, "e0012", 10) and "(recomendado)" not in cell(p, "e0012", 10)  # loose number: no tag
    assert "e0014" not in _ids(p)
    c = loc(ALL + "d=Lisboa&c=Cascais")
    assert _ids(c) == ["e0013"] and "Cascais" in cell(c, "e0013", 3) and "(recomendado)" in cell(c, "e0013", 10)
    f = loc(ALL + "d=Faro")
    assert "e0012" in _ids(f) and "289 000 000" in cell(f, "e0012", 10)
    assert "e0014" not in _ids(loc(ALL + "d=desconhecido"))                   # it has Braga
```

Write the assertions cleanly (the block above fixes the values; tidy the helper to the file's `_text` style and drop the placeholder lines). Add a lists scenario `locexport` on the `rows-loc` fixture: CSV header contains `Distrito";"Distritos"`, e0011's line holds `Lisboa; Porto; Coimbra; …`, `emails` copy has one address per entity. Add a 🔄 row (e0015, copy of e0003 with 🔄) and assert `aria-label="A rever localizações"` and that it counts as `com dados`.

- [ ] **Step 2: Run** `scripts/test.py` → FAIL in `_part_locations`.
- [ ] **Step 3: Implement** the interfaces and rules in `app.js`; styles in `app.css` for `.locs`, `.rec` following `docs/DESIGN.md` (reuse `.src` details styling where it fits; keyboard and screen readers get `<details>` / `<summary>` for free).
- [ ] **Step 4: Run** `scripts/test.py` → PASS (all existing page parts too).
- [ ] **Step 5: Commit** `feat(ui): show every location of an entity, district-aware contacts`

---

### Task 6: Skills and spec

**Files:**
- Modify: `.claude/skills/fill-entity/SKILL.md`, `.claude/skills/fill-batch/SKILL.md`, `SPEC.md` (§4, §4.3, §5, §6.2, §7, §9 "Re-verifying already ✅ entities" becomes the 🔄 pass)
- Create: `.claude/skills/refill-entity/SKILL.md`, `.claude/skills/refill-batch/SKILL.md`

Content to pin:
- **fill-entity**: research every location the entity lists (its "onde estamos" / "contactos" / "delegações" pages; opening pages is not a search; ~10 searches budget unchanged); per location the existing Distrito/Local lookup procedure; phone / e-mail on a location only when the page ties them to that address, otherwise in `telefones` / `emails`; `main: true` only when the site clearly names a head office ("Sede"). JSON example = spec §6.1. Remove the ✅ refill exception in step 1 (🔄 rows belong to refill-entity; ✅ rows stop the run).
- **refill-entity**: same contract and JSON as fill-entity, input row must be 🔄 (stop and report otherwise). Read the row and its `data-src` / `data-loc`; open the sources first and follow them to the entity's own locations page; search only when they lead nowhere. Existing values stay unless a page contradicts them; to empty a field on purpose, name it in `cleared` with the reason in the report. Same report line format.
- **refill-batch**: copy of fill-batch's procedure with: selection of `🔄` rows (`grep -o '^<tr id="e[0-9]*"[^>]*><td>🔄'`); subagent prompt `Use the refill-entity skill for entity ID. …`, `model: haiku`, `effort: medium`, ≤ 10 per message; branch `feat/refill-batch-<stamp>`; `scripts/apply_batch.py --refill`; PR merges on its own once checks pass.
- **fill-batch**: only the counts/regex lines that mention statuses gain 🔄 where relevant (it still selects ⬜ only).

- [ ] **Step 1: Write** the four skill files and the `SPEC.md` sections.
- [ ] **Step 2: Verify**: `grep -n 'indisponível. Then go on' .claude/skills/fill-entity/SKILL.md` prints nothing; `scripts/test.py` → PASS.
- [ ] **Step 3: Commit** `docs(skills): research every location; add refill-batch and refill-entity`

---

### Task 7: Push, PR, then the migration PR

- [ ] **Step 1:** `git push -u origin feat/multi-location`; `gh pr create --base main` with a short body linking the spec. Report the URL. Do not merge.
- [ ] **Step 2: After that PR is merged by the user**, from fresh `origin/main` on branch `chore/migrate-locations`, run the one-off rewrite (no script file kept):

```bash
python3 - <<'EOF'
import re, pathlib
p = pathlib.Path('index.html'); out = []
for l in p.read_text(encoding='utf-8').split('\n'):
    m = re.match(r'(<tr id="e\d+"(?: data-removed="1")?)( data-src="[^"]*")?><td>✅</td><td>(\d+)</td><td>(.*?)</td>', l)
    if m and m.group(2): l = l.replace('<td>✅</td>', '<td>🔄</td>', 1)
    elif m: l = f'{m.group(1)}><td>⬜</td><td>{m.group(3)}</td><td>{m.group(4)}</td>' + '<td></td>' * 8 + '</tr>'
    out.append(l)
p.write_text('\n'.join(out), encoding='utf-8')
EOF
scripts/check.py index.html
```

Expected: `🔄 4466`, `⬜` up by 737, `✅ 0`. Then `scripts/check.py --diff origin/main --branch chore/migrate-locations` prints nothing. Commit `chore(data): queue filled entities for location re-research`, push, `gh pr create`, report the URL. Do not merge.
