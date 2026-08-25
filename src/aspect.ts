/**
 * Aspect ratios.
 *
 * The awkward part is that a ratio is three things at once: two integers
 * people say out loud ("sixteen by nine"), a decimal you actually divide with,
 * and a name a platform enforces. Everything here converts between the three.
 */
import type { Size } from './types.js';

export interface Ratio {
    /** Reduced integer terms. 1920x1080 gives 16 and 9. */
    w: number;
    h: number;
    /** width / height. The number to compute with. */
    value: number;
    /** "16:9". */
    label: string;
}

export interface NamedRatio extends Ratio {
    name: string;
    /** Other names the same shape goes by. */
    aka: readonly string[];
}

/** Anything this module will accept where a ratio is expected. */
export type RatioInput = Ratio | Size | string | number;

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x || 1;
}

function makeRatio(w: number, h: number): Ratio {
    const divisor = gcd(w, h);
    const rw = w / divisor;
    const rh = h / divisor;
    return { w: rw, h: rh, value: w / h, label: `${rw}:${rh}` };
}

/**
 * Reduce a pixel size to its ratio. Integers reduce exactly; anything else is
 * approximated, because 1998x1080 has no tidy integer form and `999:540`
 * helps nobody.
 */
export function aspectRatio(size: Size): Ratio;
export function aspectRatio(width: number, height: number): Ratio;
export function aspectRatio(a: Size | number, b?: number): Ratio {
    const width = typeof a === 'number' ? a : a.width;
    const height = typeof a === 'number' ? (b as number) : a.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new RangeError('aspectRatio needs two positive, finite numbers');
    }
    if (Number.isInteger(width) && Number.isInteger(height)) return makeRatio(width, height);
    return approximateRatio(width / height);
}

/**
 * The tidiest integer ratio within `maxTerm` that matches `value`, found by
 * continued fractions. 1.7777... comes back as 16:9, not 17777:10000.
 */
export function approximateRatio(value: number, maxTerm = 1000): Ratio {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError('approximateRatio needs a positive, finite value');
    }
    // The two seed convergents, 1/0 and 0/1. Getting these the wrong way round
    // silently transposes every result, which is the sort of bug that looks
    // like a rendering problem three layers away.
    let numeratorPrev = 0;
    let numerator = 1;
    let denominatorPrev = 1;
    let denominator = 0;
    let x = value;
    for (let i = 0; i < 32; i++) {
        const whole = Math.floor(x);
        const nextNumerator = whole * numerator + numeratorPrev;
        const nextDenominator = whole * denominator + denominatorPrev;
        if (nextNumerator > maxTerm || nextDenominator > maxTerm) break;
        numeratorPrev = numerator;
        numerator = nextNumerator;
        denominatorPrev = denominator;
        denominator = nextDenominator;
        const remainder = x - whole;
        if (remainder < 1e-9) break;
        x = 1 / remainder;
    }
    // No convergent fits inside maxTerm, which happens for ratios more extreme
    // than 1:maxTerm. Falling back to 1:1 would report a square, so pin the
    // larger term at the ceiling and let the other round — an extreme ratio
    // comes back extreme rather than wrong.
    if (numerator < 1 || denominator < 1) {
        const [w, h] =
            value >= 1
                ? [maxTerm, Math.max(1, Math.round(maxTerm / value))]
                : [Math.max(1, Math.round(maxTerm * value)), maxTerm];
        return { w, h, value, label: `${w}:${h}` };
    }
    const reduced = makeRatio(numerator, denominator);
    return { w: reduced.w, h: reduced.h, value, label: reduced.label };
}

function decimalPlaces(text: string): number {
    return text.split('.')[1]?.length ?? 0;
}

/** Parse "16:9", "16x9", "16/9" or "1.7777". Returns null on anything else. */
export function parseRatio(text: string): Ratio | null {
    const clean = text.trim().toLowerCase();
    if (!clean) return null;
    const pair = clean.match(/^(\d+(?:\.\d+)?)\s*[:x/×]\s*(\d+(?:\.\d+)?)$/);
    if (pair) {
        const w = Number(pair[1]);
        const h = Number(pair[2]);
        if (!(w > 0) || !(h > 0)) return null;
        // Someone writing "2.39:1" means 239:100 exactly, not the tidiest
        // fraction near 2.39. Scale both sides out and reduce.
        const decimals = Math.max(decimalPlaces(pair[1] as string), decimalPlaces(pair[2] as string));
        const factor = 10 ** decimals;
        return makeRatio(Math.round(w * factor), Math.round(h * factor));
    }
    const single = clean.match(/^(\d+(?:\.\d+)?)(?::1)?$/);
    if (single) {
        const value = Number(single[1]);
        return value > 0 ? approximateRatio(value) : null;
    }
    return null;
}

