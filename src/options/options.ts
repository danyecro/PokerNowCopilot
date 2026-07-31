import { getSettings, setSettings } from '../shared/storage';
import { AVAILABLE_MODELS } from '../shared/constants';
import type { Settings } from '../shared/types';

const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const modelSelect = document.getElementById('model') as HTMLSelectElement;
const showOverlays = document.getElementById('show-overlays') as HTMLInputElement;
const showSidePanel = document.getElementById('show-side-panel') as HTMLInputElement;
const saveStatus = document.getElementById('save-status')!;

// Populate model dropdown
for (const m of AVAILABLE_MODELS) {
  const opt = document.createElement('option');
  opt.value = m.id;
  opt.textContent = m.label;
  modelSelect.appendChild(opt);
}

async function load(): Promise<void> {
  const settings = await getSettings();
  apiKeyInput.value = settings.openRouterApiKey;
  modelSelect.value = settings.model;
  showOverlays.checked = settings.showOverlays;
  showSidePanel.checked = settings.showSidePanel;
}

document.getElementById('btn-save')?.addEventListener('click', async () => {
  // Re-read first: autoAnalyze is owned by the side panel's AUTO button and has
  // no field here, so it must be carried over instead of overwritten.
  const current = await getSettings();
  const settings: Settings = {
    ...current,
    openRouterApiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    showOverlays: showOverlays.checked,
    showSidePanel: showSidePanel.checked,
  };

  await setSettings(settings);

  // Notify content scripts of settings change
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });

  saveStatus.textContent = 'Saved!';
  saveStatus.className = '';
  setTimeout(() => { saveStatus.textContent = ''; }, 2000);
});

load().catch(console.error);
