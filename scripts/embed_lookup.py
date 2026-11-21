#!/usr/bin/env python3
"""Embed lookup/<Distrito>.txt and lookup/prefixos.txt into index.html so the page knows which Locais belong to
which Distrito (keys in rank order) and which Distritos a phone prefix covers.
Usage: scripts/embed_lookup.py [FILE]   (rewrites the <script id="lookup"> and id="prefixos" lines; run after editing lookup/)"""
import json
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

HERE = Path(__file__).resolve().parent
check = SourceFileLoader('check', str(HERE / 'check.py')).load_module()
OPEN = '<script type="application/json" id="lookup">'
PREFIX_OPEN = '<script type="application/json" id="prefixos">'


def _script(open_tag, data):
    return open_tag + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '</script>'


def line():
    return _script(OPEN, {d: sorted(check.LOOKUP[d]) for d in check.DISTRITOS})


def prefix_line():
    return _script(PREFIX_OPEN, check.PREFIXOS)


if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'index.html')
    lines = path.read_text(encoding='utf-8').split('\n')
    i = next(i for i, l in enumerate(lines) if l.startswith(OPEN))
    lines[i] = line()
    if lines[i + 1].startswith(PREFIX_OPEN):
        lines[i + 1] = prefix_line()
    else:
        lines.insert(i + 1, prefix_line())
    path.write_text('\n'.join(lines), encoding='utf-8')
