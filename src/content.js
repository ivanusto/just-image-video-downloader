// Just IG Image Downloader content script (v3.0)
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

// 使用者設定（popup 可調整按鈕位置與檔名格式）
const settings = {
  corner: 'top-left',
  filenameTemplate: '{username}_{type}_{timestamp}'
};

try {
  chromeAPI.storage.local.get(settings).then(saved => {
    Object.assign(settings, saved);
    document.querySelectorAll('.ig-download-btn:not(.ig-download-btn--story)')
      .forEach(b => b.setAttribute('data-corner', settings.corner));
  });
  chromeAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
    document.querySelectorAll('.ig-download-btn:not(.ig-download-btn--story)')
      .forEach(b => b.setAttribute('data-corner', settings.corner));
  });
} catch (e) { /* storage 不可用時使用預設值 */ }

// 從 srcset 取得最高解析度的圖片網址（IG 的 img.src 常是縮圖）
function getBestImageUrl(img) {
  try {
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      let bestUrl = null, bestW = 0;
      for (const part of srcset.split(',')) {
        const [u, d] = part.trim().split(/\s+/);
        const w = parseInt(d, 10) || 0;
        if (u && w >= bestW) { bestW = w; bestUrl = u; }
      }
      if (bestUrl) return bestUrl;
    }
  } catch (e) {}
  return img.currentSrc || img.src;
}

// 從 IG CDN 網址擷取「資產編號」(如 722996781_122134742631040146_1843618352848331808)
// 同一張照片不論解析度/格式都共用此編號，可用來精準對應輪播中的某一張
function igAssetStem(url) {
  try {
    const path = new URL(url, location.href).pathname;
    const m = path.match(/\/(\d+_\d+_\d+)_[a-z]+\.[a-z0-9]+/i);
    return m ? m[1] : null;
  } catch (e) {}
  return null;
}

// 從 URL 偵測圖片副檔名（IG 現在會輸出 webp / heic 等格式）
function getImageExt(url) {
  try {
    const m = new URL(url, location.href).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch (e) {}
  return 'jpg';
}

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

// 產生檔案名稱（預設格式: {username}_{type}_{timestamp}.{ext}，可由設定頁調整）
// 帳號名稱優先用 media info API：單篇貼文頁（/p/...）沒有 <article> 包裹，
// DOM 推斷會誤抓左側導覽列「自己」的個人連結，API 才拿得到真正的作者
async function getFilename(el, ext) {
  let username = null;
  const storyMatch = location.pathname.match(/^\/stories\/([^/]+)\//);
  if (storyMatch) {
    username = storyMatch[1];
  } else {
    const item = await fetchMediaInfo(findMediaId(el));
    username = item?.user?.username ?? getUsernameFromMedia(el);
  }

  let type = 'post';
  if (location.pathname.includes('/stories/')) {
    type = 'story';
  } else if (location.pathname.includes('/reel/') || location.pathname.includes('/reels/')) {
    type = 'reel';
  }

  return buildFilename(username, type, ext);
}

// 套用檔名樣板（批次下載會帶序號 suffix，如 _01、_02）
function buildFilename(username, type, ext, suffix = '') {
  const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, -4);
  const name = ((settings.filenameTemplate || '{username}_{type}_{timestamp}')
    .replace(/\{username\}/g, username)
    .replace(/\{type\}/g, type)
    .replace(/\{timestamp\}/g, timestamp) + suffix)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); // 移除檔名非法字元
  return `${name}.${ext}`;
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
function findMediaId(el) {
  const story = location.pathname.match(/^\/stories\/[^/]+\/(\d+)/);
  if (story) return story[1];

  // 優先找包住媒體本身的連結（個人頁/探索頁網格縮圖就是 <a> 直接包 <img>），
  // 再退回所屬 article / dialog，最後才用目前網址
  const selfLink = el.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
  const article = el.closest('article') || el.closest('[role="dialog"]') || document;
  const link = selfLink || article.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
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

// 呼叫 IG web API 取得貼文完整資訊（含作者、原始解析度圖片、progressive MP4）
// 以 media_id 快取，下載圖檔與產生檔名共用同一筆回應
const mediaInfoCache = new Map();
async function fetchMediaInfo(mediaId) {
  if (!mediaId) return null;
  if (mediaInfoCache.has(mediaId)) return mediaInfoCache.get(mediaId);
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: { 'x-ig-app-id': '936619743392459' },
      credentials: 'include'
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0] ?? null;
    if (item) {
      mediaInfoCache.set(mediaId, item);
      if (mediaInfoCache.size > 50) {
        mediaInfoCache.delete(mediaInfoCache.keys().next().value);
      }
    }
    return item;
  } catch (e) {
    console.warn('IG API fetch failed:', e);
    return null;
  }
}

