---
name: refill-entity
description: Use when given one OPP protocol number (e.g. 0001) of a 🔄 row and an output directory, to re-research that entity (every location) and write its updated row there. Research only: no git, no gh.
---

# Re-research one 🔄 entity

Input: a protocol number, the repo path, and an output directory `OUT`. Output: one JSON file in `OUT`. The row is `🔄`: it was filled earlier and now awaits a second pass that adds every location of the entity and fixes anything a source contradicts. You never run git or `gh`, never edit `index.html`, never write files anywhere else. The orchestrator (`refill-batch`) validates the row, commits it and opens the PR. The row format is the contract in `SPEC.md` §4 and §5; this skill is the procedure.

Below, `ID` is the number zero-padded to at least 4 digits (`1` → `0001`, `10000` stays `10000`). The row id in `index.html` is `e` + `ID`: entity `0340` is `<tr id="e0340"`, never `id="0340"`.

## 1. Read the row (the name and the sources come from here)

Read-only, from the repo path you were given (entity `0340` → `grep '^<tr id="e0340"[ >]' REPO/index.html`):

```bash
grep '^<tr id="eID"[ >]' REPO/index.html
```

- No output: before concluding the row is missing, check you kept the `e` prefix and the full zero-padded number, and run it once more. Still nothing: the id does not exist or is flagged `data-removed`. Stop, report it.
- Second cell is not `🔄` (`⬜` belongs to `fill-entity`; `✅` and `🔒` are done): stop, report it, write nothing.
- Otherwise the third `<td>` is the Nome. Copy it exactly. Never change it.
- The `<tr>` tag carries `data-src="URL URL…"`: the pages the existing values came from. It may also carry `data-loc="…"`: HTML-escaped JSON `{"l":[locations],"t":[phones],"e":[e-mails]}` holding every location already known (`l`: `local`, `distrito`, `morada`, `telefone`, `email`, `main`), the phones `t` and e-mails `e` not tied to an address. Without `data-loc` the visible cells (Local, Distrito, Morada, E-mail, Telefone) are the one known location.

The existing values are leads. They stay unless a page you open contradicts them.

## 2. Research

**Search errors stop you.** If the WebSearch tool returns an error, a budget or quota message, or a refusal (anything other than a result list), stop at once: do not retry, do not switch to another search or fetch route, and do not write `OUT/eID.json`. Report `eID | NOME | FAILED: web search unavailable: <message>`. An empty result list, or results that do not match the entity, is a normal result and counts as "searched, found nothing".

The search tool is US-only. A bare Portuguese name returns Brazilian pages and PDFs, so:

1. Always add `Portugal` to the query. Quote the brand word: `"Psicosorrir" Portugal`.
2. The Nome is often the registry name, not the trading name. If the full Nome finds nothing, search the distinctive brand word alone (the part before " - ", or the first capitalised word) with `Portugal`, then the NIF if you have it. Add the city if the name contains one.
3. A hit counts only if it is in Portugal (`.pt`, +351, a Portuguese city). Ignore `.br` results.
4. If standard mode returns nothing useful, retry the same query in extended mode before giving up.
5. Directories (einforma, Doctoralia, Portal da Saúde Mental) usually point to the entity's own site: open that site for the values.

Start from the `data-src` URLs: open them first and follow them to the entity's own locations page ("onde estamos", "contactos", "delegações"). Search only when those sources lead nowhere (dead link, wrong entity). Then prefer the entity's own website, then official directories (SNS, Carta Social, câmara municipal). Open pages to read them. Do not guess from memory.

Collect, using only what a page states. A dead link or a value no page confirms is not a contradiction: keep the existing value and its source. An entity may work from several places: research **every location** it lists (its "onde estamos", "contactos" or "delegações" page), no cap. Opening pages is not a search; the budget below is unchanged.

Per location:

| Cell | Value | If not found |
|---|---|---|
| Local | one name copied exactly from the Distrito's lookup file (see "Distrito and Local" below) | `null` |
| Distrito | one name from `REPO/lookup/distritos.txt` | `null` |
| Morada | street address as written | `null` |
| Telefone | `+351 212 345 678` style: `+`, country code, space, digits and spaces; only if the page ties it to this address | `null` |
| E-mail | one public e-mail; only if the page ties it to this address | `null` |
| main | `true` only when the site clearly names this one the head office ("Sede", "Sede nacional"); at most one location | leave out |

For the entity as a whole:

| Cell | Value | If not found |
|---|---|---|
| Telefones | phones not tied to any address (e.g. a "Contactos" page listing several numbers), same format | `[]` |
| E-mails | e-mails not tied to any address | `[]` |
| Áreas | space-separated slugs from the list below, no duplicates | `<i>desconhecido</i>` (alone) |
| Adicional | short free text the slugs do not cover (e.g. "Intervenção precoce") | `<i>indisponível</i>` |
| Website | starts with `http://` or `https://` | `<i>indisponível</i>` |

An entity with one place gives one location. A phone or e-mail the page does not tie to an address goes in `telefones` / `emails`, not on a location.

