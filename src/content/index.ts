import { healthCheck, SEL } from './selectors';
import { startWatching, startStreetWatcher, startTurnWatcher } from './domWatcher';
import { clearActionHighlight, highlightAction, findActionButton } from './actionReader';
import { cancelAfkAction, scheduleAfkAction } from './afkFolder';
import { setSettings } from '../shared/storage';
import { pullLogEntries, pullLogPages } from './logPuller';
import { snapshotGameState } from './gameStateReader';
import {
  extractCompletedHandBlocksFromLines, logEntriesToLines, parseHand,
} from '../parser/handParser';
import {
  ingestHand, updateNameMap, getAllStats, getHeroStatsSnapshot,
  loadFromStorage, setHeroPlayerId,
} from '../stats/statsEngine';
import { updateOverlays, setOverlaysEnabled } from './overlayManager';
import { startPopoverWatcher } from './popoverWatcher';
import { getSettings } from '../shared/storage';
import type { ExtMessage } from '../shared/messages';

/** What a log pull found — reported back to the side panel for a manual pull. */
interface LogPullResult { found: number; ingested: number; }

async function init(): Promise<void> {
  await waitForGameRoot();
  if (!healthCheck()) return;

  // Load persisted stats (chrome.storage.local accessible in content scripts)
  await loadFromStorage();

  // Detect hero player ID
  const heroLink = document.querySelector<HTMLAnchorElement>(`${SEL.HERO} .table-player-name a`);
  const heroId = heroLink?.getAttribute('href')?.split('/').pop() ?? '';
  if (heroId) setHeroPlayerId(heroId);

  setOverlaysEnabled(true);
  // Also do an initial overlay render with whatever stats are already loaded
  updateOverlays(getAllStats(), (pid) => chrome.runtime.sendMessage({ type: 'EXPLOIT_REQUEST', playerId: pid, stats: getAllStats() }));
  startWatching(onHandEnd);
  startStreetWatcher(onStreetChange);
  startTurnWatcher(onHeroTurn, onTurnEnd);
  startPopoverWatcher(getAllStats);

  // Listen for pull requests from the side panel (routed via background)
  chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
    if (msg.type === 'PULL_REQUEST') {
      handlePullRequest(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'LOG_PULL_REQUEST') {
      // Manual backfill — bypasses the throttle on purpose: it is a click, not
      // a hand-end trigger, and the point of it is to run right now.
      const { minHands } = msg;
      void runLogPull({ minHands }).then(sendResponse);
      return true;
    }
    if (msg.type === 'AI_RECOMMENDATION') {
      // Only ring a button while the action bar is actually up — a late answer
      // for a decision already made must not mark anything.
      const shown = highlightAction(msg.kind);
      console.log(`[Copilot] Suggested: ${msg.line}${shown ? '' : ' (button no longer available)'}`);
    }
  });

  console.log('[PokerNow Copilot] Active — hero:', heroId || '(unknown)');
}

function handlePullRequest(
  sendResponse: (r: { gameState: ReturnType<typeof snapshotGameState>['gameState'] }) => void,
): void {
  const { gameState, nameToIdMap } = snapshotGameState();
  updateNameMap(nameToIdMap);
  sendResponse({ gameState });
}

// Opening the log modal makes PokerNow fetch that hand's log over the network.
// With AFK auto-fold on, hands finish every few seconds, and pulling on every
// single hand-end hammered the page hard enough that PokerNow's own socket
// dropped and its log_v3 requests started failing — leaving the modal empty.
//
// Throttling is safe now that a pull ingests *all* completed hands in the log:
// a skipped trigger is recovered by the next pull instead of losing a hand.
const MIN_PULL_INTERVAL_MS = 6000;
let lastPullAt = 0;
let pullPending: ReturnType<typeof setTimeout> | null = null;

async function onHandEnd(): Promise<void> {
  const since = Date.now() - lastPullAt;
  if (since < MIN_PULL_INTERVAL_MS) {
    // Trailing edge: make sure the hands we are skipping get read shortly.
    if (pullPending) return;
    pullPending = setTimeout(() => {
      pullPending = null;
      void runLogPull();
    }, MIN_PULL_INTERVAL_MS - since);
    return;
  }
  await runLogPull();
}

/**
 * Reads the table log and ingests every completed hand in it.
 *
 * `minHands` turns it into a backfill: the log is paged back until that many
 * completed hands have been collected (see logPuller). Without it only the page
 * the modal opens on is read — the normal per-hand path, which is also the one
 * that comes up empty when the next hand was dealt before the pull ran.
 */
