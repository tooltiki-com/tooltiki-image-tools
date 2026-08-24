# tooltiki-image-tools

[![npm](https://img.shields.io/npm/v/tooltiki-image-tools.svg)](https://www.npmjs.com/package/tooltiki-image-tools)
[![CI](https://github.com/tooltiki-com/tooltiki-image-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/tooltiki-com/tooltiki-image-tools/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)
[![licence](https://img.shields.io/npm/l/tooltiki-image-tools.svg)](./LICENSE)

**Everything you can work out about an image without decoding it.**

Read the dimensions, format, DPI and EXIF orientation straight out of the
bytes. Work out what a resize actually produces. Build a `srcset`. Answer
whether a photo has the pixels to print at A3.

No dependencies, no native modules, no decoder. The main entry point touches no
Node built-in, so the same code runs in a browser, a worker, an edge function
or a Lambda.

```bash
npm install tooltiki-image-tools
```

```js
import { probeImage, fit, printQuality, effectiveDpi } from 'tooltiki-image-tools';

const info = probeImage(bytes);
// { format: 'jpeg', width: 4032, height: 3024, orientation: 6,
//   displayWidth: 3024, displayHeight: 4032, density: {...}, ... }

fit({ width: 4032, height: 3024 }, { width: 1200 });
// { width: 1200, height: 900, scale: 0.297..., ... }
```

---

## Why this exists

Three things go wrong in almost every image pipeline, and all three are avoidable
before a single pixel is decoded.

**A JPEG's header is not the size you display.** Phones store portrait photos as
landscape frames with an orientation flag. Read `width` and `height` naively and
every thumbnail comes out on its side.

**Decoding to measure is how you get killed by a decompression bomb.** A 40 MB
upload might be 200 megapixels, which is 800 MB of RGBA before your resize
library has done anything useful. The dimensions are in the first few hundred
bytes; check them first and reject the file for free.

**Resize maths gets re-derived, slightly differently, in four files.** Cover,
contain, crop offsets, "1200 wide, height auto" — it is not hard, and that is
exactly why every codebase has three subtly different versions of it.

This library is the boring, tested answer to all three.

---

## Reading a file

```js
import { probeImage, tryProbeImage, imageSize, detectFormat } from 'tooltiki-image-tools';
import { probeImageFile } from 'tooltiki-image-tools/node';

probeImage(bytes);      // throws ImageParseError on anything unreadable
tryProbeImage(bytes);   // returns null instead
imageSize(bytes);       // just { width, height }, orientation applied
detectFormat(bytes);    // 'png' | 'jpeg' | ... | null, signature only

await probeImageFile('./holiday.heic');   // reads the header, not the file
```

`probeImage` accepts a `Buffer`, a `Uint8Array` or an `ArrayBuffer`, and returns:

| Field | |
| --- | --- |
| `format`, `mimeType` | what it actually is, not what the extension claims |
| `width`, `height` | pixels as stored |
| `displayWidth`, `displayHeight` | as a viewer sees them, after EXIF orientation |
| `orientation` | 1–8, when the file declares one |
| `density` | the resolution the file claims, in `dpi`, `dpcm` or `aspect` |
| `hasAlpha`, `animated`, `frames` | when the header can say |
| `bitDepth`, `progressive`, `vector` | |
| `variants` | every size in an ICO |
| `codedSize` | the padded frame, when AVIF or HEIC cropped it back |

### Formats

| | Dimensions | Alpha | Animation | Density | Orientation |
| --- | :-: | :-: | :-: | :-: | :-: |
| PNG / APNG | yes | yes | yes | `pHYs` | `eXIf` |
| JPEG | yes | — | — | JFIF + EXIF | yes |
| GIF | yes | yes | frames counted | — | — |
| WebP | yes | yes | yes | — | `EXIF` chunk |
| AVIF | yes | yes | — | — | `irot` |
| HEIC / HEIF | yes | yes | — | — | `irot` |
| BMP | yes | yes | — | yes | — |
| TIFF | yes | — | — | yes | yes |
| ICO / CUR | all entries | yes | — | — | — |
| SVG | yes | — | — | — | — |
| QOI | yes | yes | — | — | — |

Not supported: JPEG XL, PSD, RAW. Contributions welcome.

### Orientation, properly

```js
import { orientationTransform, applyOrientation } from 'tooltiki-image-tools';

const photo = probeImage(bytes);
// { width: 4032, height: 3024, orientation: 6, displayWidth: 3024, displayHeight: 4032 }

orientationTransform(6);
// { rotate: 90, flipX: false, swapsAxes: true,
//   cssTransform: 'rotate(90deg)', description: 'Rotate 90 CW' }

applyOrientation({ width: 4032, height: 3024 }, 6);   // { width: 3024, height: 4032 }
```

The table matches exiftool's, including the two everyone gets wrong (5 and 7).
Mirror first, then rotate clockwise — which is why `cssTransform` puts
`scaleX(-1)` last, since CSS reads a transform list right to left.

AVIF and HEIC state rotation as an `irot` property rather than EXIF; it is
translated to the equivalent EXIF value so there is only one thing to branch on.

### AVIF and HEIC are not simple

Apple pads odd dimensions up to even and carries a clean aperture that crops
them back, and a HEIC holds several images — the photo, a thumbnail, sometimes
a depth map — each with its own size. This library follows `pitm` to the
primary item and `ipma` to its properties rather than taking the first or
largest `ispe`, then applies the clean aperture:

```js
probeImage(heicBytes);
// { width: 37, height: 23, codedSize: { width: 38, height: 24 }, ... }
```

---

## Resize maths

```js
import { fit, cropBox, containBox, clampSize } from 'tooltiki-image-tools';

const source = { width: 4000, height: 3000 };

fit(source, { width: 1200 });                        // 1200 x 900
fit(source, { width: 1200, height: 1200 });          // 1200 x 900  (inside)
fit(source, { width: 1200, height: 1200 }, { fit: 'cover' });    // 1200 x 1200, cropped
fit(source, { width: 1200, height: 1200 }, { fit: 'contain' });  // 1200 x 1200, padded
```

Five modes, named and behaving as sharp's `fit` option does, so the two compose
without translation:

| | Canvas | Aspect | Result |
| --- | --- | --- | --- |
| `cover` | the target | kept | overflow cropped |
| `contain` | the target | kept | remainder padded |
| `fill` | the target | ignored | stretched |
| `inside` | the image | kept | no larger than the target |
| `outside` | the image | kept | no smaller than the target |

**One deliberate difference from sharp:** the default here is `inside`, not
`cover`, because the common Node case is "cap this image at N pixels". Pass
`fit` explicitly when you are matching a sharp pipeline.

`fit` returns the canvas *and* the image drawn on it, which are not the same
thing for `cover` and `contain`:

```js
fit(source, { width: 1200, height: 1200 }, { fit: 'cover' });
// { width: 1200, height: 1200,        <- the canvas
//   rendered: { width: 1600, height: 1200 },   <- the image
//   scale: 0.4, cropped: true, padded: false }
```

Crop and letterbox geometry, ready for sharp's `extract` or a canvas
`drawImage`:

```js
cropBox(source, { width: 1000, height: 1000 });
// { x: 500, y: 0, width: 3000, height: 3000 }

cropBox(source, { width: 1000, height: 1000 }, { position: 'top' });
cropBox(source, { width: 1000, height: 1000 }, { focal: { x: 0.7, y: 0.3 } });

containBox(source, { width: 1000, height: 1000 });
// { x: 0, y: 125, width: 1000, height: 750 }   <- the letterbox bars
```

And the guard worth having before you decode anything:

```js
import { decodedByteSize } from 'tooltiki-image-tools';

const { width, height } = probeImage(upload);
if (decodedByteSize({ width, height }) > 256 * 1024 * 1024) {
    throw new Error('That image is too large to process');
}
```

Interactive version: [tooltiki.com/en/image-resizer](https://tooltiki.com/en/image-resizer)

---

## Aspect ratios

```js
import { aspectRatio, nearestNamedRatio, parseRatio, heightForRatio } from 'tooltiki-image-tools';

aspectRatio(1920, 1080).label;              // '16:9'
aspectRatio(1998, 1080).label;              // '37:20'
parseRatio('2.39:1').label;                 // '239:100'
heightForRatio(1600, '16:9');               // 900

nearestNamedRatio({ width: 1920, height: 1082 });
// { ratio: { name: 'Widescreen', ... }, label: '16:9', portrait: false, difference: 0.0018 }

nearestNamedRatio({ width: 1200, height: 630 });
// null — the Open Graph size is not a named ratio, and saying "about 2:1" would be a lie
```

Non-integer sizes are approximated by continued fractions rather than reduced
to noise, so 1.7777… comes back as `16:9` and not `17777:10000`. An explicit
decimal pair such as `2.39:1` is taken at its word and reduced exactly.

Interactive version: [tooltiki.com/en/resolution-calculator](https://tooltiki.com/en/resolution-calculator)

---

## Formats and conversions

```js
import { IMAGE_FORMATS, formatFromMime, replaceExtension, losesDataConvertingTo } from 'tooltiki-image-tools';

formatFromMime('image/jpg');            // 'jpeg' — tolerates the wrong-but-common spellings
replaceExtension('holiday.HEIC', 'jpeg');  // 'holiday.jpg'

IMAGE_FORMATS.webp;
// { label: 'WebP', mimeType: 'image/webp', extensions: ['webp'],
//   alpha: true, animation: true, compression: 'both', universalIn: 2020, notes: '...' }

losesDataConvertingTo('png', 'jpeg');
// ['transparency', 'animation', 'exact pixel values']
```

`losesDataConvertingTo` is the one to reach for before a conversion: it names
what the target format cannot hold, so you can warn rather than silently
flatten someone's transparent logo onto white.

Interactive versions:
[PNG to JPG](https://tooltiki.com/en/png-to-jpg) ·
[WebP to PNG](https://tooltiki.com/en/webp-to-png) ·
[HEIC to JPG](https://tooltiki.com/en/heic-to-jpg)

---

## File size

```js
import { formatBytes, parseBytes, savingPercent, estimateEncodedSize } from 'tooltiki-image-tools';

formatBytes(2_500_000);                    // '2.5 MB'
formatBytes(1_048_576, { binary: true });  // '1.0 MiB'
parseBytes('500kb');                       // 500000
savingPercent(1_000_000, 240_000);         // 76
```

Decimal units by default, because that is what every operating system's file
dialog shows. Pass `binary: true` where you actually mean KiB.

```js
estimateEncodedSize({ width: 4000, height: 3000, format: 'jpeg', quality: 85 });
// { bytes: 2539347, bitsPerPixel: 1.69, uncertainty: 0.4 }
```

Be clear-eyed about the estimate: it is a planning figure, and it reports its
own uncertainty. Real output depends on the picture — noise, gradients, how
much flat colour there is — and no formula sees the picture. It is right for
"will a page of forty of these be two megabytes or twenty", and wrong for
anything that needs the actual number, which you get by encoding. BMP and TIFF
are computed rather than estimated and report `uncertainty: 0`.

Interactive version: [tooltiki.com/en/image-compressor](https://tooltiki.com/en/image-compressor)

---

## Print and screens

DPI is not a property of an image file. An image is a grid of pixels; the dots
per inch only exist once you decide how big to print it. Everything here treats
resolution as the relationship between a pixel count and a physical size.

```js
import { printSize, pixelsForPrint, fitsPaper, screenPpi, screenDimensions } from 'tooltiki-image-tools';

printSize({ width: 3000, height: 2000 }, 300);       // 10 x 6.67 in
pixelsForPrint({ width: 8, height: 10, unit: 'in' }, 300);   // 2400 x 3000

fitsPaper({ width: 2500, height: 3600 }, 'a4');
// { dpi: 302.4, quality: 'excellent', meetsTarget: true,
//   paper: { width: 210, height: 297, unit: 'mm' }, landscape: false }

screenPpi(27, { width: 2560, height: 1440 });        // 108.79
screenDimensions(27, '16:9');                        // 23.53 x 13.24 in
```

`PAPER_SIZES` covers ISO 216 A0–A6, the North American sizes and the common
photo prints. `fitsPaper` turns the sheet to match the image and takes a
`margin`.

Interactive versions:
[DPI calculator](https://tooltiki.com/en/dpi-calculator) ·
[PPI calculator](https://tooltiki.com/en/ppi-calculator) ·
[Screen size calculator](https://tooltiki.com/en/screen-size-calculator)

---

## Responsive images

```js
import { srcsetWidths, buildSrcset, buildSizes, renditions } from 'tooltiki-image-tools';

srcsetWidths({ sourceWidth: 1500 });
// [320, 480, 640, 768, 1024, 1280, 1500]   <- never larger than the source

buildSrcset('/img/hero-{width}.jpg', [400, 800, 1200]);
// '/img/hero-400.jpg 400w, /img/hero-800.jpg 800w, /img/hero-1200.jpg 1200w'

buildSizes([{ media: '(min-width: 900px)', size: '50vw' }, { size: '100vw' }]);
// '(min-width: 900px) 50vw, 100vw'

renditions({ width: 2400, height: 1600 });
// every width worth generating, with the height that keeps the ratio
```

`srcsetWidths` never offers a width larger than the source, because upscaling
to fill a `srcset` ships bytes that carry no detail. `buildSizes` appends the
`100vw` fallback when every rule you gave is conditional — a `sizes` attribute
with no unconditional entry is a silent bug.

The resolver gets the height as well as the width, which the URL templates of
most image CDNs need:

```js
buildSrcset((w, h) => `/cdn/${w}x${h}/hero.jpg`, [400, 800], { source: { width: 2000, height: 1000 } });
// '/cdn/400x200/hero.jpg 400w, /cdn/800x400/hero.jpg 800w'
```

---

## Platform presets

```js
import { findPreset, presetsFor, PRESETS_LAST_REVIEWED } from 'tooltiki-image-tools';

findPreset('open-graph');       // { width: 1200, height: 630, ratio: '40:21', ... }
presetsFor('Instagram');        // square, portrait, landscape, story, profile
```

Every one of these numbers is a product decision at a company that will change
it without telling anyone, so the module carries `PRESETS_LAST_REVIEWED` and
keeping it current is a maintenance task. Treat a preset as a good default, not
a guarantee: if a layout looks wrong, the platform's own guidance wins.

Interactive version: [tooltiki.com/en/social-media-image-resizer](https://tooltiki.com/en/social-media-image-resizer)

---

## What this does not do

It does not decode, encode, resize or convert a single pixel. It computes the
numbers you feed to something that does — [sharp](https://sharp.pixelplumbing.com)
on a server, `canvas` or `createImageBitmap` in a browser. That boundary is why
it has no dependencies and no build step, and it is not going to move.

It is also not a general EXIF library. It reads the TIFF directory far enough to
answer sizing questions and stops: no camera model, no GPS, no MakerNotes.

---

## Runtimes

Node 18 and up. Ships ESM and CommonJS with TypeScript declarations for both:

```js
import { probeImage } from 'tooltiki-image-tools';        // ESM
const { probeImage } = require('tooltiki-image-tools');   // CommonJS
```

The main entry point imports nothing from Node, so it works unchanged in
browsers, workers, Deno, Bun and edge runtimes. `tooltiki-image-tools/node`
is the only part that touches `node:fs`, and it is a separate entry point
precisely so a browser bundle never pulls it in.

---

## Examples

Three runnable scripts in [`examples/`](./examples):

- [`upload-guard.mjs`](./examples/upload-guard.mjs) — validate an upload,
  including the decompression-bomb check, before anything decodes it
- [`responsive-images.mjs`](./examples/responsive-images.mjs) — plan the
  renditions of a source image and write the `<img>` for them
- [`print-check.mjs`](./examples/print-check.mjs) — how large a photo can be
  printed, and on which paper

---

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
The most useful contributions are a failing test with a real file: if a format
this claims to support reads back the wrong dimensions, that is a bug worth
having a fixture for.

```bash
npm install
npm test          # builds, then runs the suite against the built output
npm run typecheck
```

---

## About

Built and maintained by [TecWeb B.V.](https://tooltiki.com/en/about), who also
run [ToolTiki](https://tooltiki.com) — browser tools that do one thing, run
entirely on your own device, and are genuinely free. This library is the
arithmetic behind the image ones, extracted and tested on its own.

MIT licensed. See [LICENSE](./LICENSE).
