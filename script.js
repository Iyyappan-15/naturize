/* ============================================================
   NATURIZE — script.js
   Sections:
   1. DOM Elements    2. State        3. LocalStorage
   4. API Functions   5. Humanizer UI 6. Detector UI
   7. Tabs            8. Typewriter   9. Scroll Reveal
   10. Toast          11. Modal       12. Events
   ============================================================ */

/* ── 1. DOM ELEMENTS ── */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const hamburger    = $('#hamburger');
const mobileMenu   = $('#mobile-menu');
const tabBtns      = $$('.tab-btn');
const humanizePane = $('#humanize-pane');
const detectPane   = $('#detect-pane');
const hInput       = $('#h-input');
const hWordCount   = $('#h-word-count');
const hCharCount   = $('#h-char-count');
const hBtn         = $('#h-btn');
const hOutput      = $('#h-output');
const toneSelect   = $('#tone-select');
const regionSelect = $('#region-select');
// hCopyBtn / hClearBtn are rendered dynamically — handled via onclick in renderHumanizedOutput()
const dInput       = $('#d-input');
const dBtn         = $('#d-btn');
const dResult      = $('#d-result');
const modalOverlay = $('#modal-overlay');
const modalClose   = $('#modal-close');
const toastContainer = $('#toast-container');
const themeToggleBtn = $('#theme-toggle');

/* New Elements */
const usageCounts  = $('#usage-bar-counts');
const usageFillH   = $('#usage-fill-h');
const usageFillD   = $('#usage-fill-d');
const hFileInput   = $('#h-file-input');
const hFileName    = $('#h-file-name');
const dFileInput   = $('#d-file-input');
const dFileName    = $('#d-file-name');

const hFeedbackRow = $('#h-feedback-row');
const hThumbUp     = $('#h-thumb-up');
const hThumbDown   = $('#h-thumb-down');
const hFeedThanks  = $('#h-feedback-thanks');

const dFeedbackRow = $('#d-feedback-row');
const dThumbUp     = $('#d-thumb-up');
const dThumbDown   = $('#d-thumb-down');
const dFeedThanks  = $('#d-feedback-thanks');

const historyBtn     = $('#h-history-btn');
const historyDrawer  = $('#history-drawer');
const historyOverlay = $('#history-overlay');
const historyClose   = $('#history-close');
const historyContent = $('#history-content');

/* ── THEME SYSTEM ── */
function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem('nz_theme', theme);
}
function initTheme() {
  const saved = localStorage.getItem('nz_theme') || 'dark';
  applyTheme(saved);
}

/* ── 2. STATE ── */
const state = {
  activeTab: 'humanize',
  hLoading: false,
  dLoading: false,
  lastHumanized: '',
};

/* ── 3. LOCALSTORAGE / FREE TIER ── */
const DAILY_LIMIT = 6;

function getUsage(type) {
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(`nz_${type}`);
  if (!raw) return { date: today, count: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) return { date: today, count: 0 };
    return parsed;
  } catch { return { date: today, count: 0 }; }
}

function incrementUsage(type) {
  const usage = getUsage(type);
  usage.count += 1;
  localStorage.setItem(`nz_${type}`, JSON.stringify(usage));
}

function canUse(type) {
  return getUsage(type).count < DAILY_LIMIT;
}

function usesLeft(type) {
  return Math.max(0, DAILY_LIMIT - getUsage(type).count);
}

function updateUsageBar() {
  if (!usageCounts) return;
  const hUsed = getUsage('humanize').count;
  const dUsed = getUsage('detect').count;
  const hPct = Math.min(100, (hUsed / DAILY_LIMIT) * 100);
  const dPct = Math.min(100, (dUsed / DAILY_LIMIT) * 100);
  
  usageCounts.textContent = `H: ${hUsed}/${DAILY_LIMIT} | D: ${dUsed}/${DAILY_LIMIT}`;
  usageFillH.style.width = `${hPct}%`;
  usageFillD.style.width = `${dPct}%`;
}

