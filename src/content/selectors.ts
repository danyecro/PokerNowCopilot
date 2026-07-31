// Verified against live pokernow.club DOM (May 2026)

export const SEL = {
  // ── Root ─────────────────────────────────────────────────
  GAME_ROOT: '.game-main-container.two-color',

  // ── Pot & Blinds ─────────────────────────────────────────
  POT_VALUE: '.table-pot-size .normal-value',
  BLIND_VALUES: '.blind-value .normal-value', // [0]=SB, [1]=BB

  // ── Board ────────────────────────────────────────────────
  BOARD: '.table-cards',
  BOARD_CARDS: '.table-cards .card-container.flipped',
  CARD_VALUE: 'span.value',              // within .card-container
  CARD_SUIT: 'span.suit:not(.sub-suit)', // within .card-container

  // ── Dealer ───────────────────────────────────────────────
  // extract seat number via /dealer-position-(\d+)/ from className
  DEALER_BUTTON: '.dealer-button-ctn',

  // ── Seats ────────────────────────────────────────────────
  SEATS: '.seats',
  ALL_PLAYERS: '.table-player',
  HERO: '.table-player.you-player',

  // ── Per-seat elements ────────────────────────────────────
  // href="/players/{stableId}" — use as cross-session key
  PLAYER_NAME_LINK: '.table-player-name a',
  PLAYER_STACK: '.table-player-stack .normal-value',
  // only in DOM when player has active bet > 0
  PLAYER_BET: '.table-player-bet-value .normal-value',
  PLAYER_STATUS: 'p.table-player-status-icon',
  PLAYER_WIN_COUNT: '.win-count.signal.numbers-signal',

  // ── Cards ────────────────────────────────────────────────
  HERO_CARDS: '.you-player .table-player-cards .card-container',
  OPPONENT_CARDS: '.table-player:not(.you-player) .table-player-cards .card-container',

  // ── Log modal (NOT in DOM when closed — must be opened programmatically) ─
  LOG_OPEN_BUTTON: '.log-button-container .show-log-button',
  LOG_MODAL: '.modal.log-modal',
  LOG_ENTRIES: '.log-modal-entries',
  LOG_ENTRY: '.log-modal-entries .entry-ctn',
  LOG_ENTRY_CONTENT: 'p.content',
  LOG_CLOSE_BUTTON: '.modal-button-close',
  // The log shows ONE hand per page. Paging is the only way back in history —
  // the entry list itself does not scroll into older hands.
  // Labels: "« Hand #304" (newer) and "Hand #302 »" (older).
  LOG_PAGINATION_BUTTON: '.log-modal-controls .pagination-button',

  // ── Hero action buttons ──────────────────────────────────
  // The whole .action-buttons block only exists while it is hero's turn; the
  // buttons carry the legal actions and their sizings ("Call 20").
  HERO_DECISION: '.table-player.you-player.decision-current',
  ACTION_BUTTONS: '.action-buttons',
  ACTION_BUTTON: '.action-buttons button.action-button',
  ACTION_SIGNAL: '.action-buttons .action-signal',

  // ── Player notes popover (opens on seat click) ────────────
  NOTES_POPOVER: '.player-controls-popover',
  NOTES_TEXTAREA: '.player-notes textarea',
  NOTE_COLOR_BUTTONS: '.player-note-colors .player-note-color',
} as const;

// Dynamic classes on .table-player:
//   .fold             — player folded this hand
//   .decision-current — player must act now
//   .offline          — player disconnected
//   .layer-priority   — popover open on this seat
//
// Card suit classes on .card-container: .card-h .card-d .card-c .card-s
// Card rank class: .card-s-{rank}  (A K Q J T 2-9)

export function healthCheck(): boolean {
  const gameRoot = document.querySelector(SEL.GAME_ROOT);
  if (!gameRoot) {
    console.warn('[PokerNow Copilot] GAME_ROOT not found — not on a live game page');
    return false;
  }
  const checks: [string, string][] = [
    ['SEATS', SEL.SEATS],
    ['POT_VALUE', SEL.POT_VALUE],
    ['LOG_OPEN_BUTTON', SEL.LOG_OPEN_BUTTON],
  ];
  let ok = true;
  for (const [name, selector] of checks) {
    if (!document.querySelector(selector)) {
      console.warn(`[PokerNow Copilot] Selector missing: ${name} (${selector})`);
      ok = false;
    }
  }
  return ok;
}
