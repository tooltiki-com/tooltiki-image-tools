/**
 * EXIF, as far as sizing is concerned: orientation and declared resolution.
 *
 * Orientation is the one piece of metadata that changes an image's dimensions
 * without changing a pixel. A portrait photo from a phone is very often a
 * landscape JPEG with a flag saying "turn me". Read the header naively and
 * every thumbnail you generate is on its side.
 *
 * This is not a general EXIF library — there is no camera model, no GPS, no
 * MakerNotes. It reads the TIFF directory far enough to answer sizing
 * questions and stops.
 */
import { ImageParseError, ascii, startsWithAscii, toBytes, u16be, u16le, u32be, u32le, u8 } from './bits.js';
import { walkJpegSegments } from './jpeg.js';
import type { BinaryInput, Density, Orientation, Size } from './types.js';

export const TIFF_TAG = Object.freeze({
    imageWidth: 0x0100,
    imageHeight: 0x0101,
    bitsPerSample: 0x0102,
    orientation: 0x0112,
    xResolution: 0x011a,
    yResolution: 0x011b,
    resolutionUnit: 0x0128,
    exifIfdPointer: 0x8769,
    pixelXDimension: 0xa002,
    pixelYDimension: 0xa003,
});

/** Byte width of each TIFF field type, indexed by the type code. 0 means unknown. */
const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

export interface TiffField {
    tag: number;
    type: number;
    count: number;
    /** Rationals are already divided out. Undecodable types come back empty. */
    values: number[];
}

export type TiffDirectory = Map<number, TiffField>;

export interface ExifData {
    littleEndian: boolean;
    ifd0: TiffDirectory;
    exif: TiffDirectory | null;
}

/**
 * Read one IFD at `ifdOffset`, relative to the start of the TIFF header.
 *
 * Offsets inside a TIFF are all relative to that header rather than to the
 * file, which is why `tiffStart` has to be threaded through: in a JPEG the
 * header sits six bytes into an APP1 segment, not at zero.
 */
export function readTiffDirectory(
    bytes: Uint8Array,
    tiffStart: number,
    ifdOffset: number,
    littleEndian: boolean,
): TiffDirectory {
    const short = (at: number) => (littleEndian ? u16le(bytes, at) : u16be(bytes, at));
    const long = (at: number) => (littleEndian ? u32le(bytes, at) : u32be(bytes, at));

    const base = tiffStart + ifdOffset;
    const count = short(base);
    // A directory of 4096 entries is a malformed or hostile file, not a photo.
    if (count > 4096) throw new ImageParseError(`Implausible TIFF directory: ${count} entries`);

    const directory: TiffDirectory = new Map();
    for (let i = 0; i < count; i++) {
        const entry = base + 2 + i * 12;
        const tag = short(entry);
        const type = short(entry + 2);
        const valueCount = long(entry + 4);
        const unit = TYPE_SIZES[type] ?? 0;
        if (!unit || valueCount === 0 || valueCount > 0xffff) {
            directory.set(tag, { tag, type, count: valueCount, values: [] });
            continue;
        }
        const total = unit * valueCount;
        const valueAt = total <= 4 ? entry + 8 : tiffStart + long(entry + 8);
        const values: number[] = [];
        try {
            for (let v = 0; v < valueCount && v < 64; v++) {
                const at = valueAt + v * unit;
                switch (type) {
                    case 1:
                    case 7:
                        values.push(u8(bytes, at));
                        break;
                    case 3:
                        values.push(short(at));
                        break;
                    case 4:
                        values.push(long(at));
                        break;
                    case 9: {
                        const raw = long(at);
                        values.push(raw > 0x7fffffff ? raw - 0x100000000 : raw);
                        break;
                    }
                    case 5:
                    case 10: {
                        const numerator = long(at);
                        const denominator = long(at + 4);
                        values.push(denominator === 0 ? 0 : numerator / denominator);
                        break;
                    }
                    default:
                        break;
                }
            }
        } catch {
            // A field pointing outside the file tells us nothing; the rest of
            // the directory may still be sound, so keep the tag and move on.
        }
        directory.set(tag, { tag, type, count: valueCount, values });
    }
    return directory;
}

/** Parse a TIFF header and its first directory, plus the EXIF sub-directory. */
export function parseTiff(bytes: Uint8Array, tiffStart = 0): ExifData | null {
    let littleEndian: boolean;
    try {
        const order = ascii(bytes, tiffStart, 2);
        if (order === 'II') littleEndian = true;
        else if (order === 'MM') littleEndian = false;
        else return null;
        const magic = littleEndian ? u16le(bytes, tiffStart + 2) : u16be(bytes, tiffStart + 2);
        if (magic !== 42) return null;
        const firstIfd = littleEndian ? u32le(bytes, tiffStart + 4) : u32be(bytes, tiffStart + 4);
        const ifd0 = readTiffDirectory(bytes, tiffStart, firstIfd, littleEndian);
        const pointer = ifd0.get(TIFF_TAG.exifIfdPointer)?.values[0];
        let exif: TiffDirectory | null = null;
        if (typeof pointer === 'number' && pointer > 0) {
            try {
                exif = readTiffDirectory(bytes, tiffStart, pointer, littleEndian);
            } catch {
                exif = null;
            }
        }
        return { littleEndian, ifd0, exif };
    } catch {
        return null;
    }
}

/**
 * Locate the TIFF header carrying EXIF, whatever container it arrived in.
 * Handles a bare TIFF, a JPEG APP1 segment, a PNG `eXIf` chunk and a WebP
 * `EXIF` chunk. Returns the offset of the `II`/`MM` bytes, or null.
 */
