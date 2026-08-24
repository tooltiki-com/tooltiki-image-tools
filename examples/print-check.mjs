/**
 * How large can this photo be printed, and on what.
 *
 *     node examples/print-check.mjs ../test/fixtures/sample.jpg
 *
 * The density a file claims in its header is an intention, not a property of
 * the pixels — resaving a photo "at 300 dpi" changes nothing about the picture.
 * What decides the answer is the pixel count against the physical size.
 */
import { largestPrintAt, PAPER_SIZES, fitsPaper, megapixels } from 'tooltiki-image-tools';
import { probeImageFile } from 'tooltiki-image-tools/node';

const inches = (value) => `${value.toFixed(1)} in`;

const target = process.argv[2];
if (!target) {
    console.log('Usage: node examples/print-check.mjs <file>');
} else {
    const image = await probeImageFile(target);
    const pixels = { width: image.displayWidth, height: image.displayHeight };

    console.log(`${pixels.width} x ${pixels.height} (${megapixels(pixels)} MP)`);
    if (image.density && image.density.unit !== 'aspect') {
        console.log(`The file claims ${image.density.x} ${image.density.unit}, which is metadata and changes nothing.\n`);
    } else {
        console.log('The file states no resolution, which is the usual case and costs nothing.\n');
    }

    for (const dpi of [300, 240, 150]) {
        const size = largestPrintAt(pixels, dpi);
        console.log(`  at ${dpi} dpi: ${inches(size.width)} x ${inches(size.height)}`);
    }

    console.log('\nOn paper:');
    for (const paper of PAPER_SIZES) {
        const result = fitsPaper(pixels, paper.id, { margin: 10 });
        const verdict = result.meetsTarget ? 'yes' : result.quality;
        console.log(`  ${paper.label.padEnd(14)} ${Math.round(result.dpi).toString().padStart(5)} dpi   ${verdict}`);
    }
}
