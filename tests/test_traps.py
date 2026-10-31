"""tests/test_traps.py: Automated tests for Fine Print and Trap Clauses Scanner.
Validates disqualification detection, financial bond/penalty alerts, hidden discretionary terms,
and highlighted sentence extraction.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.traps import scan_trap_clauses, scan_all_sources_for_traps


def test_trap_scanner_disqualification_clauses():
    text = (
        "Instructions: Candidates must verify their eligibility. "
        "Canvassing in any form is strictly prohibited and the applicant will be debarred. "
        "Incomplete applications will be summarily rejected without correspondence."
    )
    res = scan_trap_clauses(text, source_id="S1", source_title="Official Circular")
    assert res["has_traps"] is True
    assert res["total_count"] >= 2
    categories = [c["category"] for c in res["clauses"]]
    assert "Disqualification / Rejection" in categories
    assert res["critical_count"] >= 1
    assert "Critical Warning" in res["alert_text"]


def test_trap_scanner_financial_bond_clauses():
    text = (
        "The application fee once submitted is non-refundable. "
        "Selected officers must execute a service bond for 3 years, failing which a penalty of Rs. 2,00,000 shall apply."
    )
    res = scan_trap_clauses(text, source_id="S1")
    assert res["has_traps"] is True
    categories = [c["category"] for c in res["clauses"]]
    assert "Financial Risk / Bond" in categories
    matched_terms = [c["matched_term"].lower() for c in res["clauses"]]
    assert any("non-refundable" in t for t in matched_terms)
    assert any("service bond" in t or "penalty of" in t for t in matched_terms)


def test_trap_scanner_hidden_conditions_discretionary():
    text = (
        "The grant of fellowship is strictly subject to fund availability and at the sole discretion of the committee. "
        "The department reserves the right to cancel or modify vacancies without prior notice."
    )
    res = scan_trap_clauses(text, source_id="S1")
    assert res["has_traps"] is True
    categories = [c["category"] for c in res["clauses"]]
    assert "Hidden Conditions / Discretionary" in categories


def test_trap_scanner_highlighted_mark():
    text = "Note: Submission of false data is strictly prohibited."
    res = scan_trap_clauses(text, source_id="S1")
    assert res["total_count"] == 1
    clause = res["clauses"][0]
    assert "<mark class=\"trap-mark" in clause["highlighted_sentence"]
    assert "strictly prohibited" in clause["highlighted_sentence"]


def test_scan_all_sources_for_traps():
    sources = [
        {
            "id": "S1",
            "title": "Govt Circular",
            "ok": True,
            "text": "The fee is non-refundable. Forms will be summarily rejected if unsigned.",
        },
        {
            "id": "S2",
            "title": "Help Blog",
            "ok": True,
            "text": "General overview and tips for applicants.",
        },
    ]
    res = scan_all_sources_for_traps(sources)
    assert res["has_traps"] is True
    assert res["total_traps_found"] >= 2
    assert res["by_source"]["S1"]["total_count"] >= 2
    assert res["by_source"]["S2"]["total_count"] == 0
