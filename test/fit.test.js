import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSize, containBox, cropBox, decodedByteSize, fit, pixelCount, scaleSize } from '../dist/esm/index.js';

const PHOTO = { width: 4000, height: 3000 };
const SQUARE = { width: 1200, height: 1200 };

test('a one-sided target scales by that side, whatever the mode', () => {
    const byWidth = fit(PHOTO, { width: 1200 });
    assert.deepEqual([byWidth.width, byWidth.height], [1200, 900]);

    const byHeight = fit(PHOTO, { height: 600 });
    assert.deepEqual([byHeight.width, byHeight.height], [800, 600]);

    // With only one side given there is nothing for a fit mode to decide.
    for (const mode of ['cover', 'contain', 'fill', 'inside', 'outside']) {
        assert.equal(fit(PHOTO, { width: 1200 }, { fit: mode }).height, 900, mode);
    }
});

test('an empty target leaves the image alone', () => {
    assert.deepEqual(fit(PHOTO, {}), {
        width: 4000,
        height: 3000,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rendered: { width: 4000, height: 3000 },
        cropped: false,
        padded: false,
    });
});

test('cover fills the target and crops the overflow', () => {
    const result = fit(PHOTO, SQUARE, { fit: 'cover' });
    assert.deepEqual([result.width, result.height], [1200, 1200]);
    assert.deepEqual(result.rendered, { width: 1600, height: 1200 });
    assert.equal(result.cropped, true);
    assert.equal(result.padded, false);
});

test('contain keeps the whole image and pads the canvas', () => {
    const result = fit(PHOTO, SQUARE, { fit: 'contain' });
    assert.deepEqual([result.width, result.height], [1200, 1200]);
    assert.deepEqual(result.rendered, { width: 1200, height: 900 });
    assert.equal(result.padded, true);
    assert.equal(result.cropped, false);
});

test('inside and outside produce the image, not a canvas', () => {
    const inside = fit(PHOTO, SQUARE, { fit: 'inside' });
    assert.deepEqual([inside.width, inside.height], [1200, 900]);
    assert.equal(inside.padded, false);

    const outside = fit(PHOTO, SQUARE, { fit: 'outside' });
    assert.deepEqual([outside.width, outside.height], [1600, 1200]);
    assert.equal(outside.cropped, false);
});

test('fill stretches, and says so through two different scales', () => {
    const result = fit(PHOTO, SQUARE, { fit: 'fill' });
    assert.deepEqual([result.width, result.height], [1200, 1200]);
    assert.equal(result.scaleX, 0.3);
    assert.equal(result.scaleY, 0.4);
});

test('withoutEnlargement leaves a small source alone', () => {
    const small = { width: 500, height: 400 };
    const result = fit(small, { width: 1000, height: 1000 }, { fit: 'inside', withoutEnlargement: true });
    assert.deepEqual([result.width, result.height], [500, 400]);
    assert.equal(result.scale, 1);
});

test('cover shrinks its canvas rather than padding when it may not enlarge', () => {
    const small = { width: 500, height: 400 };
    const result = fit(small, { width: 1000, height: 1000 }, { fit: 'cover', withoutEnlargement: true });
    // The requested shape is kept; only the size gives way. Padding a cover
    // would break the one promise cover makes.
    assert.deepEqual([result.width, result.height], [400, 400]);
    assert.equal(result.padded, false);
    assert.equal(result.cropped, true);
});

test('withoutReduction refuses to shrink', () => {
    const result = fit(PHOTO, { width: 100, height: 100 }, { fit: 'inside', withoutReduction: true });
    assert.deepEqual([result.width, result.height], [4000, 3000]);
});

test('rounding is configurable and never yields a zero dimension', () => {
    const source = { width: 101, height: 33 };
    assert.equal(fit(source, { width: 50 }, { rounding: 'floor' }).height, 16);
    assert.equal(fit(source, { width: 50 }, { rounding: 'ceil' }).height, 17);
    assert.equal(fit(source, { width: 50 }, { rounding: 'round' }).height, 16);
    assert.equal(fit(source, { width: 50 }, { rounding: 'none' }).height, (50 * 33) / 101);

    // A very wide image scaled to a tiny width still has to be one pixel tall.
    assert.equal(fit({ width: 5000, height: 10 }, { width: 20 }).height, 1);
});

test('a source with no area is refused', () => {
    assert.throws(() => fit({ width: 0, height: 10 }, { width: 100 }), RangeError);
    assert.throws(() => fit({ width: NaN, height: 10 }, { width: 100 }), RangeError);
});

test('cropBox trims the looser axis and centres by default', () => {
    const box = cropBox(PHOTO, { width: 1000, height: 1000 });
    assert.deepEqual(box, { x: 500, y: 0, width: 3000, height: 3000 });
});

test('cropBox honours position and focal point', () => {
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { position: 'left' }).x, 0);
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { position: 'right' }).x, 1000);
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { position: 'top left' }).y, 0);

    // A focal point is centred on, then pushed back inside the source.
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { focal: { x: 0.1, y: 0.5 } }).x, 0);
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { focal: { x: 0.9, y: 0.5 } }).x, 1000);
    assert.equal(cropBox(PHOTO, { width: 1, height: 1 }, { focal: { x: 0.5, y: 0.5 } }).x, 500);
});

test('a crop of the same shape takes the whole image', () => {
    assert.deepEqual(cropBox(PHOTO, { width: 800, height: 600 }), { x: 0, y: 0, width: 4000, height: 3000 });
});

test('containBox reports the letterbox bars', () => {
    assert.deepEqual(containBox(PHOTO, { width: 1000, height: 1000 }), { x: 0, y: 125, width: 1000, height: 750 });
    assert.equal(containBox(PHOTO, { width: 1000, height: 1000 }, { position: 'top' }).y, 0);
    assert.equal(containBox(PHOTO, { width: 1000, height: 1000 }, { position: 'bottom' }).y, 250);
});

test('clampSize caps without ever enlarging', () => {
    assert.deepEqual(clampSize(PHOTO, { width: 1000 }), { width: 1000, height: 750 });
    assert.deepEqual(clampSize({ width: 500, height: 400 }, { width: 1000 }), { width: 500, height: 400 });
    assert.deepEqual(clampSize(PHOTO, { width: 1000, height: 500 }), { width: 667, height: 500 });
});

test('scaleSize, pixelCount and decodedByteSize', () => {
    assert.deepEqual(scaleSize({ width: 800, height: 600 }, 0.5), { width: 400, height: 300 });
    assert.throws(() => scaleSize({ width: 800, height: 600 }, 0), RangeError);
    assert.equal(pixelCount(PHOTO), 12_000_000);
    // The number that matters for a worker's memory limit: 12 MP is 48 MB decoded.
    assert.equal(decodedByteSize(PHOTO), 48_000_000);
    assert.equal(decodedByteSize(PHOTO, 3), 36_000_000);
});
