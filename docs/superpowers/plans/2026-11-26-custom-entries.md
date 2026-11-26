# Custom Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors add, edit, delete and track their own entities, stored only in their browser (issue #575).

**Architecture:** Each entry in `localStorage` becomes a `<tr>` with the same 11 cells as an OPP row, read by the same per-row parser, so filters, sorting, cards, status, lists and CSV are reused. The export file carries the entries; links never do.

**Tech Stack:** Vanilla JS, native `<dialog>`, headless-Chrome scenarios in `scripts/test.py`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-custom-entries-design.md`

## Global Constraints

- Storage key `iq-custom`: array of `{id, criado, editado, nome, local, distrito, morada, areas, adicional, website, email, telefone}`. `areas` is an array of slugs; the other text fields are strings, `''` when missing; `criado` / `editado` are ms timestamps.
- `id` matches `^c\d{5}$`; next = highest in use + 1.
- Only `nome` is required (trimmed, not blank).
- UI copy is pt-PT: `+ Adicionar entidade`, `✏️ Minha`, `Adicionadas por mim`. Hash param: `minhas=1`.
- Export file: `{listas, estados, proprias}`. Files without `proprias`, and bare arrays, still import.
- User text reaches the DOM only through DOM APIs / `textContent`.
- No change to entity rows in `index.html`, to other Python scripts or to the skills.
- Check after every task: `REQUIRE_CHROME=1 scripts/test.py` ends with `ok   test_page`; `scripts/check.py index.html` passes.
- Commits: conventional, no co-author trailers, no hook or signing bypass.

## Review Focus

1. Corrupt `iq-custom`: the page works, and the next save does not destroy the unreadable data (copied to `iq-custom-bad`). Task 1.
2. Two tabs open: saving in one keeps entries added in the other (re-read storage before every write). Task 2.
3. Importing the same file twice creates no duplicates. Task 3.
4. A name or field containing HTML, or a `javascript:` website, stays inert. Task 1.
5. Deleting the last entry while on "Adicionadas por mim" returns to "Todas". Task 2.

## Files

- `app.js`: all behaviour (follow the single-file pattern).
- `app.css`: badge and dialog.
- `index.html`: `<dialog id="propria">` in the page shell only.
- `scripts/test.py`: new scenarios and a `_part_own` function added to `PAGE_PARTS`.
- `SPEC.md`: new section 6.8.

In `scripts/test.py`, seed entries through the existing `seed` argument and report them back: add `out.own = localStorage.getItem('iq-custom'); out.bad = localStorage.getItem('iq-custom-bad');` to `LISTS_JS` next to `out.stored`.

```python
def own(i, nome, criado, **over):
    return {"id": i, "criado": criado, "editado": criado, "nome": nome, "local": "", "distrito": "", "morada": "",
            "areas": [], "adicional": "", "website": "", "email": "", "telefone": "", **over}

def own_seed(*entries, lists=LISTS_SEED):  # closes the iq-lists setItem and opens one for iq-custom
    return f"{lists}); localStorage.setItem('iq-custom', {json.dumps(json.dumps(list(entries)))}"
```

---

### Task 1: Stored entries show up as rows

**Files:** Modify `app.js` (`parse`, `buildOptions`, `matches`, `KEY`, `enhance`, `renderTabs`, `renderCount`, state functions, `mergeLists`, CSV), `app.css`, `scripts/test.py`.

**Interfaces (produces):**
- `OWN_ID = /^c\d{5}$/`; the id test in `mergeLists`, `mergeBackup` and `parseShare` becomes "`e\d{4,}` or `c\d{5}`".
- `cleanEntry(x) -> entry | null`: null if `x` is not an object, `id` fails `OWN_ID` or the trimmed `nome` is blank. Caps: `nome`, `morada`, `website`, `email` 200; `adicional` 500; `telefone` 40. `distrito` must be a lookup key, else `''`; `local` must be in that Distrito's list, else `''`. `areas` keeps known slugs except `desconhecido`, unique. `website` gets `https://` when it has no scheme and is kept only if `new URL` gives http(s). `email` is kept only if it matches `^[^\s@]+@[^\s@]+$`. Non-finite `criado` / `editado` become `0`.
- `loadOwn() -> entry[]`: reads `iq-custom` through `cleanEntry`. If the value is not a JSON array, or any item is rejected, first copies the raw string to `iq-custom-bad`.
- `ownRow(entry) -> HTMLTableRowElement`: id = entry id; cells `✏️`, id, nome, local, distrito, morada, areas (space-joined), adicional, website, email, telefone. A missing value is `<i>indisponível</i>`, except distrito and areas, which are `<i>desconhecido</i>` (built with `ph()`).
- `parseRow(el) -> Row`: the current `parse()` map callback, extracted. Adds `own`; own rows have `ok: true` and `n = Number(id.slice(1)) - 100000` (sorts first, in creation order).
- `parse()` appends `loadOwn().map(ownRow)` rows to the parsed list, so `BYID` and `TOTAL` include them. `cleanEntry` needs the lookup, so fill `LOC` before `parse()` runs.
- `distOptions()`: rebuilds the Distrito options from `ROWS` (keeps "Todos" and "Desconhecido", and the current value).
- State: `S.minhas` (boolean, default `false`; the existing boolean branch of `writeState` writes `minhas=1`).

