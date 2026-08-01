import type { PlayerNote, PlayerStats, Settings } from './types';
import {
  DEFAULT_MODEL, MANUAL_LOG_PULL_HANDS, RETIRED_MODELS, SEEN_HAND_IDS_LIMIT,
  STORAGE_KEYS, isKnownModel,
} from './constants';

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: DEFAULT_MODEL,
  autoAnalyze: false,
  showOverlays: true,
  showSidePanel: true,
  // Never auto-acts unless you switch it on in the side panel, and it resets
  // to 'off' the moment you touch the table again.
  afkMode: 'off',
  logPullHands: MANUAL_LOG_PULL_HANDS,
};

/**
 * Migrates a stored model id that has since been retired or removed.
 *
 * An id that is merely unknown is kept: the options page can pull the live
 * Gemini catalog, and resetting a model this build has never heard of would
 * silently undo that choice on the next read.
 */
function migrateModel(model: string): string {
  if (!model) return DEFAULT_MODEL;
  if (isKnownModel(model)) return model;
  return RETIRED_MODELS[model] ?? model;
}

export async function getSettings(): Promise<Settings> {
  const stored = (result => result[STORAGE_KEYS.SETTINGS] ?? {})(
    await chrome.storage.local.get(STORAGE_KEYS.SETTINGS),
  ) as Partial<Settings> & { openRouterApiKey?: string };

  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  return {
    ...settings,
    // The key field used to be named after the only provider there was.
    apiKey: settings.apiKey || stored.openRouterApiKey || '',
    model: migrateModel(settings.model),
  };
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

/**
 * Hand ids already counted into the stats.
 *
 * Persisted because the in-memory guard dies with the page: after a reload (or
 * a second click on the manual pull) the same hands would be ingested again on
 * top of stats that already contain them, inflating handsSeen and every ratio
 * derived from it.
 */
export async function getSeenHandIds(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SEEN_HAND_IDS);
  const ids: unknown = result[STORAGE_KEYS.SEEN_HAND_IDS];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}
export async function saveSeenHandIds(ids: string[]): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SEEN_HAND_IDS]: ids.slice(-SEEN_HAND_IDS_LIMIT),
  });
}

// Session name map (displayName → playerId) — content-script accessible via local
export async function getSessionNameMap(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION_NAME_MAP);
  return result[STORAGE_KEYS.SESSION_NAME_MAP] ?? {};
}
export async function setSessionNameMap(map: Record<string, string>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_NAME_MAP]: map });
}
