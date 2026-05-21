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
// hCopyBtn / hClearBtn are rendered dynamically — handled via onclick in renderHumanizedOutput()
const dInput       = $('#d-input');
const dBtn         = $('#d-btn');
const dResult      = $('#d-result');
const modalOverlay = $('#modal-overlay');
const modalClose   = $('#modal-close');
const toastContainer = $('#toast-container');
const themeToggleBtn = $('#theme-toggle');

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

/* ── 4. API FUNCTIONS ── */
async function callHumanize(text, tone = 'professional') {
  const res = await fetch('/api/humanize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return { result: data.result, humanityScore: data.humanityScore ?? 75 };
}

/* ── DOCX EXPORT ── */
function exportDocx() {
  if (!state.lastHumanized) return;
  try {
    // Build a simple HTML document for Word
    const toneLabel = toneSelect ? toneSelect.options[toneSelect.selectedIndex]?.text || 'Professional' : 'Professional';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8"><title>Naturize Export</title></head>
        <body style="font-family: Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 2cm;">
          <h2 style="color: #00c9a7; font-size: 16pt;">Naturize — Humanized Text</h2>
          <p style="color: #888; font-size: 10pt; margin-bottom: 20px;">Tone: ${escapeHtml(toneLabel)} &bull; Exported from naturize-web.vercel.app</p>
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
      // Fallback: download as plain .txt if library fails
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

async function callDetect(text) {
  const res = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
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
      <button class="btn--docx" onclick="exportDocx()" title="Export as Word document">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Export DOCX
      </button>
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
  const toneLabel = toneSelect ? toneSelect.options[toneSelect.selectedIndex]?.text || 'Professional' : 'Professional';

  state.hLoading = true;
  hBtn.disabled = true;
  if (toneSelect) toneSelect.disabled = true;
  renderSkeleton();

  try {
    const { result, humanityScore } = await callHumanize(text, tone);
    incrementUsage('humanize');
    renderHumanizedOutput({ result, humanityScore });
    showToast(`Done with ${toneLabel} tone! ${usesLeft('humanize')} free uses left today.`, 'success');
  } catch (err) {
    renderEmptyOutput();
    showToast(err.message || 'Something went wrong.', 'error');
  } finally {
    state.hLoading = false;
    hBtn.disabled = false;
    if (toneSelect) toneSelect.disabled = false;
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

function renderDetectorResult({ score, verdict, reasons }) {
  const color = getScoreColor(score);
  const circumference = 408;
  const offset = circumference - (score / 100) * circumference;
  const vClass = getVerdictClass(verdict);

  dResult.innerHTML = `
    <div class="detector-result">
      <div class="meter-wrap" role="img" aria-label="${score}% AI probability">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle class="meter-track" cx="80" cy="80" r="65"/>
          <circle class="meter-fill" id="meter-fill" cx="80" cy="80" r="65"
            style="stroke:${color};stroke-dashoffset:${circumference}"/>
        </svg>
        <div class="meter-label">
          <span class="meter-score" id="meter-score" style="color:${color}">0</span>
          <span class="meter-unit">AI Score</span>
        </div>
      </div>
      <span class="verdict-badge verdict-badge--${vClass}">${verdict}</span>
      <ul class="reasons-list" aria-label="Detection reasons">
        ${reasons.map((r, i) => `
          <li class="reason-item" style="transition-delay:${(i+1)*0.12}s">
            <span class="reason-dot" aria-hidden="true"></span>
            <span>${escapeHtml(r)}</span>
          </li>`).join('')}
      </ul>
    </div>`;

  // Animate meter
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = $('#meter-fill');
      const scoreEl = $('#meter-score');
      if (fill) fill.style.strokeDashoffset = offset;

      // Count-up animation
      let current = 0;
      const step = Math.ceil(score / 40);
      const interval = setInterval(() => {
        current = Math.min(current + step, score);
        if (scoreEl) scoreEl.textContent = current;
        if (current >= score) clearInterval(interval);
      }, 30);

      // Reveal reasons
      $$('.reason-item').forEach(el => {
        setTimeout(() => el.classList.add('revealed'), 300);
      });
    }, 80);
  });
}

async function runDetect() {
  const text = dInput.value.trim();
  if (!text) { showToast('Please paste some text first.', 'error'); return; }
  if (text.length > 10000) { showToast('Text too long. Max 10,000 characters.', 'error'); return; }
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModal(); });

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

// Init
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTypewriter();
  initScrollReveal();
  renderEmptyOutput();
  updateCounters();
  switchTab('humanize');
});
