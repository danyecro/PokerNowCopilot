/**
 * OpenRouter-only model configuration for the Poker Copilot.
 *
 * Verify free model IDs against:
 * https://openrouter.ai/api/v1/models
 *
 * Free endpoint availability, latency, and rate limits may change.
 */

export const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra:free';

export type Provider = 'openrouter';

export type ModelEntry = {
  id: string;
  label: string;
  provider: Provider;

  /**
   * True when reasoning is enabled by default for the model.
   *
   * buildBody should explicitly disable reasoning for models in this list
   * when low latency and a small visible-output budget are important.
   *
   * Do not assume every model supports the same reasoning parameters.
   */
  reasoningDefaultOn?: boolean;
};

export const AVAILABLE_MODELS = [
  // ── Recommended for complex poker analysis ────────────────────────────────

  {
    id: 'nvidia/nemotron-3-ultra:free',
    label: '⭐ Nemotron 3 Ultra (Free, Deep Analysis)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  {
    id: 'nvidia/nemotron-3-super:free',
    label: 'Nemotron 3 Super (Free, Strategic Analysis)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  // ── Efficient models for real-time assistance ────────────────────────────

  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    label: '⚡ Nemotron 3.5 Lightning (Free, Fast)',
    provider: 'openrouter',
  },

  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Gemma 4 26B A4B (Free, Efficient)',
    provider: 'openrouter',
  },

  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (Free, General Purpose)',
    provider: 'openrouter',
  },

  // ── General reasoning and agent workflows ────────────────────────────────

  {
    id: 'thinkingmachines/inkling:free',
    label: 'Inkling (Free, General Reasoning)',
    provider: 'openrouter',
  },

  {
    id: 'thinkingmachines/inkling-small:free',
    label: 'Inkling Small (Free, Efficient Reasoning)',
    provider: 'openrouter',
  },

  {
    id: 'dots-studio/dots3-note-preview:free',
    label: 'Dots3-Note Preview (Free, Reasoning)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  {
    id: 'xingchen-agi/xing4.0-29b-a4b:free',
    label: 'Xing4.0 29B A4B (Free, Agentic Reasoning)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  // ── Coding models: useful for developing the copilot itself ──────────────

  {
    id: 'cohere/north-mini-code:free',
    label: 'North Mini Code (Free, Coding)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  {
    id: 'recursive/flint:free',
    label: 'Flint (Free, Coding Agent)',
    provider: 'openrouter',
  },

  // ── Multimodal models ────────────────────────────────────────────────────

  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    label: 'Nemotron 3.5 Super VL (Free, Vision)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  {
    id: 'nvidia/nemotron-3-nano-omni:free',
    label: 'Nemotron 3 Nano Omni (Free, Multimodal)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  // ── Lightweight fallback ────────────────────────────────────────────────

  {
    id: 'liquid/lfm-2.5-2.6b:free',
    label: 'LFM2.5 2.6B (Free, Lightweight)',
    provider: 'openrouter',
    reasoningDefaultOn: true,
  },

  // ── Dynamic fallback ─────────────────────────────────────────────────────

  {
    id: 'openrouter/free',
    label: 'Free Models Router (Automatic Selection)',
    provider: 'openrouter',
  },
] as const satisfies ReadonlyArray<ModelEntry>;

/**
 * Models selectable in an earlier version that should be migrated.
 *
 * Always verify the target IDs against the live OpenRouter catalog.
 */
