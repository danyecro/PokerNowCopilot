import { SEL } from './selectors';
import { writeStatsToOpenPopover } from './notesWriter';
import type { PlayerStats } from '../shared/types';

type StatsGetter = () => Record<string, PlayerStats>;

let observer: MutationObserver | null = null;

/**
 * Watch for the player notes popover opening.
 * When it opens, auto-populate stats and set the color.
 */
export function startPopoverWatcher(getStats: StatsGetter): void {
  if (observer) return;

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;

        // Popover added as child of a .table-player seat
        const popover = node.matches(SEL.NOTES_POPOVER)
          ? node
          : node.querySelector(SEL.NOTES_POPOVER);

        if (!popover) continue;

        // Find the parent seat to get the player ID
        const seatEl = popover.closest('.table-player');
        if (!seatEl) continue;

        const link = seatEl.querySelector<HTMLAnchorElement>('.table-player-name a');
        const playerId = link?.getAttribute('href')?.split('/').pop() ?? '';
        if (!playerId) continue;

        const stats = getStats();
        const playerStats = stats[playerId];
        if (!playerStats) continue;

        // Small delay to let React finish rendering the popover content
        setTimeout(() => writeStatsToOpenPopover(popover, playerStats), 150);
      }
    }
  });

  // Observe the whole seats container for popover insertion
  const seatsEl = document.querySelector(SEL.SEATS);
  if (seatsEl) {
    observer.observe(seatsEl, { childList: true, subtree: true });
  }
}

export function stopPopoverWatcher(): void {
  observer?.disconnect();
  observer = null;
}