/* ── 4. API FUNCTIONS ── */
async function callHumanize(text, tone = 'professional', region = 'US') {
  const res = await fetch('/api/humanize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tone, region }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return { result: data.result, humanityScore: data.humanityScore ?? 75 };
}

/* ── DOCX EXPORT ── */
function exportDocx() {
  if (!state.lastHumanized) return;
  try {
    const toneLabel = toneSelect ? toneSelect.options[toneSelect.selectedIndex]?.text || 'Professional' : 'Professional';
    const regionLabel = regionSelect ? regionSelect.options[regionSelect.selectedIndex]?.text || 'American' : 'American';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8"><title>Naturize Export</title></head>
        <body style="font-family: Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 2cm;">
          <h2 style="color: #00c9a7; font-size: 16pt;">Naturize - Humanized Text</h2>
          <p style="color: #888; font-size: 10pt; margin-bottom: 20px;">Tone: ${escapeHtml(toneLabel)} | Region: ${escapeHtml(regionLabel)} | Exported from naturize.iyyappan.me</p>
          <hr style="border: none; border-top: 1px solid #eee; margin-bottom: 20px;" />
          <p style="font-size: 12pt; line-height: 1.8;">${escapeHtml(state.lastHumanized).replace(/\n/g, '<br/>')}</p>
        </body>
      </html>`;

    if (typeof htmlDocx !== 'undefined' && htmlDocx.asBlob) {
      const blob = htmlDocx.asBlob(htmlContent);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'naturize-export.docx';
      a.click();
      URL.revokeObjectURL(url);
      showToast('DOCX file downloaded!', 'success');
    } else {
      const blob = new Blob([state.lastHumanized], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'naturize-export.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded as .txt (DOCX library loading...)', 'success');
    }
  } catch (err) {
    console.error('DOCX export error:', err);
    showToast('Export failed. Please try again.', 'error');
  }
}

/* ── PDF EXPORT ── */
function exportPdf() {
  if (!state.lastHumanized) return;
  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library still loading. Please try again in a moment.', 'error');
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const margin = 20;
    const usableW = pageW - margin * 2;

    // ── Safe ASCII labels (avoid encoding issues with special chars) ──
    const toneRaw   = toneSelect   ? toneSelect.options[toneSelect.selectedIndex]?.text   || 'Professional' : 'Professional';
    const regionRaw = regionSelect ? regionSelect.options[regionSelect.selectedIndex]?.text || 'American'    : 'American';
    // Strip any emoji/special chars for PDF safety
    const toneLabel   = toneRaw.replace(/[^\x20-\x7E]/g, '').trim();
    const regionLabel = regionRaw.replace(/[^\x20-\x7E]/g, '').trim();

    // ── HEADER ──
    doc.setFillColor(18, 18, 28);
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setTextColor(0, 201, 167);  // accent teal
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Naturize - Humanized Text', margin, 17);

    doc.setTextColor(180, 180, 180);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const metaLine = `Tone: ${toneLabel}  |  Region: ${regionLabel}  |  naturize.iyyappan.me`;
    doc.text(metaLine, margin, 27);

    // Separator line
    doc.setDrawColor(0, 201, 167);
    doc.setLineWidth(0.4);
    doc.line(margin, 35, pageW - margin, 35);

    // ── BODY TEXT with automatic page breaks ──
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    // Sanitize text: replace non-latin-1 characters to avoid encoding corruption
    const safeText = state.lastHumanized
      .replace(/\u2014/g, '-')   // em dash -> hyphen
      .replace(/\u2013/g, '-')   // en dash -> hyphen
      .replace(/\u2018|\u2019/g, "'")  // smart single quotes
      .replace(/\u201C|\u201D/g, '"')  // smart double quotes
      .replace(/\u2026/g, '...')       // ellipsis
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ''); // drop other non-latin1

    const lineHeight = 6;
    const lines = doc.splitTextToSize(safeText, usableW);
    let cursorY = 48;

    lines.forEach((line) => {
      if (cursorY + lineHeight > pageH - margin) {
        doc.addPage();
        // Repeat a small header on continuation pages
        doc.setFillColor(18, 18, 28);
        doc.rect(0, 0, pageW, 14, 'F');
        doc.setTextColor(0, 201, 167);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Naturize - Humanized Text (cont.)', margin, 9);
        doc.setDrawColor(0, 201, 167);
        doc.setLineWidth(0.3);
        doc.line(margin, 12, pageW - margin, 12);

        doc.setTextColor(30, 30, 30);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        cursorY = 22;
      }
      doc.text(line, margin, cursorY);
      cursorY += lineHeight;
    });

    // ── FOOTER on every page ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(8);
      doc.text(`Page ${p} of ${totalPages}  |  naturize.iyyappan.me`, margin, pageH - 8);
    }

    doc.save('naturize-export.pdf');
    showToast('PDF downloaded successfully!', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Export failed. Please try again.', 'error');
  }
}

/* ── EXPORT MENU TOGGLE ── */
function toggleExportMenu() {
  const menu = document.getElementById('export-menu');
  if (!menu) return;
  menu.classList.toggle('open');
}

function closeExportMenu() {
  const menu = document.getElementById('export-menu');
  if (menu) menu.classList.remove('open');
}

// Close export menu on outside click
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('export-wrap');
  if (wrap && !wrap.contains(e.target)) closeExportMenu();
});

async function callDetect(text) {
  const res = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

/* ── 5. HUMANIZER UI ── */
function updateCounters() {
  const val = hInput.value;
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  hWordCount.textContent = words + ' words';
  hCharCount.textContent = val.length + ' chars';
}

function renderSkeleton() {
  hOutput.innerHTML = `
    <div class="skeleton skel-line" style="width:90%"></div>
    <div class="skeleton skel-line" style="width:100%"></div>
    <div class="skeleton skel-line" style="width:82%"></div>
    <div class="skeleton skel-line" style="width:96%"></div>
    <div class="skeleton skel-line"></div>`;
}

function getHumanityColor(score) {
  if (score >= 80) return '#00e5c0';
  if (score >= 60) return '#88e500';
  if (score >= 40) return '#ffc800';
  return '#ff5c7a';
}
function getHumanityVerdict(score) {
  if (score >= 85) return 'Highly Human';
  if (score >= 70) return 'Mostly Human';
  if (score >= 50) return 'Mixed';
  if (score >= 30) return 'Partially AI';
  return 'Likely AI';
}

function renderHumanityMeter(score) {
  const color = getHumanityColor(score);
  const verdict = getHumanityVerdict(score);
  const circumference = 251;
  const offset = circumference - (score / 100) * circumference;
  const barWidth = score + '%';
  return `
    <div class="humanity-section" aria-label="Humanity Score">
      <div class="humanity-header">
        <span class="humanity-label">Humanity Score</span>
        <span class="humanity-verdict" style="color:${color}">${verdict}</span>
      </div>
      <div class="humanity-meter-wrap">
        <div class="humanity-circle">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle class="humanity-circle-track" cx="50" cy="50" r="40"/>
            <circle class="humanity-circle-fill" id="h-circle-fill" cx="50" cy="50" r="40"
              style="stroke:${color};stroke-dashoffset:${circumference}"/>
          </svg>
          <div class="humanity-circle-label">
            <span class="humanity-circle-pct" id="h-circle-pct" style="color:${color}">0</span>
            <span class="humanity-circle-sub">HUMAN</span>
          </div>
        </div>
        <div class="humanity-bar-wrap">
          <div class="humanity-bar-labels">
            <span>AI-Written</span><span>Human-Written</span>
          </div>
          <div class="humanity-bar-track">
            <div class="humanity-bar-fill" id="h-bar-fill" style="background:${color};width:0%"></div>
          </div>
          <p style="font-size:.8rem;color:var(--muted);margin-top:8px">
            This text scores <strong style="color:${color}">${score}%</strong> on the human-writing scale.
          </p>
        </div>
      </div>
    </div>`;
}

function animateHumanityMeter(score) {
  const color = getHumanityColor(score);
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = $('#h-circle-fill');
      const pct  = $('#h-circle-pct');
      const bar  = $('#h-bar-fill');
      const circumference = 251;
      const offset = circumference - (score / 100) * circumference;
      if (fill) fill.style.strokeDashoffset = offset;
      if (bar)  bar.style.width = score + '%';
      let cur = 0;
      const step = Math.ceil(score / 50);
      const iv = setInterval(() => {
        cur = Math.min(cur + step, score);
        if (pct) pct.textContent = cur;
        if (cur >= score) clearInterval(iv);
      }, 25);
    }, 60);
  });
}

function renderHumanizedOutput({ result, humanityScore }) {
  state.lastHumanized = result;
  const toneLabel = toneSelect ? toneSelect.options[toneSelect.selectedIndex]?.text || '' : '';
  hOutput.innerHTML = `
    <p class="output-text" id="output-text">${escapeHtml(result)}</p>
    ${renderHumanityMeter(humanityScore)}
    <div class="output-actions" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn--ghost btn--sm" onclick="copyOutput()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>
      <div class="export-wrap" id="export-wrap">
        <button class="btn--docx" onclick="toggleExportMenu()" id="export-main-btn" title="Export document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Export
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:2px"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="export-menu" id="export-menu">
          <button class="export-menu-item" onclick="exportDocx(); closeExportMenu()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export as DOCX
          </button>
          <button class="export-menu-item" onclick="exportPdf(); closeExportMenu()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Export as PDF
          </button>
        </div>
      </div>
      <button class="btn btn--ghost btn--sm" onclick="clearOutput()">Clear</button>
    </div>`;
  hOutput.style.animation = 'fadeIn .5s ease forwards';
  animateHumanityMeter(humanityScore);
}

function renderEmptyOutput() {
  hOutput.innerHTML = `
    <div class="output-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      <p>Your humanized text will appear here</p>
    </div>`;
}

async function runHumanize() {
  const text = hInput.value.trim();
  if (!text) { showToast('Please paste some text first.', 'error'); return; }
  if (text.length > 10000) { showToast('Text too long. Max 10,000 characters.', 'error'); return; }
  if (!canUse('humanize')) { showModal(); return; }

  const tone = toneSelect ? toneSelect.value : 'professional';
  const region = regionSelect ? regionSelect.value : 'US';
  const toneLabel = toneSelect ? toneSelect.options[toneSelect.selectedIndex]?.text || 'Professional' : 'Professional';

  state.hLoading = true;
  hBtn.disabled = true;
  if (toneSelect) toneSelect.disabled = true;
  if (regionSelect) regionSelect.disabled = true;
  renderSkeleton();

  try {
    const { result, humanityScore } = await callHumanize(text, tone, region);
    incrementUsage('humanize');
    saveHistory(text, result);
    renderHumanizedOutput({ result, humanityScore });
    showToast(`Done with ${toneLabel} tone! ${usesLeft('humanize')} free uses left today.`, 'success');
  } catch (err) {
    renderEmptyOutput();
    showToast(err.message || 'Something went wrong.', 'error');
  } finally {
    state.hLoading = false;
    hBtn.disabled = false;
    if (toneSelect) toneSelect.disabled = false;
    if (regionSelect) regionSelect.disabled = false;
  }
}

function copyOutput() {
  if (!state.lastHumanized) return;
  navigator.clipboard.writeText(state.lastHumanized).then(() => {
    showToast('Copied to clipboard!', 'success');
  });
}

function clearOutput() {
  state.lastHumanized = '';
  renderEmptyOutput();
}

/* ── HISTORY SYSTEM ── */
function saveHistory(original, humanized) {
  let hist = [];
  try {
    hist = JSON.parse(localStorage.getItem('nz_history') || '[]');
  } catch (e) {}
  
  // Add new item to start
  hist.unshift({
    id: Date.now(),
    date: new Date().toLocaleString(),
    original,
    humanized
  });
  
  // Keep only last 5
  if (hist.length > 5) hist = hist.slice(0, 5);
  localStorage.setItem('nz_history', JSON.stringify(hist));
  renderHistory();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('nz_history') || '[]');
  } catch (e) {
    return [];
  }
}

function renderHistory() {
  if (!historyContent) return;
  const hist = loadHistory();
  
  if (hist.length === 0) {
    historyContent.innerHTML = '<p class="history-empty">No history found. Try humanizing some text first!</p>';
    return;
  }
  
  historyContent.innerHTML = hist.map(item => `
    <div class="history-item">
      <span class="history-time">${item.date}</span>
      <div class="history-preview">${escapeHtml(item.humanized)}</div>
      <div class="history-actions">
        <button class="btn btn--primary" onclick="restoreHistory(${item.id})">Restore</button>
        <button class="btn btn--ghost" onclick="deleteHistory(${item.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

window.restoreHistory = function(id) {
  const hist = loadHistory();
  const item = hist.find(h => h.id === id);
  if (item) {
    hInput.value = item.original;
    updateCounters();
    renderHumanizedOutput({ result: item.humanized, humanityScore: 85 }); // Mock score since we don't save it
    closeHistory();
    showToast('Restored from history!', 'success');
  }
}

window.deleteHistory = function(id) {
  let hist = loadHistory();
  hist = hist.filter(h => h.id !== id);
  localStorage.setItem('nz_history', JSON.stringify(hist));
  renderHistory();
}

function openHistory() {
  renderHistory();
  historyDrawer?.classList.add('open');
  historyOverlay?.classList.add('open');
}

function closeHistory() {
  historyDrawer?.classList.remove('open');
  historyOverlay?.classList.remove('open');
}

/* ── 6. DETECTOR UI ── */
function getScoreColor(score) {
  if (score <= 25) return '#00e564';
  if (score <= 45) return '#88e500';
  if (score <= 60) return '#ffc800';
  if (score <= 80) return '#ff7800';
  return '#ff5c7a';
}

function getVerdictClass(verdict) {
  const map = {
    'Human': 'human',
    'Likely Human': 'likely-human',
    'Mixed': 'mixed',
    'Likely AI': 'likely-ai',
    'AI-Generated': 'ai'
  };
  return map[verdict] || 'mixed';
}

function renderDetectorSkeleton() {
  dResult.innerHTML = `
    <div class="detector-result">
      <div class="skeleton" style="width:160px;height:160px;border-radius:50%"></div>
      <div class="skeleton skel-line" style="width:120px;height:28px"></div>
      <div style="width:100%">
        <div class="skeleton skel-line" style="width:80%"></div>
        <div class="skeleton skel-line" style="width:65%"></div>
        <div class="skeleton skel-line" style="width:73%"></div>
      </div>
    </div>`;
}

function renderDetectorResult(result) {
  const isHuman = result.classification === 'Human Written';
  const isAI    = result.classification === 'AI Generated';

  let score, verdict, vClass, color, label;

  if (isAI) {
    score   = result.confidence || 0;
    verdict = '🤖 AI-Generated';
    vClass  = 'ai';
    color   = '#ff4444';
    label   = 'AI Score';
  } else if (isHuman) {
    score   = result.confidence || 0;
    verdict = '✅ Human Written';
    vClass  = 'human';
    color   = '#00c9a7';
    label   = 'Human Score';
  } else {
    score   = result.confidence || 50;
    verdict = '⚠️ Mixed / Uncertain';
    vClass  = 'mixed';
    color   = '#f59e0b';
    label   = 'Confidence';
  }

  score = Math.min(100, Math.max(0, score));
  const R = 65;
  const circumference = 2 * Math.PI * R; // 408.41

  dResult.innerHTML = `
    <div class="detector-result">
      <div class="meter-wrap" role="img" aria-label="${score}% ${label}">
        <svg width="160" height="160" viewBox="0 0 160 160" style="transform:rotate(-90deg)">
          <circle fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="12"
            cx="80" cy="80" r="${R}"/>
          <circle id="meter-fill" fill="none"
            stroke="${color}" stroke-width="12" stroke-linecap="round"
            cx="80" cy="80" r="${R}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference}"
            style="transition:stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)"/>
        </svg>
        <div class="meter-label" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span id="meter-score" style="font-size:2.2rem;font-weight:800;color:${color};line-height:1;">0</span>
          <span style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">${label}</span>
        </div>
      </div>

      <span class="verdict-badge verdict-badge--${vClass}" style="font-size:1rem;padding:8px 20px;margin-top:12px;">${verdict}</span>

      <p style="font-size:0.85rem;color:var(--muted);margin:14px 0 18px;text-align:center;max-width:440px;line-height:1.6;">
        ${escapeHtml(result.reasoning || '')}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin-bottom:14px;">
        <div style="background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.18);padding:12px;border-radius:10px;">
          <h4 style="color:#ff6b6b;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🤖 AI Signals</h4>
          <ul style="padding-left:16px;font-size:0.78rem;color:var(--muted);line-height:1.7;">
            ${(result.ai_signals || []).slice(0,4).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
        <div style="background:rgba(0,201,167,0.06);border:1px solid rgba(0,201,167,0.18);padding:12px;border-radius:10px;">
          <h4 style="color:#00c9a7;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">✍️ Human Signals</h4>
          <ul style="padding-left:16px;font-size:0.78rem;color:var(--muted);line-height:1.7;">
            ${(result.human_signals || []).slice(0,4).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
      </div>

      ${result.metrics_analysis ? `
      <div style="background:var(--surface2,#1e1e22);border:1px solid var(--border);padding:12px;border-radius:10px;width:100%;">
        <h4 style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;color:var(--text);">📊 Metrics</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${Object.entries(result.metrics_analysis).map(([k, v]) => `
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:4px 10px;border-radius:6px;font-size:0.72rem;color:var(--muted);">
              <strong style="color:var(--text);">${k.replace(/_/g,' ')}:</strong> ${v}
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;

  // Animate ring and count-up score
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill    = document.getElementById('meter-fill');
      const scoreEl = document.getElementById('meter-score');
      const targetOffset = circumference - (score / 100) * circumference;
      if (fill) fill.style.strokeDashoffset = targetOffset;

      let current = 0;
      const step = Math.ceil(score / 50) || 1;
      const interval = setInterval(() => {
        current = Math.min(current + step, score);
        if (scoreEl) scoreEl.textContent = current;
        if (current >= score) clearInterval(interval);
      }, 25);
    }, 100);
  });
}


