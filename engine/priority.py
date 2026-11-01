"""priority.py: Prioritizes all detected knowledge gaps and contradictions into a single actionable checklist.
Transforms gaps, conflicts, outdated signals, and uncertain findings into an ordered,
ranked list of what to verify next (P1, P2, P3).
"""
IMPORTANCE_SCORES = {"high": 3.0, "medium": 2.0, "low": 1.0}
ISSUE_BONUS = {
    "conflict": 2.0,
    "outdated": 1.5,
    "gap": 1.0,
    "uncertain": 0.5
}


def _priority_bucket(score: float) -> str:
    if score >= 4.5:
        return "P1"
    if score >= 3.0:
        return "P2"
    return "P3"


def build_verify_list(fields: list, gaps: list, conflicts: list, outdated: list, uncertain: list):
    """Compile and score items to produce an ordered verify-next checklist."""
    by_key = {f["key"]: f for f in fields}
    items = []

    # 1. Gaps (Missing information)
    for g in gaps:
        f = by_key.get(g["field_key"])
        if not f:
            continue
        score = IMPORTANCE_SCORES.get(f["importance"], 2.0) + ISSUE_BONUS["gap"]
        items.append({
            "type": "gap",
            "score": score,
            "field": f["label"],
            "action": f"Verify '{f['label']}' on the official source. It was not found in any of the reviewed sources."
        })

    # 2. Conflicts (Contradictions between sources)
    seen_conflicts = set()
    for c in conflicts:
        fk = c["field_key"]
        if fk in seen_conflicts:
            continue  # One actionable item per field, even if multiple pairs disagree
        seen_conflicts.add(fk)
        
        score = IMPORTANCE_SCORES.get(c["importance"], 2.0) + ISSUE_BONUS["conflict"]
        items.append({
            "type": "conflict",
            "score": score,
            "field": c["label"],
            "action": f"Resolve contradiction for '{c['label']}'. Sources provide conflicting details; verify against the official notice."
        })

    # 3. Outdated warnings (Stale dates or expired cycles)
    merged_outdated = {}
    for o in outdated:
        sid = o["source_id"]
        if sid in merged_outdated:
            merged_outdated[sid]["reason"] += " " + o["reason"]
            if o["severity"] == "high":
                merged_outdated[sid]["severity"] = "high"
        else:
            merged_outdated[sid] = dict(o)

    for o in merged_outdated.values():
        base = 3.0 if o["severity"] == "high" else 1.0
        score = base + ISSUE_BONUS["outdated"] - 1.0
        items.append({
            "type": "outdated",
            "score": score,
            "field": o["title"],
            "action": f"Confirm freshness of '{o['title']}'. {o['reason']}"
        })

    # 4. Uncertain findings (Quote verification failures or possible misses)
    seen_uncertain = set()
    for u in uncertain:
        key = (u["field_key"], u["reason"])
        if key in seen_uncertain:
            continue
        seen_uncertain.add(key)
        
        f = by_key.get(u["field_key"])
        if not f:
            continue
        score = IMPORTANCE_SCORES.get(f["importance"], 2.0) + ISSUE_BONUS["uncertain"]
        
        if u["reason"] == "quote_not_found_in_source":
            act = f"Manually verify '{f['label']}' in source {u['source_id']}. The extracted answer could not be verified mechanically in the text."
        else:
            act = f"Review source {u['source_id']} for '{f['label']}'. The page mentions related terms although no direct answer was confirmed."
            
        items.append({
            "type": "uncertain",
            "score": score,
            "field": f["label"],
            "action": act
        })

    # Sort descending by score
    items.sort(key=lambda x: -x["score"])

    # Assign 1-indexed ranks and priority buckets (P1, P2, P3)
    for rank, it in enumerate(items, 1):
        it["rank"] = rank
        it["priority"] = _priority_bucket(it["score"])

    return items
