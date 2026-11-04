---
name: fill-entity
description: Use when given one OPP protocol number (e.g. 0001) and asked to research that entity and fill its row in index.html.
---

# Fill one entity

Input: one protocol number. Output: one PR that changes exactly one line of `index.html`. The row format is the contract in `SPEC.md` §4 and §5; this skill is the procedure.

Below, `ID` is the number zero-padded to at least 4 digits (`1` → `0001`, `10000` stays `10000`).

## 1. Worktree and branch

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git worktree add -b feat/eID-fill ../intern-quest-eID origin/main
cd ../intern-quest-eID
```

If the branch or worktree already exists, stop and report "eID already in progress".

## 2. Read the row (the name comes from here)

```bash
grep '^<tr id="eID">' index.html
```

- No output: the id does not exist or is flagged `data-removed`. Stop, report it, delete the worktree (step 7).
- Second cell is `✅`: already filled. Stop, report it, delete the worktree.
- Otherwise the third `<td>` is the Nome. Copy it exactly. Never change it.

## 3. Research

Web search for the Nome (add the city if the name contains one). Prefer the entity's own website; then official directories (SNS, Carta Social, câmara municipal). Open pages to read them. Do not guess from memory.

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

## 4. Write the row

Escape text: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. No cell may be empty. Eleven cells, this order, status `✅`, all on one line:

```
<tr id="eID"><td>✅</td><td>ID</td><td>NOME</td><td>CIDADE</td><td>DISTRITO</td><td>MORADA</td><td>AREAS</td><td>ADICIONAL</td><td>WEBSITE</td><td>EMAIL</td><td>TELEFONE</td></tr>
```

Example:

```
<tr id="e0001"><td>✅</td><td>0001</td><td>Centro Doutor João dos Santos - Casa da Praia (IPSS)</td><td>Cascais</td><td>Lisboa</td><td>Rua X 12, 2750-000 Cascais</td><td>clinica educacao</td><td>Intervenção precoce</td><td>https://example.pt</td><td>geral@example.pt</td><td><i>indisponível</i></td></tr>
```

Put the new line in a file, then swap it in. Do not open `index.html` in an editor; it has 6,000+ lines.

```bash
cat > /tmp/eID.row <<'EOF'
<tr id="eID">...the full new line...</tr>
EOF
python3 - eID <<'EOF'
import sys, pathlib
i = sys.argv[1]; p = pathlib.Path('index.html')
new = pathlib.Path(f'/tmp/{i}.row').read_text().strip()
lines = p.read_text().split('\n')
hits = [n for n, l in enumerate(lines) if l.startswith(f'<tr id="{i}">')]
assert len(hits) == 1 and new.startswith(f'<tr id="{i}">') and '\n' not in new
lines[hits[0]] = new
p.write_text('\n'.join(lines))
EOF
```

## 5. Verify

```bash
git diff --numstat          # must print exactly: 1  1  index.html
scripts/check index.html
scripts/check --diff origin/main --branch feat/eID-fill
```

If a check fails, fix the row file and repeat step 4. Do not edit any other line or file.

## 6. Commit, push, PR

```bash
git add index.html
git commit -m "feat(data): fill eID"
git push -u origin feat/eID-fill
gh pr create --title "feat(data): fill eID" --body "Fills eID (NOME).

Sources:
- URL1
- URL2"
```

List every page you took a value from. No co-author trailers. Never use `--no-verify` or skip signing. If a hook or signing fails, stop and report the exact error. Never merge.

## 7. Clean up and report

```bash
cd "$(git rev-parse --git-common-dir)/.." && git worktree remove ../intern-quest-eID
```

Final message, one line: `eID <PR URL>`, or `eID FAILED: <reason>`.
