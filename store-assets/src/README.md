# Store screenshot sources

`s1.html`–`s4.html` + `shared.css` are the sources for the English store screenshots
(`../screenshot-1-en.png` … `../screenshot-4-en.png`), rendered at 1280×800.

`promo-small.html` (440×280) and `promo-marquee.html` (1400×560) are the CWS promo
tiles (`../promo-small-440x280.jpg`, `../promo-marquee-1400x560.jpg`). CWS requires
JPEG or 24-bit PNG **without alpha**, so these are converted via
`sips -s format jpeg -s formatOptions 95` after the Chrome screenshot.

The Chinese screenshots (`../screenshot-N.png`) predate these sources; to regenerate
them, translate the text in each `sN.html` back to zh-TW.

Regenerate:

```sh
cd store-assets/src
for i in 1 2 3 4; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1280,800 \
    --screenshot="../screenshot-$i-en.png" "s$i.html"
done
```
