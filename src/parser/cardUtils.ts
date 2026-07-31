import type { Card, Rank, Suit } from '../shared/types';

export const SUIT_SYMBOL_MAP: Record<string, Suit> = {
  '♥': 'h',
  '♦': 'd',
  '♣': 'c',
  '♠': 's',
};

// CSS suit class → Suit (card-h, card-d, card-c, card-s)
export const SUIT_CLASS_MAP: Record<string, Suit> = {
  'card-h': 'h',
  'card-d': 'd',
  'card-c': 'c',
  'card-s': 's',
};

const RANK_NORMALIZE: Record<string, Rank> = {
  '10': 'T', 'T': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
  '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9',
};

export function parseCard(raw: string): Card | null {
  // e.g. "A♥", "10♦", "K♠", "3♣"
  const match = raw.trim().match(/^(\d{1,2}|[TJQKA])([♥♦♣♠])$/);
  if (!match) return null;
  const rank = RANK_NORMALIZE[match[1]];
  const suit = SUIT_SYMBOL_MAP[match[2]];
  if (!rank || !suit) return null;
  return { rank, suit };
}

export function parseCards(raw: string): Card[] {
  // e.g. "A♥, K♦, 2♣" or "[A♥, K♦, 2♣]"
  const cleaned = raw.replace(/[\[\]]/g, '');
  return cleaned
    .split(',')
    .map(s => parseCard(s.trim()))
    .filter((c): c is Card => c !== null);
}

// DOM suit values are 'h'/'d'/'c'/'s' (single letter), not symbols
const DIRECT_SUITS = new Set<string>(['h', 'd', 'c', 's']);

export function cardFromDom(el: Element): Card | null {
  // Structure: .card-container > .card-flipper > .card > span.value + span.suit
  // Navigate into the inner .card div where the actual values live
  const cardFace = el.querySelector('.card') ?? el;

  const valueEl = cardFace.querySelector('span.value');
  // The non-sub suit span has just class="suit" (not "suit sub-suit")
  const suitEl  = cardFace.querySelector('span.suit:not(.sub-suit)');

  if (!valueEl || !suitEl) return null;

  const rankRaw = valueEl.textContent?.trim() ?? '';
  const suitRaw = suitEl.textContent?.trim() ?? '';

  const rank = RANK_NORMALIZE[rankRaw];
  // Accept both direct letters ('h','d','c','s') and symbol fallback
  const suit: Suit | undefined = DIRECT_SUITS.has(suitRaw)
    ? (suitRaw as Suit)
    : SUIT_SYMBOL_MAP[suitRaw];

  if (!rank || !suit) return null;
  return { rank, suit };
}

export function cardToString(card: Card): string {
  const suitSymbols: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function boardToString(board: Card[]): string {
  return board.map(cardToString).join(' ');
}
