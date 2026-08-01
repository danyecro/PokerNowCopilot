export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Which upstream a model is routed to. Explicit tag beats guessing from the key. */
export type Provider = 'openrouter' | 'naga' | 'openai' | 'gemini';

type ModelEntry = {
  id: string;
  label: string;
  provider: Provider;
  /**
   * OpenRouter model whose `reasoning_config.default_reasoning_enabled` is true.
   * Reasoning tokens are billed against `max_tokens`, so with our 400–600 token
   * cap the thinking trace can eat the whole budget and the answer comes back
   * empty. buildBody sends `reasoning: { enabled: false }` for these.
   */
  reasoningDefaultOn?: boolean;
};

export const AVAILABLE_MODELS = [
  // ── Google Gemini API (key: AIza...) — ai.google.dev/gemini-api ───────────
  // The options page can refresh this list from the live /v1beta/models
  // endpoint, which is authoritative; these are the stable ids to start from.
  { id: 'gemini-2.5-flash',      label: '⭐ Gemini 2.5 Flash (fast, free tier)', provider: 'gemini' },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro (strongest)',            provider: 'gemini' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (cheapest)',      provider: 'gemini' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',                      provider: 'gemini' },
  // ── OpenRouter FREE (key: sk-or-...) — catalog checked 2026-07-27 ─────────
  // Excluded from the live free list on purpose:
  //   google/gemma-4-31b-it:free            90% of requests rate-limited (11k ok / 103k limited per day)
  //   poolside/laguna-s-2.1:free            31% rate-limited
  //   poolside/laguna-m.1:free              deprecation_date 2026-07-28
  //   poolside/laguna-xs-2.1:free           agentic-coding model, wrong fit
  //   nvidia/nemotron-nano-12b-v2-vl:free   endpoint status -2 (deranked)
  //   nvidia/nemotron-3.5-content-safety    guardrail classifier, not a chat model
  //   *-embed-*, *-rerank-*                 embeddings/rerank endpoints
  { id: 'inclusionai/ling-3.0-flash:free',           label: '⭐ Ling 3.0 Flash (Free, Fastest)',      provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free',    label: 'Nemotron 3 Ultra 550B (Free, Smartest)', provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',    label: 'Nemotron 3 Super 120B (Free)',          provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'google/gemma-4-26b-a4b-it:free',            label: 'Gemma 4 26B (Free, no reasoning)',      provider: 'openrouter' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',       label: 'Nemotron 3 Nano 30B (Free, lowest TTFB)', provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'openai/gpt-oss-20b:free',                   label: 'GPT-OSS 20B (Free)',                    provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'nvidia/nemotron-nano-9b-v2:free',           label: 'Nemotron Nano 9B v2 (Free)',            provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'cohere/north-mini-code:free',               label: 'North Mini Code (Free, 15 req/min)',    provider: 'openrouter', reasoningDefaultOn: true },
  { id: 'openrouter/free',                           label: 'Free Models Router (random free model)', provider: 'openrouter' },
  // ── Naga free tier — key prefix "ng-"; 10 req/min, 100 req/day ────────────
  // docs.naga.ac/build/rate-limits
  { id: 'llama-3.3-70b-instruct:free',               label: '⭐ Llama 3.3 70B (Free via Naga)',      provider: 'naga' },
  { id: 'nemotron-3-super-120b-a12b:free',           label: 'Nemotron Super 120B (Free via Naga)',  provider: 'naga' },
  // Perplexity route behind Naga's proxy. Verified 2026-07-27: returns 503
  // "upstream source" for every request shape. Kept selectable because the
  // route has worked before and may recover — the retry logic and the explicit
  // 503 message in aiClient handle it while it is down.
  { id: 'sonar:free',                                label: 'Sonar (Free via Naga) — upstream flaky', provider: 'naga' },
  // ── OpenRouter PAID (key: sk-or-...) ─────────────────────────────────────
  // NOTE: the old 'anthropic/claude-sonnet-4-5' id used the wrong slug shape;
  // OpenRouter's own traffic data lists 'anthropic/claude-sonnet-5-20260630'.
  { id: 'anthropic/claude-sonnet-5',                 label: 'Claude Sonnet 5 (Paid)',               provider: 'openrouter' },
  { id: 'openai/gpt-4o',                             label: 'GPT-4o via OpenRouter (Paid)',         provider: 'openrouter' },
] as const satisfies ReadonlyArray<ModelEntry>;

/**
 * Models that were selectable in an earlier version but are dead or removed.
 * Stored settings pointing at these are silently migrated on read, so a user
 * who picked sonar:free does not stay stuck on a 503 route.
 */
export const RETIRED_MODELS: Readonly<Record<string, string>> = {
  // Naga (bare ids)
  'llama-4-scout-17b-16e-instruct:free':             'llama-3.3-70b-instruct:free',
  'nemotron-3-ultra-550b-a55b:free':                 'nemotron-3-super-120b-a12b:free',
  // OpenRouter (vendor-prefixed ids) — gone from the free catalog as of 2026-07-27
  'nousresearch/hermes-3-llama-3.1-405b:free':       'inclusionai/ling-3.0-flash:free',
  'meta-llama/llama-3.3-70b-instruct:free':          'inclusionai/ling-3.0-flash:free',
  'moonshotai/kimi-k2.6:free':                       'inclusionai/ling-3.0-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free':           'inclusionai/ling-3.0-flash:free',
  'openai/gpt-oss-120b:free':                        'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.2-3b-instruct:free':           'nvidia/nemotron-3-nano-30b-a3b:free',
  'anthropic/claude-sonnet-4-5':                     'anthropic/claude-sonnet-5',
};

export function isKnownModel(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id);
}

