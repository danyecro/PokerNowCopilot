import type { GameState, PlayerStats } from '../shared/types';
import { boardToString, cardToString } from '../parser/cardUtils';

export function buildPrompt(gameState: GameState, stats: Record<string, PlayerStats>): {
  system: string;
  user: string;
} {
  const hero = gameState.seats.find(s => s.isHero);
  const activeOpponents = gameState.seats.filter(s => !s.isHero && s.isActive);

  const heroCardsStr = gameState.heroCards
    ? `${cardToString(gameState.heroCards[0])} ${cardToString(gameState.heroCards[1])}`
    : 'unknown';

  const boardStr = gameState.board.length > 0
    ? boardToString(gameState.board)
    : 'none (preflop)';

  const lastAggressor = findLastAggressor(gameState);

  const opponentLines = activeOpponents.map(seat => {
    const s = stats[seat.playerId];
    if (!s || s.handsSeen < 3) {
      return `- ${seat.displayName} (n=<3): insufficient data`;
    }
    const vpip = Math.round(s.vpip * 100);
    const pfr = Math.round(s.pfr * 100);
    const threeBet = Math.round(s.threeBet * 100);
    const foldToCbet = Math.round(s.foldToCbet * 100);
    const af = s.af.toFixed(1);
    const tags = s.tags.length > 0 ? s.tags.join(', ') : 'none';
    return `- ${seat.displayName} (n=${s.handsSeen}): VPIP ${vpip}% / PFR ${pfr}%, 3Bet ${threeBet}%, AF ${af}, FoldToCbet ${foldToCbet}%. Tags: ${tags}`;
  }).join('\n');

  const heroPos = hero?.position ?? '?';
  const heroBBs = gameState.bigBlind > 0 && hero
    ? ` (${(hero.stack / gameState.bigBlind).toFixed(0)}BB deep)`
    : '';
  const inPosition = hero?.position
    ? ['BTN', 'BTN/SB', 'CO', 'HJ'].includes(hero.position) ? ' [IN POSITION]' : ' [OUT OF POSITION]'
    : '';

  const legal = describeLegalActions(gameState);

  const user = `GAME CONTEXT
- Hero hole cards: ${heroCardsStr}
- Board (${gameState.street}): ${boardStr}
- Pot: ${gameState.pot} chips   Blinds: ${gameState.smallBlind}/${gameState.bigBlind}
- Hero position: ${heroPos}${inPosition}   Stack: ${hero?.stack ?? '?'}${heroBBs}
- Players still in hand: ${activeOpponents.map(s => `${s.displayName} (${s.position ?? '?'}, ${hero && gameState.bigBlind > 0 ? (s.stack / gameState.bigBlind).toFixed(0) + 'BB' : s.stack + ' chips'})`).join(', ')}
- Action is on: ${gameState.toAct ?? 'unknown'}

${legal.block}

OPPONENT PROFILES (session stats, n=hands seen)
${opponentLines || '- (no opponent data yet)'}

LAST AGGRESSOR THIS STREET: ${lastAggressor}

TASKS
1. Optimal action for hero${legal.constraint} + sizing as % of pot
2. One-paragraph reasoning grounded in the stats
3. Likely range of the last aggressor expressed as hand categories
4. Confidence (low/med/high) given sample sizes

FORMAT:
ACTION: <action + sizing>
WHY: <reasoning>
RAISER RANGE: <categories>
CONFIDENCE: <level>`;

  return { system: SYSTEM_MESSAGE, user };
}

/**
 * Turns the live action buttons into a prompt block. Without this the model
 * happily suggests actions the table does not offer (checking when facing a
 * bet, or a raise size the stack cannot cover).
 */
