// node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../src/ig-resolver.js');

test('parseIgPath: 各種貼文與 reel 網址', () => {
  const cases = [
    ['/p/DAbc123xYz_/', { kind: 'post', shortcode: 'DAbc123xYz_', username: null }],
    ['/p/DAbc123xYz_/?img_index=2', { kind: 'post', shortcode: 'DAbc123xYz_', username: null }],
    ['/natgeo/p/DAbc123xYz_/', { kind: 'post', shortcode: 'DAbc123xYz_', username: 'natgeo' }],
    ['/some.user_1/reel/C9-xyz/', { kind: 'reel', shortcode: 'C9-xyz', username: 'some.user_1' }],
    ['/reel/C9-xyz/', { kind: 'reel', shortcode: 'C9-xyz', username: null }],
    ['/reels/C9-xyz/', { kind: 'reel', shortcode: 'C9-xyz', username: null }],
    ['/tv/B1234/', { kind: 'reel', shortcode: 'B1234', username: null }],
    ['/reels/', { kind: 'reel', shortcode: null, username: null }],
    ['/natgeo/', { kind: 'other', shortcode: null, username: null }],
    ['/explore/', { kind: 'other', shortcode: null, username: null }],
    ['/', { kind: 'other', shortcode: null, username: null }]
  ];
  for (const [p, want] of cases) {
    const got = R.parseIgPath(p);
    assert.equal(got.kind, want.kind, p);
    assert.equal(got.shortcode, want.shortcode, p);
    assert.equal(got.username, want.username, p);
  }
});

test('parseIgPath: 保留路徑不可當成 username', () => {
  // /explore/p/... 不是合法網址形態，不應把 explore 當作者
  assert.equal(R.parseIgPath('/explore/p/ABC/').username, null);
  assert.equal(R.parseIgPath('/explore/p/ABC/').kind, 'other');
});

test('parseIgPath: 限時動態與精選動態', () => {
  const s = R.parseIgPath('/stories/natgeo/3456789012345678901/');
  assert.deepEqual([s.kind, s.username, s.storyPk], ['story', 'natgeo', '3456789012345678901']);
  const h = R.parseIgPath('/stories/highlights/17912345678901234/');
  assert.deepEqual([h.kind, h.username, h.storyPk], ['story', null, '17912345678901234']);
  assert.equal(R.parseIgPath('/stories/natgeo/').kind, 'story');
});

test('shortcodeFromHref: 相對與絕對網址', () => {
  assert.equal(R.shortcodeFromHref('/natgeo/p/ABC_def/'), 'ABC_def');
  assert.equal(R.shortcodeFromHref('https://www.instagram.com/reel/XYZ/?utm=1'), 'XYZ');
  assert.equal(R.shortcodeFromHref('/natgeo/'), null);
  assert.equal(R.shortcodeFromHref(null), null);
});

test('shortcodeToMediaId: 已知對照與長 shortcode', () => {
  assert.equal(R.shortcodeToMediaId('B'), '1');
  assert.equal(R.shortcodeToMediaId('BA'), '64');
  assert.equal(R.shortcodeToMediaId('_'), '63');
  // 私人帳號的長 shortcode 只取前 11 碼
  assert.equal(R.shortcodeToMediaId('CxYzAbCdEfGhIjKlMnOp'), R.shortcodeToMediaId('CxYzAbCdEfG'));
  assert.equal(R.shortcodeToMediaId('ab$'), null);
  assert.equal(R.shortcodeToMediaId(''), null);
});

test('extractFbDtsg: 各種格式', () => {
  assert.equal(R.extractFbDtsg('["DTSGInitialData",[],{"token":"NAft-abc:12:34"},258]'), 'NAft-abc:12:34');
  assert.equal(R.extractFbDtsg('x["DTSGInitData",[],{"token":"tok2","async_get_token":"y"}]'), 'tok2');
  assert.equal(R.extractFbDtsg('{"dtsg":{"token":"tok3","valid_for":86400}}'), 'tok3');
  assert.equal(R.extractFbDtsg('<input type="hidden" name="fb_dtsg" value="tok4" />'), 'tok4');
  assert.equal(R.extractFbDtsg('<html>no token</html>'), null);
  assert.equal(R.extractFbDtsg(null), null);
});

