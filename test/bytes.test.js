import test from 'node:test';
import assert from 'node:assert/strict';
import {
    base64Length,
    dataUriLength,
    estimateBitsPerPixel,
    estimateEncodedSize,
    formatBytes,
    fromBase64,
    parseBytes,
    parseDataUri,
    savingPercent,
    toBase64,
    toDataUri,
} from '../dist/esm/index.js';

// Pinned, because the separator otherwise follows whatever locale the machine
// running the tests happens to have.
const EN = { locale: 'en-US' };

test('formatBytes uses decimal units, like every file dialog', () => {
    assert.equal(formatBytes(0, EN), '0 B');
    assert.equal(formatBytes(999, EN), '999 B');
    assert.equal(formatBytes(1000, EN), '1.0 KB');
    assert.equal(formatBytes(2_500_000, EN), '2.5 MB');
    assert.equal(formatBytes(1_500_000_000, EN), '1.5 GB');
    assert.equal(formatBytes(2_500_000, { ...EN, digits: 2 }), '2.50 MB');
});

test('formatBytes can do binary units when you actually mean them', () => {
    assert.equal(formatBytes(1024, { ...EN, binary: true }), '1.0 KiB');
    assert.equal(formatBytes(1_048_576, { ...EN, binary: true }), '1.0 MiB');
});

test('a difference between two files is a legitimate thing to format', () => {
    assert.equal(formatBytes(-1500, EN), '-1.5 KB');
    assert.throws(() => formatBytes(NaN), TypeError);
    assert.throws(() => formatBytes(Infinity), TypeError);
});

test('parseBytes reads back what a human wrote', () => {
    assert.equal(parseBytes('2.5 MB'), 2_500_000);
    assert.equal(parseBytes('500kb'), 500_000);
    assert.equal(parseBytes('1MiB'), 1_048_576);
    assert.equal(parseBytes('2048'), 2048);
    assert.equal(parseBytes('  1 GB  '), 1_000_000_000);
    assert.equal(parseBytes('lots'), null);
    assert.equal(parseBytes('5 parsecs'), null);
    assert.equal(parseBytes(''), null);
});

test('formatBytes and parseBytes round-trip', () => {
    for (const value of [1000, 2_500_000, 1_500_000_000]) {
        assert.equal(parseBytes(formatBytes(value, EN)), value);
    }
});

test('savingPercent goes negative when the file grew', () => {
    assert.equal(savingPercent(1000, 250), 75);
    assert.equal(savingPercent(1000, 1200), -20);
    assert.equal(savingPercent(0, 500), 0);
});

test('base64 round-trips, and its length is predictable', () => {
    assert.equal(base64Length(0), 0);
    assert.equal(base64Length(1), 4);
    assert.equal(base64Length(3), 4);
    assert.equal(base64Length(4), 8);

    for (const length of [0, 1, 2, 3, 7, 64, 255, 1000]) {
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 0xff;
        const encoded = toBase64(bytes);
        assert.equal(encoded.length, base64Length(length), `length ${length}`);
        assert.equal(encoded, Buffer.from(bytes).toString('base64'), `matches Buffer at ${length}`);
        assert.deepEqual(fromBase64(encoded), bytes, `round trip at ${length}`);
    }
});

test('data URIs build and parse', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const uri = toDataUri(bytes, 'image/png');
    assert.equal(uri, 'data:image/png;base64,iVBORw==');
    assert.equal(dataUriLength(bytes.length, 'image/png'), uri.length);

    const parsed = parseDataUri(uri);
    assert.equal(parsed.mimeType, 'image/png');
    assert.deepEqual(parsed.bytes, bytes);
    assert.equal(parseDataUri('https://example.com/a.png'), null);
});

test('uncompressed formats are computed, not estimated', () => {
    const bmp = estimateEncodedSize({ width: 100, height: 100, format: 'bmp' });
    // Rows are padded to a four-byte boundary: 100 * 3 rounds up to 300.
    assert.equal(bmp.bytes, 300 * 100 + 54);
    assert.equal(bmp.uncertainty, 0);
});

test('the estimate orders the codecs the way they actually rank', () => {
    const size = { width: 1920, height: 1080, quality: 80 };
    const jpeg = estimateEncodedSize({ ...size, format: 'jpeg' }).bytes;
    const webp = estimateEncodedSize({ ...size, format: 'webp' }).bytes;
    const avif = estimateEncodedSize({ ...size, format: 'avif' }).bytes;
    assert.ok(avif < webp, 'AVIF beats WebP');
    assert.ok(webp < jpeg, 'WebP beats JPEG');
});

test('quality and content both move the estimate the right way', () => {
    const base = { width: 1000, height: 1000, format: 'jpeg' };
    assert.ok(
        estimateEncodedSize({ ...base, quality: 60 }).bytes < estimateEncodedSize({ ...base, quality: 90 }).bytes,
    );
    assert.ok(
        estimateEncodedSize({ ...base, content: 'illustration' }).bytes <
            estimateEncodedSize({ ...base, content: 'photo' }).bytes,
    );
    // PNG does not have a quality setting, so quality must not change it.
    const png = { width: 500, height: 500, format: 'png' };
    assert.equal(
        estimateEncodedSize({ ...png, quality: 10 }).bytes,
        estimateEncodedSize({ ...png, quality: 100 }).bytes,
    );
});

test('the estimate lands in the right order of magnitude', () => {
    // A 12 MP photo at quality 85 is a few megabytes, not a few kilobytes and
    // not a few hundred. This is the claim the whole function has to earn.
    const { bytes } = estimateEncodedSize({ width: 4000, height: 3000, format: 'jpeg', quality: 85 });
    assert.ok(bytes > 1_500_000 && bytes < 8_000_000, `got ${bytes}`);
});

test('the estimate refuses questions it cannot answer', () => {
    assert.throws(() => estimateEncodedSize({ width: 100, height: 100, format: 'svg' }), RangeError);
    assert.throws(() => estimateEncodedSize({ width: 0, height: 100, format: 'png' }), RangeError);
});

test('estimateBitsPerPixel is the number underneath', () => {
    const bpp = estimateBitsPerPixel('jpeg', 85);
    const estimate = estimateEncodedSize({ width: 1000, height: 1000, format: 'jpeg', quality: 85 });
    assert.equal(estimate.bitsPerPixel, bpp);
    assert.ok(bpp > 0.5 && bpp < 4, `a photographic JPEG is around 1-3 bpp, got ${bpp}`);
});
