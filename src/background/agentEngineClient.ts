// Vertex AI Agent Engine — the deployed ADK agent tree.
//
// Verified against a live engine (2026-08-01); the shape is not obvious from
// the docs, so it is written down here:
//
//   Session   POST /v1beta1/{engine}/sessions      {"userId": "..."}
//             → long-running operation, done:true, session in `response.name`
//   Ask       POST /v1beta1/{engine}:streamQuery?alt=sse
//             {"class_method":"async_stream_query",
//              "input":{"user_id","session_id","message"}}
//   Auth      x-goog-api-key with a key scoped to the Agent Platform API
//             (aiplatform.googleapis.com). OAuth is NOT required.
//
// `async_create_session` as a class_method returns 404: sessions are managed by
// the service, not by the deployed container. Only the run call goes through
// class_method dispatch, and it fails without an existing session_id.

import { STORAGE_KEYS } from '../shared/constants';

/** `projects/{p}/locations/{l}/reasoningEngines/{id}` → base URL for it. */
export function engineBaseUrl(resource: string): string | null {
  const location = resource.match(/\/locations\/([a-z0-9-]+)\//)?.[1];
  if (!location || !/^projects\/[^/]+\/locations\/[^/]+\/reasoningEngines\/[^/]+$/.test(resource)) {
    return null;
  }
  return `https://${location}-aiplatform.googleapis.com/v1beta1/${resource}`;
}

interface CachedSession {
  resource: string;
  sessionId: string;
}

const USER_ID = 'pokernow-copilot';

/**
 * A session id for this engine, created on first use and reused afterwards.
 *
 * Sessions are the agent's memory of the conversation, so reusing one keeps
 * context across hands. They expire after a year server-side; a stale id is
 * recovered by `resetSession` on the first failed run.
 */
export async function getSessionId(resource: string, apiKey: string): Promise<string> {
  const cached = await readCachedSession();
  if (cached && cached.resource === resource) return cached.sessionId;

  const sessionId = await createSession(resource, apiKey);
  await chrome.storage.local.set({
    [STORAGE_KEYS.AGENT_ENGINE_SESSION]: { resource, sessionId } satisfies CachedSession,
  });
  return sessionId;
}

export async function resetSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.AGENT_ENGINE_SESSION);
}

async function readCachedSession(): Promise<CachedSession | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.AGENT_ENGINE_SESSION);
  const value = stored[STORAGE_KEYS.AGENT_ENGINE_SESSION];
  return value && typeof value.sessionId === 'string' ? value as CachedSession : null;
}

async function createSession(resource: string, apiKey: string): Promise<string> {
  const base = engineBaseUrl(resource);
  if (!base) throw new Error(`Not an Agent Engine resource name: "${resource}"`);

  const resp = await fetch(`${base}/sessions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID }),
  });
  if (!resp.ok) {
    throw new Error(`Could not create an agent session (HTTP ${resp.status}): ${await resp.text()}`);
  }

  // createSession answers with a long-running operation that is already done.
  const body = await resp.json() as {
    done?: boolean;
    response?: { name?: string };
    name?: string;
  };
  const name = body.response?.name ?? body.name ?? '';
  const sessionId = name.match(/\/sessions\/(\d+)/)?.[1];
  if (!sessionId) throw new Error(`No session id in the response: ${JSON.stringify(body).slice(0, 200)}`);
  return sessionId;
}

/** The streaming run endpoint and the body it expects. */
export function buildRunRequest(resource: string, sessionId: string, message: string): {
  url: string;
  body: object;
} | null {
  const base = engineBaseUrl(resource);
  if (!base) return null;
  return {
    url: `${base}:streamQuery?alt=sse`,
    body: {
      class_method: 'async_stream_query',
      input: { user_id: USER_ID, session_id: sessionId, message },
    },
  };
}
