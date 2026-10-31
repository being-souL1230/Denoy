/**
 * viewer.js: Interactive Visual In-Text Highlighter & Reading View Drawer.
 * Handles yellow marker highlighting, automatic keyword badging, category cycling, and text search.
 */

let currentNavCategory = null;
let currentNavIndex = -1;
let currentSearchMatches = [];
let currentSearchIndex = 0;

function closeDrawer() {
  const drawer = document.getElementById('intel-viewer-drawer');
  if (drawer) drawer.style.display = 'none';
}

function findQuoteRange(text, quote) {
  if (!quote || typeof quote !== 'string') return null;
  let q = quote.trim();
  // Strip outer punctuation and quotation marks
  q = q.replace(/^["'“”‘’\(\)\[\]\.\,\:\;]+|["'“”‘’\(\)\[\]\.\,\:\;]+$/g, '').trim();
  if (q.length < 3) return null;

  // 1. Direct case-insensitive match
  let idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx !== -1) {
    return { start: idx, end: idx + q.length };
  }

  // 2. Multi-space / line-break flexible match
  try {
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp(escapedWords.join('[\\s\\p{P}\\n\\r]+'), 'iu');
      const m = regex.exec(text);
      if (m) {
        return { start: m.index, end: m.index + m[0].length };
      }
    }
  } catch (e) {}

  // 3. Fallback: match first 35 chars
  const shortHead = q.slice(0, 35).trim();
  idx = text.toLowerCase().indexOf(shortHead.toLowerCase());
  if (idx !== -1) {
    return { start: idx, end: idx + shortHead.length };
  }

  // 4. Fallback: match last 35 chars
  if (q.length > 50) {
    const shortTail = q.slice(-35).trim();
    idx = text.toLowerCase().indexOf(shortTail.toLowerCase());
    if (idx !== -1) {
      return { start: idx, end: idx + shortTail.length };
    }
  }

  return null;
}

function openInteractiveViewer(id, targetQuote = "") {
  const s = (R?.sources || []).find(x => x.id === id);
  if (!s) return;
  const rawText = s.text || "";
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;

  // Reset cycling navigation state
  currentNavCategory = null;
  currentNavIndex = -1;
  const navStatus = document.getElementById("viewer-nav-status");
  if (navStatus) navStatus.style.display = "none";

  // Clear search box
  const searchInput = document.getElementById("viewer-search-input");
  if (searchInput) searchInput.value = "";
  const searchCount = document.getElementById("viewer-search-count");
  if (searchCount) searchCount.style.display = "none";

  // Meta header
  const officialBadge = s.is_official ? `<span class="cell-badge badge-sourced" style="margin-left:6px;">Official Authority</span>` : '';
  const dateBadge = s.date ? `<span style="font-size:12px; color:var(--muted); margin-left:6px;">(Dated: ${esc(s.date)})</span>` : '<span style="font-size:12px; color:var(--muted); margin-left:6px;">(No publication date)</span>';
  const cred = s.credibility || {};
  const credBadge = cred.badge_label ? `<span class="cell-badge ${cred.badge_class || 'badge-med-trust'}" style="margin-left:6px;">${cred.score}% ${cred.badge_label}</span>` : '';
  const flagsText = (cred.flags || []).join(" • ");
  const flagsHtml = flagsText ? `<div style="font-size:11px; color:var(--muted); margin-top:4px;"><b>Deterministic Security Audit:</b> ${esc(flagsText)}</div>` : '';

  document.getElementById("drawer-source-meta").innerHTML = `
    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
      <b style="font-size:14px; color:var(--ink);">${esc(s.id)}: ${esc(s.title || s.id)}</b>
      ${dateBadge} ${officialBadge} ${credBadge}
      <span style="font-size:11.5px; color:var(--muted); margin-left:6px;">• ${wordCount.toLocaleString()} words</span>
      ${targetQuote ? '<span class="cell-badge" style="background:#fef08a; color:#713f12; font-weight:700; margin-left:6px;">Yellow Marker Active</span>' : ''}
    </div>
    ${flagsHtml}
  `;

  // Apply In-Text Visual Highlights
  const highlightedHtml = formatInteractiveReadingText(rawText, targetQuote);
  const preEl = document.getElementById("drawer-source-pre");
  preEl.innerHTML = highlightedHtml;

  const jumpBtn = document.getElementById("btn-jump-target");
  if (jumpBtn) {
    jumpBtn.style.display = targetQuote ? "inline-flex" : "none";
  }

  const drawer = document.getElementById("intel-viewer-drawer");
  drawer.style.display = "block";
  drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (targetQuote) {
    setTimeout(jumpToTargetQuote, 260);
  }
}

