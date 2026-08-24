/**
 * Read an image's header and stop.
 *
 * Every format here states its dimensions in the first few hundred bytes, so
 * there is no reason to decode a 40 megapixel photograph to find out it is 40
 * megapixels. That matters in two places in particular: validating an upload
 * before you hand it to a decoder, and refusing a decompression bomb before it
 * costs you the memory rather than after.
 *
 * Nothing in here allocates a pixel buffer, and nothing trusts the file.
 */
import {
    ImageParseError,
    ascii,
    i32le,
    startsWith,
    startsWithAscii,
    toBytes,
    u16be,
    u16le,
    u24le,
    u32be,
    u32le,
    u8,
} from './bits.js';
import { applyOrientation, densityFromTiff, parseTiff, TIFF_TAG } from './exif.js';
import { isStartOfFrame, walkJpegSegments } from './jpeg.js';
import { mimeTypeFor } from './formats.js';
import type { BinaryInput, Density, ImageFormat, Orientation, Size } from './types.js';

export interface ProbeResult {
    format: ImageFormat;
    mimeType: string;
    /** Pixel dimensions as stored, before any orientation flag is applied. */
    width: number;
    height: number;
    /** Dimensions as a viewer sees them. Differs from the above for orientations 5-8. */
    displayWidth: number;
    displayHeight: number;
    /** Whether the format is resolution-independent, in which case the size is a default. */
    vector: boolean;
    /** EXIF orientation, when the file declares one. */
    orientation?: Orientation;
    /** The resolution the file claims. Metadata: it says nothing about detail. */
    density?: Density;
    /** Bits per channel, where the header states it. */
    bitDepth?: number;
    /** Whether transparency is possible in this file. Absent when the header cannot say. */
    hasAlpha?: boolean;
    animated?: boolean;
    /** Frames counted, for the containers where counting is cheap. */
    frames?: number;
    /** Every size in a multi-size container, largest first. ICO and CUR only. */
    variants?: Size[];
    /**
     * The coded frame, when it is larger than the picture. AVIF and HEIC pad
     * odd dimensions up to even and carry a clean aperture that crops them
     * back; `width` and `height` are the crop, this is what was encoded.
     */
    codedSize?: Size;
    /** True for a progressive JPEG. */
    progressive?: boolean;
}

/**
 * Identify a format from its signature without parsing further. Cheap enough
 * to run on every byte stream you are handed.
 */
export function detectFormat(input: BinaryInput): ImageFormat | null {
    const bytes = toBytes(input);
    if (bytes.length < 4) return null;

    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')) return 'gif';
    if (startsWithAscii(bytes, 'RIFF') && startsWithAscii(bytes, 'WEBP', 8)) return 'webp';
    if (startsWithAscii(bytes, 'BM')) return 'bmp';
    if (startsWithAscii(bytes, 'qoif')) return 'qoi';
    if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return 'ico';
    if (startsWith(bytes, [0x00, 0x00, 0x02, 0x00])) return 'cur';
    if (startsWithAscii(bytes, 'II') && bytes[2] === 0x2a && bytes[3] === 0x00) return 'tiff';
    if (startsWithAscii(bytes, 'MM') && bytes[2] === 0x00 && bytes[3] === 0x2a) return 'tiff';
    if (startsWithAscii(bytes, 'ftyp', 4)) return isobmffFormat(bytes);
    if (looksLikeSvg(bytes)) return 'svg';
    return null;
}

/**
 * Everything the header can tell you.
 *
 * Throws `ImageParseError` on bytes that are not a recognised image, or are
 * one but truncated before the dimensions. Use `tryProbeImage` where a bad
 * file is an expected outcome rather than a bug.
 */
export function probeImage(input: BinaryInput): ProbeResult {
    const bytes = toBytes(input);
    const format = detectFormat(bytes);
    if (!format) throw new ImageParseError('Unrecognised image format');

    switch (format) {
        case 'png':
            return probePng(bytes);
        case 'jpeg':
            return probeJpeg(bytes);
        case 'gif':
            return probeGif(bytes);
        case 'webp':
            return probeWebp(bytes);
        case 'bmp':
            return probeBmp(bytes);
        case 'ico':
        case 'cur':
            return probeIco(bytes, format);
        case 'tiff':
            return probeTiff(bytes);
        case 'avif':
        case 'heic':
            return probeIsobmff(bytes, format);
        case 'qoi':
            return probeQoi(bytes);
        case 'svg':
            return probeSvg(bytes);
        default:
            throw new ImageParseError(`No parser for ${format}`);
    }
}

