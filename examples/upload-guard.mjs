/**
 * Validate an upload before anything decodes it.
 *
 *     node examples/upload-guard.mjs ../test/fixtures/sample.jpg
 *
 * The order matters. Sniffing the format from the bytes catches a .jpg that is
 * really a PDF, and checking the decoded size catches the 200-megapixel PNG
 * that is 40 KB on disk and 800 MB in memory — which is the whole point of
 * doing this before the decoder runs, not after.
 */
import { decodedByteSize, formatBytes, megapixels } from 'tooltiki-image-tools';
import { probeImageFile } from 'tooltiki-image-tools/node';

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'avif']);
const MAX_PIXELS = 50_000_000;
const MAX_DECODED = 256 * 1024 * 1024;

export async function checkUpload(path) {
    let image;
    try {
        image = await probeImageFile(path);
    } catch (error) {
        return { ok: false, reason: `Not a readable image: ${error.message}` };
    }

    if (!ALLOWED.has(image.format)) {
        return { ok: false, reason: `${image.format.toUpperCase()} is not accepted here` };
    }

    const pixels = image.displayWidth * image.displayHeight;
    if (pixels > MAX_PIXELS) {
        return { ok: false, reason: `${megapixels(image)} megapixels is over the limit` };
    }

    const decoded = decodedByteSize({ width: image.width, height: image.height });
    if (decoded > MAX_DECODED) {
        return { ok: false, reason: `Would need ${formatBytes(decoded)} to decode` };
    }

    return {
        ok: true,
        format: image.format,
        // Not image.width: a phone's portrait photo is a landscape frame with
        // an orientation flag, and the display size is the one to store.
        width: image.displayWidth,
        height: image.displayHeight,
        rotated: image.displayWidth !== image.width,
    };
}

const target = process.argv[2];
if (target) {
    console.log(await checkUpload(target));
} else {
    console.log('Usage: node examples/upload-guard.mjs <file>');
}
