#!/usr/bin/env python3
"""
Render the site: templates/*.html + data/*.json -> root-level HTML pages.

Run via:
    make build

The site stays plain HTML/CSS/JS at runtime; this script only removes the
copy-paste between pages (header, footer, head metadata) and pre-renders the
data-driven parts (publications, news, projects, education) so that they are
crawlable and readable without JavaScript. Requires `jinja2`.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
DATA = ROOT / "data"

# One entry per rendered page. `key` feeds <body data-page> (nav highlighting),
# `url` feeds canonical / og:url.
PAGES: list[dict] = [
    {"template": "index.html",        "out": "index.html",        "key": "home",         "url": "/"},
    {"template": "research.html",     "out": "research.html",     "key": "research",     "url": "/research.html"},
    {"template": "projects.html",     "out": "projects.html",     "key": "projects",     "url": "/projects.html"},
    {"template": "publications.html", "out": "publications.html", "key": "publications", "url": "/publications.html"},
    {"template": "education.html",    "out": "education.html",    "key": "education",    "url": "/education.html"},
    {"template": "news.html",         "out": "news.html",         "key": "news",         "url": "/news.html"},
    {"template": "404.html",          "out": "404.html",          "key": "404",          "url": "/404.html",
     "noindex": True, "minimal_footer": True},
]

NEWS_TYPES: dict[str, tuple[str, str]] = {
    "paper":      ("\U0001F4C4", "Paper"),
    "software":   ("⚙️", "Software"),
    "conference": ("\U0001F393", "Conference"),
    "visit":      ("\U0001F3DB️", "Visit"),
    "award":      ("\U0001F3C6", "Award"),
    "default":    ("✨", "Update"),
}


def load_json(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# --- News ----------------------------------------------------------------

def format_news_date(raw: str) -> str:
    """'2026-07-15' -> '15 Jul 2026'; '2026-07' -> 'Jul 2026'; '2026' -> '2026'."""
    if not raw:
        return ""
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            return dt.date.fromisoformat(raw).strftime("%-d %b %Y")
        if re.fullmatch(r"\d{4}-\d{2}", raw):
            return dt.date.fromisoformat(raw + "-01").strftime("%b %Y")
    except ValueError:
        pass
    return raw


def prepare_news(items: list[dict]) -> list[dict]:
    out = []
    for item in items:
        kind = item.get("type") or "default"
        if kind not in NEWS_TYPES:
            kind = "default"
        icon, label = NEWS_TYPES[kind]
        out.append({
            "date": item.get("date", ""),
            "date_text": format_news_date(item.get("date", "")),
            "type": kind,
            "icon": icon,
            "label": label,
            "text": item.get("text", ""),
            "link": item.get("link") or None,
        })
    return out


# --- Publications --------------------------------------------------------

def facet(items: list[dict], key: str, sort_key=None, reverse: bool = False) -> list[tuple[str, int]]:
    counts = Counter(p[key] for p in items if p.get(key))
    return sorted(counts.items(), key=sort_key or (lambda kv: kv[0]), reverse=reverse)


def strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html)


def publications_jsonld(pubs: list[dict], site: dict) -> str:
    """schema.org ItemList of ScholarlyArticle entries for the publications page."""
    elements = []
    for i, p in enumerate(pubs, 1):
        article: dict = {
            "@type": "ScholarlyArticle",
            "headline": p.get("title", ""),
        }
        if p.get("doi"):
            article["sameAs"] = f"https://doi.org/{p['doi']}"
            article["identifier"] = p["doi"]
        if p.get("year"):
            article["datePublished"] = p["year"]
        if p.get("journal"):
            article["isPartOf"] = {"@type": "Periodical", "name": p["journal"]}
        authors = [a.strip() for a in strip_tags(p.get("authors_html", "")).split(",") if a.strip()]
        if authors:
            article["author"] = [{"@type": "Person", "name": a} for a in authors]
        elements.append({"@type": "ListItem", "position": i, "item": article})
    data = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": f"Publications of {site['name']}",
        "itemListElement": elements,
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


# --- Main ----------------------------------------------------------------

def main() -> int:
    site = load_json("site.json")
    publications = load_json("publications.json")
    news = prepare_news(load_json("news.json"))
    projects = load_json("projects.json")
    education = load_json("education.json")
    stack = load_json("stack.json")

    by_doi = {(p.get("doi") or "").lower(): p for p in publications}
    featured_pubs = []
    for doi in site.get("featured_dois", []):
        pub = by_doi.get(doi.lower())
        if pub is None:
            print(f"!!! featured DOI not found in publications.json: {doi}", file=sys.stderr)
            continue
        featured_pubs.append(pub)

    today = dt.date.today()
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals["m"] = env.get_template("_macros.html").module

    context = {
        "site": site,
        "build": {"year": today.year, "date": today.isoformat()},
        "publications": publications,
        "featured_pubs": featured_pubs,
        "type_facet": facet(publications, "type"),
        "year_facet": facet(publications, "year", sort_key=lambda kv: int(kv[0]), reverse=True),
        "pub_jsonld": publications_jsonld(publications, site),
        "news": news,
        "projects": projects,
        "education": education,
        "stack": stack,
    }

    for page in PAGES:
        template = env.get_template(page["template"])
        html = template.render(page=page, **context)
        out = ROOT / page["out"]
        out.write_text(html.rstrip("\n") + "\n", encoding="utf-8")
        print(f">>> Wrote {page['out']} ({len(html.encode('utf-8')) // 1024} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
