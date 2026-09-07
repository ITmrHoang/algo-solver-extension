/* ──────────────────────────────────────────────
   Algo Solver — Service Worker (background)
   ──────────────────────────────────────────── */

importScripts('../config.js');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const THROTTLE_MS = 30_000;
const MAX_CACHE = 10;

/* ── Hash helper ─────────────────────────────── */
async function hashText(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Cache helpers ───────────────────────────── */
async function getCache() {
  const { resultCache = [] } = await chrome.storage.local.get('resultCache');
  return resultCache;
}

async function setCache(cache) {
  await chrome.storage.local.set({ resultCache: cache.slice(-MAX_CACHE) });
}

async function findCached(hash) {
  const cache = await getCache();
  return cache.find(e => e.hash === hash) || null;
}

async function addToCache(hash, input, result) {
  const cache = await getCache();
  cache.push({ hash, input: input.substring(0, 200), result, ts: Date.now() });
  await setCache(cache);
}

/* ── Throttle helper ─────────────────────────── */
async function canSend() {
  const { lastSendTime = 0 } = await chrome.storage.local.get('lastSendTime');
  const now = Date.now();
  if (now - lastSendTime < THROTTLE_MS) {
    return { ok: false, waitSec: Math.ceil((THROTTLE_MS - (now - lastSendTime)) / 1000) };
  }
  return { ok: true };
}

async function markSent() {
  await chrome.storage.local.set({ lastSendTime: Date.now() });
}

/* ── Build unified prompt ────────────────────── */
function buildPrompt(input, lang) {
  const langLabel = lang || 'Python';
  return `You are an elite software and algorithm engineer.
Analyze the following input.
- If it is an algorithm or coding problem: Provide the most optimal, correct, and clean solution in ${langLabel}.
- If it contains existing code, error descriptions, or a request to optimize: Fix the bugs, resolve the errors, and optimize the code in ${langLabel}.
Return ONLY the final runnable code in ${langLabel}. No explanations, no introductory or concluding text, and no markdown code fences.

Input:
${input}`;
}

/* ── Call Gemini API ─────────────────────────── */
async function callGemini(prompt, apiKey, model) {
  const modelName = model || 'gemini-3.8-flash';
  const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

/* ── Strip markdown code fences if present ──── */
function stripCodeFences(text) {
  const m = text.match(/^```[\w]*\n([\s\S]*?)```$/);
  if (m) return m[1].trim();
  return text;
}

/* ── Main solve logic ────────────────────────── */
async function solve(input) {
  if (!input || !input.trim()) {
    return { ok: false, error: 'No input provided' };
  }

  const stored = await chrome.storage.local.get(['apiKey', 'language', 'model']);
  const defaultConfig = (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : self.APP_CONFIG) || {};

  const apiKey = stored.apiKey || defaultConfig.DEFAULT_API_KEY || '';
  const language = stored.language || defaultConfig.DEFAULT_LANGUAGE || 'Python';
  let model = stored.model || defaultConfig.DEFAULT_MODEL || 'gemini-3.8-flash';
  // Nếu storage đang lưu model 3.1-flash cũ bị thiếu chữ lite
  if (model === 'gemini-3.1-flash') {
    model = 'gemini-3.8-flash';
    await chrome.storage.local.set({ model });
  }

  if (!apiKey) {
    return { ok: false, error: 'API key not set. Open extension popup to configure.' };
  }

  // Build full prompt to hash (includes language)
  const prompt = buildPrompt(input.trim(), language);
  const hash = await hashText(prompt);

  // Check cache first
  const cached = await findCached(hash);
  if (cached) {
    return { ok: true, result: cached.result, fromCache: true };
  }

  // Throttle
  const throttle = await canSend();
  if (!throttle.ok) {
    return { ok: false, error: `Throttled. Wait ${throttle.waitSec}s` };
  }

  try {
    await markSent();
    const raw = await callGemini(prompt, apiKey, model);
    const result = stripCodeFences(raw);
    await addToCache(hash, input.trim(), result);
    return { ok: true, result, fromCache: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ── Offscreen document clipboard helpers ──────── */
async function ensureOffscreenDocument() {
  if (chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'background/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Read and write clipboard for global shortcut solving algorithms'
    });
  } catch (err) {
    if (!err.message?.includes('Only a single offscreen')) {
      console.error('Offscreen error:', err);
    }
  }
}

async function readFromClipboard() {
  await ensureOffscreenDocument();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen-clipboard', type: 'READ_CLIPBOARD' },
      (res) => resolve(res?.ok ? res.text : '')
    );
  });
}

async function writeToClipboard(text) {
  await ensureOffscreenDocument();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen-clipboard', type: 'WRITE_CLIPBOARD', text },
      (res) => resolve(res?.ok)
    );
  });
}

/* ── Keyboard shortcut command (Global: Cả trong Chrome lẫn ngoài Desktop) ── */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'solve-algorithm') return;

  let textToSolve = '';

  // 1. Nếu đang ở trong một tab Chrome thông thường, thử lấy text bôi đen
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || '',
      });
      textToSolve = results?.[0]?.result?.trim() || '';
    }
  } catch {
    // Ngoài Chrome hoặc tab hệ thống
  }

  // 2. Nếu đang ở ngoài Chrome (VS Code, Notepad...) hoặc không bôi đen trên tab, đọc từ Clipboard
  if (!textToSolve) {
    try {
      textToSolve = (await readFromClipboard())?.trim() || '';
    } catch (e) {
      console.error('Clipboard read failed:', e);
    }
  }

  if (!textToSolve) return;

  const response = await solve(textToSolve);

  // 3. Tự động ghi kết quả vào Clipboard hệ thống
  if (response.ok && response.result) {
    try {
      await writeToClipboard(response.result);
    } catch (e) {
      console.error('Clipboard write failed:', e);
    }
  }
});

/* ── Message handler for popup ───────────────── */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOLVE') {
    (async () => {
      const response = await solve(message.input);
      sendResponse(response);
    })();
    return true;
  }

  if (message.type === 'GET_CACHE') {
    (async () => {
      const cache = await getCache();
      sendResponse({ cache: cache.reverse() });
    })();
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    (async () => {
      await chrome.storage.local.set({ resultCache: [] });
      sendResponse({ ok: true });
    })();
    return true;
  }
});
