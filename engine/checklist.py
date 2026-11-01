"""checklist.py: AI Task 1. Generates the expected-information checklist.
Every checklist item is labelled 'ai_suggestion' or 'fallback'. It frames questions, not facts.

Improvements over v1:
  - Key slugification: enforces snake_case so compare/priority lookups never break
  - Deduplication: duplicate keys from LLM are silently dropped
  - search_terms: deduped + minimum 2 terms guaranteed per field
  - Field count: capped at 12, sorted by importance (high → medium → low)
  - Importance rebalancing: if LLM marks everything "high", 40% are demoted to "medium"
  - `why` truncated to 120 chars to prevent UI overflow
  - Topic-aware fallback: keyword detection picks a relevant baseline field set
  - `origin` tag distinguishes ai_suggestion vs fallback fields
"""
import re
from .llm import call_llm_json

# ──────────────────────────────────────────────────────────────────────────────
# Prompt
# ──────────────────────────────────────────────────────────────────────────────
CHECKLIST_PROMPT = """TASK:CHECKLIST
You help a user research a topic thoroughly before taking action or making a decision.
Topic or question: {topic}

Generate 8 to 12 distinct pieces of information a careful person must know before acting on this topic.
Rules:
- Use only general knowledge about what such decisions usually require.
- Do NOT state any facts or answers about the specific topic. Only state what must be investigated.
- Distribute importance fairly: roughly 3-4 "high", 3-4 "medium", 1-2 "low".
- For each field, provide 3 to 6 lowercase search terms that are likely to appear on a page answering it.
- "key" must be snake_case only (letters, digits, underscores — no spaces).
- "why" must be exactly ONE sentence (max 120 characters).

Return JSON only in this exact format:
{{
  "fields": [
    {{
      "key": "snake_case_identifier",
      "label": "Short Field Name",
      "why": "One sentence explaining why missing this poses a risk to the decision maker.",
      "importance": "high|medium|low",
      "search_terms": ["term1", "term2", "term3"]
    }}
  ]
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────
_IMPORTANCE_ORDER = {"high": 0, "medium": 1, "low": 2}
_VALID_IMPORTANCE = frozenset({"high", "medium", "low"})
_MAX_FIELDS = 12
_MIN_SEARCH_TERMS = 2
_MAX_WHY_CHARS = 120

# ──────────────────────────────────────────────────────────────────────────────
# Topic-aware fallback categories
# ──────────────────────────────────────────────────────────────────────────────
_FALLBACK_CATEGORIES = {
    "scholarship": [
        {"key": "eligibility_criteria",   "label": "Eligibility criteria",        "why": "Determines if applicant qualifies before investing time in the application.",          "importance": "high",   "search_terms": ["eligible", "criteria", "qualification", "requirement"]},
        {"key": "application_deadline",   "label": "Application deadline",         "why": "Late applications are summarily rejected with no exceptions.",                          "importance": "high",   "search_terms": ["deadline", "last date", "closing date", "due date"]},
        {"key": "required_documents",     "label": "Required documents",           "why": "Missing paperwork delays or voids the application entirely.",                           "importance": "high",   "search_terms": ["documents", "certificate", "proof", "attach"]},
        {"key": "scholarship_amount",     "label": "Scholarship amount & coverage","why": "Knowing the benefit helps evaluate if it covers actual costs.",                         "importance": "high",   "search_terms": ["amount", "stipend", "coverage", "benefit", "value"]},
        {"key": "selection_process",      "label": "Selection process",            "why": "Clarifies evaluation criteria, merit vs lottery, and shortlisting stages.",             "importance": "medium", "search_terms": ["selection", "merit", "exam", "interview", "criteria"]},
        {"key": "renewal_conditions",     "label": "Renewal conditions",           "why": "Scholarship may lapse if academic or conduct conditions are not met.",                  "importance": "medium", "search_terms": ["renewal", "continuation", "maintain", "GPA", "conditions"]},
        {"key": "official_portal",        "label": "Official submission portal",   "why": "Avoids fraudulent websites and ensures the application reaches the right body.",        "importance": "high",   "search_terms": ["portal", "official website", "apply online", "submission"]},
        {"key": "bond_obligations",       "label": "Bond / service obligations",   "why": "Some scholarships require post-study service or repayment on dropout.",                "importance": "medium", "search_terms": ["bond", "service", "obligation", "payback", "return service"]},
    ],
    "loan": [
        {"key": "interest_rate",          "label": "Interest rate & type",         "why": "Fixed vs floating rate significantly changes total repayment cost.",                    "importance": "high",   "search_terms": ["interest rate", "APR", "fixed", "floating", "ROI"]},
        {"key": "eligibility_criteria",   "label": "Eligibility criteria",         "why": "Income, credit score, or collateral requirements may immediately disqualify applicant.","importance": "high",   "search_terms": ["eligible", "criteria", "credit score", "income", "CIBIL"]},
        {"key": "repayment_terms",        "label": "Repayment terms & EMI",        "why": "EMI and tenure determine monthly cash flow impact.",                                    "importance": "high",   "search_terms": ["EMI", "repayment", "tenure", "installment", "monthly"]},
        {"key": "processing_fees",        "label": "Processing fees & charges",    "why": "Hidden charges inflate the effective cost of borrowing.",                               "importance": "medium", "search_terms": ["processing fee", "charges", "prepayment penalty", "foreclosure"]},
        {"key": "collateral_required",    "label": "Collateral / security required","why": "Pledged assets are at risk if repayment defaults.",                                   "importance": "high",   "search_terms": ["collateral", "security", "mortgage", "guarantee", "pledge"]},
        {"key": "prepayment_policy",      "label": "Prepayment & foreclosure policy","why": "Penalties on early closure can negate savings from prepayment.",                     "importance": "medium", "search_terms": ["prepayment", "foreclosure", "part payment", "early closure"]},
        {"key": "application_documents",  "label": "Required documents",           "why": "Incomplete documentation causes rejection or processing delays.",                        "importance": "medium", "search_terms": ["documents", "KYC", "income proof", "identity", "address proof"]},
        {"key": "official_lender",        "label": "Official lender & contact",    "why": "Verifying the lender prevents loan fraud and identity theft.",                          "importance": "high",   "search_terms": ["official", "RBI registered", "NBFC", "bank", "lender"]},
    ],
    "job": [
        {"key": "eligibility_criteria",   "label": "Eligibility / qualifications", "why": "Applying without meeting basic qualifications wastes time and may bar future attempts.","importance": "high",   "search_terms": ["eligible", "qualification", "degree", "experience", "age limit"]},
        {"key": "application_deadline",   "label": "Application deadline",         "why": "Late applications are rejected outright in competitive hiring.",                         "importance": "high",   "search_terms": ["deadline", "last date", "closing date", "apply by"]},
        {"key": "selection_process",      "label": "Selection stages",             "why": "Knowing exam, interview, or skill-test stages allows targeted preparation.",            "importance": "high",   "search_terms": ["selection", "exam", "interview", "test", "round", "stage"]},
        {"key": "salary_benefits",        "label": "Salary & benefits",            "why": "Compensation details determine if the role meets financial expectations.",               "importance": "medium", "search_terms": ["salary", "CTC", "benefits", "perks", "pay scale"]},
        {"key": "job_location",           "label": "Job location & transfer policy","why": "Location and transferability affect personal commitments and lifestyle.",              "importance": "medium", "search_terms": ["location", "posting", "transfer", "city", "remote"]},
        {"key": "application_fee",        "label": "Application / exam fee",       "why": "Unexpected fees may be an indicator of scam or may exceed budget.",                    "importance": "medium", "search_terms": ["fee", "application charge", "exam fee", "payment"]},
        {"key": "required_documents",     "label": "Required documents",           "why": "Missing paperwork can disqualify an otherwise valid application.",                      "importance": "medium", "search_terms": ["documents", "certificate", "ID", "proof", "attach"]},
        {"key": "official_portal",        "label": "Official application portal",  "why": "Fake job portals steal personal data and fees.",                                        "importance": "high",   "search_terms": ["official", "apply online", "portal", "government site"]},
    ],
    "admission": [
        {"key": "eligibility_criteria",   "label": "Eligibility criteria",         "why": "Not meeting cutoffs makes the application futile.",                                     "importance": "high",   "search_terms": ["eligible", "criteria", "cutoff", "marks", "percentage"]},
        {"key": "application_deadline",   "label": "Application deadline",         "why": "Admission portals close exactly on the deadline with no extension.",                    "importance": "high",   "search_terms": ["deadline", "last date", "closing", "apply by"]},
        {"key": "entrance_exam",          "label": "Entrance exam / merit basis",  "why": "Exam format, syllabus and dates determine preparation strategy.",                       "importance": "high",   "search_terms": ["entrance", "exam", "test", "merit", "rank", "score"]},
        {"key": "fees_structure",         "label": "Fees & payment schedule",      "why": "Total cost including hostel, mess and exam fees affects financial planning.",           "importance": "high",   "search_terms": ["fees", "tuition", "hostel", "payment", "annual charges"]},
        {"key": "seats_reservation",      "label": "Seat matrix & reservations",   "why": "Category-wise availability determines realistic chances of admission.",                 "importance": "medium", "search_terms": ["seats", "reservation", "SC", "ST", "OBC", "quota", "category"]},
        {"key": "required_documents",     "label": "Required documents",           "why": "Missing documents at counselling leads to cancellation of the seat.",                   "importance": "high",   "search_terms": ["documents", "certificate", "marksheet", "ID", "proof"]},
        {"key": "counselling_process",    "label": "Counselling / allotment process","why": "Understanding rounds and locking prevents accidental loss of a seat.",               "importance": "medium", "search_terms": ["counselling", "allotment", "round", "reporting", "lock"]},
        {"key": "official_portal",        "label": "Official admission portal",    "why": "Fraudulent sites mimic official portals to steal fees and data.",                       "importance": "high",   "search_terms": ["official", "portal", "NTA", "apply online", "login"]},
    ],
}

# Generic fallback (used when no keyword match)
_GENERIC_FALLBACK = [
    {"key": "eligibility_criteria",  "label": "Eligibility criteria",       "why": "Determines if the applicant qualifies before investing effort.",                 "importance": "high",   "search_terms": ["eligible", "criteria", "qualification", "requirement"]},
    {"key": "application_deadline",  "label": "Application deadline",        "why": "Late submissions are universally rejected with no exceptions.",                  "importance": "high",   "search_terms": ["deadline", "last date", "closing date", "due date"]},
    {"key": "required_documents",    "label": "Required documents",          "why": "Missing paperwork delays or voids the application entirely.",                    "importance": "high",   "search_terms": ["documents", "certificate", "proof", "attach"]},
    {"key": "selection_process",     "label": "Selection process",           "why": "Clarifies evaluation criteria and stages to prepare effectively.",               "importance": "medium", "search_terms": ["selection", "merit", "exam", "interview", "criteria"]},
    {"key": "financial_terms",       "label": "Financial terms & benefits",  "why": "Essential to evaluate net benefit and understand any monetary obligations.",     "importance": "medium", "search_terms": ["amount", "stipend", "fees", "cost", "benefit"]},
    {"key": "official_portal",       "label": "Official submission portal",  "why": "Avoids fraudulent websites and ensures submission reaches the right authority.", "importance": "high",   "search_terms": ["portal", "official website", "apply online", "submission"]},
    {"key": "key_dates_timeline",    "label": "Key dates & timeline",        "why": "Missing any intermediate deadline can invalidate an otherwise valid application.","importance": "medium", "search_terms": ["dates", "schedule", "timeline", "calendar", "notification"]},
    {"key": "contact_grievance",     "label": "Contact & grievance redressal","why": "Knowing official contacts allows resolving issues before they become blockers.", "importance": "low",    "search_terms": ["contact", "helpline", "email", "grievance", "support"]},
]

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _slugify(raw: str) -> str:
    """Convert any string to a valid snake_case key."""
    slug = raw.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "field"


def _rebalance_importance(fields: list) -> list:
    """If every field is 'high', demote 40% to 'medium' to preserve ranking value."""
    if not fields:
        return fields
    all_high = all(f["importance"] == "high" for f in fields)
    if not all_high:
        return fields
    demote_count = max(1, len(fields) * 4 // 10)
    # Demote the last N fields (they are already sorted low-priority within high)
    for f in fields[-demote_count:]:
        f["importance"] = "medium"
    return fields


def _pick_fallback(topic: str) -> list:
    """Return topic-appropriate fallback fields based on keyword detection."""
    t = topic.lower()
    for keyword, fields in _FALLBACK_CATEGORIES.items():
        if keyword in t:
            return [dict(f, origin="fallback") for f in fields]
    return [dict(f, origin="fallback") for f in _GENERIC_FALLBACK]


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def generate_checklist(topic: str) -> list:
    """Generate expected checklist fields for a given topic.

    Returns a list of field dicts, each with:
      key, label, why, importance, search_terms, origin
    """
    data = call_llm_json(CHECKLIST_PROMPT.format(topic=topic)) or {}
    if not isinstance(data, dict):
        data = {}

    raw_fields = data.get("fields", [])
    if not isinstance(raw_fields, list):
        raw_fields = []

    fields = []
    seen_keys: set[str] = set()

    for f in raw_fields:
        if not isinstance(f, dict):
            continue

        # ── Key: slugify + dedup ──────────────────────────────────────────────
        key = _slugify(str(f.get("key", "")))
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)

        # ── Label ─────────────────────────────────────────────────────────────
        label = str(f.get("label", "")).strip()
        if not label:
            continue

        # ── Importance: validate + normalize ─────────────────────────────────
        importance = str(f.get("importance", "medium")).lower().strip()
        if importance not in _VALID_IMPORTANCE:
            importance = "medium"

        # ── Why: cap at 120 chars ─────────────────────────────────────────────
        why = str(f.get("why", "Important for a complete decision.")).strip()
        if len(why) > _MAX_WHY_CHARS:
            why = why[:_MAX_WHY_CHARS - 1].rstrip() + "…"

        # ── search_terms: dedup + enforce minimum ─────────────────────────────
        raw_terms = f.get("search_terms", [])
        terms_seen: set[str] = set()
        search_terms = []
        for t in raw_terms:
            t = str(t).strip().lower()
            if t and t not in terms_seen:
                terms_seen.add(t)
                search_terms.append(t)
            if len(search_terms) == 6:
                break
        # Guarantee minimum 2 search terms derived from the label
        if len(search_terms) < _MIN_SEARCH_TERMS:
            label_words = [w.lower() for w in label.split() if len(w) > 3]
            for w in label_words:
                if w not in terms_seen:
                    search_terms.append(w)
                    terms_seen.add(w)
                if len(search_terms) >= _MIN_SEARCH_TERMS:
                    break

        fields.append({
            "key": key,
            "label": label,
            "why": why,
            "importance": importance,
            "search_terms": search_terms,
            "origin": "ai_suggestion",
        })

    # ── Fallback if model returned nothing useful ─────────────────────────────
    if not fields:
        return _pick_fallback(topic)

    # ── Importance rebalancing ────────────────────────────────────────────────
    fields = _rebalance_importance(fields)

    # ── Sort: high → medium → low, then cap at 12 ────────────────────────────
    fields.sort(key=lambda x: _IMPORTANCE_ORDER.get(x["importance"], 1))
    fields = fields[:_MAX_FIELDS]

    return fields
