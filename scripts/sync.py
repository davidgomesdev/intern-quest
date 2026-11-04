#!/usr/bin/env python3
"""Sync index.html with the OPP entity list (also the seed: sync on an empty tbody)."""
import argparse, html, re, sys, urllib.request
from html.parser import HTMLParser

URL = "https://www.ordemdospsicologos.pt/pt/estagios/entidades"
UA = "intern-quest-sync/1.0 (static page of OPP internship entities; manual run)"
ROW = re.compile(r'^<tr id="e(\d{4,})"')
REMOVED = ' data-removed="1"'


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_table = self.in_cell = False
        self.cells, self.rows = [], []

    def handle_starttag(self, tag, attrs):
        if tag == "table" and "mainlisting" in (dict(attrs).get("class") or "").split():
            self.in_table = True
        elif self.in_table and tag == "tr":
            self.cells = []
        elif self.in_table and tag == "td":
            self.in_cell = True
            self.cells.append("")

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
        elif tag == "td":
            self.in_cell = False
        elif tag == "tr" and self.in_table and len(self.cells) >= 2:
            self.rows.append(self.cells[:2])
            self.cells = []

    def handle_data(self, data):
        if self.in_cell:
            self.cells[-1] += data


def parse_opp(html_text):
    p = _Parser()
    p.feed(html_text)
    out = {}
    for num, name in p.rows:
        num = " ".join(num.split())
        if num.isdigit():
            out[int(num)] = " ".join(name.split())
    return out


def row_line(n, name):
    return (f'<tr id="e{n:04d}"><td>⬜</td><td>{n:04d}</td><td>{html.escape(name, quote=False)}</td>'
            + "<td></td>" * 8 + "</tr>")


def _name(line):
    cells = re.findall(r"<td>(.*?)</td>", line)
    return html.unescape(cells[2]) if len(cells) > 2 else None


def sync_lines(lines, opp, min_rows=1000):
    if len(opp) < min_rows:
        raise ValueError(f"only {len(opp)} rows parsed from OPP, expected at least {min_rows}")
    have = {}
    for l in lines:
        m = ROW.match(l)
        if m:
            have[int(m.group(1))] = l
    rep = {"new": sorted(set(opp) - set(have)), "removed": [], "readded": [], "renamed": [],
           "last_before": max(have) if have else None}
    new_rows = {n: row_line(n, opp[n]) for n in rep["new"]}
    out, pending = [], list(rep["new"])
    for l in lines:
        m = ROW.match(l)
        if m:
            n = int(m.group(1))
            while pending and pending[0] < n:
                out.append(new_rows[pending.pop(0)])
            flagged = l.startswith(f'<tr id="e{m.group(1)}"{REMOVED}>')
            if n not in opp and not flagged:
                l = l.replace(f'<tr id="e{m.group(1)}"', f'<tr id="e{m.group(1)}"{REMOVED}', 1)
                rep["removed"].append(n)
            elif n in opp and flagged:
                l = l.replace(REMOVED, "", 1)
                rep["readded"].append(n)
            if n in opp and _name(l) != opp[n]:
                rep["renamed"].append((n, _name(l), opp[n]))
        elif l.startswith("</tbody>"):
            while pending:
                out.append(new_rows[pending.pop(0)])
        out.append(l)
    assert not pending, "no </tbody> line found"
    rep["last_after"] = max(set(have) | set(opp))
    return out, rep


def report(rep):
    la = lambda v: "none" if v is None else v
    if not (rep["new"] or rep["removed"] or rep["readded"] or rep["renamed"]):
        return f"last id before/after: {la(rep['last_before'])}/{la(rep['last_after'])}\nno changes"
    ids = lambda xs: " ".join(f"e{n:04d}" for n in xs)
    out = [f"last id before/after: {la(rep['last_before'])}/{la(rep['last_after'])}",
           f"+{len(rep['new'])} new: {ids(rep['new'])}",
           f"-{len(rep['removed'])} removed: {ids(rep['removed'])}"]
    if rep["readded"]:
        out.append(f"={len(rep['readded'])} re-added: {ids(rep['readded'])}")
    out.append(f"~{len(rep['renamed'])} renamed:")
    out += [f'  e{n:04d} "{o}" -> "{w}"' for n, o, w in rep["renamed"]]
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="src", help="saved OPP HTML file instead of the network")
    ap.add_argument("--file", default="index.html")
    ap.add_argument("--min-rows", type=int, default=1000)
    a = ap.parse_args(argv)
    try:
        if a.src:
            with open(a.src, encoding="utf-8") as f:
                text = f.read()
        else:
            req = urllib.request.Request(URL, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                text = r.read().decode("utf-8")
        with open(a.file, encoding="utf-8", newline="") as f:
            old = f.read()
        lines, rep = sync_lines(old.split("\n"), parse_opp(text), a.min_rows)
    except (ValueError, OSError) as e:
        print(f"sync aborted: {e}", file=sys.stderr)
        return 1
    print(report(rep))
    new = "\n".join(lines)
    if new != old:
        with open(a.file, "w", encoding="utf-8", newline="") as f:
            f.write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