function describeLegalActions(gameState: GameState): { block: string; constraint: string } {
  const actions = gameState.availableActions ?? [];
  const enabled = actions.filter(a => !a.disabled);

  if (enabled.length === 0) {
    return {
      block: 'LEGAL ACTIONS: not hero\'s turn — no action bar on screen. Give the plan for when the action arrives.',
      constraint: ' (fold/check/call/bet/raise)',
    };
  }

  const lines = enabled.map(a => {
    const amount = a.amount !== undefined && gameState.bigBlind > 0
      ? ` — ${a.amount} chips (${(a.amount / gameState.bigBlind).toFixed(1)}BB)`
      : a.amount !== undefined ? ` — ${a.amount} chips` : '';
    return `- ${a.kind.toUpperCase()}: button reads "${a.label}"${amount}`;
  });

  const blocked = actions.filter(a => a.disabled).map(a => a.kind.toUpperCase());
  const blockedLine = blocked.length > 0
    ? `\nNot available right now: ${blocked.join(', ')}.`
    : '';

  const kinds = enabled.map(a => a.kind).join('/');
  return {
    block: `LEGAL ACTIONS (hero is to act now — these are the only buttons on screen)\n${lines.join('\n')}${blockedLine}`,
    constraint: ` — you MUST pick exactly one of: ${kinds}`,
  };
}

function findLastAggressor(gameState: GameState): string {
  const opponents = gameState.seats.filter(s => !s.isHero && s.currentBet > 0);
  if (opponents.length === 0) return 'none';

  const maxBet = Math.max(...opponents.map(o => o.currentBet));

  // Preflop: if the highest bet is only the big blind (no raise yet),
  // this is just a blind post — not an aggressive action.
  if (gameState.street === 'preflop' && maxBet <= gameState.bigBlind) {
    return 'none (blinds posted, no raise yet)';
  }

  const sorted = [...opponents].sort((a, b) => b.currentBet - a.currentBet);
  const raiseSize = gameState.bigBlind > 0
    ? ` (${(sorted[0].currentBet / gameState.bigBlind).toFixed(1)}BB)`
    : '';
  return `${sorted[0].displayName} bet ${sorted[0].currentBet}${raiseSize}`;
}

const SYSTEM_MESSAGE = `You are an expert poker strategy assistant analyzing a live No-Limit Texas Hold'em cash hand.
Be concise, decisive, and quantitative. Recommend one primary action with sizing, give the key
reason, and estimate opponents' likely ranges. Do not invent cards or stats not provided.
If information is missing, state your assumption.`;

export function buildExploitPrompt(
  target: import('../shared/types').PlayerStats,
  gameState: import('../shared/types').GameState | null,
): { system: string; user: string } {
  const vpip = Math.round(target.vpip * 100);
  const pfr  = Math.round(target.pfr * 100);
  const tb   = Math.round(target.threeBet * 100);
  const fc   = Math.round(target.foldToCbet * 100);
  const af   = target.af.toFixed(1);
  const tags = target.tags.length > 0 ? target.tags.join(', ') : 'none detected yet';
  const ctx  = gameState
    ? `Board: ${gameState.board.map(c => `${c.rank}${c.suit}`).join(' ') || 'none'}, Street: ${gameState.street}, Pot: ${gameState.pot}`
    : 'no live context';

  const user = `PLAYER PROFILE: ${target.displayName}
Hands observed: ${target.handsSeen}
VPIP: ${vpip}%  PFR: ${pfr}%  3Bet: ${tb}%  FoldToCbet: ${fc}%  AF: ${af}
Behavioral tags: ${tags}
Current game context: ${ctx}

TASK — Exploit analysis:
1. LEAK: Their single biggest exploitable weakness (1 sentence, be specific with numbers)
2. EXPLOIT NOW: The exact betting line to use against them in the current street/context
3. BEST SPOTS: Which hand types or board textures to target them on
4. TRAP: One mistake to avoid when playing against this player type

Keep each point to 1-2 sentences. Be direct and actionable.`;

  return {
    system: `You are a poker exploit specialist. Analyze player statistics and identify concrete, profitable adjustments. Be blunt and specific — no generic advice.`,
    user,
  };
}
