import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extensionFor,
    formatFromExtension,
    formatFromMime,
    formatInfo,
    IMAGE_FORMAT_IDS,
    IMAGE_FORMATS,
    isLossy,
    losesDataConvertingTo,
    mimeTypeFor,
    replaceExtension,
    supportsAlpha,
    supportsAnimation,
} from '../dist/esm/index.js';

test('the format table is internally consistent', () => {
    for (const id of IMAGE_FORMAT_IDS) {
        const info = IMAGE_FORMATS[id];
        assert.equal(info.id, id);
        assert.ok(info.mimeType.startsWith('image/'), id);
        assert.ok(info.extensions.length > 0, id);
        assert.ok(['lossy', 'lossless', 'both', 'none'].includes(info.compression), id);
        assert.equal(formatInfo(id), info);
    }
});

test('MIME lookup tolerates the wrong-but-common spellings', () => {
    assert.equal(formatFromMime('image/jpeg'), 'jpeg');
    assert.equal(formatFromMime('image/jpg'), 'jpeg');
    assert.equal(formatFromMime('IMAGE/PNG'), 'png');
    assert.equal(formatFromMime('image/png; charset=binary'), 'png');
    assert.equal(formatFromMime('image/vnd.microsoft.icon'), 'ico');
    assert.equal(formatFromMime('image/heif'), 'heic');
    assert.equal(formatFromMime('application/pdf'), null);
    assert.equal(mimeTypeFor('jpeg'), 'image/jpeg');
});

test('extension lookup handles filenames, URLs and bare extensions', () => {
    assert.equal(formatFromExtension('holiday.HEIC'), 'heic');
    assert.equal(formatFromExtension('.webp'), 'webp');
    assert.equal(formatFromExtension('jpg'), 'jpeg');
    assert.equal(formatFromExtension('https://example.com/a.png?v=2'), 'png');
    assert.equal(formatFromExtension('archive.zip'), null);
    assert.equal(formatFromExtension(''), null);
    assert.equal(extensionFor('jpeg'), 'jpg');
});

test('replaceExtension swaps rather than appends', () => {
    assert.equal(replaceExtension('holiday.HEIC', 'jpeg'), 'holiday.jpg');
    assert.equal(replaceExtension('report.png', 'webp'), 'report.webp');
    assert.equal(replaceExtension('no-extension', 'png'), 'no-extension.png');
    assert.equal(replaceExtension('two.dots.png', 'jpeg'), 'two.dots.jpg');
    assert.equal(replaceExtension('image', '.avif'), 'image.avif');
});

test('capability predicates', () => {
    assert.equal(supportsAlpha('png'), true);
    assert.equal(supportsAlpha('jpeg'), false);
    assert.equal(supportsAnimation('gif'), true);
    assert.equal(supportsAnimation('jpeg'), false);
    assert.equal(isLossy('jpeg'), true);
    assert.equal(isLossy('webp'), true, 'WebP can be either, so treat it as capable of loss');
    assert.equal(isLossy('png'), false);
});

test('losesDataConvertingTo names what a conversion throws away', () => {
    const toJpeg = losesDataConvertingTo('png', 'jpeg');
    assert.ok(toJpeg.includes('transparency'));
    assert.ok(toJpeg.includes('exact pixel values'));

    // The other direction costs nothing but disk.
    assert.deepEqual(losesDataConvertingTo('jpeg', 'png'), []);
    assert.ok(losesDataConvertingTo('gif', 'jpeg').includes('animation'));
    assert.ok(losesDataConvertingTo('svg', 'png').includes('resolution independence'));
    assert.deepEqual(losesDataConvertingTo('png', 'png'), []);
});

test('browser support years are stated, or honestly null', () => {
    assert.equal(IMAGE_FORMATS.heic.universalIn, null, 'HEIC has never worked in a browser');
    assert.equal(IMAGE_FORMATS.tiff.universalIn, null);
    assert.ok(IMAGE_FORMATS.webp.universalIn > 2015);
    assert.ok(IMAGE_FORMATS.avif.universalIn >= IMAGE_FORMATS.webp.universalIn);
});
