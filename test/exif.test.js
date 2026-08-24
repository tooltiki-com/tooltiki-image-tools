import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrientation, orientationTransform, readExifOrientation, swapsAxes } from '../dist/esm/index.js';
import { buildJpeg, buildPng, fixture, pngChunk, tiffWithShortTag } from './helpers.js';

test('orientation is read out of a JPEG', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const jpeg = buildJpeg({ width: 100, height: 50, orientation });
        assert.equal(readExifOrientation(jpeg), orientation);
    }
    assert.equal(readExifOrientation(buildJpeg({ width: 100, height: 50 })), null);
    assert.equal(readExifOrientation(fixture('sample.png')), null);
});

test('orientation is read out of a bare TIFF and a PNG eXIf chunk', () => {
    assert.equal(readExifOrientation(tiffWithShortTag(0x0112, 6)), 6);

    const png = buildPng({ width: 10, height: 10, extra: [pngChunk('eXIf', tiffWithShortTag(0x0112, 3))] });
    assert.equal(readExifOrientation(png), 3);
});

test('the transform table matches exiftool, which everything else copied', () => {
    const expected = {
        1: { rotate: 0, flipX: false, description: 'Horizontal (normal)' },
        2: { rotate: 0, flipX: true, description: 'Mirror horizontal' },
        3: { rotate: 180, flipX: false, description: 'Rotate 180' },
        4: { rotate: 180, flipX: true, description: 'Mirror vertical' },
        5: { rotate: 270, flipX: true, description: 'Mirror horizontal and rotate 270 CW' },
        6: { rotate: 90, flipX: false, description: 'Rotate 90 CW' },
        7: { rotate: 90, flipX: true, description: 'Mirror horizontal and rotate 90 CW' },
        8: { rotate: 270, flipX: false, description: 'Rotate 270 CW' },
    };
    for (const [orientation, want] of Object.entries(expected)) {
        const got = orientationTransform(Number(orientation));
        assert.equal(got.rotate, want.rotate, orientation);
        assert.equal(got.flipX, want.flipX, orientation);
        assert.equal(got.description, want.description, orientation);
        assert.equal(got.swapsAxes, Number(orientation) >= 5, orientation);
    }
    assert.throws(() => orientationTransform(9), RangeError);
    assert.throws(() => orientationTransform(0), RangeError);
});

test('mirror vertical is mirror horizontal plus a half turn', () => {
    // Worth pinning: it is the identity that makes a single flipX flag enough
    // to express all eight orientations.
    const four = orientationTransform(4);
    assert.equal(four.flipX, true);
    assert.equal(four.rotate, 180);
});

test('the CSS transform applies the mirror before the rotation', () => {
    // CSS reads a transform list right to left, so scaleX has to come last.
    assert.equal(orientationTransform(1).cssTransform, 'none');
    assert.equal(orientationTransform(6).cssTransform, 'rotate(90deg)');
    assert.equal(orientationTransform(7).cssTransform, 'rotate(90deg) scaleX(-1)');
    assert.equal(orientationTransform(2).cssTransform, 'scaleX(-1)');
});

test('only orientations 5 to 8 swap the axes', () => {
    const stored = { width: 4032, height: 3024 };
    for (const orientation of [1, 2, 3, 4]) {
        assert.deepEqual(applyOrientation(stored, orientation), stored, String(orientation));
        assert.equal(swapsAxes(orientation), false);
    }
    for (const orientation of [5, 6, 7, 8]) {
        assert.deepEqual(applyOrientation(stored, orientation), { width: 3024, height: 4032 }, String(orientation));
        assert.equal(swapsAxes(orientation), true);
    }
    assert.deepEqual(applyOrientation(stored, null), stored);
    assert.equal(swapsAxes(null), false);
    assert.equal(swapsAxes(undefined), false);
});

test('applyOrientation returns a copy, not the input', () => {
    const stored = { width: 100, height: 50 };
    assert.notEqual(applyOrientation(stored, 1), stored);
});
