// Just IG Image Downloader content script (v2.8)
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

// 從媒體元素往上找所屬 article 中貼文作者的 username
function getUsernameFromMedia(el) {
  const storyMatch = location.pathname.match(/^\/stories\/([^/]+)\//);
  if (storyMatch) return storyMatch[1];

  try {
    const article = el.closest('article') || el.closest('[role="dialog"]') || document;
    const header = article.querySelector('header') || article;

    const links = header.querySelectorAll('a[href^="/"]');
    for (const a of links) {
      const m = a.getAttribute('href').match(/^\/([A-Za-z0-9_.]+)\/?($|\?)/);
      if (!m) continue;
      const name = m[1];
      if (['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'direct', 'accounts'].includes(name)) continue;
      return name;
    }
  } catch (e) {}
  return 'instagram';
}

// 產生檔案名稱 (格式: {username}_{type}_{timestamp}.{ext})
function getFilename(el, ext) {
  const username = getUsernameFromMedia(el);
  const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, -4);
  
  let type = 'post';
  if (location.pathname.includes('/stories/')) {
    type = 'story';
  } else if (location.pathname.includes('/reel/') || location.pathname.includes('/reels/')) {
    type = 'reel';
  }
  
  return `${username}_${type}_${timestamp}.${ext}`;
}

// IG shortcode → numeric media_id（IG 自訂 base64 字典）
function shortcodeToMediaId(shortcode) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const ch of shortcode) {
    const v = alphabet.indexOf(ch);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

// 由 DOM / URL 推斷 media_id
function findMediaId(video) {
  const story = location.pathname.match(/^\/stories\/[^/]+\/(\d+)/);
  if (story) return story[1];

  const article = video.closest('article') || video.closest('[role="dialog"]') || document;
  const link = article.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
  const href = link?.getAttribute('href') ?? location.pathname;
  const m = href.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? shortcodeToMediaId(m[1]) : null;
}

// 找輪播中「目前顯示」的索引
function findCarouselIndex(video) {
  const list = video.closest('ul') || video.closest('[role="presentation"]');
  if (!list) return 0;
  const items = list.querySelectorAll('li, [role="listitem"]');
  for (let i = 0; i < items.length; i++) {
    if (items[i].contains(video)) return i;
  }
  return 0;
}

// 呼叫 IG web API 取得 progressive MP4（含音訊）
async function fetchVideoUrlFromApi(mediaId, video) {
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: { 'x-ig-app-id': '936619743392459' },
      credentials: 'include'
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    const pickBest = versions => versions?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

    if (item.video_versions?.length) return pickBest(item.video_versions);

    if (item.carousel_media?.length) {
      const idx = Math.min(findCarouselIndex(video), item.carousel_media.length - 1);
      if (item.carousel_media[idx]?.video_versions?.length) {
        return pickBest(item.carousel_media[idx].video_versions);
      }
      for (const m of item.carousel_media) {
        const u = pickBest(m.video_versions);
        if (u) return u;
      }
    }
    return null;
  } catch (e) {
    console.warn('IG API fetch failed:', e);
    return null;
  }
}

// CDN 攔截後備：微幅 seek 觸發新請求，再由 background 取回最新 URL
async function fetchVideoUrlFromCdn(video) {
  try {
    const dur = video.duration || 30;
    const cur = video.currentTime;
    video.currentTime = cur >= 0.5 ? cur - 0.1 : Math.min(cur + 0.1, dur - 0.1);
    await new Promise(r => setTimeout(r, 1200));
    const { url } = await chromeAPI.runtime.sendMessage({ action: 'getLatestVideoUrl' });
    return url ?? null;
  } catch (e) {
    return null;
  }
}

// 網頁端 Fetch-to-Blob 下載後備方法
async function downloadViaBlobContentScript(url, filename) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Fetch failed in content script');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // 優先：透過 background 下載 blob 網址以管理檔名與歷史紀錄
    try {
      const res = await chromeAPI.runtime.sendMessage({
        action: 'download',
        url: blobUrl,
        filename: filename
      });
      if (res && res.success) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return true;
      }
    } catch (e) {
      console.warn('Background blob download failed, falling back to direct anchor click...');
    }

    // 後備：在網頁直接使用 <a> 標籤觸發下載
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return true;
  } catch (error) {
    console.error('Content script blob download failed:', error);
    return false;
  }
}

