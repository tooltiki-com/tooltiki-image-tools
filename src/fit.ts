/**
 * Resize arithmetic: what comes out when an image of one size is asked to
 * fill, fit inside, or be cropped to another.
 *
 * This is the part of an image pipeline most likely to be re-derived badly in
 * three different files, so it lives here once with the edge cases named: a
 * target with only one side given, a target bigger than the source, and the
 * difference between the canvas you end up with and the pixels drawn on it.
 */
import type { Size } from './types.js';

/**
 * The five ways a source can meet a target. Names and behaviour match sharp's
 * `fit` option so the two can be used together without translation.
 *
 * - `cover`   canvas is exactly the target; the image is scaled up until it
 *             covers the canvas and the overflow is cropped.
 * - `contain` canvas is exactly the target; the image is scaled to sit inside
 *             it and the remainder is padding.
 * - `fill`    canvas is exactly the target; the aspect ratio is ignored.
 * - `inside`  canvas is the image, scaled to be no larger than the target.
 * - `outside` canvas is the image, scaled to be no smaller than the target.
 */
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type Rounding = 'round' | 'floor' | 'ceil' | 'none';

export interface FitOptions {
    /**
     * Default `inside`, which is the common Node case: "make this image no
     * bigger than N". Note that sharp defaults the same option to `cover` —
     * pass it explicitly if you are matching a sharp pipeline.
     */
    fit?: FitMode;
    /** Never scale up. A source smaller than the target is left alone. */
    withoutEnlargement?: boolean;
    /** Never scale down. The mirror of the above, for thumbnails you must fill. */
    withoutReduction?: boolean;
    /** Default `round`. `none` keeps fractional pixels for further maths. */
    rounding?: Rounding;
}

export interface FitResult extends Size {
    /** The uniform scale applied to the source. `fill` reports the mean of the two axes. */
    scale: number;
    scaleX: number;
    scaleY: number;
    /** The source as drawn, which differs from the canvas for `cover` and `contain`. */
    rendered: Size;
    /** True when part of the source falls outside the canvas. */
    cropped: boolean;
    /** True when part of the canvas is not covered by the source. */
    padded: boolean;
}

export interface CropBox extends Size {
    x: number;
    y: number;
}

/** Where a crop or a letterboxed image sits when it does not fill its box. */
export type Position =
    | 'centre'
    | 'center'
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'top left'
    | 'top right'
    | 'bottom left'
    | 'bottom right';

/** A point of interest in the source, each axis 0 (start) to 1 (end). */
export interface FocalPoint {
    x: number;
    y: number;
}

function round(value: number, mode: Rounding): number {
    if (mode === 'none') return value;
    const rounded = mode === 'floor' ? Math.floor(value) : mode === 'ceil' ? Math.ceil(value) : Math.round(value);
    return Math.max(1, rounded);
}

function assertSize(size: Size, label: string): void {
    if (
        !Number.isFinite(size.width) ||
        !Number.isFinite(size.height) ||
        size.width <= 0 ||
        size.height <= 0
    ) {
        throw new RangeError(`${label} must have a positive, finite width and height`);
    }
}

/**
 * The size an image comes out at.
 *
 * The target may give one side only, in which case the other follows from the
 * aspect ratio and the fit mode is irrelevant — this is the "1200 wide, height
 * auto" case that every resize UI offers.
 */
export function fit(source: Size, target: Partial<Size>, options: FitOptions = {}): FitResult {
    assertSize(source, 'source');
    const { fit: mode = 'inside', withoutEnlargement = false, withoutReduction = false, rounding = 'round' } = options;

    const targetWidth = target.width && target.width > 0 ? target.width : 0;
    const targetHeight = target.height && target.height > 0 ? target.height : 0;

    // Nothing asked for: the source, unchanged.
    if (!targetWidth && !targetHeight) {
        return result(source, source, 1, 1, rounding, false, false);
    }

    let scaleX: number;
    let scaleY: number;

    if (!targetHeight) {
        scaleX = scaleY = targetWidth / source.width;
    } else if (!targetWidth) {
        scaleX = scaleY = targetHeight / source.height;
    } else if (mode === 'fill') {
        scaleX = targetWidth / source.width;
        scaleY = targetHeight / source.height;
    } else {
        const byWidth = targetWidth / source.width;
        const byHeight = targetHeight / source.height;
        const uniform = mode === 'cover' || mode === 'outside' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight);
        scaleX = scaleY = uniform;
    }

    if (withoutEnlargement) {
        scaleX = Math.min(scaleX, 1);
        scaleY = Math.min(scaleY, 1);
    }
    if (withoutReduction) {
        scaleX = Math.max(scaleX, 1);
        scaleY = Math.max(scaleY, 1);
    }

    const rendered: Size = { width: source.width * scaleX, height: source.height * scaleY };
    const canvas = canvasFor(mode, rendered, targetWidth, targetHeight);

    const cropped = canvas.width < rendered.width - 1e-9 || canvas.height < rendered.height - 1e-9;
    const padded = canvas.width > rendered.width + 1e-9 || canvas.height > rendered.height + 1e-9;

    return result(canvas, rendered, scaleX, scaleY, rounding, cropped, padded);
}

