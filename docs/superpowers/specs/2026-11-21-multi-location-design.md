# Multiple locations per entity: design

Date: 2026-11-21. Status: approved in conversation; written for the builder.

## 1. Intent

Some entities work from many places: APAV (e0020) has offices across the country, Associação Abraço (e0156) has several clinics. Today a row holds one Local, one Distrito, one Morada (`SPEC.md` §4), so:

- someone filtering by Porto never sees APAV, though they could work from its Porto office;
- the page shows one address and one phone, which may be in the wrong district for the reader;
- `fill-entity` collects "one name" per field, so research drops every other site.

Goal: a reader looking for a place to work sees every entity with a site in their district, with that site's address and contact first.

## 2. Goals, non-goals, anti-goals

Goals
- An entity holds a list of locations; filters match any of them.
- The row stays one line and stays concise; every location is reachable through one expand button.
- The contact shown first matches the district the reader picked.
- New research collects every location. Existing ✅ rows get re-researched later by two new skills (orchestrator + subagent), starting from their saved sources. ✅ rows with no sources restart from zero.

Non-goals
- Map view, distance per location.
- A filter or UI for the interim "pending re-research" status.
- Running the re-research itself as part of this work (the user runs the new skills afterwards).

Anti-goals (a failure even if it works)
- Rows that grow into multi-line blocks of addresses.
- A number shown first that changes between page loads.
- Losing data already in the 4,466 filled rows during migration.

## 3. Data model

### 3.1 Location

| Field | Notes |
|---|---|
| `local` | as today: a line of `lookup/<distrito>.txt` |
| `distrito` | as today: a line of `lookup/distritos.txt` |
| `morada` | street address as written |
| `telefone` | only if the page ties it to this address |
| `email` | only if the page ties it to this address |
| `main` | `true` on at most one location, only when the entity's site clearly names a head office ("Sede", "Sede nacional"). Absent otherwise |

Entity-level `telefone` / `email` lists hold contacts not tied to any address ("Contactos" page with several numbers).

### 3.2 Ordering (one rule, used everywhere)