// 圖片下載
async function downloadImage(url, sourceEl) {
  try {
    const filename = getFilename(sourceEl, 'jpg');
    
    // 直接透過 content script fetch，因為在網頁上下載最不易受 CORS 或 referer 阻擋
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image fetch failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // 優先使用擴充功能 background 下載，維持檔案結構
    try {
      const res = await chromeAPI.runtime.sendMessage({
        action: 'download',
        url: blobUrl,
        filename: filename
      });
      if (res && res.success) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return true;
      }
    } catch (e) {}

    // 後備 direct click
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return true;
  } catch (error) {
    console.error('Image download failed:', error);
    return false;
  }
}

// 影片下載
async function downloadVideo(video) {
  try {
    let url = null;

    // 1. 優先檢查 video.src 是否為直接 progressive mp4（若非 blob URL 則可直接使用）
    if (video.src && !video.src.startsWith('blob:')) {
      url = video.src;
    } else if (video.currentSrc && !video.currentSrc.startsWith('blob:')) {
      url = video.currentSrc;
    } else {
      const sources = video.querySelectorAll('source');
      for (const s of sources) {
        if (s.src && !s.src.startsWith('blob:')) {
          url = s.src;
          break;
        }
      }
    }

    // 2. 其次呼叫 IG 的 Web API
    if (!url) {
      const mediaId = findMediaId(video);
      if (mediaId) {
        url = await fetchVideoUrlFromApi(mediaId, video);
      }
    }

    // 3. 最後使用 CDN 攔截後備
    if (!url) {
      url = await fetchVideoUrlFromCdn(video);
    }

    if (!url) {
      console.warn('Could not resolve video URL via direct src, API, or CDN interception');
      return false;
    }

    const filename = getFilename(video, 'mp4');

    // 優先：透過 background 直接下載
    const res = await chromeAPI.runtime.sendMessage({
      action: 'download',
      url: url,
      filename: filename
    });

    if (res && res.success) {
      return true;
    }

    // 後備：如果直接下載失敗（通常是 CDN server 回傳 403 / 阻擋 referrer），使用 fetch-to-blob 下載
    console.log('Direct download failed. Falling back to local blob fetch...');
    return await downloadViaBlobContentScript(url, filename);
  } catch (error) {
    console.error('Video download failed:', error);
    return false;
  }
}

// 檢查是否為個人頭像
function isProfilePicture(img) {
  try {
    if (window.getComputedStyle(img).borderRadius === '50%') return true;

    let el = img;
    for (let i = 0; i < 4; i++) {
      if (!el) break;
      const cls = el.className || '';
      if (typeof cls === 'string' && (
        cls.includes('_aadp') ||
        cls.includes('_aa8j') ||
        cls.includes('xp7jhwk') ||
        cls.includes('profile-pic') ||
        cls.includes('xi81zsa')
      )) return true;

      const alt = el.querySelector?.('img')?.alt?.toLowerCase() || '';
      if (alt.includes('profile') || alt.includes('的大頭貼照') || alt.includes('頭像') || alt.includes('avatar')) {
        return true;
      }

      el = el.parentElement;
    }
  } catch (e) {}
  return false;
}

