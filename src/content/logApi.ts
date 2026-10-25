// PokerNow's own log endpoint — the same one the log modal calls.
//
//   GET /api/games/{gameId}/log_v3[?hand_number=N]  →  [{ msg, createdAt }, …]
//
// Reading it directly beats scraping the modal on every count that matters:
// no clicking, no modal flashing over the table, one hand per request instead
// of one page render, and crucially the raw `msg` strings keep the player ids
// (`"Name @ IqQ0nDbXKt"`). The DOM only exposes the id in an <abbr title>, so
// entry text scraped from the modal parses to a name with no stable id.

import { LOG_REQUEST_GAP_MS } from '../shared/constants';

export interface LogApiEntry {
  msg: string;
  createdAt: string;
}

/** Extension of the current page URL: /games/{gameId}. */
export function getGameId(): string | null {
  return location.pathname.match(/\/games\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

const HAND_START_NUM = /^-- starting hand #(\d+)/;

/** Thrown on HTTP 429 so callers can back off instead of retrying blindly. */
export class RateLimitedError extends Error {
  constructor(handNumber?: number) {
    super(`log_v3 ${handNumber ?? 'current'} → HTTP 429 (rate limited)`);
    this.name = 'RateLimitedError';
  }
}

/**
 * One hand's log, oldest line first. Empty array means "no such hand".
 *
 * Verified against a live table (2026-07-27):
 *   ?hand_number=N  existing → 200 + entries
 *   ?hand_number=N  too high → 200 + **empty array**
 *   too many requests        → 429
 *   NO hand_number           → **hand #1**, not the hand in play
 *
 * That last one is the trap: the old code called this without a number to learn
 * the current hand, concluded the table was on hand #1, and so never fetched
 * anything else. Callers must pass an explicit number.
 *
 * Entries come back newest-first; `createdAt` is a monotonic counter string, so
 * sorting on it is safer than trusting the array order.
 */
export async function fetchHandLog(gameId: string, handNumber?: number): Promise<string[]> {
  const query = handNumber == null ? '' : `?hand_number=${handNumber}`;
  const res = await fetch(`/api/games/${gameId}/log_v3${query}`, {
    credentials: 'include',
    headers: { accept: 'application/json, text/plain, */*' },
  });
  if (res.status === 429) throw new RateLimitedError(handNumber);
  if (!res.ok) throw new Error(`log_v3 ${handNumber ?? 'current'} → HTTP ${res.status}`);

  const body: unknown = await res.json();
  const entries = toEntries(body);
  return entries
    .slice()
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
    .map(e => e.msg)
    .filter(msg => typeof msg === 'string' && msg.length > 0);
}

/** The endpoint returns a bare array; tolerate a wrapped shape all the same. */
function toEntries(body: unknown): LogApiEntry[] {
  if (Array.isArray(body)) return body as LogApiEntry[];
  if (body && typeof body === 'object') {
    for (const key of ['entries', 'log', 'msgs', 'data']) {
      const val = (body as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as LogApiEntry[];
    }
  }
  return [];
}

export interface RecentHandsResult {
  /** Every line collected, oldest hand first — ready for the hand parser. */
  lines: string[];
  /** Hand numbers actually fetched, newest first. */
  handNumbers: number[];
  /** Requests that failed (deleted hands, rate limiting) — reported, not thrown. */
  failed: number;
}

/**
 * The hand in play plus the `count` hands before it.
 *
 * The current hand is included because it may be the one that just ended, and
 * the ones below it because it may equally be a fresh hand with nothing in it
 * yet — that gap is exactly what left the automatic pull empty-handed.
 */
export async function fetchRecentHands(
  gameId: string,
  count: number,
  latestHandNumber: number,
  onProgress?: (done: number, total: number) => void,
): Promise<RecentHandsResult> {
  const targets: number[] = [];
  for (let n = latestHandNumber; n >= 1 && targets.length < count + 1; n--) targets.push(n);

  const byHand = new Map<number, string[]>();
  let failed = 0;
  const total = targets.length;
  onProgress?.(0, total);

  // Sequential, with a gap. Measured on a live table: four parallel requests
  // draw 429s immediately, while ~1.2s apart runs clean. A missed hand is
  // recovered by the next pull, a throttled endpoint breaks the whole game page.
  for (let i = 0; i < targets.length; i++) {
    const n = targets[i];
    try {
      const lines = await fetchHandLog(gameId, n);
      if (lines.length === 0) continue;          // hand does not exist (yet)
      byHand.set(n, lines);
    } catch (e) {
      failed++;
      if (e instanceof RateLimitedError) {
        console.warn('[Copilot] Log API rate limited — stopping this pull early');
        break;                                   // backing off beats hammering
      }
      console.warn(`[Copilot] Log fetch failed for hand #${n}:`, e);
    }
    onProgress?.(i + 1, total);
    if (i < targets.length - 1) await sleep(LOG_REQUEST_GAP_MS);
  }

  const handNumbers = [...byHand.keys()].sort((a, b) => b - a);
  const lines = [...byHand.keys()]
    .sort((a, b) => a - b)                       // oldest hand first
    .flatMap(n => byHand.get(n) ?? []);

  return { lines, handNumbers, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Finds the highest hand number that exists, starting from `hint` and walking
 * outwards. A non-existent hand answers 200 with an empty array, so this is a
 * cheap existence test — but each step is a request, hence the tight bounds and
 * the pacing. Returns null when even the hint's neighbourhood is unreadable.
 */
export async function findLatestHandNumber(
  gameId: string,
  hint: number,
  maxSteps = 6,
): Promise<number | null> {
  let best: number | null = null;

  // Walk up while hands keep existing (the table advances during a session).
  let n = Math.max(1, hint);
  for (let step = 0; step < maxSteps; step++) {
    let exists: boolean;
    try {
      exists = (await fetchHandLog(gameId, n)).length > 0;
    } catch {
      break;
    }
    if (!exists) break;
    best = n;
    n++;
    await sleep(LOG_REQUEST_GAP_MS);
  }
  if (best !== null) return best;

  // Hint was already past the end — walk back down instead.
  n = Math.max(1, hint - 1);
  for (let step = 0; step < maxSteps && n >= 1; step++) {
    try {
      if ((await fetchHandLog(gameId, n)).length > 0) return n;
    } catch {
      break;
    }
    n--;
    await sleep(LOG_REQUEST_GAP_MS);
  }
  return null;
}

function handNumberOf(lines: string[]): number | null {
  for (const line of lines) {
    const m = line.match(HAND_START_NUM);
    if (m) return Number(m[1]);
  }
  return null;
}
