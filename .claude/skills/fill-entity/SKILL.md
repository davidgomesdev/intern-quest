---
name: fill-entity
description: Use when given one OPP protocol number (e.g. 0001) and an output directory, to research that entity and write its new row there. Research only: no git, no gh.
---

# Research one entity

Input: a protocol number, the repo path, and an output directory `OUT`. Output: one JSON file in `OUT`. You never run git or `gh`, never edit `index.html`, never write files anywhere else. The orchestrator (`fill-batch`) validates the row, commits it and opens the PR. The row format is the contract in `SPEC.md` §4 and §5; this skill is the procedure.

Below, `ID` is the number zero-padded to at least 4 digits (`1` → `0001`, `10000` stays `10000`). The row id in `index.html` is `e` + `ID`: entity `0340` is `<tr id="e0340"`, never `id="0340"`.

## 1. Read the row (the name comes from here)

Read-only, from the repo path you were given (entity `0340` → `grep '^<tr id="e0340"[ >]' REPO/index.html`):

```bash
grep '^<tr id="eID"[ >]' REPO/index.html
```

- No output: before concluding the row is missing, check you kept the `e` prefix and the full zero-padded number, and run it once more. Still nothing: the id does not exist or is flagged `data-removed`. Stop, report it.
- Second cell is `✅`: already filled. Stop, report it. Exception, a refill: Website and Telefone are both `<i>indisponível</i>`. Then go on, and treat the existing cells as leads, not facts: keep a value only if a page you open confirms it.
- Otherwise the third `<td>` is the Nome. Copy it exactly. Never change it.

## 2. Research

The search tool is US-only. A bare Portuguese name returns Brazilian pages and PDFs, so:

1. Always add `Portugal` to the query. Quote the brand word: `"Psicosorrir" Portugal`.
2. The Nome is often the registry name, not the trading name. If the full Nome finds nothing, search the distinctive brand word alone (the part before " - ", or the first capitalised word) with `Portugal`, then the NIF if you have it. Add the city if the name contains one.
3. A hit counts only if it is in Portugal (`.pt`, +351, a Portuguese city). Ignore `.br` results.
4. If standard mode returns nothing useful, retry the same query in extended mode before giving up.
5. Directories (einforma, Doctoralia, Portal da Saúde Mental) usually point to the entity's own site: open that site for the values.

Prefer the entity's own website; then official directories (SNS, Carta Social, câmara municipal). Open pages to read them. Do not guess from memory.

Collect, using only what a page states:

| Cell | Value | If not found |
|---|---|---|
| Local | one name copied exactly from the Distrito's lookup file (see "Distrito and Local" below) | `<i>indisponível</i>` |
| Distrito | one name from `REPO/lookup/distritos.txt` | `<i>desconhecido</i>` |
| Morada | street address as written | `<i>indisponível</i>` |
| Áreas | space-separated slugs from the list below, no duplicates | `<i>desconhecido</i>` (alone) |
| Adicional | short free text the slugs do not cover (e.g. "Intervenção precoce") | `<i>indisponível</i>` |
| Website | starts with `http://` or `https://` | `<i>indisponível</i>` |
| E-mail | one public contact e-mail | `<i>indisponível</i>` |
| Telefone | `+351 212 345 678` style: `+`, country code, space, digits and spaces | `<i>indisponível</i>` |

### Distrito and Local

Use the Morada you collected (never the entity's name or memory), and the lists in `REPO/lookup/`:

1. Read `REPO/lookup/distritos.txt` (20 names: the 18 distritos plus Açores and Madeira). Pick the Distrito the Morada is in. Not sure, or no Morada: Distrito `null`, Local `null`.
2. Read the whole file `REPO/lookup/<Distrito>.txt` (e.g. `lookup/Setúbal.txt`) and pick the name the Morada is in. Copy it exactly as written there.
3. Local is a município (the concelho, not the town: Alverca → `Vila Franca de Xira`). In `Lisboa.txt` the Morada may be a município, or, when it is inside the city of Lisboa, a freguesia from the second list. Prefer the freguesia if the Morada or a page names it; otherwise use the município `Lisboa`.
4. No name in the file fits: Local `null`. Never write a Local that is not a line of that file; `scripts/check.py` rejects it.

Áreas slugs: `clinica neuropsicologia psicoterapia educacao organizacoes justica comunitaria desporto`. Nothing else is valid. Anything that does not fit goes in Adicional.

A row where every field is indisponível/desconhecido is valid: it means "searched, found nothing". Do not spend more than about 10 searches.

## 3. Write the JSON

Write `OUT/eID.json` with the Write tool. Plain values, no HTML, no escaping, no placeholders: the orchestrator builds the row, escapes it and fills `<i>indisponível</i>` / `<i>desconhecido</i>` for anything you leave out. Do not include the Nome.

```json
{
  "local": "Cascais",
  "distrito": "Lisboa",
  "morada": "Rua X 12, 2750-000 Cascais",
  "areas": ["clinica", "educacao"],
  "adicional": "Intervenção precoce",
  "website": "https://example.pt",
  "email": "geral@example.pt",
  "telefone": "+351 212 345 678",
  "sources": ["https://example.pt/contactos"]
}
```

- A value you did not find on a page: `null` (or leave the key out). Never guess.
- `areas`: slugs from the list above only, no duplicates; `[]` if none fit.
- `sources`: every page you took a value from, as full `http(s)` URLs; `[]` if you found nothing. They are shown on the site in a popup on the ✅ icon.
- Fields still follow the formats in the table (URL starts with `http(s)://`, phone `+351 212 345 678` style).

Do not open `index.html` in an editor; it has 6,000+ lines.

## 4. Report

Final message, one line, always with the Nome as read in step 1: `eID | NOME | ok`, or `eID | NOME | FAILED: <reason>`. If step 1 found no row, use `—` for NOME.
