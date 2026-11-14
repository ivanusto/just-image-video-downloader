# Changelog

All notable changes to the **Just Image & Video Downloader** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.1] - 2026-11-14

### Fixed
- **Instagram media resolution after the 2026 API change**: Instagram started redirecting `/api/v1/media/<id>/info/` to the homepage for many sessions (from August 2026). When that happened the extension silently fell back to 1080p `srcset` images, guessed the author from the DOM, hid the "Download All" button, and saved story videos without audio. Media is now resolved through a fallback chain:
  1. GraphQL `PolarisPostRootQuery` (`/graphql/query`, `fb_dtsg` read from the page, high-DPR hints for full-resolution candidates)
  2. Legacy REST media info (now detects the homepage redirect instead of parsing HTML as JSON)
  3. Embedded page JSON (`xdt_api__v1__media__shortcode__web_info`)
  The last method that succeeded is tried first next time, so a dead method costs at most one extra request.
- **Story videos with audio**: Stories now resolve from the story page's embedded `xdt_api__v1__feed__reels_media` data (matched by story ID, or by on-screen asset ID for highlights), giving the progressive MP4 with audio. CDN interception is only the last resort.
- **New Instagram URL shapes**: `/{username}/p/{code}/`, `/{username}/reel/{code}/` and `/reels/{code}/` are now recognised everywhere (author, file type, "Download All" on profile post dialogs).
- **`publish.js`**: looked for the pre-rename zip name (`just-ig-downloader-*`) and could never find the build output.

### Added
- **"Download All" includes videos**: carousel videos are downloaded alongside images (`_01`, `_02`, … in carousel order).
- Unit tests (`node --test test/*.test.js`) for URL parsing, token/JSON extraction, and the resolver chain with a mocked network.
- Console diagnostics: `[JIVD] resolver: graphql|rest|embedded|story-*` shows which method resolved each item.

### Changed
- Pure parsing helpers moved to `src/ig-resolver.js` (loaded before `src/content.js`).
- One MutationObserver instead of two; media elements that already have a live button are skipped without layout reads, and load listeners are no longer re-attached on every scan.
- Firefox: same-origin Instagram requests use `content.fetch` so they carry the page's own origin.

---

## [4.0] - 2026-08-06

### Changed
- **Project Renamed**: Extension renamed from its previous trademark-conflicting name to **Just Image & Video Downloader**, following a Chrome Web Store brand-infringement notice. All user-visible strings, store listing copy, and package filenames updated; repository renamed to `just-image-video-downloader`.
- **New Visual Identity**: Brand-new original icon (circular download-arrow badge) replacing the previous camera-style icon; UI accent color changed from `#0095f6` to an independent brand blue `#2563eb`.
- **Original Store Assets**: All store screenshots replaced with original illustrative mockups (`store-assets/`) — no real third-party UI is depicted.

### Unchanged
- All functionality is identical to v3.5. Internal storage keys and the Firefox Gecko ID are intentionally preserved for seamless upgrades.

---

## [3.5] - 2026-07-22

### Fixed
- **Chromium Blob Download Filename Bug Fix**: Fixed an issue in Chromium-based browsers where blob downloads occasionally resulted in random UUID filenames (e.g. `c032a188-4f81-4ef4-...`) by registering blob-to-filename mappings with `onDeterminingFilename` in the background worker.

### Added
- **Duplicate Download Protection (重複下載防護)**:
  - Tracks downloaded media assets (`igAssetStem`) in `chrome.storage.local` with automatic LRU cleanup.
  - Prompts for confirmation when attempting to re-download previously saved photos or videos.
  - Automatically skips previously downloaded items during **Batch Download ("Download All")**, with an option to force re-download all items if confirmed.

### Changed
- **Scan & Render Optimization**:
  - Reduced scroll and DOM observer debounce scanner delay from 500ms to 300ms.
  - Implemented multi-stage initial scans (0ms, 300ms, 1000ms, 2500ms) to ensure download buttons render instantly during React client-side hydration.

---

## [3.3] - 2026-06-20

### Added
- **Threads Platform Support Official Rename**: Updated extension name to **Just IG & Threads Image/Video Downloader**.
- **Comprehensive Documentation**: Added complete `README.md` with installation, build instructions, feature matrix, settings reference, and privacy policy.

### Changed
- **Download Core Optimization**: Consolidated blob download helpers into a unified `downloadViaBlob` function supporting images, videos, and batch downloads.
- **Performance Improvements**:
  - Rewrote click-rescue handler using `Element.closest()` to eliminate layout thrashing (`getBoundingClientRect()`) during page interactions.
  - Shared a debounced observer scanner for scroll and DOM mutation events.
  - Enhanced SPA navigation handling with `popstate` listening alongside DOM observers.
- **Network Compatibility**: Stripped credentials from blob fetches to support strict CDN Access-Control-Allow-Origin (`ACAO:*`) policies.

---

## [3.2] - 2026-06-18

### Added
- **Threads Integration**: Full image and video downloading support for `threads.net` and `threads.com`.

### Fixed
- **Threads Layout & Rendering Fix**: Resolved issue where position-relative wrapper caused Threads carousel images to collapse to 0 height / black screen. Downloads now anchor to the element's `offsetParent`.
- **Firefox AMO Compatibility**: Updated Gecko extension ID in manifest (`just-ig-image-downloader@ivanusto.com`) to match registered AMO listing.

---

## [3.1] - 2026-06-12

### Added
- **Always-Visible Blue Buttons**: Replaced hover-only buttons with high-visibility IG Signature Blue (`#0095f6`) download buttons.
- **Capture-Phase Click Rescue**: Intercepts clicks at document capture phase so media overlay shields do not block download buttons.
- **Batch Download ("Download All")**: One-click batch download button on multi-image post pages (`/p/`) with progress indicators and automatic `_01`, `_02` index suffixes.
- **Story Media Resolution**: Dedicated fixed download pill for Instagram Stories, dynamically resolving the active story slide with the largest visible screen area.
- **Original Quality Media API**: Fetches original resolution image candidates (`image_versions2`) via Instagram GraphQL / REST media info API instead of 1080p DOM `srcset`.
- **Settings Popup**:
  - Customizable button placement corner (Top-Left, Top-Right, Bottom-Left, Bottom-Right) with real-time UI updates.
  - Filename template customization with `{username}`, `{type}`, and `{timestamp}` tokens.
- **Robust ZIP Packager**: Pure-Node dependency-free ZIP packer in `build.js` ensuring cross-platform ZIP compatibility for AMO and Chrome Web Store.

### Changed
- **Permission Cleanup**: Removed unused `scripting` and `activeTab` permissions; added `storage` permission for user preferences.

---

## [2.8] - 2026-05-26

### Added
- **Initial Baseline Release**: Single image and video downloading for Instagram posts, Reels, and Stories.
