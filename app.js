'use strict';
document.documentElement.classList.add('js'); // CSS hides the raw rows only while this script is running
// Abre Portas: filter, sort and page the raw <tr> lines of index.html. State lives in the URL hash.
const SIZES = [10, 20, 50, 100], PP = 10; // per-page choices and the default
const AREAS = { // slug -> [emoji, label]; one place for both
  clinica: ['🩺', 'Clínica e da Saúde'], neuropsicologia: ['🧠', 'Neuropsicologia'], psicoterapia: ['💬', 'Psicoterapia'],
  educacao: ['🎓', 'Educação'], organizacoes: ['💼', 'Trabalho, Social e Organizações'], justica: ['⚖️', 'Justiça / Forense'],
  comunitaria: ['🤝', 'Comunitária / Intervenção Social'], desporto: ['🏅', 'Desporto'], desconhecido: ['❔', 'Desconhecido'],
};
const STATUS = { ver: 'Por ver', visto: 'Visto', contactar: 'Por Contactar', email: 'Contactado por e-mail',
  entrevista: 'Entrevista feita', descartado: 'Descartado' }; // first = default, never stored
const NOTE = ['email', 'entrevista'], FOLLOW_DAYS = 3, DEV_SHIFT = 5 * 864e5; // these get a follow-up reminder after 3 business days (5 calendar days always hold 3)
const LISTS = ['a', 'st']; // multi-value filters (OR): stored comma-joined in the hash
let SAVED = {}; // entity id -> { s: status, t: ms when set }; persisted in localStorage
try { SAVED = JSON.parse(localStorage.getItem('iq-status')) || {}; } catch { /* no storage: statuses last this visit only */ }
let REMIND = true; // follow-up reminders on/off, per browser
try { REMIND = localStorage.getItem('iq-remind') !== '0'; } catch { /* no storage: on */ }
// Custom lists, per browser: list name -> Map(entity id -> note). Maps, so names and ids from imports or links never touch Object.prototype.
const LIST_MAX = 40, NOTE_MAX = 500;
let LST = new Map(), SHARE = null, PICK = ''; // SHARE: a list received in a link, waiting to be saved; PICK: entity whose list menu is open
const ser = () => [...LST].map(([n, m]) => [n, [...m]]); // the storage / backup-file shape
function saveLists() { // true if the browser kept it; false when storage is full or blocked
  try { localStorage.setItem('iq-lists', JSON.stringify(ser())); return true; } catch { return false; }
}
function mergeLists(data) { // data has the ser() shape; throws if it does not
  for (const [name, items] of data) {
    const k = String(name).trim().slice(0, LIST_MAX);
    if (!k) continue;
    const m = LST.get(k) || new Map();
    LST.set(k, m);
    for (const [id, note] of items) if (/^e\d{4,}$/.test(id) && !m.get(id)) m.set(id, String(note ?? '').slice(0, NOTE_MAX));
  }
}
try { mergeLists(JSON.parse(localStorage.getItem('iq-lists') || '[]')); } catch { /* no storage or corrupt: keep what parsed */ }
function bizDays(t) { // Mon-Fri days from the day after t up to today
  let n = 0;
  const end = new Date().setHours(0, 0, 0, 0);
  for (const d = new Date(t); d.setDate(d.getDate() + 1), d.setHours(0, 0, 0, 0) <= end;) if (d.getDay() % 6) n++;
  return n;
}
const stOf = r => (Object.hasOwn(STATUS, SAVED[r.id]?.s) ? SAVED[r.id].s : 'ver');
const KEY = { // sortable column -> value; null = missing, sorts last in both directions
  estado: r => +r.ok, n: r => r.n, nome: r => r.nome, local: r => r.local, distrito: r => r.distrito,
  areas: r => (r.areas[0] && r.areas[0] !== 'desconhecido' ? AREAS[r.areas[0]][1] : null),
};
const COLL = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });
const $ = s => document.querySelector(s);
const form = $('#filters'), tbody = $('#rows');
let ROWS = [], BYID = new Map(), TOTAL = 0, S;
const LOC = {}; // distrito -> Set of locais (from lookup/, embedded in index.html): Local only lists the chosen distrito's

