"""entities.py: Pure deterministic extraction of critical entities without AI.
Identifies deadlines, monetary amounts/fees, eligibility percentages, age criteria,
official helplines/emails, and fine-print trap clauses using fast regex and heuristic rules.
Provides side-by-side comparative views and automated discrepancy detection.
"""
import re
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple, Any
from dateutil import parser as date_parser

# Common Free Webmail Domains that indicate unofficial contacts
FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com",
    "hotmail.com", "rediffmail.com", "aol.com", "zoho.com", "mail.com", "proton.me", "protonmail.com"
}

# Date regexes
DATE_PATTERNS = [
    # 31st March 2024, 15 April 2024, 5 Jan 24
    re.compile(r"\b(\d{1,2}(?:st|nd|rd|th)?[\s/\-\.](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s/\-\.]\d{2,4})\b", re.I),
    # March 31, 2024 or April 15, 2024
    re.compile(r"\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s]+(?:\d{1,2}(?:st|nd|rd|th)?)[,\s]+(?:\d{4}))\b", re.I),
    # 31/03/2024 or 31-03-2024 or 31.03.2024
    re.compile(r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.](?:20\d{2}|\d{2}))\b"),
    # 2024-03-31
    re.compile(r"\b(20\d{2}[/\-\.]\d{1,2}[/\-\.]\d{1,2})\b"),
]

DEADLINE_HINTS = re.compile(
    r"(last\s+date|deadline|closing\s+date|closing|apply\s+(?:before|by|on)|due\s+date|end\s+date|extended\s+(?:till|to|upto)|valid\s+(?:till|to|upto)|commenc(?:es?|ing)|opening\s+date)",
    re.I
)

# Money / Currency regexes
MONEY_PATTERNS = [
    # ₹ 500, Rs. 2,500, INR 1000, $50
    re.compile(r"(?:₹|Rs\.?|INR|\$|USD)\s*[\d,]+(?:\.\d+)?(?:\s*(?:lakh|lac|crore|thousand|per\s*(?:month|annum|year|yr)))?", re.I),
    # 2.5 Lakh, 8 Lacs, 10 Crore
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:lakh|lac|crore|thousand)s?(?:\s*(?:rupees|inr|per\s*(?:month|annum|year|yr)))?\b", re.I),
    # Free / Nil fee
    re.compile(r"\b(?:free\s+of\s+cost|no\s+application\s+fee|fee\s+exempt(?:ed)?|nil\s+fee|zero\s+fee)\b", re.I),
]

# Percentages & CGPA
SCORE_PATTERNS = [
    re.compile(r"\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:marks|aggregate|in\s*(?:class|graduation|10th|12th)|minimum)?\b", re.I),
    re.compile(r"\b(?:min(?:imum)?|at\s*least)\s*(\d{1,2}(?:\.\d+)?%)\b", re.I),
    re.compile(r"\b(?:cgpa|gpa|grade\s*point)\s*(?:of\s*)?(\d(?:\.\d+)?)\s*(?:/\s*10|on\s*(?:a\s*)?10(?:\s*point)?\s*scale)?\b", re.I),
]

# Age patterns
AGE_PATTERNS = [
    re.compile(r"\b(?:age\s*(?:limit|criteria)?|aged?)\s*[:\-]?\s*(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*years\b", re.I),
    re.compile(r"\bbetween\s+(\d{1,2})\s*(?:to|and|-)\s*(\d{1,2})\s*years\b", re.I),
    re.compile(r"\b(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\s*years\s*(?:of\s*age)?\b", re.I),
    re.compile(r"\b(?:min(?:imum)?\s*age|maximum\s*age|not\s*exceeding)\s*[:\-]?\s*(\d{1,2})\s*years\b", re.I),
    re.compile(r"\b(?:upper\s*age\s*limit)\s*[:\-]?\s*(\d{1,2})\s*years\b", re.I),
]

# Contacts
PHONE_PATTERN = re.compile(r"(?:1800[\s\-]*\d{3}[\s\-]*\d{3,4}|\b(?:\+91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}\b|\b0\d{2,4}[\s\-]?\d{6,8}\b)")
EMAIL_PATTERN = re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b")

