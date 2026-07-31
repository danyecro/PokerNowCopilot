import { c as cardToString, b as boardToString } from "./chunks/cardUtils.js";
import { d as MIN_HANDS_FOR_STATS, T as THRESHOLDS, M as MANUAL_LOG_PULL_HANDS, g as getSettings, s as setSettings, S as STORAGE_KEYS } from "./chunks/storage.js";
function getBadgeColor(stats) {
  if (stats.handsSeen < MIN_HANDS_FOR_STATS) return "gray";
  const isAggressive = stats.vpip > THRESHOLDS.VPIP_LOOSE / 100 && stats.af > THRESHOLDS.AF_AGGRESSIVE;
  const isTight = stats.vpip < THRESHOLDS.VPIP_TIGHT / 100;
  const isCallingStation = stats.vpip > THRESHOLDS.VPIP_LOOSE / 100 && stats.af < THRESHOLDS.AF_PASSIVE;
  if (isAggressive) return "red";
  if (isTight) return "blue";
  if (isCallingStation) return "yellow";
  return "gray";
}
const FOLD_TO_CBET_THRESHOLD = 0.55;
const AF_MANIAC = 3.5;
const VPIP_FISH = 0.42;
const SPR_LOW = 3;
const SPR_HIGH = 12;
function computeEdgeHints(gameState, stats) {
  const hints = [];
  const hero = gameState.seats.find((s) => s.isHero);
  const actives = gameState.seats.filter((s) => !s.isHero && s.isActive && !s.hasFolded);
  if (!hero) return hints;
  if (hero.position) {
    const latePositions = ["BTN", "CO", "HJ"];
    if (latePositions.includes(hero.position)) {
      hints.push({ type: "positive", icon: "📍", text: `In position (${hero.position}) — play wider, control pot size` });
    } else if (hero.position === "BTN") {
      hints.push({ type: "positive", icon: "🎯", text: "Button — maximum positional advantage" });
    } else if (["SB", "BB"].includes(hero.position)) {
      hints.push({ type: "neutral", icon: "📍", text: `Out of position (${hero.position}) — tighten range, play fit-or-fold` });
    }
  }
  if (gameState.pot > 0 && hero.stack > 0) {
    const spr = hero.stack / gameState.pot;
    if (spr < SPR_LOW) {
      hints.push({ type: "warning", icon: "⚠️", text: `Low SPR ${spr.toFixed(1)} — commit or fold, no more implied odds` });
    } else if (spr > SPR_HIGH) {
      hints.push({ type: "info", icon: "📊", text: `Deep SPR ${spr.toFixed(1)} — speculative hands gain value` });
    }
  }
  for (const opp of actives) {
    const s = stats[opp.playerId];
    if (!s || s.handsSeen < MIN_HANDS_FOR_STATS) continue;
    if (s.foldToCbet > FOLD_TO_CBET_THRESHOLD && s.counters.cbetOpp >= 5) {
      hints.push({
        type: "positive",
        icon: "💰",
        text: `${opp.displayName} folds to CBet ${Math.round(s.foldToCbet * 100)}% — fire the flop`
      });
    }
    if (s.tags.includes("Calling station")) {
      hints.push({
        type: "info",
        icon: "🎣",
        text: `${opp.displayName} is a calling station — skip bluffs, bet thin value`
      });
    }
    if (s.tags.includes("Bombs river") && gameState.street === "river") {
      const riverBet = opp.currentBet;
      if (riverBet > gameState.pot * 0.5) {
        hints.push({
          type: "warning",
          icon: "💣",
          text: `${opp.displayName} bombs river with strong hands — this big bet is likely not a bluff`
        });
      } else {
        hints.push({
          type: "warning",
          icon: "💣",
          text: `${opp.displayName} bombs rivers — be cautious if they overbbet`
        });
      }
    }
    if (s.tags.includes("Slowplays monsters")) {
      hints.push({
        type: "warning",
        icon: "🐢",
        text: `${opp.displayName} slowplays — flat-calls often mean strong hand, not weakness`
      });
    }
    if (s.af > AF_MANIAC && s.handsSeen >= 10) {
      hints.push({
        type: "positive",
        icon: "🎭",
        text: `${opp.displayName} is aggressive (AF ${s.af.toFixed(1)}) — look for spots to trap`
      });
    }
    if (s.vpip > VPIP_FISH && s.pfr < 0.12 && s.handsSeen >= 10) {
      hints.push({
        type: "info",
        icon: "🐟",
        text: `${opp.displayName} plays wide and passive — charge them to see turns/rivers`
      });
    }
  }
  if (gameState.pot > 0) {
    const heroFacing = hero.currentBet === 0 ? actives.reduce((max, s) => Math.max(max, s.currentBet), 0) : 0;
    if (heroFacing > 0) {
      const odds = heroFacing / (gameState.pot + heroFacing);
      hints.push({
        type: "neutral",
        icon: "🧮",
        text: `Pot odds: need ${Math.round(odds * 100)}% equity to call (call ${heroFacing} into ${gameState.pot})`
      });
    }
  }
  if (actives.length >= 3) {
    hints.push({
      type: "warning",
      icon: "👥",
      text: `${actives.length} opponents — bluffing EV drops, tighten value threshold`
    });
  }
  return hints;
}
const RANK_VAL = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "T": 10,
  "J": 11,
  "Q": 12,
  "K": 13,
  "A": 14
};
const B = 15;
const CAT = B ** 5;
function evaluateBest(cards) {
  const n = cards.length;
  if (n <= 5) return eval5(cards);
  let best = 0;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (s > best) best = s;
          }
  return best;
}
function eval5(hand) {
  const ranks = hand.map((c) => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = hand.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  let isStraight = false, strHigh = 0;
  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      strHigh = ranks[0];
    } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) {
      isStraight = true;
      strHigh = 5;
    }
  }
  if (isFlush && isStraight) return sc(8, [strHigh]);
  const cnt = {};
  for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
  const gs = Object.entries(cnt).map(([r, c]) => ({ r: +r, c })).sort((a, b) => b.c - a.c || b.r - a.r);
  const top = gs[0].c;
  if (top === 4) return sc(7, [gs[0].r, gs[1].r]);
  if (top === 3 && gs[1].c === 2) return sc(6, [gs[0].r, gs[1].r]);
  if (isFlush) return sc(5, ranks);
  if (isStraight) return sc(4, [strHigh]);
  if (top === 3) return sc(3, [gs[0].r, gs[1].r, gs[2].r]);
  if (top === 2 && gs[1].c === 2) return sc(2, [gs[0].r, gs[1].r, gs[2].r]);
  if (top === 2) return sc(1, [gs[0].r, gs[1].r, gs[2].r, gs[3].r]);
  return sc(0, ranks);
}
function sc(cat, vals) {
  let s = cat * CAT;
  for (let i = 0; i < 5; i++) s += (vals[i] || 0) * B ** (4 - i);
  return s;
}
const SUITS = ["h", "d", "c", "s"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
function buildDeck(exclude) {
  const ex = new Set(exclude.map((c) => c.rank + c.suit));
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      if (!ex.has(rank + suit)) deck.push({ rank, suit });
  return deck;
}
function shuffleFirst(deck, n) {
  const len = deck.length;
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (len - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}
function calcEquity(heroCards, board, numOpponents = 1, simulations = 900) {
  const known = [...heroCards, ...board];
  const deck = buildDeck(known);
  const boardNeeded = 5 - board.length;
  const cardsPerSim = numOpponents * 2 + boardNeeded;
  let wins = 0, ties = 0;
  for (let i = 0; i < simulations; i++) {
    shuffleFirst(deck, cardsPerSim);
    let pos = 0;
    const oppHands = [];
    for (let j = 0; j < numOpponents; j++) {
      oppHands.push([deck[pos++], deck[pos++]]);
    }
    const fullBoard = [...board, ...deck.slice(pos, pos + boardNeeded)];
    const heroScore = evaluateBest([...heroCards, ...fullBoard]);
    let maxOpp = 0, tieCount = 0;
    for (const opp of oppHands) {
      const s = evaluateBest([...opp, ...fullBoard]);
      if (s > maxOpp) {
        maxOpp = s;
        tieCount = 1;
      } else if (s === maxOpp) tieCount++;
    }
    if (heroScore > maxOpp) wins++;
    else if (heroScore === maxOpp) ties += 1 / (tieCount + 1);
  }
  return (wins + ties) / simulations;
}
let port = null;
let currentStats = {};
let currentHeroStats = null;
let currentGameState = null;
let aiBuffer = "";
let analyzing = false;
let totalHands = 0;
function connect() {
  port = chrome.runtime.connect({ name: "sidepanel" });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 1e3);
  });
}
function onMessage(msg) {
  switch (msg.type) {
    case "STATS_UPDATE":
      currentStats = msg.stats;
      totalHands = Math.max(0, ...Object.values(msg.stats).map((s) => s.handsSeen));
      renderOpponents();
      renderEdgeHints();
      break;
    case "HERO_STATS_UPDATE":
      currentHeroStats = msg.stats;
      renderHeroStats();
      break;
    case "GAME_STATE_UPDATE":
    case "PULL_RESPONSE":
      currentGameState = msg.gameState;
      renderHandBar();
      renderEdgeHints();
      renderOpponents();
      unlockPullButtons();
      if (analyzeAfterPull) {
        analyzeAfterPull = false;
        if (pullTimeout) {
          clearTimeout(pullTimeout);
          pullTimeout = null;
        }
        requestAnalysis();
      }
      break;
    case "LOG_PULL_RESULT": {
      if (logPullTimeout) {
        clearTimeout(logPullTimeout);
        logPullTimeout = null;
      }
      setLogPulling(false);
      setStatus(
        msg.found === 0 ? "No completed hand in the log yet." : msg.ingested === 0 ? `Log: ${msg.found} hands — all already counted.` : `Log: +${msg.ingested} new of ${msg.found} hands.`
      );
      setTimeout(() => {
        if (!analyzing) setStatus("");
      }, 5e3);
      break;
    }
    case "AI_STREAM_START": {
      const output = document.getElementById("ai-output");
      if (output) output.textContent = "";
      aiBuffer = "";
      setAnalyzing(true);
      setStatus(msg.label ?? "Streaming…", "streaming");
      break;
    }
    case "AI_STREAM_CHUNK":
      appendAiChunk(msg.chunk);
      break;
    case "AI_STREAM_DONE":
      setAnalyzing(false);
      setStatus("");
      break;
    case "AI_STREAM_ERROR":
      if (logPullTimeout) {
        clearTimeout(logPullTimeout);
        logPullTimeout = null;
      }
      setLogPulling(false);
      setAnalyzing(false);
      setStatus(msg.error, "error");
      break;
  }
}
document.querySelectorAll(".pull-btn[data-pull]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset["pull"];
    btn.classList.add("pulling");
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: "PULL_REQUEST", target });
    setTimeout(() => {
      btn.classList.remove("pulling");
      btn.disabled = false;
    }, 3e3);
  });
});
function unlockPullButtons() {
  document.querySelectorAll(".pull-btn[data-pull]").forEach((b) => {
    b.classList.remove("pulling");
    b.disabled = false;
  });
}
const logBtn = document.getElementById("btn-pull-log");
let logPullTimeout = null;
function setLogPulling(on) {
  if (!logBtn) return;
  logBtn.disabled = on;
  logBtn.classList.toggle("pulling", on);
  logBtn.textContent = on ? "📜 …" : `📜 Log ${MANUAL_LOG_PULL_HANDS}`;
}
logBtn?.addEventListener("click", () => {
  setLogPulling(true);
  setStatus(`Reading the table log (${MANUAL_LOG_PULL_HANDS} hands)…`, "streaming");
  chrome.runtime.sendMessage({
    type: "LOG_PULL_REQUEST",
    minHands: MANUAL_LOG_PULL_HANDS
  });
  if (logPullTimeout) clearTimeout(logPullTimeout);
  logPullTimeout = setTimeout(() => {
    setLogPulling(false);
    setStatus("Log pull timed out — is the PokerNow tab still open?", "error");
  }, 25e3);
});
function renderHandBar() {
  const gs = currentGameState;
  if (!gs) return;
  setText("val-hero-cards", gs.heroCards ? `${cardToString(gs.heroCards[0])} ${cardToString(gs.heroCards[1])}` : "—");
  setText("val-board", gs.board.length > 0 ? boardToString(gs.board) : "—");
  setText("val-pot", gs.pot > 0 ? String(gs.pot) : "—");
  setText("val-street", gs.street);
  renderEquity(gs);
}
function renderEquity(gs) {
  const el = document.getElementById("val-equity");
  if (!el) return;
  if (!gs.heroCards) {
    el.textContent = "—";
    el.className = "equity-value";
    return;
  }
  const isPreflop = gs.board.length === 0;
  const numOpponents = isPreflop ? 1 : Math.max(1, gs.seats.filter((s) => !s.isHero && s.isActive && !s.hasFolded).length);
  const eq = calcEquity(gs.heroCards, gs.board, numOpponents);
  const pct = Math.round(eq * 100);
  const label = isPreflop ? `${pct}% HU` : `${pct}% vs${numOpponents}`;
  el.textContent = label;
  el.className = "equity-value " + (pct > 55 ? "eq-good" : pct < 40 ? "eq-bad" : "eq-neutral");
}
function renderEdgeHints() {
  const el = document.getElementById("edge-list");
  if (!el) return;
  if (!currentGameState) {
    el.innerHTML = '<span class="placeholder">Pull the table state to see edge hints.</span>';
    return;
  }
  const hints = computeEdgeHints(currentGameState, currentStats);
  if (hints.length === 0) {
    el.innerHTML = '<span class="placeholder">No specific edges detected — play standard.</span>';
    return;
  }
  el.innerHTML = hints.map(
    (h) => `<div class="edge-hint ${h.type}"><span class="edge-icon">${h.icon}</span><span>${esc(h.text)}</span></div>`
  ).join("");
}
function renderOpponents() {
  const list = document.getElementById("opponent-list");
  const label = document.getElementById("hands-seen-label");
  if (!list) return;
  if (label) label.textContent = totalHands > 0 ? `(${totalHands} hands)` : "";
  const seated = (currentGameState?.seats ?? []).filter((s) => !s.isHero);
  const atTableIds = new Set(seated.map((s) => s.playerId));
  const opponents = [
    ...seated.map((s) => currentStats[s.playerId] ?? { ...emptyRow(s.playerId, s.displayName) }),
    ...Object.values(currentStats).filter((s) => !atTableIds.has(s.playerId))
  ];
  if (opponents.length === 0) {
    list.innerHTML = '<span class="placeholder" style="padding:6px 10px">Open a PokerNow table — seated players appear here.</span>';
    return;
  }
  const seatedCount = seated.length;
  const history = opponents.slice(seatedCount).sort((a, b) => b.handsSeen - a.handsSeen);
  opponents.length = seatedCount;
  opponents.push(...history);
  let lastWasAtTable = true;
  list.innerHTML = opponents.map((s) => {
    const isAtTable = atTableIds.has(s.playerId);
    let separator = "";
    if (lastWasAtTable && !isAtTable && atTableIds.size > 0) {
      separator = `<div class="opp-separator">── history ──</div>`;
    }
    lastWasAtTable = isAtTable;
    const color = getBadgeColor(s);
    const dot = colorToCss(color);
    const hasData = s.handsSeen >= 3;
    if (!hasData) return `${separator}
      <div class="opp-row no-data">
        <div class="opp-name"><span class="opp-color-dot" style="background:${dot}"></span>${esc(s.displayName)}</div>
        <div class="opp-stats">n=${s.handsSeen} — collecting</div>
        <div></div>
      </div>`;
    const v = Math.round(s.vpip * 100), p = Math.round(s.pfr * 100);
    const tb = Math.round(s.threeBet * 100), fc = Math.round(s.foldToCbet * 100);
    const af = s.af.toFixed(1);
    const vC = v > 42 ? "call" : v < 20 ? "cold" : "";
    const pC = p > 25 ? "hot" : "";
    const afC = parseFloat(af) > 3 ? "hot" : "";
    const tags = s.tags.slice(0, 2).join(" · ");
    return `${separator}<div class="opp-row${isAtTable ? " at-table" : ""}">
      <div class="opp-name"><span class="opp-color-dot" style="background:${dot}"></span>${esc(s.displayName)}</div>
      <div class="opp-stats">
        <div class="opp-stat-row">
          <span class="stat-chip ${vC}" title="VPIP">V${v}%</span>
          <span class="stat-chip ${pC}" title="PFR">P${p}%</span>
          <span class="stat-chip" title="3Bet">3B${tb}%</span>
          <span class="stat-chip ${afC}" title="Aggression Factor">AF${af}</span>
          <span class="stat-chip" title="Fold to CBet">F↳${fc}%</span>
        </div>
        ${tags ? `<div class="opp-tags">${esc(tags)}</div>` : ""}
      </div>
      <div class="opp-n">n=${s.handsSeen}</div>
    </div>`;
  }).join("");
}
function renderHeroStats() {
  const el = document.getElementById("hero-stats-content");
  if (!el) return;
  const s = currentHeroStats;
  if (!s || s.handsSeen < 1) {
    el.innerHTML = '<span class="placeholder">Play hands to track your own stats.</span>';
    return;
  }
  const v = Math.round(s.vpip * 100), p = Math.round(s.pfr * 100);
  const tb = Math.round(s.threeBet * 100), fc = Math.round(s.foldToCbet * 100);
  const af = s.af.toFixed(1);
  el.innerHTML = `
    <div class="hero-stat-row">
      <span class="stat-chip" title="VPIP">V:${v}%</span>
      <span class="stat-chip" title="PFR">P:${p}%</span>
      <span class="stat-chip" title="3Bet">3B:${tb}%</span>
      <span class="stat-chip" title="AF">AF:${af}</span>
      <span class="stat-chip" title="Fold to CBet">F↳:${fc}%</span>
      <span class="stat-chip" style="color:#6b7280">n=${s.handsSeen}</span>
    </div>
    ${s.tags.length ? `<div class="opp-tags" style="margin-top:3px">You: ${esc(s.tags.join(" · "))}</div>` : ""}
  `;
}
function appendAiChunk(chunk) {
  const output = document.getElementById("ai-output");
  if (!output) return;
  aiBuffer += chunk;
  output.textContent = aiBuffer;
  setStatus("Streaming…", "streaming");
  output.scrollTop = output.scrollHeight;
}
let analyzeAfterPull = false;
let pullTimeout = null;
document.getElementById("btn-analyze")?.addEventListener("click", () => {
  if (analyzing) return;
  const output = document.getElementById("ai-output");
  if (output) output.textContent = "";
  aiBuffer = "";
  setAnalyzing(true);
  setStatus("Reading table…", "streaming");
  analyzeAfterPull = true;
  chrome.runtime.sendMessage({ type: "PULL_REQUEST", target: "all" });
  if (pullTimeout) clearTimeout(pullTimeout);
  pullTimeout = setTimeout(() => {
    if (!analyzeAfterPull) return;
    analyzeAfterPull = false;
    if (currentGameState) {
      requestAnalysis();
    } else {
      setAnalyzing(false);
      setStatus("No table state — open a PokerNow table and try again.", "error");
    }
  }, 4e3);
});
function requestAnalysis() {
  if (!currentGameState) return;
  setAnalyzing(true);
  setStatus("Requesting analysis…", "streaming");
  chrome.runtime.sendMessage({
    type: "AI_ANALYZE_REQUEST",
    gameState: currentGameState,
    stats: currentStats
  });
}
document.getElementById("btn-settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
const autoBtn = document.getElementById("btn-auto");
function paintAutoBtn(on) {
  if (!autoBtn) return;
  autoBtn.setAttribute("aria-pressed", String(on));
  autoBtn.title = on ? "Auto-analyze ON — runs on every street change. Click to turn off." : "Auto-analyze OFF — click to analyze automatically on every street change.";
}
autoBtn?.addEventListener("click", async () => {
  autoBtn.disabled = true;
  try {
    const settings = await getSettings();
    const next = !settings.autoAnalyze;
    await setSettings({ ...settings, autoAnalyze: next });
    paintAutoBtn(next);
    setStatus(next ? "Auto-analyze on — every street." : "Auto-analyze off.");
    setTimeout(() => {
      if (!analyzing) setStatus("");
    }, 2500);
  } finally {
    autoBtn.disabled = false;
  }
});
const afkSelect = document.getElementById("afk-mode");
const afkBar = document.getElementById("afk-bar");
function paintAfk(mode) {
  if (afkSelect) afkSelect.value = mode;
  afkBar?.classList.toggle("armed", mode !== "off");
  const state = document.getElementById("afk-state");
  if (state) state.textContent = mode === "off" ? "" : "● ARMED";
}
afkSelect?.addEventListener("change", async () => {
  const mode = afkSelect.value;
  const settings = await getSettings();
  await setSettings({ ...settings, afkMode: mode });
  paintAfk(mode);
  setStatus(
    mode === "off" ? "AFK off." : mode === "fold" ? "AFK armed: folds every hand. Any key at the table cancels." : "AFK armed: checks when free, folds to a bet. Any key at the table cancels."
  );
  setTimeout(() => {
    if (!analyzing) setStatus("");
  }, 4e3);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const next = changes[STORAGE_KEYS.SETTINGS]?.newValue;
  if (!next) return;
  paintAutoBtn(Boolean(next.autoAnalyze));
  paintAfk(next.afkMode ?? "off");
});
getSettings().then((s) => {
  paintAutoBtn(s.autoAnalyze);
  paintAfk(s.afkMode);
}).catch(console.error);
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setStatus(msg, type = "") {
  const el = document.getElementById("ai-status");
  if (!el) return;
  el.textContent = msg;
  el.className = type;
}
function setAnalyzing(on) {
  analyzing = on;
  const btn = document.getElementById("btn-analyze");
  if (btn) {
    btn.disabled = on;
    btn.textContent = on ? "Analyzing…" : "Analyze moves";
  }
}
function emptyRow(playerId, displayName) {
  return {
    playerId,
    displayName,
    handsSeen: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    foldToCbet: 0,
    af: 0,
    counters: {
      vpipOpp: 0,
      vpipAct: 0,
      pfrOpp: 0,
      pfrAct: 0,
      threeBetOpp: 0,
      threeBetAct: 0,
      cbetOpp: 0,
      cbetFold: 0,
      bets: 0,
      raises: 0,
      calls: 0
    },
    showdownRanges: [],
    tags: [],
    lastUpdated: 0
  };
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function colorToCss(color) {
  return { red: "#e74c3c", blue: "#3498db", yellow: "#f1c40f", gray: "#6b7280" }[color] ?? "#6b7280";
}
connect();
//# sourceMappingURL=sidepanel.js.map