const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const defaults = () => ({ nome: '', c: '', d: '', a: [], st: [], l: '', estado: 'ok', vazias: false, contacto: false, ord: 'n', dir: 'asc', p: 1, pp: PP });
const FLAGS = ['vazias', 'contacto']; // on/off filters: stored as "1" in the hash, absent when off

function parse() {
  ROWS = Array.from(tbody.rows, el => {
    const c = el.cells, miss = td => !td.textContent || td.firstElementChild?.tagName === 'I';
    const val = i => (miss(c[i]) ? null : c[i].textContent);
    const areas = miss(c[6]) ? (c[6].firstElementChild ? ['desconhecido'] : []) : c[6].textContent.split(' ');
    return { el, id: el.id, n: +c[1].textContent, ok: c[0].textContent === '✅', removed: 'removed' in el.dataset,
      empty: Array.from(c).slice(3, 11).every(miss),
      nome: c[2].textContent, local: val(3), distrito: val(4), dUnk: !!c[4].firstElementChild, areas,
      kNome: norm(c[2].textContent), contacto: !!(val(8) || val(9) || val(10)), done: false,
      morada: val(5), site: val(8), email: val(9), tel: val(10) }; // raw text, kept for list exports
  });
  BYID = new Map(ROWS.map(r => [r.id, r]));
  TOTAL = ROWS.filter(r => !r.removed).length;
}

function buildOptions() {
  const distinct = k => [...new Set(ROWS.map(r => r[k]).filter(Boolean))].sort(COLL.compare);
  for (const [d, ls] of Object.entries(JSON.parse($('#lookup').textContent))) LOC[d] = new Set(ls);
  form.elements.d.options[1].before(...distinct('distrito').map(v => new Option(v)));
}

function fillLocais(d) { // Local depends on Distrito
  const c = form.elements.c;
  c.length = 1; c.disabled = !d; c.options[0].text = d ? 'Todos' : 'Escolhe o distrito';
  const n = {}; ROWS.forEach(r => { if (!r.removed && r.local) n[r.local] = (n[r.local] || 0) + 1; });
  c.append(...[...(LOC[d] || [])].sort(COLL.compare).map(v => new Option(`${v} (${n[v] || 0})`, v)));
}

function readState() {
  const q = new URLSearchParams(location.hash.slice(1)), g = k => q.get(k) || '';
  S = { ...defaults(), nome: g('nome'), c: g('c'), d: g('d'), l: LST.has(g('l')) ? g('l') : '',
    a: g('a').split(',').filter(k => Object.hasOwn(AREAS, k)), st: g('st').split(',').filter(k => Object.hasOwn(STATUS, k)), vazias: g('vazias') === '1', contacto: g('contacto') === '1',
    estado: ['todos', 'todo'].includes(g('estado')) ? g('estado') : 'ok',
    ord: Object.hasOwn(KEY, g('ord')) ? g('ord') : 'n', dir: g('dir') === 'desc' ? 'desc' : 'asc', p: parseInt(g('p'), 10) || 1,
    pp: SIZES.includes(+g('pp')) ? +g('pp') : PP };
  SHARE = parseShare(g('share'));
  if (S.c && !S.d) S.d = Object.keys(LOC).find(d => LOC[d].has(S.c)) || ''; // old links: c= alone // old links: c= alone
  toForm();
  S.c = form.elements.c.value; S.d = form.elements.d.value; // drop values that are not in the lists
}

function writeState() {
  const D = defaults(), q = new URLSearchParams();
  for (const k in D) {
    const v = LISTS.includes(k) ? S[k].join(',') : FLAGS.includes(k) ? (S[k] ? '1' : '') : S[k];
    if (v !== (LISTS.includes(k) || FLAGS.includes(k) ? '' : D[k])) q.set(k, v);
  }
  if (SHARE) q.set('share', SHARE.raw); // keep a pending shared list in the URL until it is saved or ignored
  const h = q.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', location.pathname + location.search + (h && '#' + h));
}

