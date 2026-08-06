# Just Image & Video Downloader - Store Listing Documentation

This document serves as the single source of truth for store listing copy, metadata, release notes, and store submissions for **Just Image & Video Downloader** across the Chrome Web Store (CWS) and Firefox Add-ons (AMO).

- **Chrome Web Store (CWS):** (pending re-submission)
- **Firefox Add-ons (AMO):** https://addons.mozilla.org/firefox/addon/just-ig-threads-downloader/ (listing rename pending)

---

## Release Notes / 更新日誌 (v4.0)

### 繁體中文
- **全新名稱與全新視覺識別**：擴充套件正式更名為「Just Image & Video Downloader」，同步推出全新設計圖示與品牌藍配色。
- **商店素材重製**：線上商店所有預覽圖與宣傳圖全面替換為原創示意圖，確保完全符合商店規範與品牌權益。
- **完整保留 v3.5 強大核心功能與修復**：
  - 功能與 v3.5 完全一致。
  - 修正隨機 UUID 檔名問題，回復預設結構化檔名。
  - 重複下載保護機制（記憶下載紀錄，重複時彈出對話框並顯示上次下載時間與檔名資訊）。
  - 智慧批次跳過（自動跳過已下載過的項目）。
  - 優化按鈕渲染速度與媒體偵測效能。

### English
- **New Brand Name & Visual Identity**: Officially renamed to "Just Image & Video Downloader", featuring a fresh logo and brand-blue visual identity.
- **Redesigned Store Assets**: Store screenshots and store preview imagery redesigned to use original illustrative mockups in full compliance with store policies.
- **Includes all v3.5 core features & fixes**:
  - Unchanged core feature parity with v3.5.
  - Resolved random UUID filename generation issue to restore predictable file naming.
  - Duplicate download protection (remembers download history, displays confirmation popup showing previous download timestamp and filename).
  - Smart batch skip mechanism (automatically skips previously saved files).
  - Optimized button rendering speed and DOM media detection performance.

---

## Chrome Web Store Short Description / 簡短描述

### 繁體中文 (Max 132 chars)
一鍵下載最高畫質圖片與影片，支援多圖輪播批次下載、重複下載提醒與自訂檔名範本，100% 本地運作零追蹤。

### English (Max 132 chars)
One-click max-res image & video downloader with batch download, duplicate protection, custom file templates & 100% local privacy.

---

## Chrome Web Store Detailed Description / 詳細描述

### 繁體中文
Supported sites: instagram.com, threads.net, threads.com

「Just Image & Video Downloader」是一款極簡、高效且重視隱私的媒體下載工具。無需登入即可一鍵儲存最高解析度的圖片、影片、短影音與限時動態，並支援多圖輪播批次下載。

核心功能：
- **一鍵輕鬆下載**：自動在媒體內容上注入下載按鈕，隨點隨存高畫質圖片與影片。
- **最高解析度儲存**：自動取得並下載原始最高畫質檔案，不壓縮、不破壞品質。
- **多圖輪播批次下載**：一鍵「全部下載」多圖輪播內的所有圖片與影片，自動加上序號編號（如 `_01`、`_02`）並即時顯示下載進度。
- **精準輪播比對**：準確識別目前檢視的輪播幻燈片，確保下載內容與當前顯示完全一致。
- **重複下載保護**：自動記錄已下載檔案，再次下載相同內容時彈出確認對話框，並提示上次下載時間與檔名，防止重複儲存。
- **支援短影音與限時動態**：流暢擷取短影音與臨時限時動態媒體檔案。
- **自訂按鈕位置**：支援將下載按鈕放置於媒體角落（提供 4 個角落可供選擇），符合個人操作習慣。
- **自訂檔名範本**：支援使用 `{username}`、`{type}`、`{timestamp}` 等變數自由設定儲存檔名格式。
- **100% 本地與隱私安全**：不需登入帳號、零追蹤碼，所有媒體解析與下載作業皆在瀏覽器本地端完成，絕不經過任何第三方伺服器。

---

### English
Supported sites: instagram.com, threads.net, threads.com

Just Image & Video Downloader is a clean, lightweight, and privacy-first browser extension designed for saving media seamlessly. Save maximum-resolution photos, videos, short videos, and stories with a single click, with no login required.