# Fine print / trap clauses
FINE_PRINT_PATTERNS = [
    (re.compile(r"\b(?:non[\s\-]*refundable|no\s+refund|not\s+be\s+refunded)\b", re.I), "Non-Refundable Fee", "Financial Risk"),
    (re.compile(r"\b(?:summarily\s+rejected|will\s+be\s+rejected|liable\s+to\s+rejection|cancelled\s+without\s+notice)\b", re.I), "Rejection / Disqualification Risk", "Disqualification"),
    (re.compile(r"\b(?:service\s+bond|penalty\s+of|liquidated\s+damages|surety\s+bond)\b", re.I), "Service Bond / Penalty Clause", "Obligation"),
    (re.compile(r"\b(?:subject\s+to\s+(?:fund\s+)?availability|at\s+(?:the\s+)?sole\s+discretion|without\s+assigning\s+any\s+reason)\b", re.I), "Discretionary / No Guarantee Clause", "Fine Print"),
]


def extract_context_snippet(text: str, start: int, end: int, window: int = 70) -> str:
    """Extract a clean readable sentence or snippet around a match index."""
    s_start = max(0, start - window)
    s_end = min(len(text), end + window)
    snippet = text[s_start:s_end].strip()
    
    # Try to trim to word boundaries
    if s_start > 0 and " " in snippet[:20]:
        snippet = snippet[snippet.find(" ") + 1:]
    if s_end < len(text) and " " in snippet[-20:]:
        snippet = snippet[:snippet.rfind(" ")]
    return re.sub(r"\s+", " ", snippet)


def parse_potential_date(date_str: str) -> Tuple[Optional[str], Optional[datetime]]:
    """Safely parse date string into ISO format and datetime object."""
    cleaned = re.sub(r"(\d+)(?:st|nd|rd|th)", r"\1", date_str, flags=re.I)
    try:
        dt = date_parser.parse(cleaned, fuzzy=True, dayfirst=True)
        if 2000 <= dt.year <= 2035:
            return dt.strftime("%Y-%m-%d"), dt
    except (ValueError, OverflowError, TypeError):
        pass
    return None, None


def classify_money_context(raw: str, match_start: int, full_text: str) -> str:
    """Precisely classify monetary value based on surrounding prefix and suffix context."""
    raw_low = raw.lower()
    if any(k in raw_low for k in ("free", "nil", "zero fee")):
        return "Application Fee"

    # Restrict prefix to current sentence/clause to avoid bleeding from previous sentences
    full_prefix = full_text[max(0, match_start - 60):match_start]
    clauses = re.split(r"[.\n;•|]", full_prefix)
    prefix = clauses[-1].lower() if clauses else full_prefix.lower()

    full_suffix = full_text[match_start:match_start + len(raw) + 40]
    s_clauses = re.split(r"[.\n;•|]", full_suffix)
    suffix = s_clauses[0].lower() if s_clauses else full_suffix.lower()

    kw_positions = {}
    for kw in ("income", "salary", "family", "turnover", "earning", "annual"):
        pos = prefix.rfind(kw)
        if pos != -1:
            kw_positions["Income Limit"] = max(kw_positions.get("Income Limit", -1), pos)

    for kw in ("fee", "cost", "charge", "payment", "application"):
        pos = prefix.rfind(kw)
        if pos != -1:
            kw_positions["Application Fee"] = max(kw_positions.get("Application Fee", -1), pos)

    for kw in ("stipend", "scholarship", "fellowship", "award", "grant", "allowance"):
        pos = prefix.rfind(kw)
        if pos != -1:
            kw_positions["Stipend / Award"] = max(kw_positions.get("Stipend / Award", -1), pos)

    if kw_positions:
        return max(kw_positions.items(), key=lambda x: x[1])[0]

    if any(k in suffix for k in ("income", "salary", "turnover")):
        return "Income Limit"
    if any(k in suffix for k in ("fee", "charge")):
        return "Application Fee"
    if any(k in suffix for k in ("stipend", "scholarship")):
        return "Stipend / Award"

    return "Monetary Amount"


