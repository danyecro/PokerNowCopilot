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
function hasReasoningOnByDefault(id) {
  return AVAILABLE_MODELS.some((m) => m.id === id && "reasoningDefaultOn" in m && m.reasoningDefaultOn);
}
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";
const NAGA_BASE_URL = "https://api.naga.ac/v1/chat/completions";
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
const STORAGE_KEYS = {
  SETTINGS: "copilot_settings"
};
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
export {
  AVAILABLE_MODELS as A,
  BACKOFF_BASE_MS as B,
  MANUAL_LOG_PULL_HANDS as M,
  NAGA_BASE_URL as N,
  OPENAI_BASE_URL as O,
  RETRYABLE_STATUSES as R,
  STORAGE_KEYS as S,
  THRESHOLDS as T,
  BACKOFF_CAP_MS as a,
  MAX_ATTEMPTS as b,
  MAX_RETRY_AFTER_MS as c,
  MIN_HANDS_FOR_STATS as d,
  OPENROUTER_BASE_URL as e,
  getSettings as g,
  hasReasoningOnByDefault as h,
  setSettings as s
};
//# sourceMappingURL=storage.js.map
