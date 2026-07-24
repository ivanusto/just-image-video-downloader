// 自動上傳 dist zip 到 Chrome Web Store 與 Firefox AMO（零相依，Node 18+）
//
// 使用方式：
//   node build.js            # 先產生 dist/*.zip
//   node publish.js          # 兩個平台都上傳
//   node publish.js chrome   # 只上傳 Chrome
//   node publish.js firefox  # 只上傳 Firefox
//
// 憑證來源（擇一，環境變數優先）：
//   1. 環境變數
//   2. 專案根目錄 publish.config.json（勿上傳到公開 repo）
//
// 需要的憑證：
//   Chrome Web Store（注意：CWS API「不支援 service account」，
//   必須用擁有該擴充功能的 Google 帳號走 OAuth 流程取得 refresh token）
//     CWS_CLIENT_ID       - GCP OAuth 用戶端 ID（Desktop app 類型）
//     CWS_CLIENT_SECRET   - GCP OAuth 用戶端密鑰
//     CWS_REFRESH_TOKEN   - 以擁有者帳號同意 chromewebstore scope 後取得
//     CWS_EXTENSION_ID    - 商店上 32 字元的擴充功能 ID（首次需手動上架取得）
//   Firefox AMO（https://addons.mozilla.org/developers/addon/api/key/）
//     AMO_JWT_ISSUER      - JWT issuer（形如 user:12345678:123）
//     AMO_JWT_SECRET      - JWT secret（64 字元 hex）
//
// publish.config.json 範例：
//   {
//     "CWS_CLIENT_ID": "xxx.apps.googleusercontent.com",
//     "CWS_CLIENT_SECRET": "GOCSPX-...",
//     "CWS_REFRESH_TOKEN": "1//0g...",
//     "CWS_EXTENSION_ID": "abcdefghijklmnopabcdefghijklmnop",
//     "AMO_JWT_ISSUER": "user:12345678:123",
//     "AMO_JWT_SECRET": "..."
//   }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AMO_ADDON_ID = 'just-ig-image-downloader@ivanusto.com'; // 與 build.js 的 gecko id 一致
const AMO_HOST = 'https://addons.mozilla.org';

// --- 讀取憑證：環境變數優先，其次 publish.config.json ---
function loadConfig() {
  let fileCfg = {};
  const cfgPath = path.join(__dirname, 'publish.config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      console.warn('publish.config.json 解析失敗，忽略：', e.message);
    }
  }
  const get = (k) => process.env[k] || fileCfg[k] || null;
  return {
    cws: {
      clientId: get('CWS_CLIENT_ID'),
      clientSecret: get('CWS_CLIENT_SECRET'),
      refreshToken: get('CWS_REFRESH_TOKEN'),
      accessToken: get('CWS_ACCESS_TOKEN'), // 選用：直接給短效 access token（約 1 小時），可免 client id/secret
      extensionId: get('CWS_EXTENSION_ID')
    },
    amo: {
      issuer: get('AMO_JWT_ISSUER'),
      secret: get('AMO_JWT_SECRET')
    }
  };
}

function findZip(platform, version) {
  const zipPath = path.join(__dirname, 'dist', `just-ig-downloader-${platform}-v${version}.zip`);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`找不到 ${zipPath}，請先執行 node build.js`);
  }
  return zipPath;
}

