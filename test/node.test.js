import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ImageParseError } from '../dist/esm/index.js';
import {
    imageSizeFile,
    imageSizeFileSync,
    probeImageFile,
    probeImageFileSync,
    tryProbeImageFile,
} from '../dist/esm/node.js';
import { fixturePath } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

const NAMES = [
    'sample.png',
    'sample.jpg',
    'sample.gif',
    'sample.webp',
    'sample.bmp',
    'sample.tif',
    'sample.avif',
    'sample.heic',
];

test('every fixture reads from disk, async and sync alike', async () => {
    for (const name of NAMES) {
        const path = fixturePath(name);
        const asynchronous = await probeImageFile(path);
        const synchronous = probeImageFileSync(path);
        assert.deepEqual(asynchronous, synchronous, name);
        assert.equal(asynchronous.width, 37, name);
        assert.equal(asynchronous.height, 23, name);
    }
});

test('imageSizeFile is the short way to ask', async () => {
    assert.deepEqual(await imageSizeFile(fixturePath('sample.png')), { width: 37, height: 23 });
    assert.deepEqual(imageSizeFileSync(fixturePath('sample.tif')), { width: 37, height: 23 });
});

test('a prefix too small to parse falls back to the whole file', async () => {
    // The point of prefixBytes is to avoid loading a large file to read eight
    // bytes of header. When the gamble fails the answer must still be right.
    for (const name of NAMES) {
        const probe = await probeImageFile(fixturePath(name), { prefixBytes: 16 });
        assert.equal(probe.width, 37, name);
    }
    assert.equal(probeImageFileSync(fixturePath('sample.heic'), { prefixBytes: 16 }).width, 37);
});

test('a file that is not an image is reported, not guessed at', async () => {
    const packageJson = join(here, '..', 'package.json');
    await assert.rejects(() => probeImageFile(packageJson), ImageParseError);
    assert.throws(() => probeImageFileSync(packageJson), ImageParseError);
    assert.equal(await tryProbeImageFile(packageJson), null);
});

test('a missing file rejects rather than returning something', async () => {
    await assert.rejects(() => probeImageFile(join(here, 'no-such-file.png')));
    assert.equal(await tryProbeImageFile(join(here, 'no-such-file.png')), null);
});
