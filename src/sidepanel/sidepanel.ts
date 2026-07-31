import type { ExtMessage } from '../shared/messages';
import type { AfkMode, GameState, PlayerStats } from '../shared/types';
import { boardToString, cardToString } from '../parser/cardUtils';
import { getBadgeColor } from '../ui/colors';
import { computeEdgeHints } from '../shared/edgeIndicator';
import { calcEquity } from '../equity/equityCalc';
import { getSettings, setSettings } from '../shared/storage';
import { MANUAL_LOG_PULL_HANDS, STORAGE_KEYS } from '../shared/constants';

let port: chrome.runtime.Port | null = null;
let currentStats: Record<string, PlayerStats> = {};
let currentHeroStats: PlayerStats | null = null;
let currentGameState: GameState | null = null;
let aiBuffer = '';
let analyzing = false;
let totalHands = 0;

// ── Connection ──────────────────────────────────────────────────────────────
function connect(): void {
  port = chrome.runtime.connect({ name: 'sidepanel' });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 1000); });
}

// ── Messages ────────────────────────────────────────────────────────────────
function onMessage(msg: ExtMessage): void {
  switch (msg.type) {
    case 'STATS_UPDATE':
      currentStats = msg.stats;
      totalHands = Math.max(0, ...Object.values(msg.stats).map(s => s.handsSeen));
      renderOpponents();
      renderEdgeHints();
      break;
    case 'HERO_STATS_UPDATE':
      currentHeroStats = msg.stats;
      renderHeroStats();
      break;
    case 'GAME_STATE_UPDATE':
    case 'PULL_RESPONSE':
      currentGameState = msg.gameState;
      renderHandBar();
      renderEdgeHints();
      renderOpponents();   // seats changed → refresh who is at the table
      unlockPullButtons();
      if (analyzeAfterPull) {
        analyzeAfterPull = false;
        if (pullTimeout) { clearTimeout(pullTimeout); pullTimeout = null; }
        requestAnalysis();
      }
      break;
    case 'LOG_PULL_PROGRESS':
      setStatus(`Reading the table log — ${msg.done}/${msg.total} hands…`, 'streaming');
      break;
    case 'LOG_PULL_RESULT': {
      if (logPullTimeout) { clearTimeout(logPullTimeout); logPullTimeout = null; }
      setLogPulling(false);
      setStatus(
        msg.found === 0
          ? 'No completed hand in the log yet.'
          : msg.ingested === 0
            ? `Log: ${msg.found} hands — all already counted.`
            : `Log: +${msg.ingested} new of ${msg.found} hands.`,
      );
      setTimeout(() => { if (!analyzing) setStatus(''); }, 5000);
      break;
    }
    case 'AI_STREAM_START': {
      const output = document.getElementById('ai-output');
      if (output) output.textContent = '';
      aiBuffer = '';
      setAnalyzing(true);
      setStatus(msg.label ?? 'Streaming…', 'streaming');
      break;
    }
    case 'AI_STREAM_CHUNK':
      appendAiChunk(msg.chunk);
      break;
    case 'AI_STREAM_DONE':
      setAnalyzing(false); setStatus('');
      break;
    case 'AI_STREAM_ERROR':
      // Also the channel a failed log pull reports on — never leave that button
      // spinning on an error.
      if (logPullTimeout) { clearTimeout(logPullTimeout); logPullTimeout = null; }
      setLogPulling(false);
      setAnalyzing(false); setStatus(msg.error, 'error');
      break;
  }
}

// ── Pull Buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.pull-btn[data-pull]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset['pull'] as 'hand' | 'board' | 'pot' | 'bets' | 'all';
    btn.classList.add('pulling');
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: 'PULL_REQUEST', target } as ExtMessage);
    // Timeout fallback — re-enable if no response within 3s
    setTimeout(() => { btn.classList.remove('pulling'); btn.disabled = false; }, 3000);
  });
});

function unlockPullButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.pull-btn[data-pull]').forEach(b => {
    b.classList.remove('pulling'); b.disabled = false;
  });
}

// ── Manual log pull ──────────────────────────────────────────────────────────
// Escape hatch for when the automatic per-hand pull collected nothing — a
// reload, a panel opened mid-session, or a pull that hit a dropped socket.
// Opens the table log, scrolls back until ~10 completed hands are loaded and
// counts every one of them that is new into the stats.
const logBtn = document.getElementById('btn-pull-log') as HTMLButtonElement | null;
const logCount = document.getElementById('log-count') as HTMLSelectElement | null;
let logPullTimeout: ReturnType<typeof setTimeout> | null = null;

function selectedLogHands(): number {
  const n = Number(logCount?.value);
  return Number.isFinite(n) && n > 0 ? n : MANUAL_LOG_PULL_HANDS;
}

