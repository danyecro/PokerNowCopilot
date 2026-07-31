import type { Hand, GameState, PlayerStats, Settings } from './types';

import type { ActionOption } from './types';

export type MessageType =
  | 'HAND_COMPLETE'
  | 'GAME_STATE_UPDATE'
  | 'STATS_UPDATE'
  | 'HERO_STATS_UPDATE'
  | 'AI_ANALYZE_REQUEST'
  | 'AI_STREAM_START'
  | 'AI_STREAM_CHUNK'
  | 'AI_STREAM_DONE'
  | 'AI_STREAM_ERROR'
  | 'AI_RECOMMENDATION'
  | 'SETTINGS_UPDATED'
  | 'PULL_REQUEST'
  | 'PULL_RESPONSE'
  | 'LOG_PULL_REQUEST'
  | 'LOG_PULL_RESULT'
  | 'EXPLOIT_REQUEST';

export interface HandCompleteMessage {
  type: 'HAND_COMPLETE';
  hand: Hand;
  gameState: GameState;
}
export interface GameStateUpdateMessage {
  type: 'GAME_STATE_UPDATE';
  gameState: GameState;
}
export interface StatsUpdateMessage {
  type: 'STATS_UPDATE';
  stats: Record<string, PlayerStats>;
}
export interface HeroStatsUpdateMessage {
  type: 'HERO_STATS_UPDATE';
  stats: PlayerStats;
}
export interface AiAnalyzeRequestMessage {
  type: 'AI_ANALYZE_REQUEST';
  gameState: GameState;
  stats: Record<string, PlayerStats>;
}
export interface AiStreamStartMessage   { type: 'AI_STREAM_START'; label?: string; }
export interface AiStreamChunkMessage   { type: 'AI_STREAM_CHUNK'; chunk: string; }
export interface AiStreamDoneMessage    { type: 'AI_STREAM_DONE'; }
export interface AiStreamErrorMessage   { type: 'AI_STREAM_ERROR'; error: string; }
export interface SettingsUpdatedMessage { type: 'SETTINGS_UPDATED'; settings: Settings; }

export interface PullRequestMessage {
  type: 'PULL_REQUEST';
  target: 'hand' | 'board' | 'pot' | 'bets' | 'all';
}
export interface PullResponseMessage {
  type: 'PULL_RESPONSE';
  gameState: GameState;
}

/**
 * Manual backfill: open the table log and ingest the completed hands in it,
 * for when the automatic per-hand pull collected nothing (page reloaded, panel
 * opened mid-session, a pull that ran into a dropped socket).
 */
export interface LogPullRequestMessage {
  type: 'LOG_PULL_REQUEST';
  /** Hands to load before the modal stops being scrolled. Target, not a cap. */
  minHands: number;
}
export interface LogPullResultMessage {
  type: 'LOG_PULL_RESULT';
  /** Completed hands found in the log. */
  found: number;
  /** Of those, how many were new to the stats engine. */
  ingested: number;
}

export interface ExploitRequestMessage {
  type: 'EXPLOIT_REQUEST';
  playerId: string;
  stats: Record<string, PlayerStats>;
}

/**
 * The parsed `ACTION:` line of a finished analysis, sent to the content script
 * so it can ring the matching button. Advisory only — the player still clicks.
 */
export interface AiRecommendationMessage {
  type: 'AI_RECOMMENDATION';
  kind: ActionOption['kind'];
  line: string;
}

export type ExtMessage =
  | HandCompleteMessage
  | GameStateUpdateMessage
  | StatsUpdateMessage
  | HeroStatsUpdateMessage
  | AiAnalyzeRequestMessage
  | AiStreamStartMessage
  | AiStreamChunkMessage
  | AiStreamDoneMessage
  | AiStreamErrorMessage
  | SettingsUpdatedMessage
  | PullRequestMessage
  | PullResponseMessage
  | LogPullRequestMessage
  | LogPullResultMessage
  | ExploitRequestMessage
  | AiRecommendationMessage;
