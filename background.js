// Just IG Image Downloader background script (v3.0)
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

  if (message.action === 'download') {
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
