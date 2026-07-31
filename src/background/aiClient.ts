import type { GameState, PlayerStats } from '../shared/types';
import { getSettings } from '../shared/storage';
import {
  AVAILABLE_MODELS,
  OPENROUTER_BASE_URL,
  OPENAI_BASE_URL,
  NAGA_BASE_URL,
  MAX_ATTEMPTS,
  RETRYABLE_STATUSES,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  MAX_RETRY_AFTER_MS,
  hasReasoningOnByDefault,
  type Provider,
} from '../shared/constants';
import { buildPrompt, buildExploitPrompt } from './promptBuilder';

let currentAbortController: AbortController | null = null;

export type StreamCallback  = (chunk: string)  => void;
export type DoneCallback    = ()               => void;
export type ErrorCallback   = (error: string)  => void;
export type StatusCallback  = (label: string)  => void;

// ── API key hygiene ───────────────────────────────────────────────────────────
// HTTP header values must be ISO-8859-1. A key pasted from a web page often
// carries invisible passengers — non-breaking space, zero-width space, a BOM —
// and `fetch` then throws before any request goes out:
//   "Failed to read the 'headers' property from 'RequestInit':
//    String contains non ISO-8859-1 code point."
// That is permanent, not a network blip, so it must not be retried either.

const INVISIBLE = /[\s\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
const NON_LATIN1 = /[^\u0000-\u00FF]/;

/** Drops whitespace and zero-width characters that survive copy-paste. */
export function sanitizeApiKey(raw: string): string {
  return raw.replace(INVISIBLE, '');
}

/** Human-readable reason the key cannot be used, or null when it is fine. */
function apiKeyProblem(key: string): string | null {
  if (!key) return 'No API key configured. Please add it in the extension settings.';
  const match = NON_LATIN1.exec(key);
  if (match) {
    const cp = match[0].codePointAt(0) ?? 0;
    const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    return `API key contains a character that cannot be sent in an HTTP header `
         + `(${hex} at position ${key.indexOf(match[0]) + 1} of ${key.length}). `
         + `Re-enter the key as plain text in the extension settings.`;
  }
  return null;
}

// ── Endpoint resolver ─────────────────────────────────────────────────────────

/** The key decides which service can authenticate us at all. */
function providerFromKey(apiKey: string): Provider | null {
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  if (apiKey.startsWith('ng-'))    return 'naga';
  if (apiKey.startsWith('sk-'))    return 'openai';
  return null;
}

function resolveProvider(apiKey: string, model: string): Provider {
  // Key prefix is authoritative: a Naga key cannot talk to OpenRouter no matter
  // which model is selected. Fall back to the catalog tag for unknown prefixes.
  return providerFromKey(apiKey)
      ?? AVAILABLE_MODELS.find(m => m.id === model)?.provider
      ?? 'naga';
}

/**
 * Catches the common misconfiguration of a model from provider A selected while
 * a provider-B key is saved — otherwise the user just gets a bare 404.
 */
function modelProviderMismatch(provider: Provider, model: string): string | null {
  const known = AVAILABLE_MODELS.find(m => m.id === model);
  if (!known || known.provider === provider) return null;
  const usable = AVAILABLE_MODELS.filter(m => m.provider === provider).map(m => m.id);
  return `Model "${model}" belongs to ${known.provider}, but the saved API key is a ${provider} key. `
       + `Pick one of these in the extension settings: ${usable.join(', ')}`;
}

function resolveEndpointAndHeaders(apiKey: string, model: string): {
  provider: Provider;
  url: string;
  headers: Record<string, string>;
  modelId: string;
} {
  const provider = resolveProvider(apiKey, model);
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://www.pokernow.com';
    headers['X-Title']      = 'PokerNow Copilot';
    return { provider, url: OPENROUTER_BASE_URL, headers, modelId: model };
  }

  if (provider === 'naga') {
    // Naga model ids are bare (e.g. "sonar:free") — no vendor prefix.
    return { provider, url: NAGA_BASE_URL, headers, modelId: model };
  }

  // OpenAI directly — strip the "openai/" prefix if it came from an OR id.
  const modelId = model.startsWith('openai/') ? model.slice(7) : model;
  return { provider, url: OPENAI_BASE_URL, headers, modelId };
}

// ── Request body ──────────────────────────────────────────────────────────────

/**
 * Naga's chat-completions schema has no `max_tokens` — the output cap is
 * `max_completion_tokens`. Sending the legacy name gets the request rejected
 * or forwarded malformed to the upstream provider.
 * docs.naga.ac/api-reference/chat-completions/create-a-chat-completion
 */