Locations are ordered:
1. the `main` location, if any;
2. the rest by district size, using a fixed list in code: Lisboa, Porto, Coimbra, Faro (user's order), then the remaining districts by population (builder: take INE resident population, fixed once, stored in code next to the lookup).
3. ties (same district) by source order.

With a district selected, that district's locations go first (themselves ordered by 1–3), then the rest as above. With a Local also selected, that Local's locations go first, then the rest of the district, then the rest. Everywhere below, "selected district" means the selected Local when one is chosen (my call), including for "(recomendado)".

### 3.3 Storage (my call)

- The row stays one line, eleven `<td>`. The visible Local / Distrito / Morada / E-mail / Telefone cells hold the **first location by rule 3.2** (no district selected), so the page reads sensibly without JS and existing regexes keep working.
- The full data goes in a `data-loc` attribute on the `<tr>`: HTML-escaped JSON `{"l":[{location}...],"t":[entity phones],"e":[entity e-mails]}`. Absent on rows with a single location and no extra contacts, so most rows don't change.
- `apply_row.py` is still the only writer: it takes the new JSON (§6), orders locations, writes the visible cells and `data-loc`.
- `SPEC.md` §4 and §5 are updated to describe this.

### 3.4 Status: 🔄 pending re-research (icon is my call)

- New status `🔄`: the row was ✅ and awaits the re-research skill. Its cells and `data-src` are kept as they are and shown as normal on the page.
- Rendered like ✅ (same popup on the icon, label "A rever localizações"). No filter for it; the existing status filter counts it as filled.
- Migration, one commit:
  - every ✅ row **with** `data-src` (4,466) becomes 🔄, cells and sources kept;
  - every ✅ row **without** `data-src` (737, including the 12 that hold data, e.g. e0050, e0088, e0205) goes back to ⬜ with every data cell emptied (user's rule: start from zero). The normal `fill-batch` picks them up again;
  - ⬜ and 🔒 untouched.
- The existing fill-entity refill exception (✅ rows with Website and Telefone both indisponível) is removed: after migration those rows are 🔄 (with sources) or ⬜ (without) (my call).
- `check.py`: accept 🔄 with the same rules as ✅; `--diff` accepts ⬜→✅/🔒 (today) and 🔄→✅/🔒 (re-research). It must also accept the migration's ✅→🔄 (status cell only) and ✅→⬜ (all data cells emptied, `data-src` removed); a one-off mode or a check of exactly those shapes (builder's choice).

## 4. Phone and e-mail ordering

Order of contacts shown for a row, given the selected district D (or none):

1. the phone / e-mail of the location shown first (§3.2);
2. entity-level landlines whose prefix maps to D;
3. entity-level landlines by the big-districts order of §3.2 (via their prefix);
4. mobiles (9x), in source order (first listed; never random).

E-mail: the location's own e-mail first, then entity-level e-mails in source order.

Prefix table: new file `lookup/prefixos.txt` (format is the builder's call, e.g. `21 Lisboa Setúbal`), built from ANACOM's national numbering plan (geographic 2xx ranges). A prefix spanning two districts maps to both (21 covers Lisboa and northern Setúbal). Embedded into `index.html` the same way `scripts/embed_lookup.py` embeds the other lookups.

### 4.1 "(recomendado)"

- Shown after the first phone and first e-mail **only if** they belong to the recommended location: the selected district's location when a district is selected, else the `main` location.
- No district selected and no `main` flag → no tag. A contact reached only through steps 2–4 never gets the tag.
- A small `?` button next to it opens a short text with the two cases:
  - "É o contacto da sede da entidade."
  - "É o contacto da localização no distrito selecionado."
  (Show the one that applies; wording is the builder's to polish.)

## 5. The page

### 5.1 Distrito cell

Filter on "Todos":
- 1 district: `Lisboa`
- 2–8 districts: first 3 by §3.2, then `+N`: `Lisboa, Porto, Faro +3`
- 9 or more: `Por todo o país (9 distritos)`

Filter on district D: `D (+N)`, N = other districts (several sites in D count as one).

Districts are counted, not locations: four Lisboa clinics are one district.

Tooltip (`title`) on the cell lists all districts.

### 5.2 Local and Morada cells

One location: the first by §3.2 (with D selected: D's first location). No `+N` in these cells.

### 5.3 Expand button

- One button per row with more than one location (or any extra contacts).
- Label: "Outras localizações"; in the 9+ districts case: "Todas as localizações".
- Opens a list, one line per location in §3.2 order: Distrito, Local, Morada, phone, e-mail. The location already shown in the row is listed too in the 9+ case, left out otherwise (builder's call if this reads oddly; keep it consistent).
- A location without its own phone / e-mail shows nothing for them (the row already shows the entity contact).
- Keyboard and screen-reader accessible (`<details>`/`<summary>` or `aria-expanded` button), per `SPEC.md` §6.6.

### 5.4 Filters

Distrito / Local filters match a row if any location matches. The existing "Local belongs to another Distrito" warning (`app.js:193`) applies per location.

"Near a city" (`SPEC.md` §6.3): use the nearest location (builder: check how §6.3 works today and keep it per location if cheap; otherwise first location, mark as `ponytail:`).

### 5.5 CSV export and list e-mail copy (my call)

The list "copy e-mails" action (`SPEC.md` §6.7) copies one e-mail per entity: the first by §4 for the current filter. CSV: one line per entity. Local, Distrito, Morada, Telefone, E-mail come from the recommended / first location for the current filter. Extra column `Distritos` lists all districts, `; `-separated.

## 6. Research

### 6.1 fill-entity changes

- Collect **every** location the entity lists (its "onde estamos" / "contactos" / "delegações" page), no cap. Opening pages is not a search; the ~10 searches budget is unchanged.
- Each location: local, distrito, morada via the existing lookup rules (per location), plus phone / e-mail only when the page ties them to that address.
- `main: true` only when the site clearly names a head office.
- JSON shape (replaces the single local/distrito/morada/telefone/email keys):

```json
{
  "locations": [
    {"local": "Lisboa", "distrito": "Lisboa", "morada": "Rua José Estêvão, 135 A, 1150-201 Lisboa", "telefone": "+351 213 587 900", "email": "apav.sede@apav.pt", "main": true},
    {"local": "Porto", "distrito": "Porto", "morada": "…"}
  ],
  "telefones": ["+351 …"],
  "emails": ["geral@…"],
  "areas": ["justica"],
  "adicional": "Apoio a vítimas de crime",
  "website": "https://www.apav.pt",
  "sources": ["https://www.apav.pt/apav_v3/index.php/pt/contactos"]
}
```

- Single-location entities produce one entry in `locations`. `apply_row.py` should still accept the old flat keys (as one location) so JSONs from in-flight batches don't break.

### 6.2 Two new skills: refill-batch and refill-entity (built here, run later by the user)

- Names are my call. They mirror `fill-batch` / `fill-entity` (user's rule: same logic):
  - `refill-batch` (orchestrator): selects 🔄 rows (given ids, a count N, or 5 random), spawns one `refill-entity` subagent per id in parallel (≤10 per message) with `model: haiku`, `effort: medium`, applies with `scripts/apply_batch.py`, one commit per entity, branch `feat/refill-batch-<stamp>`, one PR.
  - `refill-entity` (subagent): research only, no git / `gh`, writes `OUT/eID.json`.
- Refill PRs **merge on their own** once checks pass, like fill-batch PRs: extend the `scope` and `merge` jobs in `.github/workflows/check.yml` (both key on `feat/fill-batch-`) to `feat/refill-batch-*`.
- Shared code (apply scripts, JSON shape) is reused, not copied.
- Subagent: reads the row, opens its `data-src` URLs first, follows them to the entity's own locations page; searches only when the sources lead nowhere (every 🔄 row has sources by construction).
- **Existing values are kept unless a page contradicts them** (user's rule: "fix other cells when it says something different"). A dead link or an unconfirmed value is not a contradiction: keep the value and its source. Guard: `apply_row.py` / `check.py --diff` refuse a 🔄→✅ change that turns a filled cell into a placeholder, unless the JSON lists that field in an explicit `cleared` key with a reason.
- Output: the same JSON as §6.1. Adds all locations **and** fixes any other cell (Áreas, Adicional, Website, …) a source now contradicts.
- Result: row goes 🔄 → ✅ (or 🔒). One commit per entity, one PR per batch, as today.
- Resumable by construction: 🔄 rows are the queue.

## 7. Constraints

- `index.html` stays one line per entity, rows sorted, never reordered (`SPEC.md` §5).
- `apply_row.py` is the only row writer; `check.py` runs on every PR.
- Repo git rules: worktree + branch, conventional commits, PR, no trailers, never bypass hooks/signing.
- No new dependencies.

## 8. Calls I made (check these)

1. Status icon `🔄` and label "A rever localizações".
2. Storage as `data-loc` JSON on the `<tr>`, visible cells = first location.
3. Rows with no sources (737) stay ✅ and are not re-researched.
4. CSV: one line per entity plus a `Distritos` column.
5. "First few" = 3; districts after Lisboa, Porto, Coimbra, Faro ordered by population.
6. Mobile fallback = first listed, not random.
7. Expand list in the 2–8 case omits the location already shown in the row.
8. A selected Local narrows the ordering and "(recomendado)" like a district does.
9. The old fill-entity refill path (Website and Telefone both indisponível) is removed.
10. List "copy e-mails" copies one e-mail per entity, same rule as the CSV.

## 9. Left to the builder

- Exact JSON key names inside `data-loc` and the prefix file format.
- UI styling of the expand list and the `?` popup, within `docs/DESIGN.md`.
- How `check.py` validates the migration commit.
- How much of fill-entity's text refill-entity repeats vs. points to.
