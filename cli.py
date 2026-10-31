"""cli.py: Rich interactive terminal interface for Digital Dark Spot.
Renders the complete 10-stage gap detection pipeline with beautiful tables,
coverage matrices, side-by-side conflict comparisons, and prioritized verify checklists.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text

from engine import DISCLAIMER, run_analysis

console = Console()


def render_banner():
    """Display the title banner."""
    title_text = Text()
    title_text.append("DIGITAL DARK SPOT\n", style="bold cyan")
    title_text.append("AI-Assisted Information Gap & Contradiction Detection Platform\n", style="bold white")
    title_text.append("Comparison Engine  •  Mechanical Quote Verification  •  Action-Oriented Ranking", style="dim italic")

    console.print(
        Panel(
            title_text,
            border_style="bright_blue",
            box=box.ROUNDED,
            padding=(1, 2),
        )
    )


def render_summary_stats(stats: dict):
    """Render high-level metric cards."""
    table = Table(box=box.SIMPLE, show_header=True, header_style="bold underline")
    table.add_column("Sources Analyzed", justify="center", style="bold green")
    table.add_column("Checklist Fields", justify="center", style="bold blue")
    table.add_column("Covered in Sources", justify="center", style="bold white")
    table.add_column("Potential Gaps", justify="center", style="bold red")
    table.add_column("Possible Conflicts", justify="center", style="bold yellow")
    table.add_column("Outdated Signals", justify="center", style="bold magenta")
    table.add_column("Uncertain Items", justify="center", style="bold dark_orange")

    table.add_row(
        str(stats.get("sources_used", 0)),
        str(stats.get("fields", 0)),
        str(stats.get("covered", 0)),
        str(stats.get("gaps", 0)),
        str(stats.get("conflicts", 0)),
        str(stats.get("outdated", 0)),
        str(stats.get("uncertain", 0)),
    )

    console.print(Panel(table, title="[bold]Platform Intelligence Summary[/bold]", border_style="cyan"))


def render_coverage_matrix(checklist: list, sources: list, findings: list, uncertain: list):
    """Render the Coverage Matrix with rows as checklist fields and columns as sources."""
    table = Table(
        title="[bold cyan]1. Coverage Matrix (Checklist vs. Sources)[/bold cyan]",
        box=box.ROUNDED,
        header_style="bold cyan",
        show_lines=True,
    )

    table.add_column("Checklist Field", style="bold white", width=26)
    table.add_column("Imp.", justify="center", width=6)

    # Column for each usable source
    usable_sources = [s for s in sources if s.get("ok")]
    for s in usable_sources:
        official_tag = " [bold green](OFFICIAL)[/bold green]" if s.get("is_official") else ""
        title = s.get("title") or s["id"]
        if len(title) > 20:
            title = title[:18] + ".."
        table.add_column(f"{s['id']}: {title}{official_tag}", width=24)

    # Map findings by (field_key, source_id)
    finding_map = {(f["field_key"], f["source_id"]): f for f in findings}
    uncertain_map = {(u["field_key"], u["source_id"]): u for u in uncertain}

    for f in checklist:
        imp = f.get("importance", "medium").upper()
        imp_style = "bold red" if imp == "HIGH" else "yellow" if imp == "MEDIUM" else "dim"

        row = [f["label"], f"[{imp_style}]{imp[:3]}[/{imp_style}]"]

        for s in usable_sources:
            key = (f["key"], s["id"])
            if key in finding_map:
                finding = finding_map[key]
                val = finding.get("value") or ""
                if len(val) > 40:
                    val = val[:37] + "..."
                row.append(f"[green][SOURCED] {val}[/green]\n[dim italic]Quote: \"{finding.get('quote', '')[:35]}...\"[/dim italic]")
            elif key in uncertain_map:
                u = uncertain_map[key]
                if u.get("reason") == "quote_not_found_in_source":
                    row.append("[bold yellow][UNCERTAIN] Quote Unverified[/bold yellow]\n[dim](Uncertain)[/dim]")
                else:
                    row.append("[bold yellow][UNCERTAIN] Possible Miss[/bold yellow]\n[dim](Keywords found)[/dim]")
            else:
                row.append("[red][NOT FOUND][/red]")

        table.add_row(*row)

    console.print(table)
    console.print("[dim]  Labels: [green][SOURCED] Quote mechanically verified[/green]  |  [yellow][UNCERTAIN][/yellow]  |  [red][NOT FOUND] in reviewed sources[/red][/dim]\n")


def render_gaps(gaps: list):
    """Render potential information gaps."""
    if not gaps:
        console.print(Panel("[green]No information gaps detected. All checklist fields were addressed in the sources.[/green]", title="[bold]2. Potential Information Gaps[/bold]", border_style="green"))
        return

    table = Table(
        title="[bold red]2. Potential Information Gaps (Missing from Sources)[/bold red]",
        box=box.ROUNDED,
        header_style="bold red",
        show_lines=True,
    )
    table.add_column("Field", style="bold white", width=24)
    table.add_column("Importance", justify="center", width=12)
    table.add_column("Why This Matters", style="white", width=42)
    table.add_column("Observation & Safeguard", style="dim italic", width=36)

    for g in gaps:
        imp = g.get("importance", "medium").upper()
        imp_style = "bold red" if imp == "HIGH" else "yellow" if imp == "MEDIUM" else "dim"
        
        status = "Not found in any reviewed source."
        if g.get("caution"):
            status += " (Caution: page mentions related keywords but lacks verified answer)."

        table.add_row(
            g["label"],
            f"[{imp_style}]{imp}[/{imp_style}]",
            g.get("why", "Critical parameter for informed decision making."),
            status
        )

    console.print(table)
    console.print("[dim]  Note: The system reports what the reviewed sources do not state; it does not claim facts do not exist elsewhere.[/dim]\n")


def render_conflicts(conflicts: list):
    """Render contradictions found between sources."""
    if not conflicts:
        console.print(Panel("[green]No contradictions or conflicting statements detected among sources.[/green]", title="[bold]3. Possible Contradictions[/bold]", border_style="green"))
        return

    console.print("[bold yellow]3. Possible Contradictions Between Sources[/bold yellow]")
    for i, c in enumerate(conflicts, 1):
        rel = c.get("relation", "conflict").upper()
        rel_color = "red" if rel == "CONFLICT" else "yellow"

        content = Text()
        content.append(f"Field: {c['label']} (Importance: {c.get('importance', 'medium').upper()})\n", style="bold white")
        content.append(f"Observation: {c.get('explanation')}\n\n", style="italic")

        a = c["a"]
        b = c["b"]
        content.append(f"  • Source {a['source_id']}: \"{a.get('quote')}\"\n", style="cyan")
        content.append(f"    Extracted Value: {a.get('value')}\n\n", style="dim")
        content.append(f"  • Source {b['source_id']}: \"{b.get('quote')}\"\n", style="magenta")
        content.append(f"    Extracted Value: {b.get('value')}\n", style="dim")

        console.print(
            Panel(
                content,
                title=f"[{rel_color}]Contradiction #{i} ({rel})[/{rel_color}]",
                border_style=rel_color,
                box=box.ROUNDED,
            )
        )
    console.print()


def render_outdated(outdated: list):
    """Render stale source dates, expired cycles, and past deadline warnings."""
    if not outdated:
        console.print(Panel("[green]All sources and deadlines appear current and fresh.[/green]", title="[bold]4. Outdated & Freshness Warnings[/bold]", border_style="green"))
        return

    table = Table(
        title="[bold magenta]4. Outdated & Freshness Warnings (Deterministic Code Audit)[/bold magenta]",
        box=box.ROUNDED,
        header_style="bold magenta",
        show_lines=True,
    )
    table.add_column("Severity", justify="center", width=10)
    table.add_column("Source / Item", style="bold white", width=22)
    table.add_column("Freshness Signal & Reason", style="white", width=65)

    for o in outdated:
        sev = o.get("severity", "low").upper()
        sev_style = "bold red" if sev == "HIGH" else "yellow"
        table.add_row(
            f"[{sev_style}]{sev}[/{sev_style}]",
            str(o.get("title") or o.get("source_id")),
            o.get("reason", "Outdated signal detected.")
        )

    console.print(table)
    console.print()


def render_uncertain(uncertain: list):
    """Render the mechanical trust layer audit (unverified quotes and keyword misses)."""
    if not uncertain:
        return

    table = Table(
        title="[bold dark_orange]5. Uncertainty & Evidence Safeguards (Mechanical Verification)[/bold dark_orange]",
        box=box.ROUNDED,
        header_style="bold dark_orange",
        show_lines=True,
    )
    table.add_column("Field", style="bold white", width=22)
    table.add_column("Source", justify="center", width=10)
    table.add_column("Defense Triggered", style="yellow", width=28)
    table.add_column("Details", style="dim", width=42)

    for u in uncertain:
        reason = u.get("reason")
        if reason == "quote_not_found_in_source":
            trigger = "[bold red]Quote Rejected by Code[/bold red]"
            details = f"AI claimed value '{u.get('claimed_value')}' but quote could not be verified in source."
        else:
            trigger = "[yellow]Possible Miss Alert[/yellow]"
            terms = ", ".join(u.get("terms", []))
            details = f"AI said not_found, but source matches topic vocabulary: [{terms}]."

        table.add_row(
            u.get("field_key", ""),
            str(u.get("source_id", "")),
            trigger,
            details
        )

    console.print(table)
    console.print("[dim]  Transparency Guarantee: AI claims with unverified quotes are NEVER presented as Sourced facts.[/dim]\n")


def render_critical_entities(entities_comparison: dict):
    """Render deterministic side-by-side critical entities and discrepancies."""
    if not entities_comparison or not entities_comparison.get("by_source"):
        return

    console.print("[bold cyan]⚡ Instant Critical Entities & Side-by-Side Signals (Deterministic / 0-AI)[/bold cyan]")

    discrepancies = entities_comparison.get("discrepancies", [])
    if discrepancies:
        disc_table = Table(
            title="[bold red]⚠️ Direct Cross-Source Discrepancies Detected[/bold red]",
            box=box.ROUNDED,
            header_style="bold red",
            show_lines=True
        )
        disc_table.add_column("Category", style="bold yellow", width=22)
        disc_table.add_column("Sources", justify="center", width=12)
        disc_table.add_column("Discrepancy Detail", style="white", width=60)

        for d in discrepancies:
            disc_table.add_row(
                d.get("category", ""),
                " vs ".join(d.get("sources", [])),
                d.get("detail", "")
            )
        console.print(disc_table)

    by_src = entities_comparison.get("by_source", {})
    for sid, e in by_src.items():
        title = e.get("title") or sid
        official_tag = " [bold green](Official)[/bold green]" if e.get("is_official") else ""
        src_table = Table(
            title=f"[bold white]{sid}: {title}{official_tag}[/bold white]",
            box=box.SIMPLE,
            header_style="bold cyan"
        )
        src_table.add_column("Entity Category", style="bold white", width=18)
        src_table.add_column("Extracted Values / Details", style="white", width=70)

        # Deadlines
        deadlines = e.get("deadlines", [])
        if deadlines:
            dl_strs = []
            for d in deadlines:
                st_color = "red" if d.get("status") == "expired" else "green" if d.get("status") == "upcoming" else "white"
                tag = f"[{st_color}][{d.get('status', '').upper()}][/{st_color}]"
                dl_strs.append(f"{tag} {d['value']} ({d.get('context', 'Date')})")
            src_table.add_row("📅 Dates & Deadlines", "\n".join(dl_strs))

        # Amounts
        amounts = e.get("amounts", [])
        if amounts:
            am_strs = [f"[bold]{a['category']}:[/bold] {a['value']}" for a in amounts]
            src_table.add_row("💰 Fees & Amounts", "\n".join(am_strs))

        # Eligibility
        elig = e.get("eligibility", [])
        if elig:
            el_strs = [f"[bold]{el['type']}:[/bold] {el['value']}" for el in elig]
            src_table.add_row("🎯 Marks & Age", "\n".join(el_strs))

        # Contacts
        contacts = e.get("contacts", [])
        if contacts:
            co_strs = []
            for c in contacts:
                b_color = "green" if c.get("is_official") else "yellow"
                co_strs.append(f"[{b_color}][{c.get('badge', '')}][/{b_color}] {c['value']}")
            src_table.add_row("📞 Contacts", "\n".join(co_strs))

        # Fine print
        fine = e.get("fine_print", [])
        if fine:
            fp_strs = [f"[bold red]![/bold red] [bold]{f['label']}:[/bold] {f['matched_text']}" for f in fine]
            src_table.add_row("⚠️ Trap Clauses", "\n".join(fp_strs))

        console.print(src_table)
    console.print()


def render_trap_clauses(trap_analysis: dict):
    """Render Fine Print and Trap Clauses warnings per source."""
    if not trap_analysis or not trap_analysis.get("has_traps"):
        return

    console.print("[bold red]⚠️  FINE PRINT & TRAP CLAUSES RADAR (Deterministic / 0-AI)[/bold red]")
    by_src = trap_analysis.get("by_source", {})

    for sid, t_info in by_src.items():
        if not t_info.get("has_traps"):
            continue
        title = t_info.get("source_title", sid)
        count = t_info.get("total_count", 0)

        lines = [f"[bold yellow]{count} Critical Warning{'s' if count != 1 else ''} / Trap Clause{'s' if count != 1 else ''} detected in this document:[/bold yellow]\n"]
        for c in t_info.get("clauses", []):
            cat_color = "bold red" if c.get("severity") == "critical" else "bold yellow"
            lines.append(f"  • [{cat_color}][{c.get('category')}][/{cat_color}] (Trigger: '[italic]{c.get('matched_term')}[/italic]')")
            lines.append(f"    [dim]Exact line:[/dim] \"{c.get('sentence')}\"")
            lines.append(f"    [cyan]Action Tip:[/cyan] {c.get('tip')}\n")

        panel = Panel(
            "\n".join(lines),
            title=f"[bold white]{sid}: {title}[/bold white]",
            border_style="red" if t_info.get("critical_count", 0) > 0 else "yellow",
            box=box.ROUNDED,
        )
        console.print(panel)
    console.print()


def render_verify_checklist(verify_next: list):
    """Render the final prioritized action checklist."""
    table = Table(
        title="[bold green]6. Prioritized Action Checklist (Verify Next)[/bold green]",
        box=box.ROUNDED,
        header_style="bold green",
        show_lines=True,
    )
    table.add_column("Rank", justify="center", width=6)
    table.add_column("Priority", justify="center", width=10)
    table.add_column("Issue Type", justify="center", width=12)
    table.add_column("Field / Item", style="bold white", width=24)
    table.add_column("Action Required (Next Step)", style="white", width=55)

    for it in verify_next:
        pri = it.get("priority", "P3")
        pri_style = "bold red" if pri == "P1" else "bold yellow" if pri == "P2" else "bold blue"

        t = it.get("type", "general").upper()
        t_style = "red" if t == "CONFLICT" else "magenta" if t == "OUTDATED" else "yellow" if t == "GAP" else "cyan"

        table.add_row(
            str(it.get("rank")),
            f"[{pri_style}]{pri}[/{pri_style}]",
            f"[{t_style}]{t}[/{t_style}]",
            it.get("field", ""),
            it.get("action", "")
        )

    console.print(table)
    console.print(Panel(f"[italic]{DISCLAIMER}[/italic]", border_style="dim", box=box.SQUARE))


def run_pipeline_with_progress(topic, urls, pasted, files, official_ids=()):
    """Execute pipeline with a rich live progress spinner."""
    render_banner()

    stages_desc = {
        1: "Validating input topic and sources",
        2: "Fetching and cleaning source documents",
        3: "Synthesizing expected decision checklist (AI)",
        4: "Extracting evidence per source (AI)",
        5: "Mechanically verifying quotes in code (Trust Layer)",
        6: "Detecting information gaps (Code)",
        7: "Analyzing cross-source contradictions (AI)",
        8: "Auditing publication dates & cycle freshness (Code)",
        9: "Prioritizing action items into P1/P2/P3 checklist (Code)",
        10: "Compiling intelligence report"
    }

    result = None
    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[bold cyan]{task.description}"),
            console=console,
            transient=True
        ) as progress:
            task = progress.add_task("[cyan]Initializing pipeline...", total=10)

            def on_step(stage: int, desc: str):
                progress.update(task, completed=stage, description=f"[cyan]Stage {stage}/10: {stages_desc.get(stage, desc)}")

            result = run_analysis(
                topic=topic,
                urls=urls,
                pasted=pasted,
                files=files,
                official_ids=official_ids,
                on_progress=on_step
            )
    except ValueError as e:
        console.print(f"\n[bold red][ERROR] Input Validation Error:[/bold red] {e}\n")
        return None
    except Exception as e:
        console.print(f"\n[bold red][ERROR] Pipeline Execution Error:[/bold red] {e}\n")
        return None

    if not result:
        return None

    # Render results
    console.print(f"\n[bold green][COMPLETE] Analysis Complete for Topic:[/bold green] [bold white]\"{topic}\"[/bold white]\n")
    render_summary_stats(result["stats"])
    render_coverage_matrix(result["checklist"], result["sources"], result["findings"], result["uncertain"])
    render_critical_entities(result.get("entities_comparison"))
    render_trap_clauses(result.get("trap_clauses"))
    render_gaps(result["gaps"])
    render_conflicts(result["conflicts"])
    render_outdated(result["outdated"])
    render_uncertain(result["uncertain"])
    render_verify_checklist(result["verify_next"])

    return result


def interactive_mode():
    """Terminal interactive prompt mode."""
    render_banner()
    console.print("[bold yellow]Interactive Mode[/bold yellow]\n")

    topic = console.input("[bold cyan]Enter research topic or decision goal:[/bold cyan] ").strip()
    if not topic:
        topic = "Merit Scholarship Eligibility and Renewal"
        console.print(f"[dim]Defaulting to: {topic}[/dim]")

    urls = []
    pasted = []
    files = []
    official_ids = []

    console.print("\n[bold]Add Sources:[/bold]")
    console.print("1. Enter URL(s)")
    console.print("2. Enter local file path(s)")

    choice = console.input("[bold cyan]Choose option (1/2):[/bold cyan] ").strip()

    if choice == "1" or not choice:
        while True:
            u = console.input("Enter URL (or press Enter to finish): ").strip()
            if not u:
                break
            is_off = console.input("Is this an official source? (y/n): ").strip().lower() == "y"
            urls.append((u, is_off))
    elif choice == "2":
        while True:
            fp = console.input("Enter file path (or press Enter to finish): ").strip()
            if not fp:
                break
            is_off = console.input("Is this an official source? (y/n): ").strip().lower() == "y"
            files.append((fp, is_off))

    if not urls and not pasted and not files:
        console.print("[red]No sources specified. Aborting.[/red]")
        return

    result = run_pipeline_with_progress(topic, urls=tuple(urls), pasted=tuple(pasted), files=tuple(files))

    export = console.input("\n[bold cyan]Export results to JSON? (y/n):[/bold cyan] ").strip().lower()
    if export == "y":
        out_path = console.input("Output file path [result.json]: ").strip() or "result.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        console.print(f"[green][SAVED] Results successfully saved to {out_path}[/green]")


def main():
    parser = argparse.ArgumentParser(description="Digital Dark Spot - AI Information Gap Detection Platform")
    parser.add_argument("topic", nargs="?", default="", help="Research question or topic to evaluate")
    parser.add_argument("--url", action="append", default=[], help="Webpage URL to include as a source")
    parser.add_argument("--text", action="append", default=[], help="Local file path (.txt, .md, .pdf) as a source")
    parser.add_argument("--official", action="append", default=[], help="Source ID or URL designated as Official")
    parser.add_argument("--out", default="", help="Save output JSON to specified file path")
    parser.add_argument("--interactive", "-i", action="store_true", help="Launch interactive step-by-step terminal prompt")

    args = parser.parse_args()

    if args.interactive or (not args.topic and not args.url and not args.text):
        interactive_mode()
        return

    if not args.topic:
        console.print("[red]Error: Topic is required when not in interactive mode.[/red]")
        parser.print_help()
        sys.exit(1)

    urls = tuple(args.url)
    files = tuple(args.text)
    official_ids = tuple(args.official)

    if not urls and not files:
        console.print("[red]Error: Please specify at least one real source using --url or --text.[/red]")
        sys.exit(1)


    result = run_pipeline_with_progress(
        args.topic,
        urls=urls,
        pasted=(),
        files=files,
        official_ids=official_ids
    )

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2, ensure_ascii=False)
        console.print(f"\n[green]Saved analysis results to {args.out}[/green]")


if __name__ == "__main__":
    main()
