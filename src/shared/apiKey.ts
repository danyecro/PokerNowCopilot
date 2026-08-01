import type { Provider } from './constants';

// HTTP header values must be ISO-8859-1. A key pasted from a web page often
// carries invisible passengers — non-breaking space, zero-width space, a BOM —
// and `fetch` then throws before any request goes out:
//   "Failed to read the 'headers' property from 'RequestInit':
//    String contains non ISO-8859-1 code point."
// That is permanent, not a network blip, so it must not be retried either.

const INVISIBLE = new RegExp(
  '[\\s\\u00A0\\u1680\\u2000-\\u200D\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]',
  'g',
);
const NON_LATIN1 = new RegExp('[^\\u0000-\\u00FF]');

/** Drops whitespace and zero-width characters that survive copy-paste. */
export function sanitizeApiKey(raw: string): string {
  return raw.replace(INVISIBLE, '');
}

/** Human-readable reason the key cannot be used, or null when it is fine. */
export function apiKeyProblem(key: string): string | null {
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

/**
 * The provider a key can authenticate against, from its prefix.
 *
 * Authoritative where it answers: a Naga key cannot talk to OpenRouter no
 * matter which model is selected. Google's AI Studio keys start with "AIza".
 */
export function providerFromKey(apiKey: string): Provider | null {
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  if (apiKey.startsWith('ng-'))    return 'naga';
  if (apiKey.startsWith('AIza'))   return 'gemini';
  if (apiKey.startsWith('sk-'))    return 'openai';
  return null;
}
