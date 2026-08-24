/**
 * JPEG segment walking, shared by the prober and the EXIF reader.
 *
 * A JPEG is a chain of `FF xx` markers. Most carry a two-byte length; a few
 * (the standalone markers, and the start-of-scan after which the entropy-coded
 * data begins) do not. Walking it wrongly is how a parser ends up reading the
 * compressed pixel data as if it were headers, so the rules are in one place.
 */
import { ImageParseError, u8, u16be } from './bits.js';

export interface JpegSegment {
    /** The marker byte after `FF`, e.g. 0xC0 for SOF0 or 0xE1 for APP1. */
    marker: number;
    /** Offset of the segment payload, just past the two length bytes. */
    offset: number;
    /** Payload length in bytes, excluding the two length bytes. */
    length: number;
}

/** Start-of-frame markers. C4, C8 and CC sit in the range but are not frames. */
export function isStartOfFrame(marker: number): boolean {
    return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Visit every segment until the scan data starts. Return `false` from `visit`
 * to stop early — worth doing, because the segment you want is usually in the
 * first kilobyte and the file may be forty megabytes.
 */
export function walkJpegSegments(bytes: Uint8Array, visit: (segment: JpegSegment) => boolean | void): void {
    if (u16be(bytes, 0) !== 0xffd8) throw new ImageParseError('Not a JPEG: missing SOI marker');

    let offset = 2;
    while (offset < bytes.length) {
        // Segments are padded with any number of FF fill bytes.
        if (u8(bytes, offset) !== 0xff) {
            offset++;
            continue;
        }
        while (offset < bytes.length && u8(bytes, offset) === 0xff) offset++;
        if (offset >= bytes.length) return;
        const marker = u8(bytes, offset);
        offset++;

        // Standalone markers: no length, no payload.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        // End of image, or the start of entropy-coded data we must not walk.
        if (marker === 0xd9 || marker === 0xda) return;

        const length = u16be(bytes, offset);
        if (length < 2) throw new ImageParseError(`Bad JPEG segment length ${length} at offset ${offset}`);
        const payload: JpegSegment = { marker, offset: offset + 2, length: length - 2 };
        if (visit(payload) === false) return;
        offset += length;
    }
}
