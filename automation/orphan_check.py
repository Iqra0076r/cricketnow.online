#!/usr/bin/env python3
"""Orphan-page check for cricketnow.online.

Scans every HTML file under the repo root for same-site internal links and
reports indexable pages (directories with index.html, plus the root index)
that receive ZERO inbound links from any other page.

Run after each daily pipeline publish:
    python3 automation/orphan_check.py

Exit code 0 = no orphans (or only allow-listed ones), 1 = new orphans found.
"""
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HREF_RE = re.compile(r'href="(/[^"]*)"')

# Pages that are allowed to have no inlinks (utility / non-index targets).
ALLOWLIST = {
    "/404.html",
    "/googleed7f9e7bb1f66951.html",  # Google Search Console verification file
}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for k, v in attrs:
            if k == "href" and v and v.startswith("/") and not v.startswith("//"):
                # Strip query/fragment; keep path.
                v = v.split("?", 1)[0].split("#", 1)[0]
                self.links.append(v)


def page_url(path):
    """Map an HTML file path to its canonical URL path."""
    rel = os.path.relpath(path, ROOT)
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    if rel.endswith(".html"):
        return "/" + rel
    return None


def main():
    pages = {}   # url -> file path
    inlinks = {}  # url -> set(source urls)
    for dirpath, _dirnames, filenames in os.walk(ROOT):
        if "/.git" in dirpath or "/automation" in dirpath:
            continue
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            fp = os.path.join(dirpath, fn)
            url = page_url(fp)
            if url is None:
                continue
            pages[url] = fp
            inlinks.setdefault(url, set())

    for url, fp in pages.items():
        try:
            html = open(fp, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        parser = LinkParser()
        try:
            parser.feed(html)
        except Exception:
            continue
        for link in parser.links:
            target = link if link.endswith("/") or "." in link.rsplit("/", 1)[-1] else link + "/"
            if target in inlinks and target != url:
                inlinks[target].add(url)
            elif link.rstrip("/") + "/" in inlinks:
                t = link.rstrip("/") + "/"
                if t != url:
                    inlinks[t].add(url)

    orphans = sorted(u for u, srcs in inlinks.items() if not srcs and u not in ALLOWLIST)
    if orphans:
        print("ORPHAN PAGES (zero inbound internal links):")
        for u in orphans:
            print("  " + u + "  <- " + pages[u])
        return 1
    print("OK: no orphan pages (%d pages checked)." % len(pages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
