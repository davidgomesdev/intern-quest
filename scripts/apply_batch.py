#!/usr/bin/env python3
"""Apply researched rows, one commit per entity. Run from the batch worktree.

Usage: scripts/apply_batch.py OUT ID[:reason] ...
  ID          apply OUT/eID.json (flags merged into adicional), check, commit "feat(data): fill eID"
  ID:reason   subagent already failed; recorded as FAILED, nothing applied

Prints one line per id ("eID ok" / "eID private" / "eID FAILED: reason") and writes
OUT/body.md (PR "## Entities" list) and OUT/report.tsv (id, nome, result).
Any failed step resets that entity (git reset --hard HEAD) and goes on.
A failed commit (hook/signing) aborts the batch: exit 3, error on stderr.
"""
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('apply_row', HERE / 'apply_row.py')
apply_row = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apply_row)


def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def nome(rid, text):
    m = re.search(rf'^<tr id="{rid}"[ >].*$', text, re.M)
    cells = re.findall(r'<td>(.*?)</td>', m.group(0)) if m else []
    return cells[2] if len(cells) > 2 else '—'


def fill(rid, out):
    """Apply and commit one entity; return None on success or a failure reason."""
    f = out / f'{rid}.json'
    if not f.exists():
        return f'no {f.name}'
    d = json.loads(f.read_text(encoding='utf-8'))
    if d.get('flags'):
        note = 'Revisar: ' + '; '.join(d['flags'])
        d['adicional'] = '; '.join(filter(None, [d.get('adicional'), note]))
        f.write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
    rc, msg = run(sys.executable, str(HERE / 'apply_row.py'), rid[1:], str(f))
    if rc:
        return f'apply_row.py: {msg}'
    rc, msg = run('git', 'diff', '--numstat')
    if msg.split() != ['1', '1', 'index.html']:
        return f'diff not 1 line: {msg}'
    rc, msg = run(sys.executable, str(HERE / 'check.py'), 'index.html')
    if rc:
        return f'check.py: {msg}'
    run('git', 'add', 'index.html')
    rc, msg = run('git', 'commit', '-m', f'feat(data): fill {rid}')
    if rc:
        print(f'ABORT {rid}: commit failed: {msg}', file=sys.stderr)
        sys.exit(3)
    rc, msg = run(sys.executable, str(HERE / 'check.py'), '--diff', 'HEAD~1')
    if rc:
        run('git', 'reset', '--hard', 'HEAD~1')
        return f'check.py --diff: {msg}'
    return None


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    out, html = pathlib.Path(argv[1]), pathlib.Path('index.html').read_text(encoding='utf-8')
    body, rows = [], []
    for arg in sorted(argv[2:]):
        rid, _, pre = arg.partition(':')
        rid = 'e' + rid.lstrip('e')
        n = nome(rid, html)
        why = pre or fill(rid, out)
        if why:
            run('git', 'reset', '--hard', 'HEAD')
            line, res = f'- {rid} ({n}): FAILED: {why}', f'FAILED: {why}'
        else:
            d = json.loads((out / f'{rid}.json').read_text(encoding='utf-8'))
            src = d.get('sources') or []
            if d.get('private'):
                line, res = f'- {rid} ({n}): 🔒 private individual, not published', 'private'
            else:
                line, res = f'- {rid} ({n}): ok, ' + (', '.join(src) or 'no sources found'), 'ok'
        body.append(line)
        rows.append(f'{rid}\t{n}\t{res}')
        print(f'{rid} {res}')
    (out / 'body.md').write_text('## Entities\n' + '\n'.join(body) + '\n', encoding='utf-8')
    (out / 'report.tsv').write_text('\n'.join(rows) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
