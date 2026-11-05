---
name: fill-entity
description: Use when given one OPP protocol number (e.g. 0001) and an output directory, to research that entity and write its new row there. Research only: no git, no gh.
---

# Research one entity

Input: a protocol number, the repo path, and an output directory `OUT`. Output: two files in `OUT`. You never run git or `gh`, never edit `index.html`, never write files anywhere else. The orchestrator (`fill-batch`) validates the row, commits it and opens the PR. The row format is the contract in `SPEC.md` §4 and §5; this skill is the procedure.

Below, `ID` is the number zero-padded to at least 4 digits (`1` → `0001`, `10000` stays `10000`).

## 1. Read the row (the name comes from here)

Read-only, from the repo path you were given:

```bash
grep '^<tr id="eID">' REPO/index.html
```

- No output: the id does not exist or is flagged `data-removed`. Stop, report it.
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
| Cidade | one concelho | `<i>indisponível</i>` |
| Distrito | only if the page states it; never infer it from the city | `<i>desconhecido</i>` |
| Morada | street address as written | `<i>indisponível</i>` |
| Áreas | space-separated slugs from the list below, no duplicates | `<i>desconhecido</i>` (alone) |
| Adicional | short free text the slugs do not cover (e.g. "Intervenção precoce") | `<i>indisponível</i>` |
| Website | starts with `http://` or `https://` | `<i>indisponível</i>` |
| E-mail | one public contact e-mail | `<i>indisponível</i>` |
| Telefone | `+351 212 345 678` style: `+`, country code, space, digits and spaces | `<i>indisponível</i>` |

Áreas slugs: `clinica neuropsicologia psicoterapia educacao organizacoes justica comunitaria desporto`. Nothing else is valid. Anything that does not fit goes in Adicional.

A row where every field is indisponível/desconhecido is valid: it means "searched, found nothing". Do not spend more than about 10 searches.

## 3. Write the two files

Escape text: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. No cell may be empty. Eleven cells, this order, status `✅`, all on one line:

```
<tr id="eID"><td>✅</td><td>ID</td><td>NOME</td><td>CIDADE</td><td>DISTRITO</td><td>MORADA</td><td>AREAS</td><td>ADICIONAL</td><td>WEBSITE</td><td>EMAIL</td><td>TELEFONE</td></tr>
```

Example:

```
<tr id="e0001"><td>✅</td><td>0001</td><td>Centro Doutor João dos Santos - Casa da Praia (IPSS)</td><td>Cascais</td><td>Lisboa</td><td>Rua X 12, 2750-000 Cascais</td><td>clinica educacao</td><td>Intervenção precoce</td><td>https://example.pt</td><td>geral@example.pt</td><td><i>indisponível</i></td></tr>
```

Write exactly these two files, one line in the first:

- `OUT/eID.row`: the full new `<tr ...>...</tr>` line.
- `OUT/eID.sources`: every page you took a value from, one URL per line (empty file if you found nothing).

Use the Write tool or a `cat > file <<'EOF'` heredoc. Do not open `index.html` in an editor; it has 6,000+ lines.

## 4. Report

Final message, one line, always with the Nome as read in step 1: `eID | NOME | ok`, or `eID | NOME | FAILED: <reason>`. If step 1 found no row, use `—` for NOME.