/** `probeImage` that returns null instead of throwing. */
export function tryProbeImage(input: BinaryInput): ProbeResult | null {
    try {
        return probeImage(input);
    } catch {
        return null;
    }
}

/** Just the dimensions, as displayed. The common case, in one call. */
export function imageSize(input: BinaryInput): Size {
    const probe = probeImage(input);
    return { width: probe.displayWidth, height: probe.displayHeight };
}

function finish(
    format: ImageFormat,
    width: number,
    height: number,
    extra: Partial<ProbeResult> = {},
): ProbeResult {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new ImageParseError(`${format}: implausible dimensions ${width}x${height}`);
    }
    const display = applyOrientation({ width, height }, extra.orientation ?? null);
    return {
        format,
        mimeType: mimeTypeFor(format),
        width,
        height,
        displayWidth: display.width,
        displayHeight: display.height,
        vector: false,
        ...extra,
    };
}

/**
 * Densities are stored as pixels per metre in PNG and BMP, so converting gives
 * 72.009 dpi where the encoder plainly meant 72. Snap the near-misses.
 */
function tidyDensity(value: number): number {
    const nearest = Math.round(value);
    if (Math.abs(value - nearest) < 0.05) return nearest;
    return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------- PNG

function probePng(bytes: Uint8Array): ProbeResult {
    if (ascii(bytes, 12, 4) !== 'IHDR') throw new ImageParseError('PNG: first chunk is not IHDR');
    const width = u32be(bytes, 16);
    const height = u32be(bytes, 20);
    const bitDepth = u8(bytes, 24);
    const colourType = u8(bytes, 25);

    const extra: Partial<ProbeResult> = {
        bitDepth,
        hasAlpha: colourType === 4 || colourType === 6,
    };

    // Walk the ancillary chunks up to the pixel data for the optional facts.
    let offset = 8;
    let exifStart: number | null = null;
    try {
        while (offset + 8 <= bytes.length) {
            const length = u32be(bytes, offset);
            const type = ascii(bytes, offset + 4, 4);
            const data = offset + 8;
            if (type === 'IDAT' || type === 'IEND') break;
            if (type === 'pHYs' && length >= 9) {
                const unit = u8(bytes, data + 8);
                const x = u32be(bytes, data);
                const y = u32be(bytes, data + 4);
                if (x > 0) {
                    extra.density =
                        unit === 1
                            ? { x: tidyDensity(x * 0.0254), y: tidyDensity((y || x) * 0.0254), unit: 'dpi' }
                            : { x, y: y || x, unit: 'aspect' };
                }
            } else if (type === 'acTL' && length >= 8) {
                extra.animated = true;
                extra.frames = u32be(bytes, data);
            } else if (type === 'tRNS') {
                extra.hasAlpha = true;
            } else if (type === 'eXIf') {
                exifStart = data;
            }
            offset += 12 + length;
        }
    } catch {
        // A truncated tail costs the extras, not the dimensions.
    }

    if (exifStart !== null) {
        const orientation = orientationFromTiff(bytes, exifStart);
        if (orientation) extra.orientation = orientation;
    }
    if (extra.animated === undefined) extra.animated = false;

    return finish('png', width, height, extra);
}

function orientationFromTiff(bytes: Uint8Array, tiffStart: number): Orientation | null {
    const exif = parseTiff(bytes, tiffStart);
    const value = exif?.ifd0.get(TIFF_TAG.orientation)?.values[0];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) return null;
    return value as Orientation;
}

// ---------------------------------------------------------------- JPEG

