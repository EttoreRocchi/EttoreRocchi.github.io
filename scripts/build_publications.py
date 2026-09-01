#!/usr/bin/env python3
"""
Build data/publications.json + assets/publications.bib from Scopus + CrossRef.

Run via:
    make build-pubs

Requires a `.env` file at the repo root (see .env.example) with:
    SCOPUS_API_KEY      - Elsevier API key (https://dev.elsevier.com/)
    SCOPUS_AUTHOR_ID    - your Scopus author ID
    USER_SURNAME        - surname used to bold your name in author lists
    USER_INITIALS       - first initial (e.g. "E" for Ettore)

Scopus + CrossRef are queried fresh each run; ~1 second per paper because we
rate-limit CrossRef. Network errors leave the existing JSON / .bib untouched.

Scopus provides the document list, title, journal and OA flag. CrossRef provides
the BibTeX, the author list (Scopus' standard view only returns the first
author) and the publication date: `year` / `date` follow CrossRef's `issued`
date so that they always agree with the BibTeX entry.

To suppress specific entries (errata, withdrawn papers, etc.), add their DOIs
to EXCLUDE_DOIS below.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

# --- Config --------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
ENV_FILE = SCRIPT_DIR / ".env"   # lives next to this script (gitignored)
OUTPUT_JSON = ROOT / "data" / "publications.json"

# DOIs listed here are dropped from the output (errata, withdrawn, etc.).
EXCLUDE_DOIS: set[str] = set()

# Scopus title-cases some journal names; restore the publishers' own casing.
JOURNAL_FIXES: dict[str, str] = {
    "Npj Digital Medicine": "npj Digital Medicine",
    "Biomedinformatics": "BioMedInformatics",
}

CROSSREF_DELAY_S = 0.2  # be polite to api.crossref.org
HTTP_TIMEOUT_S = 30


# --- .env loader ---------------------------------------------------------

def load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        sys.exit(
            f"Missing {ENV_FILE}. Copy scripts/.env.example to scripts/.env and fill in your Scopus key."
        )
    env: dict[str, str] = {}
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


# --- Scopus --------------------------------------------------------------

SCOPUS_URL = "https://api.elsevier.com/content/search/scopus"
SCOPUS_FIELDS = (
    "dc:title,prism:publicationName,prism:coverDate,"
    "subtypeDescription,prism:doi,authname,openaccess"
)


def fetch_scopus(author_id: str, api_key: str) -> list[dict]:
    documents: list[dict] = []
    start = 0
    count = 25
    headers = {"Accept": "application/json", "X-ELS-APIKey": api_key}
    while True:
        params = {
            "query": f"AU-ID({author_id})",
            "start": start,
            "count": count,
            "sort": "-coverDate",
            "field": SCOPUS_FIELDS,
        }
        resp = requests.get(SCOPUS_URL, headers=headers, params=params, timeout=HTTP_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.json()
        entries = data.get("search-results", {}).get("entry", [])
        if not entries:
            break
        documents.extend(entries)
        total = int(data["search-results"].get("opensearch:totalResults", 0))
        if start + count >= total:
            break
        start += count
    return documents


# --- CrossRef BibTeX -----------------------------------------------------

def fetch_bibtex(doi: str | None, session: requests.Session) -> str | None:
    if not doi:
        return None
    url = f"https://api.crossref.org/works/{quote(doi, safe='')}/transform/application/x-bibtex"
    try:
        resp = session.get(url, timeout=HTTP_TIMEOUT_S)
        if resp.status_code == 200:
            resp.encoding = "utf-8"  # CrossRef sends no charset; default guess mangles en-dashes
            return prettify_bibtex(resp.text.strip())
    except requests.RequestException:
        return None
    return None


def fetch_crossref_work(doi: str, session: requests.Session) -> dict:
    """Return the CrossRef works record (`message`) for a DOI, or {} on failure."""
    url = f"https://api.crossref.org/works/{quote(doi, safe='')}"
    try:
        resp = session.get(url, timeout=HTTP_TIMEOUT_S)
        if resp.status_code != 200:
            return {}
        return resp.json().get("message", {}) or {}
    except (requests.RequestException, ValueError):
        return {}


def crossref_authors(work: dict) -> list[str]:
    """
    Author names as "Surname I.N." (Scopus-style) from a CrossRef works record.
    Used because Scopus' standard view only returns dc:creator (first author);
    the 'authname'/'author' fields need the COMPLETE view, which the standard
    API key is not entitled to.
    """
    names: list[str] = []
    for a in work.get("author", []) or []:
        family = (a.get("family") or "").strip()
        given = (a.get("given") or "").strip()
        if not family:
            if a.get("name"):
                names.append(a["name"].strip())
            continue
        parts = re.split(r"[\s\-]+", given)
        initials = "".join(f"{x[0]}." for x in parts if x)
        names.append(f"{family} {initials}".strip())
    return names


def crossref_issued_date(work: dict) -> str:
    """'YYYY-MM-DD' from the `issued` date-parts (the date CrossRef's BibTeX uses)."""
    parts = ((work.get("issued") or {}).get("date-parts") or [[]])[0]
    if not parts or not parts[0]:
        return ""
    parts = list(parts) + [1] * (3 - len(parts))
    return f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"


def prettify_bibtex(raw: str) -> str:
    """
    CrossRef returns BibTeX as a single jammed line:
        @article{key, title={...}, author={...}, year={...} }

    Re-emit it with each field on its own line, 2-space indented:
        @article{key,
          title={...},
          author={...},
          year={...}
        }

    Brace depth is tracked so titles with `{Klebsiella pneumoniae}` etc. don't
    confuse the splitter. If the input doesn't look like BibTeX, returns it
    unchanged.
    """
    raw = raw.strip()
    match = re.match(r"(@\w+\{)([^,]+),\s*", raw)
    if not match:
        return raw

    header = match.group(1) + match.group(2) + ","
    body = raw[match.end():].rstrip().rstrip("}").rstrip()

    fields: list[str] = []
    current = ""
    depth = 0
    for ch in body:
        if ch == "{":
            depth += 1
            current += ch
        elif ch == "}":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            piece = current.strip()
            if piece:
                fields.append(piece)
            current = ""
        else:
            current += ch
    piece = current.strip()
    if piece:
        fields.append(piece)

    indented = ",\n".join("  " + f for f in fields)
    return f"{header}\n{indented}\n}}"


# --- Author list formatting ---------------------------------------------

def extract_author_names(entry: dict) -> list[str]:
    """
    Scopus quirk: when you request the 'authname' field, the response actually
    nests the names under a top-level 'author' list, where each element is an
    object like {'authname': 'Rocchi E.', ...}. We try that first, then fall
    back to other shapes seen in older clients.
    """
    authors = entry.get("author")
    if isinstance(authors, list):
        names = []
        for a in authors:
            if isinstance(a, dict):
                name = a.get("authname") or a.get("ce:indexed-name") or ""
                if name:
                    names.append(str(name).strip())
        if names:
            return names

    # Legacy fallbacks
    authname = entry.get("authname")
    if isinstance(authname, list):
        return [str(a.get("$", "")).strip() for a in authname if isinstance(a, dict) and a.get("$")]
    if isinstance(authname, str):
        return [n.strip() for n in authname.split(";") if n.strip()]

    creator = entry.get("dc:creator")
    return [creator.strip()] if isinstance(creator, str) and creator else []


def html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def bold_my_name(authors_text: str, surname: str, initial: str) -> str:
    """HTML-escape authors then wrap every variant of the user's name in <strong>...</strong>."""
    text = html_escape(authors_text)
    patterns = [
        rf"\b{re.escape(surname)}\s+{re.escape(initial)}\.?\b",
        rf"\b{re.escape(surname)},\s*{re.escape(initial)}\.?\b",
        rf"\bEttore\s+{re.escape(surname)}\b",
    ]
    for pattern in patterns:
        text = re.sub(
            pattern,
            lambda m: f"<strong>{m.group(0)}</strong>",
            text,
            flags=re.IGNORECASE,
        )
    return text


# --- Entry normalisation ------------------------------------------------

def parse_year(cover_date: str | None) -> str:
    if not cover_date:
        return ""
    return cover_date.split("-", 1)[0]


def normalise_oa_flag(value) -> bool:
    return value in (1, "1", True, "true", "True")


def to_publication(entry: dict, surname: str, initial: str) -> dict:
    doi = entry.get("prism:doi") or ""
    journal = (entry.get("prism:publicationName") or "").strip()
    names = extract_author_names(entry)
    authors_text = ", ".join(names)
    return {
        "title": (entry.get("dc:title") or "").strip(),
        "authors_html": bold_my_name(authors_text, surname, initial),
        "journal": JOURNAL_FIXES.get(journal, journal),
        "year": parse_year(entry.get("prism:coverDate")),
        "date": entry.get("prism:coverDate") or "",
        "doi": doi.strip() or None,
        "type": (entry.get("subtypeDescription") or "").strip(),
        "openaccess": normalise_oa_flag(entry.get("openaccess")),
        "bibtex": None,  # filled in by enrichment pass
    }


# --- Main ----------------------------------------------------------------

def main() -> int:
    env = load_env()
    api_key = env.get("SCOPUS_API_KEY")
    if not api_key:
        sys.exit("SCOPUS_API_KEY missing from .env")
    author_id = env.get("SCOPUS_AUTHOR_ID") or "57220152522"
    surname = env.get("USER_SURNAME") or "Rocchi"
    initial = env.get("USER_INITIALS") or "E"

    print(f">>> Fetching Scopus entries for author_id={author_id}...")
    raw = fetch_scopus(author_id, api_key)
    print(f">>> Got {len(raw)} raw entries.")

    pubs = [to_publication(e, surname, initial) for e in raw]
    pubs = [p for p in pubs if (p["doi"] or "").lower() not in {d.lower() for d in EXCLUDE_DOIS}]

    # Sort newest first (Scopus already sorts, but be defensive)
    pubs.sort(key=lambda p: (p["date"] or "0000"), reverse=True)

    print(f">>> Fetching BibTeX from CrossRef for {sum(1 for p in pubs if p['doi'])} entries...")
    with requests.Session() as session:
        session.headers["User-Agent"] = "ettorerocchi.github.io build-pubs (mailto:ettore.rocchi3@unibo.it)"
        for i, pub in enumerate(pubs, 1):
            if not pub["doi"]:
                print(f"  [{i}/{len(pubs)}] (no DOI) {pub['title'][:60]}")
                continue
            print(f"  [{i}/{len(pubs)}] {pub['doi']}")
            work = fetch_crossref_work(pub["doi"], session)
            time.sleep(CROSSREF_DELAY_S)

            # Scopus standard view yields at most the first author: complete from CrossRef.
            if "," not in pub["authors_html"]:
                names = crossref_authors(work)
                if names:
                    pub["authors_html"] = bold_my_name(", ".join(names), surname, initial)
                else:
                    print("      !!! no author list from Scopus or CrossRef")

            # Scopus' coverDate is the issue date (can be a year after publication);
            # align year/date with CrossRef's `issued`, which is what the BibTeX says.
            issued = crossref_issued_date(work)
            if issued:
                pub["date"] = issued
                pub["year"] = issued[:4]

            pub["bibtex"] = fetch_bibtex(pub["doi"], session)
            time.sleep(CROSSREF_DELAY_S)

    # Dates may have changed during enrichment: sort again, newest first.
    pubs.sort(key=lambda p: (p["date"] or "0000"), reverse=True)

    # --- Write JSON ----------------------------------------------------
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(pubs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f">>> Wrote {OUTPUT_JSON.relative_to(ROOT)} ({len(pubs)} entries).")

    missing_bib = [p for p in pubs if not p["bibtex"] and p["doi"]]
    if missing_bib:
        print(
            f"!!! {len(missing_bib)} entries had a DOI but CrossRef returned no BibTeX:"
        )
        for p in missing_bib:
            print(f"    - {p['doi']}  ({p['title'][:60]})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
