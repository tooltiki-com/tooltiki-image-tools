# Contributing

Thanks for looking. This is a small library with a deliberately narrow job, so
the most useful contributions tend to be small and specific.

## The most valuable bug report

A file that reads back the wrong dimensions. If a format listed as supported
gives the wrong answer for a real file, that is worth a fixture and a test,
and it is the kind of bug this library exists to not have.

Please include:

- the file, or a way to produce one (`sips`, `cwebp`, ffmpeg, a camera model)
- what the dimensions actually are, and how you know
- what `probeImage` returned

Files under 10 KB can go straight into `test/fixtures`. Anything larger, link
it instead and we will find or build a small equivalent.

## Getting set up

```bash
npm install
npm test          # builds, then runs the suite against the built output
npm run typecheck
npm run build
```

Tests run against `dist`, not `src`. That is on purpose: it means the suite
exercises the artifact that actually gets published, including the ESM and
CommonJS entry points, rather than a version of the code only the type checker
has ever seen.

## Scope

The library computes numbers. It does not decode, encode, resize or convert a
single pixel, and it has no dependencies. Both of those are load-bearing —
they are why it runs unchanged in a browser, a worker and an edge function —
so a change that needs a decoder or a dependency is a change to a different
library.

Inside that boundary, welcome additions include:

- **a new format to probe.** JPEG XL, PSD and RAW are the obvious gaps.
- **a format's optional metadata** — density, alpha, frame count — where a
  header states it and this does not read it yet.
- **presets and paper sizes**, particularly non-European ones.
- **a platform preset that has changed.** `PRESETS_LAST_REVIEWED` in
  `src/presets.ts` is meant to move.

## House style

- **Every parser assumes the file is hostile.** Read through the helpers in
  `src/bits.ts`; they throw on a short read rather than letting `undefined`
  turn into `NaN` three functions later.
- **Comments explain why, not what.** If a line looks odd and is correct
  anyway, say what would go wrong without it. Skip the ones that restate the
  code.
- **New behaviour comes with a test.** Prefer a real file over synthesised
  bytes; use `test/helpers.js` for the cases a real file cannot cover, like a
  specific EXIF orientation or a truncated header.
- Four-space indent, no semicolon debates — `.editorconfig` has the rest.

## Regenerating the fixtures

`test/fixtures/README.md` records exactly how each file was made, so a fixture
can be rebuilt rather than trusted.

## Releasing

Maintainers only. Bump the version, update `CHANGELOG.md`, tag `vX.Y.Z` and
push the tag; the release workflow publishes to npm with provenance.
