# Just IG & Threads Image/Video Downloader

A lightweight Chrome & Firefox extension that adds a one‑click download button to images and videos on **Instagram** and **Threads** — photos, videos, Reels, Stories, and carousels.

No login, no third‑party servers, no data collection. Everything happens locally in your browser.

## Features

- 📸 **Images & videos** — download at the original resolution Instagram serves (not just the 1080p thumbnail).
- 🎞️ **Reels & Stories** — a fixed button appears on Story view; resolves the currently visible media at click time.
- 🖼️ **Carousels** — downloads the exact slide you're looking at, matched by CDN asset id (robust against Instagram's preloading offset).
- ⬇️ **Batch download** — on a post page with multiple images, one button saves them all (numbered `_01`, `_02`, …).
- 🧵 **Threads support** — the same engine works on `threads.net` / `threads.com`.
- ⚙️ **Settings popup** — choose the button corner and customise the filename template.

## Supported sites

- `instagram.com`
- `threads.net`, `threads.com`

## Install

### Store Links
- **Chrome Web Store:** [Just IG & Threads Image/Video Downloader](https://chromewebstore.google.com/detail/jkfhcnhffglcmeolblidlogkjmcgpcja)
- **Firefox Add-ons (AMO):** [Just IG & Threads Image/Video Downloader](https://addons.mozilla.org/firefox/addon/just-ig-threads-downloader/)

### Load unpacked (development / Chrome)
1. Build the extension (see [Build](#build)) — output lands in `dist/chrome` and `dist/firefox`.
2. **Chrome:** go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `dist/chrome`.
3. **Firefox:** go to `about:debugging` → **This Firefox** → **Load Temporary Add‑on**, and select `dist/firefox/manifest.json` (or install the packaged `.zip` via AMO).

## Build

Requires [Node.js](https://nodejs.org/) (no dependencies to install).

```bash
node build.js
```

This produces, under `dist/`:

- `dist/chrome/` and `dist/firefox/` — unpacked builds
- `just-ig-threads-downloader-chrome-v<version>.zip`
- `just-ig-threads-downloader-firefox-v<version>.zip` (with Firefox‑specific manifest tweaks)

The packager is a dependency‑free Node ZIP writer that always uses forward‑slash paths, so the archives are accepted by both the Chrome Web Store and AMO.

## Settings

Open the extension popup to configure:

| Setting | Description |
|---------|-------------|
| **Button position** | Which corner the download button sits in on posts / Reels (top‑left, top‑right, bottom‑left, bottom‑right). |
| **Filename template** | Pattern for saved files. Variables: `{username}`, `{type}`, `{timestamp}`. Default: `{username}_{type}_{timestamp}`. |

## How it works

- A content script injects download buttons and, on Instagram, calls the public web media‑info API to resolve the original‑resolution asset and the correct carousel slide.
- A background service worker intercepts CDN `.mp4` requests (per tab) as a fallback for resolving video URLs, and performs the actual download.
- Media is fetched to a Blob in the page and handed to the browser's download manager, which sidesteps most CORS / referrer restrictions.

## Privacy

The extension collects **no** data. It talks only to Instagram/Threads and their CDNs (`cdninstagram.com`, `fbcdn.net`) to fetch the media you choose to download.

## Project structure

```
manifest.json     Extension manifest (MV3)
background.js     Service worker: CDN interception + downloads
build.js          Dependency-free build & ZIP packager
src/
  content.js      Injects buttons, resolves & downloads media
  popup.html/js   Settings UI
  styles.css      Button styles
icons/            Extension icons
```
