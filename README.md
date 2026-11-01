# Stretchtext Anywhere

Select a passage on any web page and it grows where it stands. Click it again
and it shrinks back to the words that were there.

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

**[Try the live demo →](https://scalyxapp-jpg.github.io/stretchtext-anywhere/)**

In 1967 Ted Nelson described *stretchtext*: writing that opens where the reader
wants more and closes where they already know. Writing every level by hand was
too expensive, so it never caught on. Generated text makes the extra levels
cheap enough to ask for one sentence at a time.

## How it works

1. You select text. A pill appears next to the selection.
2. The pill sends the passage, plus the surrounding paragraph for voice, to a
   Pollinations text model, which returns a longer version of just that passage.
3. The selection is replaced in place, underlined so you can see what grew.
4. Click the underlined passage to put the original words back.

Nothing is rewritten outside your selection. The page's own HTML, links and
markup stay where they are; only the selected text is swapped within the
current range, and the original is restored from the extension's own state.

## Paying for it

There is no key in the extension. Click the toolbar icon, choose
**Connect with Pollinations**, and approve the device code in the tab that
opens. You get a scoped key with a 7-day expiry and a 5-Pollen budget, stored in
`chrome.storage.local`. Every stretch is paid from your own balance and you can
revoke the key from your Pollinations dashboard at any time.

## Install

```bash
git clone https://github.com/scalyxapp-jpg/stretchtext-anywhere.git
```

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** → pick the `extension/` folder.
4. Click the toolbar icon → **Connect with Pollinations**.

Works in any Chromium browser with Manifest V3. Firefox needs a small manifest
port (`background.scripts` instead of `service_worker`) and is not packaged yet.

## Layout

```
index.html            live demo and install page (GitHub Pages)
demo.js               the demo host: selection pill, API call, swap
extension/
  manifest.json       MV3, content script on <all_urls>
  src/core.js         prompt, range swap, collapse — shared with the demo
  src/content.js      selection pill, shadow-DOM UI, click to shrink
  src/auth.js         device flow, token storage
  src/background.js   the service worker that runs the sign-in
  src/popup.html/js   connect, balance, status
  src/content.css     the underline on grown passages
```

## Limits

- One level per segment; stretch the grown text again for another level.
- The reply replaces the selection as plain text, so inline links inside the
  selection do not survive a stretch. Collapsing restores the words, not the
  original markup.
- Pages that render into canvas, shadow roots, or editor surfaces
  (Google Docs, Gmail, YouTube comments) are excluded.
- Cost is one text completion per stretch, roughly a fraction of a Pollen.

## License

MIT