def extract_critical_entities(text: str, today: Optional[date] = None, source_id: str = "") -> Dict[str, Any]:
    """Extract all critical entities from text without using AI."""
    today = today or date.today()
    clean = re.sub(r"\s+", " ", text or "")

    results: Dict[str, Any] = {
        "source_id": source_id,
        "deadlines": [],
        "amounts": [],
        "eligibility": [],
        "contacts": [],
        "fine_print": [],
    }

    # 1. Deadlines and Dates
    found_dates = set()
    for pat in DATE_PATTERNS:
        for match in pat.finditer(clean):
            raw = match.group(0).strip()
            if raw in found_dates:
                continue
            
            snippet = extract_context_snippet(clean, match.start(), match.end())
            is_deadline_context = bool(DEADLINE_HINTS.search(snippet))
            
            iso_str, dt_obj = parse_potential_date(raw)
            if not dt_obj:
                continue

            found_dates.add(raw)
            parsed_date = dt_obj.date()
            
            if parsed_date < today:
                status = "expired"
            elif parsed_date >= today:
                status = "upcoming"
            else:
                status = "active"

            results["deadlines"].append({
                "value": raw,
                "iso": iso_str,
                "status": status,
                "is_deadline": is_deadline_context,
                "context": "Deadline / Milestone" if is_deadline_context else "Date Mentioned",
                "snippet": snippet,
            })

    # 2. Money / Fees / Incomes
    found_money = set()
    for pat in MONEY_PATTERNS:
        for match in pat.finditer(clean):
            raw = match.group(0).strip()
            if raw.lower() in found_money:
                continue
            found_money.add(raw.lower())

            snippet = extract_context_snippet(clean, match.start(), match.end())
            cat = classify_money_context(raw, match.start(), clean)

            results["amounts"].append({
                "value": raw,
                "category": cat,
                "snippet": snippet,
            })

    # 3. Eligibility (Percentages, CGPA, Age)
    found_el = set()
    for pat in SCORE_PATTERNS:
        for match in pat.finditer(clean):
            raw = match.group(0).strip()
            if raw in found_el:
                continue
            found_el.add(raw)
            snippet = extract_context_snippet(clean, match.start(), match.end())
            results["eligibility"].append({
                "type": "Score / Marks",
                "value": raw,
                "snippet": snippet,
            })

    for pat in AGE_PATTERNS:
        for match in pat.finditer(clean):
            raw = match.group(0).strip()
            if raw in found_el:
                continue
            found_el.add(raw)
            snippet = extract_context_snippet(clean, match.start(), match.end())
            results["eligibility"].append({
                "type": "Age Requirement",
                "value": raw,
                "snippet": snippet,
            })

    # 4. Contacts (Phone, Email)
    found_contacts = set()
    for match in PHONE_PATTERN.finditer(clean):
        raw = match.group(0).strip()
        clean_num = re.sub(r"\D", "", raw)
        if len(clean_num) < 7 or clean_num.startswith("202"):
            continue
        if raw in found_contacts:
            continue
        found_contacts.add(raw)
        snippet = extract_context_snippet(clean, match.start(), match.end(), window=50)
        is_toll_free = "1800" in raw
        results["contacts"].append({
            "type": "phone",
            "value": raw,
            "badge": "Toll-Free Helpline" if is_toll_free else "Phone / Helpline",
            "is_official": is_toll_free or ("helpline" in snippet.lower() or "contact" in snippet.lower()),
            "snippet": snippet,
        })

    for match in EMAIL_PATTERN.finditer(clean):
        raw = match.group(0).strip().lower()
        if raw in found_contacts:
            continue
        found_contacts.add(raw)
        domain = raw.split("@")[-1]
        is_free_mail = domain in FREE_EMAIL_DOMAINS
        snippet = extract_context_snippet(clean, match.start(), match.end(), window=50)
        results["contacts"].append({
            "type": "email",
            "value": raw,
            "badge": "⚠️ Free Commercial Mail (Check Authority)" if is_free_mail else "Official Domain Email",
            "is_official": not is_free_mail,
            "snippet": snippet,
        })

    # 5. Trap Clauses & Fine Print
    found_clauses = set()
    for pat, label, cat in FINE_PRINT_PATTERNS:
        for match in pat.finditer(clean):
            raw = match.group(0).strip()
            if raw.lower() in found_clauses:
                continue
            found_clauses.add(raw.lower())
            snippet = extract_context_snippet(clean, match.start(), match.end(), window=80)
            results["fine_print"].append({
                "label": label,
                "category": cat,
                "matched_text": raw,
                "snippet": snippet,
            })

    # Sort & cap
    for k in ("deadlines", "amounts", "eligibility", "contacts", "fine_print"):
        results[k] = results[k][:8]

    return results