function setLogPulling(on: boolean): void {
  if (logCount) logCount.disabled = on;
  if (!logBtn) return;
  logBtn.disabled = on;
  logBtn.classList.toggle('pulling', on);
  logBtn.textContent = on ? '📜 …' : '📜 Log';
}

/** Deadline scaled to the work: one request per hand, four at a time. */
function logPullTimeoutMs(hands: number): number {
  return 10000 + hands * 700;
}

logBtn?.addEventListener('click', () => {
  const hands = selectedLogHands();
  setLogPulling(true);
  setStatus(`Reading the table log (${hands} hands)…`, 'streaming');
  chrome.runtime.sendMessage({ type: 'LOG_PULL_REQUEST', minHands: hands } as ExtMessage);

  if (logPullTimeout) clearTimeout(logPullTimeout);
  logPullTimeout = setTimeout(() => {
    setLogPulling(false);
    setStatus('Log pull timed out — is the PokerNow tab still open?', 'error');
  }, logPullTimeoutMs(hands));
});

// Remember the choice across panel reopens.
logCount?.addEventListener('change', async () => {
  const settings = await getSettings();
  await setSettings({ ...settings, logPullHands: selectedLogHands() });
});

// ── Render: Hand Bar ─────────────────────────────────────────────────────────
function renderHandBar(): void {
  const gs = currentGameState;
  if (!gs) return;

  setText('val-hero-cards', gs.heroCards
    ? `${cardToString(gs.heroCards[0])} ${cardToString(gs.heroCards[1])}`
    : '—');
  setText('val-board', gs.board.length > 0 ? boardToString(gs.board) : '—');
  setText('val-pot', gs.pot > 0 ? String(gs.pot) : '—');
  setText('val-street', gs.street);

  renderEquity(gs);
}

function renderEquity(gs: GameState): void {
  const el = document.getElementById('val-equity');
  if (!el) return;

  if (!gs.heroCards) {
    el.textContent = '—';
    el.className = 'equity-value';
    return;
  }

  // Preflop → always heads-up equity (standard "hand strength" indicator, as in all poker tools).
  // Postflop → vs actual active opponents (more actionable with a known board).
  const isPreflop = gs.board.length === 0;
  const numOpponents = isPreflop
    ? 1
    : Math.max(1, gs.seats.filter(s => !s.isHero && s.isActive && !s.hasFolded).length);

  // Run Monte Carlo (synchronous — ~2–5 ms for 900 sims)
  const eq  = calcEquity(gs.heroCards, gs.board, numOpponents);
  const pct = Math.round(eq * 100);
  const label = isPreflop ? `${pct}% HU` : `${pct}% vs${numOpponents}`;

  el.textContent = label;
  el.className = 'equity-value ' + (
    pct > 55 ? 'eq-good' : pct < 40 ? 'eq-bad' : 'eq-neutral'
  );
}

// ── Render: Edge Hints ────────────────────────────────────────────────────────
function renderEdgeHints(): void {
  const el = document.getElementById('edge-list');
  if (!el) return;
  if (!currentGameState) {
    el.innerHTML = '<span class="placeholder">Pull the table state to see edge hints.</span>';
    return;
  }
  const hints = computeEdgeHints(currentGameState, currentStats);
  if (hints.length === 0) {
    el.innerHTML = '<span class="placeholder">No specific edges detected — play standard.</span>';
    return;
  }
  el.innerHTML = hints.map(h =>
    `<div class="edge-hint ${h.type}"><span class="edge-icon">${h.icon}</span><span>${esc(h.text)}</span></div>`
  ).join('');
}

