#!/usr/bin/env python3
"""Scrape the evaluation sheets of 42evalhub.com into src/data/evals.json (+ evals-index.json).

42evalhub.com keeps every sheet as a saved intra "scale" page (/data/common/*.html,
/data/specs/*.html), listed in two JS manifests. This reads the manifests, fetches each
sheet once and turns it into plain data — sections, questions, yes/no or 0–5 grading,
attachments — so the app renders it with its own components (no foreign HTML is injected).

    python3 scripts/scrape_evalhub.py            # or: make evals
    python3 scripts/scrape_evalhub.py --only minitalk,ft_ssl_md5
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://www.42evalhub.com"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/data/evals.json"
INDEX = ROOT / "src/data/evals-index.json"  # small: lets other pages link a sheet without loading them all
MANIFESTS = {
    "common": "/js/services/Common/commonCoreService.js",
    "specs": "/js/services/Specs/specsService.js",
}
VOID = {"br", "hr", "img", "input", "meta", "link", "source", "wbr", "col", "area", "base", "embed", "param", "track"}


def get(path: str) -> str:
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "37-companion eval-sheet sync (open-source 42 tracker)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


# --- a tiny DOM, enough for intra's scale markup ---------------------------------------------
class Node:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs or {}), parent, []

    @property
    def classes(self):
        return set((self.attrs.get("class") or "").split())

    def find_all(self, pred):
        for c in self.children:
            if isinstance(c, Node):
                if pred(c):
                    yield c
                yield from c.find_all(pred)

    def find(self, pred):
        return next(self.find_all(pred), None)


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = self.cur = Node("#root")

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)

    def handle_pi(self, data):  # "<?php echo PATH; ?>" in some sheets → "./"
        self.cur.children.append("./" if "PATH" in data else "")


def parse(html: str) -> Node:
    b = Builder()
    b.feed(html)
    return b.root


def by_class(name):
    return lambda n: name in n.classes


def text(node, keep_lines=True) -> str:
    """Text of a node; <br> and block ends become line breaks, other whitespace collapses."""
    out = []

    def walk(n):
        for c in n.children:
            if isinstance(c, str):
                out.append(re.sub(r"\s+", " ", c))
            elif c.tag == "br":
                out.append("\n")
            elif c.tag in ("script", "style", "select", "input", "label"):
                continue
            else:
                walk(c)
                if c.tag in ("p", "div", "li", "pre", "h1", "h2", "h3", "h4", "h5"):
                    out.append("\n")

    walk(node)
    s = "".join(out)
    s = "\n".join(line.strip() for line in s.split("\n"))
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s if keep_lines else re.sub(r"\s+", " ", s)


def blocks(nodes):
    """Question body → [{"type": "p", "text"} | {"type": "ul", "items"} | {"type": "pre", "text"}]."""
    res = []
    for n in nodes:
        if isinstance(n, str):
            t = n.strip()
            if t:
                res.append({"type": "p", "text": re.sub(r"\s+", " ", t)})
            continue
        if n.tag in ("ul", "ol"):
            items = [text(li) for li in n.children if isinstance(li, Node) and li.tag == "li"]
            items = [i for i in items if i]
            if items:
                res.append({"type": "ul", "items": items})
        elif n.tag == "pre":
            t = "".join(c if isinstance(c, str) else text(c) for c in n.children).strip("\n")
            if t.strip():
                res.append({"type": "pre", "text": t})
        else:
            t = text(n)
            if t:
                res.append({"type": "p", "text": t})
    return res


def units(node):
    """(kind, node) for every content block of a scale section, in document order."""
    for c in node.children:
        if isinstance(c, str):
            if c.strip():
                yield "block", c
            continue
        if c.tag == "h3":
            yield "h3", c
        elif c.tag == "h4" and "scale-question-name" in c.classes:
            yield "question", c
        elif "scale-question-answers" in c.classes:
            yield "answers", c
        elif c.tag == "p" and "font-italic" in c.classes:
            yield "note", c
        elif c.tag == "p" and "scale-section-guidelines" in c.classes and not text(c):
            continue
        elif c.tag in ("p", "ul", "ol", "pre", "table", "blockquote", "h5", "h6"):
            yield "block", c
        elif c.tag in ("hr", "br", "script", "style"):
            continue
        else:
            yield from units(c)


def parse_sheet(html: str) -> dict:
    root = parse(html)
    info = root.find(by_class("scale-section-infos")) or root
    title = info.find(lambda n: n.tag == "h3")
    link = title.find(lambda n: n.tag == "a") if title else None
    intra_slug = None
    if link is not None:
        m = re.search(r"/projects/([^/?#]+)", link.attrs.get("href", ""))
        intra_slug = m.group(1) if m else None
    evaluate = info.find(lambda n: n.tag == "h5")

    def section_text(cls):
        n = info.find(by_class(cls))
        if not n:
            return ""
        p = n.find(lambda x: x.tag == "p")
        return text(p) if p else ""

    attachments = []
    for a in root.find_all(lambda n: n.tag == "a" and n.parent is not None and "attachment-name" in n.parent.classes):
        attachments.append({"name": text(a, False), "url": a.attrs.get("href")})

    sections = []
    for sec in root.find_all(by_class("scale-section-item")):
        title_text, note, questions, cur = "", "", [], None
        # Walk the section in document order: some sheets leave the header <div> unclosed, so
        # questions can sit inside it. Blocks (p / ul / pre / h3 / h4 / answers) are the units.
        for kind, n in units(sec):
            if kind == "h3" and not title_text and cur is None:
                title_text = text(n, False)
            elif kind == "note" and cur is None:
                note = note or text(n)
            elif kind == "question":
                cur = {"name": text(n, False), "_nodes": []}
                questions.append(cur)
            elif kind == "answers" and cur is not None:
                sel = n.find(lambda x: x.tag == "select")
                if sel is not None:
                    values = [int(o.attrs["value"]) for o in sel.find_all(lambda x: x.tag == "option") if o.attrs.get("value", "").isdigit()]
                    cur["kind"], cur["max"] = "rate", max(values or [5])
                else:
                    cur["kind"] = "yesno"
            elif kind == "block" and cur is not None:
                cur["_nodes"].append(n)
        for q in questions:
            q["body"] = blocks(q.pop("_nodes"))
            q.setdefault("kind", "yesno")
        sections.append({
            "title": title_text,
            "note": note,
            "bonus": bool(re.search(r"\bbonus\b", title_text, re.I)),
            "questions": questions,
        })

    return {
        "intra_slug": intra_slug,
        "title": text(link, False) if link is not None else None,
        "evaluate": text(evaluate, False) if evaluate else "",
        "introduction": section_text("scale-introduction"),
        "guidelines": section_text("scale-guidelines"),
        "attachments": attachments,
        "sections": sections,
    }


def manifest(group: str) -> list[str]:
    js = get(MANIFESTS[group])
    return re.findall(r"'([^']+\.html)'", js)


def slugify(filename: str) -> str:  # same as the site: "Django - 0 - Initiation.html" → "django---0---initiation"
    s = re.sub(r"\.html$", "", filename).lower()
    return re.sub(r"[^a-z0-9-]", "", re.sub(r"\s+", "-", s))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated evalhub slugs to (re)fetch; others are kept from the existing file")
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between requests (be nice to the site)")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    old = {s["slug"]: s for s in json.loads(OUT.read_text()).get("sheets", [])} if OUT.exists() else {}

    sheets, failed = [], []
    for group in ("common", "specs"):
        for filename in manifest(group):
            slug = slugify(filename)
            if only and slug not in only and slug in old:
                sheets.append(old[slug])
                continue
            try:
                html = get(f"/data/{group}/{urllib.parse.quote(filename)}")
                sheet = parse_sheet(html)
            except Exception as e:  # keep going; report at the end
                failed.append(f"{group}/{filename}: {e}")
                if slug in old:
                    sheets.append(old[slug])
                continue
            n = sum(len(s["questions"]) for s in sheet["sections"])
            print(f"  {group:6} {filename:50} {len(sheet['sections']):2} sections · {n:3} questions", flush=True)
            sheets.append({"slug": slug, "file": filename, "name": re.sub(r"\.html$", "", filename), "group": group, **sheet})
            time.sleep(args.delay)

    OUT.write_text(json.dumps({
        "source": BASE,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(sheets),
        "sheets": sheets,
    }, ensure_ascii=False, indent=1) + "\n")
    INDEX.write_text(json.dumps([
        {"slug": s["slug"], "name": s["name"], "group": s["group"], "intra_slug": s["intra_slug"],
         "questions": sum(len(sec["questions"]) for sec in s["sections"])}
        for s in sheets
    ], ensure_ascii=False) + "\n")
    print(f"✓ {len(sheets)} sheets → {OUT.relative_to(ROOT)}")
    if failed:
        print("✗ failed:\n  " + "\n  ".join(failed), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
