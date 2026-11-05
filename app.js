'use strict';
document.documentElement.classList.add('js'); // CSS hides the raw rows only while this script is running
// Intern Quest: filter, sort and page the raw <tr> lines of index.html. State lives in the URL hash.
const PAGE = 50;
const AREAS = { // slug -> [emoji, label]; one place for both
  clinica: ['🩺', 'Clínica e da Saúde'], neuropsicologia: ['🧠', 'Neuropsicologia'], psicoterapia: ['💬', 'Psicoterapia'],
  educacao: ['🎓', 'Educação'], organizacoes: ['💼', 'Trabalho, Social e Organizações'], justica: ['⚖️', 'Justiça / Forense'],
  comunitaria: ['🤝', 'Comunitária / Intervenção Social'], desporto: ['🏅', 'Desporto'], desconhecido: ['❔', 'Desconhecido'],
};
const KEY = { // sortable column -> value; null = missing, sorts last in both directions
  estado: r => +r.ok, n: r => r.n, nome: r => r.nome, local: r => r.local, distrito: r => r.distrito,
  areas: r => (r.areas[0] && r.areas[0] !== 'desconhecido' ? AREAS[r.areas[0]][1] : null),
};
const COLL = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });
const $ = s => document.querySelector(s);
const form = $('#filters'), tbody = $('#rows');
let ROWS = [], TOTAL = 0, S;

const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const defaults = () => ({ nome: '', c: '', d: '', a: [], estado: 'ok', vazias: false, contacto: false, ord: 'n', dir: 'asc', p: 1 });
const FLAGS = ['vazias', 'contacto']; // on/off filters: stored as "1" in the hash, absent when off

function parse() {
  ROWS = Array.from(tbody.rows, el => {
    const c = el.cells, miss = td => !td.textContent || td.firstElementChild?.tagName === 'I';
    const val = i => (miss(c[i]) ? null : c[i].textContent);
    const areas = miss(c[6]) ? (c[6].firstElementChild ? ['desconhecido'] : []) : c[6].textContent.split(' ');
    return { el, n: +c[1].textContent, ok: c[0].textContent === '✅', removed: 'removed' in el.dataset,
      empty: Array.from(c).slice(3, 11).every(miss),
      nome: c[2].textContent, local: val(3), distrito: val(4), dUnk: !!c[4].firstElementChild, areas,
      kNome: norm(c[2].textContent), contacto: !!(val(8) || val(9)), done: false };
  });
  TOTAL = ROWS.filter(r => !r.removed).length;
}

function buildOptions() {
  const distinct = k => [...new Set(ROWS.map(r => r[k]).filter(Boolean))].sort(COLL.compare);
  form.elements.c.append(...distinct('local').map(v => new Option(v)));
  form.elements.d.options[1].before(...distinct('distrito').map(v => new Option(v)));
}

function readState() {
  const q = new URLSearchParams(location.hash.slice(1)), g = k => q.get(k) || '';
  S = { ...defaults(), nome: g('nome'), c: g('c'), d: g('d'),
    a: g('a').split(',').filter(k => Object.hasOwn(AREAS, k)), vazias: g('vazias') === '1', contacto: g('contacto') === '1',
    estado: ['todos', 'todo'].includes(g('estado')) ? g('estado') : 'ok',
    ord: Object.hasOwn(KEY, g('ord')) ? g('ord') : 'n', dir: g('dir') === 'desc' ? 'desc' : 'asc', p: parseInt(g('p'), 10) || 1 };
  toForm();
  S.c = form.elements.c.value; S.d = form.elements.d.value; // drop values that are not in the lists
}

function writeState() {
  const D = defaults(), q = new URLSearchParams();
  for (const k in D) {
    const v = k === 'a' ? S.a.join(',') : FLAGS.includes(k) ? (S[k] ? '1' : '') : S[k];
    if (v !== (k === 'a' || FLAGS.includes(k) ? '' : D[k])) q.set(k, v);
  }
  const h = q.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', location.pathname + location.search + (h && '#' + h));
}

function toForm() {
  const f = form.elements;
  f.nome.value = S.nome; f.c.value = S.c; f.d.value = S.d; f.estado.value = S.estado; f.vazias.checked = S.vazias; f.contacto.checked = S.contacto;
  form.querySelectorAll('[name=a]').forEach(i => { i.checked = S.a.includes(i.value); });
}

function fromForm() {
  const f = form.elements;
  Object.assign(S, { nome: f.nome.value, c: f.c.value, d: f.d.value, estado: f.estado.value, vazias: f.vazias.checked, contacto: f.contacto.checked,
    a: Array.from(form.querySelectorAll('[name=a]:checked'), i => i.value), p: 1 });
}

function matches(r, q) {
  return r.kNome.includes(q.nome) && (!S.c || r.local === S.c)
    && (!S.d || (S.d === 'desconhecido' ? r.dUnk : r.distrito === S.d))
    && (!S.a.length || S.a.some(a => r.areas.includes(a)))
    && (S.estado === 'todos' || r.ok === (S.estado === 'ok'))
    && !r.removed && (S.vazias || !(r.ok && r.empty)) && (!S.contacto || r.contacto);
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
  r.done = true;
}

function render(slice) {
  slice.forEach(r => r.done || enhance(r));
  tbody.replaceChildren(...slice.map(r => r.el));
  tbody.classList.add('ready');
}

function renderCount(list, last) {
  const total = TOTAL, filled = list.filter(r => r.ok).length;
  $('#count').replaceChildren(el('strong', '', list.length), ` de ${total} entidades, ${filled} com dados`);
  document.querySelectorAll('.pager').forEach(p => {
    p.querySelector('span').textContent = `Página ${S.p} de ${last}`;
    p.querySelector('[data-p=prev]').disabled = S.p <= 1;
    p.querySelector('[data-p=next]').disabled = S.p >= last;
  });
  const active = [S.nome, S.c, S.d].filter(Boolean).length + S.a.length + (S.estado !== 'ok') + S.vazias + S.contacto;
  $('#ativos').textContent = active ? `(${active} ${active > 1 ? 'ativos' : 'ativo'})` : '';
  $('#vazio').hidden = list.length > 0;
  $('.tabela').hidden = list.length === 0;
  document.querySelectorAll('th[data-k]').forEach(th => {
    if (th.dataset.k === S.ord) th.setAttribute('aria-sort', S.dir === 'desc' ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
  });
}

function update() {
  const q = { nome: norm(S.nome) };
  const list = sortRows(ROWS.filter(r => matches(r, q)));
  const last = Math.max(1, Math.ceil(list.length / PAGE));
  S.p = Math.min(Math.max(S.p, 1), last);
  render(list.slice((S.p - 1) * PAGE, S.p * PAGE));
  renderCount(list, last);
  writeState();
}

form.addEventListener('input', () => { fromForm(); update(); });
form.addEventListener('submit', e => e.preventDefault());
form.addEventListener('reset', e => { e.preventDefault(); S = defaults(); toForm(); update(); });
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
