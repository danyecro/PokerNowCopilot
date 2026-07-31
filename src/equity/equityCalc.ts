/**
 * Monte Carlo equity calculator.
 * Simulates random opponent hands + runouts to estimate hero win probability.
 */
import type { Card, Rank, Suit } from '../shared/types';
import { evaluateBest } from './handEvaluator';

const SUITS: Suit[]  = ['h', 'd', 'c', 's'];
const RANKS: Rank[]  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

function buildDeck(exclude: Card[]): Card[] {
  const ex = new Set(exclude.map(c => c.rank + c.suit));
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      if (!ex.has(rank + suit)) deck.push({ rank, suit });
  return deck;
}

/** Partial Fisher-Yates — only shuffles the first `n` elements in place. */
function shuffleFirst(deck: Card[], n: number): void {
  const len = deck.length;
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (len - i));
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
}

/**
 * Returns hero's equity (0–1) vs `numOpponents` random hands.
 * @param heroCards  Hero's 2 hole cards
 * @param board      Known board cards (0–5)
 * @param numOpponents  Number of opponents still in (default 1)
 * @param simulations   Monte Carlo iterations (default 900)
 */
export function calcEquity(
  heroCards: [Card, Card],
  board: Card[],
  numOpponents = 1,
  simulations  = 900,
): number {
  const known = [...heroCards, ...board];
  const deck  = buildDeck(known);

  const boardNeeded   = 5 - board.length;
  const cardsPerSim   = numOpponents * 2 + boardNeeded;

  let wins = 0, ties = 0;

  for (let i = 0; i < simulations; i++) {
    shuffleFirst(deck, cardsPerSim);

    let pos = 0;
    const oppHands: [Card, Card][] = [];
    for (let j = 0; j < numOpponents; j++) {
      oppHands.push([deck[pos++], deck[pos++]]);
    }

    const fullBoard = [...board, ...deck.slice(pos, pos + boardNeeded)];
    const heroScore  = evaluateBest([...heroCards, ...fullBoard]);

    let maxOpp = 0, tieCount = 0;
    for (const opp of oppHands) {
      const s = evaluateBest([...opp, ...fullBoard]);
      if (s > maxOpp)        { maxOpp = s; tieCount = 1; }
      else if (s === maxOpp)   tieCount++;
    }

    if   (heroScore > maxOpp)       wins++;
    else if (heroScore === maxOpp)   ties += 1 / (tieCount + 1); // hero splits the pot
  }

  return (wins + ties) / simulations;
}
