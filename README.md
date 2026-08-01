# Just IG & Threads Image/Video Downloader

A lightweight, high-performance Chrome & Firefox extension (Manifest V3) that adds a convenient one‑click download button to images and videos on **Instagram** and **Threads** — photos, videos, Reels, Stories, and multi‑image carousels.

No login, no third‑party servers, no data collection. Everything executes 100% locally in your browser.

---

## ⚡ Key Features

- 📸 **Original Quality Media** — Downloads photos and videos at the original, highest resolution served by Meta's CDN (bypassing compressed 1080p DOM previews).
- 🛡️ **Duplicate Download Protection (New in v3.5)** — Automatically tracks previously downloaded assets (`igAssetStem`). Prompts with a confirmation dialog showing previous download timestamp & filename before re-downloading, preventing duplicate files from cluttering your storage.
- 🐛 **Reliable Filenames (New in v3.5)** — Service worker filename mapping (`onDeterminingFilename`) prevents Chromium blob download bugs that cause random UUID filenames (`c032a188-...`).
- ⬇️ **Smart Batch Download ("Download All")** — Save all carousel images from a multi-photo post at once with progressive index numbering (`_01`, `_02`, ...). Automatically skips previously saved slides unless forced.
- 🎞️ **Reels & Stories Support** — Dedicated download pill for Instagram Stories and Reels that dynamically resolves the active visible media at click time.
- 🖼️ **Accurate Carousel Matching** — Resolves exact carousel slide matching using CDN asset stems, immune to Instagram's hidden DOM preloading offsets.
- 🧵 **Threads Integration** — Native support for downloading images and videos on `threads.net` and `threads.com`.
- ⚙️ **Customizable Settings** — Choose button placement corner (Top-Left, Top-Right, Bottom-Left, Bottom-Right) and build custom filename templates using `{username}`, `{type}`, and `{timestamp}` tokens.

---

## 🛍️ Store Listings & Installation

### Official Stores
- 🌐 **Chrome Web Store:** [Just IG & Threads Image/Video Downloader](https://chromewebstore.google.com/detail/jkfhcnhffglcmeolblidlogkjmcgpcja)
- 🦊 **Firefox Add-ons (AMO):** [Just IG & Threads Image/Video Downloader](https://addons.mozilla.org/firefox/addon/just-ig-threads-downloader/)

### Load Unpacked (Development / Manual Install)
1. Clone or download this repository.
2. Build the extension (see [Build](#-build)) — outputs land in `dist/chrome` and `dist/firefox`.
3. **Chrome / Edge / Brave:**
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select `dist/chrome`
4. **Firefox:**
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on...**
   - Select `dist/firefox/manifest.json`

---

## 🛠️ Build & Package

Requires [Node.js](https://nodejs.org/) (no external dependencies required).

```bash
node build.js
```

Running `build.js` produces under `dist/`:
- `dist/chrome/` & `dist/firefox/` — Unpacked extension builds
- `just-ig-threads-downloader-chrome-v<version>.zip` — Store-ready Chrome package
- `just-ig-threads-downloader-firefox-v<version>.zip` — Store-ready Firefox package (with Firefox manifest Gecko ID configurations)

---

## ⚙️ Extension Settings

Click the extension icon in your browser toolbar to open the settings popup:

| Setting | Description | Default |
|---------|-------------|---------|
| **Button Position** | Choose which corner the download button sits in on posts & Reels (`top-left`, `top-right`, `bottom-left`, `bottom-right`). | `top-left` |
| **Filename Template** | Pattern used for saved files. Available tokens: `{username}`, `{type}`, `{timestamp}`. | `{username}_{type}_{timestamp}` |

*Example filename output:* `instagram_user_post_2026-08-01_140000.jpg`

---

## 🔍 How It Works

1. **Content Script Injection**: A content script injects high-visibility blue download buttons into media elements on Instagram and Threads.
2. **Media Resolution**:
   - **Instagram Posts**: Calls Instagram's public web media-info GraphQL / REST API to fetch maximum uncompressed resolution candidates (`image_versions2`).
   - **Threads & Fallbacks**: Resolves via high-res DOM `srcset` or intercepting video CDN streams (`.mp4`).
3. **Blob Downloading**: Media is fetched directly to a browser `Blob` and processed through `chrome.downloads`, bypassing CORS and referrer blocking.
4. **Duplicate Protection**: Downloaded asset IDs are cached in `chrome.storage.local` to prevent accidental duplicate downloads.

---

## 🔒 Privacy Policy

This extension is **100% private and transparent**:
- Collects **zero** user data, analytics, or tracking.
- Communicates **only** directly with Instagram and Threads CDNs (`cdninstagram.com`, `fbcdn.net`) to fetch media files requested by the user.
- Performs all media resolution and file saving locally in your browser.

---

## 📝 Recent Updates & Changelog

- **v3.5**: Added Chromium blob filename fix, Duplicate Download Protection, smart batch skipping, and optimized DOM rendering scans.
- **v3.3**: Refactored download core (`downloadViaBlob`), added performance improvements with `closest()`, updated documentation.
- **v3.2**: Added full Threads (`threads.net`, `threads.com`) support and fixed layout rendering quirks.
- **v3.1**: Redesigned UI with always-visible signature blue buttons, capture-phase click rescue, "Download All" batch mode, Stories support, and settings popup.

For full version history details, see [`CHANGELOG.md`](CHANGELOG.md).
For store review documentation and store descriptions, see [`CHROMEWEBSTORE.md`](CHROMEWEBSTORE.md).
