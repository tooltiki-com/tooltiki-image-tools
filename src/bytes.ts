/**
 * File size: reading it, writing it, and estimating it before the encoder has
 * run.
 *
 * The one opinion here is decimal units. 1 KB is 1000 bytes, because that is
 * what every operating system's file dialog shows and arguing about it in a
 * UI only ever confuses the person reading the number. Pass `binary: true`
 * where you actually mean KiB.
 */
import type { ImageFormat } from './types.js';

const DECIMAL_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const BINARY_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;

export interface FormatBytesOptions {
    /** Decimals for anything above bytes. Default 1. Bytes are always whole. */
    digits?: number;
    /** Use 1024-based KiB/MiB rather than 1000-based KB/MB. Default false. */
    binary?: boolean;
    /** BCP 47 tag for the decimal separator. Default is the runtime's locale. */
    locale?: string;
}

/**
 * A byte count someone can read. Negatives keep their sign, because the
 * difference between two files is a legitimate thing to format.
 */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
    if (!Number.isFinite(bytes)) throw new TypeError('formatBytes needs a finite number');
    const { digits = 1, binary = false, locale } = options;
    const step = binary ? 1024 : 1000;
    const units = binary ? BINARY_UNITS : DECIMAL_UNITS;

    const sign = bytes < 0 ? '-' : '';
    let value = Math.abs(bytes);
    let unit = 0;
    while (value >= step && unit < units.length - 1) {
        value /= step;
        unit++;
    }
    const decimals = unit === 0 ? 0 : digits;
    const rounded = unit === 0 ? Math.round(value) : value;
    const text = rounded.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return `${sign}${text} ${units[unit]}`;
}

const PARSE_UNITS: Readonly<Record<string, number>> = Object.freeze({
    b: 1,
    byte: 1,
    bytes: 1,
    k: 1e3,
    kb: 1e3,
    kib: 1024,
    m: 1e6,
    mb: 1e6,
    mib: 1024 ** 2,
    g: 1e9,
    gb: 1e9,
    gib: 1024 ** 3,
    t: 1e12,
    tb: 1e12,
    tib: 1024 ** 4,
});

/**
 * Read a size back out of a string: "2.5 MB", "500kb", "1MiB", "2048".
 * A bare number is bytes. Returns null on anything it cannot make sense of,
 * so it is safe to point at user input or a config file.
 */
export function parseBytes(text: string): number | null {
    const match = text.trim().toLowerCase().replace(/,/g, '').match(/^(-?\d*\.?\d+)\s*([a-z]*)$/);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const factor = PARSE_UNITS[match[2] || 'b'];
    if (factor === undefined) return null;
    return value * factor;
}

/**
 * How much smaller the second file is, as a percentage. Negative when the
 * "optimised" file came out bigger, which re-encoding does more often than
 * anyone expects.
 */
export function savingPercent(before: number, after: number): number {
    if (!before) return 0;
    return ((before - after) / before) * 100;
}

/** Length of the base64 form of a byte count, padding included. */
export function base64Length(byteLength: number): number {
    return 4 * Math.ceil(byteLength / 3);
}

/**
 * Length of the full `data:` URI, so you can decide whether inlining an image
 * beats the request that would fetch it. Base64 costs about a third on top.
 */
export function dataUriLength(byteLength: number, mimeType: string): number {
    return `data:${mimeType};base64,`.length + base64Length(byteLength);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 without Buffer, so the same code runs in a worker or a browser. */
export function toBase64(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] as number;
        const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : undefined;
        const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : undefined;
        out += B64[a >> 2];
        out += B64[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
        out += b === undefined ? '=' : B64[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
        out += c === undefined ? '=' : B64[c & 0x3f];
    }
    return out;
}

export function fromBase64(text: string): Uint8Array {
    const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let position = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const a = B64.indexOf(clean[i] as string);
        const b = B64.indexOf(clean[i + 1] ?? 'A');
        const c = B64.indexOf(clean[i + 2] ?? 'A');
        const d = B64.indexOf(clean[i + 3] ?? 'A');
        if (position < out.length) out[position++] = (a << 2) | (b >> 4);
        if (position < out.length) out[position++] = ((b & 0x0f) << 4) | (c >> 2);
        if (position < out.length) out[position++] = ((c & 0x03) << 6) | d;
    }
    return out;
}

export function toDataUri(bytes: Uint8Array, mimeType: string): string {
    return `data:${mimeType};base64,${toBase64(bytes)}`;
}

export interface ParsedDataUri {
    mimeType: string;
    bytes: Uint8Array;
}

/** Parse a base64 `data:` URI. Percent-encoded ones return null. */
export function parseDataUri(uri: string): ParsedDataUri | null {
    const match = uri.match(/^data:([^;,]*)(;charset=[^;,]*)?;base64,([\s\S]*)$/i);
    if (!match) return null;
    return { mimeType: match[1] || 'application/octet-stream', bytes: fromBase64(match[3] ?? '') };
}

