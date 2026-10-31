"""tests/test_entities.py: Automated tests for deterministic Critical Entities Extraction.
Validates dates/deadlines, fee/income classification, contact verification,
fine print detection, and cross-source discrepancy comparison.
"""
import sys
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.entities import extract_critical_entities, compare_entities_across_sources


def test_extract_deadlines_and_status():
    today = date(2024, 5, 1)
    text = (
        "Application opening date: 01/01/2024. "
        "Last Date for online submission: 15/04/2024. "
        "Extended Deadline: 31 May 2024."
    )
    res = extract_critical_entities(text, today=today, source_id="S1")
    deadlines = res["deadlines"]
    assert len(deadlines) >= 2

    # Check expired vs upcoming
    past_dl = [d for d in deadlines if "15/04/2024" in d["value"]]
    assert past_dl and past_dl[0]["status"] == "expired"

    future_dl = [d for d in deadlines if "31 May 2024" in d["value"]]
    assert future_dl and future_dl[0]["status"] == "upcoming"


def test_extract_money_classification():
    text = (
        "The application fee is Rs. 750 for general category. "
        "Annual family income must not exceed 2.5 Lakh per annum. "
        "Selected scholars will receive a stipend of Rs. 15,000 per month."
    )
    res = extract_critical_entities(text, source_id="S1")
    amounts = res["amounts"]
    cats = {a["category"] for a in amounts}
    assert "Application Fee" in cats
    assert "Income Limit" in cats
    assert "Stipend / Award" in cats


def test_extract_contacts_and_free_email_flag():
    text = (
        "For technical issues contact toll-free helpline 1800-345-6789. "
        "Official correspondence: desk@scholarship.gov.in. "
        "Unofficial coordinator: helpdesk.scholarship@gmail.com."
    )
    res = extract_critical_entities(text, source_id="S1")
    contacts = res["contacts"]

    # Phone
    phones = [c for c in contacts if c["type"] == "phone"]
    assert any("1800-345-6789" in p["value"] for p in phones)

    # Emails
    gov_mail = [c for c in contacts if "desk@scholarship.gov.in" in c["value"]]
    assert gov_mail and gov_mail[0]["is_official"] is True

    gmail = [c for c in contacts if "helpdesk.scholarship@gmail.com" in c["value"]]
    assert gmail and gmail[0]["is_official"] is False
    assert "Free Commercial Mail" in gmail[0]["badge"]


def test_extract_fine_print_trap_clauses():
    text = (
        "Note: Application fee once deposited is non-refundable under any circumstance. "
        "Candidates submitting forged marks will be summarily rejected and debarred."
    )
    res = extract_critical_entities(text, source_id="S1")
    clauses = res["fine_print"]
    assert any("Non-Refundable" in c["label"] for c in clauses)
    assert any("Rejection" in c["label"] for c in clauses)


def test_compare_entities_across_sources_discrepancies():
    today = date(2024, 4, 1)
    s1 = {
        "id": "S1",
        "title": "Portal A",
        "ok": True,
        "is_official": True,
        "text": (
            "Closing deadline: 30 April 2024. "
            "Application fee: Rs. 500. "
            "Family income limit: 2.5 Lakh. "
            "Age limit: 18 to 25 years."
        )
    }
    s2 = {
        "id": "S2",
        "title": "Portal B",
        "ok": True,
        "is_official": False,
        "text": (
            "Closing deadline: 31 July 2024. "
            "Application fee: Free of cost. "
            "Family income limit: 8 Lakh per annum. "
            "Age limit: 18 to 30 years."
        )
    }
    comparison = compare_entities_across_sources([s1, s2], today=today)
    assert comparison["has_discrepancies"] is True
    categories = [d["category"] for d in comparison["discrepancies"]]
    assert any("Deadline" in cat for cat in categories)
    assert any("Fee" in cat for cat in categories)
    assert any("Income Limit" in cat for cat in categories)
