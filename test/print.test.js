import test from 'node:test';
import assert from 'node:assert/strict';
import {
    convertLength,
    effectiveDpi,
    fitsPaper,
    largestPrintAt,
    PAPER_SIZES,
    paperSize,
    pixelsForPrint,
    printQuality,
    printSize,
    screenArea,
    screenDimensions,
    screenPpi,
} from '../dist/esm/index.js';

const close = (actual, expected, tolerance = 0.01) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('pixels and inches convert both ways', () => {
    const size = printSize({ width: 3000, height: 2000 }, 300);
    close(size.width, 10);
    close(size.height, 6.667);
    assert.equal(size.unit, 'in');

    assert.deepEqual(pixelsForPrint({ width: 8, height: 10, unit: 'in' }, 300), { width: 2400, height: 3000 });
    // Never round a pixel requirement down: 2399 pixels misses the target.
    assert.deepEqual(pixelsForPrint({ width: 8.001, height: 10, unit: 'in' }, 300), { width: 2401, height: 3000 });
});

test('printSize speaks every unit', () => {
    close(printSize({ width: 300, height: 300 }, 300, 'cm').width, 2.54);
    close(printSize({ width: 300, height: 300 }, 300, 'mm').width, 25.4);
    close(printSize({ width: 300, height: 300 }, 300, 'pt').width, 72);
    assert.throws(() => printSize({ width: 10, height: 10 }, 0), RangeError);
});

test('convertLength', () => {
    close(convertLength(1, 'in', 'mm'), 25.4);
    close(convertLength(25.4, 'mm', 'in'), 1);
    close(convertLength(72, 'pt', 'in'), 1);
    assert.equal(convertLength(5, 'cm', 'cm'), 5);
});

test('effectiveDpi is the honest answer to "can I print this big"', () => {
    const dpi = effectiveDpi({ width: 3000, height: 2000 }, { width: 10, height: 6.6667, unit: 'in' });
    close(dpi.x, 300, 0.1);
    close(dpi.y, 300, 0.1);
    assert.throws(() => effectiveDpi({ width: 10, height: 10 }, { width: 0, height: 5, unit: 'in' }), RangeError);
});

test('print quality thresholds', () => {
    assert.equal(printQuality(600), 'excellent');
    assert.equal(printQuality(300), 'excellent');
    assert.equal(printQuality(299), 'good');
    assert.equal(printQuality(240), 'good');
    assert.equal(printQuality(239), 'draft');
    assert.equal(printQuality(150), 'draft');
    assert.equal(printQuality(149), 'too low');
    assert.equal(printQuality(72), 'too low');
});

test('largestPrintAt answers the poster question', () => {
    // A 12 MP photo at a poster-grade 150 dpi is over two feet wide.
    const poster = largestPrintAt({ width: 4000, height: 3000 }, 150);
    close(poster.width, 26.667);
    close(poster.height, 20);
});

test('the paper table is coherent, and A-series halves correctly', () => {
    assert.equal(new Set(PAPER_SIZES.map((p) => p.id)).size, PAPER_SIZES.length);
    for (const paper of PAPER_SIZES) {
        assert.ok(paper.height >= paper.width, `${paper.id} is stored portrait`);
    }
    // Every A size is the previous one folded in half across its long edge.
    const a4 = paperSize('a4', 'mm');
    const a3 = paperSize('a3', 'mm');
    close(a3.height, a4.height * Math.SQRT2, 1);
    assert.deepEqual(a4, { width: 210, height: 297, unit: 'mm' });
    close(paperSize('a4', 'in').width, 8.268);
    assert.equal(paperSize('nope'), null);
});

test('fitsPaper reports the resolution the sheet actually gets', () => {
    const good = fitsPaper({ width: 2500, height: 3600 }, 'a4');
    close(good.dpi, 302.4, 0.5);
    assert.equal(good.meetsTarget, true);
    assert.equal(good.quality, 'excellent');

    const poor = fitsPaper({ width: 800, height: 1200 }, 'a4');
    assert.equal(poor.meetsTarget, false);
    assert.equal(poor.quality, 'too low');

    assert.equal(fitsPaper({ width: 100, height: 100 }, 'not-a-paper'), null);
});

test('fitsPaper turns the sheet to match the image', () => {
    const landscape = fitsPaper({ width: 3600, height: 2500 }, 'a4');
    assert.equal(landscape.landscape, true);
    assert.deepEqual([landscape.paper.width, landscape.paper.height], [297, 210]);

    const held = fitsPaper({ width: 3600, height: 2500 }, 'a4', { autoRotate: false });
    assert.equal(held.landscape, false);
    assert.ok(held.dpi < landscape.dpi, 'a landscape photo on a portrait sheet gets less of it');
});

test('margins cost resolution', () => {
    const full = fitsPaper({ width: 2500, height: 3600 }, 'a4');
    const inset = fitsPaper({ width: 2500, height: 3600 }, 'a4', { margin: 20 });
    assert.ok(inset.dpi > full.dpi, 'a smaller printable area means the same pixels sit denser');
});

test('screen pixel density', () => {
    close(screenPpi(27, { width: 2560, height: 1440 }), 108.79, 0.01);
    close(screenPpi(13.3, { width: 2560, height: 1600 }), 226.98, 0.01);
    assert.throws(() => screenPpi(0, { width: 100, height: 100 }), RangeError);
});

test('a diagonal alone does not tell you how tall a screen is', () => {
    const wide = screenDimensions(27, '16:9');
    close(wide.width, 23.53, 0.01);
    close(wide.height, 13.24, 0.01);

    // Same diagonal, taller panel. This is the whole point of the function.
    const tall = screenDimensions(27, '16:10');
    assert.ok(tall.height > wide.height);
    assert.ok(tall.width < wide.width);

    close(Math.hypot(wide.width, wide.height), 27, 0.001);
    close(screenDimensions(27, '16:9', 'cm').width, 23.53 * 2.54, 0.01);
    assert.ok(screenArea(27, '16:9') > screenArea(24, '16:9'));
});

test('a margin that swallows the sheet has no print to assess', () => {
    // Regression. The printable area was clamped to 1mm a side, so a 200mm
    // margin on A4 reported 50,800 dpi and called it "excellent".
    assert.equal(fitsPaper({ width: 2000, height: 3000 }, 'a4', { margin: 200 }), null);
    assert.equal(fitsPaper({ width: 2000, height: 3000 }, 'a4', { margin: 105 }), null);
    // Just inside is still a real answer.
    const tight = fitsPaper({ width: 2000, height: 3000 }, 'a4', { margin: 100 });
    assert.ok(tight && tight.dpi > 0 && Number.isFinite(tight.dpi));
});
