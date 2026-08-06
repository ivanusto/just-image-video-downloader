// Just Image & Video Downloader — background service worker
// Per-tab video cache: Map<tabId, Map<videoHash, {url, ts}>>
const tabGroups = new Map();

// 分頁關閉時釋放對應快取，避免長時間使用累積記憶體
chrome.tabs.onRemoved.addListener((tabId) => {
  tabGroups.delete(tabId);
});

// Helper to decode efg param from IG
function decodeEfg(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    return {};
  }
}

// Check if the URL is audio-only
function isAudioOnly(url) {
  try {
    const efg = new URL(url).searchParams.get('efg');
    if (!efg) return false;
    // IG 實際使用的鍵名是 vencode_tag，但保留舊拼法以防回退
    const decoded = decodeEfg(efg);
    const tag = (decoded.vencode_tag ?? decoded.vencod_tag ?? '').toLowerCase();
    return tag.includes('audio') || tag.includes('heaac');
  } catch {
    return false;
  }
}

// Extract video hash from URL
function extractHash(url) {
  const m = url.match(/\/([A-Za-z0-9_-]{30,})\.mp4/);
  return m?.[1] ?? null;
}

// Intercept CDN mp4 requests to group by tab
chrome.webRequest.onBeforeRequest.addListener(
  ({ url, tabId }) => {
    if (!url.includes('.mp4') || tabId < 0) return;
    if (isAudioOnly(url)) return;

    const hash = extractHash(url);
    if (!hash) return;

    try {
      const u = new URL(url);
      u.searchParams.delete('bytestart');
      u.searchParams.delete('byteend');
      const cleanUrl = u.toString();

      const groups = tabGroups.get(tabId) ?? new Map();
      groups.set(hash, { url: cleanUrl, ts: Date.now() });

      // Keep at most 50 items per tab
      if (groups.size > 50) {
        const oldestKey = [...groups.entries()].reduce((a, b) =>
          a[1].ts < b[1].ts ? a : b
        )[0];
        groups.delete(oldestKey);
      }

      tabGroups.set(tabId, groups);
    } catch (e) { /* ignore url parsing errors */ }
  },
  { urls: ['*://*.cdninstagram.com/*', '*://*.fbcdn.net/*'] }
);

// 檔名安全網：chrome.downloads.download 對 blob: URL 在部分 Chrome 版本會忽略
// filename 參數（Chromium 既有 bug，隨版本時好時壞），檔案會被存成 blob UUID
// 之類的隨機英數名。這裡登記「下載 URL → 預期檔名」，再於 onDeterminingFilename
// 強制套用；content script 的 <a download> 後備路徑亦透過 registerFilename 登記。
const pendingNames = new Map(); // url -> { filename, ts }

function registerPendingName(url, filename) {
  if (!url || !filename) return;
  const now = Date.now();
  // 淘汰逾時項目：未觸發 onDeterminingFilename 的登記（如 Firefox）不能無限累積
  for (const [k, v] of pendingNames) {
    if (now - v.ts > 60000) pendingNames.delete(k);
  }
  pendingNames.set(url, { filename, ts: now });
}

// Firefox 沒有 onDeterminingFilename（其 downloads.download 檔名本就可靠），僅 Chrome 需要
if (chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const p = pendingNames.get(item.url) ?? pendingNames.get(item.finalUrl);
    if (p) {
      pendingNames.delete(item.url);
      pendingNames.delete(item.finalUrl);
      suggest({ filename: p.filename, conflictAction: 'uniquify' });
    }
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? -1;

  if (message.action === 'getLatestVideoUrl') {
    const groups = tabGroups.get(tabId);
    if (!groups?.size) {
      sendResponse({ url: null });
      return;
    }

    let latest = null, latestTs = 0;
    for (const { url, ts } of groups.values()) {
      if (ts > latestTs) {
        latestTs = ts;
        latest = url;
      }
    }
    sendResponse({ url: latest });
    return;
  }

  if (message.action === 'registerFilename') {
    registerPendingName(message.url, message.filename);
    sendResponse({ ok: true });
    return;
  }

  if (message.action === 'download') {
    registerPendingName(message.url, message.filename);
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else if (downloadId === undefined) {
        sendResponse({ success: false, error: 'undefined downloadId' });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true; // Keep channel open for async response
  }
});

// Setup alarm to clean interrupted downloads
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    if (chrome.alarms) {
      chrome.alarms.create('cleanDownloads', { periodInMinutes: 30 });
    }
  }
});

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanDownloads') {
      chrome.downloads.search({ state: 'interrupted', limit: 100 }, (items) => {
        if (items && items.length > 0) {
          items.forEach(item => {
            if (item.id) chrome.downloads.erase({ id: item.id });
          });
        }
      });
    }
  });
}

self.addEventListener('activate', () => {});
