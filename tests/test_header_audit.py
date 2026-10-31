"""tests/test_header_audit.py: Deterministic tests for HTTP Header Freshness and Domain Trust Audit.
"""
from datetime import date
from engine.header_audit import (
    audit_url_security_and_trust,
    audit_http_headers,
    perform_technical_audit,
)


def test_stale_last_modified_header_alert():
    """Verify that a Last-Modified header older than 2 years triggers the critical stale alert."""
    test_date = date(2026, 10, 31)
    raw_headers = {
        "Last-Modified": "Mon, 14 Feb 2022 12:00:00 GMT",
        "Server": "nginx/1.18.0",
        "Date": "Sat, 31 Oct 2026 09:00:00 GMT"
    }
    result = audit_http_headers("https://ssc.gov.in/notice", raw_headers, status_code=200, today=test_date)
    assert result["is_stale"] is True
    assert result["last_modified_date"] == "2022-02-14"
    assert "Feb 2022" in result["stale_alert"]
    assert "has not been updated since" in result["stale_alert"]


def test_fresh_last_modified_header():
    """Verify that a recent Last-Modified header is marked fresh without stale alert."""
    test_date = date(2026, 10, 31)
    raw_headers = {
        "Last-Modified": "Thu, 15 Oct 2026 08:30:00 GMT",
        "Server": "Cloudflare"
    }
    result = audit_http_headers("https://example.com/fresh", raw_headers, status_code=200, today=test_date)
    assert result["is_stale"] is False
    assert result["stale_alert"] is None
    assert result["age_days"] <= 30


def test_low_trust_domain_free_blog():
    """Verify that free weblog platforms (blogspot, wixsite, etc.) are flagged with Low Trust badge."""
    url = "https://scholarship-alerts.blogspot.com/2026/notice.html"
    res = audit_url_security_and_trust(url)
    assert res["trust_tier"] == "low_trust_free_host"
    assert res["trust_badge"] == "Low Trust Domain"
    assert res["trust_badge_color"] == "amber"
    assert any("free weblog" in w["message"].lower() for w in res["warnings"])


def test_low_trust_raw_ip_host():
    """Verify that raw IP hosts are flagged with high-severity scam risk."""
    url = "http://45.33.32.156/exam-admit-card.pdf"
    res = audit_url_security_and_trust(url)
    assert res["trust_tier"] == "low_trust_ip"
    assert "Raw IP" in res["trust_badge"]
    assert res["trust_badge_color"] == "red"
    assert res["is_https"] is False
    assert any("raw ip" in w["message"].lower() for w in res["warnings"])


def test_official_government_domain():
    """Verify that government domains (.gov.in) receive official trust tier and HTTPS validation."""
    url = "https://scholarships.gov.in/guidelines"
    res = audit_url_security_and_trust(url)
    assert res["trust_tier"] == "official_government"
    assert res["trust_badge"] == "Official Gov Domain"
    assert res["trust_badge_color"] == "green"
    assert res["is_https"] is True


def test_perform_technical_audit_complete_bundle():
    """Test full end-to-end technical audit dictionary output."""
    test_date = date(2026, 10, 31)
    url = "http://unverified-circulars.wixsite.com/neet"
    headers = {"Last-Modified": "Fri, 10 Sep 2021 14:00:00 GMT", "Server": "wix-fe"}
    
    audit = perform_technical_audit(url, raw_headers=headers, status_code=200, today=test_date)
    assert audit["is_url"] is True
    assert audit["is_https"] is False
    assert audit["is_stale"] is True
    assert audit["trust_badge"] == "Low Trust Domain"
    assert "Sep 2021" in audit["stale_alert"]
    assert len(audit["warnings"]) >= 2  # Insecure HTTP + Free host + Stale header
