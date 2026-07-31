import type { Hand, PlayerIdentity, PlayerStats } from '../shared/types';
import { createEmptyStats, ingestHandForPlayer, recomputeRatios } from './metrics';
import { computeTags } from './patternTagger';
import { getAllPlayerStats, saveAllPlayerStats, getHeroStats, saveHeroStats } from '../shared/storage';

const seenHandIds = new Set<string>();
let statsCache: Record<string, PlayerStats> = {};
let heroStats: PlayerStats | null = null;
let heroPlayerId: string | null = null;

// displayName → playerId, built from gameStateReader
let nameToIdMap: Record<string, string> = {};

export function updateNameMap(map: Record<string, string>): void {
  nameToIdMap = { ...nameToIdMap, ...map };
  sweepLegacyKeys();
}

/**
 * Migrates every legacy name-keyed entry whose id we now know, not just the ones
 * appearing in the current hand — so a table full of previously-tracked players
 * gets cleaned up on the first snapshot instead of one player at a time.
 */
function sweepLegacyKeys(): void {
  let changed = false;
  for (const [name, id] of Object.entries(nameToIdMap)) {
    if (name === id || !statsCache[name]) continue;
    if (heroPlayerId !== null && id === heroPlayerId) {
      // Hero's history belongs in heroStats, never in the opponent cache.
      const base = heroStats ?? createEmptyStats(id, name);
      heroStats = { ...absorbLegacy(base, name, id) };
      heroStats.tags = computeTags(heroStats);
      saveHeroStats(heroStats).catch(() => {});
    } else {
      const base = statsCache[id] ?? createEmptyStats(id, name);
      statsCache[id] = absorbLegacy(base, name, id);
    }
    changed = true;
  }
  if (changed) saveAllPlayerStats(statsCache).catch(() => {});
}

/** How many legacy name-keyed entries have been folded in this session. */
export function getMigratedCount(): number {
  return migratedCount;
}

export function resolvePlayerId(displayName: string): string {
  return nameToIdMap[displayName] ?? displayName;
}

export function setHeroPlayerId(id: string): void {
  heroPlayerId = id;
}

/** Load persisted stats from chrome.storage.local (accessible from content scripts) */
export async function loadFromStorage(): Promise<void> {
  try {
    statsCache = await getAllPlayerStats();
    heroStats = await getHeroStats();
  } catch {
    // Storage not available in this context — continue with empty cache
    statsCache = {};
    heroStats = null;
  }
}

/**
 * Resolves a log reference to the id every consumer looks up by — the one the
 * DOM exposes as `href="/players/{id}"`.
 *
 * Two log dialects exist. Some tables write `"Name @ IqQ0nDbXKt"`, which already
 * carries the id. Others write just `Name`; there `parseLogPlayer` can only fall
 * back to the name, so stats end up keyed by name while badges, the opponent
 * list and the prompt all look up by DOM id — every lookup missed and everything
 * showed n=0. Bridge that case through nameToIdMap, which gameStateReader builds
 * from the seat links.
 */
function resolveIdentity(logRef: string, hand: Hand): PlayerIdentity {
  const fromLog = hand.identities[logRef];
  const displayName = fromLog?.displayName ?? logRef;

  // The log carried an explicit id — trust it over the DOM.
  if (fromLog && fromLog.playerId !== fromLog.displayName) return fromLog;

  const domId = nameToIdMap[displayName];
  return { displayName, playerId: domId ?? displayName };
}

// ── Legacy key migration ─────────────────────────────────────────────────────
// Builds before the identity fix keyed stats by display name on tables whose log
// omits the `@ id` suffix. Those entries are orphaned: nothing looks them up any
// more. Rather than discard that history, fold it into the id-keyed entry as soon
// as the name→id mapping becomes known, then drop the old key.

let migratedCount = 0;

/** Adds `from`'s counters into `into` and recomputes the derived ratios. */
function mergeStats(into: PlayerStats, from: PlayerStats): PlayerStats {
  const counters = { ...into.counters };
  for (const key of Object.keys(counters) as Array<keyof PlayerStats['counters']>) {
    counters[key] += from.counters[key];
  }
  return recomputeRatios({
    ...into,
    handsSeen: into.handsSeen + from.handsSeen,
    counters,
    showdownRanges: [...from.showdownRanges, ...into.showdownRanges].slice(-20),
  });
}

/**
 * Folds a stale `statsCache[displayName]` entry into the given id-keyed bucket.
 * Returns the (possibly merged) stats. No-op when there is nothing to migrate.
 */
function absorbLegacy(target: PlayerStats, displayName: string, playerId: string): PlayerStats {
  if (displayName === playerId) return target;          // nothing to merge into
  const legacy = statsCache[displayName];
  if (!legacy) return target;

  delete statsCache[displayName];
  migratedCount++;
  console.info(
    `[Copilot] Migrated legacy stats "${displayName}" (n=${legacy.handsSeen}) → ${playerId}`,
  );
  return mergeStats(target, legacy);
}

export function ingestHand(hand: Hand): {
  opponentStats: Record<string, PlayerStats>;
  heroStats: PlayerStats | null;
  /** False when this hand id had already been counted. */
  ingested: boolean;
} {
  if (seenHandIds.has(hand.handId)) {
    return { opponentStats: { ...statsCache }, heroStats, ingested: false };
  }
  seenHandIds.add(hand.handId);

  // `logRef` is the raw log string — hand.actions use the same string, so it
  // stays the key for action matching. Stats are keyed by the resolved id.
  for (const logRef of hand.players) {
    const { playerId, displayName } = resolveIdentity(logRef, hand);
    const isHero = heroPlayerId !== null && playerId === heroPlayerId;

    if (isHero) {
      // Hero must never sit in the opponent cache; older builds put it there
      // whenever the log carried no id, so absorb and remove that entry.
      let current = heroStats ?? createEmptyStats(playerId, displayName);
      current = absorbLegacy(current, displayName, playerId);
      const updated = ingestHandForPlayer(logRef, hand, current);
      heroStats = { ...updated, playerId, displayName, tags: computeTags(updated) };
      saveHeroStats(heroStats).catch(() => {});
    } else {
      let current = statsCache[playerId] ?? createEmptyStats(playerId, displayName);
      current = absorbLegacy(current, displayName, playerId);
      const updated = ingestHandForPlayer(logRef, hand, current);
      // Refresh displayName: players can rename between hands.
      statsCache[playerId] = { ...updated, playerId, displayName, tags: computeTags(updated) };
    }
  }

  saveAllPlayerStats(statsCache).catch(() => {});
  return { opponentStats: { ...statsCache }, heroStats, ingested: true };
}

export function getAllStats(): Record<string, PlayerStats> {
  return { ...statsCache };
}

export function getPlayerStats(playerId: string): PlayerStats | null {
  return statsCache[playerId] ?? null;
}

export function getHeroStatsSnapshot(): PlayerStats | null {
  return heroStats;
}
