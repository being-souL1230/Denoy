"""engine: Core 10-stage Information Gap & Contradiction Detection Pipeline.
Contains deterministic verification, source ingestion, credibility analysis,
and AI extraction modules.
"""
from .pipeline import run_analysis, DISCLAIMER
from .fetcher import fetch_url, source_from_text, source_from_file, score_source_credibility, build_source
from .checklist import generate_checklist
from .extractor import extract_from_source
from .verifier import verify_quote
from .compare import find_conflicts
from .outdated import check_sources, check_findings
from .priority import build_verify_list
from .entities import extract_critical_entities, compare_entities_across_sources
from .traps import scan_trap_clauses, scan_all_sources_for_traps
from .llm import call_llm, call_llm_json, _parse_json
from .mock_llm import mock_response

__all__ = [
    "run_analysis",
    "DISCLAIMER",
    "fetch_url",
    "source_from_text",
    "source_from_file",
    "score_source_credibility",
    "build_source",
    "generate_checklist",
    "extract_from_source",
    "verify_quote",
    "find_conflicts",
    "check_sources",
    "check_findings",
    "build_verify_list",
    "extract_critical_entities",
    "compare_entities_across_sources",
    "scan_trap_clauses",
    "scan_all_sources_for_traps",
    "call_llm",
    "call_llm_json",
    "_parse_json",
    "mock_response",
]
