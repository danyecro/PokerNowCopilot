import { SEL } from './selectors';
import { HAND_END_DEBOUNCE_MS } from '../shared/constants';
import { detectStreet, readCards } from './gameStateReader';
import type { Street } from '../shared/types';

type HandEndCallback = () => void;
type StreetChangeCallback = (street: Street) => void;

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let potWasSignificant = false;
const POT_THRESHOLD = 10;  // pot must have been above this to count as a real hand

// There used to be a 3s cooldown between hand-end events. It silently dropped
// real hands: when everyone folds fast — which is exactly what happens while AFK
// auto-fold is on — two hands finish inside that window and the second never got
// ingested. Observed live as hands #22 and #23 missing from the log between #21
// and #24, which is why n barely grew.
//
// Duplicate protection does not need a timer: statsEngine already ignores a
// handId it has seen before, so a spurious pull is harmless while a missed hand
// is lost data.

export function startWatching(onHandEnd: HandEndCallback): void {
  if (observer) return;

  const seatsEl = document.querySelector(SEL.SEATS);
  if (!seatsEl) {
    console.warn('[Copilot] .seats not found, watcher not started');
    return;
  }

  observer = new MutationObserver(() => checkHandEnd(onHandEnd));

  observer.observe(seatsEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Also observe pot separately
  const potContainer = document.querySelector('.table-pot-size');
  if (potContainer) {
    observer.observe(potContainer, { childList: true, subtree: true, characterData: true });
  }
}

export function stopWatching(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer) clearTimeout(debounceTimer);
}

function readPot(): number {
  const text = document.querySelector(SEL.POT_VALUE)?.textContent?.trim().replace(/,/g, '') ?? '0';
  return parseFloat(text) || 0;
}

function checkHandEnd(onHandEnd: HandEndCallback): void {
  const pot = readPot();

  if (pot > POT_THRESHOLD) {
    potWasSignificant = true;
    return; // still mid-hand
  }

  // Pot dropped to 0 (or trivially small) — only fire if it was real before
  if (potWasSignificant && countActiveBets() === 0) {
    // Reset immediately so rapid mutations can't re-trigger
    potWasSignificant = false;
    scheduleHandEnd(onHandEnd);
  }
}

/** Counts bet displays that show a non-zero value (elements may stay in DOM with empty text). */
function countActiveBets(): number {
  return Array.from(document.querySelectorAll(SEL.PLAYER_BET))
    .filter(el => (parseFloat(el.textContent?.replace(/,/g, '') ?? '0') || 0) > 0)
    .length;
}

function scheduleHandEnd(onHandEnd: HandEndCallback): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    onHandEnd();
  }, HAND_END_DEBOUNCE_MS);
}

// ── Street watcher ────────────────────────────────────────────────────────────
// Watches the board (.table-cards) for card mutations and fires whenever
// detectStreet()'s result actually changes (preflop → flop → turn → river →
// preflop of the next hand). Used to drive "auto-analyze".

const STREET_CHANGE_DEBOUNCE_MS = 500; // let card-flip animations settle before reading

let streetObserver: MutationObserver | null = null;
let streetDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastStreet: Street | null = null;

export function startStreetWatcher(onStreetChange: StreetChangeCallback): void {
  if (streetObserver) return;

  const boardEl = document.querySelector(SEL.BOARD);
  if (!boardEl) {
    console.warn('[Copilot] .table-cards not found, street watcher not started');
    return;
  }

  lastStreet = currentStreet();

  streetObserver = new MutationObserver(() => {
    if (streetDebounceTimer) clearTimeout(streetDebounceTimer);
    streetDebounceTimer = setTimeout(() => {
      const street = currentStreet();
      if (street !== lastStreet) {
        lastStreet = street;
        onStreetChange(street);
      }
    }, STREET_CHANGE_DEBOUNCE_MS);
  });

  streetObserver.observe(boardEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

export function stopStreetWatcher(): void {
  streetObserver?.disconnect();
  streetObserver = null;
  if (streetDebounceTimer) clearTimeout(streetDebounceTimer);
  lastStreet = null;
}

function currentStreet(): Street {
  return detectStreet(readCards(document, SEL.BOARD_CARDS));
}

// ── Hero turn watcher ─────────────────────────────────────────────────────────
// Fires once on each rising edge of `.you-player.decision-current`, i.e. exactly
// when the action bar appears and hero has to decide. This is a far better
// trigger for analysis than a street change: it fires only when hero actually
// needs an answer, and it fires on every decision point within a street (e.g.
// facing a re-raise) instead of once per board change.

// The `decision-current` class and the `.action-buttons` block are set by
// separate React renders; a short delay lets the buttons (and their sizings)
// land before we read them.
const TURN_SETTLE_MS = 250;

type HeroTurnCallback = () => void;

let turnObserver: MutationObserver | null = null;
let turnTimer: ReturnType<typeof setTimeout> | null = null;
let heroWasToAct = false;

/**
 * @param onHeroTurn fired on the rising edge, once the action buttons settled.
 * @param onTurnEnd  fired on the falling edge — the real "hero no longer has to
 *   act" signal. Do NOT use a street change for this: postflop the board cards
 *   and hero's turn arrive together, so cancelling on a street change killed
 *   pending work for the turn that had only just started.
 */
export function startTurnWatcher(
  onHeroTurn: HeroTurnCallback,
  onTurnEnd?: HeroTurnCallback,
): void {
  if (turnObserver) return;

  const seatsEl = document.querySelector(SEL.SEATS);
  if (!seatsEl) {
    console.warn('[Copilot] .seats not found, turn watcher not started');
    return;
  }

  heroWasToAct = document.querySelector(SEL.HERO_DECISION) !== null;

  turnObserver = new MutationObserver(() => {
    const isHeroTurn = document.querySelector(SEL.HERO_DECISION) !== null;

    if (!isHeroTurn) {
      if (heroWasToAct) {
        // Falling edge — re-arm. Also drop a pending fire: the turn ended before
        // the buttons settled (auto-fold, timeout, or someone acted out of order).
        if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
        onTurnEnd?.();
      }
      heroWasToAct = false;
      return;
    }

    if (heroWasToAct) return; // already handled this turn
    heroWasToAct = true;

    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = setTimeout(() => {
      turnTimer = null;
      // Re-check: the class may have vanished again while we waited.
      if (document.querySelector(SEL.HERO_DECISION)) onHeroTurn();
    }, TURN_SETTLE_MS);
  });

  // The class toggles on .table-player, and .action-buttons is rendered outside
  // .seats — observe the document so both are covered by one observer.
  turnObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled'],
  });
}

export function stopTurnWatcher(): void {
  turnObserver?.disconnect();
  turnObserver = null;
  if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
  heroWasToAct = false;
}
