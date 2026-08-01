import { S as STORAGE_KEYS } from "./storage.js";
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
  if (isGoogleKey(apiKey)) return "gemini";
  if (apiKey.startsWith("sk-")) return "openai";
  return null;
}
function isGoogleKey(apiKey) {
  return apiKey.startsWith("AIza") || apiKey.startsWith("AQ.");
}
function engineBaseUrl(resource) {
  const location = resource.match(/\/locations\/([a-z0-9-]+)\//)?.[1];
  if (!location || !/^projects\/[^/]+\/locations\/[^/]+\/reasoningEngines\/[^/]+$/.test(resource)) {
    return null;
  }
  return `https://${location}-aiplatform.googleapis.com/v1beta1/${resource}`;
}
const USER_ID = "pokernow-copilot";
async function getSessionId(resource, apiKey) {
  const cached = await readCachedSession();
  if (cached && cached.resource === resource) return cached.sessionId;
  const sessionId = await createSession(resource, apiKey);
  await chrome.storage.local.set({
    [STORAGE_KEYS.AGENT_ENGINE_SESSION]: { resource, sessionId }
  });
  return sessionId;
}
async function resetSession() {
  await chrome.storage.local.remove(STORAGE_KEYS.AGENT_ENGINE_SESSION);
}
async function readCachedSession() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.AGENT_ENGINE_SESSION);
  const value = stored[STORAGE_KEYS.AGENT_ENGINE_SESSION];
  return value && typeof value.sessionId === "string" ? value : null;
}
async function createSession(resource, apiKey) {
  const base = engineBaseUrl(resource);
  if (!base) throw new Error(`Not an Agent Engine resource name: "${resource}"`);
  const resp = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: USER_ID })
  });
  if (!resp.ok) {
    throw new Error(`Could not create an agent session (HTTP ${resp.status}): ${await resp.text()}`);
  }
  const body = await resp.json();
  const name = body.response?.name ?? body.name ?? "";
  const sessionId = name.match(/\/sessions\/(\d+)/)?.[1];
  if (!sessionId) throw new Error(`No session id in the response: ${JSON.stringify(body).slice(0, 200)}`);
  return sessionId;
}
function buildRunRequest(resource, sessionId, message) {
  const base = engineBaseUrl(resource);
  if (!base) return null;
  return {
    url: `${base}:streamQuery?alt=sse`,
    body: {
      class_method: "async_stream_query",
      input: { user_id: USER_ID, session_id: sessionId, message }
    }
  };
}
export {
  apiKeyProblem as a,
  buildRunRequest as b,
  engineBaseUrl as e,
  getSessionId as g,
  providerFromKey as p,
  resetSession as r,
  sanitizeApiKey as s
};
//# sourceMappingURL=agentEngineClient.js.map