def compare_entities_across_sources(sources: List[Dict[str, Any]], today: Optional[date] = None) -> Dict[str, Any]:
    """Compare extracted critical entities across multiple sources and detect direct discrepancies."""
    today = today or date.today()
    by_source: Dict[str, Any] = {}
    
    for s in sources:
        if not s.get("ok"):
            continue
        sid = s["id"]
        title = s.get("title") or sid
        extracted = extract_critical_entities(s.get("text", ""), today=today, source_id=sid)
        extracted["title"] = title
        extracted["is_official"] = s.get("is_official", False)
        by_source[sid] = extracted

    discrepancies: List[Dict[str, Any]] = []
    source_ids = list(by_source.keys())

    if len(source_ids) >= 2:
        for i in range(len(source_ids)):
            for j in range(i + 1, len(source_ids)):
                s1_id, s2_id = source_ids[i], source_ids[j]
                e1, e2 = by_source[s1_id], by_source[s2_id]

                # 1. Compare Deadlines
                d1_deadlines = [d for d in e1["deadlines"] if d.get("is_deadline")]
                d2_deadlines = [d for d in e2["deadlines"] if d.get("is_deadline")]
                if d1_deadlines and d2_deadlines:
                    v1 = d1_deadlines[0]
                    v2 = d2_deadlines[0]
                    if v1.get("iso") and v2.get("iso") and v1["iso"] != v2["iso"]:
                        discrepancies.append({
                            "category": "Deadline / Date Discrepancy",
                            "severity": "high",
                            "sources": [s1_id, s2_id],
                            "detail": f"{e1['title']} states deadline '{v1['value']}' while {e2['title']} states '{v2['value']}'.",
                            "a": {"source": s1_id, "source_id": s1_id, "title": e1["title"], "value": v1["value"], "snippet": v1["snippet"], "status": v1.get("status")},
                            "b": {"source": s2_id, "source_id": s2_id, "title": e2["title"], "value": v2["value"], "snippet": v2["snippet"], "status": v2.get("status")},
                        })

                # 2. Compare Categorized Amounts (Fee, Income Limit, Stipend)
                def get_cat_map(items):
                    m = {}
                    for item in items:
                        c = item["category"]
                        if c not in m:
                            m[c] = item
                    return m

                m1_map = get_cat_map(e1["amounts"])
                m2_map = get_cat_map(e2["amounts"])

                for cat in ("Application Fee", "Income Limit", "Stipend / Award"):
                    if cat in m1_map and cat in m2_map:
                        v1 = m1_map[cat]
                        v2 = m2_map[cat]
                        c1 = v1["value"].lower().replace(" ", "").replace(",", "")
                        c2 = v2["value"].lower().replace(" ", "").replace(",", "")
                        if c1 != c2:
                            discrepancies.append({
                                "category": f"{cat} Variance",
                                "severity": "high" if cat == "Income Limit" else "medium",
                                "sources": [s1_id, s2_id],
                                "detail": f"{e1['title']} states {cat} as '{v1['value']}', whereas {e2['title']} states '{v2['value']}'.",
                                "a": {"source": s1_id, "source_id": s1_id, "title": e1["title"], "value": v1["value"], "snippet": v1["snippet"]},
                                "b": {"source": s2_id, "source_id": s2_id, "title": e2["title"], "value": v2["value"], "snippet": v2["snippet"]},
                            })

                # 3. Compare Age Criteria
                age1 = [el for el in e1["eligibility"] if el["type"] == "Age Requirement"]
                age2 = [el for el in e2["eligibility"] if el["type"] == "Age Requirement"]
                if age1 and age2:
                    v1 = age1[0]
                    v2 = age2[0]
                    if v1["value"].lower().replace(" ", "") != v2["value"].lower().replace(" ", ""):
                        discrepancies.append({
                            "category": "Age Requirement Variance",
                            "severity": "medium",
                            "sources": [s1_id, s2_id],
                            "detail": f"{e1['title']} requires age '{v1['value']}' while {e2['title']} states '{v2['value']}'.",
                            "a": {"source": s1_id, "source_id": s1_id, "title": e1["title"], "value": v1["value"], "snippet": v1["snippet"]},
                            "b": {"source": s2_id, "source_id": s2_id, "title": e2["title"], "value": v2["value"], "snippet": v2["snippet"]},
                        })

    return {
        "by_source": by_source,
        "discrepancies": discrepancies,
        "total_sources_evaluated": len(by_source),
        "has_discrepancies": len(discrepancies) > 0,
    }
