# Chrome Web Store & AMO Listing Metadata

This document serves as the single source of truth for store listing copy, release notes, permissions justifications, and privacy declarations for **Just IG & Threads Image/Video Downloader** across **Google Chrome Web Store (CWS)** and **Mozilla Add-ons (AMO)**.

## Store Links
- **Chrome Web Store**: [Just IG & Threads Image/Video Downloader](https://chromewebstore.google.com/detail/jkfhcnhffglcmeolblidlogkjmcgpcja)
- **Firefox Add-ons (AMO)**: [Just IG & Threads Image/Video Downloader](https://addons.mozilla.org/firefox/addon/just-ig-threads-downloader/)

---

## 1. Release Notes / Version History

### Version 3.5 (Current Release)

#### 繁體中文 (Traditional Chinese)
```text
【v3.5 更新說明】
• 🐛 修復隨機檔名問題：修復 Chrome / Chromium 瀏覽器觸發 Blob 下載時偶爾出現隨機 UUID 檔名（例如 c032a188...）的 Bug。
• 🛡️ 重複下載防護提示：自動紀錄已下載過的媒體，重複點擊時將跳出彈窗提醒並顯示先前下載時間與檔名，防止重複下載佔用空間。
• ⚡ 一鍵批量下載升級：使用「下載全部」時自動跳過已下載過的圖片；若整批皆已下載過則提示是否強制重下。
• 🚀 載入與按鈕反應優化：縮短掃描間隔並改進 React 頁面渲染監測，開啟頁面時下載按鈕出現速度更快。
• 🧵 完整支援 Instagram & Threads 圖片、影片、Reels 與限時動態下載。
```

#### English
```text
[What's New in Version 3.5]
• 🐛 Fixed Random Filename Bug: Resolved an issue in Chrome/Chromium where Blob downloads resulted in random UUID filenames (e.g. c032a188...).
• 🛡️ Duplicate Download Protection: Automatically tracks downloaded media and prompts with a confirmation dialog (showing timestamp & filename) before re-downloading.
• ⚡ Smart Batch Download: "Download All" now automatically skips previously saved items, saving bandwidth and time.
• 🚀 Faster Button Rendering: Optimized DOM scanning intervals for faster button insertion on React-rendered pages.
• 🧵 Complete support for Instagram & Threads photos, videos, Reels, and Stories.
```

---

## 2. Google Chrome Web Store (CWS) Copy

### Short Description (簡短說明 - 132字以內)
- **Language**: Chinese (Traditional) / 繁體中文 (132 chars max)
  ```text
  一鍵下載 Instagram 與 Threads 的高畫質圖片、影片、Reels 與限時動態 (Stories)。無須登入、隱私安全、支援批量下載與自訂檔名。
  ```
- **Language**: English (132 chars max)
  ```text
  Download Instagram & Threads photos, videos, Reels, and Stories with 1 click. Max quality, batch download, no login required.
  ```

### Detailed Description (詳細內容)

#### 繁體中文 (Traditional Chinese)
```text
Just IG & Threads Image/Video Downloader 是一款輕巧且強大的瀏覽器擴充功能，為 Instagram 與 Threads 媒體提供流暢的一鍵下載體驗。

主要功能：
• 📸 原圖與最高畫質下載：直接下載官方伺服器提供的最高解析度原檔（超越一般 1080p 縮圖）。
• 🎞️ Reels & Stories 限時動態：限時動態與 Reels 頁面提供獨立下載按鈕，點擊即刻儲存當前媒體。
• 🖼️ 輪播多圖精準下載：精準鎖定當前顯示的幻燈片頁數，絕不抓錯圖片。
• ⬇️ 一鍵批量下載 (Download All)：在多圖貼文頁面可一鍵下載所有圖片，自動標號命名、自動跳過重複圖片並顯示下載進度。
• 🛡️ 重複下載防護：自動比對已下載檔案，重複點擊時溫馨提醒，避免佔用硬碟空間。
• 🧵 完整支援 Threads：全面相容 threads.net / threads.com 的圖片與影片下載。
• ⚙️ 個人化設置：支援自訂下載按鈕位置（四個角落）與檔案命名格式（變數包含 {username}、{type}、{timestamp}）。
• 🔒 100% 隱私保護：完全不收集任何個人資料、無須登入帳號、不經過任何第三方伺服器。

使用說明：
安裝後開啟 Instagram 或 Threads，在圖片或影片畫面上即可看到下載按鈕，點擊即完成儲存。
```

#### English
```text
Just IG & Threads Image/Video Downloader is a clean, fast, and feature-rich browser extension that adds one-click download buttons to Instagram and Threads.

Key Features:
• 📸 Original Resolution Downloads: Fetches original max-resolution files directly from Meta's CDN (exceeding 1080p thumbnails).
• 🎞️ Reels & Stories Support: Fixed download buttons for Stories and Reels that accurately capture the currently playing item.
• 🖼️ Precise Carousel Matching: Downloads the exact slide currently visible on screen.
• ⬇️ One-Click Batch Download: Download all carousel images from a multi-photo post at once with automatic index numbering (_01, _02...).
• 🛡️ Duplicate Prevention: Remembers previously downloaded files and confirms before re-saving duplicate photos/videos.
• 🧵 Threads Support: Seamlessly download photos and videos on threads.net and threads.com.
• ⚙️ Customizable Settings: Change button placement (4 corners) and customize saved filename templates using {username}, {type}, and {timestamp}.
• 🔒 Privacy Built-in: No tracking, no login, no third-party servers. All operations execute locally in your browser.

How to use:
Install the extension, visit Instagram or Threads, and click the blue download button on any post, Reel, or Story.
```

---

## 3. Mozilla Add-ons (AMO) Firefox Copy

### Summary (簡短描述)
- **繁體中文**:
  ```text
  一鍵輕鬆下載 Instagram 與 Threads 的高畫質圖片、影片、Reels 貼文與限時動態 (Stories)。無須登入、完全免費、無廣告且保護隱私。
  ```
- **English**:
  ```text
  One-click high-resolution image and video downloader for Instagram and Threads. Supports Photos, Videos, Reels, Stories, and Carousels. Free, fast, and 100% private.
  ```

### Description (詳細描述)

#### 繁體中文 (Traditional Chinese)
```markdown
【Just IG & Threads Image/Video Downloader】是一款輕量且強大的瀏覽器擴充功能，為 Instagram 與 Threads 媒體元素加入一鍵下載按鈕。

✨ **核心特色功能**：
• 📸 **原圖與高畫質影片下載**：直接獲取 Instagram/Threads 伺服器提供的最高解析度原檔，非壓縮後的 1080p 縮圖。
• 🎞️ **Reels 與限時動態 (Stories)**：限時動態視窗右側提供固定下載按鈕，點擊即時解析當前播放中的動態媒體。
• 🖼️ **多圖輪播 (Carousels)**：精準識別當前瀏覽的幻燈片，下載您眼睛所見的正確圖片。
• ⬇️ **一鍵批量下載**：在多圖貼文頁面提供「下載全部」按鈕，依序自動命名標號（_01, _02...）、自動略過已下載項目並顯示下載進度。
• 🛡️ **重複下載防護**：智慧記錄已下載媒體，防範重複下載佔用電腦硬碟容量。
• 🧵 **完整支援 Threads**：全面支援 threads.net / threads.com 的圖片與影片下載。
• ⚙️ **自訂設置面板**：支援調整下載按鈕位置（四角落）以及自訂檔名範本（支援 `{username}`、`{type}`、`{timestamp}` 變數）。
• 🔒 **100% 隱私安全**：無須登入帳號、不經過第三方伺服器，所有下載操作皆在本地瀏覽器完成。

💡 **使用方式**：
安裝擴充功能後，瀏覽 Instagram 或 Threads 時，媒體角落將出現藍色下載按鈕，點擊即可開始下載。
```

#### English
```markdown
**Just IG & Threads Image/Video Downloader** is a lightweight, high-performance extension that adds convenient one-click download buttons to images and videos on **Instagram** and **Threads**.

✨ **Key Features**:
• 📸 **Original Quality Downloads**: Download images and videos at the highest resolution served by Instagram/Threads (beyond standard 1080p thumbnails).
• 🎞️ **Reels & Stories Support**: Dedicated download button on Story and Reel overlays that dynamically resolves the currently active video/image.
• 🖼️ **Accurate Carousel Downloads**: Downloads the exact slide you are looking at, avoiding preloading mismatch issues.
• ⬇️ **One-Click Batch Download**: On multi-image post pages, click "Download All" to save every slide in order (`_01`, `_02`, ...) with live progress.
• 🛡️ **Duplicate Download Protection**: Automatically remembers downloaded files and prompts for confirmation before saving duplicates.
• 🧵 **Threads Integration**: Full support for `threads.net` and `threads.com` media downloading.
• ⚙️ **Customizable Settings**: Choose button position (4 corners) and build custom file naming patterns using `{username}`, `{type}`, and `{timestamp}` tokens.
• 🔒 **Privacy Focused**: No login required, no data collection, no third-party servers. 100% local browser execution.

💡 **How to Use**:
After installing, visit Instagram or Threads. A blue download button will appear over images and videos—simply click it to save.
```

---

## 4. Permissions & Privacy Justifications (for Reviewer)

| Permission | Justification |
|------------|---------------|
| `downloads` | Required to trigger browser downloads for images and videos saved by the user. |
| `webRequest` | Required to intercept media CDN requests (`.mp4`) as a fallback resolution method for videos. |
| `alarms` | Used to manage periodic cleanup of tab-level video URL caches. |
| `storage` | Required to save user preferences (button corner position and filename templates) and duplicate download records. |
| `host_permissions` (`instagram.com`, `threads.net`, `threads.com`, `cdninstagram.com`, `fbcdn.net`) | Required to fetch media content directly into blobs for local download without CORS restrictions. |
