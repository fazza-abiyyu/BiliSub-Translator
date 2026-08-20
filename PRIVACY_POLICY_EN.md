# BiliSub Privacy Policy

Last updated: August 2026

## 1. Data sent to third parties

When the Auto-Translation feature is enabled, BiliSub sends **subtitle text** (the video caption lines, e.g., the Chinese text displayed on screen) to third-party translation services for translation:

- **Google Translate** (`translate.googleapis.com`, `translate.google.com`) — primary service
- **Lingva** (`lingva.ml`) and **MyMemory** (`api.mymemory.translated.net`) — fallback if Google fails

Only the subtitle text and the user-selected target language are sent. No user identity, no video URLs, no account data, and no video context are sent to the translation services. If the user disables Auto-Translation, no text is sent.

Please note: Google, Lingva, and MyMemory are third-party services with their own privacy policies. BiliSub does not control how they process the data.

## 2. Are video URLs sent?

No. BiliSub does not send video URLs to translators. The extension only accesses Bilibili's API (`api.bilibili.com`) within the video page to fetch the list of available subtitle tracks. This request stays on the same domain as the site the user is visiting, not to third parties.

## 3. Analytics & telemetry

None. BiliSub loads no analytics code, sends no telemetry, and has no developer-owned server/backend. All processing happens on the user's device.

## 4. Data storage

BiliSub only stores **user settings** via `chrome.storage.sync`:

- Target language
- Font size
- Subtitle mode (dual / translation only)
- Auto-translate on/off state
- Dragged subtitle panel position

This data is synced across the user's own devices by the browser. The translation cache exists only in memory and is cleared on page reload. No subtitles, videos, or history are stored.

## 5. Permissions used

- `storage` & `alarms` — store settings and keep the background script alive
- `activeTab` & `tabs` — read the active page so subtitles can be detected and the popup can manage settings
- Host access: `bilibili.com`, `youtube.com` (where subtitles are fetched), `hdslb.com` (Bilibili subtitle CDN), and the translator domains `translate.googleapis.com`, `translate.google.com`, `lingva.ml`, `api.mymemory.translated.net`