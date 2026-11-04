# Intern Quest: visual design (revision 3)

Mockup: `docs/mockup/index.html` + `app.css` (copy `app.css` as is). Rows are raw SPEC §5 lines; the inline script's `enhance()` builds the exact DOM `app.js` must produce. The rest of the script only toggles visual state. Screenshots in `shots/`: `1280-light.png`, `1280-dark.png`, `390-light.png`, and `390-dark-vazio.png` (empty result).

History. Revision 1 (cobalt datasheet) was too heavy. Revision 2 switched to orange but was still a formal 11-column grid. Revision 3, this one, follows the request for a less formal look: entity cards, a friendly voice, and emojis on áreas.

**Direction.** A friendly finder, not a spreadsheet. Each entity is a white card on a soft grey page, with the name first, then where it is, what it does and how to reach it. Orange is a warm accent: a ✦ beside the rounded title, pale-orange áreas and checked pills, orange-ink links, and a thin orange rule on the notes. Shapes are rounded (14px cards, pill chips). The copy speaks to the reader with "tu" ("Encontra…", "confirma sempre…").

**Still a real table.** The `<table>`/`<th scope=col>`/`<td>` markup stays (SPEC §6.1/§6.6), with all 11 columns present in every card. CSS sets `display:block/grid`, so explicit ARIA roles keep the semantics: `role=table/rowgroup/row/columnheader` in the shell, and `role=row/cell` added by `enhance()`. `thead` becomes a sticky bar of sort pills ("Ordenar por: Estado · Nº · Nome …"). It serves every width, so the mobile `#ord` select is gone.

## Tokens (`:root`; dark values under `@media (prefers-color-scheme: dark)`; `color-scheme: light dark`)

| token | light | dark | use |
|---|---|---|---|
| `--bg` | `#f6f6f7` | `#161618` | page, sort bar, ⬜ cards (transparent) |
| `--card` | `#ffffff` | `#212124` | ✅ cards, filter panel, fields, pills |
| `--soft` | `#fff4ea` | `#2e2219` | disclaimer, checked pills, active sort, button hover |
| `--fg` | `#26221f` | `#ecebe8` | text |
| `--muted` | `#65605a` | `#a8a39d` | indisponível, morada, Nº, secondary text |
| `--line` | `#e6e2de` | `#34322f` | card borders (decorative) |
| `--edge` | `#8e8780` | `#7a746e` | field, pill, button borders |
| `--accent` | `#a94700` | `#ffa95e` | links, focus ring, active pill border |
| `--rule` | `#f08a24` | `#e07a1f` | ✦, Adicional rule, card hover border (decorative only) |
| `--chip` / `--chip-fg` | `#fff0e1` / `#7a3300` | `#3a2818` / `#ffd0a3` | área pills; `--chip-fg` is also the checked-pill text |
| `--warn` / `--warn-bg` | `#a3261b` / `#fdeeec` | `#ff9a8f` / `#3b1c19` | "saiu da lista da OPP" |

**Measured contrast** (WCAG 2.x, computed by script; L / D):
- fg on bg / card / soft: 14.61 / 15.78 / 14.56 (L); 15.16 / 13.47 / 12.96 (D)
- muted on bg / card: 5.76 / 6.22 (L); 7.22 / 6.42 (D)
- accent on bg / card / soft: 5.42 / 5.85 / 5.40 (L); 9.54 / 8.48 / 8.16 (D)
- chip-fg on chip / soft: 8.17 / 8.42 (L); 9.89 / 10.89 (D)
- warn on warn-bg: 6.53 (L); 7.52 (D)
- edge on card / bg (non-text, needs ≥3): 3.54 / 3.28 (L); 3.48 / 3.92 (D)
- rule on card: 2.51 (L), 5.33 (D); line on card: 1.29 / 1.26. Both are decorative only and never the sole cue.

All text passes AA. In light mode, links and muted text are AA but not AAA (5.4–6.2:1).

## Type and spacing

- Title: `ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui` at 700, 34px (28px on mobile). The result count number uses the same font at 20px. Everything else uses the `system-ui` stack.
- Scale (px): 12 badge · 13 labels, Nº, sort pills, área pills · 13.5 morada, contacts · 14 cards, chips, buttons · 15 body, inputs · 16 mobile inputs · 17 sub and entity name (600) · 20 count · 34 title.
- Radii: 14 cards/panel/disclaimer · 10 fields · 999 pills/buttons. Spacing: 4/8/12/16/24/32. Page `max-width: 1120px`, 16px gutters, 10px between cards.

## Components

- **Header**: h1 + `✦` (`aria-hidden`), a 17px sub-line, and `p.aviso[role=note]` "💡 Antes de contactar: …" on `--soft` with the OPP link. The footer gives the source and update date.
- **Filters**: `<details id="painel" open>` holds a white card with `form#filters[role=search]`.
  - Row 1: a wide "Nome da entidade" search (with placeholder), "Cidade" (text with datalist), "Só esta cidade" (select), "Distrito" (select).
  - Áreas: `label.toggle > input[type=checkbox][name=a] + span > span[aria-hidden]emoji + text`.
  - Then Estado "Todas / ✅ Com dados / ⬜ Ainda sem dados", the "Mostrar as que saíram da lista da OPP" checkbox and "Limpar filtros".
  - Checked pills use the `--soft` fill, `--accent` border, weight 600 and a trailing ✓. JS closes the panel below 720px.
