import type { GameState, PlayerStats } from './types';
import { MIN_HANDS_FOR_STATS } from './constants';

export interface EdgeHint {
  type: 'positive' | 'warning' | 'info' | 'neutral';
  icon: string;
  text: string;
}

const FOLD_TO_CBET_THRESHOLD = 0.55;
const AF_MANIAC = 3.5;
const VPIP_FISH = 0.42;
const SPR_LOW = 3;
const SPR_HIGH = 12;

export function computeEdgeHints(
  gameState: GameState,
  stats: Record<string, PlayerStats>,
): EdgeHint[] {
  const hints: EdgeHint[] = [];
  const hero = gameState.seats.find(s => s.isHero);
  const actives = gameState.seats.filter(s => !s.isHero && s.isActive && !s.hasFolded);

  if (!hero) return hints;

  // ── Position ────────────────────────────────────────
  if (hero.position) {
    const latePositions = ['BTN', 'CO', 'HJ'];
    if (latePositions.includes(hero.position)) {
      hints.push({ type: 'positive', icon: '📍', text: `In position (${hero.position}) — play wider, control pot size` });
    } else if (hero.position === 'BTN') {
      hints.push({ type: 'positive', icon: '🎯', text: 'Button — maximum positional advantage' });
    } else if (['SB', 'BB'].includes(hero.position)) {
      hints.push({ type: 'neutral', icon: '📍', text: `Out of position (${hero.position}) — tighten range, play fit-or-fold` });
    }
  }

  // ── SPR (Stack-to-Pot Ratio) ─────────────────────────
  if (gameState.pot > 0 && hero.stack > 0) {
    const spr = hero.stack / gameState.pot;
    if (spr < SPR_LOW) {
      hints.push({ type: 'warning', icon: '⚠️', text: `Low SPR ${spr.toFixed(1)} — commit or fold, no more implied odds` });
    } else if (spr > SPR_HIGH) {
      hints.push({ type: 'info', icon: '📊', text: `Deep SPR ${spr.toFixed(1)} — speculative hands gain value` });
    }
  }

  // ── Per-opponent pattern hints ───────────────────────
  for (const opp of actives) {
    const s = stats[opp.playerId];
    if (!s || s.handsSeen < MIN_HANDS_FOR_STATS) continue;

    // Fold to CBet → good spot to CBet
    if (s.foldToCbet > FOLD_TO_CBET_THRESHOLD && s.counters.cbetOpp >= 5) {
      hints.push({
        type: 'positive', icon: '💰',
        text: `${opp.displayName} folds to CBet ${Math.round(s.foldToCbet * 100)}% — fire the flop`,
      });
    }

    // Calling station → don't bluff, value bet thin
    if (s.tags.includes('Calling station')) {
      hints.push({
        type: 'info', icon: '🎣',
        text: `${opp.displayName} is a calling station — skip bluffs, bet thin value`,
      });
    }

    // Bombs river → danger signal when they bet big on river
    if (s.tags.includes('Bombs river') && gameState.street === 'river') {
      const riverBet = opp.currentBet;
      if (riverBet > gameState.pot * 0.5) {
        hints.push({
          type: 'warning', icon: '💣',
          text: `${opp.displayName} bombs river with strong hands — this big bet is likely not a bluff`,
        });
      } else {
        hints.push({
          type: 'warning', icon: '💣',
          text: `${opp.displayName} bombs rivers — be cautious if they overbbet`,
        });
      }
    }

    // Slowplays monsters → be careful of flat-calls
    if (s.tags.includes('Slowplays monsters')) {
      hints.push({
        type: 'warning', icon: '🐢',
        text: `${opp.displayName} slowplays — flat-calls often mean strong hand, not weakness`,
      });
    }

    // Maniac → their aggression is often air
    if (s.af > AF_MANIAC && s.handsSeen >= 10) {
      hints.push({
        type: 'positive', icon: '🎭',
        text: `${opp.displayName} is aggressive (AF ${s.af.toFixed(1)}) — look for spots to trap`,
      });
    }

    // Fish (high VPIP, low PFR) → they connect with boards often
    if (s.vpip > VPIP_FISH && s.pfr < 0.12 && s.handsSeen >= 10) {
      hints.push({
        type: 'info', icon: '🐟',
        text: `${opp.displayName} plays wide and passive — charge them to see turns/rivers`,
      });
    }
  }

  // ── Pot odds reminder when facing a bet ──────────────
  if (gameState.pot > 0) {
    const heroFacing = hero.currentBet === 0
      ? actives.reduce((max, s) => Math.max(max, s.currentBet), 0)
      : 0;
    if (heroFacing > 0) {
      const odds = heroFacing / (gameState.pot + heroFacing);
      hints.push({
        type: 'neutral', icon: '🧮',
        text: `Pot odds: need ${Math.round(odds * 100)}% equity to call (call ${heroFacing} into ${gameState.pot})`,
      });
    }
  }

  // ── Heads-up warning vs multiple opponents ────────────
  if (actives.length >= 3) {
    hints.push({
      type: 'warning', icon: '👥',
      text: `${actives.length} opponents — bluffing EV drops, tighten value threshold`,
    });
  }

  return hints;
}
