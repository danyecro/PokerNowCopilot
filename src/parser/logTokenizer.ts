import type { ActionType } from '../shared/types';

export const LOG_PATTERNS = {
  HAND_START: /^-- starting hand #(\d+) \(id: ([a-z0-9]+)\)\s+(.+?) \(dealer: (.+?)\) --$/,
  HAND_START_DEAD: /^-- starting hand #(\d+) \(id: ([a-z0-9]+)\)\s+(.+?) \(dead button\) --$/,
  HAND_END: /^-- ending hand #(\d+) --$/,
  STACKS: /^Player stacks: (.+)$/,
  HERO_CARDS: /^Your hand is (.+)$/,
  POSTS_SB: /^(.+?) posts a small blind of (\d+)$/,
  POSTS_BB: /^(.+?) posts a big blind of (\d+)$/,
  POSTS_MISSED_BB: /^(.+?) posts a missed big blind of (\d+)$/,
  POSTS_MISSED_SB: /^(.+?) posts a missing small blind of (\d+)$/,
  RAISES_TO: /^(.+?) raises to (\d+)$/,
  BETS: /^(.+?) bets (\d+)$/,
  CALLS: /^(.+?) calls (\d+)$/,
  FOLDS: /^(.+?) folds$/,
  CHECKS: /^(.+?) checks$/,
  ALL_IN: /^(.+?) (?:calls|raises to|bets) (\d+) and is all in$/,
  FLOP: /^Flop:\s+\[(.+?)\]$/,
  TURN: /^Turn: .+? \[(.+?)\]$/,
  RIVER: /^River: .+? \[(.+?)\]$/,
  SHOWS: /^(.+?) shows a (.+?)\.$/,
  COLLECTED: /^(.+?) collected (\d+) from pot(?: with (.+?))?$/,
  JOINED: /^The player (.+?) joined the game with a stack of (\d+)\.$/,
  QUITS: /^The player (.+?) quits the game with a stack of (\d+)\.$/,
} as const;

// \s* instead of literal space before ( to handle names with/without trailing space
export const STACK_ENTRY = /#(\d+) (.+?)\s*\((\d+)\)/g;

export type TokenizedLine =
  | { type: 'hand_start'; handNum: number; handId: string; dealer: string }
  | { type: 'hand_end'; handNum: number }
  | { type: 'stacks'; entries: Array<{ seat: number; name: string; stack: number }> }
  | { type: 'hero_cards'; raw: string }
  | { type: 'post'; player: string; amount: number; blind: 'sb' | 'bb' | 'missed_bb' | 'missed_sb' }
  | { type: 'action'; player: string; actionType: ActionType; amount?: number; isAllIn: boolean }
  | { type: 'street'; street: 'flop' | 'turn' | 'river'; cardsRaw: string }
  | { type: 'shows'; player: string; cardsRaw: string }
  | { type: 'collected'; player: string; amount: number; handDesc?: string }
  | { type: 'joined'; player: string; stack: number }
  | { type: 'quit'; player: string; stack: number }
  | { type: 'unknown' };

/**
 * Splits a player reference from the log into its display name and stable id.
 *
 * PokerNow writes players as `"Name @ IqQ0nDbXKt"` — quoted, with the same id
 * the DOM exposes via `href="/players/{id}"`. Keying stats on the raw string
 * meant nothing ever matched the seated players read from the DOM, so no
 * opponent was recognised at the table and the prompt never received a profile.
 */
export function parseLogPlayer(raw: string): { displayName: string; playerId: string } {
  const unquoted = raw.trim().replace(/^"(.*)"$/, '$1');
  const at = unquoted.lastIndexOf(' @ ');
  if (at === -1) {
    // No id in the string (older logs / system lines) — fall back to the name.
    return { displayName: unquoted, playerId: unquoted };
  }
  return {
    displayName: unquoted.slice(0, at).trim(),
    playerId: unquoted.slice(at + 3).trim(),
  };
}

export function tokenizeLine(line: string): TokenizedLine {
  const p = LOG_PATTERNS;
  let m: RegExpMatchArray | null;

  m = line.match(p.HAND_START);
  if (m) return { type: 'hand_start', handNum: +m[1], handId: m[2], dealer: m[4] };

  m = line.match(p.HAND_START_DEAD);
  if (m) return { type: 'hand_start', handNum: +m[1], handId: m[2], dealer: '' };

  m = line.match(p.HAND_END);
  if (m) return { type: 'hand_end', handNum: +m[1] };

  m = line.match(p.STACKS);
  if (m) {
    const entries: Array<{ seat: number; name: string; stack: number }> = [];
    const re = new RegExp(STACK_ENTRY.source, 'g');
    let entry: RegExpExecArray | null;
    while ((entry = re.exec(m[1])) !== null) {
      entries.push({ seat: +entry[1], name: entry[2], stack: +entry[3] });
    }
    return { type: 'stacks', entries };
  }

  m = line.match(p.HERO_CARDS);
  if (m) return { type: 'hero_cards', raw: m[1] };

  m = line.match(p.POSTS_SB);
  if (m) return { type: 'post', player: m[1], amount: +m[2], blind: 'sb' };

  m = line.match(p.POSTS_BB);
  if (m) return { type: 'post', player: m[1], amount: +m[2], blind: 'bb' };

  m = line.match(p.POSTS_MISSED_BB);
  if (m) return { type: 'post', player: m[1], amount: +m[2], blind: 'missed_bb' };

  m = line.match(p.POSTS_MISSED_SB);
  if (m) return { type: 'post', player: m[1], amount: +m[2], blind: 'missed_sb' };

  // All-in must be checked before raises/calls/bets (more specific pattern)
  m = line.match(p.ALL_IN);
  if (m) {
    const actionType: ActionType = line.includes('calls') ? 'call'
      : line.includes('raises') ? 'raise' : 'bet';
    return { type: 'action', player: m[1], actionType, amount: +m[2], isAllIn: true };
  }

  m = line.match(p.RAISES_TO);
  if (m) return { type: 'action', player: m[1], actionType: 'raise', amount: +m[2], isAllIn: false };

  m = line.match(p.BETS);
  if (m) return { type: 'action', player: m[1], actionType: 'bet', amount: +m[2], isAllIn: false };

  m = line.match(p.CALLS);
  if (m) return { type: 'action', player: m[1], actionType: 'call', amount: +m[2], isAllIn: false };

  m = line.match(p.FOLDS);
  if (m) return { type: 'action', player: m[1], actionType: 'fold', isAllIn: false };

  m = line.match(p.CHECKS);
  if (m) return { type: 'action', player: m[1], actionType: 'check', isAllIn: false };

  m = line.match(p.FLOP);
  if (m) return { type: 'street', street: 'flop', cardsRaw: m[1] };

  m = line.match(p.TURN);
  if (m) return { type: 'street', street: 'turn', cardsRaw: m[1] };

  m = line.match(p.RIVER);
  if (m) return { type: 'street', street: 'river', cardsRaw: m[1] };

  m = line.match(p.SHOWS);
  if (m) return { type: 'shows', player: m[1], cardsRaw: m[2] };

  m = line.match(p.COLLECTED);
  if (m) return { type: 'collected', player: m[1], amount: +m[2], handDesc: m[3] };

  m = line.match(p.JOINED);
  if (m) return { type: 'joined', player: m[1], stack: +m[2] };

  m = line.match(p.QUITS);
  if (m) return { type: 'quit', player: m[1], stack: +m[2] };

  return { type: 'unknown' };
}

export function getLineText(entryEl: Element): string {
  return entryEl.querySelector('p.content')?.textContent?.trim() ?? '';
}
