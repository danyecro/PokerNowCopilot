/**
 * 5-7 card poker hand evaluator.
 * Returns a comparable integer — higher value = stronger hand.
 *
 * Scoring structure (base-15):
 *   score = category(0-8) * 15^5  +  v1*15^4 + v2*15^3 + v3*15^2 + v4*15 + v5
 *
 * Categories: 8=StraightFlush, 7=Quads, 6=FullHouse, 5=Flush,
 *             4=Straight, 3=Trips, 2=TwoPair, 1=Pair, 0=HighCard
 */
import type { Card } from '../shared/types';

const RANK_VAL: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'T':10,'J':11,'Q':12,'K':13,'A':14,
};

const B = 15;
const CAT = B ** 5; // 759 375

/** Evaluate the best possible 5-card hand from 5–7 cards. */
export function evaluateBest(cards: Card[]): number {
  const n = cards.length;
  if (n <= 5) return eval5(cards);

  let best = 0;
  // Enumerate all C(n,5) subsets (max C(7,5)=21 — trivial cost)
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (s > best) best = s;
          }
  return best;
}

function eval5(hand: Card[]): number {
  // Descending rank array
  const ranks = hand.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = hand.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight detection (also A-2-3-4-5 wheel)
  let isStraight = false, strHigh = 0;
  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true; strHigh = ranks[0];
    } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) {
      isStraight = true; strHigh = 5;
    }
  }

  if (isFlush && isStraight) return sc(8, [strHigh]);

  // Group ranks by count, sort by count desc then rank desc
  const cnt: Record<number, number> = {};
  for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
  const gs = (Object.entries(cnt) as [string, number][])
    .map(([r, c]) => ({ r: +r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  const top = gs[0].c;

  if (top === 4)               return sc(7, [gs[0].r, gs[1].r]);
  if (top === 3 && gs[1].c===2) return sc(6, [gs[0].r, gs[1].r]);
  if (isFlush)                 return sc(5, ranks);
  if (isStraight)              return sc(4, [strHigh]);
  if (top === 3)               return sc(3, [gs[0].r, gs[1].r, gs[2].r]);
  if (top === 2 && gs[1].c===2) return sc(2, [gs[0].r, gs[1].r, gs[2].r]);
  if (top === 2)               return sc(1, [gs[0].r, gs[1].r, gs[2].r, gs[3].r]);
  return sc(0, ranks);
}

/** Encode category + up to 5 rank values into a single comparable integer. */
function sc(cat: number, vals: number[]): number {
  let s = cat * CAT;
  for (let i = 0; i < 5; i++) s += (vals[i] || 0) * B ** (4 - i);
  return s;
}
