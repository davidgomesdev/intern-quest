#!/usr/bin/env python3
"""Validate index.html rows. Usage: scripts/check.py FILE"""
import re
import subprocess
import sys
from urllib.parse import urlsplit

ESC = r'(?:[^<>&\n]|&(?:amp|lt|gt|quot|#39);)'
IND = '<i>indisponível</i>'
DESC = '<i>desconhecido</i>'
SLUGS = {'clinica', 'neuropsicologia', 'psicoterapia', 'educacao',
         'organizacoes', 'justica', 'comunitaria', 'desporto'}
ROW = re.compile(r'^<tr id="e(\d{4,})"((?: data-removed="1"| data-src="[^"<>]*")*)>((?:<td>(?:' + ESC
                 + r'|<i>(?:indisponível|desconhecido)</i>)*</td>){11})</tr>$')
CELLS = re.compile(r'<td>(.*?)</td>')
TEXT = re.compile(ESC + '+')
URL = re.compile(r'https?://[^\s<>\\]+')
EMAIL = re.compile(r'[^\s@<>&]+@[^\s@<>&.]+(?:\.[^\s@<>&.]+)+')
PHONE = re.compile(r'\+\d{1,3}(?: ?\d)+')
NAMES = ['Status', 'Nº', 'Nome', 'Cidade', 'Distrito', 'Morada', 'Áreas',
         'Adicional', 'Website', 'E-mail', 'Telefone']


def _url_ok(v):
    """A URL the browser can open: a host and a valid port."""
    if not URL.fullmatch(v):
        return False
    try:
        u = urlsplit(v)
        u.port
    except ValueError:
        return False
    return bool(u.hostname)


def _filled_ok(i, v):
    """Is v a valid cell value for column index i on a FILLED row?"""
    if i == 2:
        return bool(TEXT.fullmatch(v))
    if i in (3, 5, 7):
        return v == IND or bool(TEXT.fullmatch(v))
    if i == 4:
        return v == DESC or bool(TEXT.fullmatch(v))
    if i == 6:
        if v == DESC:
            return True
        s = v.split(' ')
        return all(x in SLUGS for x in s) and len(set(s)) == len(s)
    if i == 8:
        return v == IND or _url_ok(v)
    return v == IND or bool({9: EMAIL, 10: PHONE}[i].fullmatch(v))


def check_row(line):
    m = ROW.match(line)
    if not m:
        return ['line does not match row shape (id, optional data-removed/data-src, 11 cells)']
    rid, cells = m.group(1), CELLS.findall(m.group(3))
    src = SRC.search(m.group(2))
    if src and not (src.group(1) and all(map(_url_ok, src.group(1).split(' ')))):
        return ['data-src: must be space-separated http(s) URLs']
    if len(cells) != 11:
        return [f'expected 11 cells, got {len(cells)}']
    errs = []
    status = cells[0]
    if status not in ('⬜', '✅'):
        return [f'Status: unknown value {status!r}']
    if src and status == '⬜':
        errs.append('data-src: not allowed on a ⬜ row')
    if cells[1] != rid:
        errs.append(f'Nº: {cells[1]!r} does not match id {rid}')
    if not TEXT.fullmatch(cells[2]):
        errs.append('Nome: must be non-empty plain/escaped text')
    for i in range(3, 11):
        v = cells[i]
        if status == '⬜':
            if v != '':
                errs.append(f'{NAMES[i]}: must be empty on a ⬜ row')
        elif not _filled_ok(i, v):
            errs.append(f'{NAMES[i]}: invalid value {v!r} on a ✅ row')
    return errs


def check_file(path):
    errs, last = [], -1
    with open(path, encoding='utf-8') as f:
        for n, line in enumerate(f, 1):
            line = line.rstrip('\n')
            if not line.lstrip().startswith('<tr'):
                continue
            errs += [f'line {n}: {e}' for e in check_row(line)]
            m = re.search(r'<tr id="e(\d+)"', line)
            if m:
                rid = int(m.group(1))
                if rid <= last:
                    errs.append(f'line {n}: id e{m.group(1)} not strictly ascending')
                last = rid
    return errs


ROWID = re.compile(r'^<tr id="e(\d+)"')
FLAG = ' data-removed="1"'
SRC = re.compile(r' data-src="([^"<>]*)"')


def _bare(l):
    return SRC.sub('', l.replace(FLAG, ''))


