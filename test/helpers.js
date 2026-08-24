/**
 * Byte builders for the cases a fixture file cannot cover.
 *
 * The checked-in fixtures are real encoder output, which is the right way to
 * test a parser. But some things are awkward to produce on demand — a JPEG
 * with a specific EXIF orientation, an APNG, a truncated file — so those are
 * assembled here instead, to spec, with real CRCs where the format has them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = join(here, 'fixtures');

export function fixture(name) {
    return readFileSync(join(FIXTURES, name));
}

export function fixturePath(name) {
    return join(FIXTURES, name);
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngChunk(type, data = Buffer.alloc(0)) {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
}

/** A PNG header chain with real CRCs. No pixel data — the parser never reads any. */
export function buildPng({ width, height, bitDepth = 8, colourType = 6, extra = [] } = {}) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = bitDepth;
    ihdr[9] = colourType;
    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk('IHDR', ihdr),
        ...extra,
        pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x00])),
        pngChunk('IEND'),
    ]);
}

/** A pHYs chunk. `unit` 1 means pixels per metre, 0 means an aspect ratio. */
export function pngPhys(x, y, unit = 1) {
    const data = Buffer.alloc(9);
    data.writeUInt32BE(x, 0);
    data.writeUInt32BE(y, 4);
    data[8] = unit;
    return pngChunk('pHYs', data);
}

/** An animation control chunk, which is what makes a PNG an APNG. */
export function pngActl(frames, plays = 0) {
    const data = Buffer.alloc(8);
    data.writeUInt32BE(frames, 0);
    data.writeUInt32BE(plays, 4);
    return pngChunk('acTL', data);
}

/** A big-endian TIFF block holding one SHORT tag. */
export function tiffWithShortTag(tag, value) {
    const bytes = Buffer.alloc(26);
    bytes.write('MM', 0, 'latin1');
    bytes.writeUInt16BE(42, 2);
    bytes.writeUInt32BE(8, 4);
    bytes.writeUInt16BE(1, 8); // one entry
    bytes.writeUInt16BE(tag, 10);
    bytes.writeUInt16BE(3, 12); // type SHORT
    bytes.writeUInt32BE(1, 14); // count
    bytes.writeUInt16BE(value, 18); // inline, high-order half of the value field
    bytes.writeUInt32BE(0, 22); // no next IFD
    return bytes;
}

function jpegSegment(marker, payload) {
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = marker;
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
}

/** A JPEG made only of the segments a prober reads. */
export function buildJpeg({ width, height, orientation, jfif, progressive = false } = {}) {
    const parts = [Buffer.from([0xff, 0xd8])];

    if (jfif) {
        const payload = Buffer.alloc(14);
        payload.write('JFIF\0', 0, 'latin1');
        payload[5] = 1;
        payload[6] = 1;
        payload[7] = jfif.units;
        payload.writeUInt16BE(jfif.x, 8);
        payload.writeUInt16BE(jfif.y, 10);
        parts.push(jpegSegment(0xe0, payload));
    }

    if (orientation) {
        const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffWithShortTag(0x0112, orientation)]);
        parts.push(jpegSegment(0xe1, payload));
    }

    const sof = Buffer.alloc(9);
    sof[0] = 8; // sample precision
    sof.writeUInt16BE(height, 1);
    sof.writeUInt16BE(width, 3);
    sof[5] = 1; // one component
    sof[6] = 1;
    sof[7] = 0x11;
    sof[8] = 0;
    parts.push(jpegSegment(progressive ? 0xc2 : 0xc0, sof));
    parts.push(Buffer.from([0xff, 0xd9]));
    return Buffer.concat(parts);
}

function riffChunk(fourcc, data) {
    const header = Buffer.alloc(8);
    header.write(fourcc, 0, 'latin1');
    header.writeUInt32LE(data.length, 4);
    const padding = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([header, Buffer.from(data), padding]);
}

function riff(chunks) {
    const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
    const header = Buffer.alloc(8);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
}

/** An extended WebP: the container that carries animation and alpha flags. */
export function buildWebpExtended({ width, height, alpha = false, animation = false, frames = 0 } = {}) {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = (alpha ? 0x10 : 0) | (animation ? 0x02 : 0);
    vp8x.writeUIntLE(width - 1, 4, 3);
    vp8x.writeUIntLE(height - 1, 7, 3);
    const chunks = [riffChunk('VP8X', vp8x)];
    for (let i = 0; i < frames; i++) chunks.push(riffChunk('ANMF', Buffer.alloc(16)));
    return riff(chunks);
}

/** A lossless WebP header. The 14-bit dimensions are packed minus one. */
export function buildWebpLossless({ width, height, alpha = false } = {}) {
    const data = Buffer.alloc(5);
    data[0] = 0x2f;
    const packed = (width - 1) | ((height - 1) << 14) | ((alpha ? 1 : 0) << 28);
    data.writeUInt32LE(packed >>> 0, 1);
    return riff([riffChunk('VP8L', data)]);
}

/** A QOI file: a fourteen-byte header and nothing this parser needs after it. */
export function buildQoi({ width, height, channels = 4 } = {}) {
    const bytes = Buffer.alloc(14);
    bytes.write('qoif', 0, 'latin1');
    bytes.writeUInt32BE(width, 4);
    bytes.writeUInt32BE(height, 8);
    bytes[12] = channels;
    bytes[13] = 0;
    return bytes;
}