function jumpToTargetQuote() {
  const anchor = document.getElementById("target-finding-anchor");
  if (anchor) {
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    anchor.classList.add("pulse-target");
    setTimeout(() => anchor.classList.remove("pulse-target"), 2500);
  }
}

function cycleCategory(className, displayName) {
  const preEl = document.getElementById("drawer-source-pre");
  if (!preEl) return;
  const items = preEl.querySelectorAll("." + className);
  const statusLabel = document.getElementById("viewer-nav-status");
  if (!items || items.length === 0) {
    if (statusLabel) {
      statusLabel.textContent = `No ${displayName} found`;
      statusLabel.style.display = "inline-block";
    }
    return;
  }

  if (currentNavCategory !== className) {
    currentNavCategory = className;
    currentNavIndex = 0;
  } else {
    currentNavIndex = (currentNavIndex + 1) % items.length;
  }

  const targetEl = items[currentNavIndex];
  targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

  // Highlight target with pulse glow
  targetEl.classList.add("pulse-chip-target");
  setTimeout(() => targetEl.classList.remove("pulse-chip-target"), 1600);

  if (statusLabel) {
    statusLabel.textContent = `${displayName} ${currentNavIndex + 1} of ${items.length}`;
    statusLabel.style.display = "inline-block";
  }
}

function formatInteractiveReadingText(rawText, targetQuote) {
  let text = rawText || "";
  let targetFound = null;
  const placeholder = "___TARGET_FINDING_ANCHOR___";

  if (targetQuote) {
    const range = findQuoteRange(text, targetQuote);
    if (range) {
      targetFound = text.slice(range.start, range.end);
      text = text.slice(0, range.start) + placeholder + text.slice(range.end);
    }
  }

  // Escape base HTML
  let safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Comprehensive Rule-based In-Text Patterns
  const PATTERNS = [
    // 1. Dates & Deadlines (Blue)
    { 
      id: "date",
      rx: /\b(\d{1,2}(?:st|nd|rd|th)?[\s\/\-\.](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s\/\-\.]\d{2,4}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|(?:last|closing|due|cut[\-\s]*off|submission)\s+(?:date|deadline|day))\b/gi, 
      cls: "reader-kw-date", 
      icon: "📅 " 
    },
    // 2. Fees & Monetary Amounts (Amber/Gold)
    { 
      id: "money",
      rx: /(?:(?:₹|Rs\.?|INR|\$)\s*[\d,]+(?:\.\d+)?(?:\s*(?:lakh|crore|thousand))?|\b\d+(?:\.\d+)?\s*(?:lakh|crore)s?\b|\b(?:application|registration|exam|processing|tuition)\s+fee\b|\b(?:free\s+of\s+cost|no\s+fee|fee\s+exempt(?:ed)?|security\s+deposit|stipend|pay\s+scale)\b)/gi, 
      cls: "reader-kw-money", 
      icon: "💰 " 
    },
    // 3. Percentages, Marks & Age Criteria (Purple)
    { 
      id: "elig",
      rx: /\b(\d{1,2}(?:\.\d+)?\s*%|\d{1,2}\s*(?:to|-)\s*\d{1,2}\s*years|age\s*limit|minimum\s*(?:marks|aggregate|percentage)|maximum\s*age|cgpa\s*(?:of\s*)?\d(?:\.\d+)?|bachelor(?:'s)?(?:\s*degree)?|master(?:'s)?(?:\s*degree)?|matriculation|10\s*\+\s*2|graduation|b\.?tech|b\.?e\.|mbbs|ugc[\-\s]*net|gate)\b/gi, 
      cls: "reader-kw-eligibility", 
      icon: "🎯 " 
    },
    // 4. Mandatory Required Documents (Green)
    { 
      id: "doc",
      rx: /\b(aadhaar(?:\s*card)?|aadhar(?:\s*card)?|pan(?:\s*card)?|income\s*certificate|domicile(?:\s*certificate)?|caste\s*certificate|marksheet|matriculation|passing\s*certificate|degree\s*certificate|passport\s*(?:size\s+)?photo(?:graph)?|bank\s*passbook|cancelled\s*cheque|affidavit|character\s*certificate|experience\s*certificate|noc|disability\s*certificate)\b/gi, 
      cls: "reader-kw-doc", 
      icon: "📄 " 
    },
    // 5. Fine Print & Trap Clauses (Red)
    { 
      id: "trap",
      rx: /\b(strictly\s+prohibited|summarily\s+rejected|will\s+be\s+rejected|liable\s+to\s+rejection|debarred|non[\s\-]*refundable|service\s+bond|penalty\s+of|forfeited|subject\s+to\s+(?:fund\s+)?availability|at\s+(?:the\s+)?sole\s+discretion|cancellation\s+of\s+candidature|without\s+prior\s+notice|subject\s+to\s+change)\b/gi, 
      cls: "reader-kw-trap", 
      icon: "⚠️ " 
    }
  ];

  const counts = { date: 0, money: 0, elig: 0, doc: 0, trap: 0 };

  PATTERNS.forEach(p => {
    safe = safe.replace(p.rx, (m) => {
      counts[p.id]++;
      return `<span class="${p.cls}">${p.icon}${m}</span>`;
    });
  });

  // Update toolbar count chips
  const cDate = document.getElementById("count-chip-date");
  if (cDate) cDate.textContent = counts.date;
  const cMoney = document.getElementById("count-chip-money");
  if (cMoney) cMoney.textContent = counts.money;
  const cElig = document.getElementById("count-chip-elig");
  if (cElig) cElig.textContent = counts.elig;
  const cDoc = document.getElementById("count-chip-doc");
  if (cDoc) cDoc.textContent = counts.doc;
  const cTrap = document.getElementById("count-chip-trap");
  if (cTrap) cTrap.textContent = counts.trap;

  // Re-inject target finding fluorescent yellow marker
  if (targetFound) {
    safe = safe.replace(
      placeholder, 
      `<mark class="drawer-target-highlight" id="target-finding-anchor"><span class="target-marker-badge">🎯 TARGET FINDING</span>${esc(targetFound)}</mark>`
    );
  }

  return safe;
}

