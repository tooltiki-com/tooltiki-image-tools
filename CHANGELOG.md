# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-08-24

First release.

### Added

- **`probeImage`** — dimensions, format, density, EXIF orientation, alpha,
  animation and frame counts read from the header of PNG, JPEG, GIF, WebP,
  AVIF, HEIC, BMP, TIFF, ICO, CUR, SVG and QOI. Nothing is decoded and nothing
  is trusted; a truncated or hostile file raises `ImageParseError` rather than
  returning a plausible number.
  - AVIF and HEIC resolve the primary item through `pitm` and `ipma` instead of
    taking the first or largest `ispe`, and apply the clean aperture, so an
    Apple HEIC reports the picture rather than the padded frame it was coded in.
  - `codedSize` exposes that padded frame when it differs.
- **`fit`, `cropBox`, `containBox`, `clampSize`** — resize geometry with
  sharp-compatible `cover`, `contain`, `fill`, `inside` and `outside` modes,
  `withoutEnlargement` / `withoutReduction`, crop positions and focal points.
- **`aspectRatio`, `nearestNamedRatio`, `parseRatio`** — ratios as integers, as
  a decimal and as a name, with continued-fraction approximation for sizes that
  do not reduce tidily.
- **`IMAGE_FORMATS`, `losesDataConvertingTo`** — what each format can hold, and
  what a given conversion throws away.
- **`formatBytes`, `parseBytes`, `estimateEncodedSize`** — file sizes in and
  out, plus an encoded-size estimate that reports its own uncertainty.
- **`printSize`, `fitsPaper`, `screenPpi`, `screenDimensions`** — pixels to
  physical size and back, ISO 216 and North American paper, screen density.
- **`srcsetWidths`, `buildSrcset`, `buildSizes`, `renditions`** — responsive
  image attributes, generated.
- **`PRESETS`** — the sizes the major platforms enforce, dated with
  `PRESETS_LAST_REVIEWED` because they expire.
- **`tooltiki-image-tools/node`** — `probeImageFile` and friends, kept in a
  separate entry point so a browser bundle never pulls `node:fs` in.

[Unreleased]: https://github.com/tooltiki-com/tooltiki-image-tools/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tooltiki-com/tooltiki-image-tools/releases/tag/v0.1.0
