"""fetcher.py: Turns URLs, local files, and pasted text into clean source records.
Extracts dates, academic cycles, and clean readable text using pure deterministic code.
"""
import io
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Tuple

import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
MAX_CHARS = 25000

META_DATE_KEYS = [
    ("property", "article:modified_time"),
    ("property", "og:updated_time"),
    ("property", "article:published_time"),
    ("name", "last-modified"),
    ("name", "date"),
    ("itemprop", "dateModified"),
    ("itemprop", "datePublished"),
    ("name", "pubdate"),
    ("name", "DC.date.issued"),
]

UPDATED_RE = re.compile(
    r"(?:last\s+updated|updated\s+on|published\s+on|posted\s+on|effective\s+date|dated)\s*[:\-]?\s*([0-9A-Za-z ,./-]{6,25})",
    re.I,
)

CYCLE_RE = re.compile(r"\b(20\d{2})\s*[-/–]\s*(\d{2}|20\d{2})\b")


def clean_text(s: str) -> str:
    """Collapse whitespace into clean single spaces."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def parse_date(s: str):
    """Safely parse a date string into an ISO YYYY-MM-DD date."""
    if not s:
        return None
    try:
        d = date_parser.parse(s, fuzzy=True, dayfirst=True)
    except (ValueError, OverflowError, TypeError):
        return None
    now_year = datetime.now().year
    if 2000 <= d.year <= now_year + 2:
        return d.date().isoformat()
    return None


def find_cycles(text: str):
    """Return sorted start years of academic/fiscal cycles like 2024-25 or 2024/2025."""
    years = set()
    for m in CYCLE_RE.finditer(text):
        start_yr = int(m.group(1))
        end_str = m.group(2)
        end_val = int(end_str) if len(end_str) == 4 else (start_yr // 100) * 100 + int(end_str)
        if end_val == start_yr + 1:
            years.add(start_yr)
    return sorted(years)


def find_date_in_text(text: str):
    """Search for textual update notices in the document body."""
    m = UPDATED_RE.search(text)
    if m:
        d = parse_date(m.group(1))
        if d:
            snippet = clean_text(m.group(0))[:45]
            return d, f"text: '{snippet}'"
    return None, None


def score_source_credibility(url: Optional[str], text: str, date_str: Optional[str], kind: str, user_official: bool = False):
    """Deterministic, zero-token source credibility and trust scoring."""
    score = 0
    flags = []
    authority_tier = "standard"
    is_official_inferred = user_official
    domain = ""

    if url:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        # 1. SSL / Protocol verification (+15 pts)
        if parsed.scheme == "https":
            score += 15
            flags.append("Secure HTTPS encrypted transport (+15)")
        else:
            flags.append("Insecure HTTP unencrypted transport (+0)")

        # 2. Domain Authority Heuristics
        blog_hosts = ("blogspot.com", "wordpress.com", "medium.com", "wixsite.com", "tumblr.com", "weebly.com")

        if any(domain.endswith(tld) or f".{tld}." in domain for tld in (".gov.in", ".nic.in", ".gov")):
            score += 45
            is_official_inferred = True
            authority_tier = "official_government"
            flags.append(f"Official Government Top-Level Domain ({domain}) (+45)")
        elif any(domain.endswith(tld) for tld in (".ac.in", ".edu.in", ".edu")):
            score += 40
            authority_tier = "academic_institution"
            flags.append(f"Accredited Academic Institution Domain ({domain}) (+40)")
        elif any(domain.endswith(tld) for tld in (".org",)):
            score += 25
            authority_tier = "registered_organization"
            flags.append(f"Non-Profit / Registered Organization ({domain}) (+25)")
        elif any(bh in domain for bh in blog_hosts):
            score += 10
            authority_tier = "commercial_blog"
            flags.append(f"Third-Party Free Weblog Host ({domain}) (+10)")
        else:
            score += 20
            authority_tier = "general_web"
            flags.append(f"General Web Publication ({domain}) (+20)")

    elif kind in ("file", "pdf"):
        score += 35
        authority_tier = "uploaded_document"
        flags.append("Direct Document / PDF Upload (+35)")
    else:  # pasted text
        score += 25
        authority_tier = "pasted_text"
        flags.append("Direct Circular / Document Text Ingestion (+25)")

    if user_official and authority_tier != "official_government":
        score += 20
        flags.append("User Designated as Official Source (+20)")

    # 3. Verifiable Publication Date Presence (+20 pts)
    if date_str:
        score += 20
        flags.append("Verifiable publication / update timestamp detected (+20)")
    else:
        flags.append("No publication timestamp detected (+0)")

    # 4. Content Depth & Corpus Comprehensiveness (+20 pts)
    word_count = len(text.split())
    if word_count >= 300:
        score += 20
        flags.append(f"Comprehensive documentation depth ({word_count} words) (+20)")
    elif word_count >= 100:
        score += 12
        flags.append(f"Moderate content depth ({word_count} words) (+12)")
    else:
        score += 5
        flags.append(f"Brief excerpt ({word_count} words) (+5)")

    score = min(100, max(0, score))

    if score >= 75:
        badge_label = "High Authority"
        badge_class = "badge-high-trust"
    elif score >= 45:
        badge_label = "Moderate Trust"
        badge_class = "badge-med-trust"
    else:
        badge_label = "Third-Party / Low Trust"
        badge_class = "badge-low-trust"

    return {
        "score": score,
        "tier": authority_tier,
        "badge_label": badge_label,
        "badge_class": badge_class,
        "flags": flags,
        "domain": domain,
        "word_count": word_count,
        "is_official_inferred": is_official_inferred,
    }


def build_source(source_id: str, url: Optional[str], title: str, text: str,
                 date: Optional[str] = None, date_source: Optional[str] = None, kind: str = "url",
                 is_official: bool = False):
    """Construct a standardized source dictionary with deterministic credibility audit."""
    text = clean_text(text)
    truncated = len(text) > MAX_CHARS
    text = text[:MAX_CHARS]

    if not date:
        date, date_source = find_date_in_text(text)

    credibility = score_source_credibility(url, text, date, kind, is_official)

    return {
        "id": source_id,
        "url": url,
        "title": title or source_id,
        "kind": kind,
        "is_official": credibility["is_official_inferred"],
        "credibility": credibility,
        "ok": True,
        "text": text,
        "truncated": truncated,
        "date": date,
        "date_source": date_source,
        "cycles": find_cycles(text),
    }



def source_from_text(source_id: str, label: str, text: str, is_official: bool = False):
    """Source created from pasted text."""
    return build_source(source_id, None, label, text, kind="pasted", is_official=is_official)


def source_from_file(source_id: str, file_path: str, is_official: bool = False):
    """Source created from local file (txt, md, pdf)."""
    p = Path(file_path)
    if not p.exists():
        return {"id": source_id, "url": str(p), "ok": False, "error": f"File not found: {file_path}"}

    ext = p.suffix.lower()
    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(p))
            extracted = " ".join((page.extract_text() or "") for page in reader.pages)
            return build_source(source_id, str(p), p.name, extracted, kind="pdf", is_official=is_official)
        except Exception as e:
            return {"id": source_id, "url": str(p), "ok": False, "error": f"PDF parse error: {e}"}

    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return build_source(source_id, str(p), p.name, content, kind="file", is_official=is_official)
    except Exception as e:
        return {"id": source_id, "url": str(p), "ok": False, "error": f"File read error: {e}"}


def render_with_headless_browser(url: str, timeout: int = 15) -> Optional[str]:
    """Execute JavaScript and return fully rendered DOM using system Chrome/Chromium/Firefox."""
    chrome_bin = (
        shutil.which("google-chrome")
        or shutil.which("chromium")
        or shutil.which("chromium-browser")
        or shutil.which("firefox")
    )
    if not chrome_bin:
        return None
    try:
        if "firefox" in chrome_bin:
            cmd = [chrome_bin, "--headless", "--dump-dom", url]
        else:
            cmd = [
                chrome_bin,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--virtual-time-budget=5000",
                "--dump-dom",
                url
            ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode == 0 and len(proc.stdout) > 200:
            return proc.stdout
    except Exception:
        pass
    return None


def fetch_url(url: str, source_id: str, is_official: bool = False):
    """Fetch and parse a webpage or remote PDF with automatic dynamic/SPA JS rendering."""
    raw_html = None

    # Step 1: Fast HTTP GET attempt
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            ctype = r.headers.get("Content-Type", "").lower()
            if "pdf" in ctype or url.lower().split("?")[0].endswith(".pdf"):
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(io.BytesIO(r.content))
                    text = " ".join((page.extract_text() or "") for page in reader.pages)
                    return build_source(source_id, url, url.split("/")[-1] or url, text, kind="pdf", is_official=is_official)
                except Exception as e:
                    return {"id": source_id, "url": url, "ok": False, "error": f"PDF read failed: {e}"}
            raw_html = r.text
    except Exception:
        raw_html = None

    # Step 2: Check if static HTML contains sufficient content
    soup = None
    if raw_html:
        soup = BeautifulSoup(raw_html, "html.parser")
        for t in soup(["script", "style", "noscript"]):
            t.decompose()
        static_preview = clean_text(soup.get_text(" "))
        # If static HTML is empty/SPA skeleton (< 150 chars), discard and use headless browser
        if len(static_preview) < 150:
            soup = None

    # Step 3: Dynamic fallback via headless Chrome for SPAs / JS apps (Angular, React, Vue, Next.js)
    if not soup:
        rendered_html = render_with_headless_browser(url)
        if rendered_html:
            soup = BeautifulSoup(rendered_html, "html.parser")
            for t in soup(["script", "style", "noscript"]):
                t.decompose()

    if not soup:
        return {
            "id": source_id,
            "url": url,
            "ok": False,
            "error": f"Could not retrieve readable text from {url}. Check URL or network availability."
        }

    title = clean_text(soup.title.get_text()) if soup.title else url

    # Extract dates from meta tags
    date, date_source = None, None
    for attr, key in META_DATE_KEYS:
        tag = soup.find("meta", attrs={attr: key})
        if tag and tag.get("content"):
            d = parse_date(tag["content"])
            if d:
                date, date_source = d, f"meta:{key}"
                break

    # Strip pure navigation chrome while preserving content
    for t in soup(["nav", "footer", "aside"]):
        t.decompose()

    text = clean_text(soup.get_text(" "))
    if len(text) < 80:
        return {
            "id": source_id,
            "url": url,
            "ok": False,
            "error": f"Page at {url} contains insufficient text to evaluate information gaps."
        }

    return build_source(source_id, url, title, text, date, date_source, kind="url", is_official=is_official)