function probeJpeg(bytes: Uint8Array): ProbeResult {
    let width = 0;
    let height = 0;
    const extra: Partial<ProbeResult> = { hasAlpha: false, animated: false };

    walkJpegSegments(bytes, (segment) => {
        if (isStartOfFrame(segment.marker)) {
            extra.bitDepth = u8(bytes, segment.offset);
            height = u16be(bytes, segment.offset + 1);
            width = u16be(bytes, segment.offset + 3);
            extra.progressive = segment.marker === 0xc2;
            // Density and orientation always precede the frame, so once the
            // frame is read there is nothing left worth walking.
            return false;
        }
        if (segment.marker === 0xe0 && startsWithAscii(bytes, 'JFIF\0', segment.offset) && segment.length >= 12) {
            const units = u8(bytes, segment.offset + 7);
            const x = u16be(bytes, segment.offset + 8);
            const y = u16be(bytes, segment.offset + 10);
            if (x > 0) {
                extra.density = {
                    x,
                    y: y || x,
                    unit: units === 1 ? 'dpi' : units === 2 ? 'dpcm' : 'aspect',
                };
            }
        } else if (segment.marker === 0xe1 && startsWithAscii(bytes, 'Exif\0\0', segment.offset)) {
            const tiffStart = segment.offset + 6;
            const exif = parseTiff(bytes, tiffStart);
            if (exif) {
                const orientation = exif.ifd0.get(TIFF_TAG.orientation)?.values[0];
                if (typeof orientation === 'number' && orientation >= 1 && orientation <= 8) {
                    extra.orientation = orientation as Orientation;
                }
                // EXIF resolution beats JFIF's, which encoders often leave at 1:1.
                const density = densityFromTiff(exif.ifd0);
                if (density) extra.density = density;
            }
        }
        return true;
    });

    if (!width || !height) throw new ImageParseError('JPEG: no start-of-frame segment found');
    return finish('jpeg', width, height, extra);
}

// ---------------------------------------------------------------- GIF

function probeGif(bytes: Uint8Array): ProbeResult {
    const width = u16le(bytes, 6);
    const height = u16le(bytes, 8);
    const packed = u8(bytes, 10);

    let frames = 0;
    let hasAlpha = false;
    let offset = 13;
    if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));

    try {
        while (offset < bytes.length) {
            const block = u8(bytes, offset);
            if (block === 0x3b) break; // trailer
            if (block === 0x21) {
                const label = u8(bytes, offset + 1);
                let cursor = offset + 2;
                if (label === 0xf9 && u8(bytes, cursor) >= 4 && u8(bytes, cursor + 1) & 0x01) hasAlpha = true;
                cursor = skipSubBlocks(bytes, cursor);
                offset = cursor;
                continue;
            }
            if (block === 0x2c) {
                frames++;
                const localPacked = u8(bytes, offset + 9);
                let cursor = offset + 10;
                if (localPacked & 0x80) cursor += 3 * (1 << ((localPacked & 0x07) + 1));
                cursor += 1; // LZW minimum code size
                offset = skipSubBlocks(bytes, cursor);
                continue;
            }
            break; // Anything else means the stream is not what it claims.
        }
    } catch {
        // Counting frames is a nicety; the dimensions are already read.
    }

    const extra: Partial<ProbeResult> = { hasAlpha, frames: frames || 1, animated: frames > 1 };
    // The low three bits size the global colour table, and only mean anything
    // when there is one.
    if (packed & 0x80) extra.bitDepth = (packed & 0x07) + 1;
    return finish('gif', width, height, extra);
}

/** GIF's length-prefixed sub-block chain, terminated by a zero-length block. */
function skipSubBlocks(bytes: Uint8Array, offset: number): number {
    let cursor = offset;
    for (;;) {
        const size = u8(bytes, cursor);
        cursor += 1 + size;
        if (size === 0) return cursor;
    }
}

// ---------------------------------------------------------------- WebP