test('extractEmbeddedJson: 巢狀物件、字串內括號與跳脫引號', () => {
  const html = '<script type="application/json">{"require":[["x",{"__bbox":{"result":{"data":' +
    '{"xdt_api__v1__media__shortcode__web_info":{"items":[{"code":"ABC","caption":{"text":"he said \\"}{\\" ok ] ["},' +
    '"carousel_media":[{"pk":"1"},{"pk":"2"}]}]}}}}}]]}</script>';
  const v = R.extractEmbeddedJson(html, 'xdt_api__v1__media__shortcode__web_info');
  assert.equal(v.items[0].code, 'ABC');
  assert.equal(v.items[0].caption.text, 'he said "}{" ok ] [');
  assert.equal(v.items[0].carousel_media.length, 2);
});

test('extractEmbeddedJson: 第一個出現處是 null 時繼續找', () => {
  const t = '{"k":null,"x":{"k":{"a":1}}}';
  assert.deepEqual(R.extractEmbeddedJson(t, 'k'), { a: 1 });
  assert.equal(R.extractEmbeddedJson(t, 'missing'), null);
  assert.equal(R.extractEmbeddedJson('{"k":{"unterminated":', 'k'), null);
});

test('extractEmbeddedJson: 陣列值', () => {
  assert.deepEqual(R.extractEmbeddedJson('{"list": [1,{"b":"]"}]}', 'list'), [1, { b: ']' }]);
});

test('storyItemFromReelsMedia: pk 比對、資產編號比對、connection 形態', () => {
  const stem = '111_222_333';
  const data = {
    reels_media: [{
      user: { username: 'natgeo' },
      items: [
        { pk: '900', id: '900_1', image_versions2: { candidates: [{ url: 'https://x.cdninstagram.com/v/t51/444_555_666_n.jpg' }] } },
        { pk: '901', id: '901_1', video_versions: [{ type: 101, url: 'https://x/v.mp4' }],
          image_versions2: { candidates: [{ url: `https://x.cdninstagram.com/v/t51/${stem}_n.jpg?x=1` }] } }
      ]
    }]
  };
  const byPk = R.storyItemFromReelsMedia(data, { pk: '901' });
  assert.equal(byPk.item.pk, '901');
  assert.equal(byPk.username, 'natgeo');
  assert.equal(R.storyItemFromReelsMedia(data, { stem }).item.pk, '901');
  assert.equal(R.storyItemFromReelsMedia(data, { pk: '123' }), null);
  // 精選動態 connection 形態
  const conn = { edges: [{ node: data.reels_media[0] }] };
  assert.equal(R.storyItemFromReelsMedia(conn, { pk: 900 }).item.pk, '900');
  assert.equal(R.storyItemFromReelsMedia(null, { pk: '900' }), null);
});

test('pickBestVersion: 取最寬，沒有寬度時保留原順序', () => {
  assert.equal(R.pickBestVersion([{ width: 640, url: 'a' }, { width: 1440, url: 'b' }, { width: 1080, url: 'c' }]), 'b');
  assert.equal(R.pickBestVersion([{ url: 'first' }, { url: 'second' }]), 'first');
  assert.equal(R.pickBestVersion([]), null);
  assert.equal(R.pickBestVersion(undefined), null);
});

test('igAssetStem / mediaKey', () => {
  const u = 'https://scontent.cdninstagram.com/v/t51.29350-15/722996781_122134742631040146_1843618352848331808_n.webp?stp=dst-jpg';
  assert.equal(R.igAssetStem(u), '722996781_122134742631040146_1843618352848331808');
  assert.equal(R.mediaKey(u), '722996781_122134742631040146_1843618352848331808');
  assert.equal(R.mediaKey('https://x.fbcdn.net/o1/v/t2/f2/m86/AQabcdefghijklmnopqrstuvwxyz0123456789.mp4?efg=1'),
    'AQabcdefghijklmnopqrstuvwxyz0123456789.mp4');
  assert.equal(R.mediaKey('blob:https://www.instagram.com/uuid'), null);
  assert.equal(R.mediaKey('/rel/path.jpg', 'https://www.instagram.com/p/x/'), 'path.jpg');
});

