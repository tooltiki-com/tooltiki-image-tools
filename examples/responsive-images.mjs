/**
 * Plan the renditions of a source image, and write the markup for them.
 *
 *     node examples/responsive-images.mjs ../test/fixtures/sample.png
 *
 * Nothing here encodes anything. It produces the list of sizes to hand to
 * sharp (or an image CDN) and the two attributes that decide which one a
 * browser actually downloads.
 */
import { buildSizes, buildSrcset, estimateEncodedSize, formatBytes, renditions } from 'tooltiki-image-tools';
import { probeImageFile } from 'tooltiki-image-tools/node';

const LAYOUT = [
    { media: '(min-width: 1100px)', size: '1040px' },
    { media: '(min-width: 700px)', size: '90vw' },
    { size: '100vw' },
];

export function plan(source) {
    const sizes = renditions(source, { min: 400 });
    return sizes.map((size) => ({
        ...size,
        // A planning figure, not a promise — see the note on estimateEncodedSize.
        estimated: estimateEncodedSize({ ...size, format: 'webp', quality: 80 }).bytes,
    }));
}

const target = process.argv[2];
if (!target) {
    console.log('Usage: node examples/responsive-images.mjs <file>');
} else {
    const image = await probeImageFile(target);
    const source = { width: image.displayWidth, height: image.displayHeight };
    const wanted = plan(source);

    console.log(`Source: ${source.width} x ${source.height} ${image.format}\n`);

    // No rendition is wider than the source, so a small image can legitimately
    // produce none at all. An empty srcset attribute is worse than no srcset.
    if (wanted.length === 0) {
        console.log(`Nothing to generate — ${source.width}px is below the smallest useful width.\n`);
        console.log(`<img src="${target}" width="${source.width}" height="${source.height}" alt="">`);
    } else {
        for (const size of wanted) {
            console.log(`  ${String(size.width).padStart(5)} x ${String(size.height).padEnd(5)}  ~${formatBytes(size.estimated)} as WebP`);
        }

        const largest = wanted[wanted.length - 1];
        console.log(`\n<img\n  src="/img/hero-${largest.width}.webp"`);
        console.log(`  srcset="${buildSrcset('/img/hero-{width}.webp', wanted.map((size) => size.width))}"`);
        console.log(`  sizes="${buildSizes(LAYOUT)}"`);
        // width and height are not decoration: without them the browser cannot
        // reserve the space, and the page shifts when the image arrives.
        console.log(`  width="${source.width}" height="${source.height}"`);
        console.log('  alt="" loading="lazy" decoding="async">');
    }
}