function probeWebp(bytes: Uint8Array): ProbeResult {
    const riffEnd = Math.min(bytes.length, 8 + u32le(bytes, 4));
    let offset = 12;
    let size: Size | null = null;
    const extra: Partial<ProbeResult> = {};
    let frames = 0;

    while (offset + 8 <= riffEnd) {
        const fourcc = ascii(bytes, offset, 4);
        const length = u32le(bytes, offset + 4);
        const data = offset + 8;

        if (fourcc === 'VP8X') {
            const flags = u8(bytes, data);
            extra.hasAlpha = (flags & 0x10) !== 0;
            extra.animated = (flags & 0x02) !== 0;
            size = { width: u24le(bytes, data + 4) + 1, height: u24le(bytes, data + 7) + 1 };
        } else if (fourcc === 'VP8 ' && !size) {
            // Key frame: 3-byte frame tag, then the 3-byte start code.
            if (!startsWith(bytes, [0x9d, 0x01, 0x2a], data + 3)) {
                throw new ImageParseError('WebP: lossy chunk is not a key frame');
            }
            size = { width: u16le(bytes, data + 6) & 0x3fff, height: u16le(bytes, data + 8) & 0x3fff };
            if (extra.hasAlpha === undefined) extra.hasAlpha = false;
        } else if (fourcc === 'VP8L' && !size) {
            if (u8(bytes, data) !== 0x2f) throw new ImageParseError('WebP: bad lossless signature');
            const packed = u32le(bytes, data + 1);
            size = { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
            if (extra.hasAlpha === undefined) extra.hasAlpha = ((packed >>> 28) & 1) === 1;
        } else if (fourcc === 'ANMF') {
            frames++;
        } else if (fourcc === 'EXIF') {
            const orientation = orientationFromTiff(bytes, data);
            if (orientation) extra.orientation = orientation;
        }

        offset += 8 + length + (length % 2); // chunks are padded to even lengths
    }

    if (!size) throw new ImageParseError('WebP: no VP8, VP8L or VP8X chunk');
    if (frames) extra.frames = frames;
    if (extra.animated === undefined) extra.animated = false;
    return finish('webp', size.width, size.height, extra);
}

// ---------------------------------------------------------------- BMP

function probeBmp(bytes: Uint8Array): ProbeResult {
    const headerSize = u32le(bytes, 14);
    const extra: Partial<ProbeResult> = { animated: false };

    if (headerSize === 12) {
        // BITMAPCOREHEADER: 16-bit dimensions, no density fields.
        const width = u16le(bytes, 18);
        const height = u16le(bytes, 20);
        extra.bitDepth = u16le(bytes, 24);
        extra.hasAlpha = extra.bitDepth === 32;
        return finish('bmp', width, height, extra);
    }

    const width = Math.abs(i32le(bytes, 18));
    // A negative height means the rows are stored top-down. Still that tall.
    const height = Math.abs(i32le(bytes, 22));
    extra.bitDepth = u16le(bytes, 28);
    extra.hasAlpha = extra.bitDepth === 32;

    if (headerSize >= 40) {
        try {
            const xppm = i32le(bytes, 38);
            const yppm = i32le(bytes, 42);
            if (xppm > 0) {
                extra.density = { x: tidyDensity(xppm * 0.0254), y: tidyDensity((yppm || xppm) * 0.0254), unit: 'dpi' };
            }
        } catch {
            // Header shorter than it claimed.
        }
    }

    return finish('bmp', width, height, extra);
}

// ---------------------------------------------------------------- ICO / CUR

function probeIco(bytes: Uint8Array, format: 'ico' | 'cur'): ProbeResult {
    const count = u16le(bytes, 4);
    if (count === 0) throw new ImageParseError('ICO: no entries');
    const variants: Size[] = [];
    for (let i = 0; i < count; i++) {
        const entry = 6 + i * 16;
        // A zero byte means 256, which is the only size that does not fit.
        const width = u8(bytes, entry) || 256;
        const height = u8(bytes, entry + 1) || 256;
        variants.push({ width, height });
    }
    variants.sort((a, b) => b.width * b.height - a.width * a.height);
    const largest = variants[0] as Size;
    return finish(format, largest.width, largest.height, {
        variants,
        frames: variants.length,
        hasAlpha: true,
        animated: false,
    });
}

// ---------------------------------------------------------------- TIFF

function probeTiff(bytes: Uint8Array): ProbeResult {
    const exif = parseTiff(bytes, 0);
    if (!exif) throw new ImageParseError('TIFF: unreadable header');
    const width = exif.ifd0.get(TIFF_TAG.imageWidth)?.values[0];
    const height = exif.ifd0.get(TIFF_TAG.imageHeight)?.values[0];
    if (typeof width !== 'number' || typeof height !== 'number') {
        throw new ImageParseError('TIFF: no ImageWidth/ImageLength in the first directory');
    }
    const extra: Partial<ProbeResult> = { animated: false };
    const bitDepth = exif.ifd0.get(TIFF_TAG.bitsPerSample)?.values[0];
    if (typeof bitDepth === 'number') extra.bitDepth = bitDepth;
    const orientation = exif.ifd0.get(TIFF_TAG.orientation)?.values[0];
    if (typeof orientation === 'number' && orientation >= 1 && orientation <= 8) {
        extra.orientation = orientation as Orientation;
    }
    const density = densityFromTiff(exif.ifd0);
    if (density) extra.density = density;
    return finish('tiff', width, height, extra);
}

// ---------------------------------------------------------------- ISOBMFF

interface Box {
    type: string;
    offset: number;
    size: number;
    contentOffset: number;
    contentEnd: number;
}

/**
 * Walk one level of an ISO base media file. AVIF and HEIC are both MP4 files
 * carrying still frames, so the dimensions live several boxes deep rather than
 * in a header.
 */
function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
    let offset = start;
    while (offset + 8 <= end) {
        let size = u32be(bytes, offset);
        const type = ascii(bytes, offset + 4, 4);
        let headerSize = 8;
        if (size === 1) {
            const high = u32be(bytes, offset + 8);
            const low = u32be(bytes, offset + 12);
            size = high * 0x100000000 + low;
            headerSize = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < headerSize || offset + size > end) return;
        yield { type, offset, size, contentOffset: offset + headerSize, contentEnd: offset + size };
        offset += size;
    }
}

