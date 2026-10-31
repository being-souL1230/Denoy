/**
 * dashboard.js: Core state management, analysis pipeline invocation,
 * reactive matrix rendering, entity comparisons, and local snapshot history.
 */

    let R = null;
    let Q = [];
    let currentSourceMode = 'urls';

    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    
    function setTopic(val) {
      document.getElementById('topic').value = val;
    }

    function switchSourceTab(mode) {
      currentSourceMode = mode;
      document.getElementById('panel-urls').style.display = mode === 'urls' ? 'block' : 'none';
      document.getElementById('panel-pasted').style.display = mode === 'pasted' ? 'block' : 'none';
      
      document.getElementById('btn-tab-urls').classList.toggle('is-active', mode === 'urls');
      document.getElementById('btn-tab-pasted').classList.toggle('is-active', mode === 'pasted');
    }

    function setStatus(msg, isError = false) {
      const bar = document.getElementById('status-bar');
      bar.style.display = 'block';
      bar.innerHTML = msg;
      bar.style.color = isError ? '#b91c1c' : '#1e5f32';
    }

    function updateStepper(step) {
      document.getElementById('pipeline-stepper').style.display = 'block';
      for (let i = 1; i <= 10; i++) {
        const el = document.getElementById(`step-${i}`);
        if (!el) continue;
        el.classList.remove('active', 'done');
        if (i < step) el.classList.add('done');
        else if (i === step) el.classList.add('active');
      }
    }

    async function runAnalysis() {
      const topic = document.getElementById('topic').value.trim();
      const urls = document.getElementById('urls').value.split('\n').map(x => x.trim()).filter(Boolean);
      const pastedRaw = document.getElementById('pasted_text').value.trim();

      if (!topic) {
        setStatus("[Notice] Please enter a research question or topic.", true);
        return;
      }

      let pasted = [];
      if (pastedRaw) {
        pasted.push(["User Circular / Notice", pastedRaw]);
      }

      if (!urls.length && !pasted.length) {
        setStatus("[Notice] Please add at least 1 URL or paste document text.", true);
        return;
      }


      let official_ids = [];
      if (document.getElementById('mark_official_url')?.checked && urls.length > 0) {
        official_ids.push("S1");
      }
      if (document.getElementById('mark_official_pasted')?.checked && pasted.length > 0) {
        official_ids.push("S" + (urls.length + 1));
      }

      setStatus("[Processing] Initiating 10-stage comparison engine...");
      updateStepper(3);

      try {
        const res = await fetch("/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, urls, pasted, official_ids })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);
        R = data;
        saveSnapshotToHistory(R, topic, urls, pastedRaw);
        updateStepper(10);
        render();
        setStatus("[Complete] Analysis complete. All dark spots identified below.");
        document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        setStatus("[Error] Execution failure: " + e.message, true);
      }
    }

    function loadFile(input) {
      if (!input.files || !input.files[0]) return;
      const fileLabel = document.getElementById('load-file-label');
      if (fileLabel) fileLabel.textContent = "Loaded: " + input.files[0].name;
      const rd = new FileReader();
      rd.onload = () => {
        R = JSON.parse(rd.result);
        saveSnapshotToHistory(R, R.topic || input.files[0].name, [], "");
        render();
        setStatus("[Loaded] Successfully loaded: " + input.files[0].name);
        document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' });
      };
      rd.readAsText(input.files[0]);
    }

    function switchIntelTab(tab) {
      const tabs = ['overview', 'matrix', 'entities', 'gaps', 'conflicts', 'outdated', 'verify'];
      tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const panel = document.getElementById(`intel-panel-${t}`);
        if (btn) btn.classList.toggle('is-active', t === tab);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
      });
    }


    function closeDrawer() {
      document.getElementById('intel-viewer-drawer').style.display = 'none';
    }

    function exportJSON() {
      if (!R) return;
      const blob = new Blob([JSON.stringify(R, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `darkspot-${(R.topic || 'analysis').slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      a.click();
    }

    function exportMarkdown() {
      if (!R) return;
      const topic = R.topic || "Analysis";
      const sources = R.sources || [];
      const darkSpots = R.dark_spots || [];
      const conflicts = R.conflicts || [];
      const outdated = R.outdated_signals || [];
      const verifyNext = R.verify_next || [];

      let md = "# DarkSpot Verification Audit Dossier\n\n";
      md += "**Target Topic:** " + topic + "\n";
      md += "**Audit Date:** " + (R.run_date || new Date().toISOString().slice(0, 10)) + "\n";
      md += "**Inspection Engine:** 10-Stage Comparative Pipeline (Groq AI and Deterministic Heuristics)\n\n";
      md += "> **Disclaimer:** " + (R.disclaimer || "Identifies information gaps and variances based solely on reviewed sources. Always confirm critical terms with official governing bodies.") + "\n\n";

      md += "## Executive Metrics\n";
      md += "- **Reviewed Sources:** " + sources.length + "\n";
      md += "- **Identified Information Gaps:** " + darkSpots.length + "\n";
      md += "- **Detected Source Conflicts:** " + conflicts.length + "\n";
      md += "- **Outdated Warnings:** " + outdated.length + "\n";
      md += "- **Action Verification Items:** " + verifyNext.length + "\n\n";

      md += "## 1. Source Credibility & Authority Audit\n";
      md += "| Source ID | Authority Tier | Trust Score | Protocol | Domain Registry | Corpus Depth |\n";
      md += "|---|---|---|---|---|---|\n";
      sources.forEach(s => {
        const cred = s.credibility || {};
        md += "| **" + s.id + "** (" + (s.title || s.url || "Document") + ") | " + (cred.badge_label || (s.is_official ? "Official Authority" : "Third-Party")) + " | " + (cred.score ?? 50) + "/100 | " + (cred.https ? "HTTPS Secure" : "Unencrypted") + " | " + (cred.domain_authority || "General") + " | " + (cred.word_count || (s.text || "").split(/\s+/).length) + " words |\n";
      });
      md += "\n";

      md += "## 2. Information Gaps (Missing Criteria)\n";
      if (!darkSpots.length) {
        md += "*No critical information gaps identified across reviewed sources.*\n\n";
      } else {
        darkSpots.forEach(g => {
          md += "### [" + (g.severity || "medium").toUpperCase() + "] " + (g.field || "Criterion") + "\n";
          md += "- **Impact:** " + (g.impact || "Information missing from all reviewed sources.") + "\n";
          if (g.missing_from && g.missing_from.length) {
            md += "- **Omitted In:** " + g.missing_from.join(", ") + "\n";
          }
          md += "\n";
        });
      }

      md += "## 3. Conflicting Information & Variances\n";
      if (!conflicts.length) {
        md += "*No direct source contradictions detected.*\n\n";
      } else {
        conflicts.forEach(c => {
          md += "### [" + (c.severity || "high").toUpperCase() + "] " + (c.field || "Criterion") + "\n";
          md += "- **Comparison:** Source **" + c.source_a + "** states:\n";
          md += "  > \"" + (c.claim_a || "") + "\"\n";
          md += "- **Versus:** Source **" + c.source_b + "** states:\n";
          md += "  > \"" + (c.claim_b || "") + "\"\n";
          if (c.resolution) {
            md += "- **Resolution Advice:** " + c.resolution + "\n";
          }
          md += "\n";
        });
      }

      md += "## 4. What to Verify Next (Action Checklist)\n";
      if (!verifyNext.length) {
        md += "*No pending verification action steps required.*\n\n";
      } else {
        verifyNext.forEach(v => {
          md += "- [ ] **[" + v.priority + "]** **[" + (v.type || "verify").toUpperCase() + "]** **" + v.field + ":** " + v.action + "\n";
        });
        md += "\n";
      }

      md += "***\n";
      md += "*Verified with Deterministic Web Authority and Quote Heuristics. Zero Hallucination Guarantee.*\n";

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `darkspot-audit-${topic.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
      a.click();
    }

    function updateChecklistProgress() {
      const checkboxes = document.querySelectorAll('.verify-check');
      const total = checkboxes.length;
      if (!total) return;
      let checkedCount = 0;
      checkboxes.forEach((cb, idx) => {
        const row = document.getElementById(`checklist-row-${idx}`);
        if (cb.checked) {
          checkedCount++;
          if (row) row.classList.add('is-done');
        } else {
          if (row) row.classList.remove('is-done');
        }
      });

      const pct = Math.round((checkedCount / total) * 100);
      const fill = document.getElementById('checklist-progress-fill');
      const text = document.getElementById('checklist-progress-text');
      if (fill) fill.style.width = pct + '%';
      if (text) {
        if (checkedCount === total) {
          text.innerHTML = `<b>${checkedCount}/${total} Verified (100%) Complete!</b>`;
          text.style.color = '#1b7f4b';
        } else {
          text.textContent = `${checkedCount}/${total} Verified (${pct}%)`;
          text.style.color = '#38503a';
        }
      }
    }

    function copyChecklistToClipboard() {
      if (!R || !R.verify_next || !R.verify_next.length) return;
      const checkboxes = document.querySelectorAll('.verify-check');
      let text = `DarkSpot Action Steps: ${R.topic || "Investigation"}\n\n`;
      R.verify_next.forEach((v, idx) => {
        const isChecked = checkboxes[idx] ? checkboxes[idx].checked : false;
        const mark = isChecked ? "[x]" : "[ ]";
        text += `${mark} [${v.priority}] [${(v.type || "VERIFY").toUpperCase()}] ${v.field}: ${v.action}\n`;
      });
      text += `\nAudit report generated by DarkSpot. Zero tokens consumed.`;

      navigator.clipboard.writeText(text).then(() => {
        const label = document.getElementById('copy-checklist-label');
        if (label) {
          const orig = label.textContent;
          label.textContent = "Copied to Clipboard!";
          setTimeout(() => { label.textContent = orig; }, 2500);
        }
        setStatus("[Copied] Action steps copied to clipboard.");
      }).catch(() => {
        setStatus("[Notice] Unable to access clipboard directly.", true);
      });
    }

    function registerQuote(q) {
      if (q === undefined || q === null) return -1;
      const s = String(q).trim();
      if (!s) return -1;
      Q.push(s);
      return Q.length - 1;
    }

    function showSource(id, qi) {
      const quote = (typeof qi === 'number') ? (Q[qi] || "") : (qi || "");
      openInteractiveViewer(id, quote);
    }

    let currentMatrixFilter = 'all';

    function setMatrixFilter(mode) {
      currentMatrixFilter = mode;
      ['all', 'gaps', 'conflicts', 'high'].forEach(m => {
        const el = document.getElementById(`pill-${m}`);
        if (el) el.classList.toggle('is-active', m === mode);
      });
      applyMatrixFilter();
    }

    function applyMatrixFilter() {
      const query = (document.getElementById('matrix-search-input')?.value || '').trim().toLowerCase();
      const rows = document.querySelectorAll('.matrix-row');
      let visibleCount = 0;

      rows.forEach(row => {
        const label = row.getAttribute('data-label') || '';
        const why = row.getAttribute('data-why') || '';
        const isGap = row.getAttribute('data-is-gap') === '1';
        const isConflict = row.getAttribute('data-is-conflict') === '1';
        const importance = row.getAttribute('data-importance') || '';

        let matchesFilter = true;
        if (currentMatrixFilter === 'gaps') matchesFilter = isGap;
        else if (currentMatrixFilter === 'conflicts') matchesFilter = isConflict;
        else if (currentMatrixFilter === 'high') matchesFilter = (importance === 'high');

        const matchesQuery = !query || label.includes(query) || why.includes(query);

        const show = matchesFilter && matchesQuery;
        row.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });

      const counter = document.getElementById('matrix-counter');
      if (counter) {
        counter.textContent = `Showing ${visibleCount} of ${rows.length} criteria`;
      }
    }

    function renderTrapWarningBox(trapInfo) {
      if (!trapInfo || !trapInfo.has_traps || !trapInfo.clauses || trapInfo.clauses.length === 0) {
        return '';
      }
      const count = trapInfo.total_count;
      return `
        <div class="trap-warning-box">
          <div class="trap-warning-header">
            <div class="trap-warning-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>${count} Critical Warning${count !== 1 ? 's' : ''} / Trap Clause${count !== 1 ? 's' : ''} detected in this document</span>
            </div>
            <span class="cell-badge" style="background:#faeaeb; color:#982820; font-size:9.5px; font-weight:700;">FINE PRINT RADAR</span>
          </div>
          <div class="trap-clause-list">
            ${trapInfo.clauses.map(c => `
              <div class="trap-clause-item" style="cursor:pointer;" onclick="showSource('${trapInfo.source_id}', ${registerQuote(c.sentence || c.matched_term)})" title="Click to view highlighted in interactive source reader">
                <div style="margin-bottom:3px; display:flex; justify-content:space-between; align-items:center;">
                  <span class="trap-clause-cat" style="color:${c.badge_color}; background:${c.badge_bg}; padding:1px 5px; border-radius:3px;">
                    ${esc(c.category)}
                  </span>
                  <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">View in Text &rarr;</span>
                </div>
                <div style="font-size:12px; line-height:1.45;">"${c.highlighted_sentence}"</div>
                <div style="font-size:10.5px; color:#6b7280; margin-top:2px;">💡 <b>Action tip:</b> ${esc(c.tip)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function render() {

      if (!R) return;
      Q = [];
      const st = R.stats;
      document.getElementById('results-container').style.display = 'block';
      document.getElementById('console-topic').textContent = R.topic || 'Intelligence Analysis';
      document.getElementById('disclaimer-text').textContent = R.disclaimer;

      // 1. Compact Inline Metrics Strip (Theme-consistent, no bloated cards)
      document.getElementById('metrics-strip').innerHTML = `
        <div class="intel-stat-item"><b>${st.sources_used}</b> <span>Sources</span></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><b>${st.fields}</b> <span>Criteria</span></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge badge-sourced" style="margin:0 4px 0 0;">SOURCED</span> <b>${st.covered}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge badge-miss" style="margin:0 4px 0 0;">GAPS</span> <b>${st.gaps}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge" style="background:#faeaeb; color:#82202b; margin:0 4px 0 0;">CONFLICTS</span> <b>${st.conflicts}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge badge-uncertain" style="margin:0 4px 0 0;">OUTDATED</span> <b>${st.outdated}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge" style="background:#fff1f2; color:#b91c1c; margin:0 4px 0 0;">TRAPS</span> <b>${st.trap_clauses_detected || 0}</b></div>
      `;

      // 2. Tab Badge Counts
      document.getElementById('count-gaps').textContent = (R.gaps || []).length;
      document.getElementById('count-conflicts').textContent = (R.conflicts || []).length;
      document.getElementById('count-outdated').textContent = (R.outdated || []).length;
      document.getElementById('count-verify').textContent = (R.verify_next || []).length;

      const comp = R.entities_comparison || { by_source: {}, discrepancies: [] };
      const entityDiscrepancies = (comp.discrepancies || []).length;
      const entityTotalSources = Object.keys(comp.by_source || {}).length;
      const countEntitiesEl = document.getElementById('count-entities');
      if (countEntitiesEl) {
        countEntitiesEl.textContent = entityDiscrepancies > 0 ? `${entityDiscrepancies} Alerts` : `${entityTotalSources} Sources`;
        countEntitiesEl.style.background = entityDiscrepancies > 0 ? '#faeaeb' : '#e0f2fe';
        countEntitiesEl.style.color = entityDiscrepancies > 0 ? '#982820' : '#0369a1';
      }

      // 3. Panel 0: Executive Overview & Completeness
      const hasIssues = (R.gaps && R.gaps.length > 0) || (R.conflicts && R.conflicts.length > 0) || (R.outdated && R.outdated.length > 0);
      const isComplete = !hasIssues && st.covered === st.fields && st.fields > 0;
      const completenessBadge = isComplete
        ? `<span class="completeness-badge status-complete">Complete & Verified</span>`
        : `<span class="completeness-badge status-incomplete">Incomplete: Action Required</span>`;
      
      const coveragePct = st.fields > 0 ? Math.round((st.covered / st.fields) * 100) : 0;

      // Card 1: Potential Information Gaps
      let gapsOverviewHtml = '';
      if (!R.gaps || !R.gaps.length) {
        gapsOverviewHtml = `<div style="color:#1e5a2c; font-size:12.5px; padding:6px 0;">All expected decision criteria were covered in the sources reviewed.</div>`;
      } else {
        gapsOverviewHtml = R.gaps.slice(0, 4).map(g => `
          <div class="overview-item">
            <div><b style="color:var(--ink);">${esc(g.label)}</b>: <span style="color:#8c2e26; font-size:11.5px; font-weight:600;">Not found in sources reviewed</span></div>
            <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Why it matters: ${esc(g.why || 'Critical decision requirement.')}</div>
          </div>
        `).join('');
        if (R.gaps.length > 4) {
          gapsOverviewHtml += `<div style="font-size:11.5px; color:var(--brand-dark); font-weight:600; margin-top:8px; cursor:pointer;" onclick="switchIntelTab('gaps')">+ View ${R.gaps.length - 4} more potential gaps &rarr;</div>`;
        }
      }

      // Card 2: Conflicting Information (with Side-by-Side Word Diff)
      let conflictsOverviewHtml = '';
      if (!R.conflicts || !R.conflicts.length) {
        conflictsOverviewHtml = `<div style="color:#1e5a2c; font-size:12.5px; padding:6px 0;">No contradictory claims detected between sources.</div>`;
      } else {
        conflictsOverviewHtml = R.conflicts.slice(0, 3).map((c, idx) => {
          const diff = computeWordDiff(c.a.quote || c.a.value || '', c.b.quote || c.b.value || '');
          const aTitle = esc(c.a.source_title || c.a.source_id);
          const bTitle = esc(c.b.source_title || c.b.source_id);
          return `
            <div class="overview-item">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <b style="color:var(--ink); font-size:13px;">${esc(c.label)}</b>
                <span class="cell-badge" style="background:#faeaeb; color:#82202b;">CONFLICT</span>
              </div>
              <div class="diff-box-grid" style="margin:4px 0 6px 0;">
                <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote || c.a.value)})" title="Click to view highlighted in source document">
                  <div class="diff-card-header">
                    <span>${aTitle}</span>
                    <span style="font-size:9.5px; color:#982820; font-weight:700;">SOURCE A • READ &rarr;</span>
                  </div>
                  <div>${diff.diffA}</div>
                </div>
                <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote || c.b.value)})" title="Click to view highlighted in source document">
                  <div class="diff-card-header">
                    <span>${bTitle}</span>
                    <span style="font-size:9.5px; color:#1b6338; font-weight:700;">SOURCE B • READ &rarr;</span>
                  </div>
                  <div>${diff.diffB}</div>
                </div>
              </div>
              <div style="font-size:11.5px; color:var(--muted);">${esc(c.explanation || '')}</div>
            </div>
          `;
        }).join('');
      }


      // Card 3: Potentially Outdated
      let outdatedOverviewHtml = '';
      if (!R.outdated || !R.outdated.length) {
        outdatedOverviewHtml = `<div style="color:#1e5a2c; font-size:12.5px; padding:6px 0;">All reviewed sources and calendar dates appear current.</div>`;
      } else {
        outdatedOverviewHtml = R.outdated.slice(0, 3).map(o => `
          <div class="overview-item">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
              <b>${esc(o.title || o.source_id)}</b>
              <span class="cell-badge ${o.severity === 'high' ? 'badge-miss' : 'badge-uncertain'}">${esc(o.severity.toUpperCase())}</span>
            </div>
            <div style="font-size:12px; color:var(--muted);">${esc(o.reason)}</div>
          </div>
        `).join('');
      }

      // Card 4: What to Verify Next
      let verifyOverviewHtml = '';
      if (!R.verify_next || !R.verify_next.length) {
        verifyOverviewHtml = `<div style="color:#1e5a2c; font-size:12.5px; padding:6px 0;">No critical follow-up verification required.</div>`;
      } else {
        verifyOverviewHtml = R.verify_next.slice(0, 4).map(v => {
          const pColor = v.priority === 'P1' ? '#b91c1c' : v.priority === 'P2' ? '#b45309' : '#49634d';
          return `
            <div class="overview-item">
              <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
                <input type="checkbox" style="margin-top:2px; accent-color:var(--brand-dark);" />
                <div>
                  <span style="font-weight:700; font-size:10.5px; color:${pColor}; margin-right:4px;">[${esc(v.priority)}]</span>
                  <span style="font-size:12px; color:var(--ink); font-weight:500;">${esc(v.action)}</span>
                </div>
              </label>
            </div>
          `;
        }).join('');
      }

      const usableSources = R.sources.filter(s => s.ok);

      document.getElementById('overview-content').innerHTML = `
        <div class="completeness-banner">
          <div>
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin-bottom:4px;">
              Information Completeness Status
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              ${completenessBadge}
              <span style="font-size:13px; color:var(--ink);">${st.covered} of ${st.fields} criteria verified (${coveragePct}%)</span>
            </div>
          </div>
          <div style="min-width:220px; flex:1; max-width:320px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:4px;">
              <span>Verified Coverage</span>
              <span>${coveragePct}%</span>
            </div>
            <div style="background:#e8ece5; height:7px; border-radius:99px; overflow:hidden;">
              <div style="background:var(--brand-dark); width:${coveragePct}%; height:100%; border-radius:99px;"></div>
            </div>
          </div>
        </div>

        <div class="overview-grid">
          <div class="overview-card">
            <div class="overview-card-header">
              <span class="overview-card-title">
                <span class="status-dot" style="background:#8c2e26;"></span>
                Potential Information Gaps
              </span>
              <span class="cell-badge badge-miss">${(R.gaps || []).length} Detected</span>
            </div>
            <div>${gapsOverviewHtml}</div>
          </div>

          <div class="overview-card">
            <div class="overview-card-header">
              <span class="overview-card-title">
                <span class="status-dot" style="background:#b45309;"></span>
                Conflicting Information
              </span>
              <span class="cell-badge" style="background:#faeaeb; color:#82202b;">${(R.conflicts || []).length} Disputed</span>
            </div>
            <div>${conflictsOverviewHtml}</div>
          </div>

          <div class="overview-card">
            <div class="overview-card-header">
              <span class="overview-card-title">
                <span class="status-dot" style="background:#c084fc;"></span>
                Potentially Outdated
              </span>
              <span class="cell-badge badge-uncertain">${(R.outdated || []).length} Warnings</span>
            </div>
            <div>${outdatedOverviewHtml}</div>
          </div>

          <div class="overview-card">
            <div class="overview-card-header">
              <span class="overview-card-title">
                <span class="status-dot" style="background:#1e5f32;"></span>
                What to Verify Next
              </span>
              <span class="cell-badge badge-sourced">${(R.verify_next || []).length} Actions</span>
            </div>
            <div>${verifyOverviewHtml}</div>
          </div>
        </div>

        <!-- Deterministic Source Authority & Credibility Audit -->
        <div class="credibility-strip">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <b style="color:var(--ink); font-size:13.5px;">Deterministic Source Authority & Credibility Audit</b>
              <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Calculated mechanically via cryptographic SSL check, government/academic domain registry, timestamp verification, and corpus depth heuristics (0 AI Tokens).</div>
            </div>
            <span class="cell-badge badge-sourced">Deterministic Web Security Layer</span>
          </div>
          <div class="credibility-grid">
            ${usableSources.map(s => {
              const cred = s.credibility || {};
              const offTag = s.is_official ? '<span style="color:#1f7a4d; font-weight:700; margin-left:4px;">(Official)</span>' : '';
              const trapInfo = s.trap_clauses || (R.trap_clauses && R.trap_clauses.by_source ? R.trap_clauses.by_source[s.id] : null);
              const trapBox = renderTrapWarningBox(trapInfo);
              return `
                <div class="cred-item-card">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                    <div>
                      <b style="color:var(--ink); font-size:12.5px;">${esc(s.id)}: ${esc((s.title || s.id).slice(0, 28))}${offTag}</b>
                      <div style="font-size:11px; color:var(--muted);">${esc(cred.domain || (s.kind === 'pasted' ? 'Pasted Text Document' : 'Uploaded File'))}</div>
                    </div>
                    <span class="cell-badge ${cred.badge_class || 'badge-med-trust'}">${cred.score || 50}% ${cred.badge_label || 'Trust'}</span>
                  </div>
                  ${trapBox}
                  <div style="font-size:11px; color:var(--muted); line-height:1.45; margin-top:6px;">
                    ${(cred.flags || []).map(flg => `<div>• ${esc(flg)}</div>`).join('')}
                  </div>
                  <button type="button" class="button button-outline button-small" style="margin-top:10px; font-size:11px; width:100%; justify-content:center;" onclick="openInteractiveViewer('${s.id}', '')">
                    <span>📖 Open Interactive Source Reader</span>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="background:#f4f7f2; border:1px solid #dce5d9; border-radius:12px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:14px;">
          <div>
            <b style="color:var(--ink); font-size:13.5px;">Full Information Coverage Matrix</b>
            <div style="font-size:12px; color:var(--muted); margin-top:2px;">Compare each checklist criterion across all sources side-by-side with mechanically verified evidence quotes.</div>
          </div>
          <button type="button" class="button button-dark button-small" onclick="switchIntelTab('matrix')">
            <span>Open Coverage Matrix</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      `;

      // Default active tab to Overview & Summary
      switchIntelTab('overview');

      // 4. Panel 1: Coverage Matrix Table
      let matrixHtml = `
        <table class="matrix-table">
          <thead>
            <tr>
              <th style="min-width: 220px;">Checklist Decision Criterion</th>
              <th style="width: 75px; text-align: center;">Imp.</th>
      `;
      usableSources.forEach(s => {
        const off = s.is_official ? ' <span style="color:#1f7a4d; font-weight:700;">(Official)</span>' : '';
        const cred = s.credibility || {};
        const trapInfo = s.trap_clauses || (R.trap_clauses && R.trap_clauses.by_source ? R.trap_clauses.by_source[s.id] : null);
        const trapPill = (trapInfo && trapInfo.has_traps) 
          ? `<div style="margin-top:3px;"><span class="cell-badge" style="background:#faeaeb; color:#982820; font-size:9.5px;">⚠️ ${trapInfo.total_count} Trap Clauses</span></div>` 
          : '';
        const credHtml = cred.badge_label ? `
          <div style="margin-top:3px;">
            <span class="cell-badge ${cred.badge_class || 'badge-med-trust'}">${cred.score || 50}% ${cred.badge_label}</span>
          </div>
        ` : '';
        matrixHtml += `<th><div>${esc(s.id)}: ${esc(s.title || s.id)}${off}</div>${credHtml}${trapPill}</th>`;
      });
      matrixHtml += `</tr></thead><tbody>`;


      R.checklist.forEach(f => {
        const imp = (f.importance || 'medium').toUpperCase();
        const impColor = imp === 'HIGH' ? '#b91c1c' : imp === 'MEDIUM' ? '#b45309' : '#64748b';
        const isGap = (R.gaps || []).some(g => g.field_key === f.key);
        const isConflict = (R.conflicts || []).some(c => c.field_key === f.key);

        matrixHtml += `
          <tr class="matrix-row"
              data-key="${esc(f.key)}"
              data-importance="${esc((f.importance || 'medium').toLowerCase())}"
              data-is-gap="${isGap ? '1' : '0'}"
              data-is-conflict="${isConflict ? '1' : '0'}"
              data-label="${esc(f.label.toLowerCase())}"
              data-why="${esc((f.why || '').toLowerCase())}">
            <td>
              <b style="color:var(--ink); font-size:13.5px;">${esc(f.label)}</b>
              <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(f.why || '')}</div>
            </td>
            <td style="text-align:center; font-weight:700; font-size:11px; color:${impColor};">${imp}</td>
        `;

        usableSources.forEach(s => {
          const hit = R.findings.find(x => x.field_key === f.key && x.source_id === s.id);
          const unc = R.uncertain.find(x => x.field_key === f.key && x.source_id === s.id);

          if (hit) {
            Q.push(hit.quote);
            const qi = Q.length - 1;
            matrixHtml += `
              <td>
                <div class="cell-hit" onclick="showSource('${s.id}', ${qi})">
                  <span class="cell-badge badge-sourced">SOURCED</span>
                  <b>${esc((hit.value || "").slice(0, 48))}</b>
                  <span>"${esc((hit.quote || "").slice(0, 70))}..."</span>
                </div>
              </td>
            `;
          } else if (unc) {
            matrixHtml += `
              <td>
                <div class="cell-uncertain">
                  <span class="cell-badge badge-uncertain">UNCERTAIN</span>
                  <b>Quote unverified</b>
                  <div style="font-size:11px; margin-top:2px;">${unc.reason === 'quote_not_found_in_source' ? 'Quote unverified in text' : 'Possible omission'}</div>
                </div>
              </td>
            `;
          } else {
            matrixHtml += `
              <td>
                <div class="cell-miss">
                  <span class="cell-badge badge-miss">NOT FOUND</span>
                  <div style="font-size:11px; margin-top:2px;">Omitted in source</div>
                </div>
              </td>
            `;
          }
        });
        matrixHtml += `</tr>`;
      });
      matrixHtml += `</tbody></table>`;
      document.getElementById('matrix-wrap').innerHTML = matrixHtml;
      
      // Initialize Matrix Search & Filters
      if (document.getElementById('matrix-search-input')) {
        document.getElementById('matrix-search-input').value = '';
      }
      setMatrixFilter('all');

      // 4. Panel 2: Dark Spots / Gaps (Dense Table)
      const gapsList = document.getElementById('gaps-list');
      if (!R.gaps || !R.gaps.length) {
        gapsList.innerHTML = `<div style="padding: 24px; color: #1e5a2c; text-align: center; font-size: 13.5px;">[All Clear] No information gaps detected. All expected decision criteria were addressed in the sources.</div>`;
      } else {
        gapsList.innerHTML = `
          <table class="dense-table">
            <thead>
              <tr>
                <th style="width: 80px;">Priority</th>
                <th style="width: 220px;">Missing Criterion</th>
                <th>Decision Impact & Reason</th>
                <th style="width: 140px; text-align: right;">Finding</th>
              </tr>
            </thead>
            <tbody>
              ${R.gaps.map(g => {
                const imp = (g.importance || 'medium').toUpperCase();
                const impColor = imp === 'HIGH' ? '#b91c1c' : imp === 'MEDIUM' ? '#b45309' : '#576c5b';
                const caution = g.caution ? `<div style="font-size:11px; color:#b45309; margin-top:2px;">[Caution] Keywords mentioned without verified terms.</div>` : '';
                return `
                  <tr>
                    <td><span style="font-weight:700; font-size:11px; color:${impColor};">${imp}</span></td>
                    <td><b style="font-size:13.5px; color:var(--ink);">${esc(g.label)}</b></td>
                    <td><div style="font-size:12.5px; color:var(--muted);">${esc(g.why || 'Decision criterion.')}</div>${caution}</td>
                    <td style="text-align: right;"><span class="cell-badge badge-miss">OMITTED</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }

      // 5. Panel 3: Contradictions (Interactive Side-by-Side Word Diff Viewer)
      const conflictsList = document.getElementById('conflicts-list');
      if (!R.conflicts || !R.conflicts.length) {
        conflictsList.innerHTML = `<div style="padding: 24px; color: #1e5a2c; text-align: center; font-size: 13.5px;">[All Clear] No factual contradictions found among sources.</div>`;
      } else {
        conflictsList.innerHTML = `
          <div style="padding: 16px 20px 8px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#ffffff; border-bottom:1px solid var(--line);">
            <div style="font-size:12.5px; color:var(--muted);">
              Highlighting contradictory terms: <span class="diff-removed" style="text-decoration:none;">Red = Unique to Source A</span> and <span class="diff-added">Green = Contradictory in Source B</span>
            </div>
            <div class="diff-view-toggle">
              <button type="button" class="diff-toggle-btn is-active" id="btn-diff-mode" onclick="toggleConflictView('diff')">Word Diff</button>
              <button type="button" class="diff-toggle-btn" id="btn-raw-mode" onclick="toggleConflictView('raw')">Raw Quotes</button>
            </div>
          </div>
          <table class="dense-table" style="margin-top:0;">
            <thead>
              <tr>
                <th style="width: 180px;">Disputed Criterion</th>
                <th style="width: 100px;">Relation</th>
                <th>Side-by-Side Comparison & Contradictory Terms</th>
              </tr>
            </thead>
            <tbody>
              ${R.conflicts.map((c, idx) => {
                const diff = computeWordDiff(c.a.quote || c.a.value || '', c.b.quote || c.b.value || '');
                const aTitle = esc(c.a.source_title || c.a.source_id);
                const bTitle = esc(c.b.source_title || c.b.source_id);
                const aOff = c.a.is_official ? ' <span style="color:#1f7a4d; font-size:10px; font-weight:700;">(Official)</span>' : '';
                const bOff = c.b.is_official ? ' <span style="color:#1f7a4d; font-size:10px; font-weight:700;">(Official)</span>' : '';
                return `
                  <tr>
                    <td>
                      <b style="color:var(--ink); font-size:13.5px;">${esc(c.label)}</b>
                      <div style="font-size:11px; color:var(--muted); margin-top:3px;">Field: ${esc(c.field_key)}</div>
                    </td>
                    <td><span class="cell-badge" style="background:#f9eaec; color:#82202b;">${esc(c.relation.toUpperCase())}</span></td>
                    <td>
                      <!-- Word Diff Mode -->
                      <div class="conflict-diff-view" id="diff-view-${idx}">
                        <div class="diff-box-grid">
                          <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote || c.a.value)})" title="Click to view highlighted in source document">
                            <div class="diff-card-header">
                              <span>${aTitle}${aOff}</span>
                              <span style="font-size:9.5px; color:#982820; font-weight:700; letter-spacing:0.04em;">SOURCE A TERMS • READ &rarr;</span>
                            </div>
                            <div style="color:var(--ink); line-height:1.6;">${diff.diffA}</div>
                          </div>
                          <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote || c.b.value)})" title="Click to view highlighted in source document">
                            <div class="diff-card-header">
                              <span>${bTitle}${bOff}</span>
                              <span style="font-size:9.5px; color:#1b6338; font-weight:700; letter-spacing:0.04em;">SOURCE B CONFLICT • READ &rarr;</span>
                            </div>
                            <div style="color:var(--ink); line-height:1.6;">${diff.diffB}</div>
                          </div>
                        </div>
                      </div>

                      <!-- Raw Quotes Mode -->
                      <div class="conflict-raw-view" id="raw-view-${idx}" style="display:none; padding:6px 0;">
                        <div style="font-size:12px; margin-bottom:4px; cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote)})" title="Click to view highlighted in source document"><b>${aTitle}:</b> "${esc(c.a.quote)}" <span style="color:var(--brand-dark); font-size:11px;">&rarr;</span></div>
                        <div style="font-size:12px; margin-bottom:4px; cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote)})" title="Click to view highlighted in source document"><b>${bTitle}:</b> "${esc(c.b.quote)}" <span style="color:var(--brand-dark); font-size:11px;">&rarr;</span></div>
                      </div>

                      <div style="font-size:11.5px; color:var(--muted); margin-top:6px; background:#fafbf8; padding:8px 12px; border-radius:6px; border:1px solid #edf1eb;">
                        <b>Assessment:</b> ${esc(c.explanation || '')}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }


      // 6. Panel 4: Outdated Signals (Dense Table)
      const outdatedList = document.getElementById('outdated-list');
      if (!R.outdated || !R.outdated.length) {
        outdatedList.innerHTML = `<div style="padding: 24px; color: #1e5a2c; text-align: center; font-size: 13.5px;">[All Clear] All sources and deadlines appear current.</div>`;
      } else {
        outdatedList.innerHTML = `
          <table class="dense-table">
            <thead>
              <tr>
                <th style="width: 180px;">Source Document</th>
                <th style="width: 100px;">Severity</th>
                <th>Audit Warning Reason</th>
              </tr>
            </thead>
            <tbody>
              ${R.outdated.map(o => {
                const isHigh = o.severity === 'high';
                return `
                  <tr>
                    <td><b>${esc(o.title || o.source_id)}</b></td>
                    <td><span class="cell-badge ${isHigh ? 'badge-miss' : 'badge-uncertain'}">${esc(o.severity.toUpperCase())}</span></td>
                    <td style="font-size:12.5px; color:var(--muted);">${esc(o.reason)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }

      // 7. Panel 5: Action Steps (Interactive Progress Checklist & Clipboard Tool)
      const verifyList = document.getElementById('verify-list');
      if (!R.verify_next || !R.verify_next.length) {
        verifyList.innerHTML = `<div style="padding: 24px; color: #1e5a2c; text-align: center; font-size: 13.5px;">[All Clear] No pending verification actions needed.</div>`;
      } else {
        const totalItems = R.verify_next.length;
        verifyList.innerHTML = `
          <div class="checklist-toolbar">
            <div class="checklist-progress-wrap">
              <span class="checklist-progress-label">Verification Progress:</span>
              <div class="checklist-progress-bar">
                <div id="checklist-progress-fill" class="checklist-progress-fill" style="width: 0%;"></div>
              </div>
              <span id="checklist-progress-text" class="checklist-progress-text">0/${totalItems} Verified (0%)</span>
            </div>
            <button type="button" class="button button-outline button-small" id="btn-copy-checklist" onclick="copyChecklistToClipboard()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span id="copy-checklist-label">Copy Action Steps to Clipboard</span>
            </button>
          </div>

          <table class="dense-table" id="checklist-table">
            <thead>
              <tr>
                <th style="width: 44px; text-align: center;">Done</th>
                <th style="width: 70px;">Priority</th>
                <th style="width: 90px;">Type</th>
                <th style="width: 200px;">Criterion / Item</th>
                <th>Action Required (Next Step)</th>
              </tr>
            </thead>
            <tbody>
              ${R.verify_next.map((v, idx) => {
                const isP1 = v.priority === 'P1';
                const isP2 = v.priority === 'P2';
                const pColor = isP1 ? '#b91c1c' : isP2 ? '#b45309' : '#1e5faf';
                const badgeClass = v.type === 'conflict' ? 'badge-miss' : v.type === 'outdated' ? 'badge-uncertain' : 'badge-sourced';
                return `
                  <tr id="checklist-row-${idx}">
                    <td style="text-align: center;">
                      <input type="checkbox" id="checklist-check-${idx}" class="verify-check" onchange="updateChecklistProgress()" style="width:17px; height:17px; accent-color:#26372b; cursor:pointer;" />
                    </td>
                    <td><span style="font-weight:700; font-size:12px; color:${pColor};">[${v.priority}]</span></td>
                    <td><span class="cell-badge ${badgeClass}">${esc(v.type.toUpperCase())}</span></td>
                    <td><b class="checklist-field" style="font-size:13px; color:var(--ink);">${esc(v.field)}</b></td>
                    <td class="checklist-action" style="font-size:12.5px; color:var(--muted);">
                      ${esc(v.action)}
                      ${v.source_id && v.quote ? `<button type="button" class="button button-outline button-small" style="display:inline-flex; align-items:center; gap:4px; padding:2px 7px; font-size:11px; margin-left:8px; vertical-align:middle;" onclick="showSource('${v.source_id}', ${registerQuote(v.quote)})" title="View in Source Reader"><span>Read in Text</span> &rarr;</button>` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }

      // Render the Deterministic Critical Entities Side-by-Side Panel
      renderCriticalEntitiesPanel();
    }

    function renderCriticalEntitiesPanel() {
      const comp = R.entities_comparison || { by_source: {}, discrepancies: [] };
      const discrepancies = comp.discrepancies || [];
      const bySource = comp.by_source || {};
      const container = document.getElementById('entities-content');
      if (!container) return;

      let html = '';

      html += `
        <div style="margin-bottom: 18px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <h3 style="font-size:16px; font-weight:700; color:var(--ink); margin:0 0 4px 0; display:flex; align-items:center; gap:8px;">
                <span>⚡ Instant Critical Entities & Side-by-Side Signals</span>
                <span class="cell-badge badge-sourced" style="font-size:10.5px;">100% Deterministic (Zero-AI)</span>
              </h3>
              <p style="font-size:12.5px; color:var(--muted); margin:0;">
                Extracted instantly using rule-based parsing and pattern matching. Spot deadlines, fees, marks, helplines, and trap clauses without LLM hallucination.
              </p>
            </div>
          </div>
        </div>
      `;

      if (discrepancies.length > 0) {
        html += `
          <div class="discrepancy-banner">
            <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:#982820; font-size:13.5px; margin-bottom:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>${discrepancies.length} Direct Discrepanc${discrepancies.length === 1 ? 'y' : 'ies'} Detected Across Sources</span>
            </div>
            <p style="font-size:12px; color:#6a221a; margin:0 0 10px 0;">
              The sources disagree on key concrete values (dates, fees, or eligibility criteria). Review these carefully:
            </p>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${discrepancies.map(d => `
                <div class="discrepancy-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <b style="font-size:12.5px; color:#82202b;">${esc(d.category)}</b>
                    <span class="cell-badge" style="background:#faeaeb; color:#982820; font-size:10px;">${esc(d.severity.toUpperCase())} PRIORITY</span>
                  </div>
                  <div style="font-size:12px; color:var(--ink); font-weight:500; margin-bottom:8px;">
                    ${esc(d.detail)}
                  </div>
                  <div class="diff-box-grid" style="margin:0;">
                    <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${d.a.source_id}', ${registerQuote(d.a.snippet || d.a.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="diff-card-header">
                        <span>${esc(d.a.title)}</span>
                        <span style="font-size:9.5px; color:#982820; font-weight:700;">SOURCE A • READ &rarr;</span>
                      </div>
                      <div style="font-weight:700; color:var(--ink); font-size:12px;">${esc(d.a.value)}</div>
                      <div style="font-size:11px; color:var(--muted); margin-top:3px; line-height:1.4;">"${esc(d.a.snippet)}"</div>
                    </div>
                    <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${d.b.source_id}', ${registerQuote(d.b.snippet || d.b.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="diff-card-header">
                        <span>${esc(d.b.title)}</span>
                        <span style="font-size:9.5px; color:#1b6338; font-weight:700;">SOURCE B • READ &rarr;</span>
                      </div>
                      <div style="font-weight:700; color:var(--ink); font-size:12px;">${esc(d.b.value)}</div>
                      <div style="font-size:11px; color:var(--muted); margin-top:3px; line-height:1.4;">"${esc(d.b.snippet)}"</div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      const sourceIds = Object.keys(bySource);
      if (sourceIds.length === 0) {
        html += `<div style="color:var(--muted); font-size:13px;">No source documents were processed for entity extraction.</div>`;
      } else {
        html += `<div class="entities-deck-grid">`;
        sourceIds.forEach(sid => {
          const e = bySource[sid];
          const officialBadge = e.is_official 
            ? `<span class="cell-badge badge-sourced" style="font-size:10px;">Official Source</span>`
            : `<span class="cell-badge badge-uncertain" style="font-size:10px;">Secondary / Unofficial</span>`;

          html += `
            <div class="entity-source-column">
              <div class="entity-source-header">
                <div>
                  <b style="font-size:14px; color:var(--ink);">${esc(e.title || sid)}</b>
                  <div style="font-size:11px; color:var(--muted);">${esc(sid)}</div>
                </div>
                ${officialBadge}
              </div>

              <!-- Trap Clauses Warning Box -->
              ${renderTrapWarningBox(R.trap_clauses && R.trap_clauses.by_source ? R.trap_clauses.by_source[sid] : null)}

              <!-- Dates & Deadlines -->
              <div class="entity-group">
                <div class="entity-group-title">
                  <span>📅 Deadlines & Dates (${(e.deadlines || []).length})</span>
                </div>
                ${(!e.deadlines || !e.deadlines.length) ? `<div style="font-size:11.5px; color:var(--muted); font-style:italic;">No dates detected</div>` : 
                  e.deadlines.map(d => {
                    const isExp = d.status === 'expired';
                    const isUp = d.status === 'upcoming';
                    const statusBadge = isExp
                      ? `<span class="cell-badge badge-miss" style="font-size:9.5px;">EXPIRED</span>`
                      : isUp
                      ? `<span class="cell-badge badge-sourced" style="font-size:9.5px;">UPCOMING</span>`
                      : `<span class="cell-badge badge-uncertain" style="font-size:9.5px;">MENTIONED</span>`;
                    return `
                      <div class="entity-item-card" onclick="showSource('${sid}', ${registerQuote(d.snippet || d.value)})" title="Click to view highlighted in interactive source reader">
                        <div class="entity-val-row">
                          <span class="entity-value-highlight">${esc(d.value)}</span>
                          <div style="display:flex; align-items:center; gap:5px;">
                            ${statusBadge}
                            <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">&rarr;</span>
                          </div>
                        </div>
                        <div class="entity-snippet-sub">"${esc(d.snippet)}"</div>
                      </div>
                    `;
                  }).join('')
                }
              </div>

              <!-- Fees & Amounts -->
              <div class="entity-group">
                <div class="entity-group-title">
                  <span>💰 Fees & Income Limits (${(e.amounts || []).length})</span>
                </div>
                ${(!e.amounts || !e.amounts.length) ? `<div style="font-size:11.5px; color:var(--muted); font-style:italic;">No fees or monetary values detected</div>` :
                  e.amounts.map(a => `
                    <div class="entity-item-card" onclick="showSource('${sid}', ${registerQuote(a.snippet || a.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="entity-val-row">
                        <span class="entity-value-highlight">${esc(a.value)}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                          <span class="cell-badge" style="background:#f3f4f6; color:#374151; font-size:9.5px;">${esc(a.category)}</span>
                          <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">&rarr;</span>
                        </div>
                      </div>
                      <div class="entity-snippet-sub">"${esc(a.snippet)}"</div>
                    </div>
                  `).join('')
                }
              </div>

              <!-- Marks, Percentages & Age Criteria -->
              <div class="entity-group">
                <div class="entity-group-title">
                  <span>🎯 Marks & Age Criteria (${(e.eligibility || []).length})</span>
                </div>
                ${(!e.eligibility || !e.eligibility.length) ? `<div style="font-size:11.5px; color:var(--muted); font-style:italic;">No marks or age criteria detected</div>` :
                  e.eligibility.map(el => `
                    <div class="entity-item-card" onclick="showSource('${sid}', ${registerQuote(el.snippet || el.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="entity-val-row">
                        <span class="entity-value-highlight">${esc(el.value)}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                          <span class="cell-badge" style="background:#eef2ff; color:#3730a3; font-size:9.5px;">${esc(el.type)}</span>
                          <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">&rarr;</span>
                        </div>
                      </div>
                      <div class="entity-snippet-sub">"${esc(el.snippet)}"</div>
                    </div>
                  `).join('')
                }
              </div>

              <!-- Official Contacts & Helplines -->
              <div class="entity-group">
                <div class="entity-group-title">
                  <span>📞 Helplines & Contacts (${(e.contacts || []).length})</span>
                </div>
                ${(!e.contacts || !e.contacts.length) ? `<div style="font-size:11.5px; color:var(--muted); font-style:italic;">No helplines or contact emails detected</div>` :
                  e.contacts.map(c => `
                    <div class="entity-item-card" onclick="showSource('${sid}', ${registerQuote(c.snippet || c.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="entity-val-row">
                        <span class="entity-value-highlight" style="font-family:monospace; font-size:12px;">${esc(c.value)}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                          <span class="cell-badge ${c.is_official ? 'badge-sourced' : 'badge-uncertain'}" style="font-size:9.5px;">${esc(c.badge)}</span>
                          <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">&rarr;</span>
                        </div>
                      </div>
                      <div class="entity-snippet-sub">"${esc(c.snippet)}"</div>
                    </div>
                  `).join('')
                }
              </div>

              <!-- Trap Clauses & Fine Print -->
              <div class="entity-group">
                <div class="entity-group-title">
                  <span>⚠️ Trap Clauses & Fine Print (${(e.fine_print || []).length})</span>
                </div>
                ${(!e.fine_print || !e.fine_print.length) ? `<div style="font-size:11.5px; color:#1e5a2c; font-style:italic;">No high-risk trap clauses flagged</div>` :
                  e.fine_print.map(f => `
                    <div class="entity-item-card" style="border-left: 3px solid #b91c1c;" onclick="showSource('${sid}', ${registerQuote(f.snippet || f.label)})" title="Click to view highlighted in interactive source reader">
                      <div class="entity-val-row">
                        <span style="font-weight:700; color:#b91c1c; font-size:11.5px;">${esc(f.label)}</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                          <span class="cell-badge" style="background:#faeaeb; color:#982820; font-size:9.5px;">${esc(f.category)}</span>
                          <span style="font-size:10.5px; color:var(--brand-dark); font-weight:600;">&rarr;</span>
                        </div>
                      </div>
                      <div class="entity-snippet-sub">"${esc(f.snippet)}"</div>
                    </div>
                  `).join('')
                }
              </div>

            </div>
          `;
        });
        html += `</div>`;
      }

      container.innerHTML = html;
    }

    // SoniX Privacy Modal Handlers
    function openPrivacyModal() {
      const modal = document.getElementById('privacy-modal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closePrivacyModal() {
      const modal = document.getElementById('privacy-modal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    function handleModalBackdropClick(event) {
      if (event.target && event.target.id === 'privacy-modal') {
        closePrivacyModal();
      }
    }

    // -------------------------------------------------------------
    // Local History & Snapshot Restore (Browser localStorage)
    // -------------------------------------------------------------
    const HISTORY_STORAGE_KEY = "darkspot_history";

    function getHistoryList() {
      try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveSnapshotToHistory(report, topic, urls = [], pastedRaw = "") {
      if (!report) return;
      try {
        const list = getHistoryList();
        const now = new Date();
        const formattedDate = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + now.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const cleanTopic = (topic || report.topic || "Untitled Investigation").trim();
        const item = {
          id: "snap_" + Date.now(),
          timestamp: Date.now(),
          dateStr: formattedDate,
          topic: cleanTopic,
          sourceCount: (report.sources || []).length,
          gapCount: (report.dark_spots || []).length,
          conflictCount: (report.conflicts || []).length,
          data: report,
          urlsText: Array.isArray(urls) ? urls.join('\n') : (urls || ""),
          pastedText: pastedRaw || ""
        };
        const filtered = list.filter(x => x.topic.toLowerCase() !== cleanTopic.toLowerCase());
        const updated = [item, ...filtered].slice(0, 15);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
        updateHistoryUI();
      } catch (e) {
        console.warn("Unable to save snapshot to localStorage:", e);
      }
    }

    function restoreSnapshot(id) {
      const list = getHistoryList();
      const found = list.find(x => x.id === id);
      if (!found || !found.data) return;

      R = found.data;
      if (found.topic) {
        const topicEl = document.getElementById('topic');
        if (topicEl) topicEl.value = found.topic;
      }
      if (found.urlsText) {
        const urlsEl = document.getElementById('urls');
        if (urlsEl) urlsEl.value = found.urlsText;
      }
      if (found.pastedText) {
        const pastedEl = document.getElementById('pasted_text');
        if (pastedEl) pastedEl.value = found.pastedText;
      }

      render();
      closeHistoryDrawer();
      setStatus(`[Restored] Snapshot "${found.topic}" loaded in 0ms (0 tokens consumed).`);
      const resultsEl = document.getElementById('results-container');
      if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth' });
    }

    function deleteSnapshot(id, event) {
      if (event) event.stopPropagation();
      const list = getHistoryList().filter(x => x.id !== id);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
      updateHistoryUI();
    }

    function clearAllHistory() {
      if (confirm("Clear all saved comparison snapshots from browser storage?")) {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        updateHistoryUI();
      }
    }

    async function loadSampleDemo() {
      try {
        const res = await fetch("/public/data/scholarship_sample.json");
        if (!res.ok) throw new Error("Could not load sample data");
        const sampleData = await res.json();
        saveSnapshotToHistory(sampleData, sampleData.topic, [
          "https://scholarships.gov.in/guidelines",
          "https://university-updates.ac.in/scholarship-notice",
          "https://scholarship-alerts.blogspot.com/post-matric"
        ], "");
        restoreSnapshot(getHistoryList()[0].id);
      } catch (err) {
        alert("Sample load notice: " + err.message);
      }
    }

    function openHistoryDrawer() {
      const drawer = document.getElementById('history-drawer');
      const backdrop = document.getElementById('history-backdrop');
      updateHistoryUI();
      if (drawer && backdrop) {
        backdrop.style.display = 'block';
        drawer.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeHistoryDrawer() {
      const drawer = document.getElementById('history-drawer');
      const backdrop = document.getElementById('history-backdrop');
      if (drawer && backdrop) {
        drawer.classList.remove('is-open');
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    function updateHistoryUI() {
      const list = getHistoryList();
      const countNav = document.getElementById('history-nav-count');
      const countStudio = document.getElementById('history-studio-count');
      const countFooter = document.getElementById('history-footer-count');
      if (countNav) countNav.textContent = list.length;
      if (countStudio) countStudio.textContent = list.length;
      if (countFooter) countFooter.textContent = `${list.length} saved comparisons`;

      const listContainer = document.getElementById('history-drawer-list');
      if (!listContainer) return;

      if (!list.length) {
        listContainer.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: var(--muted);">
            <div style="margin-bottom: 12px; opacity: 0.6;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p style="font-size: 13.5px; font-weight: 500; color: var(--ink); margin-bottom: 6px;">No Saved Comparisons Yet</p>
            <p style="font-size: 11.5px; line-height: 1.6; margin-bottom: 18px;">Every research run is automatically cached in your browser. Or load our pre-configured demo comparison:</p>
            <button type="button" class="button button-outline button-small" onclick="loadSampleDemo()" style="font-size: 11.5px; margin: 0 auto;">
              <span>Pre-load Scholarship Demo Run</span>
            </button>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = list.map(item => `
        <div class="history-card" onclick="restoreSnapshot('${item.id}')">
          <div class="history-card-top">
            <span class="history-card-topic">${esc(item.topic)}</span>
            <button class="history-card-del" onclick="deleteSnapshot('${item.id}', event)" title="Delete snapshot">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="history-card-meta">
            <span class="history-card-date">${esc(item.dateStr)}</span>
            <div class="history-card-badges">
              <span class="h-badge">${item.sourceCount} sources</span>
              <span class="h-badge h-badge-gap">${item.gapCount} gaps</span>
              <span class="h-badge h-badge-conflict">${item.conflictCount} conflicts</span>
            </div>
          </div>
          <div class="history-card-actions">
            <span class="history-restore-link">Click to Restore (0s) &rarr;</span>
          </div>
        </div>
      `).join('');
    }

    // Initialize history UI count on page load
    window.addEventListener('DOMContentLoaded', () => {
      updateHistoryUI();
      if (getHistoryList().length === 0) {
        fetch('/public/data/scholarship_sample.json')
          .then(r => r.json())
          .then(d => {
            saveSnapshotToHistory(d, d.topic, [
              "https://scholarships.gov.in/guidelines",
              "https://university-updates.ac.in/scholarship-notice",
              "https://scholarship-alerts.blogspot.com/post-matric"
            ], "");
          })
          .catch(() => {});
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePrivacyModal();
        closeDrawer();
        closeHistoryDrawer();
      }
    });
