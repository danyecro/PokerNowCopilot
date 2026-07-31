import type { ExtMessage, ExploitRequestMessage } from '../shared/messages';
import type { GameState, PlayerStats } from '../shared/types';
import { analyzeHand, analyzeExploit, cancelAnalysis } from './aiClient';
import { parseRecommendedKind } from '../content/actionReader';

let sidePanelPort: chrome.runtime.Port | null = null;
let lastGameState: GameState | null = null;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'sidepanel') {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => { sidePanelPort = null; });
  }
});

chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  handleMessage(msg).catch(console.error);
  sendResponse({ ok: true });
  return true;
});

chrome.action.onClicked.addListener(async tab => {
  if (tab.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

async function handleMessage(msg: ExtMessage): Promise<void> {
  switch (msg.type) {
    case 'HAND_COMPLETE':
      lastGameState = msg.gameState;
      sendToSidePanel({ type: 'GAME_STATE_UPDATE', gameState: msg.gameState });
      break;

    case 'STATS_UPDATE':
    case 'GAME_STATE_UPDATE':
    case 'HERO_STATS_UPDATE':
      sendToSidePanel(msg);
      break;

    case 'AI_ANALYZE_REQUEST':
      if (!sidePanelPort) break; // nobody listening — don't burn API calls
      await runAnalysis(msg.gameState, msg.stats);
      break;

    case 'EXPLOIT_REQUEST': {
      const exploitMsg = msg as ExploitRequestMessage;
      const target = exploitMsg.stats[exploitMsg.playerId];
      if (!target) { sendToSidePanel({ type: 'AI_STREAM_ERROR', error: 'Player not found in stats' }); break; }
      await runExploitAnalysis(target, lastGameState, exploitMsg.stats);
      break;
    }

    case 'PULL_REQUEST': {
      // Forward to the active PokerNow tab's content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs.find(t => t.url?.includes('pokernow.com'))?.id
        ?? tabs[0]?.id;
      if (!tabId) {
        sendToSidePanel({ type: 'AI_STREAM_ERROR', error: 'No active PokerNow tab found' });
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, msg) as { gameState: GameState };
        if (response?.gameState) {
          sendToSidePanel({ type: 'PULL_RESPONSE', gameState: response.gameState });
        }
      } catch (e) {
        sendToSidePanel({
          type: 'AI_STREAM_ERROR',
          error: `Pull failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      break;
    }

    case 'LOG_PULL_REQUEST': {
      const tabId = await findPokerNowTab();
      if (tabId == null) {
        sendToSidePanel({ type: 'AI_STREAM_ERROR', error: 'No PokerNow tab found' });
        return;
      }
      try {
        const res = await chrome.tabs.sendMessage(tabId, msg) as { found: number; ingested: number } | undefined;
        sendToSidePanel({
          type: 'LOG_PULL_RESULT',
          found: res?.found ?? 0,
          ingested: res?.ingested ?? 0,
        });
      } catch (e) {
        sendToSidePanel({
          type: 'AI_STREAM_ERROR',
          error: `Log pull failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      break;
    }

    default:
      break;
  }
}

async function runAnalysis(
  gameState: GameState,
  stats: Record<string, PlayerStats>,
): Promise<void> {
  cancelAnalysis();
  sendToSidePanel({ type: 'AI_STREAM_START', label: 'Analyzing hand…' });

  // Buffered alongside the stream so the finished ACTION: line can be sent to
  // the content script, which rings the matching button for the player.
  let answer = '';

  await analyzeHand(
    gameState, stats,
    chunk  => { answer += chunk; sendToSidePanel({ type: 'AI_STREAM_CHUNK', chunk }); },
    ()     => {
      sendToSidePanel({ type: 'AI_STREAM_DONE' });
      void highlightRecommendation(answer);
    },
    error  => sendToSidePanel({ type: 'AI_STREAM_ERROR', error }),
    label  => sendToSidePanel({ type: 'AI_STREAM_START', label }),  // retry status
  );
}

/** Pulls the ACTION: line out of the answer and asks the page to ring that button. */
async function highlightRecommendation(answer: string): Promise<void> {
  const match = answer.match(/^\s*ACTION:\s*(.+)$/im);
  if (!match) return;
  const line = match[1].trim();
  const kind = parseRecommendedKind(line);
  if (!kind) return;

  const tabId = await findPokerNowTab();
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'AI_RECOMMENDATION', kind, line } as ExtMessage);
    console.log(`Highlighting recommendation: ${kind} — ${line}`);
  } catch {
    // Tab navigated away or content script not injected — nothing to highlight.
  }
}

async function findPokerNowTab(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ url: 'https://*.pokernow.com/*' });
  return tabs[0]?.id;
}

async function runExploitAnalysis(
  target: PlayerStats,
  gameState: GameState | null,
  _stats: Record<string, PlayerStats>,
): Promise<void> {
  cancelAnalysis();
  sendToSidePanel({ type: 'AI_STREAM_START', label: `🎯 Exploit: ${target.displayName}` });
  await analyzeExploit(
    target, gameState,
    chunk  => sendToSidePanel({ type: 'AI_STREAM_CHUNK', chunk }),
    ()     => sendToSidePanel({ type: 'AI_STREAM_DONE' }),
    error  => sendToSidePanel({ type: 'AI_STREAM_ERROR', error }),
    label  => sendToSidePanel({ type: 'AI_STREAM_START', label }),  // retry status
  );
}

function sendToSidePanel(msg: ExtMessage): void {
  if (sidePanelPort) {
    try { sidePanelPort.postMessage(msg); } catch { sidePanelPort = null; }
  }
}
