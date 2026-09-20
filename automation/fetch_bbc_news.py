#!/usr/bin/env python3
import json, re, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

FEED = "https://feeds.bbci.co.uk/sport/cricket/rss.xml"
OUT = Path(__file__).with_name("bbc-news.json")
raw = urllib.request.urlopen(FEED, timeout=30).read()
root = ET.fromstring(raw)
items = []
for item in root.findall("./channel/item"):
    title = (item.findtext("title") or "").strip()
    link = (item.findtext("link") or "").strip()
    if not title or not link: continue
    items.append({"title": title, "description": re.sub(r"\s+", " ", (item.findtext("description") or "").strip()), "link": link, "published": (item.findtext("pubDate") or "").strip(), "guid": (item.findtext("guid") or link).strip(), "source": "BBC Sport"})
OUT.write_text(json.dumps({"source": "BBC Sport Cricket RSS", "feedUrl": FEED, "updatedAt": datetime.now(timezone.utc).isoformat(), "items": items[:30]}, indent=2, ensure_ascii=False) + "\n")
print(f"Wrote {len(items[:30])} BBC Sport stories to {OUT}")