export function findExifTiffStart(bytes: Uint8Array): number | null {
    if (startsWithAscii(bytes, 'II') || startsWithAscii(bytes, 'MM')) return 0;

    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        let found: number | null = null;
        try {
            walkJpegSegments(bytes, (segment) => {
                if (segment.marker !== 0xe1) return;
                if (!startsWithAscii(bytes, 'Exif\0\0', segment.offset)) return;
                found = segment.offset + 6;
                return false;
            });
        } catch {
            return null;
        }
        return found;
    }

    if (startsWithAscii(bytes, '\x89PNG\r\n\x1a\n')) {
        return findPngChunk(bytes, 'eXIf');
    }

    if (startsWithAscii(bytes, 'RIFF') && startsWithAscii(bytes, 'WEBP', 8)) {
        return findRiffChunk(bytes, 'EXIF');
    }

    return null;
}

function findPngChunk(bytes: Uint8Array, name: string): number | null {
    let offset = 8;
    try {
        while (offset + 8 <= bytes.length) {
            const length = u32be(bytes, offset);
            const type = ascii(bytes, offset + 4, 4);
            if (type === name) return offset + 8;
            if (type === 'IDAT' || type === 'IEND') return null;
            offset += 12 + length;
        }
    } catch {
        return null;
    }
    return null;
}

function findRiffChunk(bytes: Uint8Array, name: string): number | null {
    let offset = 12;
    try {
        while (offset + 8 <= bytes.length) {
            const type = ascii(bytes, offset, 4);
            const size = u32le(bytes, offset + 4);
            if (type === name) return offset + 8;
            offset += 8 + size + (size % 2);
        }
    } catch {
        return null;
    }
    return null;
}

function isOrientation(value: number): value is Orientation {
    return Number.isInteger(value) && value >= 1 && value <= 8;
}

/** The orientation a file declares, or null if it declares none. */
export function readExifOrientation(input: BinaryInput): Orientation | null {
    const bytes = toBytes(input);
    const start = findExifTiffStart(bytes);
    if (start === null) return null;
    const exif = parseTiff(bytes, start);
    const value = exif?.ifd0.get(TIFF_TAG.orientation)?.values[0];
    return typeof value === 'number' && isOrientation(value) ? value : null;
}

/** The resolution a TIFF directory declares, or null. */
export function densityFromTiff(directory: TiffDirectory): Density | null {
    const x = directory.get(TIFF_TAG.xResolution)?.values[0];
    const y = directory.get(TIFF_TAG.yResolution)?.values[0];
    if (typeof x !== 'number' || !(x > 0)) return null;
    const unitCode = directory.get(TIFF_TAG.resolutionUnit)?.values[0] ?? 2;
    const unit = unitCode === 3 ? 'dpcm' : unitCode === 1 ? 'aspect' : 'dpi';
    return { x, y: typeof y === 'number' && y > 0 ? y : x, unit };
}

export interface OrientationTransform {
    orientation: Orientation;
    /**
     * How to display the stored pixels correctly: mirror horizontally first if
     * `flipX`, then rotate this many degrees clockwise.
     */
    rotate: 0 | 90 | 180 | 270;
    flipX: boolean;
    /** True for 5-8, where the displayed width and height are the stored ones swapped. */
    swapsAxes: boolean;
    /** Ready to drop into a style attribute. `none` for orientation 1. */
    cssTransform: string;
    /** exiftool's wording, which is the wording every other tool copied. */
    description: string;
}

const TRANSFORMS: Readonly<Record<Orientation, Omit<OrientationTransform, 'orientation'>>> = Object.freeze({
    1: { rotate: 0, flipX: false, swapsAxes: false, cssTransform: 'none', description: 'Horizontal (normal)' },
    2: { rotate: 0, flipX: true, swapsAxes: false, cssTransform: 'scaleX(-1)', description: 'Mirror horizontal' },
    3: { rotate: 180, flipX: false, swapsAxes: false, cssTransform: 'rotate(180deg)', description: 'Rotate 180' },
    4: { rotate: 180, flipX: true, swapsAxes: false, cssTransform: 'rotate(180deg) scaleX(-1)', description: 'Mirror vertical' },
    5: { rotate: 270, flipX: true, swapsAxes: true, cssTransform: 'rotate(270deg) scaleX(-1)', description: 'Mirror horizontal and rotate 270 CW' },
    6: { rotate: 90, flipX: false, swapsAxes: true, cssTransform: 'rotate(90deg)', description: 'Rotate 90 CW' },
    7: { rotate: 90, flipX: true, swapsAxes: true, cssTransform: 'rotate(90deg) scaleX(-1)', description: 'Mirror horizontal and rotate 90 CW' },
    8: { rotate: 270, flipX: false, swapsAxes: true, cssTransform: 'rotate(270deg)', description: 'Rotate 270 CW' },
});

/** What has to happen to the stored pixels to show them the right way up. */
export function orientationTransform(orientation: Orientation): OrientationTransform {
    const transform = TRANSFORMS[orientation];
    if (!transform) throw new RangeError(`EXIF orientation must be 1-8, got ${orientation}`);
    return { orientation, ...transform };
}

/**
 * The size an image is actually seen at. Orientations 5-8 swap the axes, so a
 * 4032x3024 stored frame is displayed 3024x4032.
 */
export function applyOrientation(size: Size, orientation: Orientation | null | undefined): Size {
    if (!orientation || orientation < 5 || orientation > 8) return { width: size.width, height: size.height };
    return { width: size.height, height: size.width };
}

/** True when this orientation swaps width and height. */
export function swapsAxes(orientation: Orientation | null | undefined): boolean {
    return !!orientation && orientation >= 5 && orientation <= 8;
}