def _rid(line):
    return ROWID.match(line).group(1)


def check_diff(diff_text, changed_files, branch):
    """Validate the --unified=0 diff of index.html (entity or sync mode)."""
    rm, add, other, started = [], [], [], False
    for l in diff_text.splitlines():
        if l.startswith('@@'):
            started = True
        elif started and l[:1] in '+-' and l[1:]:
            body = l[1:]
            if body.startswith('<tr'):
                (rm if l[0] == '-' else add).append(body)
            else:
                other.append(l)
    if not rm and not add:
        return []
    errs = []
    for l in rm + add:
        if not ROWID.match(l):
            errs.append(f'row without a valid id: {l[:60]}')
    if errs:
        return errs
    pairs = list(zip(rm, add))
    fills = (len(rm) == len(add) and len({_rid(l) for l in rm}) == len(rm)
             and all(_rid(a) == _rid(b) and _bare(a) != _bare(b)
                     for a, b in pairs))
    if fills:
        errs += [f'non-row line of index.html changed: {l[:60]}' for l in other]
        errs += [f'file changed besides index.html: {f}' for f in changed_files
                 if f != 'index.html']
        for a, b in pairs:
            errs += _entity(a, b, branch if len(pairs) == 1 else None)
        return errs
    return errs + _sync(rm, add)


def _entity(old, new, branch):
    rid = _rid(new)
    errs = [f'e{rid}: {e}' for e in check_row(new)]
    m = ROW.match(old)
    n = ROW.match(new)
    if not (m and n):
        return errs or [f'e{rid}: old row is malformed']
    oc, nc = CELLS.findall(m.group(3)), CELLS.findall(n.group(3))
    if nc[0] != '✅':
        errs.append(f'e{rid}: new row must be ✅')
    if oc[2] != nc[2]:
        errs.append(f'e{rid}: Nome changed')
    if (FLAG in m.group(2)) != (FLAG in n.group(2)):
        errs.append(f'e{rid}: data-removed changed')
    b = re.search(r'e(\d{4,})', branch or '')
    if b and b.group(1) != rid:
        errs.append(f'branch names e{b.group(1)} but the row is e{rid}')
    return errs


def _sync(rm, add):
    errs = []
    old = {_rid(l): l for l in rm}
    new = {_rid(l): l for l in add}
    for rid, l in new.items():
        if rid in old:
            if _bare(l) != _bare(old[rid]) or l == old[rid]:
                errs.append(f'e{rid}: existing row changed beyond data-removed')
        else:
            if not l.startswith(f'<tr id="e{rid}"><td>⬜</td>'):
                errs.append(f'e{rid}: new row must be ⬜ without data-removed')
            errs += [f'e{rid}: {e}' for e in check_row(l)]
    for rid in old:
        if rid not in new:
            errs.append(f'e{rid}: row removed from index.html')
    if len(old) != len(rm) or len(new) != len(add):
        errs.append('duplicate row ids in diff')
    return errs


def _git(*args):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr.strip() or 'git failed')
    return r.stdout


def main_diff(argv):
    a = argv[2:]
    branch = None
    if '--branch' in a:
        i = a.index('--branch')
        branch = a[i + 1] if i + 1 < len(a) else None
        del a[i:i + 2]
    if len(a) != 1 or branch is None and '--branch' in argv:
        print('usage: scripts/check.py --diff BASE_REF [--branch NAME]', file=sys.stderr)
        return 2
    rng = a[0] + '...HEAD'
    text = _git('diff', '--unified=0', rng, '--', 'index.html')
    files = _git('diff', '--name-only', rng).split('\n')
    errs = check_diff(text, [f for f in files if f], branch)
    for e in errs:
        print(e)
    return 1 if errs else 0


def main(argv):
    if len(argv) >= 3 and argv[1] == '--diff':
        return main_diff(argv)
    if len(argv) != 2:
        print('usage: scripts/check.py FILE', file=sys.stderr)
        return 2
    errs = check_file(argv[1])
    text = open(argv[1], encoding='utf-8').read()
    todo = len(re.findall(r'^<tr id="e\d+"[^>]*><td>⬜', text, re.M))
    done = len(re.findall(r'^<tr id="e\d+"[^>]*><td>✅', text, re.M))
    for e in errs:
        print(e)
    print(f'rows: {todo + done}  ⬜ {todo}  ✅ {done}')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
