/**
 * Pixels and physical size.
 *
 * DPI is not a property of an image file. An image is a grid of pixels; the
 * dots per inch only exist once you decide how big to print it. A file that
 * says "300 dpi" in its header is stating an intention, and resaving it at 72
 * changes nothing about the picture. Everything here treats resolution as the
 * relationship between a pixel count and a physical size, which is what it is.
 */
import { ratioValue, type RatioInput } from './aspect.js';
import type { Size } from './types.js';

export type LengthUnit = 'in' | 'cm' | 'mm' | 'pt';

export interface PhysicalSize {
    width: number;
    height: number;
    unit: LengthUnit;
}

/** How many of each unit make an inch. */
const PER_INCH: Readonly<Record<LengthUnit, number>> = Object.freeze({ in: 1, cm: 2.54, mm: 25.4, pt: 72 });

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
    if (from === to) return value;
    return (value / PER_INCH[from]) * PER_INCH[to];
}

/** How large this many pixels come out when printed at a given resolution. */
export function printSize(pixels: Size, dpi: number, unit: LengthUnit = 'in'): PhysicalSize {
    if (!(dpi > 0)) throw new RangeError('dpi must be positive');
    return {
        width: (pixels.width / dpi) * PER_INCH[unit],
        height: (pixels.height / dpi) * PER_INCH[unit],
        unit,
    };
}

/** How many pixels you need to print at this size and resolution. */
export function pixelsForPrint(physical: PhysicalSize, dpi: number): Size {
    if (!(dpi > 0)) throw new RangeError('dpi must be positive');
    return {
        width: Math.ceil((physical.width / PER_INCH[physical.unit]) * dpi),
        height: Math.ceil((physical.height / PER_INCH[physical.unit]) * dpi),
    };
}

/** The resolution you actually get printing these pixels at this size. */
export function effectiveDpi(pixels: Size, physical: PhysicalSize): { x: number; y: number } {
    const widthInches = physical.width / PER_INCH[physical.unit];
    const heightInches = physical.height / PER_INCH[physical.unit];
    if (!(widthInches > 0) || !(heightInches > 0)) throw new RangeError('Physical size must be positive');
    return { x: pixels.width / widthInches, y: pixels.height / heightInches };
}

export type PrintQuality = 'too low' | 'draft' | 'good' | 'excellent';

/**
 * The trade press thresholds, which are rules of thumb and not physics: 300
 * dpi is the commercial print standard, 240 is fine for a photo print, 150
 * reads as soft in the hand but is perfectly good on a poster nobody stands
 * close to. Judge a billboard by a different rule entirely.
 */
export function printQuality(dpi: number): PrintQuality {
    if (dpi >= 300) return 'excellent';
    if (dpi >= 240) return 'good';
    if (dpi >= 150) return 'draft';
    return 'too low';
}

/** The largest print that still hits `dpi`. The "how big can I go" question. */
export function largestPrintAt(pixels: Size, dpi: number, unit: LengthUnit = 'in'): PhysicalSize {
    return printSize(pixels, dpi, unit);
}

export interface Paper {
    id: string;
    label: string;
    /** Portrait orientation, in millimetres. */
    width: number;
    height: number;
}

/** ISO 216 A-series, the North American sizes, and the common photo prints. */
export const PAPER_SIZES: readonly Paper[] = Object.freeze([
    { id: 'a0', label: 'A0', width: 841, height: 1189 },
    { id: 'a1', label: 'A1', width: 594, height: 841 },
    { id: 'a2', label: 'A2', width: 420, height: 594 },
    { id: 'a3', label: 'A3', width: 297, height: 420 },
    { id: 'a4', label: 'A4', width: 210, height: 297 },
    { id: 'a5', label: 'A5', width: 148, height: 210 },
    { id: 'a6', label: 'A6', width: 105, height: 148 },
    { id: 'letter', label: 'US Letter', width: 215.9, height: 279.4 },
    { id: 'legal', label: 'US Legal', width: 215.9, height: 355.6 },
    { id: 'tabloid', label: 'Tabloid', width: 279.4, height: 431.8 },
    { id: 'photo-4x6', label: 'Photo 4x6 in', width: 101.6, height: 152.4 },
    { id: 'photo-5x7', label: 'Photo 5x7 in', width: 127, height: 177.8 },
    { id: 'photo-8x10', label: 'Photo 8x10 in', width: 203.2, height: 254 },
] as const);