/** True when this OpenRouter model burns max_tokens on a reasoning trace by default. */
export function hasReasoningOnByDefault(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id && 'reasoningDefaultOn' in m && m.reasoningDefaultOn);
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';
export const NAGA_BASE_URL = 'https://api.naga.ac/v1/chat/completions';

// ── Gemini ────────────────────────────────────────────────────────────────────
// Not OpenAI-compatible: model in the path, key in x-goog-api-key, its own
// request and stream shapes. ai.google.dev/gemini-api/docs
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Server-sent-events variant of generateContent for the given model. */
export function geminiStreamUrl(modelId: string): string {
  return `${GEMINI_BASE_URL}/models/${modelId}:streamGenerateContent?alt=sse`;
}

/** Lists the models this key may call — the live truth about available ids. */
export const GEMINI_MODELS_URL = `${GEMINI_BASE_URL}/models`;

/**
 * True for Gemini models whose thinking budget can be set to zero.
 *
 * 2.5 models think by default and those tokens count against maxOutputTokens,
 * the same trap the OpenRouter reasoning models set: at a 600-token cap the
 * trace eats the budget and the visible answer arrives empty. Flash and
 * Flash-Lite accept a budget of 0; Pro rejects it (128 is its minimum), so it
 * keeps thinking and gets a larger cap instead.
 */
export function canDisableThinking(modelId: string): boolean {
  // Thinking arrived with the 2.5 series; sending thinkingConfig to an older
  // model is a 400, so the generations that never had it are excluded rather
  // than matched for — a future 3.x Flash should get the budget switched off.
  if (/^gemini-(1\.|2\.0)/.test(modelId)) return false;
  return modelId.includes('flash');
}

// ── Retry policy ──────────────────────────────────────────────────────────────
// Naga documents 503 as "upstream service error — retry with capped backoff",
// and the same for 429/500. 400/401/402/403/410/422 are terminal.
// docs.naga.ac/build/error-handling
export const MAX_ATTEMPTS = 4;
export const RETRYABLE_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504];
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 8000;
/** Never sleep longer than this for a Retry-After — better to fail fast in-hand. */
export const MAX_RETRY_AFTER_MS = 60_000;

// Stat thresholds for badge coloring
export const THRESHOLDS = {
  VPIP_TIGHT: 20,
  VPIP_LOOSE: 40,
  PFR_PASSIVE: 10,
  PFR_AGGRESSIVE: 25,
  AF_PASSIVE: 1.5,
  AF_AGGRESSIVE: 3.5,
} as const;

// Min hands before showing stats/tags
export const MIN_HANDS_FOR_STATS = 5;
export const MIN_HANDS_FOR_TAGS = 10;

// Log pull timing
export const HAND_END_DEBOUNCE_MS = 600;
export const LOG_MODAL_TIMEOUT_MS = 3000;

// Default hand count of a manual log pull (the side panel's Log dropdown).
export const MANUAL_LOG_PULL_HANDS = 10;

// Ingested hand ids kept on disk. Enough to cover any realistic backfill; the
// oldest are dropped first, and a hand that falls out can at worst be counted
// twice if it is pulled again much later.
export const SEEN_HAND_IDS_LIMIT = 5000;

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'copilot_settings',
  ALL_PLAYER_STATS: 'copilot_player_stats',
  HERO_STATS: 'copilot_hero_stats',
  SESSION_NAME_MAP: 'copilot_name_map',
  SEEN_HAND_IDS: 'copilot_seen_hand_ids',
  PLAYER_NOTE_PREFIX: 'player_note_',
} as const;
