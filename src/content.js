// Just Image & Video Downloader — content script
// 依賴 src/ig-resolver.js（manifest 中排在本檔之前載入）提供的純函式：
// parseIgPath、shortcodeFromHref、shortcodeToMediaId、extractFbDtsg、extractEmbeddedJson、
// postItemFromWebInfo、storyItemFromReelsMedia、pickBestVersion、igAssetStem、mediaKey
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

// 跨檔共用的常數（popup.js 另有一份相同預設值；兩者執行於不同腳本環境，無法共享模組）
const DEFAULT_FILENAME_TEMPLATE = '{username}_{type}_{timestamp}';
// 檔名非法字元（Windows / macOS 皆涵蓋），下載前一律以底線取代
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// 簡單的 trailing debounce：連續觸發只在最後一次停止後執行一次
function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// 平台偵測：同一支腳本同時支援 Instagram 與 Threads。
// 兩者都是 Meta 的 React SPA，圖片/影片共用 cdninstagram / fbcdn CDN，
// 下載核心（解析網址 → blob → background 下載）完全共用；
// IG 專屬功能（貼文解析鏈、限時動態、一鍵下載全部）以 IS_IG 包起來。
const HOST = location.hostname;
const IS_IG = /(^|\.)instagram\.com$/i.test(HOST);
const IS_THREADS = /(^|\.)threads\.(net|com)$/i.test(HOST);

// 對 IG 自身（同源）的請求：Firefox 的 content script 用 content.fetch 才會以頁面身分送出
// （Origin / Referer 為 instagram.com，與網站自己的請求一致）；Chrome 的 fetch 本來就是如此。
// CDN 媒體檔的下載不走這裡，維持一般 fetch。
const igFetch = (typeof browser !== 'undefined' && typeof content !== 'undefined' &&
                 content && typeof content.fetch === 'function')
  ? content.fetch.bind(content)
  : fetch.bind(window);

// 使用者設定（popup 可調整按鈕位置與檔名格式）
const settings = {
  corner: 'top-left',
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE
};

// 已下載紀錄：key 為 CDN 資產編號（同一媒體不論解析度/格式皆相同），
// 檔名內含 timestamp、每次都不同，無法靠檔名判斷重複，必須用資產編號比對。
// 存於 storage.local，跨分頁與瀏覽器重啟皆有效。
const downloadedMedia = new Map(); // key -> { fn: 檔名, ts: 下載時間 }
const DOWNLOADED_MAX = 800;

