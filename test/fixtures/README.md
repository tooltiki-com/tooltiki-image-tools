# Fixtures

Real encoder output, so the parser is tested against what encoders actually
write rather than against what the spec says they should. Every file is
deliberately **37 x 23**: odd on both axes, so a transposed result is obvious,
and not a power of two, so a parser reading the wrong field cannot accidentally
be right.

Where a case cannot be produced on demand — a specific EXIF orientation, a
truncated header, an APNG — the bytes are built in `../helpers.js` instead, to
spec and with real CRCs.

## How each file was made

`sample.png` is a resize of the ToolTiki logo. Everything else derives from it.

```bash
# macOS. sips is built in; cwebp comes from `brew install webp`.
sips -z 23 37 source.png --out sample.png

sips -s format jpeg sample.png --out sample.jpg
sips -s format gif  sample.png --out sample.gif
sips -s format tiff sample.png --out sample.tif
sips -s format bmp  sample.png --out sample.bmp
sips -s format avif sample.png --out sample.avif
sips -s format heic sample.png --out sample.heic

cwebp sample.png -o sample.webp
cwebp -lossless sample.png -o sample-lossless.webp
```

`sample.ico` is a two-entry icon (16 and 32 pixels) with PNG-encoded payloads,
assembled by hand because `sips` will not write one. `animated.gif` is a real
two-frame 4 x 3 GIF, likewise assembled by hand; its LZW stream resets the
dictionary before every pixel, which is wasteful and entirely valid, and it
decodes in Preview. `sample.svg` is written out.

## What they are worth checking against

`sips -g pixelWidth -g pixelHeight <file>` is an independent second opinion,
and it is the one that caught the AVIF and HEIC cases: Apple pads odd
dimensions up to an even coded frame (38 x 24) and carries a clean aperture
cropping it back to 37 x 23. A parser that reads `ispe` and stops gets both
files wrong.
