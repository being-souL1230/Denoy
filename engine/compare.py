"""compare.py: AI Task 3. Pairwise comparison of verified findings.
Only triggered when two or more sources present differing values for the same field.
Bounds token costs by evaluating ONLY quotes, not full source texts.
"""
import itertools
from .llm import call_llm_json
from .verifier import _norm

COMPARE_PROMPT = """TASK:COMPARE
Two sources answer the same question: "{label}".
Source A ({a_title}): "{a_quote}"
Source B ({b_title}): "{b_quote}"

Judge ONLY from these two quotes. Return JSON only:
{{
  "relation": "same|conflict|different_scope|unclear",
  "explanation": "one clear sentence explaining the difference or agreement"
}}

Definitions:
- same: Both quotes convey the same factual meaning despite different wording.
- conflict: The quotes give contradictory, mutually exclusive facts, deadlines, or requirements.
- different_scope: Both can be true under different conditions (e.g. different applicant categories, year levels, or quotas).
- unclear: The evidence is insufficient to determine agreement or contradiction."""

MAX_PAIRS_PER_FIELD = 6


def find_conflicts(fields: list, findings: list, sources: list):
    """Detect possible contradictions between sources for each checklist field."""
    source_map = {s["id"]: s for s in sources}
    conflicts = []

    for f in fields:
        # Get all verified findings for this field
        group = [x for x in findings if x["field_key"] == f["key"]]
        if len(group) < 2:
            continue

        pairs = list(itertools.combinations(group, 2))[:MAX_PAIRS_PER_FIELD]
        for a, b in pairs:
            # Skip if normalized extracted values are identical
            if _norm(a.get("value", "")) == _norm(b.get("value", "")):
                continue

            src_a = source_map.get(a["source_id"], {})
            src_b = source_map.get(b["source_id"], {})

            # If b is marked official and a is not, swap so official is Source A
            if src_b.get("is_official") and not src_a.get("is_official"):
                a, b = b, a
                src_a, src_b = src_b, src_a

            title_a = src_a.get("title") or a["source_id"]
            if src_a.get("is_official"):
                title_a += " (Official)"

            title_b = src_b.get("title") or b["source_id"]
            if src_b.get("is_official"):
                title_b += " (Official)"

            res = call_llm_json(COMPARE_PROMPT.format(
                label=f["label"],
                a_title=title_a,
                a_quote=a.get("quote", ""),
                b_title=title_b,
                b_quote=b.get("quote", "")
            )) or {}
            if not isinstance(res, dict):
                res = {}

            relation = str(res.get("relation") or "unclear").lower().strip()
            if relation in ("conflict", "unclear", "different_scope"):
                conflicts.append({
                    "field_key": f["key"],
                    "label": f["label"],
                    "importance": f.get("importance", "medium"),
                    "relation": relation,
                    "explanation": res.get("explanation", "Potential variance detected between sources."),
                    "a": a,
                    "b": b,
                    "label_type": "uncertain" if relation == "unclear" else "sourced",
                })

    return conflicts