try {
  chromeAPI.storage.local.get(settings).then(saved => {
    Object.assign(settings, saved);
    document.querySelectorAll('.ig-download-btn:not(.ig-download-btn--story)')
      .forEach(b => b.setAttribute('data-corner', settings.corner));
  });
  chromeAPI.storage.local.get({ downloadedMedia: {} }).then(({ downloadedMedia: saved }) => {
    for (const [k, v] of Object.entries(saved)) {
      if (!downloadedMedia.has(k)) downloadedMedia.set(k, v);
    }
  });
  chromeAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
      if (key === 'downloadedMedia' && newValue) {
        for (const [k, v] of Object.entries(newValue)) downloadedMedia.set(k, v);
      }
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

// 媒體元素本身的資產編號（圖片看實際顯示那張，影片看封面 poster）
function elementStem(el) {
  if (el?.tagName === 'IMG') return igAssetStem(getBestImageUrl(el), location.href);
  if (el?.tagName === 'VIDEO' && el.poster) return igAssetStem(el.poster, location.href);
  return null;
}

// 寫入已下載紀錄（防抖合併寫入 storage；超量時淘汰最舊的）
let persistDownloadedTimer = null;
function recordDownload(key, filename) {
  if (!key) return;
  downloadedMedia.set(key, { fn: filename, ts: Date.now() });
  while (downloadedMedia.size > DOWNLOADED_MAX) {
    let oldestKey = null, oldestTs = Infinity;
    for (const [k, v] of downloadedMedia) {
      if ((v.ts ?? 0) < oldestTs) { oldestTs = v.ts ?? 0; oldestKey = k; }
    }
    downloadedMedia.delete(oldestKey);
  }
  clearTimeout(persistDownloadedTimer);
  persistDownloadedTimer = setTimeout(() => {
    try {
      chromeAPI.storage.local.set({ downloadedMedia: Object.fromEntries(downloadedMedia) });
    } catch (e) {}
  }, 500);
}

// 重複下載時詢問使用者；回傳 true 表示仍要下載
function confirmRedownload(key, kindLabel) {
  const prev = downloadedMedia.get(key);
  if (!prev) return true;
  const when = prev.ts ? new Date(prev.ts).toLocaleString() : '先前';
  return window.confirm(
    `${kindLabel}之前已下載過\n（${when}，檔名：${prev.fn}）\n\n仍要再下載一次嗎？`
  );
}

// 從 URL 偵測圖片副檔名（IG 現在會輸出 webp / heic 等格式）
function getImageExt(url) {
  try {
    const m = new URL(url, location.href).pathname.match(/\.(jpe?g|png|webp|gif|avif|heic)$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch (e) {}
  return 'jpg';
}

// 從媒體元素往上找所屬 article 中貼文作者的 username（解析鏈全部失敗時的最後後備）
function getUsernameFromMedia(el) {
  const route = parseIgPath(location.pathname);
  if (route.username) return route.username;

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

// Threads 的作者帳號：貼文頁網址就是 /@username/post/code，最可靠；
// 動態牆上各則貼文網址不變，改從媒體往上找最近含 a[href^="/@"] 的祖先。
function getThreadsUsername(el) {
  const m = location.pathname.match(/^\/@([A-Za-z0-9_.]+)/);
  if (m) return m[1];

  try {
    let node = el;
    for (let i = 0; i < 15 && node; i++) {
      const link = node.querySelector?.('a[href^="/@"]');
      if (link) {
        const mm = link.getAttribute('href').match(/^\/@([A-Za-z0-9_.]+)/);
        if (mm) return mm[1];
      }
      node = node.parentElement;
    }
  } catch (e) {}
  return 'threads';
}

// 產生檔案名稱（預設格式: {username}_{type}_{timestamp}.{ext}，可由設定頁調整）。
// IG 的帳號名稱以解析鏈拿到的 item.user 為準：單篇貼文頁沒有 <article> 包裹，
// DOM 推斷會誤抓左側導覽列「自己」的個人連結。
function filenameFor(el, ext, { item = null, username = null } = {}) {
  if (IS_THREADS) {
    return buildFilename(getThreadsUsername(el), 'threads', ext);
  }

  const route = parseIgPath(location.pathname);
  const name = username || item?.user?.username || item?.owner?.username ||
               route.username || getUsernameFromMedia(el);

  let type = 'post';
  if (route.kind === 'story') type = 'story';
  else if (route.kind === 'reel' || item?.product_type === 'clips') type = 'reel';

  return buildFilename(name, type, ext);
}

// 套用檔名樣板（批次下載會帶序號 suffix，如 _01、_02）
function buildFilename(username, type, ext, suffix = '') {
  const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, -4);
  const name = ((settings.filenameTemplate || DEFAULT_FILENAME_TEMPLATE)
    .replace(/\{username\}/g, username)
    .replace(/\{type\}/g, type)
    .replace(/\{timestamp\}/g, timestamp) + suffix)
    .replace(ILLEGAL_FILENAME_CHARS, '_'); // 移除檔名非法字元
  return `${name}.${ext}`;
}

// 由 DOM / URL 推斷媒體所屬貼文的 shortcode。
// 1. 包住媒體本身的連結（個人頁/探索頁網格縮圖就是 <a> 直接包 <img>）
// 2. 彈窗或單篇頁（沒有 <article>）：以網址為準，避免抓到下方「更多貼文」的連結
// 3. 動態牆：所屬 article 內的貼文連結（時間戳記連結）
// 4. 最後用目前網址
const POST_LINK_SEL = 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"], a[href*="/tv/"]';
function findShortcode(el) {
  const selfLink = el.closest?.(POST_LINK_SEL);
  const fromSelf = shortcodeFromHref(selfLink?.getAttribute('href'));
  if (fromSelf) return fromSelf;

  const route = parseIgPath(location.pathname);
  const article = el.closest?.('article');
  const inDialog = !!el.closest?.('[role="dialog"]');
  if (route.shortcode && (inDialog || !article)) return route.shortcode;

  const container = article || el.closest?.('[role="dialog"]');
  if (container) {
    for (const a of container.querySelectorAll(POST_LINK_SEL)) {
      const sc = shortcodeFromHref(a.getAttribute('href'));
      if (sc) return sc;
    }
  }
  return route.shortcode;
}

// 找輪播中「目前顯示」的索引
function findCarouselIndex(el) {
  const list = el.closest('ul') || el.closest('[role="presentation"]');
  if (!list) return 0;
  const items = list.querySelectorAll('li, [role="listitem"]');
  for (let i = 0; i < items.length; i++) {
    if (items[i].contains(el)) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// IG 貼文解析鏈
// 2026 年 8 月起 /api/v1/media/<id>/info/ 對部分工作階段會改導向首頁，
// 因此改為依序嘗試：GraphQL PolarisPostRootQuery → 舊 REST → 頁面內嵌 JSON。
// 三者回傳的 item 結構相同（image_versions2 / video_versions / carousel_media / user），
// 下游的輪播比對與挑最高解析度邏輯不需區分來源。
// 最近一次成功的方法會排到最前面，失效的方法不會每次都白打一輪。
// ---------------------------------------------------------------------------
const IG_APP_ID = '936619743392459';
// PolarisPostRootQuery 的 persisted query id。IG 改版時會失效（回 errors），
// 屆時解析鏈會自動退到 REST / 內嵌 JSON，更新此常數即可恢復。
const IG_POST_ROOT_DOC_ID = '27852811784380813';

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function isJsonResponse(res) {
  return (res.headers.get('content-type') || '').includes('json');
}

// fb_dtsg：先從目前頁面的 script 取，沒有再抓一次首頁 HTML；成功快取 1 小時，失敗 60 秒內不重抓
let dtsgCache = { token: null, ts: 0 };
async function getFbDtsg(force = false) {
  const age = Date.now() - dtsgCache.ts;
  if (!force && dtsgCache.token && age < 3600e3) return dtsgCache.token;
  if (!force && !dtsgCache.token && dtsgCache.ts && age < 60e3) return null;

  let token = null;
  for (const s of document.scripts) {
    const t = s.textContent;
    if (t && (t.includes('DTSG') || t.includes('dtsg'))) {
      token = extractFbDtsg(t);
      if (token) break;
    }
  }
  if (!token) {
    try {
      const res = await igFetch(`${location.origin}/`, {
        credentials: 'include',
        headers: { accept: 'text/html' }
      });
      if (res.ok) token = extractFbDtsg(await res.text());
    } catch (e) {}
  }
  dtsgCache = { token, ts: Date.now() };
  return token;
}

async function fetchPostViaGraphql(shortcode, retry = true) {
  const dtsg = await getFbDtsg(!retry);
  if (!dtsg) return null;

  const body = new URLSearchParams({
    fb_dtsg: dtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisPostRootQuery',
    doc_id: IG_POST_ROOT_DOC_ID,
    variables: JSON.stringify({
      shortcode,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
      __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: false
    }),
    server_timestamps: 'true'
  });

  const res = await igFetch(`${location.origin}/graphql/query`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-fb-friendly-name': 'PolarisPostRootQuery',
      'x-csrftoken': getCsrfToken(),
      'x-ig-app-id': IG_APP_ID,
      'x-requested-with': 'XMLHttpRequest',
      // 讓 IG 回傳高 DPR 的圖片候選（Sec-Ch-* 是瀏覽器禁止自訂的標頭，只能送這兩個）
      'dpr': '3',
      'viewport-width': '3840'
    },
    body: body.toString()
  });

  const json = (res.ok && isJsonResponse(res)) ? await res.json().catch(() => null) : null;
  const item = postItemFromWebInfo(json?.data?.xdt_api__v1__media__shortcode__web_info);
  // fb_dtsg 過期時 IG 回 errors 或非 JSON：清快取、重抓 token 再試一次
  if (!item && retry && (!json || json.errors)) return fetchPostViaGraphql(shortcode, false);
  return item;
}

// 舊 REST：仍對部分工作階段有效。被改導向首頁時 res.redirected 為 true、內容是 HTML
async function fetchItemViaRest(mediaId) {
  if (!mediaId) return null;
  const res = await igFetch(`${location.origin}/api/v1/media/${mediaId}/info/`, {
    credentials: 'include',
    headers: {
      'x-ig-app-id': IG_APP_ID,
      'x-csrftoken': getCsrfToken(),
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  if (!res.ok || res.redirected || !isJsonResponse(res)) return null;
  const data = await res.json().catch(() => null);
  return data?.items?.[0] ?? null;
}

// 目前頁面 <script type="application/json"> 中的 Relay 預載資料
function scanDocumentFor(key) {
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const t = s.textContent;
    if (!t || !t.includes(key)) continue;
    const v = extractEmbeddedJson(t, key);
    if (v) return v;
  }
  return null;
}

// 抓同源頁面 HTML 取內嵌資料（SPA 切頁後目前 document 不會有新頁面的預載資料）
async function fetchPageJson(path, key) {
  const res = await igFetch(`${location.origin}${path}`, {
    credentials: 'include',
    headers: { accept: 'text/html' }
  });
  if (!res.ok) return null;
  return extractEmbeddedJson(await res.text(), key);
}

const WEB_INFO_KEY = 'xdt_api__v1__media__shortcode__web_info';
async function fetchPostViaEmbedded(shortcode) {
  const local = postItemFromWebInfo(scanDocumentFor(WEB_INFO_KEY));
  if (local && local.code === shortcode) return local;
  return postItemFromWebInfo(await fetchPageJson(`/p/${shortcode}/`, WEB_INFO_KEY));
}

const POST_METHODS = {
  graphql: (sc) => fetchPostViaGraphql(sc),
  rest: (sc) => fetchItemViaRest(shortcodeToMediaId(sc)),
  embedded: (sc) => fetchPostViaEmbedded(sc)
};
let postMethodOrder = ['graphql', 'rest', 'embedded'];

const postCache = new Map();    // shortcode -> item（最多 50 筆）
const postInflight = new Map(); // shortcode -> Promise（同一次點擊內多處呼叫只發一次請求）

function isUsableItem(item) {
  return !!(item && (item.image_versions2 || item.video_versions || item.carousel_media));
}

async function resolvePost(shortcode) {
  if (!shortcode) return null;
  if (postCache.has(shortcode)) return postCache.get(shortcode);
  if (postInflight.has(shortcode)) return postInflight.get(shortcode);

  const p = (async () => {
    for (const name of postMethodOrder.slice()) {
      try {
        const item = await POST_METHODS[name](shortcode);
        if (isUsableItem(item)) {
          console.debug(`[JIVD] resolver: ${name}`, shortcode);
          if (postMethodOrder[0] !== name) {
            postMethodOrder = [name, ...postMethodOrder.filter(n => n !== name)];
          }
          postCache.set(shortcode, item);
          if (postCache.size > 50) postCache.delete(postCache.keys().next().value);
          return item;
        }
      } catch (e) {
        console.debug(`[JIVD] resolver: ${name} failed`, e);
      }
    }
    console.debug('[JIVD] resolver: none', shortcode);
    return null;
  })();

  postInflight.set(shortcode, p);
  try {
    return await p;
  } finally {
    postInflight.delete(shortcode);
  }
}

// ---------------------------------------------------------------------------
// 限時動態解析：限動頁 HTML 內嵌 xdt_api__v1__feed__reels_media（含 progressive MP4 與原圖），
// 以網址中的 story pk 比對，精選動態（highlights）網址不帶 pk，改用畫面上媒體的資產編號比對。
// 影片因此能拿到含音訊的檔案，CDN 攔截只剩最後後備（那條只抓得到無音訊的 DASH 視訊軌）。
// ---------------------------------------------------------------------------
const REELS_MEDIA_KEYS = ['xdt_api__v1__feed__reels_media', 'xdt_api__v1__feed__reels_media__connection'];
const storyPageCache = new Map(); // 頁面路徑 -> reels_media 資料（最多 10 筆）

function findStoryInData(data, query) {
  return data ? storyItemFromReelsMedia(data, query) : null;
}

async function resolveStoryItem(el) {
  const route = parseIgPath(location.pathname);
  const isHighlight = /^\/stories\/highlights\//.test(location.pathname);
  const query = { pk: isHighlight ? null : route.storyPk, stem: elementStem(el) };
  if (!query.pk && !query.stem) return null;

  // 1. 目前頁面的預載資料
  for (const key of REELS_MEDIA_KEYS) {
    const hit = findStoryInData(scanDocumentFor(key), query);
    if (hit) { console.debug('[JIVD] resolver: story-embedded'); return hit; }
  }

  // 2. 抓限動頁 HTML（同一路徑快取，連續看同一人的限動不重抓）
  const path = (!isHighlight && route.username && route.storyPk)
    ? `/stories/${route.username}/${route.storyPk}/`
    : location.pathname;
  try {
    let data = storyPageCache.get(path);
    if (!data) {
      for (const key of REELS_MEDIA_KEYS) {
        data = await fetchPageJson(path, key);
        if (data) break;
      }
      if (data) {
        storyPageCache.set(path, data);
        if (storyPageCache.size > 10) storyPageCache.delete(storyPageCache.keys().next().value);
      }
    }
    const hit = findStoryInData(data, query);
    if (hit) { console.debug('[JIVD] resolver: story-page'); return hit; }
  } catch (e) {
    console.debug('[JIVD] resolver: story-page failed', e);
  }

  // 3. 舊 REST（限動 pk 也是 media id）
  if (query.pk) {
    try {
      const item = await fetchItemViaRest(query.pk);
      if (isUsableItem(item)) {
        console.debug('[JIVD] resolver: story-rest');
        return { item, username: item.user?.username ?? null };
      }
    } catch (e) {}
  }
  console.debug('[JIVD] resolver: story none');
  return null;
}

// 取得輪播中對應目前元素的子項目（非輪播則回傳貼文本身）
function getCarouselItem(item, el) {
  if (!item?.carousel_media?.length) return item;

  // 優先用點擊媒體的 CDN 資產編號精準比對：
  // DOM 的 <li> 索引會因 IG 預載前後張、首張前塞隱藏佔位而偏移（常 +1），
  // 改用使用者實際看到那張圖（影片則用封面 poster）的編號去找，最可靠
  const stem = elementStem(el);
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

// 從解析結果取 progressive MP4（含音訊）
function videoUrlFromItem(item, video) {
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

// 圖片下載（點擊當下才解析最佳網址，避免輪播切換後抓到舊圖）
// IG 優先用解析鏈的原始解析度圖（srcset 通常最高只有 1080p）
async function downloadImage(img) {
  try {
    let url = null, item = null, username = null;
    // Threads 沒有等價 API，直接用 srcset 取最高解析度。
    if (IS_IG) {
      if (parseIgPath(location.pathname).kind === 'story') {
        const hit = await resolveStoryItem(img);
        if (hit) {
          item = hit.item;
          username = hit.username;
          url = pickBestVersion(hit.item.image_versions2?.candidates);
        }
      } else {
        item = await resolvePost(findShortcode(img));
        if (item) url = pickBestVersion(getCarouselItem(item, img)?.image_versions2?.candidates);
      }
    }
    if (!url) url = getBestImageUrl(img);

    // 重複下載偵測：同一張圖（資產編號相同）已下載過就先詢問
    const key = mediaKey(url, location.href);
    if (key && downloadedMedia.has(key) && !confirmRedownload(key, '這張圖片')) {
      return 'skipped';
    }

    const filename = filenameFor(img, getImageExt(url), { item, username });
    const ok = await downloadViaBlob(url, filename);
    if (ok) recordDownload(key, filename);
    return ok;
  } catch (error) {
    console.error('Image download failed:', error);
    return false;
  }
}

// 在網頁端 fetch 資源轉 blob 後交給 background 下載（最不易受 CORS / referer 阻擋）。
// 圖片、批次下載與影片後備共用；fetch 不帶 credentials 以相容 CDN 的 ACAO:* 回應。
async function downloadViaBlob(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000); // 留時間給 background / 瀏覽器讀取

  // 優先透過 background 下載 blob，維持檔名與下載紀錄
  try {
    const res = await chromeAPI.runtime.sendMessage({ action: 'download', url: blobUrl, filename });
    if (res?.success) return true;
  } catch (e) {
    console.warn('[JIVD] background download failed, falling back to anchor click');
  }

  // 後備：在網頁直接以 <a download> 觸發。
  // 先向 background 登記 blob URL 對應檔名——部分 Chrome 版本會忽略
  // <a download> 的檔名而存成 blob UUID 隨機名，由 background 的
  // onDeterminingFilename 強制套回正確檔名
  try {
    await chromeAPI.runtime.sendMessage({ action: 'registerFilename', url: blobUrl, filename });
  } catch (e) { /* background 不可用時仍嘗試 anchor 下載 */ }
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

// 影片檔儲存：先讓 background 直接下載 CDN 網址，失敗（多半是 CDN 回 403 / 擋 referrer）再走 blob
async function saveVideoUrl(url, filename) {
  try {
    const res = await chromeAPI.runtime.sendMessage({ action: 'download', url, filename });
    if (res?.success) return true;
  } catch (e) {}
  console.log('[JIVD] direct download failed, falling back to blob fetch');
  return downloadViaBlob(url, filename);
}

// 影片下載
async function downloadVideo(video) {
  try {
    let url = null, item = null, username = null;

    // 1. video.src 若是直接 progressive mp4（非 blob / MSE）就直接用
    if (video.src && !video.src.startsWith('blob:')) {
      url = video.src;
    } else if (video.currentSrc && !video.currentSrc.startsWith('blob:')) {
      url = video.currentSrc;
    } else {
      for (const s of video.querySelectorAll('source')) {
        if (s.src && !s.src.startsWith('blob:')) {
          url = s.src;
          break;
        }
      }
    }

    // 2. IG 解析鏈（Threads 無此 API，略過直接走 CDN 攔截）
    if (!url && IS_IG) {
      if (parseIgPath(location.pathname).kind === 'story') {
        const hit = await resolveStoryItem(video);
        if (hit) {
          item = hit.item;
          username = hit.username;
          url = pickBestVersion(hit.item.video_versions);
        }
      } else {
        item = await resolvePost(findShortcode(video));
        url = videoUrlFromItem(item, video);
      }
    }

    // 3. 最後使用 CDN 攔截後備
    if (!url) {
      url = await fetchVideoUrlFromCdn(video);
    }

    if (!url) {
      console.warn('[JIVD] could not resolve video URL via direct src, resolver, or CDN interception');
      return false;
    }

    // 重複下載偵測：同一部影片已下載過就先詢問
    const key = mediaKey(url, location.href);
    if (key && downloadedMedia.has(key) && !confirmRedownload(key, '這部影片')) {
      return 'skipped';
    }

    const filename = filenameFor(video, 'mp4', { item, username });
    const ok = await saveVideoUrl(url, filename);
    if (ok) recordDownload(key, filename);
    return ok;
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
    // 回傳值：true 成功 / false 失敗 / 'skipped' 使用者在重複下載提示按了取消
    let success = false;
    try {
      success = await onClickHandler();
    } catch (err) {
      console.warn('[JIVD] download handler error:', err);
    }

    btn.classList.remove('loading');

    tooltip.textContent = success === 'skipped' ? '已取消（重複）'
      : success ? 'Downloaded!' : 'Failed';
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

// 一鍵下載貼文全部媒體：只在貼文頁（/p/...、/{user}/p/... 彈窗）
// 且貼文有 2 項以上可下載的圖片或影片時顯示
let addAllPendingFor = null;
async function addDownloadAllButton(shortcode) {
  if (addAllPendingFor === shortcode || document.querySelector('.ig-download-btn--all')) return;

  addAllPendingFor = shortcode;
  try {
    const item = await resolvePost(shortcode);
    // async 等待期間使用者可能已切換頁面或按鈕已建立
    if (parseIgPath(location.pathname).shortcode !== shortcode) return;
    if (document.querySelector('.ig-download-btn--all')) return;

    const entries = (item?.carousel_media?.length ? item.carousel_media : item ? [item] : [])
      .map(t => {
        const isVideo = !!t.video_versions?.length;
        const url = isVideo ? pickBestVersion(t.video_versions)
                            : pickBestVersion(t.image_versions2?.candidates);
        return url ? { url, isVideo } : null;
      })
      .filter(Boolean);
    if (entries.length < 2) return; // 單一媒體用原本的單張按鈕即可

    const username = item.user?.username ?? parseIgPath(location.pathname).username ?? 'instagram';
    const total = entries.length;
    const unit = entries.some(e => e.isVideo) ? '項' : '張';
    const idleLabel = `全部 ${total} ${unit}`;
    let label = null;

    const btn = createDownloadButton(async () => {
      // 批次前先盤點重複：已下載過的自動略過；若全部都下載過則詢問是否整批重下
      const dupCount = entries.filter(({ url }) => {
        const k = mediaKey(url, location.href);
        return k && downloadedMedia.has(k);
      }).length;
      let force = false;
      if (dupCount === total) {
        if (!window.confirm(`這 ${total} ${unit}之前都已下載過，仍要全部重新下載嗎？`)) {
          if (label) label.textContent = idleLabel;
          return 'skipped';
        }
        force = true;
      }

      let ok = 0, skipped = 0;
      for (let i = 0; i < total; i++) {
        if (label) label.textContent = `${i + 1}/${total}`;
        const { url, isVideo } = entries[i];
        try {
          const key = mediaKey(url, location.href);
          if (!force && key && downloadedMedia.has(key)) {
            skipped++;
            continue; // 已下載過，略過（不需節流等待）
          }
          const suffix = `_${String(i + 1).padStart(2, '0')}`;
          const fn = buildFilename(username, 'post', isVideo ? 'mp4' : getImageExt(url), suffix);
          const saved = isVideo ? await saveVideoUrl(url, fn) : await downloadViaBlob(url, fn);
          if (saved) {
            recordDownload(key, fn);
            ok++;
          }
        } catch (e) {
          console.warn('[JIVD] batch item failed:', e);
        }
        // 連續下載間隔，避免被瀏覽器或 CDN 節流
        await new Promise(r => setTimeout(r, 300));
      }
      if (label) {
        label.textContent = skipped ? `新 ${ok}・略過 ${skipped}` : idleLabel;
      }
      return ok + skipped === total;
    });

    btn.classList.add('ig-download-btn--all');
    btn.removeAttribute('data-corner');
    label = document.createElement('span');
    label.className = 'all-label';
    label.textContent = idleLabel;
    btn.insertBefore(label, btn.querySelector('.tooltip'));
    document.body.appendChild(btn);
  } finally {
    if (addAllPendingFor === shortcode) addAllPendingFor = null;
  }
}

// 每個媒體元素對應的按鈕：按鈕仍在頁面上就不再處理該元素，
// 省掉每次掃描對同一批元素重複的 getComputedStyle / getBoundingClientRect。
// React 重繪把按鈕移除時 isConnected 變 false，下次掃描會補回。
const mediaButtons = new WeakMap(); // element -> button
const waitingMedia = new WeakSet(); // 已掛上 load / loadedmetadata 監聽、等待載入的元素

function hasLiveButton(el) {
  return mediaButtons.get(el)?.isConnected === true;
}

// 增加下載按鈕到圖片元素
function addDownloadButtonToElement(img) {
  if (!img.parentElement || hasLiveButton(img)) return;
  if (isProfilePicture(img)) return;

  // 決定按鈕的掛載容器，且不破壞網站既有版面。
  // Threads 輪播的圖片是「絕對定位」、以某個高度正常的祖先為定位基準；
  // 若把它的直接父層強制改成 relative，圖片會改用高度為 0 的父層當基準而塌掉變黑
  // （下載仍正常，因為 srcset 還在，只是頁面預覽變黑）。
  // 因此對絕對定位的圖片，直接把按鈕掛到它真正的定位基準（offsetParent），不動任何 position。
  let container;
  const imgPos = getComputedStyle(img).position;
  if (imgPos === 'absolute' || imgPos === 'fixed') {
    container = img.offsetParent;
    if (!container || container === document.body || container === document.documentElement) {
      container = img.parentElement; // 後備：找不到合適的定位基準時退回父層
    }
  } else {
    // 一般文件流的圖片（IG 貼文圖即如此）：父層改 relative 無害，給按鈕一個定位基準
    container = img.parentElement;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
  }

  const existing = container.querySelector(':scope > .ig-download-btn');
  if (existing) {
    mediaButtons.set(img, existing);
    return;
  }
  const btn = createDownloadButton(() => downloadImage(img));
  container.appendChild(btn);
  mediaButtons.set(img, btn);
}

// 增加下載按鈕到影片元素
function addDownloadButtonToVideo(video) {
  if (hasLiveButton(video)) return;
  const container = video.parentElement;
  if (!container) return;
  const existing = container.querySelector('.ig-download-btn');
  if (existing) {
    mediaButtons.set(video, existing);
    return;
  }

  // 影片尚無任何來源，等待載入後重試（同一元素只掛一次監聽，避免每次掃描累積）
  if (!video.currentSrc && !video.src && !video.querySelector?.('source')?.src) {
    if (waitingMedia.has(video)) return;
    waitingMedia.add(video);
    const retry = () => {
      waitingMedia.delete(video);
      addDownloadButtonToVideo(video);
    };
    video.addEventListener('loadedmetadata', retry, { once: true });
    video.addEventListener('canplay', retry, { once: true });
    return;
  }

  const btn = createDownloadButton(() => downloadVideo(video));
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(btn);
  mediaButtons.set(video, btn);
}

// 增加下載按鈕到所有媒體元素（採用 size Heuristics 配合 class fallback 避免 IG 動態變更類名）
function addDownloadButtons() {
  const route = IS_IG ? parseIgPath(location.pathname) : null;

  // 限時動態頁面：加一顆固定按鈕，媒體在點擊當下才解析（IG 專屬，Threads 無限動）
  if (route?.kind === 'story') {
    if (findStoryMedia()) addStoryButton();
    return;
  }

  // 貼文頁（單篇或從個人頁開啟的彈窗）：提供一鍵下載全部（IG 專屬，依賴解析鏈）
  if (route?.kind === 'post' && route.shortcode) addDownloadAllButton(route.shortcode);

  // 先處理影片
  for (const video of document.querySelectorAll('video')) {
    if (hasLiveButton(video) || waitingMedia.has(video)) continue;
    const rect = video.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) continue; // 過濾小預覽圖或非主影片
    addDownloadButtonToVideo(video);
  }

  // 再處理圖片
  const images = document.querySelectorAll('img[src*="cdninstagram.com"], img[src*="fbcdn.net"], img[src*="instagram.com"]');
  for (const img of images) {
    if (hasLiveButton(img) || waitingMedia.has(img)) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) continue; // 過濾小圖

    if (img.complete && img.naturalWidth > 150 && img.naturalHeight > 150) {
      addDownloadButtonToElement(img);
    } else if (!img.complete) {
      waitingMedia.add(img);
      img.addEventListener('load', () => {
        waitingMedia.delete(img);
        if (img.naturalWidth > 150 && img.naturalHeight > 150) {
          addDownloadButtonToElement(img);
        }
      }, { once: true });
    }
  }
}

// 點擊救援：IG 會在影片上蓋一層透明的播放/暫停遮罩，且影片容器常被設成
// 獨立 stacking context，按鈕的 z-index 再高也會被遮罩蓋住、點不到。
// 在 document 捕獲階段攔截：只要點擊座標落在任一下載按鈕的範圍內，
// 就改為觸發該按鈕並阻止 IG 的播放/暫停處理。
document.addEventListener('click', (e) => {
  if (!e.isTrusted) return; // 忽略程式觸發的合成事件，避免遞迴
  if (e.target.closest?.('.ig-download-btn')) return; // 直接點到按鈕：交給按鈕自己的 handler（常見路徑，免去下方 layout 讀取）

  // 點到覆蓋在按鈕上的 IG 透明遮罩：用座標比對找出被遮住的下載按鈕並代為觸發
  for (const btn of document.querySelectorAll('.ig-download-btn')) {
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

// 滾動與 DOM 變動共用同一個 debounce 掃描器（trailing 300ms）
const scheduleScan = debounce(addDownloadButtons, 300);
window.addEventListener('scroll', scheduleScan, { passive: true });

// SPA 路由變更偵測：換頁時移除固定按鈕（限動/批次）後重新掃描。
// 單一 MutationObserver 同時負責路由偵測與觸發掃描；popstate 另外即時涵蓋上一頁/下一頁。
let lastUrl = location.href;
function onUrlMaybeChanged() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  document.querySelectorAll('body > .ig-download-btn').forEach(b => b.remove());
}
new MutationObserver(() => {
  onUrlMaybeChanged();
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', () => {
  onUrlMaybeChanged();
  scheduleScan();
});

// 初始化：立即掃一次，再分梯次補掃——React 首屏渲染完成時間不定，
// 早到的媒體立刻有按鈕，晚到的靠補掃與 MutationObserver 接手
addDownloadButtons();
setTimeout(addDownloadButtons, 300);
setTimeout(addDownloadButtons, 1000);
setTimeout(addDownloadButtons, 2500);
