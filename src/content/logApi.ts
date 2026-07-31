// PokerNow's own log endpoint — the same one the log modal calls.
//
//   GET /api/games/{gameId}/log_v3[?hand_number=N]  →  [{ msg, createdAt }, …]
//
// Reading it directly beats scraping the modal on every count that matters:
// no clicking, no modal flashing over the table, one hand per request instead
// of one page render, and crucially the raw `msg` strings keep the player ids
// (`"Name @ IqQ0nDbXKt"`). The DOM only exposes the id in an <abbr title>, so
// entry text scraped from the modal parses to a name with no stable id.

export interface LogApiEntry {
  msg: string;
  createdAt: string;
}

/** Extension of the current page URL: /games/{gameId}. */
export function getGameId(): string | null {
  return location.pathname.match(/\/games\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

const HAND_START_NUM = /^-- starting hand #(\d+)/;

/**
 * One hand's log, oldest line first.
 *
 * Without `handNumber` this returns the hand in play (what the modal opens on).
 * Entries come back newest-first; `createdAt` is a monotonic counter string, so
 * sorting on it is safer than trusting the array order.
 */
export async function fetchHandLog(gameId: string, handNumber?: number): Promise<string[]> {
  const query = handNumber == null ? '' : `?hand_number=${handNumber}`;
  const res = await fetch(`/api/games/${gameId}/log_v3${query}`, {
    credentials: 'include',
    headers: { accept: 'application/json, text/plain, */*' },
  });
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
  onProgress?: (done: number, total: number) => void,
): Promise<RecentHandsResult> {
  const currentLines = await fetchHandLog(gameId);
  const currentNum = handNumberOf(currentLines);
  if (currentNum == null) {
    // No hand marker in the current log (table between hands, or a shape we do
    // not know) — hand back what there is instead of guessing hand numbers.
    return { lines: currentLines, handNumbers: [], failed: 0 };
  }

  const targets: number[] = [];
  for (let n = currentNum - 1; n >= 1 && targets.length < count; n--) targets.push(n);

  const byHand = new Map<number, string[]>([[currentNum, currentLines]]);
  let failed = 0;
  let done = 0;
  const total = targets.length;
  onProgress?.(0, total);

  // Small pool: fast enough for 100 hands, gentle enough that the game's own
  // socket keeps up — hammering this endpoint is what used to break it.
  const CONCURRENCY = 4;
  const queue = targets.slice();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        try {
          byHand.set(n, await fetchHandLog(gameId, n));
        } catch (e) {
          failed++;
          console.warn(`[Copilot] Log fetch failed for hand #${n}:`, e);
        }
        onProgress?.(++done, total);
      }
    }),
  );

  const handNumbers = [...byHand.keys()].sort((a, b) => b - a);
  const lines = [...byHand.keys()]
    .sort((a, b) => a - b)                       // oldest hand first
    .flatMap(n => byHand.get(n) ?? []);

  return { lines, handNumbers, failed };
}

function handNumberOf(lines: string[]): number | null {
  for (const line of lines) {
    const m = line.match(HAND_START_NUM);
    if (m) return Number(m[1]);
  }
  return null;
}