export const RETIRED_MODELS: Readonly<Record<string, string>> = {
  // Previous OpenRouter model IDs
  'nvidia/nemotron-3-ultra-550b-a55b:free':
    'nvidia/nemotron-3-ultra:free',

  'nvidia/nemotron-3-super-120b-a12b:free':
    'nvidia/nemotron-3-super:free',

  'nvidia/nemotron-3-nano-30b-a3b:free':
    'nvidia/nemotron-3.5-lightning:free',

  'nvidia/nemotron-nano-9b-v2:free':
    'nvidia/nemotron-3.5-lightning:free',

  'openai/gpt-oss-20b:free':
    'google/gemma-4-26b-a4b-it:free',

  'inclusionai/ling-3.0-flash:free':
    'nvidia/nemotron-3-ultra:free',

  'minimax/minimax-m3:free':
    'nvidia/nemotron-3-ultra:free',

  'nousresearch/hermes-3-llama-3.1-405b:free':
    'nvidia/nemotron-3-ultra:free',

  'meta-llama/llama-3.3-70b-instruct:free':
    'nvidia/nemotron-3-ultra:free',

  'moonshotai/kimi-k2.6:free':
    'nvidia/nemotron-3-ultra:free',

  'qwen/qwen3-next-80b-a3b-instruct:free':
    'nvidia/nemotron-3-ultra:free',

  'openai/gpt-oss-120b:free':
    'nvidia/nemotron-3-ultra:free',

  'meta-llama/llama-3.2-3b-instruct:free':
    'google/gemma-4-26b-a4b-it:free',

  // Previous non-free model selection
  'anthropic/claude-sonnet-5':
    'nvidia/nemotron-3-ultra:free',

  'openai/gpt-4o':
    'nvidia/nemotron-3-ultra:free',
};

/**
 * True when the ID is present in the local model catalog.
 */
export function isKnownModel(id: string): boolean {
  return AVAILABLE_MODELS.some((model) => model.id === id);
}

/**
 * True when reasoning is expected to be enabled by default.
 */
export function hasReasoningOnByDefault(id: string): boolean {
  return AVAILABLE_MODELS.some(
    (model) =>
      model.id === id &&
      'reasoningDefaultOn' in model &&
      model.reasoningDefaultOn === true,
  );
}

/**
 * Returns the migration target for a retired model ID.
 *
 * Returns undefined when no migration is required.
 */
export function getRetiredModelReplacement(
  id: string,
): string | undefined {
  return RETIRED_MODELS[id];
}

/**
 * Returns a usable local model ID.
 *
 * Unknown or retired IDs fall back to DEFAULT_MODEL.
 */
export function normalizeModelId(id: string): string {
  if (isKnownModel(id)) {
    return id;
  }

  const replacement = getRetiredModelReplacement(id);

  if (replacement && isKnownModel(replacement)) {
    return replacement;
  }

  return DEFAULT_MODEL;
}

// ── OpenRouter ──────────────────────────────────────────────────────────────

export const OPENROUTER_BASE_URL =
  'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_MODELS_URL =
  'https://openrouter.ai/api/v1/models';

// ── Retry policy ────────────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 4;

export const RETRYABLE_STATUSES: readonly number[] = [
  408,
  429,
  500,
  502,
  503,
  504,
];

export const BACKOFF_BASE_MS = 1000;

export const BACKOFF_CAP_MS = 8000;

/**
 * Never sleep longer than this for a Retry-After header.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

// ── Poker-stat thresholds ──────────────────────────────────────────────────

export const THRESHOLDS = {
  VPIP_TIGHT: 20,
  VPIP_LOOSE: 40,
  PFR_PASSIVE: 10,
  PFR_AGGRESSIVE: 25,
  AF_PASSIVE: 1.5,
  AF_AGGRESSIVE: 3.5,
} as const;

// ── Minimum hand counts ────────────────────────────────────────────────────

export const MIN_HANDS_FOR_STATS = 5;

export const MIN_HANDS_FOR_TAGS = 10;

// ── Hand-history ingestion ─────────────────────────────────────────────────

export const HAND_END_DEBOUNCE_MS = 600;

export const LOG_MODAL_TIMEOUT_MS = 3000;

/**
 * Default number of hands fetched by a manual log pull.
 */
export const MANUAL_LOG_PULL_HANDS = 10;

/**
 * Minimum gap between consecutive log_v3 requests.
 */
export const LOG_REQUEST_GAP_MS = 1200;

/**
 * Approximate endpoint latency.
 */
export const LOG_REQUEST_LATENCY_MS = 500;

/**
 * Maximum number of ingested hand IDs retained locally.
 */
export const SEEN_HAND_IDS_LIMIT = 5000;

// ── Storage keys ────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  SETTINGS: 'copilot_settings',
  ALL_PLAYER_STATS: 'copilot_player_stats',
  HERO_STATS: 'copilot_hero_stats',
  SESSION_NAME_MAP: 'copilot_name_map',
  SEEN_HAND_IDS: 'copilot_seen_hand_ids',
  AGENT_ENGINE_SESSION: 'copilot_agent_session',
  PLAYER_NOTE_PREFIX: 'player_note_',
} as const;
```