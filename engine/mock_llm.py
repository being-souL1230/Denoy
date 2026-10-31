"""mock_llm.py: Offline stand-in for the AI so the entire pipeline can be tested
with zero network dependencies and zero API keys.
"""
import json
import re

SCHOLARSHIP_FIELDS = [
    {"key": "eligibility", "label": "Eligibility criteria", "why": "Decides if you can apply.", "importance": "high",
     "search_terms": ["eligible", "eligibility", "criteria", "must be", "minimum marks"]},
    {"key": "deadline", "label": "Application deadline", "why": "Late applications are rejected.", "importance": "high",
     "search_terms": ["deadline", "last date", "apply before", "closing date", "due date"]},
    {"key": "documents", "label": "Required documents", "why": "Missing papers delay approval.", "importance": "high",
     "search_terms": ["documents", "certificate", "marksheet", "proof", "salary slip", "aadhaar"]},
    {"key": "renewal", "label": "Renewal conditions", "why": "Funding may stop without renewal.", "importance": "medium",
     "search_terms": ["renewal", "renew", "continue", "next year", "subsequent years"]},
    {"key": "amount", "label": "Award amount", "why": "Needed to plan finances.", "importance": "medium",
     "search_terms": ["amount", "per year", "stipend", "rs.", "inr", "grant"]},
    {"key": "apply_link", "label": "Official application link", "why": "Avoid fake portals.", "importance": "high",
     "search_terms": ["apply online", "portal", "official website", "application form", "link"]},
]

GENERAL_FIELDS = [
    {"key": "eligibility_scope", "label": "Eligibility & Scope", "why": "Ensures you qualify under regulations.", "importance": "high",
     "search_terms": ["eligible", "who can", "scope", "applies to", "qualification"]},
    {"key": "key_dates", "label": "Important dates & Deadlines", "why": "Critical to avoid missing cutoff windows.", "importance": "high",
     "search_terms": ["date", "deadline", "timeline", "schedule", "window"]},
    {"key": "required_documents", "label": "Required documentation", "why": "Necessary for verification and approval.", "importance": "high",
     "search_terms": ["documents", "records", "identification", "proof", "forms"]},
    {"key": "financial_obligations", "label": "Fees or financial support", "why": "Determines cost and financial viability.", "importance": "medium",
     "search_terms": ["fee", "cost", "charge", "stipend", "payment", "amount"]},
    {"key": "renewal_compliance", "label": "Ongoing rules or renewal", "why": "Failure to comply leads to revocation.", "importance": "medium",
     "search_terms": ["renewal", "compliance", "validity", "annual", "audit"]},
    {"key": "official_authority", "label": "Official contact & portal", "why": "Only official sources can confirm binding terms.", "importance": "high",
     "search_terms": ["official", "portal", "contact", "department", "authority", "website"]},
]


def _sentences(text: str):
    # Splits by sentence end while preserving punctuation
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def mock_response(prompt: str) -> str:
    prompt = prompt.strip()

    # AI Task 1: Checklist Generation
    if prompt.startswith("TASK:CHECKLIST"):
        topic_match = re.search(r"Topic or question:\s*(.*)", prompt, re.I)
        topic = topic_match.group(1).lower() if topic_match else ""
        if any(w in topic for w in ["scholarship", "fellowship", "merit", "grant", "education", "student", "college"]):
            fields = SCHOLARSHIP_FIELDS
        else:
            fields = GENERAL_FIELDS
        return json.dumps({"fields": fields})

    # AI Task 2: Extraction per source
    if prompt.startswith("TASK:EXTRACT"):
        # Match the enclosed source data block at the end of the prompt
        all_blocks = re.findall(r"<(?:source|source_data)>\n?(.*?)\n?</(?:source|source_data)>", prompt, re.S)
        text = all_blocks[-1] if all_blocks else ""

        fields_match = re.search(r"Fields to (?:evaluate|look for):\s*(\[.*?\])", prompt, re.S)
        fields = json.loads(fields_match.group(1)) if fields_match else SCHOLARSHIP_FIELDS

        sentences = _sentences(text)
        out = {}

        # Known keywords per field key
        kw_map = {
            "eligibility": ["eligible", "eligibility", "criteria", "must be", "marks", "citizens"],
            "deadline": ["deadline", "last date", "apply before", "closing date"],
            "documents": ["documents", "certificate", "marksheet", "proof", "salary", "slip", "aadhaar"],
            "renewal": ["renewal", "renew", "continue"],
            "amount": ["amount", "stipend", "rs.", "inr", "per year"],
            "apply_link": ["apply online", "portal", "official website", "link"],
            "eligibility_scope": ["eligible", "scope", "qualification"],
            "key_dates": ["date", "deadline", "timeline"],
            "required_documents": ["document", "proof", "record"],
            "financial_obligations": ["fee", "cost", "amount", "stipend"],
            "renewal_compliance": ["renewal", "validity", "compliance"],
            "official_authority": ["official", "portal", "authority"],
        }

        for f in fields:
            k = f["key"]
            terms = kw_map.get(k, [k])
            hit = next((s for s in sentences if any(t in s.lower() for t in terms)), None)
            if hit:
                # Value is a short phrase, quote is the verbatim sentence
                val = hit[:100].strip()
                out[k] = {"status": "found", "value": val, "quote": hit}
            else:
                out[k] = {"status": "not_found", "value": None, "quote": None}

        return json.dumps({"results": out})

    # AI Task 3: Comparison between quotes
    if prompt.startswith("TASK:COMPARE"):
        # Check if quotes contain different numbers, dates, or documents
        q_a = re.search(r'Source A \([^)]+\): "([^"]+)"', prompt)
        q_b = re.search(r'Source B \([^)]+\): "([^"]+)"', prompt)
        text_a = q_a.group(1).lower() if q_a else ""
        text_b = q_b.group(1).lower() if q_b else ""

        if text_a == text_b:
            return json.dumps({"relation": "same", "explanation": "Both quotes convey identical information."})

        return json.dumps({
            "relation": "conflict",
            "explanation": "The sources report differing values or conflicting requirements."
        })

    return "{}"