function buildBody(
  provider: Provider,
  modelId: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): object {
  const base: Record<string, unknown> = {
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    stream: true,
    temperature,
  };

  if (provider === 'naga') {
    return { ...base, max_completion_tokens: maxTokens };
  }

  // Most of OpenRouter's current free models are reasoning models with thinking
  // on by default, and reasoning tokens count against max_tokens. At 400–600
  // tokens the trace can consume the entire budget and the visible answer comes
  // back empty or truncated mid-sentence, so switch it off.
  if (provider === 'openrouter' && hasReasoningOnByDefault(modelId)) {
    base.reasoning = { enabled: false };
  }
  return { ...base, max_tokens: maxTokens };
}

// ── Retry-aware fetch ─────────────────────────────────────────────────────────

/** Naga/OpenAI/OpenRouter all wrap errors as { error: { type, message } }. */
function parseApiError(text: string): { type?: string; message?: string; retryAfterSec?: number } {
  try {
    const parsed = JSON.parse(text);
    const err = parsed?.error ?? parsed;
    const retryAfterSec =
      err?.metadata?.retry_after_seconds ??
      err?.metadata?.retry_after_seconds_raw ??
      undefined;
    return {
      type:    typeof err?.type === 'string' ? err.type : undefined,
      message: typeof err?.message === 'string' ? err.message : undefined,
      retryAfterSec: typeof retryAfterSec === 'number' ? retryAfterSec : undefined,
    };
  } catch {
    return {};
  }
}

/** Human-readable label for the terminal (non-retryable) status codes. */
function describeStatus(status: number, model: string): string | null {
  switch (status) {
    case 400: return 'Bad request — the model rejected the payload.';
    case 401: return 'Invalid or missing API key. Check the key in the extension settings.';
    case 402: return 'Insufficient credits on the API account.';
    case 403: return 'Forbidden — this key is not allowed to use this model.';
    case 404: return `Model "${model}" not found on this provider.`;
    case 410: return `Model "${model}" is deprecated — pick another one in settings.`;
    case 422: return 'Validation error — the request body was rejected.';
    default:  return null;
  }
}

/** Capped exponential backoff with jitter; honors Retry-After when present. */
function backoffMs(attempt: number, resp: Response, parsed: { retryAfterSec?: number }): number {
  const header = resp.headers.get('retry-after');
  const headerSec = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : undefined;
  const explicitSec = headerSec ?? parsed.retryAfterSec;
  if (explicitSec !== undefined) {
    return Math.min(explicitSec * 1000, MAX_RETRY_AFTER_MS);
  }
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return capped + Math.floor(Math.random() * 250); // jitter
}

/**
 * Fetches a streaming OpenAI-compatible endpoint.
 * Retries the transient statuses (429/5xx — Naga documents 503 as an upstream
 * failure that should be retried with capped backoff) up to MAX_ATTEMPTS times,
 * calling onStatus each time so the UI can show what's happening. Client errors
 * (400/401/402/403/404/410/422) fail immediately with a readable message.
 */
async function fetchStreamWithRetry(
  url: string,
  body: object,
  headers: Record<string, string>,
  model: string,
  signal: AbortSignal,
  onStatus: StatusCallback,
  onError: ErrorCallback,
): Promise<Response | null> {
  const payload = JSON.stringify(body);
  let lastDetail = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, { method: 'POST', headers, body: payload, signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      lastDetail = err instanceof Error ? err.message : String(err);
      // A TypeError means fetch rejected the request before sending it (bad
      // header value, malformed URL). Retrying cannot change the outcome.
      if (err instanceof TypeError) {
        onError(`Request rejected by the browser: ${lastDetail}`);
        return null;
      }
      // Network-level failure (DNS, TLS, offline) — worth one more try.
      if (attempt >= MAX_ATTEMPTS) {
        onError(`Network error after ${MAX_ATTEMPTS} attempts: ${lastDetail}`);
        return null;
      }
      const waitMs = backoffMs(attempt, new Response(), {});
      onStatus(`🔌 Network error — retrying in ${Math.round(waitMs / 1000)}s… (${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(waitMs);
      continue;
    }

    if (resp.ok) return resp;

    const text = await resp.text();
    const parsed = parseApiError(text);
    lastDetail = parsed.message ?? text.slice(0, 300) ?? '';

    // Terminal — retrying cannot help.
    if (!RETRYABLE_STATUSES.includes(resp.status)) {
      const label = describeStatus(resp.status, model) ?? `API error ${resp.status}`;
      onError(lastDetail ? `${label} (${lastDetail})` : label);
      return null;
    }

    if (attempt >= MAX_ATTEMPTS) {
      if (resp.status === 429) {
        onError(
          `Rate limited — ${MAX_ATTEMPTS} attempts exhausted. Free tier allows ` +
          `10 requests/min and 100/day. Wait a moment and try again.` +
          (lastDetail ? ` (${lastDetail})` : ''),
        );
      } else {
        // A 5xx that survives every retry usually means this model's upstream
        // route is down at the provider, not a transient blip.
        onError(
          `Upstream error ${resp.status} on "${model}" after ${MAX_ATTEMPTS} attempts. ` +
          `This model's provider route is likely down — switch model in the extension settings.` +
          (lastDetail ? ` (${lastDetail})` : ''),
        );
      }
      return null;
    }

    const waitMs = backoffMs(attempt, resp, parsed);
    const icon = resp.status === 429 ? '⏳' : '♻️';
    const what = resp.status === 429 ? 'Rate limited' : `Upstream ${resp.status}`;
    onStatus(`${icon} ${what} — retrying in ${Math.round(waitMs / 1000)}s… (${attempt}/${MAX_ATTEMPTS - 1})`);
    await sleep(waitMs);
  }

  onError(`Request failed after ${MAX_ATTEMPTS} attempts${lastDetail ? `: ${lastDetail}` : ''}`);
  return null;
}

