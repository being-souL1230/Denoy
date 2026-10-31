"""header_audit.py: Deterministic Server & HTTP Header Freshness Checker & URL Trust Audit.
Audits web-server headers (Last-Modified, Server, Date) and performs protocol/scam domain checks
with 0-token deterministic precision. Never uses AI to guess server freshness.
"""
import re
import ipaddress
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from typing import Optional, Dict, Any
from urllib.parse import urlparse

import requests
from dateutil import parser as date_parser

# High-risk / free hosting platforms frequently used for unverified circulars or phishing
FREE_BLOG_HOSTS = (
    "blogspot.com",
    "blogspot.in",
    "wordpress.com",
    "wixsite.com",
    "weebly.com",
    "site123.me",
    "carrd.co",
    "jimdosite.com",
    "tumblr.com",
    "medium.com",
    "webflow.io",
)

# TLDs frequently associated with disposable/free domains
ABUSED_FREE_TLDS = (".tk", ".ml", ".ga", ".cf", ".gq")

OFFICIAL_GOV_TLDS = (".gov.in", ".nic.in", ".gov", ".mil")
ACADEMIC_TLDS = (".ac.in", ".edu.in", ".edu")


def is_ip_host(hostname: str) -> bool:
    """Check if the given host string is a raw IPv4 or IPv6 address."""
    if not hostname:
        return False
    # Strip port if present
    clean_host = hostname.split(":")[0].strip("[]")
    try:
        ipaddress.ip_address(clean_host)
        return True
    except ValueError:
        return False


def parse_http_date(date_str: str) -> Optional[datetime]:
    """Parse standard HTTP-date formats (RFC 7231 / RFC 2822 / ISO)."""
    if not date_str:
        return None
    try:
        # Standard RFC 7231 HTTP-date (e.g., 'Wed, 21 Oct 2020 07:28:00 GMT')
        return parsedate_to_datetime(date_str)
    except Exception:
        pass

    try:
        # Fuzzy fallback parser
        return date_parser.parse(date_str, fuzzy=True)
    except Exception:
        return None


def audit_url_security_and_trust(url: str) -> Dict[str, Any]:
    """Audit URL protocol (HTTP vs HTTPS) and check for IP hosts or free-hosting scam risks."""
    if not url:
        return {
            "is_url": False,
            "is_https": False,
            "trust_tier": "unknown",
            "trust_badge": "Local Source",
            "trust_badge_color": "neutral",
            "domain": "",
            "warnings": [],
        }

    parsed = urlparse(url)
    scheme = (parsed.scheme or "http").lower()
    netloc = (parsed.netloc or "").lower()
    hostname = (parsed.hostname or netloc).lower()

    is_https = scheme == "https"
    warnings = []

    # 1. Transport Protocol Check
    if not is_https:
        warnings.append({
            "type": "insecure_transport",
            "severity": "medium",
            "message": "Insecure HTTP: Communication is unencrypted and vulnerable to tampering or sniffing."
        })

    # 2. Raw IP address check (Common scam/phishing indicator)
    if is_ip_host(hostname):
        trust_tier = "low_trust_ip"
        trust_badge = "Low Trust Domain (Raw IP)"
        trust_badge_color = "red"
        warnings.append({
            "type": "raw_ip_host",
            "severity": "critical",
            "message": f"Raw IP address host ({hostname}): Webpage lacks a verified domain name certificate. High scam risk."
        })
        return {
            "is_url": True,
            "is_https": is_https,
            "trust_tier": trust_tier,
            "trust_badge": trust_badge,
            "trust_badge_color": trust_badge_color,
            "domain": hostname,
            "is_ip": True,
            "warnings": warnings,
        }

    # 3. Free Weblog / Free Hosting / Disposable Domain Check
    is_free_blog = any(hostname == bh or hostname.endswith("." + bh) for bh in FREE_BLOG_HOSTS)
    is_free_tld = any(hostname.endswith(tld) for tld in ABUSED_FREE_TLDS)

    if is_free_blog or is_free_tld:
        trust_tier = "low_trust_free_host"
        trust_badge = "Low Trust Domain"
        trust_badge_color = "amber"
        platform_name = "free weblog / hosting" if is_free_blog else "free disposable TLD"
        warnings.append({
            "type": "low_trust_host",
            "severity": "high",
            "message": f"Hosted on a {platform_name} domain ({hostname}). Unofficial circulars and outdated summaries are frequent."
        })
        return {
            "is_url": True,
            "is_https": is_https,
            "trust_tier": trust_tier,
            "trust_badge": trust_badge,
            "trust_badge_color": trust_badge_color,
            "domain": hostname,
            "is_ip": False,
            "warnings": warnings,
        }

    # 4. Official Government Check
    if any(hostname.endswith(tld) or f".{tld}." in hostname for tld in OFFICIAL_GOV_TLDS):
        return {
            "is_url": True,
            "is_https": is_https,
            "trust_tier": "official_government",
            "trust_badge": "Official Gov Domain",
            "trust_badge_color": "green",
            "domain": hostname,
            "is_ip": False,
            "warnings": warnings,
        }

    # 5. Accredited Academic Institution Check
    if any(hostname.endswith(tld) for tld in ACADEMIC_TLDS):
        return {
            "is_url": True,
            "is_https": is_https,
            "trust_tier": "academic_institution",
            "trust_badge": "Academic Institution",
            "trust_badge_color": "blue",
            "domain": hostname,
            "is_ip": False,
            "warnings": warnings,
        }

    # 6. Standard Web Domain
    return {
        "is_url": True,
        "is_https": is_https,
        "trust_tier": "standard_web",
        "trust_badge": "Standard Web Domain",
        "trust_badge_color": "neutral",
        "domain": hostname,
        "is_ip": False,
        "warnings": warnings,
    }