**Behaviour:**
- `matches`: `S.minhas` keeps only own rows. Own rows skip the Estado and "Excluir sem informação" conditions. The "ainda por preencher" count ignores own rows.
- `enhance`: label of the status icon is `Adicionada por mim`; add `<span class="minha">✏️ Minha</span>` to the name cell. The 🚩 button is not added to own rows. `r.nome` and the report subject keep reading the plain name.
- `renderTabs`: when any own row exists, a tab `Adicionadas por mim` with a count follows `Todas`. It sets `S.minhas = true, S.l = ''`; `Todas` and list tabs set `minhas = false`, and `Todas` is not pressed while `minhas` is on. `readState` forces `minhas` off when there are no own rows. "Limpar filtros" keeps `minhas`, as it keeps the open list.
- CSV: the Nº column is `r.id` for own rows.

- [ ] **Step 1: Write the failing tests.** Scenarios seeded with `own("c00001", "Zeta Minha", 1)` and `own("c00002", "<img src=x onerror=alert(1)>", 2, website="javascript:alert(1)", distrito="Porto", local="Amarante")`:

```python
# ownview, hash "": default filters (Com dados + excluir) still show a name-only entry, first by Nº
assert _ids(dom)[:2] == ["c00001", "c00002"] and _count(dom).startswith("62 de 122")
assert "Adicionadas por mim2" in out["tabs"] and out["badge"] == 2 and out["reps"] == 0   # reps: .rep buttons in the two own rows
assert out["imgs"] == 0 and out["links"] == 0 and "alert" not in out                      # <img> and a[href^=javascript] in #rows
assert _pending(dom).group(1) == "60"
# owntab, hash "minhas=1&estado=todo"
assert _ids(dom) == ["c00001", "c00002"] and out["hash"] == "#minhas=1&estado=todo"
# ownfilter, hash "d=Porto&c=Amarante&nome=img"
assert _ids(dom) == ["c00002"]
# ownbad, seed sets iq-custom to '{bad': the page works and the raw value is preserved
assert out["bad"] == "{bad" and _count(dom).startswith("60 de 120")
```

- [ ] **Step 2:** Run `REQUIRE_CHROME=1 scripts/test.py`. Expected: `FAIL _part_own`.
- [ ] **Step 3:** Implement the interfaces and behaviour above.
- [ ] **Step 4:** Run the checks in Global Constraints. Expected: pass.
- [ ] **Step 5:** `git commit -m "feat(ui): show locally stored custom entries (#575)"`

### Task 2: Add, edit, delete

**Files:** Modify `index.html` (shell), `app.js`, `app.css`, `scripts/test.py`.

**Interfaces:**
- Consumes: `cleanEntry`, `loadOwn`, `ownRow`, `parseRow`, `distOptions`.
- `writeOwn(change: (entries) => entries) -> boolean`: `loadOwn()`, apply `change`, `setItem`; false when the browser refuses. Re-reading first keeps another tab's entries.
- `reloadOwn()`: replaces the own rows in `ROWS` / `BYID` / `TOTAL` from storage, then `distOptions()` and `fillLocais(S.d)`.
- `ACT.add`, `ACT.edit`, `ACT.delown`, `ACT.cancel`.

**Behaviour:**
- `+ Adicionar entidade` is a button in `#listas` (`data-act=add`, after `+ Nova lista`).
- `<dialog id="propria" aria-labelledby="propria-t">` holds a form with fields named like the entry keys: `nome` (`required`), Distrito select, Local select (disabled until a Distrito is chosen; its options come from `LOC`), `morada`, Áreas checkboxes (every slug except `desconhecido`, generated from `AREAS`), `adicional` textarea, `website` (`type=text inputmode=url`, so `exemplo.pt` is accepted), `email` (`type=email`), `telefone` (`type=tel`), `maxlength` per the caps, an error line with `role=alert`, and `Guardar` / `Cancelar`.
- Submit: a blank trimmed name, or a website that `cleanEntry` would drop, shows an error and stays open. New entry: id = highest in `loadOwn()` + 1, `criado = editado = Date.now()`. Edit: keeps `id` and `criado`, updates `editado`. When `writeOwn` returns false: error `Não guardado: o navegador bloqueou o armazenamento.`, dialog stays open.
- After saving a new entry: `reloadOwn()`, `update()`.
- Own rows get `✏️` (edit, `title="Editar"`) and `🗑` (`title="Apagar"`) buttons where 🚩 sits, styled like `.rep`.
- Delete: always `confirm("Apagar «<nome>»? O estado e as notas desta entidade também são apagados.")`; then remove the entry, `SAVED[id]`, and the id from every list; save all three. If no own rows remain, `S.minhas = false`.

