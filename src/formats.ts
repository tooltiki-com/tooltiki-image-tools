/**
 * What each format can and cannot do.
 *
 * Most "which format should I use" arguments come down to four facts: can it
 * hold transparency, can it animate, does it throw pixels away, and will the
 * thing opening it understand it. Those are here as data rather than prose so
 * you can branch on them.
 */
import type { ImageFormat } from './types.js';

export interface FormatInfo {
    id: ImageFormat;
    /** Human label, in the casing the format's own spec uses. */
    label: string;
    mimeType: string;
    /** Every extension seen in the wild. The first is the one to write. */
    extensions: readonly string[];
    /** Can carry transparency at all. See `notes` for the caveats. */
    alpha: boolean;
    animation: boolean;
    compression: 'lossy' | 'lossless' | 'both' | 'none';
    vector: boolean;
    /**
     * The year this format could be relied on in every then-current major
     * browser, or `null` if that has never been true. Useful for deciding
     * whether a `<picture>` fallback is still worth writing.
     */
    universalIn: number | null;
    notes?: string;
}

/** When the browser-support years above were last checked against caniuse. */
export const FORMAT_SUPPORT_LAST_REVIEWED = '2026-08-24';

export const IMAGE_FORMATS: Readonly<Record<ImageFormat, FormatInfo>> = Object.freeze({
    png: {
        id: 'png',
        label: 'PNG',
        mimeType: 'image/png',
        extensions: ['png'],
        alpha: true,
        animation: true,
        compression: 'lossless',
        vector: false,
        universalIn: 1996,
        notes: 'Animation is APNG, which every current browser plays but most desktop software ignores.',
    },
    jpeg: {
        id: 'jpeg',
        label: 'JPEG',
        mimeType: 'image/jpeg',
        extensions: ['jpg', 'jpeg', 'jpe', 'jfif'],
        alpha: false,
        animation: false,
        compression: 'lossy',
        vector: false,
        universalIn: 1992,
        notes: 'No alpha channel at all. Transparency has to be flattened onto a colour before encoding.',
    },
    gif: {
        id: 'gif',
        label: 'GIF',
        mimeType: 'image/gif',
        extensions: ['gif'],
        alpha: true,
        animation: true,
        compression: 'lossless',
        vector: false,
        universalIn: 1987,
        notes: 'Transparency is one fully transparent palette entry, not an alpha channel, so edges cannot fade. Limited to 256 colours per frame.',
    },
    webp: {
        id: 'webp',
        label: 'WebP',
        mimeType: 'image/webp',
        extensions: ['webp'],
        alpha: true,
        animation: true,
        compression: 'both',
        vector: false,
        universalIn: 2020,
        notes: 'Lossy WebP still carries a full 8-bit alpha channel, which is the reason to prefer it over JPEG for anything transparent.',
    },
    avif: {
        id: 'avif',
        label: 'AVIF',
        mimeType: 'image/avif',
        extensions: ['avif', 'avifs'],
        alpha: true,
        animation: true,
        compression: 'both',
        vector: false,
        universalIn: 2024,
        notes: 'Best compression of the web formats, and the slowest to encode. Wide-gamut and HDR capable.',
    },
    heic: {
        id: 'heic',
        label: 'HEIC',
        mimeType: 'image/heic',
        extensions: ['heic', 'heif', 'hif'],
        alpha: true,
        animation: true,
        compression: 'both',
        vector: false,
        universalIn: null,
        notes: 'What an iPhone saves by default. No browser accepts it in an <img> outside Apple platforms, so it is a format to convert away from, not to.',
    },
    bmp: {
        id: 'bmp',
        label: 'BMP',
        mimeType: 'image/bmp',
        extensions: ['bmp', 'dib'],
        alpha: true,
        animation: false,
        compression: 'none',
        vector: false,
        universalIn: 1996,
        notes: 'Effectively uncompressed. Alpha only in the 32-bit variants, and plenty of decoders ignore it.',
    },
    ico: {
        id: 'ico',
        label: 'ICO',
        mimeType: 'image/x-icon',
        extensions: ['ico'],
        alpha: true,
        animation: false,
        compression: 'none',
        vector: false,
        universalIn: 1999,
        notes: 'A container holding several sizes of the same icon. Modern entries are usually PNG-encoded inside it.',
    },
    cur: {
        id: 'cur',
        label: 'CUR',
        mimeType: 'image/x-icon',
        extensions: ['cur'],
        alpha: true,
        animation: false,
        compression: 'none',
        vector: false,
        universalIn: null,
        notes: 'An ICO with a hotspot. Windows cursors only.',
    },
    tiff: {
        id: 'tiff',
        label: 'TIFF',
        mimeType: 'image/tiff',
        extensions: ['tif', 'tiff'],
        alpha: true,
        animation: false,
        compression: 'both',
        vector: false,
        universalIn: null,
        notes: 'The print and scanning interchange format. Safari renders it; nothing else does.',
    },
    svg: {
        id: 'svg',
        label: 'SVG',
        mimeType: 'image/svg+xml',
        extensions: ['svg'],
        alpha: true,
        animation: true,
        compression: 'none',
        vector: true,
        universalIn: 2011,
        notes: 'Resolution-independent, so its width and height are a default size rather than a pixel count.',
    },
    qoi: {
        id: 'qoi',
        label: 'QOI',
        mimeType: 'image/qoi',
        extensions: ['qoi'],
        alpha: true,
        animation: false,
        compression: 'lossless',
        vector: false,
        universalIn: null,
        notes: 'Lossless, roughly PNG-sized, and encodes an order of magnitude faster. A pipeline format, not a delivery one.',
    },
});

