#!/usr/bin/env python3
"""Fill one row of index.html from a research JSON. Usage: scripts/apply_row.py ID FILE.json [index.html]

JSON keys: locations(list of {local distrito morada telefone email main}) telefones(list) emails(list)
areas(list) adicional website sources(list) cleared(list of field names) private.
Old flat keys local distrito morada telefone email still work: one location plus one phone / e-mail.
Missing/null/empty values become the <i>indisponível</i>/<i>desconhecido</i> placeholders.
Locations are deduped, the first `main` kept, sorted main first then by Distrito rank; data-loc is
written only when the row has several locations, phones or e-mails.
When the old row is 🔄, a field the JSON leaves empty keeps the old value unless named in `cleared`
(areas adicional website locations telefones emails); sources add to the old data-src.
Key `private: true` writes a 🔒 row instead: all placeholders, no data-src, other keys ignored.
Nome, Nº and the row shape come from this script and the existing row, never from the JSON.
"""
import html
import json
import pathlib
import re
import sys
from importlib.machinery import SourceFileLoader

HERE = pathlib.Path(__file__).resolve().parent
check = SourceFileLoader('check', str(HERE / 'check.py')).load_module()
IND, DESC = check.IND, check.DESC
LOC_ORDER = ['local', 'distrito', 'morada', 'telefone', 'email', 'main']


def esc(s):
    return check._esc(s)


def _loc(raw):
    """A cleaned location (trimmed strings, known keys, canonical order), or {} if it has no field."""
    loc = {}
    for k in LOC_ORDER:
        v = raw.get(k)
        if k == 'main':
            if v:
                loc[k] = True
        elif v and str(v).strip():
            loc[k] = str(v).strip()
    return loc if set(loc) - {'main'} else {}


def _strs(values):
    return list(dict.fromkeys(str(v).strip() for v in values if v and str(v).strip()))


def _old_state(old, cells):
    """The old row's (locations, phones, e-mails): from data-loc, else from its visible cells."""
    m = check.LOC_ATTR.search(old[:old.index('>')])
    if m:
        data = json.loads(html.unescape(m.group(1)))
        on = lambda k: [x[k] for x in data['l'] if k in x]
        return data['l'], _strs(on('telefone') + data['t']), _strs(on('email') + data['e'])
    cell = lambda i: None if cells[i] in (IND, DESC) else html.unescape(cells[i])
    loc = _loc({'local': cell(3), 'distrito': cell(4), 'morada': cell(5)})
    return ([loc] if loc else []), _strs([cell(10)]), _strs([cell(9)])


def build(old, d):
    """Return the new ✅ (or 🔒 if d["private"]) row for the old row line and research dict d."""
    cells = re.findall(r'<td>(.*?)</td>', old)
    rid = re.match(r'<tr id="(e\d+)"', old).group(1)
    head = old[:old.index('>')]
    flag = ' data-removed="1"' if ' data-removed="1"' in head else ''
    if d.get('private'):
        new = ['🔒', cells[1], cells[2], IND, DESC, IND, DESC, IND, IND, IND, IND]
        return f'<tr id="{rid}"{flag}>' + ''.join(f'<td>{c}</td>' for c in new) + '</tr>'
    refill = cells[0] == '🔄'
    cleared = set(d.get('cleared') or [])
    keep = lambda field: refill and field not in cleared

    raw = d.get('locations')
    if raw is None:
        raw = [{k: d.get(k) for k in ('local', 'distrito', 'morada')}]
    locs = []
    for x in raw:
        x = _loc(x)
        twin = [y for y in locs if {k: v for k, v in y.items() if k != 'main'} == {k: v for k, v in x.items() if k != 'main'}]
        if twin:
            twin[0].update({k: v for k, v in x.items() if k == 'main'})
        elif x:
            locs.append(x)
    phones = _strs((d.get('telefones') or []) + [d.get('telefone')])
    emails = _strs((d.get('emails') or []) + [d.get('email')])
    if refill:
        old_l, old_t, old_e = _old_state(old, cells)
        if not locs and keep('locations'):
            locs = old_l
        if not phones and keep('telefones'):
            phones = old_t
        if not emails and keep('emails'):
            emails = old_e
    seen_main = False
    for x in locs:
        if x.get('main'):
            if seen_main:
                x.pop('main')
            seen_main = True
    locs = [x for _, x in sorted(enumerate(locs), key=lambda t: check.loc_key(*t))]
    on_locs = lambda k: {x[k] for x in locs if k in x}
    data = {'l': locs, 't': [t for t in phones if t not in on_locs('telefone')],
            'e': [e for e in emails if e not in on_locs('email')]}
    local, dist, morada, email, tel = check.visible({**data, 'l': locs or [{}]})

    def field(key, new, dflt):
        if new:
            return new
        return cells[{'areas': 6, 'adicional': 7, 'website': 8}[key]] if keep(key) else dflt
    areas = field('areas', ' '.join(d.get('areas') or []), DESC)
    adicional = field('adicional', esc(str(d['adicional'])) if d.get('adicional') else '', IND)
    website = field('website', esc(str(d['website'])) if d.get('website') else '', IND)

    urls = list(d.get('sources') or [])
    if refill:
        m = check.SRC.search(head)
        urls = (html.unescape(m.group(1)).split() if m else []) + urls
    urls = [u for u in dict.fromkeys(urls) if re.fullmatch(r'https?://[^\s<>"\\]+', u)]
    attrs = flag
    if urls:  # ponytail: no sources, no attribute
        attrs += f' data-src="{esc(" ".join(urls))}"'
    if locs and check.needs_loc(data):
        attrs += ' data-loc="' + html.escape(json.dumps(data, ensure_ascii=False, separators=(',', ':'))) + '"'
    new = ['✅', cells[1], cells[2], local, dist, morada, areas, adicional, website, email, tel]
    return f'<tr id="{rid}"{attrs}>' + ''.join(f'<td>{c}</td>' for c in new) + '</tr>'


def main(argv):
    if len(argv) not in (3, 4):
        print(__doc__, file=sys.stderr)
        return 2
    rid, data = f'e{argv[1]}', json.loads(pathlib.Path(argv[2]).read_text(encoding='utf-8'))
    p = pathlib.Path(argv[3] if len(argv) == 4 else 'index.html')
    lines = p.read_text(encoding='utf-8').split('\n')
    hits = [n for n, l in enumerate(lines) if re.match(rf'<tr id="{rid}"[ >]', l)]
    if len(hits) != 1:
        print(f'{rid}: expected exactly one row, found {len(hits)}', file=sys.stderr)
        return 1
    lines[hits[0]] = build(lines[hits[0]], data)
    p.write_text('\n'.join(lines), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