def audit_http_headers(
    url: str,
    raw_headers: Optional[Dict[str, str]] = None,
    status_code: Optional[int] = None,
    today: Optional[date] = None
) -> Dict[str, Any]:
    """Audit server response headers for Last-Modified freshness and server identity."""
    today = today or date.today()
    headers = {k.lower(): v for k, v in (raw_headers or {}).items()}

    # If headers weren't supplied and URL is given, perform a lightweight HEAD request
    if not headers and url and url.startswith("http"):
        try:
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
            resp = requests.head(url, headers=req_headers, timeout=8, allow_redirects=True)
            status_code = resp.status_code
            headers = {k.lower(): v for k, v in resp.headers.items()}
        except Exception:
            pass

    last_modified_raw = headers.get("last-modified")
    date_header_raw = headers.get("date")
    server_header = headers.get("server") or "Unknown"
    content_type = headers.get("content-type") or ""

    last_modified_dt = parse_http_date(last_modified_raw)
    date_header_dt = parse_http_date(date_header_raw)

    is_stale = False
    stale_alert = None
    age_days = None
    last_modified_iso = None
    human_date = None

    if last_modified_dt:
        last_modified_date = last_modified_dt.date()
        last_modified_iso = last_modified_date.isoformat()
        human_date = last_modified_date.strftime("%d %b %Y")
        age_days = (today - last_modified_date).days

        # Rule: If page was last modified more than 2 years ago (730 days)
        if age_days >= 730:
            is_stale = True
            years_old = round(age_days / 365, 1)
            month_year = last_modified_date.strftime("%b %Y")
            stale_alert = f"⚠️ Server reports this webpage has not been updated since {month_year} (approx {years_old} years old)"
        elif age_days >= 365:
            is_stale = True
            month_year = last_modified_date.strftime("%b %Y")
            stale_alert = f"⚠️ Server reports this webpage has not been updated since {month_year} (over 1 year old)"

    return {
        "has_last_modified": bool(last_modified_dt),
        "last_modified_raw": last_modified_raw,
        "last_modified_date": last_modified_iso,
        "human_date": human_date,
        "age_days": age_days,
        "is_stale": is_stale,
        "stale_alert": stale_alert,
        "server": server_header,
        "date_header": date_header_raw,
        "content_type": content_type,
        "status_code": status_code,
    }


def perform_technical_audit(
    url: Optional[str],
    raw_headers: Optional[Dict[str, str]] = None,
    status_code: Optional[int] = None,
    today: Optional[date] = None
) -> Dict[str, Any]:
    """Execute complete deterministic technical and header audit for a source."""
    today = today or date.today()

    if not url or not url.startswith("http"):
        return {
            "is_url": False,
            "trust_tier": "local_document",
            "trust_badge": "Direct Document",
            "trust_badge_color": "neutral",
            "is_https": None,
            "domain": "",
            "is_ip": False,
            "is_stale": False,
            "stale_alert": None,
            "headers": {},
            "warnings": [],
            "status_code": 200,
        }

    trust_audit = audit_url_security_and_trust(url)
    header_audit = audit_http_headers(url, raw_headers, status_code, today=today)

    all_warnings = list(trust_audit.get("warnings", []))
    if header_audit.get("is_stale") and header_audit.get("stale_alert"):
        all_warnings.append({
            "type": "stale_server_header",
            "severity": "high",
            "message": header_audit["stale_alert"]
        })

    return {
        "is_url": True,
        "url": url,
        "domain": trust_audit["domain"],
        "is_https": trust_audit["is_https"],
        "is_ip": trust_audit["is_ip"],
        "trust_tier": trust_audit["trust_tier"],
        "trust_badge": trust_audit["trust_badge"],
        "trust_badge_color": trust_audit["trust_badge_color"],
        "is_stale": header_audit["is_stale"],
        "stale_alert": header_audit["stale_alert"],
        "last_modified": header_audit["last_modified_date"],
        "last_modified_human": header_audit["human_date"],
        "age_days": header_audit["age_days"],
        "server": header_audit["server"],
        "status_code": header_audit["status_code"],
        "warnings": all_warnings,
        "headers": {
            "last_modified": header_audit["last_modified_raw"],
            "server": header_audit["server"],
            "date": header_audit["date_header"],
        }
    }