export type ImageContent = 'photo' | 'illustration' | 'screenshot';

export interface EncodeEstimateInput {
    width: number;
    height: number;
    format: ImageFormat;
    /** 1-100. Ignored by the lossless formats. Default 82. */
    quality?: number;
    /** Default `photo`. Flat colour compresses several times better. */
    content?: ImageContent;
    /** Whether an alpha channel is carried. Costs roughly 15% where supported. */
    alpha?: boolean;
}

export interface EncodeEstimate {
    bytes: number;
    bitsPerPixel: number;
    /**
     * Relative error to expect, as a fraction. 0 means the figure is exact
     * because the format is uncompressed and the arithmetic is arithmetic.
     */
    uncertainty: number;
}

/**
 * Roughly how large this image will be once encoded.
 *
 * Be clear-eyed about what this is: a planning figure. Real output depends on
 * the picture — noise, gradients, how much flat colour there is — and no
 * formula sees the picture. It is right for "will a page of forty of these be
 * two megabytes or twenty", and wrong for anything that needs the actual
 * number, which you get by encoding.
 *
 * The lossy curve is fitted to JPEG output on photographic content, with the
 * other codecs expressed as their usual ratio against it. BMP and TIFF are
 * computed rather than estimated, and report zero uncertainty.
 */
export function estimateEncodedSize(input: EncodeEstimateInput): EncodeEstimate {
    const { width, height, format, quality = 82, content = 'photo', alpha = false } = input;
    if (!(width > 0) || !(height > 0)) throw new RangeError('estimateEncodedSize needs positive dimensions');
    const pixels = width * height;

    if (format === 'svg') {
        throw new RangeError('SVG size depends on the drawing, not the pixel dimensions');
    }

    // Uncompressed: header plus one row-aligned block per pixel. Exact.
    if (format === 'bmp' || format === 'tiff') {
        const channels = alpha ? 4 : 3;
        const rowBytes = Math.ceil((width * channels * 8) / 32) * 4;
        const bytes = rowBytes * height + (format === 'bmp' ? 54 : 8);
        return { bytes, bitsPerPixel: (bytes * 8) / pixels, uncertainty: 0 };
    }

    const bitsPerPixel = estimateBitsPerPixel(format, quality, content, alpha);
    const bytes = Math.round((bitsPerPixel * pixels) / 8) + headerOverhead(format);
    return { bytes, bitsPerPixel, uncertainty: isLossyFormat(format) ? 0.4 : 0.5 };
}

function isLossyFormat(format: ImageFormat): boolean {
    return format === 'jpeg' || format === 'webp' || format === 'avif' || format === 'heic';
}

function headerOverhead(format: ImageFormat): number {
    if (format === 'jpeg') return 600; // quantisation and Huffman tables
    if (format === 'png') return 100;
    if (format === 'avif' || format === 'heic') return 400; // the MP4 box tree
    return 50;
}

/**
 * Bits per pixel for a format at a quality. Exposed because it is the number
 * worth reasoning about when comparing codecs — the byte count is just this
 * times the pixel count.
 */
export function estimateBitsPerPixel(
    format: ImageFormat,
    quality = 82,
    content: ImageContent = 'photo',
    alpha = false,
): number {
    const clampedQuality = Math.min(100, Math.max(1, quality));
    const contentFactor = content === 'illustration' ? 0.35 : content === 'screenshot' ? 0.6 : 1;

    if (isLossyFormat(format)) {
        // Fitted to JPEG on photographic content: near-exponential up to
        // quality 90, then the steep climb as the quantiser approaches 1.
        let jpeg = 0.25 * Math.exp(0.0225 * Math.min(clampedQuality, 90));
        if (clampedQuality > 90) jpeg *= 1 + (clampedQuality - 90) * 0.25;
        const ratio = format === 'webp' ? 0.7 : format === 'avif' ? 0.5 : format === 'heic' ? 0.55 : 1;
        const alphaFactor = alpha && format !== 'jpeg' ? 1.15 : 1;
        return jpeg * ratio * contentFactor * alphaFactor;
    }

    // Lossless formats: quality is irrelevant, the picture is everything.
    const losslessBase = content === 'illustration' ? 1.4 : content === 'screenshot' ? 3 : 10;
    const alphaFactor = alpha ? 1.15 : 1;
    if (format === 'png') return losslessBase * alphaFactor;
    if (format === 'qoi') return losslessBase * 1.1 * alphaFactor;
    if (format === 'gif') return Math.min(losslessBase, 8) * 0.75; // 256 colours caps it
    if (format === 'ico' || format === 'cur') return 32;
    return losslessBase * alphaFactor;
}
