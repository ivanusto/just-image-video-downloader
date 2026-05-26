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
      id: "just-ig-image-downloader@ivanusto.gmail.com",
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

console.log('Build completed successfully!');
console.log('Chrome build is ready in "dist/chrome"');
console.log('Firefox build is ready in "dist/firefox"');
