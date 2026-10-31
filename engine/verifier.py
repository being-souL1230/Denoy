"""verifier.py: The mechanical trust layer.
Code, NOT AI, verifies that every claimed quote actually exists in the source text.
If verification fails, the claim is demoted to 'Uncertain' and is NEVER presented as a fact.
"""
import difflib
import re


def _norm(s: str) -> str:
    """Normalize text by converting smart quotes to ASCII, collapsing whitespace, and lowercasing."""
    if not s:
        return ""
    s = s.lower()
    replacements = (
        ("\u2019", "'"),
        ("\u2018", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u2013", "-"),
        ("\u2014", "-"),
        ("`", "'"),
    )
    for a, b in replacements:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def verify_quote(quote: str, source_text: str, threshold: float = 0.88):
    """Mechanically verify that quote exists in source_text.
    
    Returns:
        (verdict, canonical_quote)
        verdict: 'exact' | 'fuzzy' | 'failed'
        canonical_quote: exact slice from source_text (for clean UI/terminal highlighting)
    """
    if not quote or not source_text:
        return "failed", None

    q = _norm(quote)
    t = _norm(source_text)

    # Minimum length requirement: single words or short tokens cannot constitute evidence
    if len(q) < 8:
        return "failed", None

    # 1. Exact match in normalized text
    idx = t.find(q)
    if idx >= 0:
        # If source text is already single-space clean, extract direct slice
        slice_candidate = source_text[idx: idx + len(q)]
        if _norm(slice_candidate) == q:
            return "exact", slice_candidate
        
        # In case raw source_text had irregular spacing, locate using regex
        words = [re.escape(w) for w in q.split()]
        pattern = r"\s+".join(words)
        m = re.search(pattern, source_text, re.IGNORECASE)
        if m:
            return "exact", m.group(0)

        return "exact", quote

    # 2. Fuzzy match with sliding window
    step = max(8, len(q) // 4)
    best_score = 0.0
    best_slice = None

    for i in range(0, max(1, len(t) - len(q) + 1), step):
        window = t[i: i + len(q)]
        sm = difflib.SequenceMatcher(None, q, window, autojunk=False)
        if sm.real_quick_ratio() < threshold or sm.quick_ratio() < threshold:
            continue
        score = sm.ratio()
        if score > best_score:
            best_score = score
            best_slice = window

    if best_score >= threshold and best_slice:
        # Locate closest slice in original text
        words = [re.escape(w) for w in best_slice.split()[:4]]
        if words:
            pattern = r"\s+".join(words)
            m = re.search(pattern, source_text, re.IGNORECASE)
            if m:
                start = m.start()
                raw_candidate = source_text[start: start + len(best_slice) + 10]
                return "fuzzy", raw_candidate.strip()
        return "fuzzy", best_slice

    return "failed", None
