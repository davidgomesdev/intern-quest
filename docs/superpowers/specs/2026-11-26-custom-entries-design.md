# Custom entries (local-only): design

Date: 2026-11-26. Issue: #575. Size: small change. Status: awaiting approval. Items marked **[CALL]** were not discussed; please check them.

## 1. Intent

OPP lists only the entities that have a protocol with it. A visitor also applies to places outside that list and wants to keep track of those applications on the same page.

## 2. Goals, non-goals, anti-goals

- Goal: add, edit and delete your own entities, and track them like OPP ones (follow-up status, reminders, lists, notes, list CSV and e-mail export).
- Non-goals: sharing custom entries, publishing them, matching them against OPP entities added later, more than one location per entry.
- Anti-goal: losing or silently overwriting an entry, a note or a status.

## 3. Approaches

1. **Each entry becomes a table row identical to an OPP one** (picked). `parse()` reads it like any other, so search, filters, sorting, cards, status, lists and CSV are reused.
2. Separate display code for custom entries. Duplicates cards, filtering and sorting.
3. Store row HTML in the browser. A change to the row format would break saved entries, and imported HTML is a security risk.

## 4. Design

### Data
- `localStorage` key `iq-custom`: array of `{id, criado, editado, nome, local, distrito, morada, areas, adicional, website, email, telefone}`.
- `id` is `c` plus 5 digits (`c00001`), next = highest ever given out + 1 (kept in `iq-custom-last`), so a deleted id is never reused. Changed after the branch review: with reuse, a second open tab could delete or overwrite the wrong entry. Lists, notes and statuses accept both `e…` and `c…` ids.
- `nome` is required (trimmed, not blank); everything else is optional. **[CALL]** Distrito and Local are dropdowns from the lookup lists, so filters match them; Áreas are checkboxes; the rest is free text with length caps. Website must be http(s) (`https://` is added when there is no scheme); e-mail uses the browser's e-mail validation.
- Rows are built with DOM APIs and `textContent`, never from HTML strings.

### Page
- A "+ Adicionar entidade" button by the tabs opens a native `<dialog>` form. The same form edits an entry.
- Entries are mixed into "Todas" and carry a "✏️ Minha" badge. An "Adicionadas por mim (N)" tab shows only them. **[CALL]** The tab appears once there is at least one entry; its hash param is `minhas=1`, so it cannot clash with a list name.
- Edit and delete buttons replace 🚩. Delete always asks for confirmation, then removes the entry, its status, its list memberships and its notes.
- The Estado filter and "Excluir sem informação" never hide a custom entry, and custom entries do not count in "ainda por preencher". All other filters apply. **[CALL]** "Com dados" counts and the total include them.
- **[CALL]** Sorting by Nº ascending puts them first, in creation order. Other sorts treat them like any entry.
- **[CALL]** If the browser refuses to save (storage blocked or full), the form stays open and says so.

### Export, import, links
- The export file becomes `{listas, estados, proprias}`. Files without `proprias`, and the old bare-array files, still import.
- Share links leave out custom ids. Copying the link of a list that has some says they were left out; a list with only custom entries gives no link.
- "Copiar link para outro dispositivo" leaves out custom entries and their notes and statuses, and says so when there are any.
- Opening a link (`#share=`, `#copia=`) ignores any `c…` ids and `proprias` in it. **[CALL]** Two browsers number independently, so a `c` id from a link could point at the wrong entry.
- **[CALL]** Id clashes on file import: two devices can each create their own `c00001`. `criado` (ms timestamp) tells entries apart:
  - same `criado` as an existing entry: same entry, whatever its id; the newer `editado` wins;
  - otherwise a new entry; if its id is taken, it gets the next free one.
  - In both cases the file's list memberships, notes and statuses follow the entry to its final id. Existing lists merge as they do today.
- **[CALL]** Importing a file older than a deletion brings the entry back, as it does for list memberships today.
- Imported entries are validated like form input; blank names and malformed ids are dropped.

## 5. Files and checks

- `app.js`, `app.css`, the page shell of `index.html` (button and dialog; no entity row changes), `SPEC.md` 6.7.
- No change to the Python scripts or the skills.
- Check: `scripts/test.py` and `scripts/check.py` still pass. In a browser: add, edit, delete, filter, add to a list, export, then import into a profile that already has its own `c00001`.

## 6. Left to the builder

Markup, styling, wording of messages, function layout.
