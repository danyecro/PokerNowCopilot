/**
 * Model catalog and endpoint configuration.
 *
 * The OpenRouter free list below was verified against the live catalog
 * (https://openrouter.ai/api/v1/models) on 2026-11-15: every id here was
 * present with zero pricing, and the reasoning flags are taken from each
 * model's own `reasoning` config rather than guessed. Free endpoint
 * availability, latency and rate limits change often — re-check before
 * trusting an id that starts returning 404.
 */

export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Which upstream a model is routed to. Explicit tag beats guessing from the key. */
export type Provider = 'openrouter' | 'naga' | 'openai' | 'gemini' | 'agentengine';

export type ModelEntry = {
  id: string;
  label: string;
  provider: Provider;

  /**
   * A model we recommend for this extension's workload: short, latency-bound
   * answers in the middle of a hand. The options page lists these first and
   * marks them with a star.
   */
  suggested?: boolean;

  /**
   * The model thinks by default and the trace is billed against `max_tokens`.
   * At our 400–600 token cap that can swallow the whole budget and the visible
   * answer arrives empty, so buildBody sends `reasoning: { enabled: false }`.
   */
  reasoningDefaultOn?: boolean;

  /**
   * Reasoning cannot be switched off at all (`reasoning.mandatory` upstream).
   * Disabling is not an option, so buildBody raises the token cap instead to
   * leave room for the trace plus the answer.
   */
  reasoningMandatory?: boolean;
};

export const AVAILABLE_MODELS = [
  // ── Google Gemini API (key: AIza… or AQ.…) — ai.google.dev/gemini-api ─────
  // The options page can refresh this list from the live /v1beta/models
  // endpoint, which is authoritative; these are the stable ids to start from.
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash (fast, free tier)', provider: 'gemini', suggested: true },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro (strongest)',         provider: 'gemini' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (cheapest)',   provider: 'gemini' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',                   provider: 'gemini' },

  // ── OpenRouter FREE (key: sk-or-…) — catalog checked 2026-11-15 ───────────
  // The suggested three: the strongest reasoner for a considered line, the
  // fastest route for in-hand answers, and the one model that does not think
  // by default at all, so nothing can eat the token budget.

  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'Nemotron 3 Ultra 550B (Free, strongest)',
    provider: 'openrouter',
    suggested: true,
    reasoningDefaultOn: true,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    label: 'Nemotron 3.5 Lightning (Free, fastest)',
    provider: 'openrouter',
    suggested: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Gemma 4 26B A4B (Free, no thinking trace)',
    provider: 'openrouter',
    suggested: true,
  },

  // Also solid, just not the first pick.

  {
    id: 'inclusionai/ling-3.2-flash:free',
    label: 'Ling 3.2 Flash (Free, hybrid reasoning)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },
  {
    // Preview route: OpenRouter lists expiration_date 2026-12-31 for it.
    id: 'dots-studio/dots-3-note-preview:free',
    label: 'Dots3-Note Preview (Free, expires 2026-12-31)',
    provider: 'openrouter',
  },
  {
    // Dense 31B on a free route — historically the first one to rate-limit.
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (Free, often rate-limited)',
    provider: 'openrouter',
  },
  {
    // reasoning.mandatory with "high" as the only supported effort, so the
    // trace always comes and the cap has to cover it.
    id: 'baidu/ernie-5.5-flash-preview:free',
    label: 'ERNIE 5.5 Flash Preview (Free, always thinks)',
    provider: 'openrouter',
    reasoningMandatory: true,
  },
  {
    id: 'thinkingmachines/inkling-2-small:free',
    label: 'Inkling 2 Small (Free, always thinks)',
    provider: 'openrouter',
    reasoningMandatory: true,
  },

  // ── Multimodal free routes ───────────────────────────────────────────────
  // Nothing in this extension sends images yet; these are here as text models
  // with a larger upstream, and for a future screenshot-based table reader.

  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    label: 'Nemotron 3.5 Super VL (Free, vision)',
    provider: 'openrouter',
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    label: 'Nemotron 3 Nano Omni (Free, multimodal)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  // ── Coding and lightweight free routes ───────────────────────────────────
  // Agentic coding models and a 1.7B fallback: the wrong shape for hand
  // analysis, useful when working on the copilot itself or when every other
  // free route is rate-limited.

  {
    id: 'cohere/north-mini-code:free',
    label: 'North Mini Code (Free, coding)',
    provider: 'openrouter',
  },
  {
    id: 'particle-ai/particle-1:free',
    label: 'Particle-1 (Free, coding agent)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },
  {
    id: 'recursive/flint-v1.0:free',
    label: 'Flint (Free, coding, always thinks)',
    provider: 'openrouter',
    reasoningMandatory: true,
  },
  {
    id: 'liquid/lfm-3-1.7b:free',
    label: 'LFM3 1.7B (Free, lightweight, always thinks)',
    provider: 'openrouter',
    reasoningMandatory: true,
  },

  // Picks at random among whichever free models are up right now. A useful
  // fallback, but the model behind it changes between requests.
  {
    id: 'openrouter/free',
    label: 'Free Models Router (random free model)',
    provider: 'openrouter',
  },

  // ── Naga free tier — key prefix "ng-"; 10 req/min, 100 req/day ───────────
  // docs.naga.ac/build/rate-limits
  { id: 'llama-3.3-70b-instruct:free',     label: 'Llama 3.3 70B (Free via Naga)',          provider: 'naga', suggested: true },
  { id: 'nemotron-3-super-120b-a12b:free', label: 'Nemotron Super 120B (Free via Naga)',    provider: 'naga' },
  // Perplexity route behind Naga's proxy. Verified 2026-07-27: returns 503
  // "upstream source" for every request shape. Kept selectable because the
  // route has worked before and may recover — the retry logic and the explicit
  // 503 message in aiClient handle it while it is down.
  { id: 'sonar:free',                      label: 'Sonar (Free via Naga) — upstream flaky', provider: 'naga' },

  // ── OpenRouter PAID (key: sk-or-…) ───────────────────────────────────────
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 (Paid)',       provider: 'openrouter' },
  { id: 'openai/gpt-4o',             label: 'GPT-4o via OpenRouter (Paid)', provider: 'openrouter' },
] as const satisfies ReadonlyArray<ModelEntry>;

/**
 * Models that were selectable in an earlier version but are dead or renamed.
 *
 * Stored settings pointing at one of these are migrated on read, so nobody
 * stays stuck on a 404 route. The slug-shape entries matter: OpenRouter keeps
 * the parameter count in several free ids, and a shortened guess at one is
 * simply a model that does not exist.
 */
export const RETIRED_MODELS: Readonly<Record<string, string>> = {
  // Ids that never existed upstream — shipped by an earlier edit of this file.
  'nvidia/nemotron-3-ultra:free':             'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super:free':             'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-nano-omni:free':         'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'dots-studio/dots3-note-preview:free':      'dots-studio/dots-3-note-preview:free',
  'recursive/flint:free':                     'recursive/flint-v1.0:free',
  'thinkingmachines/inkling:free':            'thinkingmachines/inkling-2-small:free',
  'thinkingmachines/inkling-small:free':      'thinkingmachines/inkling-2-small:free',
  'xingchen-agi/xing4.0-29b-a4b:free':        'nvidia/nemotron-3-ultra-550b-a55b:free',
  'liquid/lfm-2.5-2.6b:free':                 'liquid/lfm-3-1.7b:free',

  // Gone from the free catalog.
  'nvidia/nemotron-3-super-120b-a12b:free':   'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free':      'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-nano-9b-v2:free':          'nvidia/nemotron-3.5-lightning:free',
  'inclusionai/ling-3.0-flash:free':          'inclusionai/ling-3.2-flash:free',
  'openai/gpt-oss-20b:free':                  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-120b:free':                 'nvidia/nemotron-3-ultra-550b-a55b:free',
  'minimax/minimax-m3:free':                  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free': 'inclusionai/ling-3.2-flash:free',
  'meta-llama/llama-3.3-70b-instruct:free':   'inclusionai/ling-3.2-flash:free',
  'moonshotai/kimi-k2.6:free':                'inclusionai/ling-3.2-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free':    'inclusionai/ling-3.2-flash:free',
  'meta-llama/llama-3.2-3b-instruct:free':    'google/gemma-4-26b-a4b-it:free',

  // Naga (bare ids)
  'llama-4-scout-17b-16e-instruct:free':      'llama-3.3-70b-instruct:free',
  'nemotron-3-ultra-550b-a55b:free':          'nemotron-3-super-120b-a12b:free',

  // Paid
  'anthropic/claude-sonnet-4-5':              'anthropic/claude-sonnet-5',
};

/** True when the id is present in the local catalog. */
export function isKnownModel(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id);
}