// 兩支 content script 在瀏覽器中共用同一個全域範圍：頂層 const/let 重複宣告會讓第二支整個載入失敗
test('ig-resolver.js 與 content.js 可依 manifest 順序載入同一個全域範圍', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const files = manifest.content_scripts[0].js;
  assert.deepEqual(files, ['src/ig-resolver.js', 'src/content.js']);

  const noop = () => {};
  const fakeEl = { querySelectorAll: () => [], querySelector: () => null, addEventListener: noop };
  const sandbox = {
    console: { log: noop, debug: noop, warn: noop, error: noop },
    location: { hostname: 'www.instagram.com', pathname: '/', href: 'https://www.instagram.com/', origin: 'https://www.instagram.com' },
    chrome: { storage: { local: { get: (defaults) => Promise.resolve(defaults ?? {}), set: () => Promise.resolve() }, onChanged: { addListener: noop } }, runtime: { sendMessage: () => Promise.resolve({}) } },
    document: { ...fakeEl, cookie: '', scripts: [], documentElement: {}, body: fakeEl },
    window: { addEventListener: noop, innerWidth: 1280, innerHeight: 800 },
    fetch: () => Promise.reject(new Error('no network in test')),
    MutationObserver: class { observe() {} },
    setTimeout: noop, clearTimeout: noop, URL, URLSearchParams, BigInt
  };
  sandbox.window.fetch = sandbox.fetch;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(typeof vm.runInContext('resolvePost', sandbox), 'function');
  assert.equal(vm.runInContext('IS_IG', sandbox), true);
});

