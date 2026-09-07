/* ──────────────────────────────────────────────
   Algo Solver — Popup Script
   ──────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let isSending = false;

/* ── DOM refs ────────────────────────────────── */
const settingsPanel = $('#settings-panel');
const mainPanel = $('#main-panel');
const btnSettings = $('#btn-settings');
const btnSave = $('#btn-save');
const btnSend = $('#btn-send');
const btnCopy = $('#btn-copy');
const btnToggleKey = $('#toggle-key');
const inputText = $('#input-text');
const charCount = $('#char-count');
const resultArea = $('#result-area');
const resultText = $('#result-text');
const errorArea = $('#error-area');
const errorText = $('#error-text');
const loadingEl = $('#loading');
const cacheBadge = $('#cache-badge');
const apiKeyInput = $('#api-key');
const languageSelect = $('#language-select');
const modelSelect = $('#model-select');

/* ── Init: load saved settings ───────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['apiKey', 'language', 'model']);
  const defaultConfig = window.APP_CONFIG || {};

  const apiKey = data.apiKey || defaultConfig.DEFAULT_API_KEY || '';
  const language = data.language || defaultConfig.DEFAULT_LANGUAGE || 'Python';
  let model = data.model || defaultConfig.DEFAULT_MODEL || 'gemini-3.1-flash-lite';
  if (model === 'gemini-3.1-flash') {
    model = 'gemini-3.1-flash-lite';
    await chrome.storage.local.set({ model });
  }

  if (apiKey) apiKeyInput.value = apiKey;
  if (language) languageSelect.value = language;
  if (model) modelSelect.value = model;

  // Tự động lưu giá trị mặc định vào storage nếu storage chưa có
  if (!data.apiKey && apiKey) {
    await chrome.storage.local.set({ apiKey });
  }
  if (!data.language && language) {
    await chrome.storage.local.set({ language });
  }
  if (!data.model && model) {
    await chrome.storage.local.set({ model });
  }
});

// Settings always visible — toggle button unused

/* ── Toggle key visibility ───────────────────── */
btnToggleKey.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

/* ── Save settings ───────────────────────────── */
btnSave.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const language = languageSelect.value;
  const model = modelSelect.value;

  await chrome.storage.local.set({ apiKey, language, model });

  btnSave.textContent = '✓ Saved';
  setTimeout(() => { btnSave.textContent = 'Save Settings'; }, 1200);
});

/* ── Char counter ────────────────────────────── */
inputText.addEventListener('input', () => {
  charCount.textContent = `${inputText.value.length} chars`;
});

/* ── Send request ────────────────────────────── */
btnSend.addEventListener('click', () => sendRequest());

// Also send on Ctrl+Enter
inputText.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    sendRequest();
  }
});

async function sendRequest() {
  const input = inputText.value.trim();
  if (!input || isSending) return;

  isSending = true;
  btnSend.classList.add('sending');
  hideError();
  hideResult();
  showLoading();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SOLVE',
      input,
    });

    hideLoading();

    if (response.ok) {
      showResult(response.result, response.fromCache);
      // Auto-copy to clipboard
      try {
        await navigator.clipboard.writeText(response.result);
      } catch {
        // Clipboard API might not be available in popup context on some systems
        copyFallback(response.result);
      }
    } else {
      showError(response.error);
    }
  } catch (err) {
    hideLoading();
    showError(err.message || 'Unknown error');
  } finally {
    isSending = false;
    btnSend.classList.remove('sending');
  }
}

/* ── Copy button ─────────────────────────────── */
btnCopy.addEventListener('click', async () => {
  const text = resultText.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyFallback(text);
  }
});

/* ── Clipboard fallback ──────────────────────── */
function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

/* ── UI helpers ──────────────────────────────── */
function showResult(text, fromCache) {
  resultText.textContent = text;
  resultArea.classList.remove('hidden');
  cacheBadge.classList.toggle('hidden', !fromCache);
}

function hideResult() {
  resultArea.classList.add('hidden');
}

function showError(msg) {
  errorText.textContent = msg;
  errorArea.classList.remove('hidden');
}

function hideError() {
  errorArea.classList.add('hidden');
}

function showLoading() {
  loadingEl.classList.remove('hidden');
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}
