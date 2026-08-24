import test from 'node:test';
import assert from 'node:assert/strict';
import {
    approximateRatio,
    aspectOrientation,
    aspectRatio,
    flipRatio,
    heightForRatio,
    isLandscape,
    isPortrait,
    isSquare,
    megapixels,
    NAMED_RATIOS,
    nearestNamedRatio,
    parseRatio,
    ratioValue,
    toRatio,
    widthForRatio,
} from '../dist/esm/index.js';

test('integer sizes reduce exactly', () => {
    assert.equal(aspectRatio(1920, 1080).label, '16:9');
    assert.equal(aspectRatio(1080, 1920).label, '9:16');
    assert.equal(aspectRatio({ width: 3000, height: 2000 }).label, '3:2');
    assert.equal(aspectRatio(1024, 1024).label, '1:1');
    assert.equal(aspectRatio(1920, 1080).value, 1920 / 1080);
});

test('untidy sizes are approximated rather than reduced to noise', () => {
    // 999:540 is arithmetically right and useless to a reader.
    const cinema = aspectRatio(1998, 1080);
    assert.ok(Number(cinema.w) <= 100 && Number(cinema.h) <= 100, cinema.label);
    assert.equal(approximateRatio(16 / 9).label, '16:9');
    assert.equal(approximateRatio(4 / 3).label, '4:3');
    assert.equal(approximateRatio(1.5).label, '3:2');
});

test('approximateRatio respects its ceiling', () => {
    const coarse = approximateRatio(Math.PI, 10);
    assert.ok(coarse.w <= 10 && coarse.h <= 10);
    // The value is preserved even when the printed terms are an approximation.
    assert.equal(coarse.value, Math.PI);
});

test('ratios parse from every notation people write', () => {
    assert.equal(parseRatio('16:9').label, '16:9');
    assert.equal(parseRatio('16x9').label, '16:9');
    assert.equal(parseRatio('16/9').label, '16:9');
    assert.equal(parseRatio(' 4 : 3 ').label, '4:3');
    assert.equal(parseRatio('1.7777777').label, '16:9');
    assert.equal(parseRatio('2.39:1').label, '239:100');
    assert.equal(parseRatio('nonsense'), null);
    assert.equal(parseRatio('16:0'), null);
    assert.equal(parseRatio(''), null);
});

test('ratioValue and toRatio accept every input shape', () => {
    assert.equal(ratioValue('16:9'), 16 / 9);
    assert.equal(ratioValue(1.5), 1.5);
    assert.equal(ratioValue({ width: 1600, height: 900 }), 16 / 9);
    assert.equal(ratioValue(aspectRatio(16, 9)), 16 / 9);
    assert.equal(toRatio({ width: 1600, height: 900 }).label, '16:9');
    assert.throws(() => ratioValue('not a ratio'), RangeError);
    assert.throws(() => ratioValue(-2), RangeError);
});

test('flipRatio stands a shape on its end', () => {
    assert.equal(flipRatio('16:9').label, '9:16');
    assert.equal(flipRatio('16:9').value, 9 / 16);
});

test('nearestNamedRatio tolerates a few stray pixels', () => {
    assert.equal(nearestNamedRatio({ width: 1920, height: 1080 }).label, '16:9');
    assert.equal(nearestNamedRatio({ width: 1920, height: 1082 }).label, '16:9');
    assert.equal(nearestNamedRatio({ width: 1080, height: 1920 }).label, '9:16');
    assert.equal(nearestNamedRatio({ width: 1080, height: 1920 }).portrait, true);
    assert.equal(nearestNamedRatio({ width: 800, height: 600 }).ratio.name, 'Four by three');
    assert.equal(nearestNamedRatio({ width: 1000, height: 1000 }).ratio.name, 'Square');
});

test('nearestNamedRatio says nothing rather than something wrong', () => {
    // 1200x630 is the Open Graph size and is not a named ratio at all: the
    // closest, 1.85:1, is 3% away.
    assert.equal(nearestNamedRatio({ width: 1200, height: 630 }), null);
    assert.equal(nearestNamedRatio({ width: 1200, height: 630 }, { tolerance: 0.05 }).ratio.name, 'Cinema flat');
    assert.equal(nearestNamedRatio({ width: 1080, height: 1920 }, { includePortrait: false }), null);
});

test('the named ratio table is internally consistent', () => {
    for (const ratio of NAMED_RATIOS) {
        assert.equal(ratio.label, `${ratio.w}:${ratio.h}`, ratio.name);
        assert.ok(Math.abs(ratio.value - ratio.w / ratio.h) < 1e-12, ratio.name);
        assert.ok(ratio.aka.length > 0, ratio.name);
    }
    assert.equal(new Set(NAMED_RATIOS.map((r) => r.label)).size, NAMED_RATIOS.length);
});

test('one side and a ratio give the other', () => {
    assert.equal(heightForRatio(1600, '16:9'), 900);
    assert.equal(widthForRatio(1080, '16:9'), 1920);
    assert.equal(heightForRatio(1080, 1), 1080);
    assert.equal(widthForRatio(1000, { width: 4, height: 3 }), 1333);
});

test('orientation predicates', () => {
    assert.equal(aspectOrientation({ width: 100, height: 50 }), 'landscape');
    assert.equal(aspectOrientation({ width: 50, height: 100 }), 'portrait');
    assert.equal(aspectOrientation({ width: 50, height: 50 }), 'square');
    assert.equal(isLandscape({ width: 100, height: 50 }), true);
    assert.equal(isPortrait({ width: 50, height: 100 }), true);
    assert.equal(isSquare({ width: 50, height: 50 }), true);
});

test('megapixels is the number a camera spec quotes', () => {
    assert.equal(megapixels({ width: 4000, height: 3000 }), 12);
    assert.equal(megapixels({ width: 4032, height: 3024 }), 12.19);
    assert.equal(megapixels({ width: 1920, height: 1080 }), 2.07);
});
