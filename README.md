# [Ettore Rocchi](https://ettorerocchi.github.io)
## Personal academic website

Postdoctoral researcher in Biomedical Data Science at the University of Bologna.

The published site is plain HTML/CSS/JS (no runtime framework). Pages are rendered from `templates/` + `data/` by a small Python build step and the output is committed, so GitHub Pages serves static files.

```bash
pip install jinja2 requests   # one-time
make build                    # templates/ + data/ -> *.html
make build-pubs               # refresh data/publications.json (Scopus + CrossRef), then build
make dev                      # local server + open in browser
```

- `templates/` - Jinja2 templates (`base.html` = shared head/nav/footer, `_macros.html` = reusable blocks)
- `data/` - content as JSON: `site.json`, `news.json`, `publications.json` (auto-synced), `projects.json`, `education.json`, `stack.json`
- `scripts/` - `build_site.py`, `build_publications.py` (see `scripts/README.md`)
