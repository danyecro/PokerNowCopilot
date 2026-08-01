const INVISIBLE = new RegExp(
  "[\\s\\u00A0\\u1680\\u2000-\\u200D\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]",
  "g"
);
const NON_LATIN1 = new RegExp("[^\\u0000-\\u00FF]");
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
  if (apiKey.startsWith("AIza")) return "gemini";
  if (apiKey.startsWith("sk-")) return "openai";
  return null;
}
export {
  apiKeyProblem as a,
  providerFromKey as p,
  sanitizeApiKey as s
};
//# sourceMappingURL=apiKey.js.map
