import type { Card, GameState, SeatState, Street } from '../shared/types';
import { SEL } from './selectors';
import { cardFromDom } from '../parser/cardUtils';
import { isHeroTurn, readAvailableActions } from './actionReader';

function extractPlayerId(playerEl: Element): string {
  const link = playerEl.querySelector(SEL.PLAYER_NAME_LINK);
  return link?.getAttribute('href')?.split('/').pop() ?? '';
}

function extractDisplayName(playerEl: Element): string {
  const link = playerEl.querySelector(SEL.PLAYER_NAME_LINK);
  return link?.textContent?.trim() ?? '';
}

function extractNumber(el: Element | null, selector: string): number {
  const valueEl = el ? el.querySelector(selector) : document.querySelector(selector);
  const text = valueEl?.textContent?.trim().replace(/,/g, '') ?? '0';
  return parseFloat(text) || 0;
}

export function readCards(containerEl: ParentNode | null, selector: string): Card[] {
  if (!containerEl) return [];
  const cards: Card[] = [];
  containerEl.querySelectorAll(selector).forEach(el => {
    const card = cardFromDom(el);
    if (card) cards.push(card);
  });
  return cards;
}

export function detectStreet(boardCards: Card[]): Street {
  if (boardCards.length === 0) return 'preflop';
  if (boardCards.length === 3) return 'flop';
  if (boardCards.length === 4) return 'turn';
  return 'river';
}

function extractDealerSeat(): number | undefined {
  const btn = document.querySelector(SEL.DEALER_BUTTON);
  if (!btn) return undefined;
  const match = btn.className.match(/dealer-position-(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Builds a snapshot of the current live table state.
 * Also returns the displayName → playerId map for the stats engine.
 */
export function snapshotGameState(): {
  gameState: GameState;
  nameToIdMap: Record<string, string>;
} {
  const blindEls = document.querySelectorAll(SEL.BLIND_VALUES);
  const smallBlind = parseFloat(blindEls[0]?.textContent?.trim() ?? '0') || 0;
  const bigBlind = parseFloat(blindEls[1]?.textContent?.trim() ?? '0') || 0;

  const boardCards = readCards(document, SEL.BOARD_CARDS);
  const street = detectStreet(boardCards);

  const heroEl = document.querySelector(SEL.HERO);
  const heroCards = heroEl
    ? (() => {
        const cards = readCards(heroEl, '.table-player-cards .card-container');
        return cards.length === 2 ? ([cards[0], cards[1]] as [Card, Card]) : undefined;
      })()
    : undefined;

  const pot = extractNumber(null, SEL.POT_VALUE);
  const buttonSeat = extractDealerSeat();

  const seats: SeatState[] = [];
  const nameToIdMap: Record<string, string> = {};

  document.querySelectorAll(SEL.ALL_PLAYERS).forEach(playerEl => {
    const playerId = extractPlayerId(playerEl);
    const displayName = extractDisplayName(playerEl);
    if (!playerId || !displayName) return;

    nameToIdMap[displayName] = playerId;

    const seatMatch = playerEl.className.match(/table-player-(\d+)/);
    const seatIndex = seatMatch ? parseInt(seatMatch[1]) : 0;
    const isHero = playerEl.classList.contains('you-player');
    const hasFolded = playerEl.classList.contains('fold');

    const stack = extractNumber(playerEl, SEL.PLAYER_STACK);
    const currentBet = extractNumber(playerEl, SEL.PLAYER_BET);

    seats.push({
      playerId,
      displayName,
      seatIndex,
      stack,
      currentBet,
      isHero,
      isActive: !hasFolded,
      hasFolded,
    });
  });

  // Determine who is to act (has .decision-current class)
  const toActEl = document.querySelector('.table-player.decision-current');
  const toAct = toActEl ? extractDisplayName(toActEl) : undefined;

  // Assign positions (BTN / SB / BB / UTG / CO / HJ …) based on dealer button
  assignPositions(seats, buttonSeat);

  // Legal actions are only in the DOM while hero has to act.
  const heroTurn = isHeroTurn();
  const availableActions = heroTurn ? readAvailableActions() : [];

  return {
    gameState: {
      heroCards, board: boardCards, pot, street, toAct, buttonSeat, seats,
      bigBlind, smallBlind,
      isHeroTurn: heroTurn,
      availableActions,
    },
    nameToIdMap,
  };
}

// ── Position assignment ───────────────────────────────────────────────────────

/**
 * Assigns BTN/SB/BB/UTG/… labels to each seat based on the dealer-button class.
 * PokerNow numbers seats with `.table-player-N` and the dealer button with
 * `.dealer-position-N` — both use the same seat-index space.
 */
function assignPositions(seats: SeatState[], buttonSeat: number | undefined): void {
  if (buttonSeat === undefined || seats.length < 2) return;

  // Collect occupied seat indices and sort ascending
  const occupiedIndices = seats
    .map(s => s.seatIndex)
    .sort((a, b) => a - b);

  const n = occupiedIndices.length;
  if (n < 2) return;

  // Find the index of the dealer (BTN) seat in the sorted list.
  // If the exact seat is not occupied (empty seat has the button),
  // use the next occupied seat clockwise.
  let btnIdx = occupiedIndices.indexOf(buttonSeat);
  if (btnIdx === -1) {
    for (let i = 0; i < n; i++) {
      if (occupiedIndices[i] > buttonSeat) { btnIdx = i; break; }
    }
    if (btnIdx === -1) btnIdx = 0; // wrap-around: all seats before button
  }

  const labels = positionLabels(n);

  for (let i = 0; i < n; i++) {
    const seatIdx = occupiedIndices[(btnIdx + i) % n];
    const seat = seats.find(s => s.seatIndex === seatIdx);
    if (seat) seat.position = labels[i];
  }
}

/** Position label order starting at BTN, then SB, BB, UTG, … CO. */
function positionLabels(n: number): string[] {
  switch (n) {
    case 2:  return ['BTN/SB', 'BB'];
    case 3:  return ['BTN', 'SB', 'BB'];
    case 4:  return ['BTN', 'SB', 'BB', 'UTG'];
    case 5:  return ['BTN', 'SB', 'BB', 'UTG', 'CO'];
    case 6:  return ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
    case 7:  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'];
    case 8:  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'];
    case 9:  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];
    default: return ['BTN', 'SB', 'BB', ...Array.from({ length: n - 3 }, (_, i) => `P${i + 1}`)];
  }
}
