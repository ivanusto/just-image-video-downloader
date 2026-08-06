# Privacy Policy — Just Image & Video Downloader

**Effective date:** August 7, 2026
**Applies to:** Just Image & Video Downloader browser extension, v4.0 and later (Chrome Web Store and Firefox Add-ons editions)

## Summary

Just Image & Video Downloader does **not** collect, transmit, sell, or share any user data. Everything the extension does happens locally inside your browser.

## Data Collection

We collect **nothing**. Specifically, the extension has:

- **No analytics or telemetry** — no usage statistics, crash reports, or tracking of any kind.
- **No account or login** — the extension never asks for, reads, or handles any credentials.
- **No third-party servers** — the extension operates entirely between your browser and the websites you are already visiting. No data is ever sent to us or to any third party.
- **No personal information** — we never access your name, email, contacts, browsing history, or any other personal data.

## Local Storage

The extension stores a small amount of data **only in your own browser** (via the browser's `storage` API):

- **Your settings** — download button position and filename template preferences.
- **Download history records** — short hashed identifiers of media you have downloaded, used solely to power the duplicate-download warning feature.

This data never leaves your device. Uninstalling the extension permanently deletes it. You can also clear it at any time from your browser's extension storage settings.

## Network Activity

The extension's only network activity is fetching the image or video file you explicitly clicked to download, directly from the website's own content servers (the same servers your browser already loads that media from). It observes media requests on supported pages solely to resolve the highest-quality file URL; the content of these requests is processed locally and never recorded or transmitted elsewhere.

## Permissions

Each browser permission the extension requests exists only to support the features above:

| Permission | Why it is needed |
| --- | --- |
| `downloads` | Save the file you clicked to your Downloads folder via the browser's download manager. |
| `webRequest` | Detect media stream URLs on the page as a fallback when a video's direct URL is not exposed in the page content. Processed locally only. |
| `storage` | Keep your settings and local duplicate-download records (see Local Storage above). |
| `alarms` | Periodically clean up temporary in-memory caches to avoid memory buildup. |
| Site access (supported sites and their CDNs) | Show the download button on supported pages and fetch the media file you requested without cross-origin errors. |

## Remote Code

The extension does not load or execute any remote code. All code is contained in the extension package reviewed and distributed by the Chrome Web Store / Firefox Add-ons store.

## Children's Privacy

The extension collects no data from anyone, including children.

## Changes to This Policy

If this policy ever changes, the updated version will be published at this same URL with a new effective date. Because the extension collects no data, changes are expected to be rare and editorial.

## Contact

Questions about this policy: **ivanusto@gmail.com**
Project page: https://github.com/ivanusto/just-image-video-downloader
