"""pipeline.py: The 10-stage execution pipeline for Digital Dark Spot.
Orchestrates AI extraction, deterministic code verification, conflict comparison,
outdated signals, and prioritized verify-next ranking into a unified data contract.
"""
from datetime import date
from typing import Callable, Optional

from .checklist import generate_checklist
from .compare import find_conflicts
from .extractor import extract_from_source
from .fetcher import fetch_url, source_from_text, source_from_file
from .outdated import check_findings, check_sources
from .priority import build_verify_list
from .verifier import verify_quote
from .entities import compare_entities_across_sources
from .traps import scan_all_sources_for_traps

DISCLAIMER = (
    "This tool identifies potential information gaps, variances, and outdated signals "
    "based solely on the provided sources. It does not establish absolute truth or absence. "
    "Always confirm critical terms with the official governing body."
)


def run_analysis(
    topic: str,
    urls: tuple = (),
    pasted: tuple = (),
    files: tuple = (),
    official_ids: tuple = (),
    today: Optional[date] = None,
    on_progress: Optional[Callable[[int, str], None]] = None
):
    """Run the 10-stage Digital Dark Spot analysis.
    
    Args:
        topic: The research question or topic string.
        urls: Sequence of URL strings or (url, is_official) tuples.
        pasted: Sequence of (label, text) or (label, text, is_official) tuples.
        files: Sequence of filepaths or (filepath, is_official) tuples.
        official_ids: Source IDs that the user explicitly designated as official.
        today: Reference date for freshness calculations (defaults to current system date).
        on_progress: Optional callback function receiving (stage_number, stage_description).
    """
    def notify(stage: int, desc: str):
        if on_progress:
            on_progress(stage, desc)

    today = today or date.today()

    # Stage 1: Validate input
    notify(1, "Validating input topic and source list...")
    if not topic or not topic.strip():
        raise ValueError("A research topic or question is required.")

    # Stage 2: Ingest, clean, and normalize all sources (Code)
    notify(2, "Fetching and cleaning source documents...")
    sources = []
    
    for item in urls:
        sid = f"S{len(sources) + 1}"
        if isinstance(item, (tuple, list)):
            u, is_off = item[0], item[1] if len(item) > 1 else False
        else:
            u, is_off = item, False
        sources.append(fetch_url(u, sid, is_official=is_off, today=today))

    for item in pasted:
        sid = f"S{len(sources) + 1}"
        if len(item) == 3:
            lbl, txt, is_off = item
        else:
            lbl, txt = item[0], item[1]
            is_off = False
        sources.append(source_from_text(sid, lbl, txt, is_official=is_off))

    for item in files:
        sid = f"S{len(sources) + 1}"
        if isinstance(item, (tuple, list)):
            fp, is_off = item[0], item[1] if len(item) > 1 else False
        else:
            fp, is_off = item, False
        sources.append(source_from_file(sid, fp, is_official=is_off))

    # Apply manual official designations if specified
    for s in sources:
        if s["id"] in official_ids:
            s["is_official"] = True

    usable = [s for s in sources if s.get("ok")]
    if not usable:
        details = [f"[{s.get('id', 'Source')}]: {s.get('error', 'unknown error')}" for s in sources if not s.get("ok")]
        reason_str = " | ".join(details) if details else "No sources supplied."
        raise ValueError(f"No usable sources could be loaded. Details: {reason_str}")

    # Stage 3: Generate expected information checklist (AI Call 1)
    notify(3, "Synthesizing expected decision checklist...")
    fields = generate_checklist(topic)

    # Stages 4 & 5: AI extraction per source, followed immediately by code quote verification
    notify(4, "Extracting evidence and mechanically verifying quotes...")
    findings = []
    uncertain = []

    for s in usable:
        raw_extractions = extract_from_source(s, fields) or {}
        if not isinstance(raw_extractions, dict):
            raw_extractions = {}
        low_text = s["text"].lower()

        for f in fields:
            r = raw_extractions.get(f["key"])
            if not isinstance(r, dict):
                r = {"status": "not_found"}
            val = r.get("value")
            quote = r.get("quote")

            if r.get("status") == "found" and quote:
                verdict, canonical = verify_quote(quote, s["text"])
                if verdict in ("exact", "fuzzy"):
                    findings.append({
                        "field_key": f["key"],
                        "label": f["label"],
                        "source_id": s["id"],
                        "source_title": s.get("title") or s["id"],
                        "value": val or canonical[:80],
                        "quote": canonical,
                        "match": verdict,
                        "label_type": "sourced"
                    })
                else:
                    # Fabricated or modified quote: demote to Uncertain (never Sourced)
                    uncertain.append({
                        "field_key": f["key"],
                        "source_id": s["id"],
                        "reason": "quote_not_found_in_source",
                        "claimed_value": val
                    })
            else:
                # Possible-miss safeguard: AI said not_found, but source uses the field's core vocabulary
                hits = [t for t in f.get("search_terms", []) if t in low_text]
                if len(hits) >= 2:
                    uncertain.append({
                        "field_key": f["key"],
                        "source_id": s["id"],
                        "reason": "possible_miss",
                        "terms": hits
                    })

    # Stage 6: Detect information gaps (Code)
    notify(6, "Evaluating coverage and identifying information gaps...")
    covered_keys = {x["field_key"] for x in findings}
    gaps = []
    for f in fields:
        if f["key"] not in covered_keys:
            doubt = [u for u in uncertain if u["field_key"] == f["key"]]
            gaps.append({
                "field_key": f["key"],
                "label": f["label"],
                "importance": f["importance"],
                "why": f.get("why", ""),
                "caution": bool(doubt),
                "label_type": "uncertain" if doubt else "ai_suggestion"
            })

    # Stage 7: Detect possible contradictions between sources (AI Call 3)
    notify(7, "Comparing source findings for contradictions...")
    conflicts = find_conflicts(fields, findings, usable)

    # Stage 8: Detect outdated information and stale deadlines (Code)
    notify(8, "Auditing publication dates, cycles, and deadlines...")
    outdated = check_sources(usable, today) + check_findings(findings, today)

    # Deterministic Stage: Extract and compare critical entities without AI
    entities_comparison = compare_entities_across_sources(usable, today)

    # Deterministic Stage: Scan Fine Print and Trap Clauses without AI
    trap_analysis = scan_all_sources_for_traps(usable)

    # Stage 9: Prioritize into ranked verify-next list (Code)
    notify(9, "Prioritizing items into action-oriented checklist...")
    verify_next = build_verify_list(fields, gaps, conflicts, outdated, uncertain)

    # If critical entity discrepancies exist (e.g. conflicting deadlines/fees), prioritize in verify_next
    for disc in entities_comparison.get("discrepancies", []):
        exists = any(v.get("field") == disc["category"] for v in verify_next)
        if not exists:
            verify_next.insert(0, {
                "type": "discrepancy",
                "score": 5.0,
                "field": disc["category"],
                "action": f"Resolve discrepancy: {disc['detail']}",
                "rank": 1,
                "priority": "P1" if disc.get("severity") == "high" else "P2",
                "source_id": disc["a"].get("source_id") or disc["a"].get("source"),
                "quote": disc["a"].get("snippet") or disc["a"].get("value"),
            })

    # If critical trap clauses exist (e.g. Disqualification or Service Bond), add to verify_next
    for sid, trap_info in trap_analysis.get("by_source", {}).items():
        for c in trap_info.get("clauses", []):
            if c["severity"] in ("critical", "high"):
                short_s = (c["sentence"][:80] + "...") if len(c["sentence"]) > 80 else c["sentence"]
                exists = any(c["category"] in v.get("field", "") and sid in v.get("action", "") for v in verify_next)
                if not exists:
                    verify_next.append({
                        "type": "fine_print",
                        "score": 4.5 if c["severity"] == "critical" else 3.5,
                        "field": f"Trap Warning: {c['category']}",
                        "action": f"Notice in {trap_info.get('source_title', sid)}: \"{short_s}\" - {c['tip']}",
                        "rank": 99,
                        "priority": "P1" if c["severity"] == "critical" else "P2",
                        "source_id": sid,
                        "quote": c.get("sentence") or c.get("matched_term"),
                    })

    # Deterministic Stage: Technical HTTP & Domain Security Audit
    technical_audit = {
        "by_source": {},
        "has_stale_headers": False,
        "has_low_trust_domains": False,
        "stale_alerts": [],
        "low_trust_alerts": [],
    }

    for s in usable:
        ta = s.get("technical_audit") or {}
        sid = s["id"]
        technical_audit["by_source"][sid] = ta

        if ta.get("is_stale") and ta.get("stale_alert"):
            technical_audit["has_stale_headers"] = True
            technical_audit["stale_alerts"].append({
                "source_id": sid,
                "title": s.get("title") or sid,
                "url": s.get("url"),
                "alert": ta["stale_alert"],
                "last_modified": ta.get("last_modified"),
            })
            outdated.append({
                "source_id": sid,
                "title": s.get("title") or sid,
                "severity": "high",
                "reason": f"Server Last-Modified header indicates page has not been updated since {ta.get('last_modified_human', 'a past date')}."
            })
            verify_next.insert(0, {
                "type": "stale_header",
                "score": 4.9,
                "field": "Server Freshness Alert",
                "action": f"{ta['stale_alert']} for source {sid} ({s.get('title', sid)})",
                "rank": 1,
                "priority": "P1",
                "source_id": sid,
                "quote": f"Last-Modified: {ta.get('headers', {}).get('last_modified', '')}",
            })

        if ta.get("trust_tier") in ("low_trust_free_host", "low_trust_ip"):
            technical_audit["has_low_trust_domains"] = True
            badge = ta.get("trust_badge", "Low Trust Domain")
            warn_msg = ta.get("warnings", [{}])[0].get("message") if ta.get("warnings") else f"Source {sid} domain is low trust."
            technical_audit["low_trust_alerts"].append({
                "source_id": sid,
                "title": s.get("title") or sid,
                "domain": ta.get("domain"),
                "badge": badge,
                "message": warn_msg
            })
            verify_next.append({
                "type": "low_trust_domain",
                "score": 3.8,
                "field": f"Security: {badge}",
                "action": f"Verify authenticity of {sid} ({ta.get('domain')}): {warn_msg}",
                "rank": 99,
                "priority": "P2",
                "source_id": sid,
                "quote": s.get("url", ""),
            })

    # Re-index ranks
    for idx, v in enumerate(verify_next, start=1):
        v["rank"] = idx

    # Attach trap_clauses and technical_audit to each source object
    enriched_sources = []
    for s in sources:
        s_data = {k: v for k, v in s.items() if k != "text"} | ({"text": s["text"]} if s.get("ok") else {})
        if s.get("id") in trap_analysis.get("by_source", {}):
            s_data["trap_clauses"] = trap_analysis["by_source"][s["id"]]
        if s.get("technical_audit"):
            s_data["technical_audit"] = s["technical_audit"]
        enriched_sources.append(s_data)

    # Compile final data model (contract)
    notify(10, "Analysis complete.")
    return {
        "topic": topic,
        "run_date": today.isoformat(),
        "disclaimer": DISCLAIMER,
        "checklist": fields,
        "sources": enriched_sources,
        "findings": findings,
        "gaps": gaps,
        "conflicts": conflicts,
        "outdated": outdated,
        "uncertain": uncertain,
        "verify_next": verify_next,
        "entities_comparison": entities_comparison,
        "trap_clauses": trap_analysis,
        "technical_audit": technical_audit,
        "stats": {
            "sources_used": len(usable),
            "sources_failed": len(sources) - len(usable),
            "fields": len(fields),
            "covered": len(covered_keys),
            "gaps": len(gaps),
            "conflicts": len(conflicts),
            "outdated": len(outdated),
            "uncertain": len(uncertain),
            "entity_discrepancies": len(entities_comparison.get("discrepancies", [])),
            "trap_clauses_detected": trap_analysis.get("total_traps_found", 0),
            "stale_headers_detected": len(technical_audit["stale_alerts"]),
            "low_trust_domains_detected": len(technical_audit["low_trust_alerts"]),
        },
    }