// ── Render: Opponents ─────────────────────────────────────────────────────────
function renderOpponents(): void {
  const list = document.getElementById('opponent-list');
  const label = document.getElementById('hands-seen-label');
  if (!list) return;
  if (label) label.textContent = totalHands > 0 ? `(${totalHands} hands)` : '';

  // Players currently seated (from the last snapshot), hero excluded.
  const seated = (currentGameState?.seats ?? []).filter(s => !s.isHero);
  const atTableIds = new Set(seated.map(s => s.playerId));

  // Seated players come first — including ones with no stats yet, so the panel
  // shows who you are up against the moment you sit down instead of staying
  // empty until a hand completes. Then the rest of the session as history.
  const opponents: PlayerStats[] = [
    ...seated.map(s => currentStats[s.playerId]
      ?? { ...emptyRow(s.playerId, s.displayName) }),
    ...Object.values(currentStats).filter(s => !atTableIds.has(s.playerId)),
  ];

  if (opponents.length === 0) {
    list.innerHTML = '<span class="placeholder" style="padding:6px 10px">Open a PokerNow table — seated players appear here.</span>';
    return;
  }

  // Seated block keeps table order; history block sorted by sample size.
  const seatedCount = seated.length;
  const history = opponents.slice(seatedCount).sort((a, b) => b.handsSeen - a.handsSeen);
  opponents.length = seatedCount;
  opponents.push(...history);
  let lastWasAtTable = true;
  list.innerHTML = opponents.map(s => {
    const isAtTable = atTableIds.has(s.playerId);
    let separator = '';
    if (lastWasAtTable && !isAtTable && atTableIds.size > 0) {
      separator = `<div class="opp-separator">── history ──</div>`;
    }
    lastWasAtTable = isAtTable;

    const color = getBadgeColor(s);
    const dot = colorToCss(color);
    const hasData = s.handsSeen >= 3;
    if (!hasData) return `${separator}
      <div class="opp-row no-data">
        <div class="opp-name"><span class="opp-color-dot" style="background:${dot}"></span>${esc(s.displayName)}</div>
        <div class="opp-stats">n=${s.handsSeen} — collecting</div>
        <div></div>
      </div>`;

    const v = Math.round(s.vpip * 100), p = Math.round(s.pfr * 100);
    const tb = Math.round(s.threeBet * 100), fc = Math.round(s.foldToCbet * 100);
    const af = s.af.toFixed(1);
    const vC = v > 42 ? 'call' : v < 20 ? 'cold' : '';
    const pC = p > 25 ? 'hot' : '';
    const afC = parseFloat(af) > 3 ? 'hot' : '';
    const tags = s.tags.slice(0, 2).join(' · ');

    return `${separator}<div class="opp-row${isAtTable ? ' at-table' : ''}">
      <div class="opp-name"><span class="opp-color-dot" style="background:${dot}"></span>${esc(s.displayName)}</div>
      <div class="opp-stats">
        <div class="opp-stat-row">
          <span class="stat-chip ${vC}" title="VPIP">V${v}%</span>
          <span class="stat-chip ${pC}" title="PFR">P${p}%</span>
          <span class="stat-chip" title="3Bet">3B${tb}%</span>
          <span class="stat-chip ${afC}" title="Aggression Factor">AF${af}</span>
          <span class="stat-chip" title="Fold to CBet">F↳${fc}%</span>
        </div>
        ${tags ? `<div class="opp-tags">${esc(tags)}</div>` : ''}
      </div>
      <div class="opp-n">n=${s.handsSeen}</div>
    </div>`;
  }).join('');
}

// ── Render: Hero Stats ────────────────────────────────────────────────────────
function renderHeroStats(): void {
  const el = document.getElementById('hero-stats-content');
  if (!el) return;
  const s = currentHeroStats;
  if (!s || s.handsSeen < 1) {
    el.innerHTML = '<span class="placeholder">Play hands to track your own stats.</span>';
    return;
  }
  const v = Math.round(s.vpip * 100), p = Math.round(s.pfr * 100);
  const tb = Math.round(s.threeBet * 100), fc = Math.round(s.foldToCbet * 100);
  const af = s.af.toFixed(1);
  el.innerHTML = `
    <div class="hero-stat-row">
      <span class="stat-chip" title="VPIP">V:${v}%</span>
      <span class="stat-chip" title="PFR">P:${p}%</span>
      <span class="stat-chip" title="3Bet">3B:${tb}%</span>
      <span class="stat-chip" title="AF">AF:${af}</span>
      <span class="stat-chip" title="Fold to CBet">F↳:${fc}%</span>
      <span class="stat-chip" style="color:#6b7280">n=${s.handsSeen}</span>
    </div>
    ${s.tags.length ? `<div class="opp-tags" style="margin-top:3px">You: ${esc(s.tags.join(' · '))}</div>` : ''}
  `;
}

// ── AI ────────────────────────────────────────────────────────────────────────
function appendAiChunk(chunk: string): void {
  const output = document.getElementById('ai-output');
  if (!output) return;
  aiBuffer += chunk;
  output.textContent = aiBuffer;
  setStatus('Streaming…', 'streaming');
  output.scrollTop = output.scrollHeight;
}

// Manual analysis always pulls a fresh snapshot first. Previously it bailed out
// silently whenever `currentGameState` was null — which is the case every time
// the panel is opened before any hand has ended, so the button looked dead. It
// also meant a stale board could be analysed.
let analyzeAfterPull = false;
let pullTimeout: ReturnType<typeof setTimeout> | null = null;

document.getElementById('btn-analyze')?.addEventListener('click', () => {
  if (analyzing) return;
  const output = document.getElementById('ai-output');
  if (output) output.textContent = '';
  aiBuffer = '';
  setAnalyzing(true);
  setStatus('Reading table…', 'streaming');

  analyzeAfterPull = true;
  chrome.runtime.sendMessage({ type: 'PULL_REQUEST', target: 'all' } as ExtMessage);

  if (pullTimeout) clearTimeout(pullTimeout);
  pullTimeout = setTimeout(() => {
    if (!analyzeAfterPull) return;
    analyzeAfterPull = false;
    if (currentGameState) {
      requestAnalysis();   // pull timed out but we have an older snapshot
    } else {
      setAnalyzing(false);
      setStatus('No table state — open a PokerNow table and try again.', 'error');
    }
  }, 4000);
});

