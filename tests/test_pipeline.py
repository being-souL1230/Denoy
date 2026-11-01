"""tests/test_pipeline.py: Automated tests for Denoy.
Validates the mechanical trust layer, gap detection, contradiction detection,
outdated signals, and prioritization algorithms against the Section 14 Testing Checklist.
"""
import sys
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from engine import (
    build_source, source_from_text,
    check_findings, check_sources,
    run_analysis,
    build_verify_list,
    verify_quote,
)


def test_quote_verifier_exact():
    source_text = "Eligibility criteria: applicants must be Indian citizens with at least 75% marks in Class 12."
    quote = "applicants must be Indian citizens with at least 75% marks in Class 12."
    verdict, canonical = verify_quote(quote, source_text)
    assert verdict == "exact"
    assert canonical == quote


def test_quote_verifier_smart_quotes_and_spacing():
    source_text = "The award amount is “Rs. 50,000 per year” for tuition."
    quote = 'The award amount is "Rs. 50,000 per year" for tuition.'
    verdict, canonical = verify_quote(quote, source_text)
    assert verdict in ("exact", "fuzzy")
    assert canonical is not None


def test_fabricated_quote_rejected():
    """Test 1 from Build Guide: Fabricated quote is rejected and never treated as Sourced."""
    source_text = "Merit Scholarship is open for high school seniors."
    fake_quote = "All applicants will receive an unconditional grant of Rs. 100,000."
    verdict, canonical = verify_quote(fake_quote, source_text)
    assert verdict == "failed"
    assert canonical is None


def test_outdated_cycle_detection():
    """Test 5 from Build Guide: Old academic cycle is flagged as high severity."""
    today = date(2026, 10, 30)
    source = build_source(
        source_id="S1",
        url=None,
        title="Old Blog",
        text="The scholarship for 2022-23 cycle is now open.",
        kind="pasted"
    )
    flags = check_sources([source], today=today)
    assert any(f["severity"] == "high" and "2022-23" in f["reason"] for f in flags)


def test_undated_source_flagged():
    """Test 6 from Build Guide: Undated source gets a low severity note."""
    today = date(2026, 10, 30)
    source = build_source(
        source_id="S2",
        url=None,
        title="Undated Aggregator",
        text="Apply for the scholarship on the website.",
        kind="pasted"
    )
    flags = check_sources([source], today=today)
    assert any(f["severity"] == "low" and "freshness cannot be verified" in f["reason"] for f in flags)


def test_stale_deadline_detection():
    """Deadlines referencing past calendar years are flagged as high severity."""
    today = date(2026, 10, 30)
    finding = {
        "field_key": "deadline",
        "label": "Application deadline",
        "source_id": "S1",
        "value": "Last date to apply is 31 March 2023."
    }
    flags = check_findings([finding], today=today)
    assert len(flags) == 1
    assert flags[0]["severity"] == "high"
    assert "2023" in flags[0]["reason"]


def test_priority_ranking_order():
    """Test 8: High-importance conflicts rank above lower-priority gaps."""
    fields = [
        {"key": "deadline", "label": "Application deadline", "importance": "high"},
        {"key": "renewal", "label": "Renewal conditions", "importance": "medium"},
    ]
    gaps = [{"field_key": "renewal", "label": "Renewal conditions"}]
    conflicts = [{
        "field_key": "deadline",
        "label": "Application deadline",
        "importance": "high",
        "relation": "conflict"
    }]
    
    items = build_verify_list(fields, gaps, conflicts, outdated=[], uncertain=[])
    assert len(items) == 2
    # Conflict on high field (3.0 + 2.0 = 5.0) ranks higher than gap on medium field (2.0 + 1.0 = 3.0)
    assert items[0]["type"] == "conflict"
    assert items[0]["priority"] == "P1"
    assert items[1]["type"] == "gap"
    assert items[1]["priority"] == "P2"


def test_full_pipeline_mock_run(monkeypatch):
    """End-to-end integration test with sample scholarship files."""
    monkeypatch.setenv("MOCK_LLM", "1")
    sample_dir = Path("tests/sample_sources")
    files = [
        (str(sample_dir / "official_page.txt"), True),
        (str(sample_dir / "blog_post.txt"), False),
        (str(sample_dir / "aggregator.txt"), False),
    ]

    res = run_analysis("Merit Scholarship", files=tuple(files))

    # Verify complete data contract structure
    assert "topic" in res
    assert "run_date" in res
    assert "disclaimer" in res
    assert "checklist" in res
    assert "sources" in res
    assert "findings" in res
    assert "gaps" in res
    assert "conflicts" in res
    assert "outdated" in res
    assert "uncertain" in res
    assert "verify_next" in res
    assert "stats" in res

    # Verify stats
    assert res["stats"]["sources_used"] == 3
    assert res["stats"]["gaps"] >= 1
    # Renewal must be among gaps
    gap_labels = [g["label"].lower() for g in res["gaps"]]
    assert any("renewal" in g for g in gap_labels)

    # Verify conflicts exist
    assert len(res["conflicts"]) > 0

    # Verify ranking
    assert len(res["verify_next"]) > 0
    assert res["verify_next"][0]["rank"] == 1


def test_json_resilient_parsing():
    """Ensure llm._parse_json strips code fences and handles markdown formatting."""
    from engine import _parse_json
    raw_markdown = "```json\n{\"fields\": [{\"key\": \"eligibility\", \"label\": \"Eligibility\"}]}\n```"
    parsed = _parse_json(raw_markdown)
    assert parsed is not None
    assert "fields" in parsed
    assert parsed["fields"][0]["key"] == "eligibility"


def test_groq_config_defaults():
    """Verify default Groq configuration points to high-speed Llama model."""
    from engine import llm
    assert llm.DEFAULT_GROQ_MODEL in ("openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b")

    assert "groq.com" in llm.GROQ_BASE_URL


def test_pipeline_technical_audit_contract():
    """Verify that run_analysis includes technical_audit in the report contract."""
    res = run_analysis(
        topic="Scholarship Eligibility Guidelines",
        pasted=[
            ("Circular 1", "Eligibility: 60% minimum aggregate marks. Aadhaar verification mandatory."),
            ("Circular 2", "Eligibility: 75% minimum marks. Non-refundable fee.")
        ]
    )
    assert "technical_audit" in res
    assert "by_source" in res["technical_audit"]
    assert "has_stale_headers" in res["technical_audit"]
    assert "stats" in res
    assert "stale_headers_detected" in res["stats"]
    assert "low_trust_domains_detected" in res["stats"]



