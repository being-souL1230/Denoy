"""traps.py: Deterministic rule-based dictionary scanner for Fine Print and Trap Clauses.
Detects disqualification terms, financial bonds/penalties, hidden discretionary conditions,
and procedural traps across circulars and notices without using AI.
"""
import re
from typing import Dict, List, Any, Optional

TRAP_RULES = [
    {
        "category": "Disqualification / Rejection",
        "severity": "critical",
        "badge_color": "#b91c1c",
        "badge_bg": "#faeaeb",
        "tip": "Strict disqualification condition. Ensure full compliance to avoid outright cancellation.",
        "patterns": [
            r"\bstrictly\s+prohibited\b",
            r"\bapplication\s+(?:will|shall)\s+be\s+rejected\b",
            r"\bsummarily\s+rejected\b",
            r"\bliable\s+to\s+(?:be\s+)?rejected\b",
            r"\binvalid\s+without\b",
            r"\bdebarred\b",
            r"\bwill\s+be\s+debarred\b",
            r"\bcancellation\s+of\s+candidature\b",
            r"\bincomplete\s+applications?\b",
            r"\bgrounds\s+for\s+rejection\b",
            r"\bwill\s+lead\s+to\s+(?:immediate\s+)?disqualification\b",
            r"\bfurnishing\s+false\s+(?:information|documents)\b",
            r"\bno\s+correspondence\s+(?:will|shall)\s+be\s+entertained\b",
        ],
    },
    {
        "category": "Financial Risk / Bond",
        "severity": "high",
        "badge_color": "#c2410c",
        "badge_bg": "#fff7ed",
        "tip": "Financial commitment or liability. Fees are non-recoverable or tied to penalties/bonds.",
        "patterns": [
            r"\bnon[\s\-]*refundable\b",
            r"\bno\s+refund\b",
            r"\bnot\s+be\s+refunded\b",
            r"\bpenalty\s+of\b",
            r"\bservice\s+bond\b",
            r"\bsurety\s+bond\b",
            r"\bmandatory\s+service\b",
            r"\bforfeited\b",
            r"\bforfeiture\s+of\b",
            r"\bliquidated\s+damages\b",
            r"\bfinancial\s+liability\b",
            r"\bliable\s+to\s+pay\b",
        ],
    },
    {
        "category": "Hidden Conditions / Discretionary",
        "severity": "medium",
        "badge_color": "#b45309",
        "badge_bg": "#fefce8",
        "tip": "Discretionary fine print. The authority may alter, reduce, or revoke benefits without liability.",
        "patterns": [
            r"\bsubject\s+to\s+(?:fund\s+)?availability\b",
            r"\bat\s+(?:the\s+)?sole\s+discretion\b",
            r"\bwithout\s+prior\s+notice\b",
            r"\bwithout\s+assigning\s+any\s+reason\b",
            r"\breserves?\s+the\s+right\s+to\s+(?:cancel|alter|modify|withdraw)\b",
            r"\bno\s+claim\s+(?:will|shall)\s+be\s+entertained\b",
            r"\bsubject\s+to\s+change\s+(?:without\s+notice)?\b",
            r"\bdecision\s+of\s+the\s+(?:committee|authority|management)\s+shall\s+be\s+final\b",
        ],
    },
    {
        "category": "Strict Procedural Traps",
        "severity": "high",
        "badge_color": "#7c2d12",
        "badge_bg": "#fef2f2",
        "tip": "Strict procedural deadline or submission trap. Missing this causes immediate invalidation.",
        "patterns": [
            r"\blate\s+applications?\s+(?:will|shall)\s+not\s+be\s+(?:considered|entertained|accepted)\b",
            r"\breceived\s+after\s+(?:the\s+)?due\s+date\b",
            r"\bno\s+extension\s+(?:of\s+date\s+)?(?:will|shall)\s+be\s+granted\b",
            r"\bhard\s+copy\s+must\s+reach\b",
            r"\bno\s+(?:online\s+)?correction\s+window\b",
            r"\bcannot\s+be\s+edited\s+after\s+submission\b",
            r"\bno\s+offline\s+applications?\b",
        ],
    },
]

