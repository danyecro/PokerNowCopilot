export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post' | 'allin';
export type PatternTag =
  | 'Slowplays monsters'
  | 'Bluffs draws'
  | 'Bombs river'
  | 'Folds to turn pressure'
  | 'Calling station';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface Action {
  player: string;
  street: Street;
  type: ActionType;
  amount?: number;
  isAllIn?: boolean;
  order: number;
}

/** Display name and stable id, both taken from the log's `"Name @ id"` form. */
export interface PlayerIdentity {
  displayName: string;
  playerId: string;
}

export interface Hand {
  handId: string;
  handNum: number;
  startedAt: number;
  /** Raw log references (`"Name @ id"`); `actions` use the same strings. */
  players: string[];
  /** Raw log reference → resolved identity. Keys match `players`. */
  identities: Record<string, PlayerIdentity>;
  positions: Record<string, string>;
  heroCards?: [Card, Card];
  board: Card[];
  actions: Action[];
  pot: number;
  winner: string[];
  showdownCards: Record<string, Card[]>;
}

export interface SeatState {
  playerId: string;
  displayName: string;
  seatIndex: number;
  stack: number;
  currentBet: number;
  position?: string;
  isHero: boolean;
  isActive: boolean;
  hasFolded: boolean;
}

/** A legal action offered to hero right now, read off the live action buttons. */
export interface ActionOption {
  /** Normalised action, derived from the button's own class list. */
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  /** Button text verbatim, e.g. "Call 20". */
  label: string;
  /** Chip amount parsed out of the label, when the button names one. */
  amount?: number;
  /** PokerNow keeps illegal actions in the DOM but disabled. */
  disabled: boolean;
}


export interface GameState {
  heroCards?: [Card, Card];
  board: Card[];
  pot: number;
  street: Street;
  toAct?: string;
  buttonSeat?: number;
  seats: SeatState[];
  bigBlind: number;
  smallBlind: number;
  /** True while `.you-player.decision-current` is present. */
  isHeroTurn?: boolean;
  /** Only populated while it is hero's turn. */
  availableActions?: ActionOption[];
}

export interface PlayerStats {
  playerId: string;
  displayName: string;
  handsSeen: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  foldToCbet: number;
  af: number;
  counters: {
    vpipOpp: number;
    vpipAct: number;
    pfrOpp: number;
    pfrAct: number;
    threeBetOpp: number;
    threeBetAct: number;
    cbetOpp: number;
    cbetFold: number;
    bets: number;
    raises: number;
    calls: number;
  };
  showdownRanges: Card[][];
  tags: PatternTag[];
  lastUpdated: number;
}

export interface PlayerNote {
  playerId: string;
  displayName: string;
  text: string;
  colorHex?: string;
  autoTags: PatternTag[];
  updatedAt: number;
}

/**
 * Away-from-keyboard auto-action.
 *  - 'off'        — nothing is clicked, ever (default).
 *  - 'check-fold' — check when it is free, fold only when facing a bet.
 *  - 'fold'       — leave every hand immediately.
 */
export type AfkMode = 'off' | 'check-fold' | 'fold' | 'auto';



export interface Settings {
  /** Provider-agnostic: Gemini (AIza…), OpenRouter (sk-or-…), Naga, OpenAI. */
  apiKey: string;
  model: string;
  autoAnalyze: boolean;
  showOverlays: boolean;
  showSidePanel: boolean;
  afkMode: AfkMode;
  /** Hands a manual log pull reads — the side panel's Log dropdown. */
  logPullHands: number;
}
