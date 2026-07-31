import type { PlayerStats } from '../shared/types';
import { SEL } from './selectors';
import { getBadgeColor, BADGE_COLORS } from '../ui/colors';
import { MIN_HANDS_FOR_STATS } from '../shared/constants';

const OVERLAY_ID = 'copilot-overlay-layer';

// playerId → badge element
const badgeMap = new Map<string, HTMLElement>();
// playerId → seat element (for positioning)
const seatMap  = new Map<string, Element>();

let currentStats: Record<string, PlayerStats> = {};
let onExploitFn: ((playerId: string) => void) = () => {};

let enabled = true;

export function setOverlaysEnabled(on: boolean): void {
  enabled = on;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.style.display = on ? 'block' : 'none';
}

export function updateOverlays(
  stats: Record<string, PlayerStats>,
  onExploit: (playerId: string) => void,
): void {
  currentStats = stats;
  onExploitFn  = onExploit;
  if (!enabled) return;

  ensureOverlay();
  syncBadges();
  attachRepositionTriggers();
  scheduleReposition();
}

// ── Overlay container ────────────────────────────────────────────────────────

function ensureOverlay(): HTMLElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '10000',
      overflow: 'hidden',
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

// ── Badge sync (create / update / remove) ────────────────────────────────────

function syncBadges(): void {
  const overlay = ensureOverlay();

  // Build current seat map from DOM
  seatMap.clear();
  document.querySelectorAll<Element>(SEL.ALL_PLAYERS).forEach(seatEl => {
    const link = seatEl.querySelector<HTMLAnchorElement>(SEL.PLAYER_NAME_LINK);
    const pid  = link?.getAttribute('href')?.split('/').pop() ?? '';
    if (!pid || seatEl.classList.contains('you-player')) return;
    seatMap.set(pid, seatEl);
  });

  // Remove badges for players no longer at the table
  for (const [pid, badge] of badgeMap) {
    if (!seatMap.has(pid)) {
      badge.remove();
      badgeMap.delete(pid);
    }
  }

  // Create or update badges
  for (const pid of seatMap.keys()) {
    const stats = currentStats[pid];
    let badge = badgeMap.get(pid);

    if (!badge) {
      badge = document.createElement('div');
      badge.style.position = 'absolute'; // absolute within the fixed overlay
      badge.style.pointerEvents = 'none';
      overlay.appendChild(badge);
      badgeMap.set(pid, badge);
    }

    renderBadge(badge, pid, stats);
  }
  // Positioning happens in one batched pass after all badges exist.
}

// ── Badge rendering ───────────────────────────────────────────────────────────

function renderBadge(badge: HTMLElement, pid: string, stats: PlayerStats | undefined): void {
  const color = stats ? getBadgeColor(stats) : 'gray';
  const palette = BADGE_COLORS[color as keyof typeof BADGE_COLORS] ?? BADGE_COLORS.gray;

  Object.assign(badge.style, {
    background:   palette.bg,
    color:        palette.text,
    border:       `1px solid ${palette.border}`,
    borderRadius: '3px',
    fontSize:     '10px',
    fontFamily:   'monospace',
    lineHeight:   '1.3',
    whiteSpace:   'nowrap',
    padding:      '1px 5px',
    display:      'flex',
    alignItems:   'center',
    gap:          '3px',
    userSelect:   'none',
  });

  if (!stats || stats.handsSeen < MIN_HANDS_FOR_STATS) {
    badge.innerHTML = `<span style="opacity:.7">n=${stats?.handsSeen ?? 0}</span>`;
    return;
  }

  const vpip = Math.round(stats.vpip * 100);
  const pfr  = Math.round(stats.pfr  * 100);
  const af   = stats.af.toFixed(1);
  const tag  = stats.tags[0] ? ` ${shortTag(stats.tags[0])}` : '';

  // Exploit button — needs pointer-events: auto
  badge.innerHTML = `
    <span>${vpip}/${pfr} AF${af}${tag}</span>
    <button data-pid="${pid}" title="Potential exploits"
      style="background:none;border:none;cursor:pointer;font-size:10px;
             padding:0 1px;line-height:1;opacity:.8;pointer-events:auto;">🎯</button>
  `;

  const btn = badge.querySelector<HTMLButtonElement>('button[data-pid]');
  if (btn) {
    btn.onclick = (e) => { e.stopPropagation(); onExploitFn(pid); };
  }
}

// ── Positioning ───────────────────────────────────────────────────────────────

/**
 * Repositions every badge in one pass: all geometry is read first, then all
 * styles are written.
 *
 * Interleaving reads and writes per badge is what made the old version lethal —
 * each `getBoundingClientRect()` after a `style.left` write forces a synchronous
 * layout, so N badges cost 2N reflows. Running that on every animation frame
 * produced a 2.9-second requestAnimationFrame handler on a live table, which
 * starved PokerNow's own socket (`WebSocket is already in CLOSING or CLOSED
 * state`) and made its log_v3 requests fail.
 */
function repositionAll(): void {
  if (!enabled || badgeMap.size === 0) return;

  // Phase 1 — read only.
  const layout: Array<{ badge: HTMLElement; rect: DOMRect; width: number }> = [];
  for (const [pid, badge] of badgeMap) {
    const seatEl = seatMap.get(pid);
    if (!seatEl) continue;
    layout.push({
      badge,
      rect: seatEl.getBoundingClientRect(),
      width: badge.offsetWidth || 80,
    });
  }

  // Phase 2 — write only.
  for (const { badge, rect, width } of layout) {
    if (rect.width === 0 && rect.height === 0) {
      badge.style.display = 'none';
      continue;
    }
    badge.style.display = 'flex';
    badge.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
    badge.style.top  = `${rect.bottom - 18}px`;
  }
}

// ── Reposition triggers ──────────────────────────────────────────────────────
// Seats only move when the viewport changes or PokerNow re-lays out the table,
// so listen for those instead of polling 60 times a second. Each trigger is
// coalesced into a single frame.

let scheduled = false;
let listenersAttached = false;

function scheduleReposition(): void {
  if (scheduled || !enabled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    repositionAll();
  });
}

function attachRepositionTriggers(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  window.addEventListener('resize', scheduleReposition, { passive: true });
  window.addEventListener('scroll', scheduleReposition, { passive: true, capture: true });

  const table = document.querySelector(SEL.SEATS);
  if (table && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleReposition).observe(table);
  }
}

export function removeAllBadges(): void {
  for (const badge of badgeMap.values()) badge.remove();
  badgeMap.clear();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_SHORT: Record<string, string> = {
  'Slowplays monsters': 'Slow',
  'Bluffs draws':       'Bluff',
  'Bombs river':        'Bomb↑',
  'Folds to turn pressure': 'F↑Turn',
  'Calling station':    'Fish',
};
function shortTag(tag: string): string {
  return TAG_SHORT[tag] ?? tag;
}
