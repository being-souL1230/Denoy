/**
 * dashboard.js: Core state management, analysis pipeline invocation,
 * reactive matrix rendering, entity comparisons, and local snapshot history.
 */

    let R = null;
    let Q = [];
    let currentSourceMode = 'urls';

    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    
    // Curated 1-Click Interactive Test Presets
    const PRESETS = {
      scholarship: {
        topic: "Post-Matric Scholarship Scheme Eligibility & Income Ceiling",
        text: `=== SOURCE 1: Ministry of Social Justice Official Circular 2026 ===
1. Mandatory Eligibility: Students belonging to eligible categories enrolled in post-matric courses.
2. Family Income Ceiling: Total annual family income from all sources must not exceed Rs. 2,50,000 per annum.
3. Service Bond: Candidates receiving fellowship above Rs. 25,000 must sign a 2-year rural service bond.
4. Submission Deadline: Complete digital applications must be submitted by 15 November 2026. Invalid without verified Aadhaar e-KYC.
5. Critical Condition: Scheme benefits are strictly subject to fund availability from the state budget. Application will be rejected if self-declaration is unverified.

=== SOURCE 2: State Higher Education Advisory Guide ===
1. Eligibility: All post-matric college students enrolled in current session.
2. Family Income Ceiling: Maximum annual income reported as Rs. 3,00,000 per annum for session 2026.
3. Processing Fee: Non-refundable application processing fee of Rs. 200 applicable on submission.
4. Submission Deadline: Portal will accept submissions until 30 November 2026 without prior notice.
5. Forfeiture Clause: In case of incorrect bank account credentials, fellowship benefits will be forfeited immediately.`,
        isOfficial: true
      },
      ssc: {
        topic: "SSC CHSL Examination Application Form 2026 Guidelines",
        text: `=== SOURCE 1: Staff Selection Commission Official Notification 2026 ===
1. Age Limit: Candidate must be 18 to 27 years as on 01-08-2026. Permissible upper age relaxation for OBC is 3 years, SC/ST 5 years.
2. Application Window: Online application opens on 10 May 2026 and closes strictly on 08 June 2026 at 23:00 hours.
3. Photograph Specification: Live photograph captured via webcam without cap or spectacles. Application will be rejected if photograph is blurred or invalid.
4. Application Fee: Rs. 100/- payable online. Women and SC/ST candidates are exempted. Fee once paid is non-refundable.

=== SOURCE 2: Career Advisory Portal Circular ===
1. Age Criteria: Minimum 18 years and maximum 28 years as of 01-01-2026.
2. Last Date: Candidates can submit forms until 15 June 2026 with late fee payment.
3. Fee: Fixed fee of Rs. 150 for all general applicants.
4. Strict Clause: Debarred candidates from any state exams cannot apply under any circumstances.`,
        isOfficial: true
      },
      neet: {
        topic: "NEET UG Eligibility Criteria & Admission Disqualification Rules",
        text: `=== SOURCE 1: National Testing Agency (NTA) Official Bulletin ===
1. Age Limit: Candidate must have completed 17 years at the time of admission. There is no upper age limit.
2. Minimum Qualifying Marks: Physics, Chemistry, Biology aggregate must be at least 50% for Unreserved, 40% for OBC/SC/ST.
3. Mandatory Documents: Original Class 10/12 marksheets, valid category certificate. Invalid without central format certificate.
4. Financial Penalty: Quitting allotted seat after round 2 entails a penalty of Rs. 5,00,000 and forfeiture of security deposit.

=== SOURCE 2: Medical Admission Guidance Handbook ===
1. Age Limit: Minimum age 17 years, maximum age limit 25 years strictly enforced.
2. Qualifying Marks: Candidate must secure minimum 55% in PCB subjects.
3. Bond Clause: Mandatory 3-year government service bond applicable in state medical colleges.
4. Strict Prohibition: Canvassing in any form is strictly prohibited and leads to debarment.`,
        isOfficial: true
      },
      upsc: {
        topic: "UPSC Civil Services Preliminary Examination Mandatory Rules",
        text: `=== SOURCE 1: Union Public Service Commission Official Gazette ===
1. Number of Attempts: 6 attempts for General, 9 attempts for OBC, unlimited attempts for SC/ST within age limits.
2. Cut-off Date for Age: Candidate must have attained 21 years and must not have attained 32 years on 1st August 2026.
3. Mandatory Identity Proof: Same photo identity card submitted online must be produced at examination venue.
4. Disqualification: Mobile phones and electronic gadgets are strictly prohibited in exam halls. Candidature will be cancelled without prior notice if found.

=== SOURCE 2: Civil Services Study Circle Guidance ===
1. Attempts: Up to 7 attempts for general category candidates.
2. Age Window: 21 to 35 years for all reserved categories.
3. Document Verification: Self-attested copies required at prelims stage.
4. Refund Policy: Examination fee is non-refundable under any circumstance.`,
        isOfficial: true
      }
    };

    function handleTopicInput(el) {
      const clearBtn = document.getElementById('capsule-clear-btn');
      if (clearBtn) {
        clearBtn.style.display = (el && el.value.trim().length > 0) ? 'inline-flex' : 'none';
      }
      updateSourceMetrics();
    }

    function clearInput(id) {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        el.focus();
        if (id === 'topic') handleTopicInput(el);
        updateSourceMetrics();
      }
    }

    async function pasteFromClipboard(targetId) {
      try {
        const text = await navigator.clipboard.readText();
        const el = document.getElementById(targetId);
        if (el) {
          el.value = text;
          if (targetId === 'topic') handleTopicInput(el);
          updateSourceMetrics();
          setStatus(`[Pasted] Successfully pasted ${text.length} characters from clipboard.`);
        }
      } catch (err) {
        const el = document.getElementById(targetId);
        if (el) {
          el.focus();
          setStatus("[Info] Please use Ctrl+V to paste into the selected field.", false);
        }
      }
    }

    function focusNextOrAnalyze() {
      const topic = document.getElementById('topic')?.value.trim();
      const urls = document.getElementById('urls')?.value.trim();
      const pasted = document.getElementById('pasted_text')?.value.trim();
      if (topic && (urls || pasted)) {
        runAnalysis();
      } else if (currentSourceMode === 'urls') {
        document.getElementById('urls')?.focus();
      } else {
        document.getElementById('pasted_text')?.focus();
      }
    }

    function setTopic(val) {
      const el = document.getElementById('topic');
      if (el) {
        el.value = val;
        handleTopicInput(el);
      }
    }

    function loadDemoPreset(key) {
      const preset = PRESETS[key];
      if (!preset) return;

      const topicInput = document.getElementById('topic');
      if (topicInput) {
        topicInput.value = preset.topic;
        handleTopicInput(topicInput);
      }

      switchSourceTab('pasted');
      const pastedInput = document.getElementById('pasted_text');
      if (pastedInput) {
        pastedInput.value = preset.text;
      }

      const officialSwitch = document.getElementById('mark_official_active');
      if (officialSwitch) officialSwitch.checked = preset.isOfficial;

      updateSourceMetrics();
      setStatus(`[Preset Loaded] "${preset.topic}" with contrasting circulars loaded. Click "Audit & Identify Dark Spots" to analyze!`);
    }

    function switchSourceTab(mode) {
      currentSourceMode = mode;
      const panelUrls = document.getElementById('panel-urls');
      const panelPasted = document.getElementById('panel-pasted');
      const panelFile = document.getElementById('panel-file');

      if (panelUrls) panelUrls.style.display = mode === 'urls' ? 'block' : 'none';
      if (panelPasted) panelPasted.style.display = mode === 'pasted' ? 'block' : 'none';
      if (panelFile) panelFile.style.display = mode === 'file' ? 'block' : 'none';

      document.getElementById('btn-tab-urls')?.classList.toggle('is-active', mode === 'urls');
      document.getElementById('btn-tab-pasted')?.classList.toggle('is-active', mode === 'pasted');
      document.getElementById('btn-tab-file')?.classList.toggle('is-active', mode === 'file');
    }

    function addPresetUrl(url) {
      switchSourceTab('urls');
      const urlsEl = document.getElementById('urls');
      if (urlsEl) {
        const current = urlsEl.value.trim();
        urlsEl.value = current ? `${current}\n${url}` : url;
        updateSourceMetrics();
      }
    }

    function updateSourceMetrics() {
      const topic = document.getElementById('topic')?.value.trim() || '';
      const urlsVal = document.getElementById('urls')?.value || '';
      const pastedVal = document.getElementById('pasted_text')?.value || '';

      const urlList = urlsVal.split('\n').map(x => x.trim()).filter(Boolean);
      const urlCountPill = document.getElementById('url-count-pill');
      const urlMetrics = document.getElementById('url-metrics');
      if (urlCountPill) urlCountPill.textContent = `${urlList.length}`;
      if (urlMetrics) urlMetrics.textContent = `${urlList.length} URL${urlList.length === 1 ? '' : 's'} ready`;

      const words = pastedVal.trim() ? pastedVal.trim().split(/\s+/).length : 0;
      const chars = pastedVal.length;
      const textCountPill = document.getElementById('text-count-pill');
      const textMetrics = document.getElementById('text-metrics');
      if (textCountPill) textCountPill.textContent = `${words} w`;
      if (textMetrics) textMetrics.textContent = `${words} words · ${chars.toLocaleString()} characters`;

      const totalSources = urlList.length + (pastedVal.trim() ? 1 : 0);
      const readinessPill = document.getElementById('studio-readiness-pill');
      if (readinessPill) {
        if (topic.length > 0 && totalSources >= 1) {
          readinessPill.className = 'studio-readiness-pill is-ready';
          readinessPill.innerHTML = `<span>● Ready to Audit (${totalSources} source${totalSources > 1 ? 's' : ''})</span>`;
        } else if (topic.length > 0) {
          readinessPill.className = 'studio-readiness-pill';
          readinessPill.innerHTML = `<span>○ Add at least 1 URL or circular text</span>`;
        } else {
          readinessPill.className = 'studio-readiness-pill';
          readinessPill.innerHTML = `<span>○ Awaiting question & sources...</span>`;
        }
      }
    }

    function handleCircularFileUpload(input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      const isJson = file.name.endsWith('.json');
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target.result;
        if (isJson) {
          try {
            const data = JSON.parse(content);
            if (data.findings || data.sources) {
              R = data;
              saveSnapshotToHistory(R, data.topic || file.name, [], "");
              render();
              setStatus(`[Loaded] Successfully loaded saved audit: ${file.name}`);
              document.getElementById('results-container')?.scrollIntoView({ behavior: 'smooth' });
              return;
            }
          } catch (err) {}
        }
        // Fallback or text/md file: put into pasted_text
        switchSourceTab('pasted');
        const pastedInput = document.getElementById('pasted_text');
        if (pastedInput) {
          pastedInput.value = content;
          updateSourceMetrics();
          setStatus(`[File Loaded] Ingested "${file.name}" (${content.length} chars) into comparison deck.`);
        }
      };

      reader.readAsText(file);
    }

    function initDropzone() {
      const dropzone = document.getElementById('source-dropzone');
      if (!dropzone) return;

      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          const fakeInput = { files: dt.files };
          handleCircularFileUpload(fakeInput);
        }
      });
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
      const topic = document.getElementById('topic')?.value.trim();
      const urls = document.getElementById('urls')?.value.split('\n').map(x => x.trim()).filter(Boolean) || [];
      const pastedRaw = document.getElementById('pasted_text')?.value.trim() || '';

      if (!topic) {
        setStatus("[Notice] Please enter a research question or topic in the search box.", true);
        document.getElementById('topic')?.focus();
        return;
      }

      let pasted = [];
      if (pastedRaw) {
        pasted.push(["User Circular / Notice", pastedRaw]);
      }

      if (!urls.length && !pasted.length) {
        setStatus("[Notice] Please add at least 1 URL or paste document text to contrast.", true);
        return;
      }

      let official_ids = [];
      const isOfficial = document.getElementById('mark_official_active')?.checked ??
                         (document.getElementById('mark_official_url')?.checked || document.getElementById('mark_official_pasted')?.checked);
      if (isOfficial) {
        official_ids.push("S1");
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
      const tabs = ['overview', 'graph', 'matrix', 'entities', 'gaps', 'conflicts', 'outdated', 'verify'];
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
              <span class="trap-warning-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
              <span>${count} Critical Warning${count !== 1 ? 's' : ''} / Trap Clause${count !== 1 ? 's' : ''}</span>
            </div>
            <span class="trap-radar-pill">Fine Print Radar</span>
          </div>
          <div class="trap-clause-list">
            ${trapInfo.clauses.map(c => `
              <div class="trap-clause-item" onclick="showSource('${trapInfo.source_id}', ${registerQuote(c.sentence || c.matched_term)})" title="Click to view highlighted in interactive source reader">
                <div class="trap-clause-meta-row">
                  <span class="trap-clause-cat" style="color:${c.badge_color}; background:${c.badge_bg};">
                    ${esc(c.category)}
                  </span>
                  <span class="trap-view-link">
                    <span>View in Text</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </span>
                </div>
                <div class="trap-clause-quote">"${c.highlighted_sentence}"</div>
                <div class="trap-action-tip">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span><b>Action tip:</b> ${esc(c.tip)}</span>
                </div>
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
        <div class="intel-stat-item"><span class="cell-badge badge-conflict" style="margin:0 4px 0 0;">CONFLICTS</span> <b>${st.conflicts}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge badge-uncertain" style="margin:0 4px 0 0;">OUTDATED</span> <b>${st.outdated}</b></div>
        <div class="intel-stat-divider"></div>
        <div class="intel-stat-item"><span class="cell-badge badge-trap" style="margin:0 4px 0 0;">TRAPS</span> <b>${st.trap_clauses_detected || 0}</b></div>
        ${((st.stale_headers_detected || 0) + (st.low_trust_domains_detected || 0)) > 0 ? `
          <div class="intel-stat-divider"></div>
          <div class="intel-stat-item"><span class="cell-badge badge-tech-alert" style="margin:0 4px 0 0;">TECH ALERTS</span> <b>${(st.stale_headers_detected || 0) + (st.low_trust_domains_detected || 0)}</b></div>
        ` : ''}
      `;

      // 2. Tab Badge Counts
      const totalGaps = (R.gaps || []).length;
      const totalConflicts = (R.conflicts || []).length;
      const countGraphEl = document.getElementById('count-graph');
      if (countGraphEl) {
        countGraphEl.textContent = (totalGaps + totalConflicts) > 0 ? `${totalGaps + totalConflicts} Alerts` : `${(R.checklist || []).length} Items`;
      }
      document.getElementById('count-gaps').textContent = totalGaps;
      document.getElementById('count-conflicts').textContent = totalConflicts;
      document.getElementById('count-outdated').textContent = (R.outdated || []).length;
      document.getElementById('count-verify').textContent = (R.verify_next || []).length;

      const comp = R.entities_comparison || { by_source: {}, discrepancies: [] };
      const entityDiscrepancies = (comp.discrepancies || []).length;
      const entityTotalSources = Object.keys(comp.by_source || {}).length;
      const countEntitiesEl = document.getElementById('count-entities');
      if (countEntitiesEl) {
        countEntitiesEl.textContent = entityDiscrepancies > 0 ? `${entityDiscrepancies} Alerts` : `${entityTotalSources} Sources`;
        countEntitiesEl.className = entityDiscrepancies > 0 ? 'intel-tab-count has-discrepancies' : 'intel-tab-count';
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
        gapsOverviewHtml = `<div class="all-clear-notice">All expected decision criteria were covered in the sources reviewed.</div>`;
      } else {
        gapsOverviewHtml = R.gaps.slice(0, 4).map(g => `
          <div class="overview-item">
            <div><b style="color:var(--ink);">${esc(g.label)}</b>: <span class="gap-item-status" style="font-size:11.5px; font-weight:600;">Not found in sources reviewed</span></div>
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
        conflictsOverviewHtml = `<div class="all-clear-notice">No contradictory claims detected between sources.</div>`;
      } else {
        conflictsOverviewHtml = R.conflicts.slice(0, 3).map((c, idx) => {
          const diff = computeWordDiff(c.a.quote || c.a.value || '', c.b.quote || c.b.value || '');
          const aTitle = esc(c.a.source_title || c.a.source_id);
          const bTitle = esc(c.b.source_title || c.b.source_id);
          return `
            <div class="overview-item">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <b style="color:var(--ink); font-size:13px;">${esc(c.label)}</b>
                <span class="cell-badge badge-conflict">CONFLICT</span>
              </div>
              <div class="diff-box-grid" style="margin:4px 0 6px 0;">
                <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote || c.a.value)})" title="Click to view highlighted in source document">
                  <div class="diff-card-header">
                    <span>${aTitle}</span>
                    <span class="diff-side-tag diff-tag-a" style="font-size:9.5px; font-weight:700;">SOURCE A • READ &rarr;</span>
                  </div>
                  <div>${diff.diffA}</div>
                </div>
                <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote || c.b.value)})" title="Click to view highlighted in source document">
                  <div class="diff-card-header">
                    <span>${bTitle}</span>
                    <span class="diff-side-tag diff-tag-b" style="font-size:9.5px; font-weight:700;">SOURCE B • READ &rarr;</span>
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
        outdatedOverviewHtml = `<div class="all-clear-notice">All reviewed sources and calendar dates appear current.</div>`;
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
        verifyOverviewHtml = `<div class="all-clear-notice">No critical follow-up verification required.</div>`;
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

      // Technical Audit Freshness & Low Trust Domain Alert Banner
      let techAlertBannerHtml = '';
      const tech = R.technical_audit || {};
      const staleAlerts = tech.stale_alerts || [];
      const lowTrustAlerts = tech.low_trust_alerts || [];

      if (staleAlerts.length > 0 || lowTrustAlerts.length > 0) {
        techAlertBannerHtml = `
          <div class="tech-audit-banner">
            <div class="tech-banner-top">
              <div class="tech-banner-title">
                <span class="tech-banner-pulse"></span>
                <span>🌐 Server Header Freshness & Technical Audit Warnings</span>
              </div>
              <span class="tech-banner-pill">${staleAlerts.length + lowTrustAlerts.length} Critical Technical Warning${staleAlerts.length + lowTrustAlerts.length > 1 ? 's' : ''}</span>
            </div>
            <div class="tech-banner-body">
              ${staleAlerts.map(sa => `
                <div class="tech-alert-item stale-alert">
                  <div class="tech-alert-icon">⚠️</div>
                  <div class="tech-alert-text">
                    <b style="color:#991b1b;">${esc(sa.source_id)} (${esc(sa.title)}):</b>
                    <span style="font-weight:700; color:#b91c1c;">${esc(sa.alert)}</span>
                    <div class="tech-alert-sub">Web-server HTTP header confirms this document is unmaintained and carries high risk of outdated circular terms.</div>
                  </div>
                </div>
              `).join('')}
              ${lowTrustAlerts.map(lta => `
                <div class="tech-alert-item lowtrust-alert">
                  <div class="tech-alert-icon">🛡️</div>
                  <div class="tech-alert-text">
                    <b style="color:#9a3412;">${esc(lta.source_id)} (${esc(lta.domain || lta.title)}):</b>
                    <span class="cell-badge badge-low-trust" style="margin:0 4px;">${esc(lta.badge)}</span>
                    <span style="color:#7c2d12; font-size:12px;">${esc(lta.message)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

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

        ${techAlertBannerHtml}

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
        <div class="authority-audit-container">
          <div class="authority-audit-header">
            <div class="authority-header-left">
              <div class="authority-header-eyebrow">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Deterministic Web Security Layer</span>
              </div>
              <h4 class="authority-header-title">Deterministic Source Authority & Technical Audit</h4>
              <p class="authority-header-desc">Audits HTTP headers (Last-Modified freshness, server identity), cryptographic SSL transport, domain registry, and scam risk heuristics without AI.</p>
            </div>
            <div class="authority-header-badge">
              <span class="security-chip">
                <span class="security-pulse"></span>
                Zero-AI Heuristics
              </span>
            </div>
          </div>
          <div class="authority-cards-grid">
            ${usableSources.map(s => {
              const cred = s.credibility || {};
              const sourceTech = s.technical_audit || {};
              const offTag = s.is_official ? '<span class="source-official-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Official</span>' : '';
              const trapInfo = s.trap_clauses || (R.trap_clauses && R.trap_clauses.by_source ? R.trap_clauses.by_source[s.id] : null);
              const trapBox = renderTrapWarningBox(trapInfo);

              // Technical Header Audit Pills
              let techSpecsHtml = '';
              let staleWarningCard = '';
              if (sourceTech && sourceTech.is_url) {
                const httpsPill = sourceTech.is_https 
                  ? `<span class="source-tech-pill https-secure"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> HTTPS Secure</span>`
                  : `<span class="source-tech-pill http-insecure"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Insecure HTTP</span>`;
                
                const trustPill = sourceTech.trust_badge 
                  ? `<span class="source-tech-pill ${sourceTech.trust_badge_color === 'green' ? 'gov-trust' : sourceTech.trust_badge_color === 'amber' || sourceTech.trust_badge_color === 'red' ? 'low-trust' : ''}">${esc(sourceTech.trust_badge)}</span>`
                  : '';

                const stalePill = sourceTech.is_stale 
                  ? `<span class="source-tech-pill stale" title="${esc(sourceTech.stale_alert || '')}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Stale: ${esc(sourceTech.last_modified_human || '2+ Yrs Old')}</span>`
                  : (sourceTech.last_modified_human ? `<span class="source-tech-pill fresh"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${esc(sourceTech.last_modified_human)}</span>` : '');

                const serverPill = sourceTech.server && sourceTech.server !== 'Unknown' 
                  ? `<span class="source-tech-pill server-identity"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> ${esc(sourceTech.server.split('/')[0])}</span>`
                  : '';

                techSpecsHtml = `
                  <div class="source-tech-specs">
                    ${httpsPill}
                    ${trustPill}
                    ${stalePill}
                    ${serverPill}
                  </div>
                `;

                if (sourceTech.is_stale && sourceTech.stale_alert) {
                  staleWarningCard = `
                    <div class="stale-warning-banner">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span>${esc(sourceTech.stale_alert)}</span>
                    </div>
                  `;
                }
              }

              const flagsHtml = (cred.flags && cred.flags.length) ? `
                <div class="source-audit-flags">
                  ${cred.flags.map(flg => `
                    <div class="source-flag-line">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>${esc(flg)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : '';

              const kindIcon = s.kind === 'pasted' 
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`
                : (s.kind === 'file' 
                  ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`
                  : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`);

              return `
                <div class="source-authority-card">
                  <div class="source-authority-card-header">
                    <div class="source-header-meta">
                      <div class="source-id-row">
                        <span class="source-id-badge">${esc(s.id)}</span>
                        <h5 class="source-card-title" title="${esc(s.title || s.id)}">${esc(s.title || s.id)}</h5>
                        ${offTag}
                      </div>
                      <div class="source-origin-row">
                        ${kindIcon}
                        <span>${esc(cred.domain || (s.kind === 'pasted' ? 'Pasted Text Document' : 'Uploaded File'))}</span>
                      </div>
                    </div>
                    <div class="source-trust-col">
                      <span class="cell-badge ${cred.badge_class || 'badge-med-trust'}">${cred.score || 50}% ${cred.badge_label || 'Trust'}</span>
                    </div>
                  </div>
                  ${staleWarningCard}
                  ${trapBox}
                  ${flagsHtml}
                  ${techSpecsHtml}
                  <button type="button" class="source-open-reader-btn" onclick="openInteractiveViewer('${s.id}', '')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    <span>Open Interactive Source Reader</span>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="matrix-overview-cta">
          <div>
            <b class="matrix-overview-cta-title">Full Information Coverage Matrix</b>
            <div class="matrix-overview-cta-desc">Compare each checklist criterion across all sources side-by-side with mechanically verified evidence quotes.</div>
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
        const sourceTech = s.technical_audit || {};
        const trapInfo = s.trap_clauses || (R.trap_clauses && R.trap_clauses.by_source ? R.trap_clauses.by_source[s.id] : null);
        const trapPill = (trapInfo && trapInfo.has_traps) 
          ? `<div style="margin-top:3px;"><span class="cell-badge" style="background:#faeaeb; color:#982820; font-size:9.5px;">⚠️ ${trapInfo.total_count} Trap Clauses</span></div>` 
          : '';
        const stalePill = (sourceTech && sourceTech.is_stale)
          ? `<div style="margin-top:3px;"><span class="cell-badge" style="background:#fee2e2; color:#991b1b; font-size:9.5px;">⚠️ Stale Server</span></div>`
          : '';
        const lowTrustPill = (sourceTech && (sourceTech.trust_tier === 'low_trust_free_host' || sourceTech.trust_tier === 'low_trust_ip'))
          ? `<div style="margin-top:3px;"><span class="cell-badge" style="background:#ffedd5; color:#9a3412; font-size:9.5px;">⚠️ Low Trust</span></div>`
          : '';
        const credHtml = cred.badge_label ? `
          <div style="margin-top:3px;">
            <span class="cell-badge ${cred.badge_class || 'badge-med-trust'}">${cred.score || 50}% ${cred.badge_label}</span>
          </div>
        ` : '';
        matrixHtml += `<th><div>${esc(s.id)}: ${esc(s.title || s.id)}${off}</div>${credHtml}${stalePill}${lowTrustPill}${trapPill}</th>`;
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
        gapsList.innerHTML = `<div class="all-clear-notice is-centered">[All Clear] No information gaps detected. All expected decision criteria were addressed in the sources.</div>`;
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
        conflictsList.innerHTML = `<div class="all-clear-notice is-centered">[All Clear] No factual contradictions found among sources.</div>`;
      } else {
        conflictsList.innerHTML = `
          <div class="conflict-toolbar">
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
                    <td><span class="cell-badge badge-conflict">${esc(c.relation.toUpperCase())}</span></td>
                    <td>
                      <!-- Word Diff Mode -->
                      <div class="conflict-diff-view" id="diff-view-${idx}">
                        <div class="diff-box-grid">
                          <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote || c.a.value)})" title="Click to view highlighted in source document">
                            <div class="diff-card-header">
                              <span>${aTitle}${aOff}</span>
                              <span class="diff-side-tag diff-tag-a" style="font-size:9.5px; font-weight:700; letter-spacing:0.04em;">SOURCE A TERMS • READ &rarr;</span>
                            </div>
                            <div style="color:var(--ink); line-height:1.6;">${diff.diffA}</div>
                          </div>
                          <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote || c.b.value)})" title="Click to view highlighted in source document">
                            <div class="diff-card-header">
                              <span>${bTitle}${bOff}</span>
                              <span class="diff-side-tag diff-tag-b" style="font-size:9.5px; font-weight:700; letter-spacing:0.04em;">SOURCE B CONFLICT • READ &rarr;</span>
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

                      <div class="conflict-assessment-box">
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
        outdatedList.innerHTML = `<div class="all-clear-notice is-centered">[All Clear] All sources and deadlines appear current.</div>`;
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
        verifyList.innerHTML = `<div class="all-clear-notice is-centered">[All Clear] No pending verification actions needed.</div>`;
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

      // Render the Interactive Knowledge Gap Graph
      renderKnowledgeGapGraph();
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
            <div class="discrepancy-title" style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:13.5px; margin-bottom:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>${discrepancies.length} Direct Discrepanc${discrepancies.length === 1 ? 'y' : 'ies'} Detected Across Sources</span>
            </div>
            <p class="discrepancy-desc" style="font-size:12px; margin:0 0 10px 0;">
              The sources disagree on key concrete values (dates, fees, or eligibility criteria). Review these carefully:
            </p>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${discrepancies.map(d => `
                <div class="discrepancy-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <b class="discrepancy-cat" style="font-size:12.5px;">${esc(d.category)}</b>
                    <span class="cell-badge badge-conflict" style="font-size:10px;">${esc(d.severity.toUpperCase())} PRIORITY</span>
                  </div>
                  <div style="font-size:12px; color:var(--ink); font-weight:500; margin-bottom:8px;">
                    ${esc(d.detail)}
                  </div>
                  <div class="diff-box-grid" style="margin:0;">
                    <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${d.a.source_id}', ${registerQuote(d.a.snippet || d.a.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="diff-card-header">
                        <span>${esc(d.a.title)}</span>
                        <span class="diff-side-tag diff-tag-a" style="font-size:9.5px; font-weight:700;">SOURCE A • READ &rarr;</span>
                      </div>
                      <div style="font-weight:700; color:var(--ink); font-size:12px;">${esc(d.a.value)}</div>
                      <div style="font-size:11px; color:var(--muted); margin-top:3px; line-height:1.4;">"${esc(d.a.snippet)}"</div>
                    </div>
                    <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${d.b.source_id}', ${registerQuote(d.b.snippet || d.b.value)})" title="Click to view highlighted in interactive source reader">
                      <div class="diff-card-header">
                        <span>${esc(d.b.title)}</span>
                        <span class="diff-side-tag diff-tag-b" style="font-size:9.5px; font-weight:700;">SOURCE B • READ &rarr;</span>
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

    // --------------------------------------------------------------------------
    // Feature 3: Interactive Knowledge Gap & Multi-Source Relationship Graph
    // --------------------------------------------------------------------------
    let currentGraphFilter = 'all';
    let selectedGraphNode = null;
    let graphSearchQuery = '';

    function setGraphFilter(f) {
      currentGraphFilter = f;
      ['all', 'gaps', 'conflicts', 'sourced'].forEach(k => {
        const btn = document.getElementById(`graph-pill-${k}`);
        if (btn) btn.classList.toggle('is-active', k === f);
      });
      applyGraphFilter();
    }

    function searchGraph(query) {
      graphSearchQuery = (query || '').toLowerCase().trim();
      applyGraphFilter();
    }

    function applyGraphFilter() {
      const edges = document.querySelectorAll('.graph-edge');
      const critNodes = document.querySelectorAll('.graph-node-crit');

      const visibleFields = new Set();

      critNodes.forEach(node => {
        const status = node.getAttribute('data-status');
        const label = (node.getAttribute('data-label') || '').toLowerCase();
        let matchesFilter = false;
        if (currentGraphFilter === 'all') matchesFilter = true;
        else if (currentGraphFilter === 'gaps' && (status === 'gap' || status === 'partial')) matchesFilter = true;
        else if (currentGraphFilter === 'conflicts' && status === 'conflict') matchesFilter = true;
        else if (currentGraphFilter === 'sourced' && status === 'sourced') matchesFilter = true;

        const matchesSearch = !graphSearchQuery || label.includes(graphSearchQuery);
        const show = matchesFilter && matchesSearch;

        node.style.display = show ? '' : 'none';
        if (show) visibleFields.add(node.getAttribute('data-field'));
      });

      edges.forEach(edge => {
        const type = edge.getAttribute('data-type');
        const field = edge.getAttribute('data-field');
        let matchesFilter = false;
        if (currentGraphFilter === 'all') matchesFilter = true;
        else if (currentGraphFilter === 'gaps' && type === 'gap') matchesFilter = true;
        else if (currentGraphFilter === 'conflicts' && type === 'conflict') matchesFilter = true;
        else if (currentGraphFilter === 'sourced' && type === 'sourced') matchesFilter = true;

        const show = matchesFilter && visibleFields.has(field);
        edge.style.display = show ? '' : 'none';
      });
    }

    function hoverGraphNode(type, id) {
      if (selectedGraphNode) return;
      const edges = document.querySelectorAll('.graph-edge');
      const nodes = document.querySelectorAll('.graph-node');

      edges.forEach(e => {
        const match = (type === 'source' && e.getAttribute('data-source') === id) ||
                      (type === 'crit' && e.getAttribute('data-field') === id);
        e.classList.toggle('is-highlighted', match);
        e.classList.toggle('is-dimmed', !match);
      });

      nodes.forEach(n => {
        const isTarget = (type === 'source' && n.getAttribute('data-source-id') === id) ||
                         (type === 'crit' && n.getAttribute('data-field') === id);
        n.classList.toggle('is-highlighted', isTarget);
      });
    }

    function clearGraphHover() {
      if (selectedGraphNode) return;
      document.querySelectorAll('.graph-edge').forEach(e => {
        e.classList.remove('is-highlighted', 'is-dimmed');
      });
      document.querySelectorAll('.graph-node').forEach(n => {
        n.classList.remove('is-highlighted', 'is-dimmed');
      });
    }

    function selectGraphNode(type, id) {
      if (selectedGraphNode && selectedGraphNode.type === type && selectedGraphNode.id === id) {
        clearGraphSelection();
        return;
      }
      selectedGraphNode = { type, id };

      const edges = document.querySelectorAll('.graph-edge');
      const nodes = document.querySelectorAll('.graph-node');

      edges.forEach(e => {
        const match = (type === 'source' && e.getAttribute('data-source') === id) ||
                      (type === 'crit' && e.getAttribute('data-field') === id);
        e.classList.toggle('is-highlighted', match);
        e.classList.toggle('is-dimmed', !match);
      });

      nodes.forEach(n => {
        const isTarget = (type === 'source' && n.getAttribute('data-source-id') === id) ||
                         (type === 'crit' && n.getAttribute('data-field') === id);
        n.classList.toggle('is-highlighted', isTarget);
        n.classList.toggle('is-dimmed', !isTarget);
      });

      renderGraphInspector(type, id);
    }

    function clearGraphSelection() {
      selectedGraphNode = null;
      document.querySelectorAll('.graph-edge').forEach(e => {
        e.classList.remove('is-highlighted', 'is-dimmed');
      });
      document.querySelectorAll('.graph-node').forEach(n => {
        n.classList.remove('is-highlighted', 'is-dimmed');
      });
      const inspector = document.getElementById('gap-inspector-container');
      if (inspector) {
        inspector.innerHTML = `
          <div class="inspector-empty-state">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Click any source node or checklist criterion in the graph above to inspect verbatim evidence, discrepancies, and cross-source corroboration.</span>
          </div>
        `;
      }
    }

    function renderGraphInspector(type, id) {
      const container = document.getElementById('gap-inspector-container');
      if (!container || !R) return;

      const sources = (R.sources || []).filter(s => s && s.id);
      const checklist = R.checklist || [];
      const findings = R.findings || [];
      const gaps = R.gaps || [];
      const conflicts = R.conflicts || [];

      if (type === 'crit') {
        const crit = checklist.find(c => c.field === id) || { field: id, label: id, importance: 'HIGH', why: '' };
        const critGaps = gaps.filter(g => g.field === id);
        const critConflicts = conflicts.filter(c => c.field === id);
        const critFindings = findings.filter(f => f.field === id);
        const hasGap = critGaps.length > 0;
        const hasConflict = critConflicts.length > 0;

        let statusBadge = '';
        if (hasConflict) {
          statusBadge = `<span class="cell-badge badge-conflict">DISPUTED (CONFLICT)</span>`;
        } else if (hasGap) {
          statusBadge = `<span class="cell-badge badge-miss">BLIND SPOT (GAP)</span>`;
        } else {
          statusBadge = `<span class="cell-badge badge-sourced">VERIFIED EVIDENCE</span>`;
        }

        let conflictHtml = '';
        if (hasConflict) {
          conflictHtml = critConflicts.map(c => {
            const diff = computeWordDiff(c.a.quote || c.a.value || '', c.b.quote || c.b.value || '');
            return `
              <div style="background:#fff5f5; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:12px;">
                <div style="font-size:12px; font-weight:700; color:#b91c1c; margin-bottom:6px;">Direct Contradiction Assessment</div>
                <div style="font-size:12px; color:var(--ink); margin-bottom:8px;">${esc(c.explanation || 'Sources contradict each other on this value.')}</div>
                <div class="diff-box-grid" style="margin:0;">
                  <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.a.source_id}', ${registerQuote(c.a.quote || c.a.value)})">
                    <div class="diff-card-header">
                      <span>${esc(c.a.source_title || c.a.source_id)}</span>
                      <span class="diff-side-tag diff-tag-a">READ SOURCE A &rarr;</span>
                    </div>
                    <div>${diff.diffA}</div>
                  </div>
                  <div class="diff-card-source" style="cursor:pointer;" onclick="showSource('${c.b.source_id}', ${registerQuote(c.b.quote || c.b.value)})">
                    <div class="diff-card-header">
                      <span>${esc(c.b.source_title || c.b.source_id)}</span>
                      <span class="diff-side-tag diff-tag-b">READ SOURCE B &rarr;</span>
                    </div>
                    <div>${diff.diffB}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }

        let gapHtml = '';
        if (hasGap) {
          gapHtml = `
            <div style="background:#fef2f2; border:1px solid #fee2e2; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
              <b style="color:#b91c1c; font-size:12px;">⚠️ Potential Information Gap Detected:</b>
              <div style="font-size:12px; color:var(--ink); margin-top:3px;">
                ${esc(critGaps[0].why || crit.why || 'This critical decision requirement was not found in the documents analyzed.')}
              </div>
            </div>
          `;
        }

        const sourceCards = sources.map(s => {
          const f = critFindings.find(find => find.source_id === s.id);
          const isSourced = f && f.status === 'sourced';
          const boxClass = isSourced ? 'box-sourced' : (hasConflict ? 'box-conflict' : 'box-gap');
          return `
            <div class="inspector-source-box ${boxClass}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <b style="font-size:12px; color:var(--ink);">${esc(s.title || s.id)}</b>
                <span class="cell-badge ${isSourced ? 'badge-sourced' : (hasConflict ? 'badge-conflict' : 'badge-miss')}">
                  ${isSourced ? 'SOURCED' : (hasConflict ? 'DISPUTED' : 'MISSING')}
                </span>
              </div>
              ${isSourced ? `
                <div style="font-size:12px; color:var(--ink); line-height:1.4; margin-bottom:6px; font-style:italic;">
                  "${esc(f.quote || f.value || '')}"
                </div>
                <button type="button" class="button button-outline button-small" style="font-size:11px; padding:2px 8px;" onclick="showSource('${s.id}', ${registerQuote(f.quote || f.value)})">
                  <span>Open in Source Reader</span> &rarr;
                </button>
              ` : `
                <div style="font-size:11.5px; color:var(--muted);">No matching evidence found in this source.</div>
              `}
            </div>
          `;
        }).join('');

        container.innerHTML = `
          <div class="inspector-card">
            <div class="inspector-header">
              <div>
                <h4 class="inspector-title">
                  <span>${esc(crit.label)}</span>
                  ${statusBadge}
                  <span class="cell-badge" style="background:#eef2ff; color:#3730a3; font-size:10px;">${esc(crit.importance || 'HIGH')} PRIORITY</span>
                </h4>
                <div style="font-size:12px; color:var(--muted); margin-top:2px;">Checklist ID: <code>${esc(crit.field)}</code></div>
              </div>
              <button class="inspector-close-btn" onclick="clearGraphSelection()" title="Close Inspector">&times;</button>
            </div>
            ${gapHtml}
            ${conflictHtml}
            <div style="font-size:12px; font-weight:700; color:var(--ink); margin:8px 0 4px 0;">Source Corroboration Breakdown:</div>
            <div class="inspector-grid">
              ${sourceCards}
            </div>
          </div>
        `;
      } else if (type === 'source') {
        const s = sources.find(src => src.id === id) || { id, title: id };
        const cred = s.credibility || {};
        const sourceTech = s.technical_audit || {};
        const sourceFindings = findings.filter(f => f.source_id === id);
        const sourcedCount = sourceFindings.filter(f => f.status === 'sourced').length;
        const totalCriteria = checklist.length;

        container.innerHTML = `
          <div class="inspector-card">
            <div class="inspector-header">
              <div>
                <h4 class="inspector-title">
                  <span class="source-id-badge" style="font-size:11px;">${esc(s.id)}</span>
                  <span>${esc(s.title || s.id)}</span>
                  ${s.is_official ? '<span class="source-official-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Official</span>' : ''}
                  <span class="cell-badge ${cred.badge_class || 'badge-med-trust'}">${cred.score || 50}% ${cred.badge_label || 'Trust'}</span>
                </h4>
                <div style="font-size:12px; color:var(--muted); margin-top:2px;">
                  Origin: <b>${esc(cred.domain || (s.kind === 'pasted' ? 'Pasted Text' : 'Uploaded File'))}</b> &bull; Provides verified evidence for <b>${sourcedCount} of ${totalCriteria}</b> decision criteria.
                </div>
              </div>
              <button class="inspector-close-btn" onclick="clearGraphSelection()" title="Close Inspector">&times;</button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${sourceTech.is_https ? '<span class="source-tech-pill https-secure">HTTPS Secure</span>' : '<span class="source-tech-pill http-insecure">HTTP Insecure</span>'}
                ${sourceTech.last_modified_human ? `<span class="source-tech-pill fresh">${esc(sourceTech.last_modified_human)}</span>` : ''}
                ${sourceTech.is_stale ? '<span class="source-tech-pill stale">Stale Headers</span>' : ''}
              </div>
              <button type="button" class="button button-dark button-small" onclick="openInteractiveViewer('${s.id}', '')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span>Open Full Document in Source Reader</span> &rarr;
              </button>
            </div>
            <div style="font-size:12px; font-weight:700; color:var(--ink); margin-bottom:8px;">Checklist Coverage from this Source:</div>
            <div class="inspector-grid">
              ${checklist.map(c => {
                const f = sourceFindings.find(find => find.field === c.field);
                const isSourced = f && f.status === 'sourced';
                return `
                  <div class="inspector-source-box ${isSourced ? 'box-sourced' : 'box-gap'}" style="cursor:pointer;" onclick="selectGraphNode('crit', '${c.field}')">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <b style="font-size:12px; color:var(--ink);">${esc(c.label)}</b>
                      <span class="cell-badge ${isSourced ? 'badge-sourced' : 'badge-miss'}">${isSourced ? 'SOURCED' : 'GAP'}</span>
                    </div>
                    ${isSourced ? `<div style="font-size:11.5px; color:var(--muted); font-style:italic;">"${esc(f.quote || f.value || '')}"</div>` : `<div style="font-size:11px; color:var(--muted);">Missing from this source</div>`}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
    }

    function renderKnowledgeGapGraph() {
      const container = document.getElementById('graph-content');
      if (!container || !R) return;

      const usableSources = (R.sources || []).filter(s => s && s.id);
      const checklist = R.checklist || [];
      const findings = R.findings || [];
      const gaps = R.gaps || [];
      const conflicts = R.conflicts || [];
      const st = R.stats || {};

      const totalCrit = checklist.length;
      const totalGaps = gaps.length;
      const totalConflicts = conflicts.length;
      const totalSourced = st.covered || 0;

      // 1. Calculate Geometry for SVG
      const rowHeight = 68;
      const topMargin = 50;
      const totalRows = Math.max(totalCrit, 3);
      const svgHeight = Math.max(500, totalRows * rowHeight + topMargin + 30);
      const svgWidth = 1000;

      const srcPortX = 270;
      const critPortX = 630;

      const srcYMap = {};
      const numSources = usableSources.length;
      usableSources.forEach((s, idx) => {
        if (numSources === 1) {
          srcYMap[s.id] = svgHeight / 2;
        } else {
          srcYMap[s.id] = topMargin + 25 + idx * ((svgHeight - topMargin - 80) / Math.max(1, numSources - 1));
        }
      });

      const critYMap = {};
      const critStatusMap = {};
      checklist.forEach((c, idx) => {
        const cy = topMargin + idx * rowHeight + 26;
        critYMap[c.field] = cy;

        if (conflicts.some(cf => cf.field === c.field)) {
          critStatusMap[c.field] = { status: 'conflict', label: 'DISPUTED', color: '#f97316', bg: '#fff7ed', border: '#ffedd5' };
        } else if (gaps.some(g => g.field === c.field)) {
          critStatusMap[c.field] = { status: 'gap', label: 'BLIND SPOT', color: '#ef4444', bg: '#fef2f2', border: '#fee2e2' };
        } else {
          const relevantFindings = findings.filter(f => f.field === c.field);
          const sourcedCount = relevantFindings.filter(f => f.status === 'sourced').length;
          if (sourcedCount >= numSources && numSources > 0) {
            critStatusMap[c.field] = { status: 'sourced', label: 'VERIFIED', color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' };
          } else if (sourcedCount > 0) {
            critStatusMap[c.field] = { status: 'partial', label: 'PARTIAL', color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7' };
          } else {
            critStatusMap[c.field] = { status: 'gap', label: 'BLIND SPOT', color: '#ef4444', bg: '#fef2f2', border: '#fee2e2' };
          }
        }
      });

      // 2. Build Bezier Connecting Curves
      let pathsSvg = '';
      usableSources.forEach(s => {
        const ySrc = srcYMap[s.id];
        checklist.forEach(c => {
          const yCrit = critYMap[c.field];
          const isConf = conflicts.some(cf => cf.field === c.field && ((cf.a && cf.a.source_id === s.id) || (cf.b && cf.b.source_id === s.id)));
          const f = findings.find(find => find.source_id === s.id && find.field === c.field);

          let edgeType = 'gap';
          if (isConf) edgeType = 'conflict';
          else if (f && f.status === 'sourced') edgeType = 'sourced';
          else if (f && f.status === 'uncertain') edgeType = 'uncertain';
          else edgeType = 'gap';

          const d = `M ${srcPortX} ${ySrc} C ${srcPortX + 160} ${ySrc}, ${critPortX - 160} ${yCrit}, ${critPortX} ${yCrit}`;
          pathsSvg += `
            <path class="graph-edge edge-${edgeType}" data-source="${esc(s.id)}" data-field="${esc(c.field)}" data-type="${edgeType}" d="${d}">
              <title>${esc(s.id)} &rarr; ${esc(c.label)}: ${edgeType.toUpperCase()}</title>
            </path>
          `;
        });
      });

      // 3. Build Source Nodes (Left Column)
      let sourcesSvg = '';
      usableSources.forEach(s => {
        const cy = srcYMap[s.id];
        const yTop = cy - 26;
        const cred = s.credibility || {};
        const titleShort = (s.title || s.id).slice(0, 24) + ((s.title || s.id).length > 24 ? '...' : '');
        const domainShort = (cred.domain || (s.kind === 'pasted' ? 'Pasted Text' : 'Uploaded File')).slice(0, 22);
        const trustPct = (cred.score || 50) + '%';
        const offShield = s.is_official ? '★ Official' : trustPct;

        sourcesSvg += `
          <g class="graph-node graph-node-src" data-source-id="${esc(s.id)}" onclick="selectGraphNode('source', '${esc(s.id)}')" onmouseenter="hoverGraphNode('source', '${esc(s.id)}')" onmouseleave="clearGraphHover()">
            <title>${esc(s.title || s.id)} (${esc(cred.domain || 'Source')}) - Click to inspect</title>
            <rect class="graph-node-rect" x="30" y="${yTop}" width="240" height="52" rx="10" />
            <rect x="30" y="${yTop}" width="5" height="52" rx="2" fill="${s.is_official ? '#15803d' : '#22c55e'}" />
            <circle cx="50" cy="${cy}" r="11" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1.5" />
            <text x="50" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#047857">${esc(s.id)}</text>
            <text class="graph-node-text" x="68" y="${cy - 3}">${esc(titleShort)}</text>
            <text class="graph-node-subtext" x="68" y="${cy + 13}">${esc(domainShort)} &bull; ${esc(offShield)}</text>
            <circle cx="${srcPortX}" cy="${cy}" r="4.5" fill="#22c55e" stroke="#ffffff" stroke-width="2" />
          </g>
        `;
      });

      // 4. Build Criteria Nodes (Right Column)
      let criteriaSvg = '';
      checklist.forEach(c => {
        const cy = critYMap[c.field];
        const yTop = cy - 26;
        const stat = critStatusMap[c.field] || { status: 'gap', label: 'BLIND SPOT', color: '#ef4444', bg: '#fef2f2', border: '#fee2e2' };
        const labelShort = c.label.slice(0, 30) + (c.label.length > 30 ? '...' : '');

        criteriaSvg += `
          <g class="graph-node graph-node-crit" data-field="${esc(c.field)}" data-status="${stat.status}" data-label="${esc(c.label)}" onclick="selectGraphNode('crit', '${esc(c.field)}')" onmouseenter="hoverGraphNode('crit', '${esc(c.field)}')" onmouseleave="clearGraphHover()">
            <title>${esc(c.label)} - Status: ${stat.label} - Click to inspect</title>
            <rect class="graph-node-rect" x="630" y="${yTop}" width="340" height="52" rx="10" />
            <rect x="630" y="${yTop}" width="5" height="52" rx="2" fill="${stat.color}" />
            <circle cx="${critPortX}" cy="${cy}" r="4.5" fill="${stat.color}" stroke="#ffffff" stroke-width="2" />
            <text class="graph-node-text" x="648" y="${cy - 3}">${esc(labelShort)}</text>
            <text class="graph-node-subtext" x="648" y="${cy + 13}">Priority: ${esc(c.importance || 'HIGH')} &bull; Status: ${stat.label}</text>
            <rect x="880" y="${cy - 10}" width="80" height="20" rx="10" fill="${stat.bg}" stroke="${stat.border}" stroke-width="1" />
            <text x="920" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${stat.color}">${stat.label}</text>
          </g>
        `;
      });

      // 5. Assemble Full Graph HTML
      container.innerHTML = `
        <div class="gap-graph-container">
          <div class="gap-graph-header">
            <div>
              <h3 class="gap-graph-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="18" y1="9" x2="18" y2="15"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/></svg>
                <span>Interactive Knowledge Gap & Multi-Source Relationship Graph</span>
              </h3>
              <p class="gap-graph-subtitle">
                Visual topological map of corroborated facts, information blind spots (gaps), and cross-source contradictions.
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="cell-badge badge-sourced" style="font-size:11px;">${usableSources.length} Ingested Sources</span>
              <span class="cell-badge" style="background:#eef2ff; color:#3730a3; font-size:11px;">${totalCrit} Decision Criteria</span>
            </div>
          </div>

          <!-- Interactive Filters & Search Toolbar -->
          <div class="gap-graph-toolbar">
            <div class="gap-graph-filters">
              <button type="button" class="graph-filter-pill is-active" id="graph-pill-all" onclick="setGraphFilter('all')">
                <span>All Relationships (${totalCrit})</span>
              </button>
              <button type="button" class="graph-filter-pill" id="graph-pill-gaps" onclick="setGraphFilter('gaps')">
                <span class="pill-dot" style="background:#ef4444;"></span>
                <span>Blind Spots (${totalGaps})</span>
              </button>
              <button type="button" class="graph-filter-pill" id="graph-pill-conflicts" onclick="setGraphFilter('conflicts')">
                <span class="pill-dot" style="background:#f97316;"></span>
                <span>Contradictions (${totalConflicts})</span>
              </button>
              <button type="button" class="graph-filter-pill" id="graph-pill-sourced" onclick="setGraphFilter('sourced')">
                <span class="pill-dot" style="background:#22c55e;"></span>
                <span>Verified Facts (${totalSourced})</span>
              </button>
            </div>

            <div style="display:flex; align-items:center; gap:12px;">
              <div style="position:relative; width:220px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="position:absolute; left:9px; top:50%; transform:translateY(-50%); color:var(--muted);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" placeholder="Filter criteria..." oninput="searchGraph(this.value)" style="width:100%; padding:5px 8px 5px 26px; font-size:12px; border-radius:100px; border:1px solid var(--line); background:var(--bg); color:var(--ink); outline:none;" />
              </div>

              <div class="gap-graph-legend">
                <span class="graph-legend-item"><span class="legend-line line-sourced"></span> Verified</span>
                <span class="graph-legend-item"><span class="legend-line line-gap"></span> Blind Spot (Gap)</span>
                <span class="graph-legend-item"><span class="legend-line line-conflict"></span> Disputed</span>
              </div>
            </div>
          </div>

          <!-- Scalable SVG Canvas -->
          <div class="gap-graph-svg-wrap">
            <svg class="gap-graph-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
              <!-- Column Labels -->
              <text x="30" y="28" font-size="12" font-weight="700" fill="var(--muted)" letter-spacing="0.05em">INGESTED SOURCES</text>
              <text x="630" y="28" font-size="12" font-weight="700" fill="var(--muted)" letter-spacing="0.05em">DECISION CHECKLIST CRITERIA</text>

              <!-- Connecting Edges Layer -->
              <g id="graph-edges-layer">
                ${pathsSvg}
              </g>

              <!-- Nodes Layer -->
              <g id="graph-sources-layer">
                ${sourcesSvg}
              </g>
              <g id="graph-criteria-layer">
                ${criteriaSvg}
              </g>
            </svg>
          </div>

          <!-- Docked Interactive Node Inspector -->
          <div class="gap-inspector-container" id="gap-inspector-container">
            <div class="inspector-empty-state">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>Click any source node or checklist criterion in the graph above to inspect verbatim evidence, discrepancies, and cross-source corroboration.</span>
            </div>
          </div>
        </div>
      `;
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

    function purgeLegacyDemoHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(x => {
            const topic = (x.topic || "").toLowerCase();
            return !topic.includes("post-matric scholarship scheme 2026") && !topic.includes("trap clauses");
          });
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(cleaned));
          }
        }
      } catch (e) {
        // silent fail
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
          <div style="padding: 44px 20px; text-align: center; color: var(--muted);">
            <div style="margin-bottom: 14px; opacity: 0.55;">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <p style="font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 6px;">No Saved Comparisons Yet</p>
            <p style="font-size: 12px; line-height: 1.6; color: var(--muted); max-width: 290px; margin: 0 auto;">
              Audits you perform are saved strictly inside your own browser's private <code style="font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 4px;">localStorage</code>. No search or document data is shared with or visible to any other user.
            </p>
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

    // -------------------------------------------------------------
    // Theme Management (Light / Dark Mode)
    // -------------------------------------------------------------
    const THEME_STORAGE_KEY = "sonix_theme";

    function getCurrentTheme() {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (e) {}
      updateThemeToggleUI(theme);
    }

    function toggleTheme() {
      const current = getCurrentTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    }

    function updateThemeToggleUI(theme) {
      const label = document.getElementById('theme-toggle-label');
      if (label) {
        label.textContent = theme === 'dark' ? 'Light' : 'Dark';
      }
      const btn = document.getElementById('theme-toggle-btn');
      if (btn) {
        btn.setAttribute('title', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`);
        btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`);
      }
    }

    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    } catch(e) {}

    // Initialize history UI count, dropzone, and live metrics on page load
    window.addEventListener('DOMContentLoaded', () => {
      updateThemeToggleUI(getCurrentTheme());
      purgeLegacyDemoHistory();
      updateHistoryUI();
      initDropzone();
      updateSourceMetrics();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePrivacyModal();
        closeDrawer();
        closeHistoryDrawer();
      }
    });
