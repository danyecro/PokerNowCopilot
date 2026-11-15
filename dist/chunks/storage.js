const DEFAULT_MODEL = "gemini-2.5-flash";
const AVAILABLE_MODELS = [
  // ── Google Gemini API (key: AIza… or AQ.…) — ai.google.dev/gemini-api ─────
  // The options page can refresh this list from the live /v1beta/models
  // endpoint, which is authoritative; these are the stable ids to start from.
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, free tier)", provider: "gemini", suggested: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (strongest)", provider: "gemini" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (cheapest)", provider: "gemini" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" },
  // ── OpenRouter FREE (key: sk-or-…) — catalog checked 2026-11-15 ───────────
  // The suggested three: the strongest reasoner for a considered line, the
  // fastest route for in-hand answers, and the one model that does not think
  // by default at all, so nothing can eat the token budget.
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra 550B (Free, strongest)",
    provider: "openrouter",
    suggested: true,
    reasoningDefaultOn: true
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning (Free, fastest)",
    provider: "openrouter",
    suggested: true
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B A4B (Free, no thinking trace)",
    provider: "openrouter",
    suggested: true
  },
  // Also solid, just not the first pick.
  {
    id: "inclusionai/ling-3.2-flash:free",
    label: "Ling 3.2 Flash (Free, hybrid reasoning)",
    provider: "openrouter",
    reasoningDefaultOn: true
  },
  {
    // Preview route: OpenRouter lists expiration_date 2026-12-31 for it.
    id: "dots-studio/dots-3-note-preview:free",
    label: "Dots3-Note Preview (Free, expires 2026-12-31)",
    provider: "openrouter"
  },
  {
    // Dense 31B on a free route — historically the first one to rate-limit.
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B (Free, often rate-limited)",
    provider: "openrouter"
  },
  {
    // reasoning.mandatory with "high" as the only supported effort, so the
    // trace always comes and the cap has to cover it.
    id: "baidu/ernie-5.5-flash-preview:free",
    label: "ERNIE 5.5 Flash Preview (Free, always thinks)",
    provider: "openrouter",
    reasoningMandatory: true
  },
  {
    id: "thinkingmachines/inkling-2-small:free",
    label: "Inkling 2 Small (Free, always thinks)",
    provider: "openrouter",
    reasoningMandatory: true
  },
  // ── Multimodal free routes ───────────────────────────────────────────────
  // Nothing in this extension sends images yet; these are here as text models
  // with a larger upstream, and for a future screenshot-based table reader.
  {
    id: "nvidia/nemotron-3.5-super-vl:free",
    label: "Nemotron 3.5 Super VL (Free, vision)",
    provider: "openrouter"
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    label: "Nemotron 3 Nano Omni (Free, multimodal)",
    provider: "openrouter",
    reasoningDefaultOn: true
  },
  // ── Coding and lightweight free routes ───────────────────────────────────
  // Agentic coding models and a 1.7B fallback: the wrong shape for hand
  // analysis, useful when working on the copilot itself or when every other
  // free route is rate-limited.
  {
    id: "cohere/north-mini-code:free",
    label: "North Mini Code (Free, coding)",
    provider: "openrouter"
  },
  {
    id: "particle-ai/particle-1:free",
    label: "Particle-1 (Free, coding agent)",
    provider: "openrouter",
    reasoningDefaultOn: true
  },
  {
    id: "recursive/flint-v1.0:free",
    label: "Flint (Free, coding, always thinks)",
    provider: "openrouter",
    reasoningMandatory: true
  },
  {
    id: "liquid/lfm-3-1.7b:free",
    label: "LFM3 1.7B (Free, lightweight, always thinks)",
    provider: "openrouter",
    reasoningMandatory: true
  },
  // Picks at random among whichever free models are up right now. A useful
  // fallback, but the model behind it changes between requests.
  {
    id: "openrouter/free",
    label: "Free Models Router (random free model)",
    provider: "openrouter"
  },
  // ── Naga free tier — key prefix "ng-"; 10 req/min, 100 req/day ───────────
  // docs.naga.ac/build/rate-limits
  { id: "llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (Free via Naga)", provider: "naga", suggested: true },
  { id: "nemotron-3-super-120b-a12b:free", label: "Nemotron Super 120B (Free via Naga)", provider: "naga" },
  // Perplexity route behind Naga's proxy. Verified 2026-07-27: returns 503
  // "upstream source" for every request shape. Kept selectable because the
  // route has worked before and may recover — the retry logic and the explicit
  // 503 message in aiClient handle it while it is down.
  { id: "sonar:free", label: "Sonar (Free via Naga) — upstream flaky", provider: "naga" },
  // ── OpenRouter PAID (key: sk-or-…) ───────────────────────────────────────
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 (Paid)", provider: "openrouter" },
  { id: "openai/gpt-4o", label: "GPT-4o via OpenRouter (Paid)", provider: "openrouter" }
];
const RETIRED_MODELS = {
  // Ids that never existed upstream — shipped by an earlier edit of this file.
  "nvidia/nemotron-3-ultra:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni:free": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "dots-studio/dots3-note-preview:free": "dots-studio/dots-3-note-preview:free",
  "recursive/flint:free": "recursive/flint-v1.0:free",
  "thinkingmachines/inkling:free": "thinkingmachines/inkling-2-small:free",
  "thinkingmachines/inkling-small:free": "thinkingmachines/inkling-2-small:free",
  "xingchen-agi/xing4.0-29b-a4b:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "liquid/lfm-2.5-2.6b:free": "liquid/lfm-3-1.7b:free",
  // Gone from the free catalog.
  "nvidia/nemotron-3-super-120b-a12b:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free": "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-nano-9b-v2:free": "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-flash:free": "inclusionai/ling-3.2-flash:free",
  "openai/gpt-oss-20b:free": "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-120b:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "minimax/minimax-m3:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free": "inclusionai/ling-3.2-flash:free",
  "meta-llama/llama-3.3-70b-instruct:free": "inclusionai/ling-3.2-flash:free",
  "moonshotai/kimi-k2.6:free": "inclusionai/ling-3.2-flash:free",
  "qwen/qwen3-next-80b-a3b-instruct:free": "inclusionai/ling-3.2-flash:free",
  "meta-llama/llama-3.2-3b-instruct:free": "google/gemma-4-26b-a4b-it:free",
  // Naga (bare ids)
  "llama-4-scout-17b-16e-instruct:free": "llama-3.3-70b-instruct:free",
  "nemotron-3-ultra-550b-a55b:free": "nemotron-3-super-120b-a12b:free",
  // Paid
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-5"
};
function isKnownModel(id) {
  return AVAILABLE_MODELS.some((m) => m.id === id);
}
function hasReasoningOnByDefault(id) {
  return AVAILABLE_MODELS.some((m) => m.id === id && "reasoningDefaultOn" in m && m.reasoningDefaultOn);
}
function hasMandatoryReasoning(id) {
  return AVAILABLE_MODELS.some((m) => m.id === id && "reasoningMandatory" in m && m.reasoningMandatory);
}
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";
const NAGA_BASE_URL = "https://api.naga.ac/v1/chat/completions";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
function geminiStreamUrl(modelId) {
  return `${GEMINI_BASE_URL}/models/${modelId}:streamGenerateContent?alt=sse`;
}
const GEMINI_MODELS_URL = `${GEMINI_BASE_URL}/models`;
function canDisableThinking(modelId) {
  if (/^gemini-(1\.|2\.0)/.test(modelId)) return false;
  return modelId.includes("flash");
}
const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
const BACKOFF_BASE_MS = 1e3;
const BACKOFF_CAP_MS = 8e3;
const MAX_RETRY_AFTER_MS = 6e4;
const THRESHOLDS = {
  VPIP_TIGHT: 20,
  VPIP_LOOSE: 40,
  AF_PASSIVE: 1.5,
  AF_AGGRESSIVE: 3.5
};
const MIN_HANDS_FOR_STATS = 5;
const MANUAL_LOG_PULL_HANDS = 10;
const LOG_REQUEST_GAP_MS = 1200;
const LOG_REQUEST_LATENCY_MS = 500;
const STORAGE_KEYS = {
  SETTINGS: "copilot_settings",
  AGENT_ENGINE_SESSION: "copilot_agent_session"
};
const DEFAULT_SETTINGS = {
  apiKey: "",
  model: DEFAULT_MODEL,
  autoAnalyze: false,
  showOverlays: true,
  showSidePanel: true,
  // Never auto-acts unless you switch it on in the side panel, and it resets
  // to 'off' the moment you touch the table again.
  afkMode: "off",
  logPullHands: MANUAL_LOG_PULL_HANDS,
  agentEngineResource: "",
  agentEngineMode: "exploit"
};
function migrateModel(model) {
  if (!model) return DEFAULT_MODEL;
  if (isKnownModel(model)) return model;
  return RETIRED_MODELS[model] ?? model;
}
async function getSettings() {
  const stored = ((result) => result[STORAGE_KEYS.SETTINGS] ?? {})(
    await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  );
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  return {
    ...settings,
    // The key field used to be named after the only provider there was.
    apiKey: settings.apiKey || stored.openRouterApiKey || "",
    model: migrateModel(settings.model)
  };
}
async function setSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}
export {
  AVAILABLE_MODELS as A,
  BACKOFF_BASE_MS as B,
  GEMINI_MODELS_URL as G,
  LOG_REQUEST_GAP_MS as L,
  MANUAL_LOG_PULL_HANDS as M,
  NAGA_BASE_URL as N,
  OPENAI_BASE_URL as O,
  RETRYABLE_STATUSES as R,
  STORAGE_KEYS as S,
  THRESHOLDS as T,
  BACKOFF_CAP_MS as a,
  LOG_REQUEST_LATENCY_MS as b,
  MAX_ATTEMPTS as c,
  MAX_RETRY_AFTER_MS as d,
  MIN_HANDS_FOR_STATS as e,
  OPENROUTER_BASE_URL as f,
  canDisableThinking as g,
  geminiStreamUrl as h,
  getSettings as i,
  hasMandatoryReasoning as j,
  hasReasoningOnByDefault as k,
  setSettings as s
};
//# sourceMappingURL=storage.js.map
