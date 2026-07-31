import { A as AVAILABLE_MODELS, g as getSettings, s as setSettings } from "./chunks/storage.js";
const apiKeyInput = document.getElementById("api-key");
const modelSelect = document.getElementById("model");
const showOverlays = document.getElementById("show-overlays");
const showSidePanel = document.getElementById("show-side-panel");
const saveStatus = document.getElementById("save-status");
for (const m of AVAILABLE_MODELS) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.label;
  modelSelect.appendChild(opt);
}
async function load() {
  const settings = await getSettings();
  apiKeyInput.value = settings.openRouterApiKey;
  modelSelect.value = settings.model;
  showOverlays.checked = settings.showOverlays;
  showSidePanel.checked = settings.showSidePanel;
}
document.getElementById("btn-save")?.addEventListener("click", async () => {
  const current = await getSettings();
  const settings = {
    ...current,
    openRouterApiKey: apiKeyInput.value.trim(),
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
