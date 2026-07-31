(function() {
  "use strict";
  const SEL = {
    // ── Root ─────────────────────────────────────────────────
    GAME_ROOT: ".game-main-container.two-color",
    // ── Pot & Blinds ─────────────────────────────────────────
    POT_VALUE: ".table-pot-size .normal-value",
    BLIND_VALUES: ".blind-value .normal-value",
    // [0]=SB, [1]=BB
    // ── Board ────────────────────────────────────────────────
    BOARD: ".table-cards",
    BOARD_CARDS: ".table-cards .card-container.flipped",
    CARD_VALUE: "span.value",
    // within .card-container
    CARD_SUIT: "span.suit:not(.sub-suit)",
    // within .card-container
    // ── Dealer ───────────────────────────────────────────────
    // extract seat number via /dealer-position-(\d+)/ from className
    DEALER_BUTTON: ".dealer-button-ctn",
    // ── Seats ────────────────────────────────────────────────
    SEATS: ".seats",
    ALL_PLAYERS: ".table-player",
    HERO: ".table-player.you-player",
    // ── Per-seat elements ────────────────────────────────────
    // href="/players/{stableId}" — use as cross-session key
    PLAYER_NAME_LINK: ".table-player-name a",
    PLAYER_STACK: ".table-player-stack .normal-value",
    // only in DOM when player has active bet > 0
    PLAYER_BET: ".table-player-bet-value .normal-value",
    PLAYER_STATUS: "p.table-player-status-icon",
    PLAYER_WIN_COUNT: ".win-count.signal.numbers-signal",
    // ── Cards ────────────────────────────────────────────────
    HERO_CARDS: ".you-player .table-player-cards .card-container",
    OPPONENT_CARDS: ".table-player:not(.you-player) .table-player-cards .card-container",
    // ── Log modal (NOT in DOM when closed — must be opened programmatically) ─
    LOG_OPEN_BUTTON: ".log-button-container .show-log-button",
    LOG_MODAL: ".modal.log-modal",
    LOG_ENTRIES: ".log-modal-entries",
    LOG_ENTRY: ".log-modal-entries .entry-ctn",
    LOG_ENTRY_CONTENT: "p.content",
    LOG_CLOSE_BUTTON: ".modal-button-close",
    // The log shows ONE hand per page. Paging is the only way back in history —
    // the entry list itself does not scroll into older hands.
    // Labels: "« Hand #304" (newer) and "Hand #302 »" (older).
    LOG_PAGINATION_BUTTON: ".log-modal-controls .pagination-button",
    // ── Hero action buttons ──────────────────────────────────
    // The whole .action-buttons block only exists while it is hero's turn; the
    // buttons carry the legal actions and their sizings ("Call 20").
    HERO_DECISION: ".table-player.you-player.decision-current",
    ACTION_BUTTONS: ".action-buttons",
    ACTION_BUTTON: ".action-buttons button.action-button",
    ACTION_SIGNAL: ".action-buttons .action-signal",
    // ── Player notes popover (opens on seat click) ────────────
    NOTES_POPOVER: ".player-controls-popover",
    NOTES_TEXTAREA: ".player-notes textarea",
    NOTE_COLOR_BUTTONS: ".player-note-colors .player-note-color"
  };
  function healthCheck() {
    const gameRoot = document.querySelector(SEL.GAME_ROOT);
    if (!gameRoot) {
      console.warn("[PokerNow Copilot] GAME_ROOT not found — not on a live game page");
      return false;
    }
    const checks = [
      ["SEATS", SEL.SEATS],
      ["POT_VALUE", SEL.POT_VALUE],
      ["LOG_OPEN_BUTTON", SEL.LOG_OPEN_BUTTON]
    ];
    let ok = true;
    for (const [name, selector] of checks) {
      if (!document.querySelector(selector)) {
        console.warn(`[PokerNow Copilot] Selector missing: ${name} (${selector})`);
        ok = false;
      }
    }
    return ok;
  }
  const DEFAULT_MODEL = "inclusionai/ling-3.0-flash:free";
  const AVAILABLE_MODELS = [
    // ── OpenRouter FREE (key: sk-or-...) — catalog checked 2026-07-27 ─────────
    // Excluded from the live free list on purpose:
    //   google/gemma-4-31b-it:free            90% of requests rate-limited (11k ok / 103k limited per day)
    //   poolside/laguna-s-2.1:free            31% rate-limited
    //   poolside/laguna-m.1:free              deprecation_date 2026-07-28
    //   poolside/laguna-xs-2.1:free           agentic-coding model, wrong fit
    //   nvidia/nemotron-nano-12b-v2-vl:free   endpoint status -2 (deranked)
    //   nvidia/nemotron-3.5-content-safety    guardrail classifier, not a chat model
    //   *-embed-*, *-rerank-*                 embeddings/rerank endpoints
    { id: "inclusionai/ling-3.0-flash:free", label: "⭐ Ling 3.0 Flash (Free, Fastest)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B (Free, Smartest)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (Free)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B (Free, no reasoning)", provider: "openrouter" },
    { id: "nvidia/nemotron-3-nano-30b-a3b:free", label: "Nemotron 3 Nano 30B (Free, lowest TTFB)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (Free)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B v2 (Free)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "cohere/north-mini-code:free", label: "North Mini Code (Free, 15 req/min)", provider: "openrouter", reasoningDefaultOn: true },
    { id: "openrouter/free", label: "Free Models Router (random free model)", provider: "openrouter" },
    // ── Naga free tier — key prefix "ng-"; 10 req/min, 100 req/day ────────────
    // docs.naga.ac/build/rate-limits
    { id: "llama-3.3-70b-instruct:free", label: "⭐ Llama 3.3 70B (Free via Naga)", provider: "naga" },
    { id: "nemotron-3-super-120b-a12b:free", label: "Nemotron Super 120B (Free via Naga)", provider: "naga" },
    // Perplexity route behind Naga's proxy. Verified 2026-07-27: returns 503
    // "upstream source" for every request shape. Kept selectable because the
    // route has worked before and may recover — the retry logic and the explicit
    // 503 message in aiClient handle it while it is down.
    { id: "sonar:free", label: "Sonar (Free via Naga) — upstream flaky", provider: "naga" },
    // ── OpenRouter PAID (key: sk-or-...) ─────────────────────────────────────
    // NOTE: the old 'anthropic/claude-sonnet-4-5' id used the wrong slug shape;
    // OpenRouter's own traffic data lists 'anthropic/claude-sonnet-5-20260630'.
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 (Paid)", provider: "openrouter" },
    { id: "openai/gpt-4o", label: "GPT-4o via OpenRouter (Paid)", provider: "openrouter" }
  ];
  const RETIRED_MODELS = {
    // Naga (bare ids)
    "llama-4-scout-17b-16e-instruct:free": "llama-3.3-70b-instruct:free",
    "nemotron-3-ultra-550b-a55b:free": "nemotron-3-super-120b-a12b:free",
    // OpenRouter (vendor-prefixed ids) — gone from the free catalog as of 2026-07-27
    "nousresearch/hermes-3-llama-3.1-405b:free": "inclusionai/ling-3.0-flash:free",
    "meta-llama/llama-3.3-70b-instruct:free": "inclusionai/ling-3.0-flash:free",
    "moonshotai/kimi-k2.6:free": "inclusionai/ling-3.0-flash:free",
    "qwen/qwen3-next-80b-a3b-instruct:free": "inclusionai/ling-3.0-flash:free",
    "openai/gpt-oss-120b:free": "openai/gpt-oss-20b:free",
    "meta-llama/llama-3.2-3b-instruct:free": "nvidia/nemotron-3-nano-30b-a3b:free",
    "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-5"
  };
  function isKnownModel(id) {
    return AVAILABLE_MODELS.some((m) => m.id === id);
  }
  const THRESHOLDS = {
    VPIP_TIGHT: 20,
    VPIP_LOOSE: 40,
    AF_PASSIVE: 1.5,
    AF_AGGRESSIVE: 3.5
  };
  const MIN_HANDS_FOR_STATS = 5;
  const MIN_HANDS_FOR_TAGS = 10;
  const HAND_END_DEBOUNCE_MS = 600;
  const LOG_MODAL_TIMEOUT_MS = 3e3;
  const STORAGE_KEYS = {
    SETTINGS: "copilot_settings",
    ALL_PLAYER_STATS: "copilot_player_stats",
    HERO_STATS: "copilot_hero_stats"
  };
  const SUIT_SYMBOL_MAP = {
    "♥": "h",
    "♦": "d",
    "♣": "c",
    "♠": "s"
  };
  const RANK_NORMALIZE = {
    "10": "T",
    "T": "T",
    "J": "J",
    "Q": "Q",
    "K": "K",
    "A": "A",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9"
  };
  function parseCard(raw) {
    const match = raw.trim().match(/^(\d{1,2}|[TJQKA])([♥♦♣♠])$/);
    if (!match) return null;
    const rank = RANK_NORMALIZE[match[1]];
    const suit = SUIT_SYMBOL_MAP[match[2]];
    if (!rank || !suit) return null;
    return { rank, suit };
  }
  function parseCards(raw) {
    const cleaned = raw.replace(/[\[\]]/g, "");
    return cleaned.split(",").map((s) => parseCard(s.trim())).filter((c) => c !== null);
  }
  const DIRECT_SUITS = /* @__PURE__ */ new Set(["h", "d", "c", "s"]);
  function cardFromDom(el) {
    const cardFace = el.querySelector(".card") ?? el;
    const valueEl = cardFace.querySelector("span.value");
    const suitEl = cardFace.querySelector("span.suit:not(.sub-suit)");
    if (!valueEl || !suitEl) return null;
    const rankRaw = valueEl.textContent?.trim() ?? "";
    const suitRaw = suitEl.textContent?.trim() ?? "";
    const rank = RANK_NORMALIZE[rankRaw];
    const suit = DIRECT_SUITS.has(suitRaw) ? suitRaw : SUIT_SYMBOL_MAP[suitRaw];
    if (!rank || !suit) return null;
    return { rank, suit };
  }
  const KIND_CLASSES = ["fold", "check", "call", "raise", "bet", "allin"];
  function isHeroTurn(root = document) {
    return root.querySelector(SEL.HERO_DECISION) !== null;
  }
  function classifyButton(btn) {
    for (const kind of KIND_CLASSES) {
      if (btn.classList.contains(kind)) return kind;
    }
    const text = btn.textContent?.toLowerCase() ?? "";
    if (/all\s*-?\s*in/.test(text)) return "allin";
    return null;
  }
  function parseAmount(label) {
    const match = label.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    if (!match) return void 0;
    const n = parseFloat(match[1]);
    return Number.isFinite(n) ? n : void 0;
  }
  function readAvailableActions(root = document) {
    const options = [];
    root.querySelectorAll(SEL.ACTION_BUTTON).forEach((btn) => {
      const kind = classifyButton(btn);
      if (!kind) return;
      const label = btn.textContent?.trim() ?? "";
      const amount = parseAmount(label);
      options.push({
        kind,
        label,
        ...amount !== void 0 ? { amount } : {},
        disabled: btn.disabled
      });
    });
    return options;
  }
  const HIGHLIGHT_CLASS = "copilot-suggested";
  const STYLE_ID = "copilot-action-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #34d399 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 12px rgba(52, 211, 153, 0.9) !important;
      animation: copilot-pulse 1.2s ease-in-out infinite;
    }
    @keyframes copilot-pulse {
      0%, 100% { outline-color: #34d399; }
      50%      { outline-color: #a7f3d0; }
    }
  `;
    document.head.appendChild(style);
  }
  function clearActionHighlight(root = document) {
    root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
  }
  function findActionButton(kind, root = document) {
    const match = Array.from(root.querySelectorAll(SEL.ACTION_BUTTON)).find(
      (btn) => !btn.disabled && classifyButton(btn) === kind
    );
    return match ?? null;
  }
  function highlightAction(kind, root = document) {
    ensureStyle();
    clearActionHighlight(root);
    const match = findActionButton(kind, root);
    if (!match) return false;
    match.classList.add(HIGHLIGHT_CLASS);
    return true;
  }
  function extractPlayerId(playerEl) {
    const link = playerEl.querySelector(SEL.PLAYER_NAME_LINK);
    return link?.getAttribute("href")?.split("/").pop() ?? "";
  }
  function extractDisplayName(playerEl) {
    const link = playerEl.querySelector(SEL.PLAYER_NAME_LINK);
    return link?.textContent?.trim() ?? "";
  }
  function extractNumber(el, selector) {
    const valueEl = el ? el.querySelector(selector) : document.querySelector(selector);
    const text = valueEl?.textContent?.trim().replace(/,/g, "") ?? "0";
    return parseFloat(text) || 0;
  }
  function readCards(containerEl, selector) {
    if (!containerEl) return [];
    const cards = [];
    containerEl.querySelectorAll(selector).forEach((el) => {
      const card = cardFromDom(el);
      if (card) cards.push(card);
    });
    return cards;
  }
  function detectStreet(boardCards) {
    if (boardCards.length === 0) return "preflop";
    if (boardCards.length === 3) return "flop";
    if (boardCards.length === 4) return "turn";
    return "river";
  }
  function extractDealerSeat() {
    const btn = document.querySelector(SEL.DEALER_BUTTON);
    if (!btn) return void 0;
    const match = btn.className.match(/dealer-position-(\d+)/);
    return match ? parseInt(match[1]) : void 0;
  }
  function snapshotGameState() {
    const blindEls = document.querySelectorAll(SEL.BLIND_VALUES);
    const smallBlind = parseFloat(blindEls[0]?.textContent?.trim() ?? "0") || 0;
    const bigBlind = parseFloat(blindEls[1]?.textContent?.trim() ?? "0") || 0;
    const boardCards = readCards(document, SEL.BOARD_CARDS);
    const street = detectStreet(boardCards);
    const heroEl = document.querySelector(SEL.HERO);
    const heroCards = heroEl ? (() => {
      const cards = readCards(heroEl, ".table-player-cards .card-container");
      return cards.length === 2 ? [cards[0], cards[1]] : void 0;
    })() : void 0;
    const pot = extractNumber(null, SEL.POT_VALUE);
    const buttonSeat = extractDealerSeat();
    const seats = [];
    const nameToIdMap2 = {};
    document.querySelectorAll(SEL.ALL_PLAYERS).forEach((playerEl) => {
      const playerId = extractPlayerId(playerEl);
      const displayName = extractDisplayName(playerEl);
      if (!playerId || !displayName) return;
      nameToIdMap2[displayName] = playerId;
      const seatMatch = playerEl.className.match(/table-player-(\d+)/);
      const seatIndex = seatMatch ? parseInt(seatMatch[1]) : 0;
      const isHero = playerEl.classList.contains("you-player");
      const hasFolded = playerEl.classList.contains("fold");
      const stack = extractNumber(playerEl, SEL.PLAYER_STACK);
      const currentBet = extractNumber(playerEl, SEL.PLAYER_BET);
      seats.push({
        playerId,
        displayName,
        seatIndex,
        stack,
        currentBet,
        isHero,
        isActive: !hasFolded,
        hasFolded
      });
    });
    const toActEl = document.querySelector(".table-player.decision-current");
    const toAct = toActEl ? extractDisplayName(toActEl) : void 0;
    assignPositions(seats, buttonSeat);
    const heroTurn = isHeroTurn();
    const availableActions = heroTurn ? readAvailableActions() : [];
    return {
      gameState: {
        heroCards,
        board: boardCards,
        pot,
        street,
        toAct,
        buttonSeat,
        seats,
        bigBlind,
        smallBlind,
        isHeroTurn: heroTurn,
        availableActions
      },
      nameToIdMap: nameToIdMap2
    };
  }
  function assignPositions(seats, buttonSeat) {
    if (buttonSeat === void 0 || seats.length < 2) return;
    const occupiedIndices = seats.map((s) => s.seatIndex).sort((a, b) => a - b);
    const n = occupiedIndices.length;
    if (n < 2) return;
    let btnIdx = occupiedIndices.indexOf(buttonSeat);
    if (btnIdx === -1) {
      for (let i = 0; i < n; i++) {
        if (occupiedIndices[i] > buttonSeat) {
          btnIdx = i;
          break;
        }
      }
      if (btnIdx === -1) btnIdx = 0;
    }
    const labels = positionLabels(n);
    for (let i = 0; i < n; i++) {
      const seatIdx = occupiedIndices[(btnIdx + i) % n];
      const seat = seats.find((s) => s.seatIndex === seatIdx);
      if (seat) seat.position = labels[i];
    }
  }
  function positionLabels(n) {
    switch (n) {
      case 2:
        return ["BTN/SB", "BB"];
      case 3:
        return ["BTN", "SB", "BB"];
      case 4:
        return ["BTN", "SB", "BB", "UTG"];
      case 5:
        return ["BTN", "SB", "BB", "UTG", "CO"];
      case 6:
        return ["BTN", "SB", "BB", "UTG", "HJ", "CO"];
      case 7:
        return ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"];
      case 8:
        return ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"];
      case 9:
        return ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"];
      default:
        return ["BTN", "SB", "BB", ...Array.from({ length: n - 3 }, (_, i) => `P${i + 1}`)];
    }
  }
  let observer$1 = null;
  let debounceTimer = null;
  let potWasSignificant = false;
  const POT_THRESHOLD = 10;
  function startWatching(onHandEnd2) {
    if (observer$1) return;
    const seatsEl = document.querySelector(SEL.SEATS);
    if (!seatsEl) {
      console.warn("[Copilot] .seats not found, watcher not started");
      return;
    }
    observer$1 = new MutationObserver(() => checkHandEnd(onHandEnd2));
    observer$1.observe(seatsEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    const potContainer = document.querySelector(".table-pot-size");
    if (potContainer) {
      observer$1.observe(potContainer, { childList: true, subtree: true, characterData: true });
    }
  }
  function readPot() {
    const text = document.querySelector(SEL.POT_VALUE)?.textContent?.trim().replace(/,/g, "") ?? "0";
    return parseFloat(text) || 0;
  }
  function checkHandEnd(onHandEnd2) {
    const pot = readPot();
    if (pot > POT_THRESHOLD) {
      potWasSignificant = true;
      return;
    }
    if (potWasSignificant && countActiveBets() === 0) {
      potWasSignificant = false;
      scheduleHandEnd(onHandEnd2);
    }
  }
  function countActiveBets() {
    return Array.from(document.querySelectorAll(SEL.PLAYER_BET)).filter((el) => (parseFloat(el.textContent?.replace(/,/g, "") ?? "0") || 0) > 0).length;
  }
  function scheduleHandEnd(onHandEnd2) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onHandEnd2();
    }, HAND_END_DEBOUNCE_MS);
  }
  const STREET_CHANGE_DEBOUNCE_MS = 500;
  let streetObserver = null;
  let streetDebounceTimer = null;
  let lastStreet = null;
  function startStreetWatcher(onStreetChange2) {
    if (streetObserver) return;
    const boardEl = document.querySelector(SEL.BOARD);
    if (!boardEl) {
      console.warn("[Copilot] .table-cards not found, street watcher not started");
      return;
    }
    lastStreet = currentStreet();
    streetObserver = new MutationObserver(() => {
      if (streetDebounceTimer) clearTimeout(streetDebounceTimer);
      streetDebounceTimer = setTimeout(() => {
        const street = currentStreet();
        if (street !== lastStreet) {
          lastStreet = street;
          onStreetChange2(street);
        }
      }, STREET_CHANGE_DEBOUNCE_MS);
    });
    streetObserver.observe(boardEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  function currentStreet() {
    return detectStreet(readCards(document, SEL.BOARD_CARDS));
  }
  const TURN_SETTLE_MS = 250;
  let turnObserver = null;
  let turnTimer = null;
  let heroWasToAct = false;
  function startTurnWatcher(onHeroTurn2, onTurnEnd2) {
    if (turnObserver) return;
    const seatsEl = document.querySelector(SEL.SEATS);
    if (!seatsEl) {
      console.warn("[Copilot] .seats not found, turn watcher not started");
      return;
    }
    heroWasToAct = document.querySelector(SEL.HERO_DECISION) !== null;
    turnObserver = new MutationObserver(() => {
      const isHeroTurn2 = document.querySelector(SEL.HERO_DECISION) !== null;
      if (!isHeroTurn2) {
        if (heroWasToAct) {
          if (turnTimer) {
            clearTimeout(turnTimer);
            turnTimer = null;
          }
          onTurnEnd2?.();
        }
        heroWasToAct = false;
        return;
      }
      if (heroWasToAct) return;
      heroWasToAct = true;
      if (turnTimer) clearTimeout(turnTimer);
      turnTimer = setTimeout(() => {
        turnTimer = null;
        if (document.querySelector(SEL.HERO_DECISION)) onHeroTurn2();
      }, TURN_SETTLE_MS);
    });
    turnObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled"]
    });
  }
  const AFK_GRACE_MS = 1500;
  const BADGE_ID = "copilot-afk-badge";
  function planAfkAction(mode, actions) {
    if (mode === "off" || !actions) return null;
    const enabled2 = actions.filter((a) => !a.disabled);
    const check = enabled2.find((a) => a.kind === "check") ?? null;
    const fold = enabled2.find((a) => a.kind === "fold") ?? null;
    return mode === "check-fold" ? check ?? fold : fold ?? check;
  }
  let pending = null;
  let detachCancel = null;
  function cleanup() {
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    detachCancel?.();
    detachCancel = null;
    document.getElementById(BADGE_ID)?.remove();
  }
  function cancelAfkAction() {
    cleanup();
  }
  function scheduleAfkAction(mode, actions, onUserReturned, findButton) {
    cleanup();
    const plan = planAfkAction(mode, actions);
    if (!plan) return;
    showBadge(plan.label);
    const abort = () => {
      cleanup();
      console.log("[Copilot] AFK cancelled — you are back. Auto-action disabled.");
      onUserReturned();
    };
    window.addEventListener("keydown", abort, { once: true, capture: true });
    window.addEventListener("pointerdown", abort, { once: true, capture: true });
    detachCancel = () => {
      window.removeEventListener("keydown", abort, { capture: true });
      window.removeEventListener("pointerdown", abort, { capture: true });
    };
    pending = setTimeout(() => {
      pending = null;
      const btn = findButton(plan.kind);
      if (!btn || btn.disabled) {
        cleanup();
        return;
      }
      console.log(`[Copilot] AFK: clicking "${plan.label}"`);
      btn.click();
      cleanup();
    }, AFK_GRACE_MS);
  }
  function showBadge(label) {
    document.getElementById(BADGE_ID)?.remove();
    const badge = document.createElement("div");
    badge.id = BADGE_ID;
    badge.textContent = `AFK — "${label}" in ${(AFK_GRACE_MS / 1e3).toFixed(1)}s · press any key to cancel`;
    badge.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "padding:7px 14px",
      "border-radius:6px",
      "background:#7c2d12",
      "color:#fed7aa",
      "border:1px solid #ea580c",
      "font:600 12px/1.2 system-ui,sans-serif",
      "letter-spacing:0.3px",
      "box-shadow:0 2px 12px rgba(0,0,0,0.5)",
      "pointer-events:none"
    ].join(";");
    document.body.appendChild(badge);
  }
  const DEFAULT_SETTINGS = {
    openRouterApiKey: "",
    model: DEFAULT_MODEL,
    autoAnalyze: false,
    showOverlays: true,
    showSidePanel: true,
    // Never auto-acts unless you switch it on in the side panel, and it resets
    // to 'off' the moment you touch the table again.
    afkMode: "off"
  };
  function migrateModel(model) {
    if (isKnownModel(model)) return model;
    return RETIRED_MODELS[model] ?? DEFAULT_MODEL;
  }
  async function getSettings() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] ?? {} };
    return { ...settings, model: migrateModel(settings.model) };
  }
  async function setSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  }
  async function getAllPlayerStats() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ALL_PLAYER_STATS);
    return result[STORAGE_KEYS.ALL_PLAYER_STATS] ?? {};
  }
  async function saveAllPlayerStats(stats) {
    await chrome.storage.local.set({ [STORAGE_KEYS.ALL_PLAYER_STATS]: stats });
  }
  async function getHeroStats() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.HERO_STATS);
    return result[STORAGE_KEYS.HERO_STATS] ?? null;
  }
  async function saveHeroStats(stats) {
    await chrome.storage.local.set({ [STORAGE_KEYS.HERO_STATS]: stats });
  }
  const LOG_PATTERNS = {
    HAND_START: /^-- starting hand #(\d+) \(id: ([a-z0-9]+)\)\s+(.+?) \(dealer: (.+?)\) --$/,
    HAND_START_DEAD: /^-- starting hand #(\d+) \(id: ([a-z0-9]+)\)\s+(.+?) \(dead button\) --$/,
    HAND_END: /^-- ending hand #(\d+) --$/,
    STACKS: /^Player stacks: (.+)$/,
    HERO_CARDS: /^Your hand is (.+)$/,
    POSTS_SB: /^(.+?) posts a small blind of (\d+)$/,
    POSTS_BB: /^(.+?) posts a big blind of (\d+)$/,
    POSTS_MISSED_BB: /^(.+?) posts a missed big blind of (\d+)$/,
    POSTS_MISSED_SB: /^(.+?) posts a missing small blind of (\d+)$/,
    RAISES_TO: /^(.+?) raises to (\d+)$/,
    BETS: /^(.+?) bets (\d+)$/,
    CALLS: /^(.+?) calls (\d+)$/,
    FOLDS: /^(.+?) folds$/,
    CHECKS: /^(.+?) checks$/,
    ALL_IN: /^(.+?) (?:calls|raises to|bets) (\d+) and is all in$/,
    FLOP: /^Flop:\s+\[(.+?)\]$/,
    TURN: /^Turn: .+? \[(.+?)\]$/,
    RIVER: /^River: .+? \[(.+?)\]$/,
    SHOWS: /^(.+?) shows a (.+?)\.$/,
    COLLECTED: /^(.+?) collected (\d+) from pot(?: with (.+?))?$/,
    JOINED: /^The player (.+?) joined the game with a stack of (\d+)\.$/,
    QUITS: /^The player (.+?) quits the game with a stack of (\d+)\.$/
  };
  const STACK_ENTRY = /#(\d+) (.+?)\s*\((\d+)\)/g;
  function parseLogPlayer(raw) {
    const unquoted = raw.trim().replace(/^"(.*)"$/, "$1");
    const at = unquoted.lastIndexOf(" @ ");
    if (at === -1) {
      return { displayName: unquoted, playerId: unquoted };
    }
    return {
      displayName: unquoted.slice(0, at).trim(),
      playerId: unquoted.slice(at + 3).trim()
    };
  }
  function tokenizeLine(line) {
    const p = LOG_PATTERNS;
    let m;
    m = line.match(p.HAND_START);
    if (m) return { type: "hand_start", handNum: +m[1], handId: m[2], dealer: m[4] };
    m = line.match(p.HAND_START_DEAD);
    if (m) return { type: "hand_start", handNum: +m[1], handId: m[2], dealer: "" };
    m = line.match(p.HAND_END);
    if (m) return { type: "hand_end", handNum: +m[1] };
    m = line.match(p.STACKS);
    if (m) {
      const entries = [];
      const re = new RegExp(STACK_ENTRY.source, "g");
      let entry;
      while ((entry = re.exec(m[1])) !== null) {
        entries.push({ seat: +entry[1], name: entry[2], stack: +entry[3] });
      }
      return { type: "stacks", entries };
    }
    m = line.match(p.HERO_CARDS);
    if (m) return { type: "hero_cards", raw: m[1] };
    m = line.match(p.POSTS_SB);
    if (m) return { type: "post", player: m[1], amount: +m[2], blind: "sb" };
    m = line.match(p.POSTS_BB);
    if (m) return { type: "post", player: m[1], amount: +m[2], blind: "bb" };
    m = line.match(p.POSTS_MISSED_BB);
    if (m) return { type: "post", player: m[1], amount: +m[2], blind: "missed_bb" };
    m = line.match(p.POSTS_MISSED_SB);
    if (m) return { type: "post", player: m[1], amount: +m[2], blind: "missed_sb" };
    m = line.match(p.ALL_IN);
    if (m) {
      const actionType = line.includes("calls") ? "call" : line.includes("raises") ? "raise" : "bet";
      return { type: "action", player: m[1], actionType, amount: +m[2], isAllIn: true };
    }
    m = line.match(p.RAISES_TO);
    if (m) return { type: "action", player: m[1], actionType: "raise", amount: +m[2], isAllIn: false };
    m = line.match(p.BETS);
    if (m) return { type: "action", player: m[1], actionType: "bet", amount: +m[2], isAllIn: false };
    m = line.match(p.CALLS);
    if (m) return { type: "action", player: m[1], actionType: "call", amount: +m[2], isAllIn: false };
    m = line.match(p.FOLDS);
    if (m) return { type: "action", player: m[1], actionType: "fold", isAllIn: false };
    m = line.match(p.CHECKS);
    if (m) return { type: "action", player: m[1], actionType: "check", isAllIn: false };
    m = line.match(p.FLOP);
    if (m) return { type: "street", street: "flop", cardsRaw: m[1] };
    m = line.match(p.TURN);
    if (m) return { type: "street", street: "turn", cardsRaw: m[1] };
    m = line.match(p.RIVER);
    if (m) return { type: "street", street: "river", cardsRaw: m[1] };
    m = line.match(p.SHOWS);
    if (m) return { type: "shows", player: m[1], cardsRaw: m[2] };
    m = line.match(p.COLLECTED);
    if (m) return { type: "collected", player: m[1], amount: +m[2], handDesc: m[3] };
    m = line.match(p.JOINED);
    if (m) return { type: "joined", player: m[1], stack: +m[2] };
    m = line.match(p.QUITS);
    if (m) return { type: "quit", player: m[1], stack: +m[2] };
    return { type: "unknown" };
  }
  function parseHand(lines) {
    let handId = "";
    let handNum = 0;
    let startedAt = Date.now();
    const players = [];
    const positions = {};
    let heroCards;
    const board = [];
    const actions = [];
    let pot = 0;
    const winner = [];
    const showdownCards = {};
    let currentStreet2 = "preflop";
    let actionOrder = 0;
    let foundStart = false;
    const identities = {};
    const note = (raw) => {
      if (!identities[raw]) identities[raw] = parseLogPlayer(raw);
      if (!players.includes(raw)) players.push(raw);
    };
    for (const line of lines) {
      const token = tokenizeLine(line);
      switch (token.type) {
        case "hand_start":
          foundStart = true;
          handId = token.handId;
          handNum = token.handNum;
          startedAt = Date.now();
          break;
        case "stacks":
          for (const e of token.entries) note(e.name);
          break;
        case "hero_cards": {
          const cards = parseCards(token.raw);
          if (cards.length === 2) heroCards = [cards[0], cards[1]];
          break;
        }
        case "post":
          actions.push({
            player: token.player,
            street: "preflop",
            type: "post",
            amount: token.amount,
            isAllIn: false,
            order: actionOrder++
          });
          pot += token.amount;
          note(token.player);
          break;
        case "action":
          note(token.player);
          actions.push({
            player: token.player,
            street: currentStreet2,
            type: token.actionType,
            amount: token.amount,
            isAllIn: token.isAllIn,
            order: actionOrder++
          });
          if (token.amount && (token.actionType === "call" || token.actionType === "bet" || token.actionType === "raise")) {
            pot += token.amount;
          }
          break;
        case "street": {
          const newCards = parseCards(token.cardsRaw);
          board.push(...newCards);
          currentStreet2 = token.street;
          break;
        }
        case "shows":
          note(token.player);
          showdownCards[token.player] = parseCards(token.cardsRaw);
          break;
        case "collected":
          note(token.player);
          if (!winner.includes(token.player)) winner.push(token.player);
          if (pot === 0) pot = token.amount;
          break;
      }
    }
    if (!foundStart || !handId) return null;
    return {
      handId,
      handNum,
      startedAt,
      players,
      identities,
      positions,
      heroCards,
      board,
      actions,
      pot,
      winner,
      showdownCards
    };
  }
  const START_RE = /^-- starting hand #/;
  const END_RE = /^-- ending hand #/;
  function extractCompletedHandBlocksFromLines(allLines) {
    const blocks = [];
    let startIdx = -1;
    for (let i = 0; i < allLines.length; i++) {
      if (START_RE.test(allLines[i])) {
        startIdx = i;
      } else if (END_RE.test(allLines[i]) && startIdx !== -1) {
        blocks.push(allLines.slice(startIdx, i + 1));
        startIdx = -1;
      }
    }
    return blocks;
  }
  function logEntriesToLines(entries) {
    return toLines(entries);
  }
  function toLines(entries) {
    return [...entries].reverse().map((el) => el.querySelector("p.content")?.textContent?.trim() ?? "").filter((l) => l.length > 0);
  }
  let pulling = false;
  async function pullLogEntries(opts = {}) {
    const session = await openLog(opts);
    if (!session) return [];
    try {
      return Array.from(session.entries.querySelectorAll(SEL.LOG_ENTRY));
    } finally {
      session.done();
    }
  }
  async function pullLogPages(opts) {
    const session = await openLog(opts);
    if (!session) return [];
    const pages = [];
    let lastOlderNum = Number.POSITIVE_INFINITY;
    try {
      for (let page = 0; page < opts.maxPages; page++) {
        const entries = Array.from(session.entries.querySelectorAll(SEL.LOG_ENTRY));
        pages.unshift(logEntriesToLines(entries));
        if (opts.enough(pages.flat())) break;
        const older = findOlderPageButton(session.modal, lastOlderNum);
        if (!older) break;
        lastOlderNum = older.handNum;
        const before = pageSignature(session.entries);
        reactClick(older.button);
        if (!await waitForPageChange(session.entries, before)) break;
      }
      return pages.flat();
    } finally {
      session.done();
    }
  }
  async function openLog(opts) {
    if (pulling) {
      if (!opts.waitForFree) return null;
      if (!await waitUntilFree(6e3)) return null;
    }
    pulling = true;
    const release = (closeIt) => {
      if (closeIt) closeModal();
      pulling = false;
      removeHideStyle();
    };
    try {
      injectHideStyle();
      const wasOpen = Boolean(document.querySelector(SEL.LOG_MODAL));
      if (!wasOpen && !openLogModal()) {
        release(false);
        return null;
      }
      const modal = await waitForElement(SEL.LOG_MODAL, LOG_MODAL_TIMEOUT_MS);
      if (!modal) {
        console.warn("[Copilot] Log modal did not appear within timeout");
        release(false);
        return null;
      }
      await waitForEntriesStable(modal);
      const entries = modal.querySelector(SEL.LOG_ENTRIES);
      if (!entries) {
        release(!wasOpen);
        return null;
      }
      let released = false;
      return {
        modal,
        entries,
        done: () => {
          if (!released) {
            released = true;
            release(!wasOpen);
          }
        }
      };
    } catch (e) {
      release(false);
      throw e;
    }
  }
  function openLogModal() {
    const openBtn = document.querySelector(SEL.LOG_OPEN_BUTTON) ?? document.querySelector(".log-button-container button") ?? document.querySelector(".log-button-container");
    if (openBtn) {
      reactClick(openBtn);
      return true;
    }
    console.warn('[Copilot] Log open button not found — trying the "L" shortcut');
    for (const type of ["keydown", "keyup"]) {
      document.dispatchEvent(new KeyboardEvent(type, {
        key: "l",
        code: "KeyL",
        keyCode: 76,
        which: 76,
        bubbles: true,
        cancelable: true
      }));
    }
    return true;
  }
  function findOlderPageButton(modal, below) {
    const candidates = Array.from(
      modal.querySelectorAll(SEL.LOG_PAGINATION_BUTTON)
    ).filter((b) => !b.disabled).map((b) => ({ button: b, handNum: Number(b.textContent?.match(/#(\d+)/)?.[1]) })).filter((c) => Number.isFinite(c.handNum) && c.handNum < below).sort((a, b) => a.handNum - b.handNum);
    return candidates[0] ?? null;
  }
  function pageSignature(entries) {
    const list = entries.querySelectorAll(SEL.LOG_ENTRY);
    return `${list.length}|${list[0]?.textContent?.trim() ?? ""}`;
  }
  function waitForPageChange(entries, before) {
    return new Promise((resolve) => {
      const TIMEOUT = 2500;
      let settle = null;
      const finish = (changed) => {
        if (settle) clearTimeout(settle);
        clearTimeout(deadline);
        observer2.disconnect();
        resolve(changed);
      };
      const observer2 = new MutationObserver(() => {
        if (pageSignature(entries) === before) return;
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => finish(true), 150);
      });
      observer2.observe(entries, { childList: true, subtree: true });
      const deadline = setTimeout(() => finish(pageSignature(entries) !== before), TIMEOUT);
    });
  }
  function waitUntilFree(timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        if (!pulling) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 100);
      };
      setTimeout(tick, 100);
    });
  }
  function waitForEntriesStable(modal) {
    return new Promise((resolve) => {
      const MAX_WAIT = 1500;
      const STABLE_DELAY = 200;
      let lastCount = -1;
      let stableTimer = null;
      const deadline = setTimeout(() => {
        if (stableTimer) clearTimeout(stableTimer);
        observer2.disconnect();
        resolve();
      }, MAX_WAIT);
      const observer2 = new MutationObserver(() => {
        const count2 = modal.querySelectorAll(SEL.LOG_ENTRY).length;
        if (count2 !== lastCount) {
          lastCount = count2;
          if (stableTimer) clearTimeout(stableTimer);
          stableTimer = setTimeout(() => {
            clearTimeout(deadline);
            observer2.disconnect();
            resolve();
          }, STABLE_DELAY);
        }
      });
      observer2.observe(modal, { childList: true, subtree: true });
      const count = modal.querySelectorAll(SEL.LOG_ENTRY).length;
      lastCount = count;
      stableTimer = setTimeout(() => {
        clearTimeout(deadline);
        observer2.disconnect();
        resolve();
      }, STABLE_DELAY);
    });
  }
  function reactClick(el) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }
  function waitForElement(selector, timeoutMs) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }
      const observer2 = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer2.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      observer2.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer2.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }
  function closeModal() {
    const closeBtn = document.querySelector(SEL.LOG_CLOSE_BUTTON) ?? document.querySelector(".modal.log-modal .modal-button-close") ?? document.querySelector('.log-modal button[class*="close"]');
    if (closeBtn) reactClick(closeBtn);
  }
  const HIDE_STYLE_ID = "copilot-log-hide";
  function injectHideStyle() {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = `.modal.log-modal { opacity: 0 !important; pointer-events: none !important; }`;
    document.head.appendChild(style);
  }
  function removeHideStyle() {
    document.getElementById(HIDE_STYLE_ID)?.remove();
  }
  function ratio(numerator, denominator) {
    if (denominator === 0) return 0;
    return Math.round(numerator / denominator * 1e3) / 1e3;
  }
  function createEmptyStats(playerId, displayName) {
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
      lastUpdated: Date.now()
    };
  }
  function recomputeRatios(stats) {
    const c = stats.counters;
    return {
      ...stats,
      vpip: ratio(c.vpipAct, c.vpipOpp),
      pfr: ratio(c.pfrAct, c.pfrOpp),
      threeBet: ratio(c.threeBetAct, c.threeBetOpp),
      foldToCbet: ratio(c.cbetFold, c.cbetOpp),
      af: c.calls === 0 ? c.bets + c.raises : ratio(c.bets + c.raises, c.calls),
      lastUpdated: Date.now()
    };
  }
  function ingestHandForPlayer(player, hand, current) {
    const stats = { ...current, counters: { ...current.counters } };
    const preflopActions = hand.actions.filter((a) => a.street === "preflop" && a.player === player);
    const allActions = hand.actions.filter((a) => a.player === player);
    const hadPreflopOpportunity = hand.players.includes(player);
    if (hadPreflopOpportunity) {
      stats.handsSeen++;
      stats.counters.vpipOpp++;
      const voluntaryPFAction = preflopActions.some(
        (a) => a.type === "call" || a.type === "raise" || a.type === "bet" || a.type === "allin"
      );
      if (voluntaryPFAction) stats.counters.vpipAct++;
      stats.counters.pfrOpp++;
      const raisedPreflop = preflopActions.some((a) => a.type === "raise");
      if (raisedPreflop) stats.counters.pfrAct++;
      const preflopRaises = hand.actions.filter((a) => a.street === "preflop" && a.type === "raise");
      const firstRaiseIdx = preflopRaises.findIndex((a) => a.player !== player);
      if (firstRaiseIdx >= 0) {
        stats.counters.threeBetOpp++;
        const playerRaisedAfter = preflopRaises.some(
          (a) => a.player === player && a.order > preflopRaises[firstRaiseIdx].order
        );
        if (playerRaisedAfter) stats.counters.threeBetAct++;
      }
    }
    for (const a of allActions) {
      if (a.type === "bet") stats.counters.bets++;
      if (a.type === "raise") stats.counters.raises++;
      if (a.type === "call") stats.counters.calls++;
    }
    const flopBets = hand.actions.filter((a) => a.street === "flop" && a.type === "bet");
    if (flopBets.length > 0) {
      const facedCbet = flopBets.some((a) => a.player !== player) && hand.players.includes(player) && !hand.actions.find((a) => a.street === "preflop" && a.player === player && a.type === "fold");
      if (facedCbet) {
        stats.counters.cbetOpp++;
        const foldedToFlop = allActions.some((a) => a.street === "flop" && a.type === "fold");
        if (foldedToFlop) stats.counters.cbetFold++;
      }
    }
    if (hand.showdownCards[player]) {
      const updated = [...stats.showdownRanges, hand.showdownCards[player]];
      stats.showdownRanges = updated.slice(-20);
    }
    return recomputeRatios(stats);
  }
  function computeTags(stats) {
    if (stats.handsSeen < MIN_HANDS_FOR_TAGS) return [];
    const tags = [];
    if (stats.vpip > 0.4 && stats.pfr < 0.12 && stats.af < 1.5) {
      tags.push("Calling station");
    }
    if (stats.foldToCbet > 0.65 && stats.counters.cbetOpp >= 5) {
      tags.push("Folds to turn pressure");
    }
    if (stats.af > 4 && stats.counters.bets + stats.counters.raises >= 8) {
      tags.push("Bombs river");
    }
    if (stats.af > 3 && stats.pfr > 0.25 && stats.vpip > 0.35) {
      tags.push("Bluffs draws");
    }
    if (stats.vpip > 0.3 && stats.pfr < 0.15 && stats.af > 2.5) {
      tags.push("Slowplays monsters");
    }
    return tags;
  }
  const seenHandIds = /* @__PURE__ */ new Set();
  let statsCache = {};
  let heroStats = null;
  let heroPlayerId = null;
  let nameToIdMap = {};
  function updateNameMap(map) {
    nameToIdMap = { ...nameToIdMap, ...map };
    sweepLegacyKeys();
  }
  function sweepLegacyKeys() {
    let changed = false;
    for (const [name, id] of Object.entries(nameToIdMap)) {
      if (name === id || !statsCache[name]) continue;
      if (heroPlayerId !== null && id === heroPlayerId) {
        const base = heroStats ?? createEmptyStats(id, name);
        heroStats = { ...absorbLegacy(base, name, id) };
        heroStats.tags = computeTags(heroStats);
        saveHeroStats(heroStats).catch(() => {
        });
      } else {
        const base = statsCache[id] ?? createEmptyStats(id, name);
        statsCache[id] = absorbLegacy(base, name, id);
      }
      changed = true;
    }
    if (changed) saveAllPlayerStats(statsCache).catch(() => {
    });
  }
  function setHeroPlayerId(id) {
    heroPlayerId = id;
  }
  async function loadFromStorage() {
    try {
      statsCache = await getAllPlayerStats();
      heroStats = await getHeroStats();
    } catch {
      statsCache = {};
      heroStats = null;
    }
  }
  function resolveIdentity(logRef, hand) {
    const fromLog = hand.identities[logRef];
    const displayName = fromLog?.displayName ?? logRef;
    if (fromLog && fromLog.playerId !== fromLog.displayName) return fromLog;
    const domId = nameToIdMap[displayName];
    return { displayName, playerId: domId ?? displayName };
  }
  function mergeStats(into, from) {
    const counters = { ...into.counters };
    for (const key of Object.keys(counters)) {
      counters[key] += from.counters[key];
    }
    return recomputeRatios({
      ...into,
      handsSeen: into.handsSeen + from.handsSeen,
      counters,
      showdownRanges: [...from.showdownRanges, ...into.showdownRanges].slice(-20)
    });
  }
  function absorbLegacy(target, displayName, playerId) {
    if (displayName === playerId) return target;
    const legacy = statsCache[displayName];
    if (!legacy) return target;
    delete statsCache[displayName];
    console.info(
      `[Copilot] Migrated legacy stats "${displayName}" (n=${legacy.handsSeen}) → ${playerId}`
    );
    return mergeStats(target, legacy);
  }
  function ingestHand(hand) {
    if (seenHandIds.has(hand.handId)) {
      return { opponentStats: { ...statsCache }, heroStats, ingested: false };
    }
    seenHandIds.add(hand.handId);
    for (const logRef of hand.players) {
      const { playerId, displayName } = resolveIdentity(logRef, hand);
      const isHero = heroPlayerId !== null && playerId === heroPlayerId;
      if (isHero) {
        let current = heroStats ?? createEmptyStats(playerId, displayName);
        current = absorbLegacy(current, displayName, playerId);
        const updated = ingestHandForPlayer(logRef, hand, current);
        heroStats = { ...updated, playerId, displayName, tags: computeTags(updated) };
        saveHeroStats(heroStats).catch(() => {
        });
      } else {
        let current = statsCache[playerId] ?? createEmptyStats(playerId, displayName);
        current = absorbLegacy(current, displayName, playerId);
        const updated = ingestHandForPlayer(logRef, hand, current);
        statsCache[playerId] = { ...updated, playerId, displayName, tags: computeTags(updated) };
      }
    }
    saveAllPlayerStats(statsCache).catch(() => {
    });
    return { opponentStats: { ...statsCache }, heroStats, ingested: true };
  }
  function getAllStats() {
    return { ...statsCache };
  }
  function getHeroStatsSnapshot() {
    return heroStats;
  }
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
  const BADGE_COLORS = {
    red: { bg: "#c0392b", text: "#fff", border: "#922b21" },
    blue: { bg: "#2471a3", text: "#fff", border: "#1a5276" },
    yellow: { bg: "#d4ac0d", text: "#000", border: "#9a7d0a" },
    gray: { bg: "#555", text: "#ccc", border: "#333" }
  };
  const OVERLAY_ID = "copilot-overlay-layer";
  const badgeMap = /* @__PURE__ */ new Map();
  const seatMap = /* @__PURE__ */ new Map();
  let currentStats = {};
  let onExploitFn = () => {
  };
  let enabled = true;
  function setOverlaysEnabled(on) {
    enabled = on;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = "block";
  }
  function updateOverlays(stats, onExploit) {
    currentStats = stats;
    onExploitFn = onExploit;
    if (!enabled) return;
    ensureOverlay();
    syncBadges();
    attachRepositionTriggers();
    scheduleReposition();
  }
  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "10000",
        overflow: "hidden"
      });
      document.body.appendChild(overlay);
    }
    return overlay;
  }
  function syncBadges() {
    const overlay = ensureOverlay();
    seatMap.clear();
    document.querySelectorAll(SEL.ALL_PLAYERS).forEach((seatEl) => {
      const link = seatEl.querySelector(SEL.PLAYER_NAME_LINK);
      const pid = link?.getAttribute("href")?.split("/").pop() ?? "";
      if (!pid || seatEl.classList.contains("you-player")) return;
      seatMap.set(pid, seatEl);
    });
    for (const [pid, badge] of badgeMap) {
      if (!seatMap.has(pid)) {
        badge.remove();
        badgeMap.delete(pid);
      }
    }
    for (const pid of seatMap.keys()) {
      const stats = currentStats[pid];
      let badge = badgeMap.get(pid);
      if (!badge) {
        badge = document.createElement("div");
        badge.style.position = "absolute";
        badge.style.pointerEvents = "none";
        overlay.appendChild(badge);
        badgeMap.set(pid, badge);
      }
      renderBadge(badge, pid, stats);
    }
  }
  function renderBadge(badge, pid, stats) {
    const color = stats ? getBadgeColor(stats) : "gray";
    const palette = BADGE_COLORS[color] ?? BADGE_COLORS.gray;
    Object.assign(badge.style, {
      background: palette.bg,
      color: palette.text,
      border: `1px solid ${palette.border}`,
      borderRadius: "3px",
      fontSize: "10px",
      fontFamily: "monospace",
      lineHeight: "1.3",
      whiteSpace: "nowrap",
      padding: "1px 5px",
      display: "flex",
      alignItems: "center",
      gap: "3px",
      userSelect: "none"
    });
    if (!stats || stats.handsSeen < MIN_HANDS_FOR_STATS) {
      badge.innerHTML = `<span style="opacity:.7">n=${stats?.handsSeen ?? 0}</span>`;
      return;
    }
    const vpip = Math.round(stats.vpip * 100);
    const pfr = Math.round(stats.pfr * 100);
    const af = stats.af.toFixed(1);
    const tag = stats.tags[0] ? ` ${shortTag(stats.tags[0])}` : "";
    badge.innerHTML = `
    <span>${vpip}/${pfr} AF${af}${tag}</span>
    <button data-pid="${pid}" title="Potential exploits"
      style="background:none;border:none;cursor:pointer;font-size:10px;
             padding:0 1px;line-height:1;opacity:.8;pointer-events:auto;">🎯</button>
  `;
    const btn = badge.querySelector("button[data-pid]");
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        onExploitFn(pid);
      };
    }
  }
  function repositionAll() {
    if (!enabled || badgeMap.size === 0) return;
    const layout = [];
    for (const [pid, badge] of badgeMap) {
      const seatEl = seatMap.get(pid);
      if (!seatEl) continue;
      layout.push({
        badge,
        rect: seatEl.getBoundingClientRect(),
        width: badge.offsetWidth || 80
      });
    }
    for (const { badge, rect, width } of layout) {
      if (rect.width === 0 && rect.height === 0) {
        badge.style.display = "none";
        continue;
      }
      badge.style.display = "flex";
      badge.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
      badge.style.top = `${rect.bottom - 18}px`;
    }
  }
  let scheduled = false;
  let listenersAttached = false;
  function scheduleReposition() {
    if (scheduled || !enabled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      repositionAll();
    });
  }
  function attachRepositionTriggers() {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener("resize", scheduleReposition, { passive: true });
    window.addEventListener("scroll", scheduleReposition, { passive: true, capture: true });
    const table = document.querySelector(SEL.SEATS);
    if (table && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(scheduleReposition).observe(table);
    }
  }
  const TAG_SHORT = {
    "Slowplays monsters": "Slow",
    "Bluffs draws": "Bluff",
    "Bombs river": "Bomb↑",
    "Folds to turn pressure": "F↑Turn",
    "Calling station": "Fish"
  };
  function shortTag(tag) {
    return TAG_SHORT[tag] ?? tag;
  }
  const POKERNOW_COLORS = {
    red: "#e41a1c",
    // Loose Aggressive / Maniac
    blue: "#377eb8",
    // Tight Aggressive (TAG)
    green: "#4daf4a",
    // Solid / Balanced
    purple: "#984ea3",
    // 3Bet heavy / PF aggressor
    orange: "#ff7f00",
    // Loose Passive
    yellow: "#ffff33",
    // Calling Station / Fish
    brown: "#a65628",
    // Tricky / Slowplayer
    pink: "#f781bf"
    // Unknown / too few hands
  };
  const COPILOT_MARKER = "📊Copilot:";
  const SEPARATOR = "\n---\n";
  function selectColorForPlayer(stats) {
    if (stats.handsSeen < MIN_HANDS_FOR_STATS) return "pink";
    const { vpip, pfr, af, threeBet } = stats;
    if (stats.tags.includes("Slowplays monsters")) return "brown";
    if (vpip > 0.38 && af > 3) return "red";
    if (threeBet > 0.12 && pfr > 0.22) return "purple";
    if (vpip < 0.24 && pfr > 0.15 && af > 1.8) return "blue";
    if (vpip > 0.38 && af < 1.5) return "yellow";
    if (vpip > 0.32 && pfr < 0.12) return "orange";
    if (vpip >= 0.2 && vpip <= 0.34 && pfr >= 0.12) return "green";
    if (vpip < 0.2) return "blue";
    return "pink";
  }
  function formatStatsBlock(stats) {
    if (stats.handsSeen < 3) {
      return `${COPILOT_MARKER} n=${stats.handsSeen} (collecting)`;
    }
    const vpip = Math.round(stats.vpip * 100);
    const pfr = Math.round(stats.pfr * 100);
    const tbet = Math.round(stats.threeBet * 100);
    const fcbet = Math.round(stats.foldToCbet * 100);
    const af = stats.af.toFixed(1);
    const tags = stats.tags.length > 0 ? ` | ${stats.tags.join(", ")}` : "";
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return `${COPILOT_MARKER} n=${stats.handsSeen} V:${vpip}% P:${pfr}% 3B:${tbet}% AF:${af} F↳:${fcbet}%${tags} [${date}]`;
  }
  function mergeNotes(existing, newStatsLine) {
    const markerIdx = existing.indexOf(COPILOT_MARKER);
    if (markerIdx === -1) {
      return existing.trim() ? `${newStatsLine}${SEPARATOR}${existing.trim()}` : newStatsLine;
    }
    const beforeMarker = existing.slice(0, markerIdx);
    const afterMarker = existing.slice(markerIdx);
    const sepIdx = afterMarker.indexOf(SEPARATOR);
    const userNotes = sepIdx !== -1 ? afterMarker.slice(sepIdx + SEPARATOR.length) : "";
    return userNotes.trim() ? `${beforeMarker}${newStatsLine}${SEPARATOR}${userNotes.trim()}` : `${beforeMarker}${newStatsLine}`;
  }
  let paywallReported = false;
  function notesArePaywalled(popover) {
    const textarea = popover.querySelector(".player-notes textarea");
    if (textarea?.disabled) return true;
    return popover.querySelector(".player-notes .paywall-element.only-plus") !== null;
  }
  function writeStatsToOpenPopover(popover, stats) {
    const textarea = popover.querySelector(".player-notes textarea");
    if (!textarea) return;
    if (notesArePaywalled(popover)) {
      if (!paywallReported) {
        paywallReported = true;
        console.info(
          "[Copilot] PokerNow notes are Plus-only on this account — skipping note/colour sync. Stats keep updating in the side panel and the seat overlays."
        );
      }
      return;
    }
    const statsLine = formatStatsBlock(stats);
    const merged = mergeNotes(textarea.value, statsLine);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (setter) setter.call(textarea, merged);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const color = selectColorForPlayer(stats);
    const hex = POKERNOW_COLORS[color];
    const colorBtn = popover.querySelector(
      `.player-note-color[aria-label="Set player color ${hex}"]`
    );
    if (colorBtn) {
      colorBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }
  let observer = null;
  function startPopoverWatcher(getStats) {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const popover = node.matches(SEL.NOTES_POPOVER) ? node : node.querySelector(SEL.NOTES_POPOVER);
          if (!popover) continue;
          const seatEl = popover.closest(".table-player");
          if (!seatEl) continue;
          const link = seatEl.querySelector(".table-player-name a");
          const playerId = link?.getAttribute("href")?.split("/").pop() ?? "";
          if (!playerId) continue;
          const stats = getStats();
          const playerStats = stats[playerId];
          if (!playerStats) continue;
          setTimeout(() => writeStatsToOpenPopover(popover, playerStats), 150);
        }
      }
    });
    const seatsEl = document.querySelector(SEL.SEATS);
    if (seatsEl) {
      observer.observe(seatsEl, { childList: true, subtree: true });
    }
  }
  async function init() {
    await waitForGameRoot();
    if (!healthCheck()) return;
    await loadFromStorage();
    const heroLink = document.querySelector(`${SEL.HERO} .table-player-name a`);
    const heroId = heroLink?.getAttribute("href")?.split("/").pop() ?? "";
    if (heroId) setHeroPlayerId(heroId);
    setOverlaysEnabled(true);
    updateOverlays(getAllStats(), (pid) => chrome.runtime.sendMessage({ type: "EXPLOIT_REQUEST", playerId: pid, stats: getAllStats() }));
    startWatching(onHandEnd);
    startStreetWatcher(onStreetChange);
    startTurnWatcher(onHeroTurn, onTurnEnd);
    startPopoverWatcher(getAllStats);
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "PULL_REQUEST") {
        handlePullRequest(sendResponse);
        return true;
      }
      if (msg.type === "LOG_PULL_REQUEST") {
        const { minHands } = msg;
        void runLogPull({ minHands }).then(sendResponse);
        return true;
      }
      if (msg.type === "AI_RECOMMENDATION") {
        const shown = highlightAction(msg.kind);
        console.log(`[Copilot] Suggested: ${msg.line}${shown ? "" : " (button no longer available)"}`);
      }
    });
    console.log("[PokerNow Copilot] Active — hero:", heroId || "(unknown)");
  }
  function handlePullRequest(sendResponse) {
    const { gameState, nameToIdMap: nameToIdMap2 } = snapshotGameState();
    updateNameMap(nameToIdMap2);
    sendResponse({ gameState });
  }
  const MIN_PULL_INTERVAL_MS = 6e3;
  let lastPullAt = 0;
  let pullPending = null;
  async function onHandEnd() {
    const since = Date.now() - lastPullAt;
    if (since < MIN_PULL_INTERVAL_MS) {
      if (pullPending) return;
      pullPending = setTimeout(() => {
        pullPending = null;
        void runLogPull();
      }, MIN_PULL_INTERVAL_MS - since);
      return;
    }
    await runLogPull();
  }
  async function runLogPull(opts = {}) {
    lastPullAt = Date.now();
    const { gameState, nameToIdMap: nameToIdMap2 } = snapshotGameState();
    updateNameMap(nameToIdMap2);
    const minHands = opts.minHands;
    const lines = minHands ? await pullLogPages({
      enough: (ls) => extractCompletedHandBlocksFromLines(ls).length >= minHands,
      // Paging costs one log request per hand, so cap the walk well above the
      // target but far below "the whole session".
      maxPages: minHands * 3,
      waitForFree: true
    }) : logEntriesToLines(await pullLogEntries());
    if (lines.length === 0) return { found: 0, ingested: 0 };
    const blocks = extractCompletedHandBlocksFromLines(lines);
    if (blocks.length === 0) {
      console.warn("[Copilot] No completed hand in log");
      return { found: 0, ingested: 0 };
    }
    let opponentStats = getAllStats();
    let heroStats2 = getHeroStatsSnapshot();
    let ingested = 0;
    for (const lines2 of blocks) {
      const hand = parseHand(lines2);
      if (!hand) {
        console.warn("[Copilot] Could not parse hand", lines2);
        continue;
      }
      const result = ingestHand(hand);
      opponentStats = result.opponentStats;
      heroStats2 = result.heroStats;
      if (result.ingested) {
        ingested++;
        const seen = hand.players.map((ref) => hand.identities[ref]?.displayName ?? ref).map((name) => Object.values(opponentStats).find((s) => s.displayName === name)).filter((s) => Boolean(s)).map((s) => `${s.displayName}(${s.playerId})=n${s.handsSeen}`);
        console.log(`[Copilot] Hand #${hand.handNum} → ${seen.join(" ")}`);
      }
    }
    if (ingested === 0) return { found: blocks.length, ingested };
    updateOverlays(opponentStats, (pid) => chrome.runtime.sendMessage({ type: "EXPLOIT_REQUEST", playerId: pid, stats: opponentStats }));
    chrome.runtime.sendMessage({ type: "STATS_UPDATE", stats: opponentStats });
    chrome.runtime.sendMessage({ type: "GAME_STATE_UPDATE", gameState });
    if (heroStats2) {
      chrome.runtime.sendMessage({ type: "HERO_STATS_UPDATE", stats: heroStats2 });
    }
    return { found: blocks.length, ingested };
  }
  async function onStreetChange() {
    const { gameState, nameToIdMap: nameToIdMap2 } = snapshotGameState();
    updateNameMap(nameToIdMap2);
    chrome.runtime.sendMessage({ type: "GAME_STATE_UPDATE", gameState });
  }
  function onTurnEnd() {
    cancelAfkAction();
    clearActionHighlight();
  }
  async function onHeroTurn() {
    const { gameState, nameToIdMap: nameToIdMap2 } = snapshotGameState();
    updateNameMap(nameToIdMap2);
    clearActionHighlight();
    chrome.runtime.sendMessage({ type: "GAME_STATE_UPDATE", gameState });
    const settings = await getSettings();
    if (settings.afkMode !== "off") {
      scheduleAfkAction(
        settings.afkMode,
        gameState.availableActions,
        () => {
          void disableAfkMode();
        },
        findActionButton
      );
      return;
    }
    if (!settings.autoAnalyze) return;
    console.log("[Copilot] Hero to act — actions:", gameState.availableActions);
    chrome.runtime.sendMessage({
      type: "AI_ANALYZE_REQUEST",
      gameState,
      stats: getAllStats()
    });
  }
  async function disableAfkMode() {
    const settings = await getSettings();
    if (settings.afkMode === "off") return;
    await setSettings({ ...settings, afkMode: "off" });
  }
  function waitForGameRoot() {
    return new Promise((resolve) => {
      if (document.querySelector(".game-main-container")) {
        resolve();
        return;
      }
      const obs = new MutationObserver(() => {
        if (document.querySelector(".game-main-container")) {
          obs.disconnect();
          resolve();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(resolve, 1e4);
    });
  }
  init().catch(console.error);
})();
//# sourceMappingURL=content.js.map
