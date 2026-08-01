import { getSettings, setSettings } from '../shared/storage';
import { AVAILABLE_MODELS, GEMINI_MODELS_URL, type Provider } from '../shared/constants';
import { providerFromKey, sanitizeApiKey } from '../shared/apiKey';
import { engineBaseUrl } from '../background/agentEngineClient';
import type { Settings } from '../shared/types';

const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelSelect = document.getElementById('model') as HTMLSelectElement;
const showOverlays = document.getElementById('show-overlays') as HTMLInputElement;
const showSidePanel = document.getElementById('show-side-panel') as HTMLInputElement;
const saveStatus = document.getElementById('save-status')!;
const keyProviderHint = document.getElementById('key-provider')!;
const modelsStatus = document.getElementById('models-status')!;
const refreshBtn = document.getElementById('btn-refresh-models') as HTMLButtonElement;
const agentResource = document.getElementById('agent-resource') as HTMLInputElement;
const agentMode = document.getElementById('agent-mode') as HTMLSelectElement;

const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  naga: 'Naga',
  openai: 'OpenAI',
  // Never inferred from a key — the agent is chosen by its resource name, and
  // it authenticates with whichever Google key is configured.
  agentengine: 'Agent Engine',
};

// ── Model dropdown ────────────────────────────────────────────────────────────

/** Renders the catalog grouped by provider, keeping the current selection. */
function paintModels(extra: ReadonlyArray<{ id: string; label: string; provider: Provider }> = []): void {
  const selected = modelSelect.value;
  modelSelect.replaceChildren();

  const all = [...extra, ...AVAILABLE_MODELS.filter(m => !extra.some(e => e.id === m.id))];
  const providers = [...new Set(all.map(m => m.provider))];

  for (const provider of providers) {
    const group = document.createElement('optgroup');
    group.label = PROVIDER_LABEL[provider];
    for (const m of all.filter(x => x.provider === provider)) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      group.appendChild(opt);
    }
    modelSelect.appendChild(group);
  }
  if (selected) modelSelect.value = selected;
}

/** Adds an id the catalog does not know — a model saved from a live refresh. */
function ensureOption(id: string): void {
  if (!id || [...modelSelect.options].some(o => o.value === id)) return;
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = `${id} (saved)`;
  modelSelect.appendChild(opt);
}

interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

/**
 * Pulls the models this key may actually call.
 *
 * The hardcoded list ages out with every Google release, and a wrong id only
 * shows up as a 404 mid-hand. Asking the API is the one source that cannot be
 * stale — and it doubles as a check that the key works at all.
 */
async function loadGeminiModels(): Promise<void> {
  const key = sanitizeApiKey(apiKeyInput.value);
  if (!key) {
    setModelsStatus('Enter your Gemini key first.', 'error');
    return;
  }
  // Only refuse a key that demonstrably belongs somewhere else. Google has
  // shipped more than one key format (AIza…, AQ.…) and will ship more, so a
  // prefix whitelist here would reject valid keys — let the API decide.
  const owner = providerFromKey(key);
  if (owner && owner !== 'gemini') {
    setModelsStatus(`That looks like a ${PROVIDER_LABEL[owner]} key, not a Google one.`, 'error');
    return;
  }

  refreshBtn.disabled = true;
  setModelsStatus('Loading…');
  try {
    const resp = await fetch(GEMINI_MODELS_URL, {
      headers: { 'x-goog-api-key': key },
    });
    if (!resp.ok) {
      const detail = await resp.text();
      setModelsStatus(`HTTP ${resp.status} — ${shortError(detail)}`, 'error');
      return;
    }
    const body = await resp.json() as { models?: GeminiModel[] };
    const usable = (body.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => ({
        id: m.name.replace(/^models\//, ''),
        label: m.displayName ? `${m.displayName} (${m.name.replace(/^models\//, '')})` : m.name,
        provider: 'gemini' as const,
      }))
      .filter(m => !m.id.includes('embedding') && !m.id.includes('aqa'));

    if (usable.length === 0) {
      setModelsStatus('Key works, but no chat models were returned.', 'error');
      return;
    }
    paintModels(usable);
    ensureOption(modelSelect.value);
    setModelsStatus(`${usable.length} models loaded.`);
  } catch (e) {
    setModelsStatus(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    refreshBtn.disabled = false;
  }
}

function shortError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message ?? raw.slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}

function setModelsStatus(text: string, kind = ''): void {
  modelsStatus.textContent = text;
  modelsStatus.className = kind;
}

// ── Key → provider hint ───────────────────────────────────────────────────────

function paintKeyHint(): void {
  const provider = providerFromKey(sanitizeApiKey(apiKeyInput.value));
  keyProviderHint.textContent = apiKeyInput.value.trim() === ''
    ? ''
    : provider
      ? `Detected: ${PROVIDER_LABEL[provider]}`
      : 'Unrecognised key prefix — the model’s provider will be used.';
}

apiKeyInput.addEventListener('input', paintKeyHint);
refreshBtn.addEventListener('click', () => { void loadGeminiModels(); });

// ── Load / save ───────────────────────────────────────────────────────────────

async function load(): Promise<void> {
  paintModels();
  const settings = await getSettings();
  apiKeyInput.value = settings.apiKey;
  ensureOption(settings.model);
  modelSelect.value = settings.model;
  showOverlays.checked = settings.showOverlays;
  showSidePanel.checked = settings.showSidePanel;
  agentResource.value = settings.agentEngineResource;
  agentMode.value = settings.agentEngineMode;
  paintKeyHint();
}

document.getElementById('btn-save')?.addEventListener('click', async () => {
  // Re-read first: autoAnalyze is owned by the side panel's AUTO button and has
  // no field here, so it must be carried over instead of overwritten.
  const current = await getSettings();
  const settings: Settings = {
    ...current,
    apiKey: sanitizeApiKey(apiKeyInput.value),
    model: modelSelect.value,
    showOverlays: showOverlays.checked,
    showSidePanel: showSidePanel.checked,
    // Accept the "//aiplatform.googleapis.com/projects/…" form the console shows
    // as well as the bare resource name.
    agentEngineResource: agentResource.value.trim().replace(/^\/\/[^/]+\//, ''),
    agentEngineMode: agentMode.value as Settings['agentEngineMode'],
  };

  if (settings.agentEngineResource && !engineBaseUrl(settings.agentEngineResource)) {
    saveStatus.textContent = 'Agent resource must look like projects/…/locations/…/reasoningEngines/…';
    saveStatus.className = 'error';
    return;
  }

  await setSettings(settings);

  // Notify content scripts of settings change
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });

  saveStatus.textContent = 'Saved!';
  saveStatus.className = '';
  setTimeout(() => { saveStatus.textContent = ''; }, 2000);
});

load().catch(console.error);
