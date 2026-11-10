#!/usr/bin/env python3
"""Embed lookup/<Distrito>.txt into index.html so the page knows which Locais belong to which Distrito.
Usage: scripts/embed_lookup.py [FILE]   (rewrites the <script id="lookup"> line; run after editing lookup/)"""
import json
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOKUP = SourceFileLoader('check', str(HERE / 'check.py')).load_module().LOOKUP
OPEN = '<script type="application/json" id="lookup">'


def line():
    data = {d: sorted(v) for d, v in sorted(LOOKUP.items())}
    return OPEN + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '</script>'


if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'index.html')
    lines = path.read_text(encoding='utf-8').split('\n')
    i = next(i for i, l in enumerate(lines) if l.startswith(OPEN))
    lines[i] = line()
    path.write_text('\n'.join(lines), encoding='utf-8')
