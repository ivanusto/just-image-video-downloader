const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');
const chromeDir = path.join(distDir, 'chrome');
const firefoxDir = path.join(distDir, 'firefox');

// Files and directories to include in build
const includeItems = [
  'manifest.json',
  'background.js',
  'src',
  'icons'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName),
                        path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Clean dist folder
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

// Create build target folders
fs.mkdirSync(chromeDir, { recursive: true });
fs.mkdirSync(firefoxDir, { recursive: true });

// Copy source items
includeItems.forEach(item => {
  const srcPath = path.join(srcDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursiveSync(srcPath, path.join(chromeDir, item));
    copyRecursiveSync(srcPath, path.join(firefoxDir, item));
  }
});

// Post-process Firefox manifest
const firefoxManifestPath = path.join(firefoxDir, 'manifest.json');
if (fs.existsSync(firefoxManifestPath)) {
  const manifestData = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));

  // 1. Add Firefox Gecko Specific Settings
  manifestData.browser_specific_settings = {
    gecko: {
      id: "just-ig-image-downloader@ivanusto.com",
      strict_min_version: "142.0",
      data_collection_permissions: {
        required: ["none"],
        optional: []
      }
    }
  };

  // 2. Convert service_worker to scripts for Firefox compatibility
  if (manifestData.background && manifestData.background.service_worker) {
    manifestData.background.scripts = [manifestData.background.service_worker];
    delete manifestData.background.service_worker;
  }

  fs.writeFileSync(firefoxManifestPath, JSON.stringify(manifestData, null, 2));
}

// --- Store-ready zip packaging (zip root = extension root, as required by CWS/AMO) ---
// 注意：不可使用 Windows PowerShell 的 Compress-Archive——它會在 zip 內寫入
// 反斜線路徑（src\content.js），違反 zip 規範，Firefox/Chrome 會找不到檔案。
// 這裡用純 Node 實作最小化 zip writer，保證路徑為正斜線。
const zlib = require('zlib');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

function listFilesRecursive(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name; // 一律使用正斜線
    if (fs.statSync(full).isDirectory()) out.push(...listFilesRecursive(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

function createZip(folder, zipPath) {
  const files = listFilesRecursive(folder);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { full, rel } of files) {
    const data = fs.readFileSync(full);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const name = Buffer.from(rel, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0, 6);          // flags
    local.writeUInt16LE(8, 8);          // compression: deflate
    local.writeUInt16LE(0, 10);         // mod time
    local.writeUInt16LE(0x21, 12);      // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);         // extra field length
    chunks.push(local, name, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);    // central directory signature
    cd.writeUInt16LE(20, 4);            // version made by
    cd.writeUInt16LE(20, 6);            // version needed
    cd.writeUInt16LE(8, 10);            // compression: deflate
    cd.writeUInt16LE(0x21, 14);         // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);       // local header offset
    central.push(cd, name);

    offset += local.length + name.length + compressed.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);    // end of central directory signature
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, cdBuf, eocd]));
}

const version = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8')).version;
for (const [name, dir] of [['chrome', chromeDir], ['firefox', firefoxDir]]) {
  const zipPath = path.join(distDir, `just-image-video-downloader-${name}-v${version}.zip`);
  createZip(dir, zipPath);
  console.log(`Packaged: ${path.relative(srcDir, zipPath)}`);
}

console.log('Build completed successfully!');
console.log('Chrome build is ready in "dist/chrome"');
console.log('Firefox build is ready in "dist/firefox"');
