import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, imageSize, ImageParseError, probeImage, tryProbeImage } from '../dist/esm/index.js';
import {
    buildJpeg,
    buildPng,
    buildQoi,
    buildWebpExtended,
    buildWebpLossless,
    fixture,
    pngActl,
    pngPhys,
} from './helpers.js';

/**
 * The fixtures are real encoder output at a deliberately awkward 37x23: odd on
 * both axes, so a transposed result is obvious, and not a power of two, so a
 * parser that reads the wrong field cannot accidentally be right.
 */
const REAL_FILES = [
    ['sample.png', 'png'],
    ['sample.jpg', 'jpeg'],
    ['sample.gif', 'gif'],
    ['sample.webp', 'webp'],
    ['sample-lossless.webp', 'webp'],
    ['sample.bmp', 'bmp'],
    ['sample.tif', 'tiff'],
    ['sample.avif', 'avif'],
    ['sample.heic', 'heic'],
];

test('every real fixture reports 37x23 and its own format', () => {
    for (const [name, format] of REAL_FILES) {
        const probe = probeImage(fixture(name));
        assert.equal(probe.format, format, name);
        assert.equal(probe.width, 37, name);
        assert.equal(probe.height, 23, name);
        assert.equal(probe.displayWidth, 37, name);
        assert.equal(probe.displayHeight, 23, name);
    }
});

test('detectFormat agrees with the full parse, and rejects non-images', () => {
    for (const [name, format] of REAL_FILES) {
        assert.equal(detectFormat(fixture(name)), format, name);
    }
    assert.equal(detectFormat(Buffer.from('this is a text file, not an image')), null);
    assert.equal(detectFormat(Buffer.alloc(2)), null);
});

test('AVIF and HEIC report the padded coded frame separately', () => {
    for (const name of ['sample.avif', 'sample.heic']) {
        const probe = probeImage(fixture(name));
        // Apple pads odd dimensions up to even and crops back with a clean
        // aperture. The picture is 37x23; the frame it was coded in is not.
        assert.deepEqual(probe.codedSize, { width: 38, height: 24 }, name);
        assert.equal(probe.hasAlpha, true, name);
        assert.equal(probe.bitDepth, 8, name);
    }
});

test('a real animated GIF is counted, not guessed at', () => {
    const probe = probeImage(fixture('animated.gif'));
    assert.equal(probe.format, 'gif');
    assert.equal(probe.width, 4);
    assert.equal(probe.height, 3);
    assert.equal(probe.frames, 2);
    assert.equal(probe.animated, true);
    assert.equal(probe.hasAlpha, true);
});

test('a single-frame GIF is not animated', () => {
    const probe = probeImage(fixture('sample.gif'));
    assert.equal(probe.frames, 1);
    assert.equal(probe.animated, false);
});

test('an ICO reports its largest entry and lists the rest', () => {
    const probe = probeImage(fixture('sample.ico'));
    assert.equal(probe.format, 'ico');
    assert.equal(probe.width, 32);
    assert.deepEqual(probe.variants, [
        { width: 32, height: 32 },
        { width: 16, height: 16 },
    ]);
});

test('SVG is measured, and marked as having no fixed pixel size', () => {
    const probe = probeImage(fixture('sample.svg'));
    assert.equal(probe.format, 'svg');
    assert.equal(probe.vector, true);
    assert.equal(probe.width, 240);
    assert.equal(probe.height, 120);
});

test('SVG falls back through viewBox, units, and the browser default', () => {
    const viewBoxOnly = probeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"/>'));
    assert.deepEqual([viewBoxOnly.width, viewBoxOnly.height], [64, 48]);

    // One side plus a viewBox: the ratio supplies the other.
    const oneSide = probeImage(Buffer.from('<svg viewBox="0 0 200 100" width="400"></svg>'));
    assert.deepEqual([oneSide.width, oneSide.height], [400, 200]);

    // Physical units are CSS units, so an inch is 96px whatever the printer says.
    const inches = probeImage(Buffer.from('<svg width="1in" height="0.5in"></svg>'));
    assert.deepEqual([inches.width, inches.height], [96, 48]);

    // Nothing to go on: 300x150, which is what a browser renders.
    const nothing = probeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    assert.deepEqual([nothing.width, nothing.height], [300, 150]);

    // A percentage is relative to a container this parser cannot see.
    const percentage = probeImage(Buffer.from('<svg width="100%" height="100%" viewBox="0 0 10 20"></svg>'));
    assert.deepEqual([percentage.width, percentage.height], [10, 20]);
});

test('EXIF orientation swaps the displayed dimensions, not the stored ones', () => {
    const rotated = probeImage(buildJpeg({ width: 4096, height: 3000, orientation: 6 }));
    assert.equal(rotated.orientation, 6);
    assert.equal(rotated.width, 4096);
    assert.equal(rotated.height, 3000);
    assert.equal(rotated.displayWidth, 3000);
    assert.equal(rotated.displayHeight, 4096);

    // Orientations 1 to 4 do not swap anything.
    const mirrored = probeImage(buildJpeg({ width: 4096, height: 3000, orientation: 2 }));
    assert.equal(mirrored.displayWidth, 4096);
    assert.equal(mirrored.displayHeight, 3000);

    assert.equal(imageSize(buildJpeg({ width: 100, height: 50, orientation: 8 })).width, 50);
});

