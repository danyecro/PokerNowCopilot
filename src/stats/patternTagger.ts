import type { PatternTag, PlayerStats } from '../shared/types';
import { MIN_HANDS_FOR_TAGS } from '../shared/constants';

export function computeTags(stats: PlayerStats): PatternTag[] {
  if (stats.handsSeen < MIN_HANDS_FOR_TAGS) return [];
  const tags: PatternTag[] = [];

  // Calling station: high VPIP, low PFR, low AF
  if (stats.vpip > 0.4 && stats.pfr < 0.12 && stats.af < 1.5) {
    tags.push('Calling station');
  }

  // Folds to turn pressure: high foldToCbet
  if (stats.foldToCbet > 0.65 && stats.counters.cbetOpp >= 5) {
    tags.push('Folds to turn pressure');
  }

  // Bombs river: high AF overall with reasonable sample
  if (stats.af > 4 && stats.counters.bets + stats.counters.raises >= 8) {
    tags.push('Bombs river');
  }

  // Bluffs draws: high aggression but below average showdown equity
  // (heuristic: many raises but also many seen-at-showdown losses implied by tags)
  if (stats.af > 3 && stats.pfr > 0.25 && stats.vpip > 0.35) {
    tags.push('Bluffs draws');
  }

  // Slowplays monsters: low PFR despite high VPIP, high AF postflop
  if (stats.vpip > 0.3 && stats.pfr < 0.15 && stats.af > 2.5) {
    tags.push('Slowplays monsters');
  }

  return tags;
}
