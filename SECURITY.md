# Security policy

## Why this file exists

This library parses untrusted input by design — an uploaded file is exactly the
case it is meant for — so a parsing bug here can be a security bug in whatever
uses it. Two shapes matter most:

- **A crash on a malformed file.** Every read goes through the bounds-checked
  helpers in `src/bits.ts` and a bad file should raise `ImageParseError`, never
  a `TypeError` from `undefined` arithmetic and never an unhandled throw from
  `tryProbeImage`.
- **A file that makes a parser loop or allocate without bound.** The box, chunk
  and directory walkers are all bounded by the input length and reject
  implausible counts, but a case that gets past that is worth reporting.

Note what this library deliberately does not do: it never decodes pixel data,
never executes anything from a file, and has no dependencies. That removes most
of the surface an image library normally has, and it is why the surface that
remains is worth taking seriously.

## Reporting

Report privately, not as a public issue:

- GitHub's [private vulnerability reporting](https://github.com/tooltiki-com/tooltiki-image-tools/security/advisories/new), or
- **info@tooltiki.com**, with "security" in the subject

Please include the file that triggers it, or the bytes to reconstruct one, and
what happens. You will get an acknowledgement within three working days.

## Supported versions

The latest minor release. This library is small enough that the fix is to
upgrade.