function toForm() {
  const f = form.elements;
  f.nome.value = S.nome; f.d.value = S.d; fillLocais(S.d); f.c.value = S.c; f.estado.value = S.estado; f.vazias.checked = S.vazias; f.contacto.checked = S.contacto;
  $('#pp').value = S.pp;
  form.querySelectorAll('[name=a],[name=st]').forEach(i => { i.checked = S[i.name].includes(i.value); });
}

function fromForm() {
  const f = form.elements;
  if (f.d.value !== S.d) fillLocais(f.d.value); // resets Local
  Object.assign(S, { nome: f.nome.value, c: f.c.value, d: f.d.value, estado: f.estado.value, vazias: f.vazias.checked, contacto: f.contacto.checked,
    a: Array.from(form.querySelectorAll('[name=a]:checked'), i => i.value),
    st: Array.from(form.querySelectorAll('[name=st]:checked'), i => i.value), p: 1 });
}

function matches(r, q) {
  return r.kNome.includes(q.nome) && (S.c ? r.local === S.c // a chosen Local wins: its row may lack a Distrito (scrape failure)
      : !S.d || (S.d === 'desconhecido' ? r.dUnk : r.distrito === S.d || !!LOC[S.d]?.has(r.local)))
    && (!S.st.length || S.st.includes(stOf(r)))
    && (!S.a.length || S.a.some(a => r.areas.includes(a)))
    && (S.l ? LST.get(S.l).has(r.id) // inside a list every member shows, filled or not
      : (S.estado === 'todos' || r.ok === (S.estado === 'ok')) && (S.vazias || !(r.ok && r.empty)))
    && !r.removed && (!S.contacto || r.contacto);
}

function sortRows(list) {
  const key = KEY[S.ord], sign = S.dir === 'desc' ? -1 : 1;
  return list.sort((x, y) => {
    const a = key(x), b = key(y);
    if (a == null || b == null) return (a == null) - (b == null);
    return sign * (typeof a === 'number' ? a - b : COLL.compare(a, b));
  });
}

function el(tag, cls, text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.textContent = text;
  return e;
}
function link(href, label, external) {
  const a = el('a'); a.href = href;
  label.replace('@', '@\n').split(/\n|(?=\.)/).forEach((part, i) => { if (i) a.append(el('wbr')); a.append(part); });
  if (external) { a.target = '_blank'; a.rel = 'noopener'; a.append(el('span', 'vh', ' (abre noutra janela)')); }
  return a;
}

function site(td) {
  try {
    const u = new URL(td.textContent);
    if (/^https?:$/.test(u.protocol)) td.replaceChildren(link(u.href, u.hostname.replace(/^www\./, ''), true));
  } catch { /* not a usable URL: leave the text as it is */ }
}