function findBox(bytes: Uint8Array, start: number, end: number, type: string): Box | null {
    for (const box of boxes(bytes, start, end)) {
        if (box.type === type) return box;
    }
    return null;
}

const AVIF_BRANDS = new Set(['avif', 'avis']);

function isobmffFormat(bytes: Uint8Array): ImageFormat | null {
    try {
        const size = u32be(bytes, 0);
        const major = ascii(bytes, 8, 4);
        if (AVIF_BRANDS.has(major)) return 'avif';
        const compatible: string[] = [];
        for (let at = 16; at + 4 <= Math.min(size, bytes.length); at += 4) compatible.push(ascii(bytes, at, 4));
        if (compatible.some((brand) => AVIF_BRANDS.has(brand))) return 'avif';
        const heifBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
        if (heifBrands.includes(major) || compatible.some((brand) => heifBrands.includes(brand))) return 'heic';
        return null;
    } catch {
        return null;
    }
}

function probeIsobmff(bytes: Uint8Array, format: ImageFormat): ProbeResult {
    const meta = findBox(bytes, 0, bytes.length, 'meta');
    if (!meta) throw new ImageParseError(`${format}: no meta box (is the file truncated?)`);

    // meta is a FullBox: four bytes of version and flags before its children.
    const metaStart = meta.contentOffset + 4;
    const iprp = findBox(bytes, metaStart, meta.contentEnd, 'iprp');
    if (!iprp) throw new ImageParseError(`${format}: no item property box`);
    // ipco and ipma are both children of iprp — the association table sits
    // beside the property list, not up in meta with pitm.
    const iprpChildren = [...boxes(bytes, iprp.contentOffset, iprp.contentEnd)];
    const ipco = iprpChildren.find((box) => box.type === 'ipco');
    const ipma = iprpChildren.find((box) => box.type === 'ipma');
    if (!ipco) throw new ImageParseError(`${format}: no item property container`);

    const properties = [...boxes(bytes, ipco.contentOffset, ipco.contentEnd)];
    const chosen = primaryProperties(bytes, meta, metaStart, ipma, properties);

    let coded: Size | null = null;
    let visible: Size | null = null;
    let rotation = 0;
    for (const property of chosen) {
        if (property.type === 'ispe' && !coded) {
            coded = { width: u32be(bytes, property.contentOffset + 4), height: u32be(bytes, property.contentOffset + 8) };
        } else if (property.type === 'clap' && !visible) {
            visible = cleanAperture(bytes, property);
        } else if (property.type === 'irot') {
            rotation = u8(bytes, property.contentOffset) & 0x03;
        }
    }

    if (!coded) throw new ImageParseError(`${format}: no ispe property for the primary item`);

    const extra: Partial<ProbeResult> = { animated: false };

    // A clean aperture crops the coded frame. Apple's encoder pads odd
    // dimensions up to even and then crops back, so a 37x23 photo is stored as
    // 38x24 with a clap saying 37x23 — report what a viewer shows.
    let size = coded;
    if (visible && visible.width <= coded.width && visible.height <= coded.height) {
        size = visible;
        extra.codedSize = coded;
    }

    // irot counts anticlockwise quarter turns. Expressed as the EXIF value
    // that produces the same picture, so callers have one thing to branch on.
    const orientation: Orientation | undefined = rotation === 1 ? 8 : rotation === 2 ? 3 : rotation === 3 ? 6 : undefined;
    if (orientation) extra.orientation = orientation;

    const pixi = chosen.find((property) => property.type === 'pixi');
    if (pixi) {
        try {
            const channels = u8(bytes, pixi.contentOffset + 4);
            if (channels > 0) extra.bitDepth = u8(bytes, pixi.contentOffset + 5);
            extra.hasAlpha = channels === 2 || channels === 4;
        } catch {
            // Optional property, optional answer.
        }
    }
    // An alpha plane is a separate coded item associated with the primary one,
    // so it is never among the primary's own properties. Its auxiliary type
    // URN is the reliable signal, and it is the whole store that has to be
    // searched for it.
    if (properties.some((property) => property.type === 'auxC' && isAlphaAuxiliary(bytes, property))) {
        extra.hasAlpha = true;
    }

    return finish(format, size.width, size.height, extra);
}

