import { g as getSettings, e as OPENROUTER_BASE_URL, N as NAGA_BASE_URL, O as OPENAI_BASE_URL, A as AVAILABLE_MODELS, b as MAX_ATTEMPTS, R as RETRYABLE_STATUSES, h as hasReasoningOnByDefault, c as MAX_RETRY_AFTER_MS, B as BACKOFF_BASE_MS, a as BACKOFF_CAP_MS } from "./chunks/storage.js";
import { c as cardToString, b as boardToString } from "./chunks/cardUtils.js";
function buildPrompt(gameState, stats) {
  const hero = gameState.seats.find((s) => s.isHero);
  const activeOpponents = gameState.seats.filter((s) => !s.isHero && s.isActive);
  const heroCardsStr = gameState.heroCards ? `${cardToString(gameState.heroCards[0])} ${cardToString(gameState.heroCards[1])}` : "unknown";
  const boardStr = gameState.board.length > 0 ? boardToString(gameState.board) : "none (preflop)";
  const lastAggressor = findLastAggressor(gameState);
  const opponentLines = activeOpponents.map((seat) => {
    const s = stats[seat.playerId];
    if (!s || s.handsSeen < 3) {
      return `- ${seat.displayName} (n=<3): insufficient data`;
    }
    const vpip = Math.round(s.vpip * 100);
    const pfr = Math.round(s.pfr * 100);
    const threeBet = Math.round(s.threeBet * 100);
    const foldToCbet = Math.round(s.foldToCbet * 100);
    const af = s.af.toFixed(1);
    const tags = s.tags.length > 0 ? s.tags.join(", ") : "none";
    return `- ${seat.displayName} (n=${s.handsSeen}): VPIP ${vpip}% / PFR ${pfr}%, 3Bet ${threeBet}%, AF ${af}, FoldToCbet ${foldToCbet}%. Tags: ${tags}`;
  }).join("\n");
  const heroPos = hero?.position ?? "?";
  const heroBBs = gameState.bigBlind > 0 && hero ? ` (${(hero.stack / gameState.bigBlind).toFixed(0)}BB deep)` : "";
  const inPosition = hero?.position ? ["BTN", "BTN/SB", "CO", "HJ"].includes(hero.position) ? " [IN POSITION]" : " [OUT OF POSITION]" : "";
  const legal = describeLegalActions(gameState);
  const user = `GAME CONTEXT
- Hero hole cards: ${heroCardsStr}
- Board (${gameState.street}): ${boardStr}
- Pot: ${gameState.pot} chips   Blinds: ${gameState.smallBlind}/${gameState.bigBlind}
- Hero position: ${heroPos}${inPosition}   Stack: ${hero?.stack ?? "?"}${heroBBs}
- Players still in hand: ${activeOpponents.map((s) => `${s.displayName} (${s.position ?? "?"}, ${hero && gameState.bigBlind > 0 ? (s.stack / gameState.bigBlind).toFixed(0) + "BB" : s.stack + " chips"})`).join(", ")}
- Action is on: ${gameState.toAct ?? "unknown"}

${legal.block}

OPPONENT PROFILES (session stats, n=hands seen)
${opponentLines || "- (no opponent data yet)"}

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
function describeLegalActions(gameState) {
  const actions = gameState.availableActions ?? [];
  const enabled = actions.filter((a) => !a.disabled);
  if (enabled.length === 0) {
    return {
      block: "LEGAL ACTIONS: not hero's turn — no action bar on screen. Give the plan for when the action arrives.",
      constraint: " (fold/check/call/bet/raise)"
    };
  }
  const lines = enabled.map((a) => {
    const amount = a.amount !== void 0 && gameState.bigBlind > 0 ? ` — ${a.amount} chips (${(a.amount / gameState.bigBlind).toFixed(1)}BB)` : a.amount !== void 0 ? ` — ${a.amount} chips` : "";
    return `- ${a.kind.toUpperCase()}: button reads "${a.label}"${amount}`;
  });
  const blocked = actions.filter((a) => a.disabled).map((a) => a.kind.toUpperCase());
  const blockedLine = blocked.length > 0 ? `
Not available right now: ${blocked.join(", ")}.` : "";
  const kinds = enabled.map((a) => a.kind).join("/");
  return {
    block: `LEGAL ACTIONS (hero is to act now — these are the only buttons on screen)
${lines.join("\n")}${blockedLine}`,
    constraint: ` — you MUST pick exactly one of: ${kinds}`
  };
}
function findLastAggressor(gameState) {
  const opponents = gameState.seats.filter((s) => !s.isHero && s.currentBet > 0);
  if (opponents.length === 0) return "none";
  const maxBet = Math.max(...opponents.map((o) => o.currentBet));
  if (gameState.street === "preflop" && maxBet <= gameState.bigBlind) {
    return "none (blinds posted, no raise yet)";
  }
  const sorted = [...opponents].sort((a, b) => b.currentBet - a.currentBet);
  const raiseSize = gameState.bigBlind > 0 ? ` (${(sorted[0].currentBet / gameState.bigBlind).toFixed(1)}BB)` : "";
  return `${sorted[0].displayName} bet ${sorted[0].currentBet}${raiseSize}`;
}
const SYSTEM_MESSAGE = `You are an expert poker strategy assistant analyzing a live No-Limit Texas Hold'em cash hand.
Be concise, decisive, and quantitative. Recommend one primary action with sizing, give the key
reason, and estimate opponents' likely ranges. Do not invent cards or stats not provided.
If information is missing, state your assumption.`;
function buildExploitPrompt(target, gameState) {
  const vpip = Math.round(target.vpip * 100);
  const pfr = Math.round(target.pfr * 100);
  const tb = Math.round(target.threeBet * 100);
  const fc = Math.round(target.foldToCbet * 100);
  const af = target.af.toFixed(1);
  const tags = target.tags.length > 0 ? target.tags.join(", ") : "none detected yet";
  const ctx = gameState ? `Board: ${gameState.board.map((c) => `${c.rank}${c.suit}`).join(" ") || "none"}, Street: ${gameState.street}, Pot: ${gameState.pot}` : "no live context";
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
    user
  };
}
let currentAbortController = null;
const INVISIBLE = /[\s\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
const NON_LATIN1 = /[^\u0000-\u00FF]/;
function sanitizeApiKey(raw) {
  return raw.replace(INVISIBLE, "");
}
function apiKeyProblem(key) {
  if (!key) return "No API key configured. Please add it in the extension settings.";
  const match = NON_LATIN1.exec(key);
  if (match) {
    const cp = match[0].codePointAt(0) ?? 0;
    const hex = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    return `API key contains a character that cannot be sent in an HTTP header (${hex} at position ${key.indexOf(match[0]) + 1} of ${key.length}). Re-enter the key as plain text in the extension settings.`;
  }
  return null;
}
function providerFromKey(apiKey) {
  if (apiKey.startsWith("sk-or-")) return "openrouter";
  if (apiKey.startsWith("ng-")) return "naga";
  if (apiKey.startsWith("sk-")) return "openai";
  return null;
}
function resolveProvider(apiKey, model) {
  return providerFromKey(apiKey) ?? AVAILABLE_MODELS.find((m) => m.id === model)?.provider ?? "naga";
}
function modelProviderMismatch(provider, model) {
  const known = AVAILABLE_MODELS.find((m) => m.id === model);
  if (!known || known.provider === provider) return null;
  const usable = AVAILABLE_MODELS.filter((m) => m.provider === provider).map((m) => m.id);
  return `Model "${model}" belongs to ${known.provider}, but the saved API key is a ${provider} key. Pick one of these in the extension settings: ${usable.join(", ")}`;
}
function resolveEndpointAndHeaders(apiKey, model) {
  const provider = resolveProvider(apiKey, model);
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://www.pokernow.com";
    headers["X-Title"] = "PokerNow Copilot";
    return { provider, url: OPENROUTER_BASE_URL, headers, modelId: model };
  }
  if (provider === "naga") {
    return { provider, url: NAGA_BASE_URL, headers, modelId: model };
  }
  const modelId = model.startsWith("openai/") ? model.slice(7) : model;
  return { provider, url: OPENAI_BASE_URL, headers, modelId };
}
function buildBody(provider, modelId, system, user, maxTokens, temperature) {
  const base = {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    stream: true,
    temperature
  };
  if (provider === "naga") {
    return { ...base, max_completion_tokens: maxTokens };
  }
  if (provider === "openrouter" && hasReasoningOnByDefault(modelId)) {
    base.reasoning = { enabled: false };
  }
  return { ...base, max_tokens: maxTokens };
}
function parseApiError(text) {
  try {
    const parsed = JSON.parse(text);
    const err = parsed?.error ?? parsed;
    const retryAfterSec = err?.metadata?.retry_after_seconds ?? err?.metadata?.retry_after_seconds_raw ?? void 0;
    return {
      type: typeof err?.type === "string" ? err.type : void 0,
      message: typeof err?.message === "string" ? err.message : void 0,
      retryAfterSec: typeof retryAfterSec === "number" ? retryAfterSec : void 0
    };
  } catch {
    return {};
  }
}
function describeStatus(status, model) {
  switch (status) {
    case 400:
      return "Bad request — the model rejected the payload.";
    case 401:
      return "Invalid or missing API key. Check the key in the extension settings.";
    case 402:
      return "Insufficient credits on the API account.";
    case 403:
      return "Forbidden — this key is not allowed to use this model.";
    case 404:
      return `Model "${model}" not found on this provider.`;
    case 410:
      return `Model "${model}" is deprecated — pick another one in settings.`;
    case 422:
      return "Validation error — the request body was rejected.";
    default:
      return null;
  }
}
function backoffMs(attempt, resp, parsed) {
  const header = resp.headers.get("retry-after");
  const headerSec = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : void 0;
  const explicitSec = headerSec ?? parsed.retryAfterSec;
  if (explicitSec !== void 0) {
    return Math.min(explicitSec * 1e3, MAX_RETRY_AFTER_MS);
  }
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return capped + Math.floor(Math.random() * 250);
}
async function fetchStreamWithRetry(url, body, headers, model, signal, onStatus, onError) {
  const payload = JSON.stringify(body);
  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp;
    try {
      resp = await fetch(url, { method: "POST", headers, body: payload, signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return null;
      lastDetail = err instanceof Error ? err.message : String(err);
      if (err instanceof TypeError) {
        onError(`Request rejected by the browser: ${lastDetail}`);
        return null;
      }
      if (attempt >= MAX_ATTEMPTS) {
        onError(`Network error after ${MAX_ATTEMPTS} attempts: ${lastDetail}`);
        return null;
      }
      const waitMs2 = backoffMs(attempt, new Response(), {});
      onStatus(`🔌 Network error — retrying in ${Math.round(waitMs2 / 1e3)}s… (${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(waitMs2);
      continue;
    }
    if (resp.ok) return resp;
    const text = await resp.text();
    const parsed = parseApiError(text);
    lastDetail = parsed.message ?? text.slice(0, 300) ?? "";
    if (!RETRYABLE_STATUSES.includes(resp.status)) {
      const label = describeStatus(resp.status, model) ?? `API error ${resp.status}`;
      onError(lastDetail ? `${label} (${lastDetail})` : label);
      return null;
    }
    if (attempt >= MAX_ATTEMPTS) {
      if (resp.status === 429) {
        onError(
          `Rate limited — ${MAX_ATTEMPTS} attempts exhausted. Free tier allows 10 requests/min and 100/day. Wait a moment and try again.` + (lastDetail ? ` (${lastDetail})` : "")
        );
      } else {
        onError(
          `Upstream error ${resp.status} on "${model}" after ${MAX_ATTEMPTS} attempts. This model's provider route is likely down — switch model in the extension settings.` + (lastDetail ? ` (${lastDetail})` : "")
        );
      }
      return null;
    }
    const waitMs = backoffMs(attempt, resp, parsed);
    const icon = resp.status === 429 ? "⏳" : "♻️";
    const what = resp.status === 429 ? "Rate limited" : `Upstream ${resp.status}`;
    onStatus(`${icon} ${what} — retrying in ${Math.round(waitMs / 1e3)}s… (${attempt}/${MAX_ATTEMPTS - 1})`);
    await sleep(waitMs);
  }
  onError(`Request failed after ${MAX_ATTEMPTS} attempts${lastDetail ? `: ${lastDetail}` : ""}`);
  return null;
}
async function readSSEStream(body, onChunk, onDone, onError) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line) => {
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (!data) return false;
    if (data === "[DONE]") {
      onDone();
      return true;
    }
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return false;
    }
    if (payload?.error) {
      onError(payload.error.message ?? `Stream error: ${JSON.stringify(payload.error)}`);
      return true;
    }
    const content = payload?.choices?.[0]?.delta?.content;
    if (content) onChunk(content);
    return Boolean(payload?.choices?.[0]?.finish_reason);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (handleLine(line)) return;
      }
    }
    if (buffer.trim() && handleLine(buffer)) return;
    onDone();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    reader.releaseLock();
  }
}
async function analyzeHand(gameState, stats, onChunk, onDone, onError, onStatus) {
  currentAbortController?.abort();
  currentAbortController = new AbortController();
  const settings = await getSettings();
  const apiKey = sanitizeApiKey(settings.openRouterApiKey);
  const keyProblem = apiKeyProblem(apiKey);
  if (keyProblem) {
    onError(keyProblem);
    return;
  }
  const { provider, url, headers, modelId } = resolveEndpointAndHeaders(
    apiKey,
    settings.model
  );
  const mismatch = modelProviderMismatch(provider, settings.model);
  if (mismatch) {
    onError(mismatch);
    return;
  }
  const { system, user } = buildPrompt(gameState, stats);
  try {
    const resp = await fetchStreamWithRetry(
      url,
      buildBody(provider, modelId, system, user, 600, 0.3),
      headers,
      modelId,
      currentAbortController.signal,
      onStatus,
      onError
    );
    if (!resp) return;
    if (!resp.body) {
      onError("No response body");
      return;
    }
    await readSSEStream(resp.body, onChunk, onDone, onError);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : String(err));
  }
}
async function analyzeExploit(target, gameState, onChunk, onDone, onError, onStatus) {
  currentAbortController?.abort();
  currentAbortController = new AbortController();
  const settings = await getSettings();
  const apiKey = sanitizeApiKey(settings.openRouterApiKey);
  const keyProblem = apiKeyProblem(apiKey);
  if (keyProblem) {
    onError(keyProblem);
    return;
  }
  const { provider, url, headers, modelId } = resolveEndpointAndHeaders(
    apiKey,
    settings.model
  );
  const mismatch = modelProviderMismatch(provider, settings.model);
  if (mismatch) {
    onError(mismatch);
    return;
  }
  const { system, user } = buildExploitPrompt(target, gameState);
  try {
    const resp = await fetchStreamWithRetry(
      url,
      buildBody(provider, modelId, system, user, 400, 0.25),
      headers,
      modelId,
      currentAbortController.signal,
      onStatus,
      onError
    );
    if (!resp) return;
    if (!resp.body) {
      onError("No response body");
      return;
    }
    await readSSEStream(resp.body, onChunk, onDone, onError);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    onError(err instanceof Error ? err.message : String(err));
  }
}
function cancelAnalysis() {
  currentAbortController?.abort();
  currentAbortController = null;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseRecommendedKind(actionLine) {
  const text = actionLine.toLowerCase();
  if (/all\s*-?\s*in/.test(text)) return "allin";
  let best = null;
  for (const kind of ["fold", "check", "call", "bet", "raise"]) {
    const at = text.search(new RegExp(`\\b${kind}`));
    if (at !== -1 && (best === null || at < best.at)) best = { kind, at };
  }
  return best?.kind ?? null;
}
let sidePanelPort = null;
let lastGameState = null;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    sidePanelPort = port;
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
    });
  }
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).catch(console.error);
  sendResponse({ ok: true });
  return true;
});
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});
async function handleMessage(msg) {
  switch (msg.type) {
    case "HAND_COMPLETE":
      lastGameState = msg.gameState;
      sendToSidePanel({ type: "GAME_STATE_UPDATE", gameState: msg.gameState });
      break;
    case "STATS_UPDATE":
    case "GAME_STATE_UPDATE":
    case "HERO_STATS_UPDATE":
    case "LOG_PULL_PROGRESS":
      sendToSidePanel(msg);
      break;
    case "AI_ANALYZE_REQUEST":
      if (!sidePanelPort) break;
      await runAnalysis(msg.gameState, msg.stats);
      break;
    case "EXPLOIT_REQUEST": {
      const exploitMsg = msg;
      const target = exploitMsg.stats[exploitMsg.playerId];
      if (!target) {
        sendToSidePanel({ type: "AI_STREAM_ERROR", error: "Player not found in stats" });
        break;
      }
      await runExploitAnalysis(target, lastGameState, exploitMsg.stats);
      break;
    }
    case "PULL_REQUEST": {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs.find((t) => t.url?.includes("pokernow.com"))?.id ?? tabs[0]?.id;
      if (!tabId) {
        sendToSidePanel({ type: "AI_STREAM_ERROR", error: "No active PokerNow tab found" });
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, msg);
        if (response?.gameState) {
          sendToSidePanel({ type: "PULL_RESPONSE", gameState: response.gameState });
        }
      } catch (e) {
        sendToSidePanel({
          type: "AI_STREAM_ERROR",
          error: `Pull failed: ${e instanceof Error ? e.message : String(e)}`
        });
      }
      break;
    }
    case "LOG_PULL_REQUEST": {
      const tabId = await findPokerNowTab();
      if (tabId == null) {
        sendToSidePanel({ type: "AI_STREAM_ERROR", error: "No PokerNow tab found" });
        return;
      }
      try {
        const res = await chrome.tabs.sendMessage(tabId, msg);
        sendToSidePanel({
          type: "LOG_PULL_RESULT",
          found: res?.found ?? 0,
          ingested: res?.ingested ?? 0
        });
      } catch (e) {
        sendToSidePanel({
          type: "AI_STREAM_ERROR",
          error: `Log pull failed: ${e instanceof Error ? e.message : String(e)}`
        });
      }
      break;
    }
  }
}
async function runAnalysis(gameState, stats) {
  cancelAnalysis();
  sendToSidePanel({ type: "AI_STREAM_START", label: "Analyzing hand…" });
  let answer = "";
  await analyzeHand(
    gameState,
    stats,
    (chunk) => {
      answer += chunk;
      sendToSidePanel({ type: "AI_STREAM_CHUNK", chunk });
    },
    () => {
      sendToSidePanel({ type: "AI_STREAM_DONE" });
      void highlightRecommendation(answer);
    },
    (error) => sendToSidePanel({ type: "AI_STREAM_ERROR", error }),
    (label) => sendToSidePanel({ type: "AI_STREAM_START", label })
    // retry status
  );
}
async function highlightRecommendation(answer) {
  const match = answer.match(/^\s*ACTION:\s*(.+)$/im);
  if (!match) return;
  const line = match[1].trim();
  const kind = parseRecommendedKind(line);
  if (!kind) return;
  const tabId = await findPokerNowTab();
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "AI_RECOMMENDATION", kind, line });
    console.log(`Highlighting recommendation: ${kind} — ${line}`);
  } catch {
  }
}
async function findPokerNowTab() {
  const tabs = await chrome.tabs.query({ url: "https://*.pokernow.com/*" });
  return tabs[0]?.id;
}
async function runExploitAnalysis(target, gameState, _stats) {
  cancelAnalysis();
  sendToSidePanel({ type: "AI_STREAM_START", label: `🎯 Exploit: ${target.displayName}` });
  await analyzeExploit(
    target,
    gameState,
    (chunk) => sendToSidePanel({ type: "AI_STREAM_CHUNK", chunk }),
    () => sendToSidePanel({ type: "AI_STREAM_DONE" }),
    (error) => sendToSidePanel({ type: "AI_STREAM_ERROR", error }),
    (label) => sendToSidePanel({ type: "AI_STREAM_START", label })
    // retry status
  );
}
function sendToSidePanel(msg) {
  if (sidePanelPort) {
    try {
      sidePanelPort.postMessage(msg);
    } catch {
      sidePanelPort = null;
    }
  }
}
//# sourceMappingURL=serviceWorker.js.map