/** Look a paper size up by id, in whatever unit you are working in. */
export function paperSize(id: string, unit: LengthUnit = 'mm'): PhysicalSize | null {
    const paper = PAPER_SIZES.find((candidate) => candidate.id === id.toLowerCase());
    if (!paper) return null;
    return {
        width: convertLength(paper.width, 'mm', unit),
        height: convertLength(paper.height, 'mm', unit),
        unit,
    };
}

export interface PaperFitResult {
    /** The resolution the image lands at once scaled to fill the sheet. */
    dpi: number;
    quality: PrintQuality;
    /** True at or above the resolution asked for. */
    meetsTarget: boolean;
    /** The sheet, rotated to match the image where that helps. */
    paper: PhysicalSize;
    landscape: boolean;
}

export interface PaperFitOptions {
    /** The resolution you want to hit. Default 300. */
    targetDpi?: number;
    /** Margin on every edge, in the paper's own unit. Default 0. */
    margin?: number;
    /** Rotate the sheet to match the image's orientation. Default true. */
    autoRotate?: boolean;
}

/**
 * Whether an image has the pixels to print on a given sheet, and at what
 * resolution it lands. Scales the image to fill the printable area without
 * distorting it, which is what a print dialog does.
 */
export function fitsPaper(pixels: Size, paperId: string, options: PaperFitOptions = {}): PaperFitResult | null {
    const { targetDpi = 300, margin = 0, autoRotate = true } = options;
    const sheet = paperSize(paperId, 'mm');
    if (!sheet) return null;

    const imageIsLandscape = pixels.width > pixels.height;
    const landscape = autoRotate && imageIsLandscape;
    const paper: PhysicalSize = landscape
        ? { width: sheet.height, height: sheet.width, unit: 'mm' }
        : { width: sheet.width, height: sheet.height, unit: 'mm' };

    // Clamping a margin that swallows the sheet to 1mm would report a printable
    // area that does not exist, and the resolution over it comes out in the
    // tens of thousands of dpi and reads as "excellent". There is no print here
    // to assess.
    const printableWidth = paper.width - margin * 2;
    const printableHeight = paper.height - margin * 2;
    if (printableWidth <= 0 || printableHeight <= 0) return null;

    const printable: PhysicalSize = { width: printableWidth, height: printableHeight, unit: 'mm' };

    // Filling the sheet without distortion means the tighter axis decides.
    const density = effectiveDpi(pixels, printable);
    const dpi = Math.min(density.x, density.y);

    return { dpi, quality: printQuality(dpi), meetsTarget: dpi >= targetDpi, paper, landscape };
}

/**
 * Pixels per inch of a screen, from its diagonal and its resolution. The
 * number behind "is this a retina display" — anything over about 220 ppi is
 * past what most people resolve at a laptop's viewing distance.
 */
export function screenPpi(diagonalInches: number, resolution: Size): number {
    if (!(diagonalInches > 0)) throw new RangeError('Diagonal must be positive');
    const diagonalPixels = Math.hypot(resolution.width, resolution.height);
    return diagonalPixels / diagonalInches;
}

/**
 * The physical width and height of a screen, from its diagonal and its shape.
 * A 27-inch 16:9 monitor is 23.5 by 13.2 inches; the diagonal on its own tells
 * you surprisingly little, which is why a 16:10 panel of the same diagonal is
 * noticeably taller.
 */
export function screenDimensions(diagonalInches: number, ratio: RatioInput, unit: LengthUnit = 'in'): PhysicalSize {
    if (!(diagonalInches > 0)) throw new RangeError('Diagonal must be positive');
    const shape = ratioValue(ratio);
    const height = diagonalInches / Math.hypot(shape, 1);
    const width = height * shape;
    return {
        width: convertLength(width, 'in', unit),
        height: convertLength(height, 'in', unit),
        unit,
    };
}

/** Screen area in square inches, or the given unit squared. */
export function screenArea(diagonalInches: number, ratio: RatioInput, unit: LengthUnit = 'in'): number {
    const dimensions = screenDimensions(diagonalInches, ratio, unit);
    return dimensions.width * dimensions.height;
}