function enhance(r) {
  const c = r.el.cells, has = td => td.textContent && !td.firstElementChild;
  r.el.setAttribute('role', 'row');
  for (const td of c) td.setAttribute('role', 'cell');
  const st = el('span', r.ok ? 'st' : 'st st-todo', c[0].textContent), label = r.ok ? 'Preenchido' : 'Por preencher';
  st.setAttribute('role', 'img'); st.setAttribute('aria-label', label); st.title = label;
  const src = r.el.dataset.src;
  if (src) { // sources popup: <details> gives click/tap/keyboard for free
    st.title = 'Preenchido · ver fontes';
    const d = el('details', 'src'), sm = el('summary'), box = el('div', 'src-box');
    sm.append(st, el('span', 'vh', ' Fontes'));
    box.append(el('strong', null, 'Fontes'), ...src.split(' ').map(u => link(u, u.replace(/^https?:\/\/(www\.)?/, ''), true)));
    d.append(sm, box); c[0].replaceChildren(d);
  } else c[0].replaceChildren(st);
  if (r.local && r.distrito && !LOC[r.distrito]?.has(r.local)) { // Local belongs to another Distrito
    const home = Object.keys(LOC).filter(d => LOC[d].has(r.local));
    if (home.length) c[4].append(el('span', 'conf', `⚠ ${r.local} fica em ${home.join(' ou ')}, não em ${r.distrito}`));
  }
  if (has(c[6])) {
    const w = el('span', 'areas');
    for (const k of r.areas) {
      const icon = el('span', null, AREAS[k][0]); icon.setAttribute('aria-hidden', 'true');
      const a = el('span', 'area'); a.append(icon, AREAS[k][1]); w.append(a);
    }
    c[6].replaceChildren(w);
  }
  if (has(c[8])) site(c[8]);
  if (has(c[9])) c[9].replaceChildren(link('mailto:' + c[9].textContent, c[9].textContent));
  if (has(c[10])) { const t = c[10].textContent; c[10].replaceChildren(link('tel:' + t.replace(/ /g, ''), t.replace(/^\+351 /, ''))); }
  const td = el('td'), sel = el('select', 'pilula'); // status picker (extra column, not part of the HTML row contract)
  sel.setAttribute('aria-label', 'Estado de seguimento'); sel.dataset.id = r.id; r.sel = sel;
  for (const k in STATUS) sel.append(new Option(STATUS[k] + (NOTE.includes(k) ? ' 🔔' : ''), k));
  sel.title = '🔔 = lembrete de seguimento ao fim de 3 dias úteis';
  const rep = el('button', 'rep', '🚩'); rep.type = 'button'; rep.title = rep.ariaLabel = 'Reportar erro nesta entidade';
  const mail = 'mailto:opp-estagios@davidgomes.blog?subject=' + encodeURIComponent(`${r.el.id} – ${c[2].textContent.replace(/\s+/g, ' ').trim()}`) + '&body=' + encodeURIComponent('Descreve o erro nesta entidade:\n');
  rep.onclick = () => { location.href = mail; };
  c[1].append(' ', rep);
  td.setAttribute('role', 'cell'); td.append(sel); r.el.append(td);
  r.tl = el('span', 'lst'); c[1].append(' ', r.tl); // lists: ★ (+ ✕ inside a list) right after the 🚩, same flat style. Filled by listCell()
  r.tn = el('td'); r.tn.setAttribute('role', 'cell'); r.el.append(r.tn); // the note, inside a list
  r.done = true;
}

function render(slice) {
  slice.forEach(r => {
    r.done || enhance(r);
    r.el.dataset.st = r.sel.dataset.st = r.sel.value = stOf(r); // colours the card and the pill
    listCell(r);
  });
  tbody.replaceChildren(...slice.map(r => r.el));
  tbody.classList.add('ready');
}

