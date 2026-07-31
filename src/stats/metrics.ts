import type { Hand, PlayerStats } from '../shared/types';

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function createEmptyStats(playerId: string, displayName: string): PlayerStats {
  return {
    playerId,
    displayName,
    handsSeen: 0,
    vpip: 0, pfr: 0, threeBet: 0, foldToCbet: 0, af: 0,
    counters: {
      vpipOpp: 0, vpipAct: 0,
      pfrOpp: 0,  pfrAct: 0,
      threeBetOpp: 0, threeBetAct: 0,
      cbetOpp: 0, cbetFold: 0,
      bets: 0, raises: 0, calls: 0,
    },
    showdownRanges: [],
    tags: [],
    lastUpdated: Date.now(),
  };
}

export function recomputeRatios(stats: PlayerStats): PlayerStats {
  const c = stats.counters;
  return {
    ...stats,
    vpip: ratio(c.vpipAct, c.vpipOpp),
    pfr: ratio(c.pfrAct, c.pfrOpp),
    threeBet: ratio(c.threeBetAct, c.threeBetOpp),
    foldToCbet: ratio(c.cbetFold, c.cbetOpp),
    af: c.calls === 0 ? c.bets + c.raises : ratio(c.bets + c.raises, c.calls),
    lastUpdated: Date.now(),
  };
}

/**
 * Ingest a single hand into a player's stats counters.
 * Returns new stats (immutable update).
 */
export function ingestHandForPlayer(
  player: string,
  hand: Hand,
  current: PlayerStats,
): PlayerStats {
  const stats = { ...current, counters: { ...current.counters } };
  const preflopActions = hand.actions.filter(a => a.street === 'preflop' && a.player === player);
  const allActions = hand.actions.filter(a => a.player === player);

  // VPIP: did player voluntarily put money in preflop?
  const hadPreflopOpportunity = hand.players.includes(player);
  if (hadPreflopOpportunity) {
    stats.handsSeen++;
    stats.counters.vpipOpp++;
    const voluntaryPFAction = preflopActions.some(
      a => a.type === 'call' || a.type === 'raise' || a.type === 'bet' || a.type === 'allin'
    );
    if (voluntaryPFAction) stats.counters.vpipAct++;

    // PFR: did player raise preflop?
    stats.counters.pfrOpp++;
    const raisedPreflop = preflopActions.some(a => a.type === 'raise');
    if (raisedPreflop) stats.counters.pfrAct++;

    // 3-Bet: did player re-raise preflop after someone else raised?
    const preflopRaises = hand.actions.filter(a => a.street === 'preflop' && a.type === 'raise');
    const firstRaiseIdx = preflopRaises.findIndex(a => a.player !== player);
    if (firstRaiseIdx >= 0) {
      stats.counters.threeBetOpp++;
      const playerRaisedAfter = preflopRaises.some(
        a => a.player === player && a.order > preflopRaises[firstRaiseIdx].order
      );
      if (playerRaisedAfter) stats.counters.threeBetAct++;
    }
  }

  // AF counters (all streets)
  for (const a of allActions) {
    if (a.type === 'bet') stats.counters.bets++;
    if (a.type === 'raise') stats.counters.raises++;
    if (a.type === 'call') stats.counters.calls++;
  }

  // Fold to C-bet: did player face a flop bet and fold?
  const flopBets = hand.actions.filter(a => a.street === 'flop' && a.type === 'bet');
  if (flopBets.length > 0) {
    const facedCbet = flopBets.some(a => a.player !== player) &&
      hand.players.includes(player) &&
      !hand.actions.find(a => a.street === 'preflop' && a.player === player && a.type === 'fold');
    if (facedCbet) {
      stats.counters.cbetOpp++;
      const foldedToFlop = allActions.some(a => a.street === 'flop' && a.type === 'fold');
      if (foldedToFlop) stats.counters.cbetFold++;
    }
  }

  // Showdown ranges
  if (hand.showdownCards[player]) {
    const updated = [...stats.showdownRanges, hand.showdownCards[player]];
    stats.showdownRanges = updated.slice(-20); // keep last 20
  }

  return recomputeRatios(stats);
}