function searchInViewer(term) {
  const preEl = document.getElementById("drawer-source-pre");
  const countEl = document.getElementById("viewer-search-count");
  if (!preEl) return;

  // Clean old search markers
  preEl.querySelectorAll(".viewer-search-match").forEach(el => {
    el.outerHTML = el.textContent;
  });

  if (!term || term.trim().length < 2) {
    if (countEl) countEl.style.display = "none";
    currentSearchMatches = [];
    currentSearchIndex = 0;
    return;
  }

  const q = term.trim();
  const qLower = q.toLowerCase();
  
  const walker = document.createTreeWalker(preEl, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && !node.parentElement.classList.contains('target-marker-badge')) {
      textNodes.push(node);
    }
  }

  currentSearchMatches = [];
  let totalMatches = 0;

  textNodes.forEach(textNode => {
    const textVal = textNode.nodeValue;
    const lowerVal = textVal.toLowerCase();
    let startPos = 0;
    let matchIdx = lowerVal.indexOf(qLower, startPos);

    if (matchIdx !== -1) {
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      while (matchIdx !== -1) {
        if (matchIdx > lastIdx) {
          frag.appendChild(document.createTextNode(textVal.substring(lastIdx, matchIdx)));
        }
        const span = document.createElement("mark");
        span.className = "viewer-search-match";
        span.style.background = "#c7d2fe";
        span.style.color = "#1e1b4b";
        span.style.padding = "1px 4px";
        span.style.borderRadius = "3px";
        span.style.fontWeight = "700";
        span.textContent = textVal.substr(matchIdx, q.length);
        frag.appendChild(span);
        currentSearchMatches.push(span);
        totalMatches++;

        lastIdx = matchIdx + q.length;
        matchIdx = lowerVal.indexOf(qLower, lastIdx);
      }
      if (lastIdx < textVal.length) {
        frag.appendChild(document.createTextNode(textVal.substring(lastIdx)));
      }
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(frag, textNode);
      }
    }
  });

  if (countEl) {
    countEl.style.display = "inline-block";
    countEl.textContent = totalMatches > 0 ? `${totalMatches} match${totalMatches > 1 ? 'es' : ''}` : 'No matches';
  }

  if (currentSearchMatches.length > 0) {
    currentSearchIndex = 0;
    currentSearchMatches[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function nextSearchMatch() {
  if (!currentSearchMatches.length) return;
  currentSearchIndex = (currentSearchIndex + 1) % currentSearchMatches.length;
  currentSearchMatches[currentSearchIndex].scrollIntoView({ behavior: "smooth", block: "center" });
}