// 依版本清單挑最高解析度的網址
function pickBestVersion(versions) {
  return versions?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
}

// 取得輪播中對應目前元素的子項目（非輪播則回傳貼文本身）
function getCarouselItem(item, el) {
  if (!item?.carousel_media?.length) return item;

  // 優先用點擊媒體的 CDN 資產編號精準比對：
  // DOM 的 <li> 索引會因 IG 預載前後張、首張前塞隱藏佔位而偏移（常 +1），
  // 改用使用者實際看到那張圖（影片則用封面 poster）的編號去找，最可靠
  let stem = null;
  if (el?.tagName === 'IMG') stem = igAssetStem(getBestImageUrl(el));
  else if (el?.tagName === 'VIDEO') stem = igAssetStem(el.poster);

  if (stem) {
    const match = item.carousel_media.find(m =>
      m.image_versions2?.candidates?.some(c => (c.url || '').includes(stem))
    );
    if (match) return match;
  }

  // 後備：DOM 位置推算
  const idx = Math.min(findCarouselIndex(el), item.carousel_media.length - 1);
  return item.carousel_media[idx] ?? item.carousel_media[0];
}

// 取得 progressive MP4（含音訊）
async function fetchVideoUrlFromApi(mediaId, video) {
  const item = await fetchMediaInfo(mediaId);
  if (!item) return null;

  if (item.video_versions?.length) return pickBestVersion(item.video_versions);

  if (item.carousel_media?.length) {
    const target = getCarouselItem(item, video);
    if (target?.video_versions?.length) return pickBestVersion(target.video_versions);
    for (const m of item.carousel_media) {
      const u = pickBestVersion(m.video_versions);
      if (u) return u;
    }
  }
  return null;
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

// 圖片下載（點擊當下才解析最佳網址，避免輪播切換後抓到舊圖）
// 優先用 media info API 的原始解析度圖（srcset 通常最高只有 1080p）
async function downloadImage(img) {
  try {
    let url = null;
    const item = await fetchMediaInfo(findMediaId(img));
    if (item) {
      const target = getCarouselItem(item, img);
      url = pickBestVersion(target?.image_versions2?.candidates);
    }
    if (!url) url = getBestImageUrl(img);
    const filename = await getFilename(img, getImageExt(url));
    return await downloadUrlToFile(url, filename);
  } catch (error) {
    console.error('Image download failed:', error);
    return false;
  }
}

// 在網頁端 fetch 圖片轉 blob 後交給 background 下載（最不易受 CORS / referer 阻擋）
async function downloadUrlToFile(url, filename) {
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

    const filename = await getFilename(video, 'mp4');

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
  btn.setAttribute('data-corner', settings.corner); // 由設定頁控制按鈕在媒體的哪個角落
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg><span class="tooltip"></span>`;

  const tooltip = btn.querySelector('.tooltip');

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');

    // 任何未捕捉的例外都不能讓按鈕卡在 loading 狀態
    let success = false;
    try {
      success = await onClickHandler();
    } catch (err) {
      console.warn('[IG-DL] download handler error:', err);
    }

    btn.classList.remove('loading');

    tooltip.textContent = success ? 'Downloaded!' : 'Failed';
    tooltip.classList.add('show');
    setTimeout(() => tooltip.classList.remove('show'), 2000);
  });

  return btn;
}

// 計算元素在視窗內的可見面積（用來挑出目前正在顯示的限動媒體）
function visibleArea(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return 0;
  const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return (w > 0 && h > 0) ? w * h : 0;
}

// 找出限時動態頁面「目前顯示中」的媒體。
// 不能拿 DOM 裡第一個符合的元素：SPA 切頁後舊頁面的圖片可能殘留、
// IG 也會預載前後則限動，必須以「視窗內可見面積最大」為準。
function findStoryMedia() {
  const pickLargest = els => els.reduce((a, b) => visibleArea(a) >= visibleArea(b) ? a : b, els[0]);

  const videos = Array.from(document.querySelectorAll('video')).filter(v => visibleArea(v) > 0);
  if (videos.length) return pickLargest(videos);

  const imgs = Array.from(document.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]'))
    .filter(img => img.naturalWidth > 300 && img.naturalHeight > 300 &&
                   !isProfilePicture(img) && visibleArea(img) > 0);
  if (imgs.length) return pickLargest(imgs);
  return null;
}

// 限時動態：在視窗右側加一顆固定按鈕（樣式由 .ig-download-btn--story 控制，
// 位置避開右下角的愛心／分享與右上角的暫停／靜音／選單）。
// 點擊當下才解析媒體，切到下一則限動也不會抓錯。
function addStoryButton() {
  if (document.body.querySelector(':scope > .ig-download-btn')) return;
  const btn = createDownloadButton(async () => {
    const media = findStoryMedia();
    if (!media) return false;
    return media.tagName === 'VIDEO' ? await downloadVideo(media) : await downloadImage(media);
  });
  btn.classList.add('ig-download-btn--story');
  btn.removeAttribute('data-corner'); // 限動按鈕為固定位置，不套用角落設定
  document.body.appendChild(btn);
}

// 一鍵下載貼文全部圖片：只在貼文頁（/p/...，含從用戶頁開啟的彈窗）
// 且貼文有 2 張以上圖片時顯示；影片項目暫時跳過
let addAllPending = false;
async function addDownloadAllButton() {
  if (addAllPending || document.querySelector('.ig-download-btn--all')) return;
  const m = location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)/);
  if (!m) return;
  const shortcode = m[1];

  addAllPending = true;
  try {
    const item = await fetchMediaInfo(shortcodeToMediaId(shortcode));
    // async 等待期間使用者可能已切換頁面或按鈕已建立
    if (!location.pathname.startsWith(`/p/${shortcode}`)) return;
    if (document.querySelector('.ig-download-btn--all')) return;

    const imageItems = (item?.carousel_media?.length ? item.carousel_media : item ? [item] : [])
      .filter(t => !t.video_versions?.length && t.image_versions2?.candidates?.length);
    if (imageItems.length < 2) return; // 單圖貼文用原本的單張按鈕即可

    const username = item.user?.username ?? 'instagram';
    const total = imageItems.length;
    let label = null;

    const btn = createDownloadButton(async () => {
      let ok = 0;
      for (let i = 0; i < total; i++) {
        if (label) label.textContent = `${i + 1}/${total}`;
        try {
          const url = pickBestVersion(imageItems[i].image_versions2.candidates);
          if (url) {
            const suffix = `_${String(i + 1).padStart(2, '0')}`;
            await downloadUrlToFile(url, buildFilename(username, 'post', getImageExt(url), suffix));
            ok++;
          }
        } catch (e) {
          console.warn('[IG-DL] batch item failed:', e);
        }
        // 連續下載間隔，避免被瀏覽器或 CDN 節流
        await new Promise(r => setTimeout(r, 300));
      }
      if (label) label.textContent = `全部 ${total} 張`;
      return ok === total;
    });

    btn.classList.add('ig-download-btn--all');
    btn.removeAttribute('data-corner');
    label = document.createElement('span');
    label.className = 'all-label';
    label.textContent = `全部 ${total} 張`;
    btn.insertBefore(label, btn.querySelector('.tooltip'));
    document.body.appendChild(btn);
  } finally {
    addAllPending = false;
  }
}

// 增加下載按鈕到圖片元素
function addDownloadButtonToElement(img) {
  if (!img.parentElement || img.parentElement.querySelector('.ig-download-btn')) return;
  if (isProfilePicture(img)) return;

  const btn = createDownloadButton(() => downloadImage(img));

  const container = img.parentElement;
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(btn);
}

// 增加下載按鈕到影片元素
function addDownloadButtonToVideo(video) {
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
  // 限時動態頁面：加一顆固定按鈕，媒體在點擊當下才解析
  if (/^\/stories\//.test(location.pathname)) {
    if (findStoryMedia()) addStoryButton();
    return;
  }

  // 貼文頁（從用戶頁點進或彈窗開啟）：提供一鍵下載全部圖片
  if (/^\/p\//.test(location.pathname)) addDownloadAllButton();

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

// 點擊救援：IG 會在影片上蓋一層透明的播放/暫停遮罩，且影片容器常被設成
// 獨立 stacking context，按鈕的 z-index 再高也會被遮罩蓋住、點不到。
// 在 document 捕獲階段攔截：只要點擊座標落在任一下載按鈕的範圍內，
// 就改為觸發該按鈕並阻止 IG 的播放/暫停處理。
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return; // 忽略程式觸發的合成事件，避免遞迴
  for (const btn of document.querySelectorAll('.ig-download-btn')) {
    if (btn === e.target || btn.contains(e.target)) return; // 正常命中，交給按鈕自己的 handler
    const r = btn.getBoundingClientRect();
    if (r.width > 0 &&
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom) {
      e.preventDefault();
      e.stopPropagation();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
      return;
    }
  }
}, true);

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
