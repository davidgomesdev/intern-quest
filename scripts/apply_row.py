#!/usr/bin/env python3
"""Fill one row of index.html from a research JSON. Usage: scripts/apply_row.py ID FILE.json [index.html]

JSON keys: cidade distrito morada areas(list) adicional website email telefone sources(list).
Missing/null/empty values become the <i>indisponível</i>/<i>desconhecido</i> placeholders.
Nome, Nº and the row shape come from this script and the existing row, never from the JSON.
"""
import json
import pathlib
import re
import sys

IND, DESC = '<i>indisponível</i>', '<i>desconhecido</i>'


def esc(s):
    return s.strip().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build(old, d):
    """Return the new ✅ row for the old row line and research dict d."""
    cells = re.findall(r'<td>(.*?)</td>', old)
    val = lambda k, dflt=IND: esc(str(d[k])) if d.get(k) else dflt
    areas = ' '.join(d.get('areas') or []) or DESC
    new = ['✅', cells[1], cells[2], val('cidade'), val('distrito', DESC), val('morada'),
           areas, val('adicional'), val('website'), val('email'), val('telefone')]
    rid = re.match(r'<tr id="(e\d+)"', old).group(1)
    return f'<tr id="{rid}">' + ''.join(f'<td>{c}</td>' for c in new) + '</tr>'


def main(argv):
    if len(argv) not in (3, 4):
        print(__doc__, file=sys.stderr)
        return 2
    rid, data = f'e{argv[1]}', json.loads(pathlib.Path(argv[2]).read_text(encoding='utf-8'))
    p = pathlib.Path(argv[3] if len(argv) == 4 else 'index.html')
    lines = p.read_text(encoding='utf-8').split('\n')
    hits = [n for n, l in enumerate(lines) if l.startswith(f'<tr id="{rid}">')]
    if len(hits) != 1:
        print(f'{rid}: expected exactly one row, found {len(hits)}', file=sys.stderr)
        return 1
    lines[hits[0]] = build(lines[hits[0]], data)
    p.write_text('\n'.join(lines), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