function renderCount(list, last) {
  const total = S.l ? LST.get(S.l).size : TOTAL, filled = list.filter(r => r.ok).length;
  $('#count').replaceChildren(el('strong', '', list.length), ` de ${total} entidades, ${filled} com dados`);
  document.querySelectorAll('.pager').forEach(p => {
    p.querySelector('span').textContent = `Página ${S.p} de ${last}`;
    p.querySelector('[data-p=prev]').disabled = S.p <= 1;
    p.querySelector('[data-p=next]').disabled = S.p >= last;
  });
  const active = (S.nome ? 1 : 0) + (S.c || S.d ? 1 : 0) + S.a.length + S.st.length + (S.estado !== 'ok') + S.vazias + S.contacto;
  $('#ativos').textContent = active ? `(${active} ${active > 1 ? 'ativos' : 'ativo'})` : '';
  const bare = !!S.l && !LST.get(S.l).size; // a list with nothing in it gets its own message
  $('#vazio').hidden = list.length > 0 || bare;
  $('#lista-vazia').hidden = !bare;
  $('.tabela').hidden = list.length === 0;
  document.querySelectorAll('th[data-k]').forEach(th => {
    if (th.dataset.k === S.ord) th.setAttribute('aria-sort', S.dir === 'desc' ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
  });
}

function followUp() { // banner: note statuses set 5+ days ago
  const due = REMIND ? ROWS.filter(r => NOTE.includes(stOf(r)) && bizDays(SAVED[r.id].t) >= FOLLOW_DAYS) : [];
  const box = $('#followup');
  box.hidden = !due.length;
  if (!due.length) return;
  const ul = el('ul');
  for (const r of due) {
    const days = bizDays(SAVED[r.id].t), li = el('li');
    li.dataset.st = stOf(r);
    li.append(link(`#nome=${encodeURIComponent(r.nome)}&estado=todos&vazias=1`, `${r.n} ${r.nome}`), el('span', '', ` · ${STATUS[stOf(r)]}, há ${days} dias úteis`));
    ul.append(li);
  }
  box.replaceChildren(el('strong', '', `🔔 ${due.length} ${due.length > 1 ? 'entidades precisam' : 'entidade precisa'} de seguimento`), ul);
}

function stCounts() { // chips show how many entities sit in each status
  const n = {};
  for (const r of ROWS) if (!r.removed) n[stOf(r)] = (n[stOf(r)] || 0) + 1;
  form.querySelectorAll('[name=st]').forEach(i => {
    const s = i.nextElementSibling;
    s.dataset.base ??= s.textContent;
    s.textContent = `${s.dataset.base.replace(' 🔔', '')} (${n[i.value] || 0})${s.dataset.base.includes('🔔') ? ' 🔔' : ''}`;
  });
}

function update() {
  followUp();
  stCounts();
  shareBanner();
  renderTabs();
  const q = { nome: norm(S.nome) };
  const list = sortRows(ROWS.filter(r => matches(r, q)));
  const last = Math.max(1, Math.ceil(list.length / S.pp));
  S.p = Math.min(Math.max(S.p, 1), last);
  render(list.slice((S.p - 1) * S.pp, S.p * S.pp));
  renderCount(list, last);
  writeState();
}

form.addEventListener('input', () => { fromForm(); update(); });
$('#pp').addEventListener('change', e => { S.pp = +e.target.value; S.p = 1; update(); });
form.addEventListener('submit', e => e.preventDefault());
form.addEventListener('reset', e => { e.preventDefault(); S = { ...defaults(), l: S.l }; toForm(); update(); }); // clearing filters keeps the open list
$('#remind').checked = REMIND;
$('#remind').addEventListener('change', e => {
  REMIND = e.target.checked;
  try { localStorage.setItem('iq-remind', REMIND ? '1' : '0'); } catch { /* ignore */ }
  update();
});
tbody.addEventListener('change', e => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.value === 'ver') delete SAVED[id]; else SAVED[id] = { s: e.target.value, t: Date.now() };
  try { localStorage.setItem('iq-status', JSON.stringify(SAVED)); } catch { /* storage full or blocked */ }
  update();
});
tbody.addEventListener('click', e => { // opening a website, e-mail or phone marks a "Por ver" entity as Visto
  const a = e.target.closest('td a'), id = a?.closest('tr')?.querySelector('select')?.dataset.id;
  if (!id || ![8, 9, 10].includes(a.closest('td').cellIndex) || SAVED[id]) return;
  SAVED[id] = { s: 'visto', t: Date.now() };
  try { localStorage.setItem('iq-status', JSON.stringify(SAVED)); } catch { /* storage full or blocked */ }
  update();
});
function saveAll() { try { localStorage.setItem('iq-status', JSON.stringify(SAVED)); } catch { /* storage full or blocked */ } }
function mergeSaved(data) { // import: keep the most recent change per entity; returns how many were taken
  let n = 0;
  for (const [id, v] of Object.entries(data || {})) {
    if (Object.hasOwn(STATUS, v?.s) && Number.isFinite(v.t) && !(SAVED[id]?.t >= v.t)) { SAVED[id] = { s: v.s, t: v.t }; n++; }
  }
  saveAll();
  return n;
}
const shared = new URLSearchParams(location.hash.slice(1)).get('prog'); // link from another device: #prog=<json>
if (shared) {
  try { mergeSaved(JSON.parse(shared)); } catch { /* bad link: ignore */ }
  history.replaceState(null, '', location.pathname + location.search);
}
$('#exp').onclick = () => {
  const a = el('a'); a.download = 'abre-portas-progresso.json';
  a.href = URL.createObjectURL(new Blob([JSON.stringify(SAVED)], { type: 'application/json' }));
  a.click(); URL.revokeObjectURL(a.href);
};
$('#imp').onchange = async e => {
  try { alert(`${mergeSaved(JSON.parse(await e.target.files[0].text()))} estados importados.`); } catch { alert('Ficheiro inválido.'); }
  e.target.value = ''; update();
};
$('#lnk').onclick = async () => {
  const url = location.origin + location.pathname + '#prog=' + encodeURIComponent(JSON.stringify(SAVED));
  try { await navigator.clipboard.writeText(url); alert('Link copiado.'); } catch { prompt('Copia o link:', url); }
};
if (new URLSearchParams(location.search).has('dev')) { // open index.html?dev to test the follow-up banner
  $('#dev').hidden = false;
  $('#dev button').onclick = () => {
    for (const k in SAVED) SAVED[k].t -= DEV_SHIFT;
    try { localStorage.setItem('iq-status', JSON.stringify(SAVED)); } catch { /* ignore */ }
    update();
  };
}
// ---------- Custom lists ----------
const inLists = r => [...LST].filter(([, m]) => m.has(r.id)).map(([n]) => n);
const members = () => [...LST.get(S.l).keys()].map(id => BYID.get(id)).filter(r => r && !r.removed).sort((a, b) => a.n - b.n);
const emails = () => [...new Set(members().map(r => r.email).filter(Boolean))];
const slug = () => norm(S.l).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lista';

