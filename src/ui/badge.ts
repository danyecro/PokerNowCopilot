import type { PlayerStats } from '../shared/types';
import { getBadgeColor, BADGE_COLORS } from './colors';
import { MIN_HANDS_FOR_STATS } from '../shared/constants';

const BADGE_CLASS = 'copilot-badge';

export function createOrUpdateBadge(
  seatEl: Element,
  stats: PlayerStats,
  onExploit: (playerId: string) => void,
): void {
  let badge = seatEl.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    applyBaseStyles(badge);

    // Ensure parent is relatively positioned for absolute child
    (seatEl as HTMLElement).style.position = 'relative';
    seatEl.appendChild(badge);
  }

  renderBadgeContent(badge, stats, onExploit);
}

export function removeBadge(seatEl: Element): void {
  seatEl.querySelector(`.${BADGE_CLASS}`)?.remove();
}

function renderBadgeContent(
  badge: HTMLElement,
  stats: PlayerStats,
  onExploit: (playerId: string) => void,
): void {
  const color = getBadgeColor(stats);
  const palette = BADGE_COLORS[color];

  badge.style.backgroundColor = palette.bg;
  badge.style.color = palette.text;
  badge.style.borderColor = palette.border;

  if (stats.handsSeen < MIN_HANDS_FOR_STATS) {
    badge.innerHTML = `<span style="opacity:0.7">n=${stats.handsSeen}</span>`;
    return;
  }

  const vpip = Math.round(stats.vpip * 100);
  const pfr  = Math.round(stats.pfr * 100);
  const af   = stats.af.toFixed(1);
  const tags = stats.tags.slice(0, 1).map(shortTag).join('');
  const tagPart = tags ? ` <span style="opacity:0.75;font-size:9px">${tags}</span>` : '';

  badge.innerHTML = `
    <span class="copilot-stat">${vpip}/${pfr} AF${af}${tagPart}</span>
    <button class="copilot-exploit" title="Analyze exploits" data-pid="${stats.playerId}">🎯</button>
  `;

  // Bind exploit button (re-bind each render to avoid stale closures)
  const btn = badge.querySelector<HTMLButtonElement>('.copilot-exploit');
  if (btn) {
    btn.onclick = (e) => {
      e.stopPropagation();
      onExploit(stats.playerId);
    };
  }
}

function applyBaseStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    position: 'absolute',
    bottom: '2px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 5px',
    borderRadius: '3px',
    border: '1px solid',
    fontSize: '10px',
    fontFamily: 'monospace',
    lineHeight: '1.3',
    whiteSpace: 'nowrap',
    zIndex: '10000',
    pointerEvents: 'none',
    userSelect: 'none',
    width: 'max-content',
  });
}

// Injected CSS for the exploit button (added once)
let styleInjected = false;
export function ensureBadgeStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .copilot-badge { box-sizing: border-box; }
    .copilot-stat { flex: 1; }
    .copilot-exploit {
      background: none; border: none; cursor: pointer;
      font-size: 10px; padding: 0 1px; line-height: 1;
      opacity: 0.75; pointer-events: auto;
    }
    .copilot-exploit:hover { opacity: 1; }
    .copilot-badge .copilot-stat { pointer-events: none; }
  `;
  document.head.appendChild(style);
}

const TAG_SHORT: Record<string, string> = {
  'Slowplays monsters': 'Slow',
  'Bluffs draws':       'Bluff',
  'Bombs river':        'Bomb↑',
  'Folds to turn pressure': 'Fold↑',
  'Calling station':    'Fish',
};
function shortTag(tag: string): string {
  return TAG_SHORT[tag] ?? tag;
}
