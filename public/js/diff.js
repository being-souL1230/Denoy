/**
 * diff.js: Zero-token word-level LCS diff algorithm and contradiction view toggling.
 */

function computeWordDiff(textA, textB) {
  const wordsA = (textA || "").trim().split(/\s+/).filter(Boolean);
  const wordsB = (textB || "").trim().split(/\s+/).filter(Boolean);
  const m = wordsA.length, n = wordsB.length;
  if (!m && !n) return { diffA: "", diffB: "" };
  if (!m) return { diffA: "", diffB: wordsB.map(w => `<span class="diff-added">${esc(w)}</span>`).join(" ") };
  if (!n) return { diffA: wordsA.map(w => `<span class="diff-removed">${esc(w)}</span>`).join(" "), diffB: "" };

  const norm = w => w.toLowerCase().replace(/[^\w]/g, "");

  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (norm(wordsA[i]) && norm(wordsA[i]) === norm(wordsB[j])) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m, j = n;
  const matchA = new Uint8Array(m);
  const matchB = new Uint8Array(n);
  while (i > 0 && j > 0) {
    if (norm(wordsA[i - 1]) && norm(wordsA[i - 1]) === norm(wordsB[j - 1])) {
      matchA[i - 1] = 1;
      matchB[j - 1] = 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const diffA = wordsA.map((w, idx) => matchA[idx] ? esc(w) : `<span class="diff-removed">${esc(w)}</span>`).join(" ");
  const diffB = wordsB.map((w, idx) => matchB[idx] ? esc(w) : `<span class="diff-added">${esc(w)}</span>`).join(" ");

  return { diffA, diffB };
}

let activeConflictView = 'diff';
function toggleConflictView(mode) {
  activeConflictView = mode;
  document.getElementById('btn-diff-mode')?.classList.toggle('is-active', mode === 'diff');
  document.getElementById('btn-raw-mode')?.classList.toggle('is-active', mode === 'raw');
  document.querySelectorAll('.conflict-diff-view').forEach(el => el.style.display = mode === 'diff' ? 'block' : 'none');
  document.querySelectorAll('.conflict-raw-view').forEach(el => el.style.display = mode === 'raw' ? 'block' : 'none');
}