test('JFIF density is read, and unit 0 is reported as an aspect ratio', () => {
    const dpi = probeImage(buildJpeg({ width: 10, height: 10, jfif: { units: 1, x: 300, y: 300 } }));
    assert.deepEqual(dpi.density, { x: 300, y: 300, unit: 'dpi' });

    const perCm = probeImage(buildJpeg({ width: 10, height: 10, jfif: { units: 2, x: 118, y: 118 } }));
    assert.equal(perCm.density.unit, 'dpcm');

    // Units 0 means the two numbers are a pixel aspect ratio. Saying "dpi"
    // here would be the single most misleading thing this library could do.
    const aspect = probeImage(buildJpeg({ width: 10, height: 10, jfif: { units: 0, x: 72, y: 72 } }));
    assert.equal(aspect.density.unit, 'aspect');
});

test('progressive JPEGs are flagged', () => {
    assert.equal(probeImage(buildJpeg({ width: 8, height: 8, progressive: true })).progressive, true);
    assert.equal(probeImage(buildJpeg({ width: 8, height: 8 })).progressive, false);
});

test('PNG colour type and ancillary chunks decide alpha, density and animation', () => {
    const opaque = probeImage(buildPng({ width: 800, height: 600, colourType: 2 }));
    assert.equal(opaque.hasAlpha, false);
    assert.equal(opaque.animated, false);

    const transparent = probeImage(buildPng({ width: 800, height: 600, colourType: 6 }));
    assert.equal(transparent.hasAlpha, true);

    // 2835 pixels per metre is what every encoder writes for 72 dpi, and the
    // exact conversion is 72.009. Reporting that helps nobody.
    const dense = probeImage(buildPng({ width: 10, height: 10, extra: [pngPhys(2835, 2835)] }));
    assert.deepEqual(dense.density, { x: 72, y: 72, unit: 'dpi' });

    const printReady = probeImage(buildPng({ width: 10, height: 10, extra: [pngPhys(11811, 11811)] }));
    assert.equal(printReady.density.x, 300);

    const apng = probeImage(buildPng({ width: 10, height: 10, extra: [pngActl(12)] }));
    assert.equal(apng.animated, true);
    assert.equal(apng.frames, 12);
});

test('WebP reads all three chunk layouts', () => {
    const lossy = probeImage(fixture('sample.webp'));
    assert.equal(lossy.width, 37);

    const lossless = probeImage(buildWebpLossless({ width: 1000, height: 750, alpha: true }));
    assert.equal(lossless.width, 1000);
    assert.equal(lossless.height, 750);
    assert.equal(lossless.hasAlpha, true);

    const extended = buildWebpExtended({ width: 1920, height: 1080, alpha: true, animation: true, frames: 3 });
    const animated = probeImage(extended);
    assert.equal(animated.width, 1920);
    assert.equal(animated.height, 1080);
    assert.equal(animated.animated, true);
    assert.equal(animated.hasAlpha, true);
    assert.equal(animated.frames, 3);
});

test('QOI is read from its fourteen-byte header', () => {
    const probe = probeImage(buildQoi({ width: 640, height: 480, channels: 4 }));
    assert.equal(probe.format, 'qoi');
    assert.equal(probe.width, 640);
    assert.equal(probe.hasAlpha, true);
    assert.equal(probeImage(buildQoi({ width: 8, height: 8, channels: 3 })).hasAlpha, false);
});

test('BMP handles the top-down negative height', () => {
    const bytes = Buffer.from(fixture('sample.bmp'));
    bytes.writeInt32LE(-23, 22);
    const probe = probeImage(bytes);
    assert.equal(probe.height, 23, 'a negative height is a row order, not a negative image');
});

test('a truncated file fails loudly rather than returning nonsense', () => {
    const png = fixture('sample.png');
    assert.throws(() => probeImage(png.subarray(0, 16)), ImageParseError);
    assert.equal(tryProbeImage(png.subarray(0, 16)), null);

    // Every byte of the header present is enough; the pixels are not needed.
    const header = probeImage(png.subarray(0, 33));
    assert.equal(header.width, 37);
});

test('bytes that are not an image are rejected', () => {
    assert.throws(() => probeImage(Buffer.from('<!doctype html><html></html>')), ImageParseError);
    assert.throws(() => probeImage(Buffer.alloc(0)), ImageParseError);
    assert.equal(tryProbeImage(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])), null);
});

test('a JPEG with no start-of-frame is an error, not a zero-sized image', () => {
    assert.throws(() => probeImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), ImageParseError);
});

test('accepts every byte-shaped input', () => {
    const png = fixture('sample.png');
    const expected = { width: 37, height: 23 };
    assert.deepEqual(imageSize(png), expected, 'Buffer');
    assert.deepEqual(imageSize(new Uint8Array(png)), expected, 'Uint8Array');
    assert.deepEqual(
        imageSize(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)),
        expected,
        'ArrayBuffer',
    );
});