function addList(name) { // creates the list if new; returns its trimmed name, '' if there is none
  const k = (name || '').trim().slice(0, LIST_MAX);
  if (k && !LST.has(k)) { LST.set(k, new Map()); saveLists(); }
  return k;
}

function parseShare(raw) { // "Name:0001,0002" -> { name, ids, raw }, keeping only entities that exist here
  const i = raw.lastIndexOf(':'), name = raw.slice(0, i).trim().slice(0, LIST_MAX);
  const ids = [...new Set(raw.slice(i + 1).split(',').map(x => 'e' + x).filter(id => /^e\d{4,}$/.test(id) && BYID.has(id)))];
  return i > 0 && name && ids.length ? { name, ids, raw } : null;
}

function shareBanner() {
  const b = $('#partilha');
  b.hidden = !SHARE;
  if (!SHARE) return;
  const btn = (act, text) => { const x = el('button', '', text); x.type = 'button'; x.dataset.act = act; return x; };
  b.replaceChildren(el('strong', '', `📥 Lista partilhada «${SHARE.name}»`), el('span', '', ` · ${SHARE.ids.length} entidades `), btn('shsave', 'Guardar'), btn('shskip', 'Ignorar'));
}

function renderTabs() {
  const tab = (label, l, n) => {
    const b = el('button', 'tab', label);
    b.type = 'button'; b.dataset.act = 'tab'; b.dataset.l = l; b.setAttribute('aria-pressed', l === S.l);
    if (n != null) b.append(el('span', 'n', n));
    return b;
  };
  const add = el('button', 'tab nova', '+ Nova lista');
  add.type = 'button'; add.dataset.act = 'new';
  $('#listas').replaceChildren(tab('Todas', ''), ...[...LST].map(([n, m]) => tab(n, n, m.size)), add);
  $('#listas').hidden = $('#backup').hidden = false;
  $('#lista-acoes').hidden = !S.l;
  if (S.l) {
    const eb = $('[data-act=emails]'), n = emails().length;
    eb.textContent = `Copiar e-mails (${n})`; eb.disabled = !n;
  }
}