async function assertOk(res, what) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${what} 失敗：HTTP ${res.status} ${body.slice(0, 500)}`);
  }
  return res;
}

// ---------------- Chrome Web Store ----------------
async function getCwsAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  await assertOk(res, 'CWS 換取 access token');
  const { access_token } = await res.json();
  return access_token;
}

async function publishChrome(cws, zipPath) {
  if (!cws.extensionId) throw new Error('缺少 CWS_EXTENSION_ID');
  let token;
  if (cws.accessToken) {
    console.log('[chrome] 使用提供的 access token');
    token = cws.accessToken;
  } else {
    if (!cws.clientId || !cws.clientSecret || !cws.refreshToken) {
      throw new Error('缺少 CWS_ACCESS_TOKEN，或 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN 組合');
    }
    console.log('[chrome] 取得 access token…');
    token = await getCwsAccessToken(cws);
  }
  const headers = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };

  console.log(`[chrome] 上傳 ${path.basename(zipPath)}…`);
  const upRes = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${cws.extensionId}`,
    { method: 'PUT', headers, body: fs.readFileSync(zipPath) }
  );
  await assertOk(upRes, 'CWS 上傳');
  const upJson = await upRes.json();
  if (upJson.uploadState === 'FAILURE') {
    throw new Error(`CWS 上傳被拒：${JSON.stringify(upJson.itemError ?? upJson)}`);
  }
  console.log(`[chrome] 上傳狀態：${upJson.uploadState}`);

  console.log('[chrome] 送出發佈（進入商店審核）…');
  const pubRes = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${cws.extensionId}/publish`,
    { method: 'POST', headers }
  );
  await assertOk(pubRes, 'CWS 發佈');
  const pubJson = await pubRes.json();
  console.log(`[chrome] 發佈結果：${(pubJson.status ?? []).join(', ') || JSON.stringify(pubJson)}`);
}

// ---------------- Firefox AMO ----------------
// AMO 用 JWT（HS256）驗證，每次請求簽一顆短效 token 即可
function amoJwt({ issuer, secret }) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ iss: issuer, jti: crypto.randomUUID(), iat: now, exp: now + 240 });
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function publishFirefox(amo, zipPath, version) {
  if (!amo.issuer || !amo.secret) {
    throw new Error('缺少 Firefox 憑證 AMO_JWT_ISSUER / AMO_JWT_SECRET');
  }
  const auth = () => ({ Authorization: `JWT ${amoJwt(amo)}` });

  // 1. 上傳 zip 建立 upload
  console.log(`[firefox] 上傳 ${path.basename(zipPath)}…`);
  const form = new FormData();
  form.append('upload', new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' }),
    path.basename(zipPath));
  form.append('channel', 'listed');
  const upRes = await fetch(`${AMO_HOST}/api/v5/addons/upload/`, {
    method: 'POST', headers: auth(), body: form
  });
  await assertOk(upRes, 'AMO 上傳');
  const { uuid } = await upRes.json();

  // 2. 輪詢驗證結果（AMO 會先跑 linter）
  console.log('[firefox] 等待 AMO 驗證…');
  let upload = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await fetch(`${AMO_HOST}/api/v5/addons/upload/${uuid}/`, { headers: auth() });
    await assertOk(st, 'AMO 查詢驗證狀態');
    upload = await st.json();
    if (upload.processed) break;
    console.log(`[firefox] 驗證中…(${(i + 1) * 5}s)`);
  }
  if (!upload?.processed) throw new Error('AMO 驗證逾時（150 秒）');
  if (!upload.valid) {
    throw new Error(`AMO 驗證未通過：${JSON.stringify(upload.validation?.messages?.slice(0, 5) ?? upload.validation)}`);
  }
  console.log('[firefox] 驗證通過');

  // 3. 以 upload uuid 建立新版本（自動送審）
  console.log(`[firefox] 建立版本 ${version}…`);
  const verRes = await fetch(`${AMO_HOST}/api/v5/addons/addon/${encodeURIComponent(AMO_ADDON_ID)}/versions/`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload: uuid })
  });
  await assertOk(verRes, 'AMO 建立版本');
  const verJson = await verRes.json();
  console.log(`[firefox] 已送出版本 ${verJson.version ?? version}，等待 AMO 審核`);
}

// ---------------- main ----------------
(async () => {
  const target = (process.argv[2] || 'all').toLowerCase();
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')).version;
  const cfg = loadConfig();
  console.log(`發佈 v${version} → ${target}`);

  let failed = false;
  if (target === 'all' || target === 'chrome') {
    try {
      await publishChrome(cfg.cws, findZip('chrome', version));
    } catch (e) {
      failed = true;
      console.error(`[chrome] ${e.message}`);
    }
  }
  if (target === 'all' || target === 'firefox') {
    try {
      await publishFirefox(cfg.amo, findZip('firefox', version), version);
    } catch (e) {
      failed = true;
      console.error(`[firefox] ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