async function runLogPull(opts: { minHands?: number } = {}): Promise<LogPullResult> {
  lastPullAt = Date.now();

  const { gameState, nameToIdMap } = snapshotGameState();
  updateNameMap(nameToIdMap);

  const minHands = opts.minHands;
  const lines = minHands
    ? await pullLogPages({
        enough: ls => extractCompletedHandBlocksFromLines(ls).length >= minHands,
        // Paging costs one log request per hand, so cap the walk well above the
        // target but far below "the whole session".
        maxPages: minHands * 3,
        waitForFree: true,
      })
    : logEntriesToLines(await pullLogEntries());

  if (lines.length === 0) return { found: 0, ingested: 0 };

  // Ingest every completed hand collected, not just the newest one: a hand that
  // ended while a previous pull was still open would otherwise be lost. Already
  // known hand ids are skipped inside ingestHand.
  const blocks = extractCompletedHandBlocksFromLines(lines);
  if (blocks.length === 0) {
    console.warn('[Copilot] No completed hand in log');
    return { found: 0, ingested: 0 };
  }

  let opponentStats = getAllStats();
  let heroStats = getHeroStatsSnapshot();
  let ingested = 0;

  for (const lines of blocks) {
    const hand = parseHand(lines);
    if (!hand) {
      console.warn('[Copilot] Could not parse hand', lines);
      continue;
    }
    const result = ingestHand(hand);
    opponentStats = result.opponentStats;
    heroStats = result.heroStats;
    if (result.ingested) {
      ingested++;
      // Only the players of THIS hand — dumping the whole cache produced a
      // console line hundreds of entries long.
      const seen = hand.players
        .map(ref => hand.identities[ref]?.displayName ?? ref)
        .map(name => Object.values(opponentStats).find(s => s.displayName === name))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map(s => `${s.displayName}(${s.playerId})=n${s.handsSeen}`);
      console.log(`[Copilot] Hand #${hand.handNum} → ${seen.join(' ')}`);
    }
  }
  // nothing new — every hand was already counted
  if (ingested === 0) return { found: blocks.length, ingested };

  updateOverlays(opponentStats, (pid) => chrome.runtime.sendMessage({ type: 'EXPLOIT_REQUEST', playerId: pid, stats: opponentStats }));

  chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: opponentStats } as ExtMessage);
  chrome.runtime.sendMessage({ type: 'GAME_STATE_UPDATE', gameState } as ExtMessage);
  if (heroStats) {
    chrome.runtime.sendMessage({ type: 'HERO_STATS_UPDATE', stats: heroStats } as ExtMessage);
  }
  return { found: blocks.length, ingested };
}

// Fires on every preflop→flop→turn→river (and next-hand) transition. Keeps the
// side panel's board/equity display current. Analysis is NOT triggered here —
// see onHeroTurn: a new board card is not a decision point, hero's turn is.
async function onStreetChange(): Promise<void> {
  const { gameState, nameToIdMap } = snapshotGameState();
  updateNameMap(nameToIdMap);
  // Deliberately does NOT cancel the pending AFK action or clear the highlight:
  // postflop the board cards and hero's turn land at the same time, so the
  // street-change debounce fires *inside* the grace period of a turn that has
  // only just begun. Cancelling here made AFK work preflop and nowhere else.
  chrome.runtime.sendMessage({ type: 'GAME_STATE_UPDATE', gameState } as ExtMessage);
}

/** Hero no longer has to act — drop anything that was queued for that decision. */
function onTurnEnd(): void {
  cancelAfkAction();
  clearActionHighlight();
}

// Fires when `.you-player decision-current` appears, i.e. the moment the action
// bar shows up and hero has to decide. With "Auto-analyze" on this replaces the
// manual "Pull All" + "Analyze moves" clicks. The snapshot now carries the legal
// actions read off the buttons, so the model can only recommend an action that
// is actually on screen.
//
// Deliberately advisory: the recommended button gets ringed (see the
// AI_RECOMMENDATION handler) and the player clicks it. Nothing here clicks.
async function onHeroTurn(): Promise<void> {
  const { gameState, nameToIdMap } = snapshotGameState();
  updateNameMap(nameToIdMap);
  clearActionHighlight();

  // Always refresh the panel so the hand bar is current even without auto-analyze.
  chrome.runtime.sendMessage({ type: 'GAME_STATE_UPDATE', gameState } as ExtMessage);

  const settings = await getSettings();

  // AFK takes precedence: if we are about to check/fold, an analysis would only
  // burn a request on a decision nobody is going to read.
  if (settings.afkMode !== 'off') {
    scheduleAfkAction(
      settings.afkMode,
      gameState.availableActions,
      () => { void disableAfkMode(); },
      findActionButton,
    );
    return;
  }

  if (!settings.autoAnalyze) return;

  console.log('[Copilot] Hero to act — actions:', gameState.availableActions);
  chrome.runtime.sendMessage({
    type: 'AI_ANALYZE_REQUEST',
    gameState,
    stats: getAllStats(),
  } as ExtMessage);
}

/** Called when input arrives during the AFK grace period — you are back. */
async function disableAfkMode(): Promise<void> {
  const settings = await getSettings();
  if (settings.afkMode === 'off') return;
  await setSettings({ ...settings, afkMode: 'off' });
}

function waitForGameRoot(): Promise<void> {
  return new Promise(resolve => {
    if (document.querySelector('.game-main-container')) { resolve(); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector('.game-main-container')) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(resolve, 10000);
  });
}

init().catch(console.error);
