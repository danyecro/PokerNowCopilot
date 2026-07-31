import type { PlayerStats } from '../shared/types';
import { MIN_HANDS_FOR_STATS } from '../shared/constants';

// PokerNow color hex values (from aria-label on buttons)
const POKERNOW_COLORS = {
  red:    '#e41a1c',  // Loose Aggressive / Maniac
  blue:   '#377eb8',  // Tight Aggressive (TAG)
  green:  '#4daf4a',  // Solid / Balanced
  purple: '#984ea3',  // 3Bet heavy / PF aggressor
  orange: '#ff7f00',  // Loose Passive
  yellow: '#ffff33',  // Calling Station / Fish
  brown:  '#a65628',  // Tricky / Slowplayer
  pink:   '#f781bf',  // Unknown / too few hands
} as const;

type PNColor = keyof typeof POKERNOW_COLORS;

const COPILOT_MARKER = '📊Copilot:';
const SEPARATOR = '\n---\n';

// ── Color selection based on stats ─────────────────────

export function selectColorForPlayer(stats: PlayerStats): PNColor {
  if (stats.handsSeen < MIN_HANDS_FOR_STATS) return 'pink';

  const { vpip, pfr, af, threeBet } = stats;

  // Tricky: slowplays or inconsistent aggression
  if (stats.tags.includes('Slowplays monsters')) return 'brown';

  // Maniac / LAG: loose + aggressive
  if (vpip > 0.38 && af > 3) return 'red';

  // 3Bet happy aggressor
  if (threeBet > 0.12 && pfr > 0.22) return 'purple';

  // TAG: tight + aggressive
  if (vpip < 0.24 && pfr > 0.15 && af > 1.8) return 'blue';

  // Calling station: loose + passive
  if (vpip > 0.38 && af < 1.5) return 'yellow';

  // Loose passive: plays wide but doesn't raise
  if (vpip > 0.32 && pfr < 0.12) return 'orange';

  // Solid / balanced
  if (vpip >= 0.20 && vpip <= 0.34 && pfr >= 0.12) return 'green';

  // Tight passive / nit
  if (vpip < 0.20) return 'blue';

  return 'pink';
}

// ── Format stats block ──────────────────────────────────

export function formatStatsBlock(stats: PlayerStats): string {
  if (stats.handsSeen < 3) {
    return `${COPILOT_MARKER} n=${stats.handsSeen} (collecting)`;
  }
  const vpip = Math.round(stats.vpip * 100);
  const pfr  = Math.round(stats.pfr * 100);
  const tbet = Math.round(stats.threeBet * 100);
  const fcbet = Math.round(stats.foldToCbet * 100);
  const af   = stats.af.toFixed(1);
  const tags = stats.tags.length > 0 ? ` | ${stats.tags.join(', ')}` : '';
  const date = new Date().toISOString().slice(0, 10);
  return `${COPILOT_MARKER} n=${stats.handsSeen} V:${vpip}% P:${pfr}% 3B:${tbet}% AF:${af} F↳:${fcbet}%${tags} [${date}]`;
}

// ── Merge: preserve user's manual notes below separator ─

export function mergeNotes(existing: string, newStatsLine: string): string {
  // Find existing copilot block
  const markerIdx = existing.indexOf(COPILOT_MARKER);
  if (markerIdx === -1) {
    // No previous copilot block — prepend
    return existing.trim()
      ? `${newStatsLine}${SEPARATOR}${existing.trim()}`
      : newStatsLine;
  }

  // Replace from marker to end-of-line
  const beforeMarker = existing.slice(0, markerIdx);
  const afterMarker  = existing.slice(markerIdx);
  const sepIdx = afterMarker.indexOf(SEPARATOR);
  const userNotes = sepIdx !== -1
    ? afterMarker.slice(sepIdx + SEPARATOR.length)
    : '';

  return userNotes.trim()
    ? `${beforeMarker}${newStatsLine}${SEPARATOR}${userNotes.trim()}`
    : `${beforeMarker}${newStatsLine}`;
}

// ── Write into open popover ─────────────────────────────

let paywallReported = false;

/**
 * PokerNow gates player notes behind Plus. Without it the textarea and the colour
 * buttons render `disabled` with `pointer-events: none`, so writing a value and
 * clicking a colour does nothing — the field keeps showing whatever was last
 * saved while Plus was active, which looks exactly like a frozen stat line.
 *
 * Detect it and say so once, instead of pretending the write worked. The stats
 * themselves are unaffected: they live in chrome.storage.local and are shown on
 * the seat overlays and in the side panel.
 */
function notesArePaywalled(popover: Element): boolean {
  const textarea = popover.querySelector<HTMLTextAreaElement>('.player-notes textarea');
  if (textarea?.disabled) return true;
  return popover.querySelector('.player-notes .paywall-element.only-plus') !== null;
}

export function writeStatsToOpenPopover(
  popover: Element,
  stats: PlayerStats,
): void {
  const textarea = popover.querySelector<HTMLTextAreaElement>('.player-notes textarea');
  if (!textarea) return;

  if (notesArePaywalled(popover)) {
    if (!paywallReported) {
      paywallReported = true;
      console.info(
        '[Copilot] PokerNow notes are Plus-only on this account — skipping note/colour '
        + 'sync. Stats keep updating in the side panel and the seat overlays.',
      );
    }
    return;
  }

  const statsLine = formatStatsBlock(stats);
  const merged    = mergeNotes(textarea.value, statsLine);

  // React requires synthetic value setter + input event
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;
  if (setter) setter.call(textarea, merged);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // Set the color
  const color = selectColorForPlayer(stats);
  const hex   = POKERNOW_COLORS[color];
  const colorBtn = popover.querySelector<HTMLElement>(
    `.player-note-color[aria-label="Set player color ${hex}"]`,
  );
  if (colorBtn) {
    colorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}
