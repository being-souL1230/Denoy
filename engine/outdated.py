"""outdated.py: Pure deterministic code.
Detects outdated source publication dates, expired academic cycles, and stale deadline years.
Never asks the AI what today's date is or whether a date is fresh.
"""
import re
from datetime import date, datetime

STALE_DAYS = 548  # approx 18 months


def current_cycle_start(today: date) -> int:
    """Academic/application cycles typically open around June.
    Before June, the previous calendar year's cycle is still current."""
    return today.year if today.month >= 6 else today.year - 1


def check_sources(sources: list, today: date = None):
    """Check metadata dates, text update dates, and cycle references on each source."""
    today = today or date.today()
    flags = []

    for s in sources:
        if not s.get("ok"):
            continue

        sid = s["id"]
        title = s.get("title") or sid

        # 1. Publication / Last-updated date age check
        if s.get("date"):
            try:
                src_date = datetime.fromisoformat(s["date"]).date()
                age_days = (today - src_date).days
                if age_days > STALE_DAYS:
                    flags.append({
                        "source_id": sid,
                        "title": title,
                        "severity": "high",
                        "reason": f"Source dated {s['date']} ({age_days // 30} months old)."
                    })
            except (ValueError, TypeError):
                pass
        elif not s.get("cycles"):
            # Informational notice: lack of dates means freshness cannot be guaranteed
            flags.append({
                "source_id": sid,
                "title": title,
                "severity": "low",
                "reason": "No publication date or academic cycle found, so freshness cannot be verified."
            })

        # 2. Academic / fiscal cycle check
        if s.get("cycles"):
            latest_cycle = max(s["cycles"])
            curr_start = current_cycle_start(today)
            if latest_cycle < curr_start:
                flags.append({
                    "source_id": sid,
                    "title": title,
                    "severity": "high",
                    "reason": f"Latest cycle mentioned is {latest_cycle}-{str(latest_cycle + 1)[-2:]}, which appears to be an older cycle."
                })

    return flags


def check_findings(findings: list, today: date = None):
    """Check extracted values for dates or deadlines that refer to past years."""
    today = today or date.today()
    flags = []

    for f in findings:
        k = f["field_key"].lower()
        lbl = f["label"].lower()
        if any(term in k or term in lbl for term in ("deadline", "date", "closing", "schedule")):
            val = str(f.get("value") or "")
            years = [int(y) for y in re.findall(r"\b(20\d{2})\b", val)]
            if years and max(years) < today.year:
                flags.append({
                    "source_id": f["source_id"],
                    "title": f.get("source_title") or f["source_id"],
                    "severity": "high",
                    "reason": f"Extracted {f['label']} mentions only {max(years)}: '{val}'."
                })

    return flags