Key Features:
- **One-Click Download**: Injects clean, responsive download buttons directly onto media items for effortless saving.
- **Original / Max Resolution**: Automatically retrieves and saves the original highest resolution photos and videos without quality loss.
- **"Download All" Batch Download**: Effortlessly download all slides from multi-image carousel posts with automatic index numbering (`_01`, `_02`) and live progress tracking.
- **Precise Carousel Slide Matching**: Accurately tracks current carousel slides to guarantee exact media downloads.
- **Duplicate Download Protection**: Keeps track of downloaded media history and prompts a confirmation dialog with previous download timestamp and filename before re-downloading.
- **Stories & Short Videos Support**: Save short videos and temporary story media effortlessly.
- **Customizable Button Position**: Place download overlay buttons in any of the 4 corners of media cards according to your visual workflow.
- **Custom Filename Templates**: Organize saved files using customizable tokens including `{username}`, `{type}`, and `{timestamp}`.
- **100% Local & Privacy-Preserving**: No login required, no telemetry tracking, and zero remote third-party servers. All operations execute strictly inside your local browser.

---

## AMO Listing (Firefox Add-ons)

### Summary / 摘要

#### 繁體中文
一鍵下載最高畫質圖片與影片，支援多圖輪播批次下載、重複下載提醒與自訂檔名範本，100% 本地運作零追蹤。

#### English
One-click max-res image & video downloader with batch download, duplicate protection, custom file templates & 100% local privacy.

---

### Detailed Description / 詳細描述

#### 繁體中文
Supported sites: instagram.com, threads.net, threads.com

「Just Image & Video Downloader」是一款專為瀏覽體驗打造的高效媒體下載擴充套件。具備直覺按鈕與強大批次下載功能，協助您輕鬆儲存圖片、影片、短影音與限時動態。

重點特色：
- **單鍵下載原圖與高清影片**：直接下載最高畫質媒體。
- **多圖輪播「全部下載」**：自動給予索引編號（`_01`、`_02`）並顯示即時下載進度。
- **重複下載提示**：顯示前次下載檔案名稱與時間紀錄，避免重覆下載。
- **個體化彈性設定**：支援 4 角按鈕顯示位置調整，以及 `{username}`、`{type}`、`{timestamp}` 檔名命名規則。
- **完全本地運作**：不需登入、無第三方伺服器傳輸，保護使用者資料隱私。

#### English
Supported sites: instagram.com, threads.net, threads.com

Just Image & Video Downloader is a powerful, privacy-conscious add-on for saving web media. Download photos, videos, short videos, and stories effortlessly directly from your browser.

Main Highlights:
- **Instant High-Res Downloads**: Save original photos and videos at peak quality.
- **Batch Carousel Downloads**: "Download All" feature automatically appends index tags (`_01`, `_02`) with live progress indicators.
- **Duplicate Protection**: Alerts you before saving duplicate media, showing prior file names and timestamps.
- **Flexible Customization**: Choose between 4 button corner placements and customize output filenames using `{username}`, `{type}`, and `{timestamp}`.
- **Purely Local & Safe**: Requires no user login, uses no remote processing servers, and conducts 100% client-side operations.

---

## Permissions Justification Table

| Permission / Host | Technical Purpose & Store Justification |
| --- | --- |
| `downloads` | Required to trigger user-initiated file downloads directly into the user's default downloads directory via the browser download manager API. |
| `webRequest` | Intercepts media CDN `.mp4` network requests to extract video stream URLs as a robust fallback when media elements do not expose direct source URLs in the DOM. |
| `alarms` | Used to schedule routine background memory cleanup tasks for tab-level cached video URLs, preventing memory leaks during long browsing sessions. |
| `storage` | Stores user configuration settings (e.g., button placement options, filename format templates) and local history hash records for duplicate download protection. |
| `host_permissions`<br>(`*://*.instagram.com/*`,<br>`*://*.threads.net/*`,<br>`*://*.threads.com/*`,<br>`*://*.cdninstagram.com/*`,<br>`*://*.fbcdn.net/*`) | Necessary for injecting download controls into web pages, reading image/video source metadata, fetching raw media files into Blob objects locally, and bypassing cross-origin (CORS) download restrictions for user-initiated saves. |

---

## Screenshot Policy

All store screenshots, header images, and promotional graphics uploaded to the Chrome Web Store and Firefox Add-ons store listings are strictly original, generic illustrative mockups and graphic diagrams. No real third-party user interfaces, copyrighted page elements, or trademarked brand assets are depicted in any store promotional graphics.