/** CleanApertureBox: four 32-bit fractions, of which the first two size it. */
function cleanAperture(bytes: Uint8Array, box: Box): Size | null {
    try {
        const widthN = u32be(bytes, box.contentOffset);
        const widthD = u32be(bytes, box.contentOffset + 4);
        const heightN = u32be(bytes, box.contentOffset + 8);
        const heightD = u32be(bytes, box.contentOffset + 12);
        if (!widthD || !heightD) return null;
        const width = Math.round(widthN / widthD);
        const height = Math.round(heightN / heightD);
        if (width < 1 || height < 1) return null;
        return { width, height };
    } catch {
        return null;
    }
}

/**
 * Whether an `auxC` property marks an alpha plane. AVIF spells it out; HEIC
 * uses the HEVC auxiliary id 1, which means the same thing and says none of it.
 */
function isAlphaAuxiliary(bytes: Uint8Array, box: Box): boolean {
    try {
        const length = Math.min(box.contentEnd - box.contentOffset - 4, 128);
        if (length <= 0) return false;
        const urn = ascii(bytes, box.contentOffset + 4, length).split('\0')[0] ?? '';
        return urn.includes('alpha') || /auxid:1$/.test(urn);
    } catch {
        return false;
    }
}

/**
 * The property boxes belonging to the primary item.
 *
 * A HEIC holds several images — the photo, a thumbnail, sometimes a depth map
 * — each with its own `ispe`. Taking the first or the largest gets it wrong
 * often enough to matter, so follow `pitm` to the primary item and `ipma` to
 * its properties. Falls back to every property in file order if either box is
 * missing or malformed, which at least keeps a usable answer for odd files.
 */
