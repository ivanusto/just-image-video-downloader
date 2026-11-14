// Just Image & Video Downloader — IG 解析用純函式
// 不碰 DOM、不發請求，content.js 與 Node 單元測試（test/）共用。
// 以 content script 載入時，這些宣告與 content.js 處於同一個隔離環境的全域範圍。

// IG 網址形態（2026）：
//   /p/{code}/、/reel/{code}/、/reels/{code}/、/tv/{code}/
//   /{username}/p/{code}/、/{username}/reel/{code}/（個人頁點開的貼文彈窗）
//   /stories/{username}/{pk}/、/stories/highlights/{id}/
const IG_RESERVED_PATHS = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'direct', 'accounts',
  'about', 'developer', 'legal', 'api', 'graphql', 'web', 'challenge', 'emails'
]);

function parseIgPath(pathname) {
  const out = { kind: 'other', shortcode: null, username: null, storyPk: null };
  if (typeof pathname !== 'string') return out;
  const path = pathname.split(/[?#]/)[0];

  const story = path.match(/^\/stories\/([^/]+)\/(\d+)/);
  if (story) {
    out.kind = 'story';
    if (story[1] !== 'highlights') out.username = story[1];
    out.storyPk = story[2];
    return out;
  }
  if (/^\/stories\//.test(path)) {
    out.kind = 'story';
    return out;
  }

  const m = path.match(/^\/(?:([A-Za-z0-9_.]+)\/)?(p|reels?|tv)\/([A-Za-z0-9_-]+)/);
  if (m && !(m[1] && IG_RESERVED_PATHS.has(m[1]))) {
    out.kind = m[2] === 'p' ? 'post' : 'reel';
    out.shortcode = m[3];
    if (m[1]) out.username = m[1];
    return out;
  }

  // /reels/（Reels 動態首頁，尚未帶 shortcode）
  if (/^\/reels\/?$/.test(path)) out.kind = 'reel';
  return out;
}

// 從任意 href（可能是絕對網址）抽出 shortcode
function shortcodeFromHref(href) {
  if (!href) return null;
  try {
    const path = /^https?:/i.test(href) ? new URL(href).pathname : href;
    return parseIgPath(path).shortcode;
  } catch (e) {
    return null;
  }
}

// IG shortcode → numeric media_id（IG 自訂 base64 字典）
function shortcodeToMediaId(shortcode) {
  if (!shortcode) return null;
  // 私人帳號貼文的 shortcode 可能超過 11 碼，只有前 11 碼對應 media_id
  const code = shortcode.length > 11 ? shortcode.slice(0, 11) : shortcode;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const ch of code) {
    const v = alphabet.indexOf(ch);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

// 從頁面 HTML / script 文字擷取 fb_dtsg（GraphQL POST 必要參數）
const FB_DTSG_PATTERNS = [
  /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
  /"DTSGInitData",\[\],\{"token":"([^"]+)"/,
  /"dtsg":\{"token":"([^"]+)"/,
  /name="fb_dtsg"\s+value="([^"]+)"/
];
function extractFbDtsg(text) {
  if (typeof text !== 'string' || !text) return null;
  for (const re of FB_DTSG_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

// 在 HTML / script 文字中找 "key": 之後的 JSON 值（物件或陣列），以括號配對切出後解析。
// IG 把 Relay 預載資料塞在 <script type="application/json"> 裡，結構深且外層包裝常變，
// 直接找資料鍵名比依賴外層路徑穩定。同一鍵出現多次時回傳第一個能成功解析的。
function extractEmbeddedJson(text, key) {
  if (typeof text !== 'string' || !text || !key) return null;
  const needle = `"${key}":`;
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at < 0) return null;
    from = at + needle.length;

    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    const open = text[i];
    if (open !== '{' && open !== '[') continue; // 值是 null 或字串：找下一個

    const end = matchBracket(text, i);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(i, end + 1));
    } catch (e) {
      // 解析失敗（例如被 HTML 跳脫過）：繼續找下一個出現處
    }
  }
}

// 從 start（必須是 { 或 [）開始找對應的結束括號，跳過字串內容；找不到回傳 -1
function matchBracket(text, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 從 PolarisPostRootQuery 回應或內嵌資料取出貼文 item（與舊 REST items[0] 同形）
function postItemFromWebInfo(webInfo) {
  return webInfo?.items?.[0] ?? null;
}

// 限動內嵌資料的外層形態不固定：{reels_media:[...]}、{edges:[{node}]}（精選動態 connection）或直接陣列
function reelsFromData(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reels_media)) return data.reels_media;
  if (Array.isArray(data?.edges)) return data.edges.map(e => e?.node).filter(Boolean);
  return [];
}

// 從限動內嵌資料（xdt_api__v1__feed__reels_media）找出目前那則：
// 優先比對 story pk（一般限動網址帶 pk），否則用畫面上媒體的資產編號比對（精選動態網址不帶 pk）
function storyItemFromReelsMedia(data, { pk = null, stem = null } = {}) {
  const reels = reelsFromData(data);
  const pkStr = pk == null ? null : String(pk);
  if (pkStr) {
    for (const reel of reels) {
      for (const item of reel?.items ?? []) {
        if (String(item?.pk ?? '') === pkStr || String(item?.id ?? '').split('_')[0] === pkStr) {
          return { item, username: reel?.user?.username ?? item?.user?.username ?? null };
        }
      }
    }
  }
  if (stem) {
    for (const reel of reels) {
      for (const item of reel?.items ?? []) {
        if (item?.image_versions2?.candidates?.some(c => (c?.url || '').includes(stem))) {
          return { item, username: reel?.user?.username ?? item?.user?.username ?? null };
        }
      }
    }
  }
  return null;
}

// 依版本清單挑最高解析度的網址；沒有寬度資訊（限動內嵌資料）時保留原順序取第一個
function pickBestVersion(versions) {
  if (!Array.isArray(versions) || !versions.length) return null;
  return versions.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
}

// 從 IG CDN 網址擷取「資產編號」(如 722996781_122134742631040146_1843618352848331808)
// 同一張照片不論解析度/格式都共用此編號，可用來精準對應輪播中的某一張
function igAssetStem(url, base) {
  try {
    const path = new URL(url, base).pathname;
    const m = path.match(/\/(\d+_\d+_\d+)_[a-z]+\.[a-z0-9]+/i);
    return m ? m[1] : null;
  } catch (e) {}
  return null;
}

// 由下載網址推導重複比對用的 key：優先用資產編號，
// 退而求其次用 CDN 路徑最後一段檔名（影片 mp4 的長雜湊名亦穩定）
function mediaKey(url, base) {
  if (!url || url.startsWith('blob:')) return null;
  const stem = igAssetStem(url, base);
  if (stem) return stem;
  try {
    const last = new URL(url, base).pathname.split('/').pop();
    if (last) return last;
  } catch (e) {}
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseIgPath, shortcodeFromHref, shortcodeToMediaId, extractFbDtsg,
    extractEmbeddedJson, matchBracket, postItemFromWebInfo, reelsFromData, storyItemFromReelsMedia,
    pickBestVersion, igAssetStem, mediaKey
  };
}
