import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSizes, buildSrcset, DEFAULT_WIDTHS, dprVariants, renditions, srcsetWidths } from '../dist/esm/index.js';

test('srcsetWidths never offers more than the source has', () => {
    assert.deepEqual(srcsetWidths({ sourceWidth: 1500 }), [320, 480, 640, 768, 1024, 1280, 1500]);
    // A source that lands on a rung is not listed twice.
    assert.deepEqual(srcsetWidths({ sourceWidth: 1024 }), [320, 480, 640, 768, 1024]);
    assert.deepEqual(srcsetWidths({ sourceWidth: 300 }), []);
    assert.deepEqual(srcsetWidths({ sourceWidth: 300, min: 200 }), [300]);
});

test('srcsetWidths honours min and max', () => {
    assert.deepEqual(srcsetWidths({ min: 640, max: 1280 }), [640, 768, 1024, 1280]);
    assert.deepEqual(srcsetWidths(), [...DEFAULT_WIDTHS]);
});

test('a fixed count is spaced geometrically, not evenly', () => {
    // Even spacing wastes rungs at the top, where a 10% width change is barely
    // a different file.
    assert.deepEqual(srcsetWidths({ count: 3, min: 400, max: 1600 }), [400, 800, 1600]);
    assert.deepEqual(srcsetWidths({ count: 1, min: 400, max: 1600 }), [1600]);
    assert.equal(srcsetWidths({ count: 5, min: 320, max: 2560 }).length, 5);
});

test('buildSrcset from a template', () => {
    assert.equal(
        buildSrcset('/img/hero-{width}.jpg', [400, 800]),
        '/img/hero-400.jpg 400w, /img/hero-800.jpg 800w',
    );
    // Entries come out ascending however they went in.
    assert.equal(buildSrcset('/i/{width}.jpg', [800, 400]), '/i/400.jpg 400w, /i/800.jpg 800w');
});

test('buildSrcset hands the resolver the matching height', () => {
    const seen = [];
    buildSrcset(
        (width, height) => {
            seen.push([width, height]);
            return `/i/${width}x${height}.jpg`;
        },
        [400, 800],
        { source: { width: 2000, height: 1000 } },
    );
    assert.deepEqual(seen, [
        [400, 200],
        [800, 400],
    ]);
});

test('buildSrcset can emit density descriptors', () => {
    assert.equal(
        buildSrcset('/i/{width}.png', [200, 400, 600], { descriptor: 'x' }),
        '/i/200.png 1x, /i/400.png 2x, /i/600.png 3x',
    );
    assert.equal(buildSrcset('/i/{width}.png', [], { descriptor: 'x' }), '');
});

test('buildSizes always ends up with a fallback', () => {
    assert.equal(
        buildSizes([{ media: '(min-width: 900px)', size: '50vw' }, { size: '100vw' }]),
        '(min-width: 900px) 50vw, 100vw',
    );
    // Every rule conditional means no fallback, which is a silent bug in a
    // hand-written sizes attribute. Add the one the browser assumes anyway.
    assert.equal(buildSizes([{ media: '(min-width: 900px)', size: '50vw' }]), '(min-width: 900px) 50vw, 100vw');
    assert.equal(buildSizes([]), '100vw');
});

test('dprVariants', () => {
    assert.deepEqual(dprVariants({ width: 400, height: 300 }), [
        { dpr: 1, width: 400, height: 300 },
        { dpr: 2, width: 800, height: 600 },
        { dpr: 3, width: 1200, height: 900 },
    ]);
    assert.equal(dprVariants({ width: 100, height: 100 }, [1, 1.5]).length, 2);
});

test('renditions keeps the aspect ratio at every rung', () => {
    const sizes = renditions({ width: 1000, height: 500 });
    assert.deepEqual(sizes, [
        { width: 320, height: 160 },
        { width: 480, height: 240 },
        { width: 640, height: 320 },
        { width: 768, height: 384 },
        { width: 1000, height: 500 },
    ]);
    for (const size of sizes) assert.equal(size.width / size.height, 2);
});

test('contradictory bounds produce nothing, not widths above the max', () => {
    // Regression. The geometric branch spaced its steps from the ceiling up to
    // the floor, so asking for widths under 400 with a floor of 2000 returned
    // [400, 684, 1170, 2000] — three of them above the max that was requested.
    assert.deepEqual(srcsetWidths({ count: 4, min: 2000, max: 400 }), []);
    assert.deepEqual(srcsetWidths({ min: 2000, max: 400 }), []);
    assert.deepEqual(srcsetWidths({ min: 2000, sourceWidth: 800 }), []);
    // Nothing a caller asks for may exceed the ceiling they set.
    for (const max of [300, 700, 1500, 4000]) {
        for (const width of srcsetWidths({ max, count: 5, min: 200 })) assert.ok(width <= max, `${width} > ${max}`);
        for (const width of srcsetWidths({ max })) assert.ok(width <= max, `${width} > ${max}`);
    }
});
