---
name: fill-entity
description: Use when given one OPP protocol number (e.g. 0001) and asked to research that entity and fill its row in index.html.
---

# Fill one entity

Input: one protocol number. Output: one PR that changes exactly one line of `index.html`, merged once CI passes. The row format is the contract in `SPEC.md` §4 and §5; this skill is the procedure.

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
- Second cell is `✅`: already filled. Stop, report it, delete the worktree. Exception, a refill: Website and Telefone are both `<i>indisponível</i>`. Then go on, and treat the existing cells as leads, not facts: keep a value only if a page you open confirms it.
- Otherwise the third `<td>` is the Nome. Copy it exactly. Never change it.

## 3. Research

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

## 5. Verify, commit

```bash
git diff --numstat          # must print exactly: 1  1  index.html
scripts/check.py index.html
git add index.html
git commit -m "feat(data): fill eID"
scripts/check.py --diff origin/main --branch feat/eID-fill   # reads committed changes only
```

If a check fails, fix the row file, repeat step 4, then `git commit --amend --no-edit` and re-run the checks. Do not edit any other line or file.

## 6. Push, PR

```bash
git push -u origin feat/eID-fill
gh pr create --title "feat(data): fill eID" --body "Fills eID (NOME).

Sources:
- URL1
- URL2"
```

List every page you took a value from. No co-author trailers. Never use `--no-verify` or skip signing. If a hook or signing fails, stop and report the exact error.

## 6b. Wait for CI, merge

This skill overrides the global "never merge" rule: merge only after CI succeeds with no warnings or alerts.

```bash
sleep 20   # let checks register
gh pr checks --watch --fail-fast
```

- Exit 0 (all pass): look for alerts before merging:

  ```bash
  SHA=$(git rev-parse HEAD)
  # every check must be exactly "success" (neutral, skipped, etc. count as alerts)
  gh api repos/{owner}/{repo}/commits/$SHA/check-runs --jq '.check_runs[] | select(.conclusion != "success") | .name'
  # any warning/failure annotation on any check
  for id in $(gh api repos/{owner}/{repo}/commits/$SHA/check-runs --jq '.check_runs[].id'); do
    gh api repos/{owner}/{repo}/check-runs/$id/annotations --jq '.[] | select(.annotation_level != "notice") | "\(.annotation_level): \(.message)"'
  done
  # any review or comment on the PR
  gh pr view --json comments,reviews --jq '(.comments | length) + (.reviews | length)'
  ```

  Any output from the first two, or a count above 0 from the third, is an alert: do not merge, report `FAILED: alert, not merged <PR URL>: <first alert>`. Otherwise `gh pr merge --squash` (no `--delete-branch`; the branch is checked out in the worktree). Then `git push origin --delete feat/eID-fill`.
- Non-zero exit (a check failed): do not merge. Report `FAILED: CI failed <PR URL>`.
- "no checks reported" after a second attempt 30s later: do not merge. Report `FAILED: no CI checks <PR URL>`.
- Merge refused (conflict, branch protection): do not retry or bypass. Report `FAILED: merge refused: <reason>`.

## 7. Clean up and report

```bash
cd "$(git rev-parse --git-common-dir)/.." && git worktree remove ../intern-quest-eID
```

Final message, one line, always with the Nome as read in step 2: `eID | NOME | <PR URL> merged`, or `eID | NOME | FAILED: <reason>`. If step 2 found no row, use `—` for NOME.