// 建立下載按鈕（使用 Material Design Cloud Download SVG）
function createDownloadButton(onClickHandler) {
  const btn = document.createElement('button');
  btn.className = 'ig-download-btn';
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg><span class="tooltip"></span>`;

  const tooltip = btn.querySelector('.tooltip');

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');

    const success = await onClickHandler();
    
    btn.classList.remove('loading');

    tooltip.textContent = success ? 'Downloaded!' : 'Failed';
    tooltip.classList.add('show');
    setTimeout(() => tooltip.classList.remove('show'), 2000);
  });

  return btn;
}

// 增加下載按鈕到圖片元素
function addDownloadButtonToElement(img) {
  if (/^\/stories\//.test(location.pathname)) {
    if (document.body.querySelector(':scope > .ig-download-btn')) return;
    const btn = createDownloadButton(() => downloadImage(img.src, img));
    btn.style.cssText = `
      position: fixed !important;
      bottom: 80px !important;
      right: 20px !important;
      background: rgba(15, 15, 15, 0.75) !important;
      border-radius: 5px !important;
      padding: 8px 14px !important;
      width: auto !important;
      height: auto !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      z-index: 2147483647 !important;
    `;
    // 確保限時動態 fixed 按鈕直接顯示
    const svg = btn.querySelector('svg');
    if (svg) svg.style.marginRight = '0px';
    document.body.appendChild(btn);
    return;
  }

  if (!img.parentElement || img.parentElement.querySelector('.ig-download-btn')) return;
  if (isProfilePicture(img)) return;

  const btn = createDownloadButton(() => downloadImage(img.src, img));

  const container = img.parentElement;
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(btn);
}

// 增加下載按鈕到影片元素
function addDownloadButtonToVideo(video) {
  if (/^\/stories\//.test(location.pathname)) {
    if (document.body.querySelector(':scope > .ig-download-btn')) return;
    const btn = createDownloadButton(() => downloadVideo(video));
    btn.style.cssText = `
      position: fixed !important;
      bottom: 80px !important;
      right: 20px !important;
      background: rgba(15, 15, 15, 0.75) !important;
      border-radius: 5px !important;
      padding: 8px 14px !important;
      width: auto !important;
      height: auto !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      z-index: 2147483647 !important;
    `;
    const svg = btn.querySelector('svg');
    if (svg) svg.style.marginRight = '0px';
    document.body.appendChild(btn);
    return;
  }

  const container = video.parentElement;
  if (!container || container.querySelector('.ig-download-btn')) return;

  // 影片尚無任何來源，等待載入後重試
  if (!video.currentSrc && !video.src && !video.querySelector?.('source')?.src) {
    video.addEventListener('loadedmetadata', () => addDownloadButtonToVideo(video), { once: true });
    video.addEventListener('canplay', () => addDownloadButtonToVideo(video), { once: true });
    return;
  }

  const btn = createDownloadButton(() => downloadVideo(video));

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(btn);
}

// 增加下載按鈕到所有媒體元素（採用 size Heuristics 配合 class fallback 避免 IG 動態變更類名）
function addDownloadButtons() {
  // 限時動態頁面：直接找頁面上的 video 或圖片
  if (/^\/stories\//.test(location.pathname)) {
    const storyVideo = Array.from(document.querySelectorAll('video'))
      .find(v => v.currentSrc || v.src || v.videoWidth > 0);
    if (storyVideo) {
      addDownloadButtonToVideo(storyVideo);
      return;
    }
    const storyImg = Array.from(document.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]'))
      .find(img => img.naturalWidth > 300 && img.naturalHeight > 300 && !isProfilePicture(img));
    if (storyImg) addDownloadButtonToElement(storyImg);
    return;
  }

  // 先處理影片
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    const rect = video.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) return; // 過濾小預覽圖或非主影片
    addDownloadButtonToVideo(video);
  });

  // 再處理圖片
  const images = document.querySelectorAll('img[src*="cdninstagram.com"], img[src*="fbcdn.net"], img[src*="instagram.com"]');
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) return; // 過濾小圖

    if (img.complete && img.naturalWidth > 150 && img.naturalHeight > 150) {
      addDownloadButtonToElement(img);
    } else {
      img.addEventListener('load', () => {
        if (img.naturalWidth > 150 && img.naturalHeight > 150) {
          addDownloadButtonToElement(img);
        }
      }, { once: true });
    }
  });
}

// SPA 路由變更偵測（網址改變時清除限動按鈕，並重新掃描）
let lastUrl = window.location.href;
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    document.querySelectorAll('body > .ig-download-btn').forEach(b => b.remove());
    setTimeout(addDownloadButtons, 500);
  }
}).observe(document, { subtree: true, childList: true });

// 初始化：延遲以等待 React 渲染完成
function init() {
  setTimeout(addDownloadButtons, 1500);
}

// 滾動時掃描（防抖處理）
let scrollTimeout;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(addDownloadButtons, 500);
}, { passive: true });

// DOM 結構改變觀察器
let mutationTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(mutationTimeout);
  mutationTimeout = setTimeout(addDownloadButtons, 600);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

init();