// ── SSE stream reader ─────────────────────────────────────────────────────────

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: StreamCallback,
  onDone: DoneCallback,
  onError: ErrorCallback,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /** Returns true when the stream is finished and the caller should stop. */
  const handleLine = (line: string): boolean => {
    // Some providers omit the space after "data:"; ": keep-alive" comments
    // and empty lines are skipped.
    if (!line.startsWith('data:')) return false;
    const data = line.slice(5).trim();
    if (!data) return false;
    if (data === '[DONE]') { onDone(); return true; }

    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      return false; // skip malformed line
    }
    // Errors can arrive mid-stream after a 200 — surface them instead of
    // ending with an empty answer.
    if (payload?.error) {
      onError(payload.error.message ?? `Stream error: ${JSON.stringify(payload.error)}`);
      return true;
    }
    const content = payload?.choices?.[0]?.delta?.content;
    if (content) onChunk(content);
    // Naga closes the stream after a chunk carrying finish_reason instead of
    // sending the [DONE] sentinel, so treat that as terminal too.
    return Boolean(payload?.choices?.[0]?.finish_reason);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (handleLine(line)) return;
      }
    }
    // Flush a trailing line left over when the body ends without a newline.
    if (buffer.trim() && handleLine(buffer)) return;
    onDone();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    reader.releaseLock();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzeHand(
  gameState: GameState,
  stats: Record<string, PlayerStats>,
  onChunk:  StreamCallback,
  onDone:   DoneCallback,
  onError:  ErrorCallback,
  onStatus: StatusCallback,
): Promise<void> {
  currentAbortController?.abort();
  currentAbortController = new AbortController();

  const settings = await getSettings();
  const apiKey = sanitizeApiKey(settings.openRouterApiKey);
  const keyProblem = apiKeyProblem(apiKey);
  if (keyProblem) { onError(keyProblem); return; }

  const { provider, url, headers, modelId } = resolveEndpointAndHeaders(
    apiKey,
    settings.model,
  );
  const mismatch = modelProviderMismatch(provider, settings.model);
  if (mismatch) { onError(mismatch); return; }

  const { system, user } = buildPrompt(gameState, stats);

  try {
    const resp = await fetchStreamWithRetry(
      url,
      buildBody(provider, modelId, system, user, 600, 0.3),
      headers,
      modelId,
      currentAbortController.signal,
      onStatus,
      onError,
    );
    if (!resp) return;
    if (!resp.body) { onError('No response body'); return; }
    await readSSEStream(resp.body, onChunk, onDone, onError);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    onError(err instanceof Error ? err.message : String(err));
  }
}

export async function analyzeExploit(
  target: import('../shared/types').PlayerStats,
  gameState: import('../shared/types').GameState | null,
  onChunk:  StreamCallback,
  onDone:   DoneCallback,
  onError:  ErrorCallback,
  onStatus: StatusCallback,
): Promise<void> {
  currentAbortController?.abort();
  currentAbortController = new AbortController();

  const settings = await getSettings();
  const apiKey = sanitizeApiKey(settings.openRouterApiKey);
  const keyProblem = apiKeyProblem(apiKey);
  if (keyProblem) { onError(keyProblem); return; }

  const { provider, url, headers, modelId } = resolveEndpointAndHeaders(
    apiKey,
    settings.model,
  );
  const mismatch = modelProviderMismatch(provider, settings.model);
  if (mismatch) { onError(mismatch); return; }

  const { system, user } = buildExploitPrompt(target, gameState);

  try {
    const resp = await fetchStreamWithRetry(
      url,
      buildBody(provider, modelId, system, user, 400, 0.25),
      headers,
      modelId,
      currentAbortController.signal,
      onStatus,
      onError,
    );
    if (!resp) return;
    if (!resp.body) { onError('No response body'); return; }
    await readSSEStream(resp.body, onChunk, onDone, onError);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    onError(err instanceof Error ? err.message : String(err));
  }
}

export function cancelAnalysis(): void {
  currentAbortController?.abort();
  currentAbortController = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
