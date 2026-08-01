import { h as getSettings, s as setSettings, G as GEMINI_MODELS_URL, A as AVAILABLE_MODELS } from "./chunks/storage.js";
import { s as sanitizeApiKey, p as providerFromKey } from "./chunks/apiKey.js";
const apiKeyInput = document.getElementById("api-key");
const modelSelect = document.getElementById("model");
const showOverlays = document.getElementById("show-overlays");
const showSidePanel = document.getElementById("show-side-panel");
const saveStatus = document.getElementById("save-status");
const keyProviderHint = document.getElementById("key-provider");
const modelsStatus = document.getElementById("models-status");
const refreshBtn = document.getElementById("btn-refresh-models");
const PROVIDER_LABEL = {
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  naga: "Naga",
  openai: "OpenAI"
};
function paintModels(extra = []) {
  const selected = modelSelect.value;
  modelSelect.replaceChildren();
  const all = [...extra, ...AVAILABLE_MODELS.filter((m) => !extra.some((e) => e.id === m.id))];
  const providers = [...new Set(all.map((m) => m.provider))];
  for (const provider of providers) {
    const group = document.createElement("optgroup");
    group.label = PROVIDER_LABEL[provider];
    for (const m of all.filter((x) => x.provider === provider)) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      group.appendChild(opt);
    }
    modelSelect.appendChild(group);
  }
  if (selected) modelSelect.value = selected;
}
function ensureOption(id) {
  if (!id || [...modelSelect.options].some((o) => o.value === id)) return;
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = `${id} (saved)`;
  modelSelect.appendChild(opt);
}
async function loadGeminiModels() {
  const key = sanitizeApiKey(apiKeyInput.value);
  if (!key) {
    setModelsStatus("Enter your Gemini key first.", "error");
    return;
  }
  const owner = providerFromKey(key);
  if (owner && owner !== "gemini") {
    setModelsStatus(`That looks like a ${PROVIDER_LABEL[owner]} key, not a Google one.`, "error");
    return;
  }
  refreshBtn.disabled = true;
  setModelsStatus("Loading…");
  try {
    const resp = await fetch(GEMINI_MODELS_URL, {
      headers: { "x-goog-api-key": key }
    });
    if (!resp.ok) {
      const detail = await resp.text();
      setModelsStatus(`HTTP ${resp.status} — ${shortError(detail)}`, "error");
      return;
    }
    const body = await resp.json();
    const usable = (body.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => ({
      id: m.name.replace(/^models\//, ""),
      label: m.displayName ? `${m.displayName} (${m.name.replace(/^models\//, "")})` : m.name,
      provider: "gemini"
    })).filter((m) => !m.id.includes("embedding") && !m.id.includes("aqa"));
    if (usable.length === 0) {
      setModelsStatus("Key works, but no chat models were returned.", "error");
      return;
    }
    paintModels(usable);
    ensureOption(modelSelect.value);
    setModelsStatus(`${usable.length} models loaded.`);
  } catch (e) {
    setModelsStatus(e instanceof Error ? e.message : String(e), "error");
  } finally {
    refreshBtn.disabled = false;
  }
}
function shortError(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message ?? raw.slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}
function setModelsStatus(text, kind = "") {
  modelsStatus.textContent = text;
  modelsStatus.className = kind;
}
function paintKeyHint() {
  const provider = providerFromKey(sanitizeApiKey(apiKeyInput.value));
  keyProviderHint.textContent = apiKeyInput.value.trim() === "" ? "" : provider ? `Detected: ${PROVIDER_LABEL[provider]}` : "Unrecognised key prefix — the model’s provider will be used.";
}
apiKeyInput.addEventListener("input", paintKeyHint);
refreshBtn.addEventListener("click", () => {
  void loadGeminiModels();
});
async function load() {
  paintModels();
  const settings = await getSettings();
  apiKeyInput.value = settings.apiKey;
  ensureOption(settings.model);
  modelSelect.value = settings.model;
  showOverlays.checked = settings.showOverlays;
  showSidePanel.checked = settings.showSidePanel;
  paintKeyHint();
}
document.getElementById("btn-save")?.addEventListener("click", async () => {
  const current = await getSettings();
  const settings = {
    ...current,
    apiKey: sanitizeApiKey(apiKeyInput.value),
    model: modelSelect.value,
    showOverlays: showOverlays.checked,
    showSidePanel: showSidePanel.checked
  };
  await setSettings(settings);
  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings });
  saveStatus.textContent = "Saved!";
  saveStatus.className = "";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2e3);
});
load().catch(console.error);
//# sourceMappingURL=options.js.map