- **Área emojis** (decorative, `aria-hidden`; the label carries the meaning): 🩺 Clínica e da Saúde · 🧠 Neuropsicologia · 💬 Psicoterapia · 🎓 Educação · 💼 Trabalho, Social e Organizações · ⚖️ Justiça / Forense · 🤝 Comunitária / Intervenção Social · 🏅 Desporto · ❔ Desconhecido. Keep this map in one place in `app.js`, next to the labels.
- **Card grid (≥720px)**: `grid-template-columns: 2.25rem auto 1fr minmax(13rem,17rem)`.
  - Row 1: status, Nome (17px/600), "Nº 0003" at the right.
  - Row 2: 📍 **Cidade**, Distrito (or ", distrito *desconhecido*"); Website in the right column.
  - Row 3: Morada (muted); E-mail on the right.
  - Row 4: área pills; Telefone on the right.
  - Row 5: Adicional, with a 2px `--rule` left bar.
  - Contacts are prefixed 🌐 ✉️ 📞 via `content: "🌐" / ""` (empty alt text, so screen readers skip the icon). Missing values show as `<i>indisponível</i>`, labelled where the position alone is unclear ("Morada:", "Áreas:", "Adicional:").
- **⬜ cards**: transparent with a dashed border. They show only the status, name, Nº and "Ainda sem morada nem contactos." (CSS `::after`, decorative).
- **Removed**: muted name plus the pill `<span class="removida">saiu da lista da OPP</span>`.
- **Mobile (<720px)**: the same card as a single flex-wrap column. Order: status and Nº, name, place, morada, áreas, adicional, then one contact per line (each a tap target of at least 24px). The sort bar scrolls horizontally.
- **Cell DOM from `enhance()`**:
  - Status: `span.st[role=img][aria-label=Preenchido|Por preencher][title]`, plus `.st-todo` for ⬜.
  - Áreas: `span.areas > span.area > (span[aria-hidden] emoji, label)`.
  - Website: `a[target=_blank][rel=noopener]` showing the hostname without `www.`, followed by `span.vh` "(abre noutra janela)".
  - E-mail: `mailto:`. Telefone: `tel:` with spaces stripped; the label drops `+351 `.
  - Website and e-mail labels get `<wbr>` after `@` and before each `.`.
  - Use DOM APIs only.

## States

- Hover: a card gets a `--rule` border; pills and buttons get an `--accent` border and `--soft` fill. Links thicken their underline.
- Focus-visible: 2px `--accent` outline with a 2px offset, drawn on the pill span for chips.
- Active sort: the pill is filled `--soft`, weight 600, with ↑/↓; `aria-sort` is set on that `th` only.
- Disabled pager: `--muted` text and a dashed border.
- Empty result (`#vazio`, preview at `index.html#vazio`): a dashed card with 🔍, "Nenhuma entidade com estes filtros. Experimenta tirar uma área ou procurar pelo distrito em vez da cidade." and "Limpar filtros". The count reads "0 de 6345 entidades"; pagers and list are `hidden`.
- Noscript: `html:not(.js)` hides the panel, bar, pagers and sort bar; `<noscript>` says Ctrl+F works. Cards still render via CSS, with raw slugs and plain-text URLs.
- Print: no panel or sort bar; cards avoid page breaks.

## Deviations from DESIGN.md §4

1. **Cards on every width**, not an 11-column grid. Desktop and mobile share one layout (the user asked for less formal and less datasheet-like). The sort bar of pills replaces clickable column headers and the mobile `#ord` select.
2. **ARIA table roles** are added, because CSS `display` changes on tables drop their semantics in Safari.
3. **Palette**: neutral grey + white cards + orange (user request), replacing cream + teal. Removed rows use red.
4. **Type**: rounded system title, 17px names, 14px card text (draft: one 600-weight sans, 14px table).
5. **Áreas**: emoji + label pills (user request) on cards and filters. Desconhecido uses ❔ and a dashed border in the filter, and stays a plain italic `<i>` in cards.
6. **Copy is informal pt-PT ("tu")**, with friendlier labels: "Com dados / Ainda sem dados", "Só esta cidade", "saiu da lista da OPP", and a count reading "802 com dados".
7. **Added**: page max-width 1120px, a sticky sort bar, a bottom pager, the ⬜ hint line, the empty state, `<wbr>` in links, and labels on missing values.
8. **Removed**: zebra rows, sticky column header, column widths, and the separate mobile sort select.

## Decisions for you (max 3)

1. **Page size.** Cards are about 3× taller than table rows, so 100 cards per page is a long scroll. Recommend **50 per page** (SPEC §6.4 says 100 [CALL]).
2. **Sort pills.** SPEC §6.1 makes every column sortable, but sorting by Morada, Adicional, Website or E-mail is rarely useful. Recommend showing **Nº, Nome, Cidade, Distrito, Estado** only; the other `th` would stay in the markup with no button. This needs a SPEC change, otherwise keep all 11.
3. **Voice.** Informal "tu" (as built) or neutral/impersonal ("Encontre…", "Confirme…"). Recommend **"tu"**: the readers are recent graduates and it matches the friendlier look.
