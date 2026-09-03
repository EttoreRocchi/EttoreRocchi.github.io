# scripts/

- `build_site.py` renders `templates/` + `data/` into the root HTML pages, plus `sitemap.xml` (lastmod from git) and the Atom `feed.xml` from `data/news.json` (`make build`, needs `jinja2`).
- `build_publications.py` refreshes `data/publications.json` from Scopus + CrossRef, then rebuilds (`make build-pubs`, needs `requests` and a Scopus API key in `scripts/.env`, see `.env.example`).
- Content lives in `data/*.json`; edit, run `make build`, commit the regenerated HTML with the source.
