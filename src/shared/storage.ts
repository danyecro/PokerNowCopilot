import type { PlayerNote, PlayerStats, Settings } from './types';
import {
  DEFAULT_MODEL, MANUAL_LOG_PULL_HANDS, RETIRED_MODELS, STORAGE_KEYS, isKnownModel,
} from './constants';

const DEFAULT_SETTINGS: Settings = {
  openRouterApiKey: '',
  model: DEFAULT_MODEL,
  autoAnalyze: false,
  showOverlays: true,
  showSidePanel: true,
  // Never auto-acts unless you switch it on in the side panel, and it resets
  // to 'off' the moment you touch the table again.
  afkMode: 'off',
  logPullHands: MANUAL_LOG_PULL_HANDS,
};

/** Migrates a stored model id that has since been retired or removed. */
function migrateModel(model: string): string {
  if (isKnownModel(model)) return model;
  return RETIRED_MODELS[model] ?? DEFAULT_MODEL;
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] ?? {}) };
  return { ...settings, model: migrateModel(settings.model) };
}
export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// Stats use chrome.storage.local (accessible from content scripts + persists across sessions)
export async function getAllPlayerStats(): Promise<Record<string, PlayerStats>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ALL_PLAYER_STATS);
  return result[STORAGE_KEYS.ALL_PLAYER_STATS] ?? {};
}
export async function saveAllPlayerStats(stats: Record<string, PlayerStats>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ALL_PLAYER_STATS]: stats });
}

// Hero stats stored separately
export async function getHeroStats(): Promise<PlayerStats | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HERO_STATS);
  return result[STORAGE_KEYS.HERO_STATS] ?? null;
}
export async function saveHeroStats(stats: PlayerStats): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.HERO_STATS]: stats });
}

export async function getPlayerNote(playerId: string): Promise<PlayerNote | null> {
  const key = STORAGE_KEYS.PLAYER_NOTE_PREFIX + playerId;
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}
export async function setPlayerNote(note: PlayerNote): Promise<void> {
  const key = STORAGE_KEYS.PLAYER_NOTE_PREFIX + note.playerId;
  await chrome.storage.local.set({ [key]: note });
}

// Session name map (displayName → playerId) — content-script accessible via local
export async function getSessionNameMap(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION_NAME_MAP);
  return result[STORAGE_KEYS.SESSION_NAME_MAP] ?? {};
}
export async function setSessionNameMap(map: Record<string, string>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_NAME_MAP]: map });
}