function listCell(r) { // ★ opens the list menu under it; inside a list the row also gets ✕ (remove) and a note
  const mine = inLists(r), btn = (cls, text, act, label) => {
    const b = el('button', cls, text);
    b.type = 'button'; b.dataset.act = act; b.dataset.r = r.id; b.title = label; b.setAttribute('aria-label', label);
    return b;
  };
  const star = btn('lst-btn' + (mine.length ? ' on' : ''), mine.length ? '★' : '☆', 'pick',
    mine.length ? `Listas de ${r.nome}: ${mine.join(', ')}` : `Juntar ${r.nome} a uma lista`);
  star.setAttribute('aria-expanded', r.id === PICK);
  r.tl.replaceChildren(star);
  if (S.l) r.tl.append(btn('lst-rm', '✕', 'rm', `Tirar ${r.nome} da lista ${S.l}`));
  if (r.id === PICK) r.tl.append(listMenu(r));
  r.tn.replaceChildren();
  for (const n of S.l ? [S.l] : mine) { // inside a list: that list's note; in Todas: one labelled note per list the entity is in
    const w = el('div', 'nota-w'), note = el('textarea', 'nota'), ind = el('span', 'guardado'); // multi-line; ind says whether the last edit was stored
    note.rows = 2; note.maxLength = NOTE_MAX; note.placeholder = 'Nota…'; note.value = LST.get(n).get(r.id) ?? '';
    note.dataset.r = r.id; note.dataset.l = n; note.setAttribute('aria-label', `Nota sobre ${r.nome} na lista ${n}`);
    ind.hidden = true; ind.setAttribute('role', 'status');
    w.append(note, ind);
    if (!S.l) r.tn.append(el('div', 'nota-l', n));
    r.tn.append(w);
  }
}

const dropOk = (n, id) => !LST.get(n).get(id) || confirm(`Tirar esta entidade de «${n}» apaga a nota que escreveste lá. Continuar?`); // never lose a note silently

function listMenu(r) { // the small list under ★: one checkbox per list, plus a field to create one
  const menu = el('div', 'lst-menu'), nova = el('div', 'nova'), inp = el('input'), add = el('button', '', 'Criar');
  menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', `Listas de ${r.nome}`);
  if (!LST.size) menu.append(el('p', '', 'Ainda não tens listas.'));
  for (const [n, m] of LST) {
    const lab = el('label', 'toggle'), cb = el('input');
    cb.type = 'checkbox'; cb.checked = m.has(r.id); cb.dataset.n = n;
    lab.append(cb, el('span', '', n));
    menu.append(lab);
  }
  inp.type = 'text'; inp.maxLength = LIST_MAX; inp.placeholder = 'Nova lista…'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'Nome da nova lista');
  add.type = 'button'; add.dataset.act = 'padd';
  nova.append(inp, add);
  menu.append(nova);
  return menu;
}

function copy(btn, text) {
  const label = btn.textContent;
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => {
    btn.textContent = 'Copiado ✓';
    setTimeout(() => { btn.textContent = label; }, 1500);
  }, () => prompt('Copia daqui:', text)); // no clipboard access (insecure page, denied): show the text instead
}

function download(name, text, type) {
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
}

