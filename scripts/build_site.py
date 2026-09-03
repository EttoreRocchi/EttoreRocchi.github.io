#!/usr/bin/env python3
"""
Render the site: templates/*.html + data/*.json -> root-level HTML pages.

Run via:
    make build

The site stays plain HTML/CSS/JS at runtime; this script only removes the
copy-paste between pages (header, footer, head metadata) and pre-renders the
data-driven parts (publications, news, projects, education) so that they are
crawlable and readable without JavaScript. It also writes sitemap.xml (lastmod
taken from git) and an Atom feed.xml built from data/news.json. Requires `jinja2`.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from xml.sax.saxutils import escape

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


def slugify(text: str, words: int = 4) -> str:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return "-".join(tokens[:words])


def prepare_news(items: list[dict]) -> list[dict]:
    out = []
    seen: set[str] = set()
    for item in items:
        kind = item.get("type") or "default"
        if kind not in NEWS_TYPES:
            kind = "default"
        icon, label = NEWS_TYPES[kind]
        base = f"{item.get('date', '')}-{slugify(item.get('text', ''))}".strip("-")
        uid, n = base, 2
        while uid in seen:
            uid, n = f"{base}-{n}", n + 1
        seen.add(uid)
        out.append({
            "id": uid,
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


# --- Sitemap ------------------------------------------------------------

SITEMAP_META: dict[str, tuple[str, str]] = {
    # page key -> (changefreq, priority)
    "home":         ("monthly", "1.0"),
    "research":     ("monthly", "0.8"),
    "projects":     ("monthly", "0.8"),
    "publications": ("monthly", "0.8"),
    "news":         ("weekly",  "0.7"),
    "education":    ("yearly",  "0.6"),
}


def git(*args: str) -> str | None:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None


def page_lastmod(out_name: str, rendered: str, today: dt.date) -> str:
    """Date of the last commit that changed the page, or today if the fresh render differs from HEAD."""
    committed = git("show", f"HEAD:{out_name}")
    if committed is None or committed.rstrip("\n") != rendered.rstrip("\n"):
        return today.isoformat()
    stamp = git("log", "-1", "--format=%cs", "--", out_name)
    return (stamp or "").strip() or today.isoformat()


def write_sitemap(site: dict, entries: list[tuple[str, str, str]]) -> None:
    """entries: (url path, lastmod, page key)."""
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, lastmod, key in entries:
        changefreq, priority = SITEMAP_META.get(key, ("monthly", "0.5"))
        lines += ["  <url>",
                  f"    <loc>{escape(site['base_url'] + url)}</loc>",
                  f"    <lastmod>{lastmod}</lastmod>",
                  f"    <changefreq>{changefreq}</changefreq>",
                  f"    <priority>{priority}</priority>",
                  "  </url>"]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f">>> Wrote sitemap.xml ({len(entries)} URLs)")


# --- Atom feed ----------------------------------------------------------

def news_timestamp(raw: str) -> str:
    """RFC 3339 timestamp for a news date; month-only dates map to the 1st."""
    if re.fullmatch(r"\d{4}-\d{2}", raw):
        raw += "-01"
    elif re.fullmatch(r"\d{4}", raw):
        raw += "-01-01"
    try:
        dt.date.fromisoformat(raw)
    except ValueError:
        raw = dt.date.today().isoformat()
    return raw + "T00:00:00Z"


def news_title(text: str, limit: int = 120) -> str:
    first = re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0].rstrip(".")
    if len(first) <= limit:
        return first
    cut = first[:limit].rsplit(" ", 1)[0]
    return cut + "\u2026"


def write_feed(site: dict, news: list[dict], today: dt.date) -> None:
    base = site["base_url"]
    updated = news_timestamp(news[0]["date"]) if news else today.isoformat() + "T00:00:00Z"
    lines = ['<?xml version="1.0" encoding="utf-8"?>',
             '<feed xmlns="http://www.w3.org/2005/Atom">',
             f"  <title>{escape(site['name'])} - News</title>",
             f"  <subtitle>Papers, software releases, conferences, and research visits.</subtitle>",
             f'  <link href="{base}/news.html"/>',
             f'  <link rel="self" href="{base}/feed.xml"/>',
             f"  <id>{base}/</id>",
             f"  <updated>{updated}</updated>",
             f"  <author><name>{escape(site['name'])}</name></author>"]
    for item in news:
        permalink = f"{base}/news.html#{item['id']}"
        lines += ["  <entry>",
                  f"    <title>{escape(news_title(item['text']))}</title>",
                  f'    <link href="{escape(item["link"] or permalink)}"/>',
                  f"    <id>{permalink}</id>",
                  f"    <updated>{news_timestamp(item['date'])}</updated>",
                  f'    <category term="{escape(item["label"])}"/>',
                  f"    <summary>{escape(item['text'])}</summary>",
                  "  </entry>"]
    lines.append("</feed>")
    (ROOT / "feed.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f">>> Wrote feed.xml ({len(news)} entries)")


# --- Highlights (home) ---------------------------------------------------

def resolve_highlights(site: dict, publications: list[dict], projects: dict) -> dict:
    cfg = site.get("highlights", {})
    by_doi = {(p.get("doi") or "").lower(): p for p in publications}
    paper = by_doi.get((cfg.get("paper_doi") or "").lower())
    if paper is None:
        print(f"!!! highlights.paper_doi not found in publications.json: {cfg.get('paper_doi')}", file=sys.stderr)
    candidates = [projects.get("ecosystem", {})] + projects.get("frameworks", []) + projects.get("tools", [])
    project = next((p for p in candidates if p.get("id") == cfg.get("project_id")), None)
    if project is None:
        print(f"!!! highlights.project_id not found in projects.json: {cfg.get('project_id')}", file=sys.stderr)
    return {
        "paper": paper,
        "paper_blurb": cfg.get("paper_blurb", ""),
        "project": project,
        "research": cfg.get("research", {}),
    }


# --- Main ----------------------------------------------------------------

def main() -> int:
    site = load_json("site.json")
    publications = load_json("publications.json")
    news = prepare_news(load_json("news.json"))
    projects = load_json("projects.json")
    education = load_json("education.json")
    highlights = resolve_highlights(site, publications, projects)

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
        "highlights": highlights,
        "type_facet": facet(publications, "type"),
        "year_facet": facet(publications, "year", sort_key=lambda kv: int(kv[0]), reverse=True),
        "pub_jsonld": publications_jsonld(publications, site),
        "news": news,
        "projects": projects,
        "education": education,
    }

    sitemap_entries: list[tuple[str, str, str]] = []
    for page in PAGES:
        template = env.get_template(page["template"])
        html = template.render(page=page, **context).rstrip("\n") + "\n"
        out = ROOT / page["out"]
        if not page.get("noindex"):
            sitemap_entries.append((page["url"], page_lastmod(page["out"], html, today), page["key"]))
        out.write_text(html, encoding="utf-8")
        print(f">>> Wrote {page['out']} ({len(html.encode('utf-8')) // 1024} KB)")

    write_sitemap(site, sitemap_entries)
    write_feed(site, news, today)
    return 0


if __name__ == "__main__":
    sys.exit(main())