# Compile patterns for fast scanning
COMPILED_RULES = [
    {
        "category": r["category"],
        "severity": r["severity"],
        "badge_color": r["badge_color"],
        "badge_bg": r["badge_bg"],
        "tip": r["tip"],
        "regexes": [re.compile(p, re.I) for p in r["patterns"]],
    }
    for r in TRAP_RULES
]


def split_sentences_safely(text: str) -> List[str]:
    """Split text into sentences while protecting abbreviations like Rs., Dr., No., e.g."""
    if not text:
        return []
    # Temporarily shield common dotted terms
    protected = re.sub(
        r"\b(Rs|No|Dr|Prof|Mr|Mrs|Ms|vs|e\.g|i\.e|Govt|Dept|Sec|Vol)\.\s*",
        r"\1_PROTECTED_DOT_ ",
        text,
        flags=re.I,
    )
    # Split on sentence boundaries
    raw_chunks = re.split(r"(?<=[.!?\n])\s+", protected)
    sentences = []
    for s in raw_chunks:
        clean = s.replace("_PROTECTED_DOT_", ".").strip()
        clean = re.sub(r"\s+", " ", clean)
        if len(clean) >= 10:
            sentences.append(clean)
    return sentences


def scan_trap_clauses(text: str, source_id: str = "", source_title: str = "") -> Dict[str, Any]:
    """Scan a source text for high-risk trap clauses and fine print."""
    sentences = split_sentences_safely(text)
    detected_clauses = []
    seen_sentences = set()

    for s in sentences:
        low_sentence = s.lower()
        for rule in COMPILED_RULES:
            matched = False
            for rx in rule["regexes"]:
                m = rx.search(s)
                if m:
                    # Avoid duplicate sentence matches
                    sig = s.lower()
                    if sig in seen_sentences:
                        matched = True
                        break
                    seen_sentences.add(sig)

                    matched_term = m.group(0)
                    # Highlight the exact phrase within the sentence
                    start, end = m.span()
                    highlighted_sentence = (
                        s[:start]
                        + f'<mark class="trap-mark trap-mark-{rule["severity"]}">'
                        + s[start:end]
                        + "</mark>"
                        + s[end:]
                    )

                    detected_clauses.append({
                        "category": rule["category"],
                        "severity": rule["severity"],
                        "badge_color": rule["badge_color"],
                        "badge_bg": rule["badge_bg"],
                        "matched_term": matched_term,
                        "sentence": s,
                        "highlighted_sentence": highlighted_sentence,
                        "tip": rule["tip"],
                    })
                    matched = True
                    break
            if matched:
                break

    total = len(detected_clauses)
    critical_count = sum(1 for c in detected_clauses if c["severity"] == "critical")
    high_count = sum(1 for c in detected_clauses if c["severity"] == "high")

    alert_text = (
        f"{total} Critical Warning{'s' if total != 1 else ''} / Trap Clause{'s' if total != 1 else ''} detected in this document"
        if total > 0
        else "No critical fine print or trap clauses detected"
    )

    return {
        "source_id": source_id,
        "source_title": source_title or source_id,
        "total_count": total,
        "critical_count": critical_count,
        "high_count": high_count,
        "alert_text": alert_text,
        "has_traps": total > 0,
        "clauses": detected_clauses,
    }


def scan_all_sources_for_traps(sources: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Scan all ingested sources and return source-by-source trap analysis."""
    by_source: Dict[str, Any] = {}
    total_traps = 0
    total_critical = 0

    for s in sources:
        if not s.get("ok"):
            continue
        sid = s["id"]
        title = s.get("title") or sid
        text = s.get("text", "")
        analysis = scan_trap_clauses(text, source_id=sid, source_title=title)
        by_source[sid] = analysis
        total_traps += analysis["total_count"]
        total_critical += analysis["critical_count"]

    return {
        "by_source": by_source,
        "total_traps_found": total_traps,
        "total_critical_found": total_critical,
        "has_traps": total_traps > 0,
    }