const ACT = { // every [data-act] button
  tab: b => { S.l = b.dataset.l; S.p = 1; update(); },
  new: () => { const k = addList(prompt('Nome da nova lista')); if (k) { S.l = k; S.p = 1; update(); } },
  pick: b => { PICK = PICK === b.dataset.r ? '' : b.dataset.r; update(); $('.lst-menu input')?.focus(); }, // second click on the same ★ closes it
  padd: b => { // create a list from the menu and put the entity in it
    const k = addList(b.closest('.lst-menu').querySelector('input[type=text]').value);
    if (!k) return;
    if (!LST.get(k).has(PICK)) LST.get(k).set(PICK, '');
    saveLists(); update(); $('.lst-menu input[type=text]').focus();
  },
  rm: b => { if (dropOk(S.l, b.dataset.r)) { LST.get(S.l).delete(b.dataset.r); saveLists(); update(); } },
  emails: b => copy(b, emails().join('; ')),
  link: b => copy(b, location.href.replace(/#.*/, '') + '#' + new URLSearchParams({ share: S.l + ':' + members().map(r => r.id.slice(1)) }).toString().replace(/%2C/g, ',')),
  csv: () => {
    // ponytail: ';' separator because pt-PT Excel expects it (Sheets detects either)
    const cell = v => { v = String(v ?? ''); return '"' + (/^[=+\-@\t\r]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"'; }; // a leading = + - @ gets a ' so spreadsheets do not run it as a formula
    const rows = members().map(r => [r.n, r.nome, r.local, r.distrito, r.morada, r.email, r.tel?.replace(/^\+351 /, ''), r.site, STATUS[stOf(r)], LST.get(S.l).get(r.id)]);
    download(slug() + '.csv', '\ufeff' + [['Nº', 'Nome', 'Local', 'Distrito', 'Morada', 'E-mail', 'Telefone', 'Website', 'Seguimento', 'Nota'], ...rows]
      .map(x => x.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  },
  del: () => {
    if (!confirm(`Apagar a lista «${S.l}»? As entidades não são apagadas.`)) return;
    LST.delete(S.l); S.l = ''; saveLists(); update();
  },
  shsave: () => { // a shared list joins the list of the same name, or becomes a new one
    const m = LST.get(SHARE.name) || new Map();
    for (const id of SHARE.ids) if (!m.has(id)) m.set(id, '');
    LST.set(SHARE.name, m); S.l = SHARE.name; S.p = 1; SHARE = null; saveLists(); update();
  },
  shskip: () => { SHARE = null; update(); },
  exp: () => download('abre-portas-listas.json', JSON.stringify(ser()), 'application/json'),
  imp: () => $('#imp-f').click(),
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (PICK && !e.target.closest('.lst-menu, [data-act=pick]')) { PICK = ''; update(); } // click anywhere else closes the list menu
  if (b) ACT[b.dataset.act](b);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !PICK) return;
  const r = BYID.get(PICK);
  PICK = ''; update(); r.tl.querySelector('.lst-btn')?.focus(); // update() rebuilt the ★: give focus back to it
});
tbody.addEventListener('change', e => { // checkbox in the list menu
  const m = LST.get(e.target.dataset.n);
  if (!m) return;
  if (e.target.checked) m.set(PICK, m.get(PICK) ?? '');
  else if (dropOk(e.target.dataset.n, PICK)) m.delete(PICK);
  else { e.target.checked = true; return; } // kept: they chose not to lose the note
  saveLists(); update();
  [...document.querySelectorAll('.lst-menu input[type=checkbox]')].find(c => c.dataset.n === e.target.dataset.n)?.focus(); // keep keyboard focus on the same checkbox
});
tbody.addEventListener('keydown', e => { // Enter in the new-list field
  if (e.key === 'Enter' && e.target.matches('.lst-menu input[type=text]')) { e.preventDefault(); ACT.padd(e.target); }
});
tbody.addEventListener('input', e => { // note inside a list: saved as you type. ✓ = stored (fades), ⚠ = the browser refused (stays)
  if (!e.target.classList.contains('nota')) return;
  LST.get(e.target.dataset.l).set(e.target.dataset.r, e.target.value.slice(0, NOTE_MAX));
  const ok = saveLists(), ind = e.target.nextElementSibling;
  ind.hidden = false; ind.classList.toggle('bad', !ok);
  ind.replaceChildren(ok ? '✓' : '⚠', el('span', 'vh', ok ? ' Guardado' : ' Não guardado: o navegador bloqueou o armazenamento'));
  ind.title = ok ? 'Guardado' : 'Não guardado: o navegador bloqueou o armazenamento';
  clearTimeout(ind.t);
  if (ok) ind.t = setTimeout(() => { ind.hidden = true; }, 1500);
});
$('#imp-f').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { mergeLists(JSON.parse(await f.text())); saveLists(); update(); alert('Listas importadas.'); }
  catch { alert('Ficheiro inválido. Usa um ficheiro exportado daqui.'); }
});

$('thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (!th) return;
  S.dir = S.ord === th.dataset.k && S.dir === 'asc' ? 'desc' : 'asc';
  S.ord = th.dataset.k; S.p = 1; update();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  S.p += b.dataset.p === 'next' ? 1 : -1; update();
  $('#count').scrollIntoView();
});
window.addEventListener('hashchange', () => { readState(); update(); });

try {
  parse();
  buildOptions();
  if (matchMedia('(max-width: 719px)').matches) $('#painel').open = false;
  readState();
  update();
} catch (e) {
  document.documentElement.classList.remove('js'); // show the plain table rather than a blank page
  throw e;
}
document.addEventListener('click', e => document.querySelectorAll('details.src[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