### Distrito and Local

Do this once per location. Use that location's Morada (never the entity's name or memory), and the lists in `REPO/lookup/`:

1. Read `REPO/lookup/distritos.txt` (20 names: the 18 distritos plus Açores and Madeira). Pick the Distrito the Morada is in. Not sure, or no Morada: Distrito `null`, Local `null`.
2. Read the whole file `REPO/lookup/<Distrito>.txt` (e.g. `lookup/Setúbal.txt`) and pick the name the Morada is in. Copy it exactly as written there.
3. Local is a município (the concelho, not the town: Alverca → `Vila Franca de Xira`). In `Lisboa.txt` the Morada may be a município, or, when it is inside the city of Lisboa, a freguesia from the second list. Prefer the freguesia if the Morada or a page names it; otherwise use the município `Lisboa`.
4. No name in the file fits: Local `null`. Never write a Local that is not a line of that file; `scripts/check.py` rejects it.

Áreas slugs: `clinica neuropsicologia psicoterapia educacao organizacoes justica comunitaria desporto`. Nothing else is valid. Anything that does not fit goes in Adicional.

A row where every field is indisponível/desconhecido is valid: it means "searched, found nothing". Do not spend more than about 10 searches.

### Private individual (🔒)

If research shows the entity is clearly a natural person (not a company, association, IPSS, public body or any other organisation) and no page gives public business data for them, do not publish anything. Write the JSON `{"private": true}` (see section 3). This is not FAILED and not a ⬜ row left behind: 🔒 marks the row done, so it is never researched again. Use it only when the entity is clearly a private individual. A person who runs a public practice or business with published contacts, or any doubt, stays on the normal path (fill what the pages state, or all placeholders).

## 3. Write the JSON

Write `OUT/eID.json` with the Write tool. Plain values, no HTML, no escaping, no placeholders: the orchestrator builds the row, escapes it and fills `<i>indisponível</i>` / `<i>desconhecido</i>` for anything you leave out. Do not include the Nome.

```json
{
  "locations": [
    {"local": "Lisboa", "distrito": "Lisboa", "morada": "Rua José Estêvão, 135 A, 1150-201 Lisboa", "telefone": "+351 213 587 900", "email": "apav.sede@apav.pt", "main": true},
    {"local": "Porto", "distrito": "Porto", "morada": "Rua X 12, 4000-000 Porto"}
  ],
  "telefones": ["+351 210 000 000"],
  "emails": ["geral@apav.pt"],
  "areas": ["justica"],
  "adicional": "Apoio a vítimas de crime",
  "website": "https://www.apav.pt",
  "sources": ["https://www.apav.pt/apav_v3/index.php/pt/contactos"]
}
```

- A value you did not find on a page: `null` (or leave the key out). Never guess. `apply_row.py` keeps the old value of `areas`, `adicional`, `website`, `locations`, `telefones` and `emails` when the JSON leaves that field empty; an empty `morada` / `telefone` / `email` inside a location you list is filled from the old location with the same `local` and `distrito`.
- To empty a field on purpose (a page shows the old value is wrong and there is no replacement), name it in `cleared`: a list of `areas`, `adicional`, `website`, `locations`, `telefones`, `emails`, and give the reason in your report. Without `cleared`, an empty field never wipes an old value.
- A location or contact the old row has and your pages do not mention stays: list it again in `locations` / `telefones` / `emails`, or leave the key out so it is kept. Old locations your list does not match (same `local` and `distrito`) are kept as they are. To drop an old location on purpose, name `locations` in `cleared` and list every location to keep.
- `locations`: one entry per place the entity lists, in any order (`apply_row.py` orders them: `main` first, then by Distrito). Each entry holds only the keys of the per-location table; `main` is `true` or left out. A single-place entity has one entry. `[]` if you found no location.
- `telefones`, `emails`: lists of contacts not tied to an address; `[]` if none.
- `areas`: slugs from the list above only, no duplicates; `[]` if none fit.
- `sources`: every page (locations page included) you took a value from, as full `http(s)` URLs; `[]` if you found nothing. They are added to the row's existing `data-src` and shown on the site in a popup on the ✅ icon.
- Private individual (🔒): write only `{"private": true}`. `apply_row.py` then writes a 🔒 row with every data cell a placeholder and no `data-src`; any other keys are ignored.
- Fields still follow the formats in the table (URL starts with `http(s)://`, phone `+351 212 345 678` style).

Do not open `index.html` in an editor; it has 6,000+ lines.

## 4. Report

Final message, one line, always with the Nome as read in step 1: `eID | NOME | ok`, `eID | NOME | private` (you wrote `{"private": true}`), or `eID | NOME | FAILED: <reason>`. If step 1 found no row, use `—` for NOME. When you used `cleared`, add the field and the reason to the same line after `ok`: `eID | NOME | ok (cleared website: site gone, domain for sale)`.

A run that hit a search error (section 2) writes no JSON, so the orchestrator records it as FAILED. Never write a JSON for a run you could not finish searching.