async function runDetect() {
  const text = dInput.value.trim();
  if (!text) { showToast('Please paste some text first.', 'error'); return; }
  if (text.length > 10000) { showToast('Text too long. Max 10,000 characters.', 'error'); return; }
  
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 50) {
    showToast(`Please enter at least 50 words for accurate AI detection analysis. (Current: ${wordCount})`, 'error');
    return;
  }
  
  if (!canUse('detect')) { showModal(); return; }

  state.dLoading = true;
  dBtn.disabled = true;
  renderDetectorSkeleton();

  try {
    const result = await callDetect(text);
    incrementUsage('detect');
    renderDetectorResult(result);
    showToast(`Detection complete! ${usesLeft('detect')} free uses left today.`, 'success');
  } catch (err) {
    dResult.innerHTML = '';
    showToast(err.message || 'Detection failed.', 'error');
  } finally {
    state.dLoading = false;
    dBtn.disabled = false;
  }
}

/* ── 7. TABS ── */
function switchTab(tab) {
  state.activeTab = tab;
  tabBtns.forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  humanizePane.hidden = tab !== 'humanize';
  detectPane.hidden = tab !== 'detect';
}

/* ── 8. TYPEWRITER ── */
function initTypewriter() {
  const el = $('#typewriter');
  if (!el) return;
  const words = ['Undetectable.', 'Natural.', 'Free.'];
  let wi = 0, ci = 0, deleting = false;

  function tick() {
    const word = words[wi];
    if (!deleting) {
      el.textContent = word.slice(0, ++ci);
      if (ci === word.length) { deleting = true; setTimeout(tick, 1800); return; }
    } else {
      el.textContent = word.slice(0, --ci);
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; }
    }
    setTimeout(tick, deleting ? 55 : 90);
  }
  tick();
}