/** Every format id, in a stable order. */
export const IMAGE_FORMAT_IDS = Object.freeze(Object.keys(IMAGE_FORMATS) as ImageFormat[]);

export function formatInfo(format: ImageFormat): FormatInfo {
    return IMAGE_FORMATS[format];
}

/** Canonical MIME type. `image/jpeg` for jpeg, never `image/jpg`. */
export function mimeTypeFor(format: ImageFormat): string {
    return IMAGE_FORMATS[format].mimeType;
}

/** The extension to write, without a dot. */
export function extensionFor(format: ImageFormat): string {
    return IMAGE_FORMATS[format].extensions[0] as string;
}

const MIME_ALIASES: Readonly<Record<string, ImageFormat>> = Object.freeze({
    'image/jpg': 'jpeg',
    'image/pjpeg': 'jpeg',
    'image/x-png': 'png',
    'image/vnd.microsoft.icon': 'ico',
    'image/icon': 'ico',
    'image/heif': 'heic',
    'image/heic-sequence': 'heic',
    'image/heif-sequence': 'heic',
    'image/avif-sequence': 'avif',
    'image/x-ms-bmp': 'bmp',
    'image/x-tiff': 'tiff',
});

/** Resolve a MIME type, tolerating the wrong-but-common spellings. */
export function formatFromMime(mimeType: string): ImageFormat | null {
    const clean = mimeType.trim().toLowerCase().split(';')[0]?.trim();
    if (!clean) return null;
    for (const id of IMAGE_FORMAT_IDS) {
        if (IMAGE_FORMATS[id].mimeType === clean) return id;
    }
    return MIME_ALIASES[clean] ?? null;
}

/** Resolve a filename or a bare extension. Case and leading dot are ignored. */
export function formatFromExtension(nameOrExtension: string): ImageFormat | null {
    const tail = nameOrExtension.trim().toLowerCase().split(/[?#]/)[0] ?? '';
    const extension = (tail.includes('.') ? (tail.split('.').pop() as string) : tail).replace(/^\./, '');
    if (!extension) return null;
    for (const id of IMAGE_FORMAT_IDS) {
        if (IMAGE_FORMATS[id].extensions.includes(extension)) return id;
    }
    return null;
}

export function supportsAlpha(format: ImageFormat): boolean {
    return IMAGE_FORMATS[format].alpha;
}

export function supportsAnimation(format: ImageFormat): boolean {
    return IMAGE_FORMATS[format].animation;
}

export function isLossy(format: ImageFormat): boolean {
    const { compression } = IMAGE_FORMATS[format];
    return compression === 'lossy' || compression === 'both';
}

/**
 * Swap a filename's extension for another format's.
 * `replaceExtension('holiday.HEIC', 'jpeg')` gives `holiday.jpg`.
 * A name with no extension gets one appended rather than being mangled.
 */
export function replaceExtension(filename: string, format: ImageFormat | string): string {
    const extension = (IMAGE_FORMATS as Record<string, FormatInfo | undefined>)[format]?.extensions[0] ?? String(format).replace(/^\./, '');
    const stem = filename.replace(/\.[^./\\]+$/, '');
    return `${stem}.${extension}`;
}

/**
 * Formats that can hold everything `from` holds. Use it to warn before a
 * conversion quietly drops something: PNG to JPEG loses transparency, and
 * animated WebP to PNG loses every frame but the first.
 */
export function losesDataConvertingTo(from: ImageFormat, to: ImageFormat): string[] {
    const source = IMAGE_FORMATS[from];
    const target = IMAGE_FORMATS[to];
    const losses: string[] = [];
    if (source.alpha && !target.alpha) losses.push('transparency');
    if (source.animation && !target.animation) losses.push('animation');
    if (!isLossy(from) && isLossy(to)) losses.push('exact pixel values');
    if (source.vector && !target.vector) losses.push('resolution independence');
    return losses;
}
