"""checklist.py: AI Task 1. Generates the expected-information checklist.
Every checklist item is labelled 'ai_suggestion'. It frames questions, not facts.
"""
from .llm import call_llm_json

CHECKLIST_PROMPT = """TASK:CHECKLIST
You help a user research a topic thoroughly before taking action or making a decision.
Topic or question: {topic}

Generate 8 to 12 distinct pieces of information a careful person must know before acting on this topic.
Rules:
- Use only general knowledge about what such decisions usually require.
- Do NOT state any facts or answers about the specific topic. Only state what must be investigated.
- For each field, provide 3 to 6 lowercase search terms that are likely to appear on a page answering it.

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


def generate_checklist(topic: str):
    """Generate expected checklist fields for a given topic."""
    data = call_llm_json(CHECKLIST_PROMPT.format(topic=topic)) or {}
    if not isinstance(data, dict):
        data = {}
    fields = []
    
    raw_fields = data.get("fields", [])
    if not isinstance(raw_fields, list):
        raw_fields = []

    for f in raw_fields:
        if not isinstance(f, dict):
            continue
        key = str(f.get("key", "")).strip().lower()
        label = str(f.get("label", "")).strip()
        if not key or not label:
            continue
        
        importance = str(f.get("importance", "medium")).lower()
        if importance not in ("high", "medium", "low"):
            importance = "medium"
            
        search_terms = [str(t).strip().lower() for t in f.get("search_terms", []) if t][:6]
        
        fields.append({
            "key": key,
            "label": label,
            "why": str(f.get("why", "Important for a complete decision.")).strip(),
            "importance": importance,
            "search_terms": search_terms,
            "origin": "ai_suggestion"
        })

    if not fields:
        # Fallback to guaranteed baseline fields if model response is empty
        fields = [
            {"key": "eligibility_criteria", "label": "Eligibility criteria", "why": "Determines if applicant qualifies.", "importance": "high", "search_terms": ["eligible", "criteria", "qualification"], "origin": "ai_suggestion"},
            {"key": "application_deadline", "label": "Application deadline", "why": "Late applications are summarily rejected.", "importance": "high", "search_terms": ["deadline", "last date", "closing date"], "origin": "ai_suggestion"},
            {"key": "required_documents", "label": "Required documents", "why": "Missing paperwork delays or voids application.", "importance": "high", "search_terms": ["documents", "certificate", "proof"], "origin": "ai_suggestion"},
            {"key": "selection_process", "label": "Selection process", "why": "Clarifies evaluation criteria and stages.", "importance": "medium", "search_terms": ["selection", "merit", "exam", "interview"], "origin": "ai_suggestion"},
            {"key": "financial_terms", "label": "Financial terms & benefits", "why": "Essential to evaluate net benefit and obligations.", "importance": "medium", "search_terms": ["amount", "stipend", "fees", "cost"], "origin": "ai_suggestion"},
            {"key": "official_portal", "label": "Official submission portal", "why": "Avoids fraudulent websites and scams.", "importance": "high", "search_terms": ["portal", "official website", "apply online"], "origin": "ai_suggestion"}
        ]
        
    return fields