/* ── 9. SCROLL REVEAL ── */
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(el => observer.observe(el));
}

/* ── 10. TOAST ── */
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${escapeHtml(msg)}</span>`;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => { setTimeout(() => toast.classList.add('show'), 10); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ── 11. MODAL ── */
function showModal() { modalOverlay.classList.add('open'); }
function hideModal() { modalOverlay.classList.remove('open'); }

/* ── UTILITIES ── */
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── 12. EVENT LISTENERS ── */
// Hamburger
hamburger?.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});
mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  hamburger.classList.remove('open');
  mobileMenu.classList.remove('open');
}));

// Tabs
tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// Counters
hInput?.addEventListener('input', updateCounters);

// Humanizer
hBtn?.addEventListener('click', runHumanize);
hInput?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runHumanize(); });

// Detector
dBtn?.addEventListener('click', runDetect);
dInput?.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runDetect(); });

// Modal
modalClose?.addEventListener('click', hideModal);
modalOverlay?.addEventListener('click', e => { if (e.target === modalOverlay) hideModal(); });
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') {
    hideModal();
    closeHistory();
  } 
});

// History Drawer
historyBtn?.addEventListener('click', openHistory);
historyClose?.addEventListener('click', closeHistory);
historyOverlay?.addEventListener('click', closeHistory);

// CTA smooth scroll
$$('[data-scroll]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.querySelector(btn.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Theme toggle
themeToggleBtn?.addEventListener('click', () => {
  const isLight = document.documentElement.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
  showToast(isLight ? 'Dark mode on' : 'Light mode on', 'success');
});

// File Uploads
function handleFileUpload(e, inputEl, nameEl) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 50 * 1024) { showToast('File too large (max 50KB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    inputEl.value = ev.target.result;
    inputEl.dispatchEvent(new Event('input'));
    nameEl.textContent = file.name;
    showToast(`Loaded ${file.name}`, 'success');
  };
  reader.readAsText(file);
}
hFileInput?.addEventListener('change', e => handleFileUpload(e, hInput, hFileName));
dFileInput?.addEventListener('change', e => {
  handleFileUpload(e, dInput, dFileName);
  setTimeout(() => {
    const val = dInput.value;
    $('#d-char-count').textContent = val.length;
  }, 100);
});

// Feedback Listeners
function setupFeedback(upBtn, downBtn, thanksEl) {
  const handler = (e) => {
    upBtn.classList.remove('active');
    downBtn.classList.remove('active');
    e.currentTarget.classList.add('active');
    thanksEl.style.display = 'inline';
    showToast('Feedback submitted!', 'success');
  };
  upBtn?.addEventListener('click', handler);
  downBtn?.addEventListener('click', handler);
}
setupFeedback(hThumbUp, hThumbDown, hFeedThanks);
setupFeedback(dThumbUp, dThumbDown, dFeedThanks);

// Usage bar wrapper — callHumanize wraps to sync UI ONLY (no incrementUsage here — runHumanize does it)
const originalCallHumanize = callHumanize;
callHumanize = async function() {
  const r = await originalCallHumanize.apply(this, arguments);
  updateUsageBar();
  if (hFeedbackRow) hFeedbackRow.style.display = 'flex';
  if (hFeedThanks) hFeedThanks.style.display = 'none';
  if (hThumbUp) hThumbUp.classList.remove('active');
  if (hThumbDown) hThumbDown.classList.remove('active');
  return r;
}

// Usage bar wrapper — callDetect wraps to sync UI ONLY (no incrementUsage here — runDetect does it)
const originalCallDetect = callDetect;
callDetect = async function() {
  const r = await originalCallDetect.apply(this, arguments);
  updateUsageBar();
  if (dFeedbackRow) dFeedbackRow.style.display = 'flex';
  if (dFeedThanks) dFeedThanks.style.display = 'none';
  if (dThumbUp) dThumbUp.classList.remove('active');
  if (dThumbDown) dThumbDown.classList.remove('active');
  return r;
}

// Clear handlers to hide feedback
const hClear = () => { if (hFeedbackRow) hFeedbackRow.style.display = 'none'; };
const dClear = () => { if (dFeedbackRow) dFeedbackRow.style.display = 'none'; };
$('#h-input')?.addEventListener('input', (e) => { if (e.target.value === '') hClear(); });
$('#d-input')?.addEventListener('input', (e) => {
  const val = e.target.value;
  $('#d-char-count').textContent = val.length;
  if (val === '') dClear();
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTypewriter();
  initScrollReveal();
  renderEmptyOutput();
  updateCounters();
  updateUsageBar();
  switchTab('humanize');
});