/** Normalise any accepted ratio shape to `width / height`. */
export function ratioValue(input: RatioInput): number {
    if (typeof input === 'number') {
        if (!(input > 0) || !Number.isFinite(input)) throw new RangeError('Ratio must be a positive, finite number');
        return input;
    }
    if (typeof input === 'string') {
        const parsed = parseRatio(input);
        if (!parsed) throw new RangeError(`Could not parse "${input}" as a ratio`);
        return parsed.value;
    }
    if ('value' in input) return input.value;
    return aspectRatio(input).value;
}

/** Turn any accepted ratio shape into a full `Ratio`. */
export function toRatio(input: RatioInput): Ratio {
    if (typeof input === 'number') return approximateRatio(input);
    if (typeof input === 'string') {
        const parsed = parseRatio(input);
        if (!parsed) throw new RangeError(`Could not parse "${input}" as a ratio`);
        return parsed;
    }
    if ('value' in input) return input;
    return aspectRatio(input);
}

/** The same shape stood on its end. 16:9 becomes 9:16. */
export function flipRatio(input: RatioInput): Ratio {
    const ratio = toRatio(input);
    return { w: ratio.h, h: ratio.w, value: 1 / ratio.value, label: `${ratio.h}:${ratio.w}` };
}

const NAMED_RATIO_SOURCE = [
    [1, 1, 'Square', ['1:1', 'Instagram square']],
    [5, 4, 'Five by four', ['5:4']],
    [4, 3, 'Four by three', ['4:3', 'Classic TV', 'iPad']],
    [3, 2, 'Three by two', ['3:2', '35mm', 'Full-frame photo']],
    [16, 10, 'Sixteen by ten', ['16:10', 'WUXGA']],
    [16, 9, 'Widescreen', ['16:9', 'HD', 'Full HD', '1080p']],
    [37, 20, 'Cinema flat', ['1.85:1']],
    [2, 1, 'Univisium', ['2:1', '18:9']],
    [64, 27, 'Ultrawide', ['21:9', '2.37:1']],
    [239, 100, 'Anamorphic scope', ['2.39:1', 'CinemaScope']],
    [3, 1, 'Panorama', ['3:1']],
] as const;

/** The ratios worth having a name for, in landscape terms. */
export const NAMED_RATIOS: readonly NamedRatio[] = Object.freeze(
    NAMED_RATIO_SOURCE.map(([w, h, name, aka]) => {
        const base = makeRatio(w, h);
        return Object.freeze({ ...base, name, aka: Object.freeze([...aka]) as readonly string[] });
    }),
);

export interface NearestRatioOptions {
    /**
     * How far off a shape may be and still count, as a fraction of the ratio
     * value. The default 2% accepts 1920x1082 as 16:9 and rejects 4:3.
     */
    tolerance?: number;
    /** Match portrait sizes against the flipped named ratios too. Default true. */
    includePortrait?: boolean;
}

export interface NearestRatioMatch {
    ratio: NamedRatio;
    /** True when the match is the portrait form, e.g. 9:16. */
    portrait: boolean;
    /** Relative difference between the input and the named ratio. */
    difference: number;
    label: string;
}

/**
 * The named ratio closest to a size, or null if nothing is close enough.
 * Answers "is this a 16:9 image?" without demanding it be exactly 1920x1080.
 */
export function nearestNamedRatio(input: RatioInput, options: NearestRatioOptions = {}): NearestRatioMatch | null {
    const { tolerance = 0.02, includePortrait = true } = options;
    const value = ratioValue(input);
    let best: NearestRatioMatch | null = null;
    for (const ratio of NAMED_RATIOS) {
        const candidates: Array<{ target: number; portrait: boolean }> = [{ target: ratio.value, portrait: false }];
        if (includePortrait && ratio.w !== ratio.h) candidates.push({ target: 1 / ratio.value, portrait: true });
        for (const candidate of candidates) {
            const difference = Math.abs(value - candidate.target) / candidate.target;
            if (difference > tolerance) continue;
            if (best && best.difference <= difference) continue;
            best = {
                ratio,
                portrait: candidate.portrait,
                difference,
                label: candidate.portrait ? `${ratio.h}:${ratio.w}` : ratio.label,
            };
        }
    }
    return best;
}

/** The height that makes `width` sit at this ratio. */
export function heightForRatio(width: number, ratio: RatioInput): number {
    return Math.max(1, Math.round(width / ratioValue(ratio)));
}

/** The width that makes `height` sit at this ratio. */
export function widthForRatio(height: number, ratio: RatioInput): number {
    return Math.max(1, Math.round(height * ratioValue(ratio)));
}

export type AspectOrientation = 'landscape' | 'portrait' | 'square';

export function aspectOrientation(size: Size): AspectOrientation {
    if (size.width === size.height) return 'square';
    return size.width > size.height ? 'landscape' : 'portrait';
}

export function isLandscape(size: Size): boolean {
    return size.width > size.height;
}

export function isPortrait(size: Size): boolean {
    return size.height > size.width;
}

export function isSquare(size: Size): boolean {
    return size.width === size.height;
}

/** Millions of pixels, to two decimals. What camera specs quote. */
export function megapixels(size: Size): number {
    return Math.round((size.width * size.height) / 10_000) / 100;
}