function requestAnalysis(): void {
  if (!currentGameState) return;
  setAnalyzing(true);
  setStatus('Requesting analysis…', 'streaming');
  chrome.runtime.sendMessage({
    type: 'AI_ANALYZE_REQUEST',
    gameState: currentGameState,
    stats: currentStats,
  } as ExtMessage);
}

document.getElementById('btn-settings')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Auto-analyze toggle ───────────────────────────────────────────────────────
// The content script re-reads `autoAnalyze` from storage on every street change,
// so persisting the flag is all it takes — no message plumbing needed.
const autoBtn = document.getElementById('btn-auto') as HTMLButtonElement | null;

function paintAutoBtn(on: boolean): void {
  if (!autoBtn) return;
  autoBtn.setAttribute('aria-pressed', String(on));
  autoBtn.title = on
    ? 'Auto-analyze ON — runs on every street change. Click to turn off.'
    : 'Auto-analyze OFF — click to analyze automatically on every street change.';
}

autoBtn?.addEventListener('click', async () => {
  autoBtn.disabled = true;
  try {
    // Read-modify-write so a concurrent options-page save is not clobbered.
    const settings = await getSettings();
    const next = !settings.autoAnalyze;
    await setSettings({ ...settings, autoAnalyze: next });
    paintAutoBtn(next);
    setStatus(next ? 'Auto-analyze on — every street.' : 'Auto-analyze off.');
    setTimeout(() => { if (!analyzing) setStatus(''); }, 2500);
  } finally {
    autoBtn.disabled = false;
  }
});

// ── AFK auto-action ───────────────────────────────────────────────────────────
const afkSelect = document.getElementById('afk-mode') as HTMLSelectElement | null;
const afkBar = document.getElementById('afk-bar');

function paintAfk(mode: AfkMode): void {
  if (afkSelect) afkSelect.value = mode;
  afkBar?.classList.toggle('armed', mode !== 'off');
  const state = document.getElementById('afk-state');
  if (state) state.textContent = mode === 'off' ? '' : '● ARMED';
}

afkSelect?.addEventListener('change', async () => {
  const mode = afkSelect.value as AfkMode;
  const settings = await getSettings();
  await setSettings({ ...settings, afkMode: mode });
  paintAfk(mode);
  setStatus(
    mode === 'off'      ? 'AFK off.'
    : mode === 'fold'   ? 'AFK armed: folds every hand. Any key at the table cancels.'
    :                     'AFK armed: checks when free, folds to a bet. Any key at the table cancels.',
  );
  setTimeout(() => { if (!analyzing) setStatus(''); }, 4000);
});

// Keep the controls honest if settings change elsewhere — the content script
// resets afkMode to 'off' as soon as you touch the table again.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const next = changes[STORAGE_KEYS.SETTINGS]?.newValue;
  if (!next) return;
  paintAutoBtn(Boolean(next.autoAnalyze));
  paintAfk((next.afkMode as AfkMode | undefined) ?? 'off');
});

getSettings()
  .then(s => {
    paintAutoBtn(s.autoAnalyze);
    paintAfk(s.afkMode);
    if (logCount && s.logPullHands) logCount.value = String(s.logPullHands);
  })
  .catch(console.error);

// ── Helpers ───────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setStatus(msg: string, type = ''): void {
  const el = document.getElementById('ai-status');
  if (!el) return; el.textContent = msg; el.className = type;
}
function setAnalyzing(on: boolean): void {
  analyzing = on;
  const btn = document.getElementById('btn-analyze') as HTMLButtonElement | null;
  if (btn) { btn.disabled = on; btn.textContent = on ? 'Analyzing…' : 'Analyze moves'; }
}
/** Placeholder row for a seated player we have not seen finish a hand yet. */
function emptyRow(playerId: string, displayName: string): PlayerStats {
  return {
    playerId, displayName, handsSeen: 0,
    vpip: 0, pfr: 0, threeBet: 0, foldToCbet: 0, af: 0,
    counters: { vpipOpp: 0, vpipAct: 0, pfrOpp: 0, pfrAct: 0, threeBetOpp: 0, threeBetAct: 0,
      cbetOpp: 0, cbetFold: 0, bets: 0, raises: 0, calls: 0 },
    showdownRanges: [], tags: [], lastUpdated: 0,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function colorToCss(color: string): string {
  return ({ red:'#e74c3c', blue:'#3498db', yellow:'#f1c40f', gray:'#6b7280' } as Record<string,string>)[color] ?? '#6b7280';
}

connect();