// 以假網路驅動完整解析鏈：驗證失效路徑會依序退下，且成功的方法會被排到最前面
function loadContentScripts({ routes, pathname = '/', documentScripts = [] }) {
  const calls = [];
  const noop = () => {};
  const mkRes = (spec) => ({
    ok: spec.status ? spec.status < 400 : true,
    status: spec.status ?? 200,
    redirected: !!spec.redirected,
    headers: { get: (h) => h.toLowerCase() === 'content-type' ? (spec.type ?? 'application/json') : null },
    json: async () => (typeof spec.body === 'string' ? JSON.parse(spec.body) : spec.body),
    text: async () => (typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body))
  });
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET', headers: opts.headers ?? {}, body: opts.body });
    for (const [re, spec] of routes) {
      if (re.test(String(url))) return mkRes(typeof spec === 'function' ? spec(url, opts) : spec);
    }
    return mkRes({ status: 404, type: 'text/html', body: '' });
  };
  const fakeEl = { querySelectorAll: () => [], querySelector: () => null, addEventListener: noop };
  const sandbox = {
    console: { log: noop, debug: noop, warn: noop, error: noop },
    location: { hostname: 'www.instagram.com', pathname, href: 'https://www.instagram.com' + pathname, origin: 'https://www.instagram.com' },
    chrome: { storage: { local: { get: (d) => Promise.resolve(d ?? {}), set: () => Promise.resolve() }, onChanged: { addListener: noop } }, runtime: { sendMessage: () => Promise.resolve({}) } },
    document: {
      ...fakeEl, cookie: 'csrftoken=CSRF123; ds_user_id=1', documentElement: {}, body: fakeEl,
      scripts: documentScripts.map(t => ({ textContent: t })),
      querySelectorAll: (sel) => sel.startsWith('script') ? documentScripts.map(t => ({ textContent: t })) : []
    },
    window: { addEventListener: noop, innerWidth: 1280, innerHeight: 800 },
    fetch: fakeFetch,
    MutationObserver: class { observe() {} },
    setTimeout: noop, clearTimeout: noop, URL, URLSearchParams, BigInt
  };
  sandbox.window.fetch = fakeFetch;
  vm.createContext(sandbox);
  for (const f of ['src/ig-resolver.js', 'src/content.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, calls, run: (code) => vm.runInContext(code, sandbox) };
}

const ITEM = (code) => ({ code, user: { username: 'natgeo' }, image_versions2: { candidates: [{ width: 1440, url: `https://x.cdninstagram.com/${code}_hi.jpg` }] } });
const DTSG_PAGE = '<script>["DTSGInitialData",[],{"token":"DT1"},1]</script>';

test('resolvePost: GraphQL 成功時送出正確參數', async () => {
  const { run, calls } = loadContentScripts({
    documentScripts: [DTSG_PAGE],
    routes: [[/\/graphql\/query$/, { body: { data: { xdt_api__v1__media__shortcode__web_info: { items: [ITEM('ABC')] } } } }]]
  });
  const item = await run('resolvePost("ABC")');
  assert.equal(item.code, 'ABC');
  assert.equal(calls.length, 1);
  const body = new URLSearchParams(calls[0].body);
  assert.equal(calls[0].method, 'POST');
  assert.equal(body.get('fb_dtsg'), 'DT1');
  assert.equal(body.get('fb_api_req_friendly_name'), 'PolarisPostRootQuery');
  assert.equal(JSON.parse(body.get('variables')).shortcode, 'ABC');
  assert.equal(calls[0].headers['x-csrftoken'], 'CSRF123');
  // 快取：第二次不再發請求
  await run('resolvePost("ABC")');
  assert.equal(calls.length, 1);
});

test('resolvePost: GraphQL 失效、REST 被導向首頁時退到內嵌 JSON，之後優先用內嵌', async () => {
  const embeddedHtml = (code) => `<html><script type="application/json">{"x":{"xdt_api__v1__media__shortcode__web_info":${JSON.stringify({ items: [ITEM(code)] })}}}</script></html>`;
  const { run, calls } = loadContentScripts({
    documentScripts: [DTSG_PAGE],
    routes: [
      [/\/graphql\/query$/, { body: { errors: [{ message: 'execution error', severity: 'CRITICAL' }] } }],
      [/\/api\/v1\/media\/\d+\/info\/$/, { redirected: true, type: 'text/html', body: '<html>home</html>' }],
      [/\/p\/([^/]+)\/$/, (url) => ({ type: 'text/html', body: embeddedHtml(String(url).match(/\/p\/([^/]+)\//)[1]) })],
      [/instagram\.com\/$/, { type: 'text/html', body: DTSG_PAGE }]
    ]
  });
  const item = await run('resolvePost("AAA")');
  assert.equal(item.code, 'AAA');
  // graphql 失敗後會清 token 重試一次（含重抓首頁取 token）
  assert.ok(calls.filter(c => c.url.endsWith('/graphql/query')).length === 2);
  assert.ok(calls.some(c => /\/api\/v1\/media\//.test(c.url)));
  assert.deepEqual(Array.from(run('postMethodOrder')), ['embedded', 'graphql', 'rest']);

  const before = calls.length;
  const item2 = await run('resolvePost("BBB")');
  assert.equal(item2.code, 'BBB');
  assert.equal(calls.length - before, 1, '第二篇應直接走內嵌 JSON，一次請求');
});

test('resolvePost: 全部失敗回傳 null', async () => {
  const { run } = loadContentScripts({ documentScripts: [], routes: [] });
  assert.equal(await run('resolvePost("ZZZ")'), null);
  assert.equal(await run('resolvePost(null)'), null);
});

test('resolveStoryItem: 從限動頁 HTML 取含音訊的影片網址', async () => {
  const story = {
    reels_media: [{ user: { username: 'natgeo' }, items: [
      { pk: '3001', video_versions: [{ type: 101, url: 'https://x.fbcdn.net/progressive.mp4' }], image_versions2: { candidates: [] } }
    ] }]
  };
  const { run, calls } = loadContentScripts({
    pathname: '/stories/natgeo/3001/',
    routes: [[/\/stories\/natgeo\/3001\/$/, { type: 'text/html', body: `<script type="application/json">{"a":{"xdt_api__v1__feed__reels_media":${JSON.stringify(story)}}}</script>` }]]
  });
  const hit = await run('resolveStoryItem({ tagName: "VIDEO", poster: "" })');
  assert.equal(hit.username, 'natgeo');
  assert.equal(run('pickBestVersion')(hit.item.video_versions), 'https://x.fbcdn.net/progressive.mp4');
  // 同一路徑第二次查詢走快取
  await run('resolveStoryItem({ tagName: "VIDEO", poster: "" })');
  assert.equal(calls.length, 1);
});