- [ ] **Step 1: Write the failing tests** (scenario bodies drive the dialog through its form fields and `requestSubmit()`):

```python
# ownadd, no seed: submit blank name "  " -> stays open; then name "Nova", website "exemplo.pt", Distrito Porto
assert out["open0"] is True and out["open1"] is False
e, = json.loads(out["own"])
assert (e["id"], e["nome"], e["website"], e["distrito"]) == ("c00001", "Nova", "https://exemplo.pt", "Porto")
assert _ids(dom)[0] == "c00001"
# owntabs, seed c00001; the body writes c00002 straight into localStorage (the "other tab"), then adds "Terceira"
assert [x["id"] for x in json.loads(out["own"])] == ["c00001", "c00002", "c00003"]
# ownedit, seed c00001 with a list note and a status: rename it
assert (e["id"], e["criado"], e["nome"]) == ("c00001", 1, "Renomeada") and e["editado"] > 1
# owndel, hash "minhas=1", only entry, in list Favoritas with a note and a status; confirm returns true
assert json.loads(out["own"]) == [] and "c00001" not in out["stored"] + out["status"] and out["hash"] == ""
# ownfull, setItem throws for iq-custom
assert out["open"] is True and out["error"].startswith("Não guardado")
```

- [ ] **Step 2:** Run the tests. Expected: `FAIL _part_own`.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the checks. Expected: pass.
- [ ] **Step 5:** `git commit -m "feat(ui): add, edit and delete custom entries (#575)"`

### Task 3: Export, import, links, spec

**Files:** Modify `app.js` (`backup`, `mergeBackup`, `parseShare`, `ACT.link`, `ACT.lnk`, `renderTabs`), `SPEC.md`, `scripts/test.py`.

**Interfaces:**
- `backup()` -> `{listas, estados, proprias}` with `proprias = loadOwn()`.
- `linkBackup()` -> `{listas, estados}` with every `c` id removed from lists and statuses.
- `stripOwn(d)` -> the same shape as `d` (object or bare array) without `c` ids and without `proprias`; applied to `#copia=` payloads. `parseShare` accepts only `e` ids (its current regex stays).
- `mergeOwn(incoming) -> Map<fileId, finalId | null>`: for each item passing `cleanEntry`: a stored entry with the same `criado` is the same entry (replace its fields if the incoming `editado` is greater; keep the stored id); otherwise add it, with the next free id if its own is taken. Rejected items map to nothing. Writes through `writeOwn`.
- `mergeBackup(d)`: runs `mergeOwn(d.proprias || [])` first, then rewrites every `c` id in the file's lists and statuses through the map, dropping `c` ids with no mapping (so a file cannot attach notes to an unrelated local entry), then merges as today. The file-import handler then calls `reloadOwn()` before `update()`. If `writeOwn` fails, import throws before merging lists.

**Behaviour:**
- `ACT.link`: members without own rows. If some were left out, `alert("As entidades que adicionaste não vão no link.")` after copying; if nothing is left, only `alert("Esta lista só tem entidades que adicionaste, que não vão no link.")`.
- `ACT.lnk`: uses `linkBackup()`; when own entries exist, `alert("As entidades que adicionaste (e as suas notas e estados) não vão no link. Usa \"Exportar cópia\".")` after copying.
- `SPEC.md` 6.8 "Custom entries": a short version of spec section 4; update the backup shape in 6.7.

- [ ] **Step 1: Write the failing tests.** Update the existing `backup` assertion to expect `"proprias": []`. New:

```python
# ownimport: local c00001 "Local" (criado 1). The file has c00001 "Outra" (criado 2), in list Importada with note "x",
# status email/9; it is imported twice (reset out.alert between).
assert [(x["id"], x["nome"]) for x in json.loads(out["own"])] == [("c00001", "Local"), ("c00002", "Outra")]
assert ["Importada", [["c00002", "x"]]] in stored(out) and json.loads(out["status"]) == {"c00002": {"s": "email", "t": 9}}
# ownnewer: same criado, file's editado newer and id c00007 -> one entry, id c00001, new name, file note on c00001
# ownorphan: file list names c00001 but has no proprias -> local c00001 gets no note
# ownlink: Favoritas also holds c00001: neither link contains "c00001", both alert; a list with only c00001 copies nothing
# ownlinked: hash copia={listas:[["R",[["c00001","n"],["e0001",""]]]], estados:{c00001:...}, proprias:[...]}
assert stored(out)[-1] == ["R", [["e0001", ""]]] and json.loads(out["own"]) == [<only the seeded entry>]
```

- [ ] **Step 2:** Run the tests. Expected: `FAIL _part_own`.
- [ ] **Step 3:** Implement, including `SPEC.md`.
- [ ] **Step 4:** Run the checks. Expected: pass. Then open `index.html` in a browser at desktop and phone width and look at the badge, the dialog and an own card.
- [ ] **Step 5:** `git commit -m "feat(ui): export and import custom entries (#575)"`, then push and update PR #822's body.