/** True for a model we recommend for in-hand analysis. */
export function isSuggestedModel(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id && 'suggested' in m && m.suggested);
}

/** True when this model burns max_tokens on a reasoning trace by default. */
export function hasReasoningOnByDefault(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id && 'reasoningDefaultOn' in m && m.reasoningDefaultOn);
}

/** True when the reasoning trace cannot be switched off for this model. */
export function hasMandatoryReasoning(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id && 'reasoningMandatory' in m && m.reasoningMandatory);
}

/** The migration target for a retired id, or undefined when none applies. */
export function getRetiredModelReplacement(id: string): string | undefined {
  return RETIRED_MODELS[id];
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';
export const NAGA_BASE_URL = 'https://api.naga.ac/v1/chat/completions';

/** The live catalog — the authoritative answer on which free ids exist. */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

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

// ── Poker-stat thresholds ────────────────────────────────────────────────────

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

// ── Hand-history ingestion ───────────────────────────────────────────────────

export const HAND_END_DEBOUNCE_MS = 600;
export const LOG_MODAL_TIMEOUT_MS = 3000;

/** Default number of hands fetched by a manual log pull. */
export const MANUAL_LOG_PULL_HANDS = 10;

/** Minimum gap between consecutive log_v3 requests. */
export const LOG_REQUEST_GAP_MS = 1200;

/** Approximate endpoint latency. */
export const LOG_REQUEST_LATENCY_MS = 500;

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
  AGENT_ENGINE_SESSION: 'copilot_agent_session',
  PLAYER_NOTE_PREFIX: 'player_note_',
} as const;
