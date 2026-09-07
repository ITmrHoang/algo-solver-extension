chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen-clipboard') return;

  if (message.type === 'READ_CLIPBOARD') {
    (async () => {
      try {
        const text = await navigator.clipboard.readText();
        sendResponse({ ok: true, text });
      } catch (err) {
        // Fallback dùng textarea
        try {
          const textarea = document.getElementById('paste-target');
          textarea.value = '';
          textarea.select();
          document.execCommand('paste');
          sendResponse({ ok: true, text: textarea.value });
        } catch (e) {
          sendResponse({ ok: false, error: err.message });
        }
      }
    })();
    return true;
  }

  if (message.type === 'WRITE_CLIPBOARD') {
    (async () => {
      try {
        await navigator.clipboard.writeText(message.text);
        sendResponse({ ok: true });
      } catch (err) {
        try {
          const textarea = document.getElementById('paste-target');
          textarea.value = message.text;
          textarea.select();
          document.execCommand('copy');
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: err.message });
        }
      }
    })();
    return true;
  }
});
