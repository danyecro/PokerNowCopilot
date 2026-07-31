import type { Action, Card, Hand, PlayerIdentity, Street } from '../shared/types';
import { parseCards } from './cardUtils';
import { parseLogPlayer, tokenizeLine } from './logTokenizer';

export function parseHand(lines: string[]): Hand | null {
  let handId = '';
  let handNum = 0;
  let startedAt = Date.now();
  const players: string[] = [];
  const positions: Record<string, string> = {};
  let heroCards: [Card, Card] | undefined;
  const board: Card[] = [];
  const actions: Action[] = [];
  let pot = 0;
  const winner: string[] = [];
  const showdownCards: Record<string, Card[]> = {};
  let currentStreet: Street = 'preflop';
  let actionOrder = 0;
  let foundStart = false;
  const identities: Record<string, PlayerIdentity> = {};

  /** Records a player reference and its resolved identity exactly once. */
  const note = (raw: string): void => {
    if (!identities[raw]) identities[raw] = parseLogPlayer(raw);
    if (!players.includes(raw)) players.push(raw);
  };

  for (const line of lines) {
    const token = tokenizeLine(line);

    switch (token.type) {
      case 'hand_start':
        foundStart = true;
        handId = token.handId;
        handNum = token.handNum;
        startedAt = Date.now();
        break;

      case 'stacks':
        for (const e of token.entries) note(e.name);
        break;

      case 'hero_cards': {
        const cards = parseCards(token.raw);
        if (cards.length === 2) heroCards = [cards[0], cards[1]];
        break;
      }

      case 'post':
        actions.push({
          player: token.player,
          street: 'preflop',
          type: 'post',
          amount: token.amount,
          isAllIn: false,
          order: actionOrder++,
        });
        pot += token.amount;
        note(token.player);
        break;

      case 'action':
        note(token.player);
        actions.push({
          player: token.player,
          street: currentStreet,
          type: token.actionType,
          amount: token.amount,
          isAllIn: token.isAllIn,
          order: actionOrder++,
        });
        if (token.amount && (token.actionType === 'call' || token.actionType === 'bet' || token.actionType === 'raise')) {
          pot += token.amount;
        }
        break;

      case 'street': {
        const newCards = parseCards(token.cardsRaw);
        board.push(...newCards);
        currentStreet = token.street as Street;
        break;
      }

      case 'shows':
        note(token.player);
        showdownCards[token.player] = parseCards(token.cardsRaw);
        break;

      case 'collected':
        note(token.player);
        if (!winner.includes(token.player)) winner.push(token.player);
        // Use the collected amount as pot if we don't have it yet
        if (pot === 0) pot = token.amount;
        break;

      case 'hand_end':
        // end marker — we're done
        break;
    }
  }

  if (!foundStart || !handId) return null;

  return {
    handId,
    handNum,
    startedAt,
    players,
    identities,
    positions,
    heroCards,
    board,
    actions,
    pot,
    winner,
    showdownCards,
  };
}

const START_RE = /^-- starting hand #/;
const END_RE   = /^-- ending hand #/;

/**
 * Extracts the lines of the most recently *completed* hand.
 *
 * Slicing from the last "starting hand" to the end of the log was wrong: by the
 * time the hand-end debounce and the log-modal round trip finish, PokerNow has
 * usually dealt the next hand already, so that slice returned a three-line stub
 * with no actions. Every hand-end then ingested an empty hand — handsSeen went
 * up while VPIP/PFR stayed pinned near zero.
 *
 * So anchor on the last "ending hand" marker and take the block that precedes
 * it. Falls back to the trailing block when no hand has ended yet (first hand of
 * a session).
 */
export function extractLastHandLines(entries: Element[]): string[] {
  const blocks = extractCompletedHandBlocks(entries);
  if (blocks.length > 0) return blocks[blocks.length - 1];

  // No completed hand in the log yet — best effort on the open block.
  const allLines = toLines(entries);
  const startIdx = findLastIndex(allLines, l => START_RE.test(l));
  return startIdx === -1 ? [] : allLines.slice(startIdx);
}

/**
 * Every completed hand still present in the log, oldest first.
 *
 * One pull therefore backfills anything that was missed — a hand that finished
 * while a previous pull was still running, or the whole visible history after a
 * page reload. The stats engine ignores hand ids it has already ingested, so
 * re-reading old hands costs nothing and losing one costs data.
 */
export function extractCompletedHandBlocks(entries: Element[]): string[][] {
  return extractCompletedHandBlocksFromLines(toLines(entries));
}

/**
 * Same, for lines that were read out of the DOM earlier.
 *
 * The log modal shows one hand per page, so a multi-hand pull has to collect
 * text page by page — the entry elements of a page are gone once the next one
 * renders, and only the strings survive.
 */
export function extractCompletedHandBlocksFromLines(allLines: string[]): string[][] {
  const blocks: string[][] = [];
  let startIdx = -1;

  for (let i = 0; i < allLines.length; i++) {
    if (START_RE.test(allLines[i])) {
      startIdx = i;                       // a new start supersedes an unclosed one
    } else if (END_RE.test(allLines[i]) && startIdx !== -1) {
      blocks.push(allLines.slice(startIdx, i + 1));
      startIdx = -1;
    }
  }
  return blocks;
}

/** Log entry elements → chronological text lines. */
export function logEntriesToLines(entries: Element[]): string[] {
  return toLines(entries);
}

function toLines(entries: Element[]): string[] {
  // Log modal entries are NEWEST-FIRST → reverse to get chronological order
  return [...entries]
    .reverse()
    .map(el => el.querySelector('p.content')?.textContent?.trim() ?? '')
    .filter(l => l.length > 0);
}

function findLastIndex<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}