function primaryProperties(
    bytes: Uint8Array,
    meta: Box,
    metaStart: number,
    ipma: Box | undefined,
    properties: Box[],
): Box[] {
    try {
        const pitm = findBox(bytes, metaStart, meta.contentEnd, 'pitm');
        if (!pitm || !ipma) return properties;

        const pitmVersion = u8(bytes, pitm.contentOffset);
        const primaryId = pitmVersion === 0 ? u16be(bytes, pitm.contentOffset + 4) : u32be(bytes, pitm.contentOffset + 4);

        const ipmaVersion = u8(bytes, ipma.contentOffset);
        const ipmaFlags = u32be(bytes, ipma.contentOffset) & 0x00ffffff;
        const wideIndices = (ipmaFlags & 1) === 1;
        const entryCount = u32be(bytes, ipma.contentOffset + 4);
        let cursor = ipma.contentOffset + 8;

        for (let i = 0; i < entryCount && cursor < ipma.contentEnd; i++) {
            const itemId = ipmaVersion < 1 ? u16be(bytes, cursor) : u32be(bytes, cursor);
            cursor += ipmaVersion < 1 ? 2 : 4;
            const associationCount = u8(bytes, cursor);
            cursor += 1;
            const indices: number[] = [];
            for (let a = 0; a < associationCount; a++) {
                if (wideIndices) {
                    indices.push(u16be(bytes, cursor) & 0x7fff);
                    cursor += 2;
                } else {
                    indices.push(u8(bytes, cursor) & 0x7f);
                    cursor += 1;
                }
            }
            if (itemId !== primaryId) continue;
            // Property indices are 1-based into ipco's children.
            const matched = indices.map((index) => properties[index - 1]).filter((box): box is Box => !!box);
            return matched.length ? matched : properties;
        }
    } catch {
        // Fall through to the file-order fallback.
    }
    return properties;
}

// ---------------------------------------------------------------- QOI

function probeQoi(bytes: Uint8Array): ProbeResult {
    const width = u32be(bytes, 4);
    const height = u32be(bytes, 8);
    const channels = u8(bytes, 12);
    return finish('qoi', width, height, { hasAlpha: channels === 4, bitDepth: 8, animated: false });
}

// ---------------------------------------------------------------- SVG

const SVG_SNIFF_BYTES = 4096;

function looksLikeSvg(bytes: Uint8Array): boolean {
    const head = ascii(bytes, 0, Math.min(bytes.length, SVG_SNIFF_BYTES)).trimStart();
    if (head.startsWith('<svg')) return true;
    if (!head.startsWith('<?xml') && !head.startsWith('<!--') && !head.startsWith('<!DOCTYPE')) return false;
    return /<svg[\s>]/i.test(head);
}

/** CSS absolute units, in px. A user unit with no suffix is already a px. */
const CSS_UNITS: Readonly<Record<string, number>> = Object.freeze({
    '': 1,
    px: 1,
    pt: 96 / 72,
    pc: 16,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
});

function parseCssLength(value: string | undefined): number | null {
    if (!value) return null;
    const match = value.trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/);
    if (!match) return null;
    const size = Number(match[1]);
    const factor = CSS_UNITS[match[2] ?? ''];
    if (!Number.isFinite(size) || factor === undefined) return null; // % and em are relative: unanswerable here
    return size * factor;
}

function probeSvg(bytes: Uint8Array): ProbeResult {
    const text = ascii(bytes, 0, Math.min(bytes.length, SVG_SNIFF_BYTES));
    const tag = text.match(/<svg\b[^>]*>/i)?.[0];
    if (!tag) throw new ImageParseError('SVG: no <svg> element in the first 4 KB');

    const attribute = (name: string): string | undefined =>
        tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

    let width = parseCssLength(attribute('width'));
    let height = parseCssLength(attribute('height'));

    const viewBox = attribute('viewBox')
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
    const boxWidth = viewBox?.length === 4 ? viewBox[2] : undefined;
    const boxHeight = viewBox?.length === 4 ? viewBox[3] : undefined;
    const hasViewBox = typeof boxWidth === 'number' && typeof boxHeight === 'number' && boxWidth > 0 && boxHeight > 0;

    // One side plus a viewBox is enough; the ratio supplies the other.
    if (hasViewBox) {
        if (width && !height) height = (width * (boxHeight as number)) / (boxWidth as number);
        else if (height && !width) width = (height * (boxWidth as number)) / (boxHeight as number);
        else if (!width && !height) {
            width = boxWidth as number;
            height = boxHeight as number;
        }
    }

    // No usable width, height or viewBox: this is the 300x150 every browser
    // falls back to for a replaced element with no intrinsic size.
    const finalWidth = width && width > 0 ? width : 300;
    const finalHeight = height && height > 0 ? height : 150;

    return {
        format: 'svg',
        mimeType: mimeTypeFor('svg'),
        width: finalWidth,
        height: finalHeight,
        displayWidth: finalWidth,
        displayHeight: finalHeight,
        vector: true,
        hasAlpha: true,
        animated: false,
    };
}