/**
 * The canvas each mode produces, given the image as actually scaled.
 *
 * Only `contain` and `cover` can differ from the rendered image, and only
 * `cover` has to give ground: `withoutEnlargement` can leave the image smaller
 * than the target on an axis, and a canvas larger than the image would mean
 * padding, which is the one thing `cover` promises not to do. So it shrinks to
 * the largest box of the requested shape that the image does cover.
 */
function canvasFor(mode: FitMode, rendered: Size, targetWidth: number, targetHeight: number): Size {
    if (!targetWidth || !targetHeight) return rendered;
    if (mode === 'inside' || mode === 'outside' || mode === 'fill') return rendered;
    if (mode === 'contain') return { width: targetWidth, height: targetHeight };
    if (rendered.width >= targetWidth - 1e-9 && rendered.height >= targetHeight - 1e-9) {
        return { width: targetWidth, height: targetHeight };
    }
    const shrink = Math.min(rendered.width / targetWidth, rendered.height / targetHeight);
    return { width: targetWidth * shrink, height: targetHeight * shrink };
}

function result(
    canvas: Size,
    rendered: Size,
    scaleX: number,
    scaleY: number,
    rounding: Rounding,
    cropped: boolean,
    padded: boolean,
): FitResult {
    return {
        width: round(canvas.width, rounding),
        height: round(canvas.height, rounding),
        scale: scaleX === scaleY ? scaleX : (scaleX + scaleY) / 2,
        scaleX,
        scaleY,
        rendered: { width: round(rendered.width, rounding), height: round(rendered.height, rounding) },
        cropped,
        padded,
    };
}

export interface CropOptions {
    /** Default `centre`. Ignored when `focal` is given. */
    position?: Position;
    /** Overrides `position`. The crop is centred here and then pushed back inside the source. */
    focal?: FocalPoint;
    rounding?: Rounding;
}

/**
 * The rectangle of the source that a `cover` resize keeps.
 *
 * Crops from the centre by default, which is the safe choice and the wrong one
 * often enough that `position` and `focal` exist. Hand the result straight to
 * sharp's `extract`, or to a canvas `drawImage` as the source rectangle.
 */
export function cropBox(source: Size, target: Size, options: CropOptions = {}): CropBox {
    assertSize(source, 'source');
    assertSize(target, 'target');
    const { position = 'centre', focal, rounding = 'round' } = options;

    const sourceRatio = source.width / source.height;
    const targetRatio = target.width / target.height;

    // Keep the full extent of the tighter axis and trim the other.
    let width = source.width;
    let height = source.height;
    if (sourceRatio > targetRatio) {
        width = source.height * targetRatio;
    } else if (sourceRatio < targetRatio) {
        height = source.width / targetRatio;
    }

    const spareX = source.width - width;
    const spareY = source.height - height;

    let x: number;
    let y: number;
    if (focal) {
        x = clamp(source.width * clamp01(focal.x) - width / 2, 0, spareX);
        y = clamp(source.height * clamp01(focal.y) - height / 2, 0, spareY);
    } else {
        x = spareX * horizontalBias(position);
        y = spareY * verticalBias(position);
    }

    if (rounding === 'none') return { x, y, width, height };
    return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
}

/**
 * Where a `contain` resize places the image on its padded canvas. The offsets
 * are the letterbox bars: equal on both sides for a centred image.
 */
export function containBox(source: Size, target: Size, options: CropOptions = {}): CropBox {
    assertSize(source, 'source');
    assertSize(target, 'target');
    const { position = 'centre', rounding = 'round' } = options;
    const scale = Math.min(target.width / source.width, target.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    const x = (target.width - width) * horizontalBias(position);
    const y = (target.height - height) * verticalBias(position);
    if (rounding === 'none') return { x, y, width, height };
    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
}

function horizontalBias(position: Position): number {
    if (position === 'left' || position === 'top left' || position === 'bottom left') return 0;
    if (position === 'right' || position === 'top right' || position === 'bottom right') return 1;
    return 0.5;
}

function verticalBias(position: Position): number {
    if (position === 'top' || position === 'top left' || position === 'top right') return 0;
    if (position === 'bottom' || position === 'bottom left' || position === 'bottom right') return 1;
    return 0.5;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

/** Multiply both sides. `scaleSize({width: 800, height: 600}, 0.5)` is 400x300. */
export function scaleSize(size: Size, factor: number, rounding: Rounding = 'round'): Size {
    assertSize(size, 'size');
    if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('factor must be positive and finite');
    return { width: round(size.width * factor, rounding), height: round(size.height * factor, rounding) };
}

/**
 * Cap an image at a bounding box without ever enlarging it — the single most
 * common resize there is, and `fit(source, box, { fit: 'inside',
 * withoutEnlargement: true })` spelled out.
 */
export function clampSize(size: Size, max: Partial<Size>, rounding: Rounding = 'round'): Size {
    const fitted = fit(size, max, { fit: 'inside', withoutEnlargement: true, rounding });
    return { width: fitted.width, height: fitted.height };
}

/** Total pixels. Handy for spotting the decode bomb before you decode it. */
export function pixelCount(size: Size): number {
    return size.width * size.height;
}

/**
 * Bytes an image occupies once decoded into memory, which is the number that
 * matters for a worker's memory limit — a 12 MP JPEG is 3 MB on disk and about
 * 48 MB decoded.
 */
export function decodedByteSize(size: Size, channels = 4): number {
    return size.width * size.height * channels;
}
