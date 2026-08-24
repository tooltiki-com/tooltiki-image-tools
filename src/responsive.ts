/**
 * `srcset` and `sizes`, generated rather than hand-written.
 *
 * The rule these functions encode: a `w` descriptor tells the browser how wide
 * each file is and lets it choose, and `sizes` tells it how wide the image
 * will be laid out. Get `sizes` wrong and the browser downloads the wrong file
 * however good the `srcset` is, because it picks before it has done layout.
 */
import { fit } from './fit.js';
import type { Size } from './types.js';

/**
 * A ladder that covers the common device widths without generating twenty
 * files nobody requests. Roughly the breakpoints plus their 2x forms.
 */
export const DEFAULT_WIDTHS: readonly number[] = Object.freeze([320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560]);

export interface SrcsetWidthOptions {
    /** Smallest width to emit. Default 320. */
    min?: number;
    /** Largest width to emit. Never exceeds the source width when one is given. */
    max?: number;
    /** The source image's width. Widths above it are dropped rather than upscaled. */
    sourceWidth?: number;
    /** Emit a fixed number of steps, geometrically spaced, instead of the ladder. */
    count?: number;
    /** Use this exact list as the starting point instead of `DEFAULT_WIDTHS`. */
    widths?: readonly number[];
}

/**
 * The widths worth rendering. Never returns a width larger than the source,
 * because upscaling to fill a `srcset` ships bytes that carry no detail.
 */
export function srcsetWidths(options: SrcsetWidthOptions = {}): number[] {
    const { min = 320, max, sourceWidth, count, widths = DEFAULT_WIDTHS } = options;
    const ceiling = Math.min(max ?? Infinity, sourceWidth ?? Infinity);

    if (count && count > 0) {
        const top = Number.isFinite(ceiling) ? ceiling : (widths[widths.length - 1] as number);
        if (count === 1) return [Math.round(top)];
        const ratio = (top / min) ** (1 / (count - 1));
        const steps: number[] = [];
        for (let i = 0; i < count; i++) steps.push(Math.round(min * ratio ** i));
        return dedupe(steps.filter((width) => width >= 1));
    }

    const ladder = widths.filter((width) => width >= min && width <= ceiling);
    // A source that falls between two rungs still deserves its own full-size
    // entry, otherwise the largest file offered is smaller than the original.
    if (sourceWidth && sourceWidth >= min && !ladder.includes(sourceWidth)) ladder.push(sourceWidth);
    return dedupe(ladder);
}

function dedupe(values: number[]): number[] {
    return [...new Set(values)].sort((a, b) => a - b);
}

/** Given a width, where does that rendition live. */
export type SrcResolver = (width: number, height: number) => string;

export interface SrcsetOptions {
    /** `w` for width descriptors (the usual choice), `x` for pixel density. */
    descriptor?: 'w' | 'x';
    /** For `x` descriptors: the width that counts as 1x. Defaults to the smallest. */
    baseWidth?: number;
    /** Source dimensions, so each entry's height can be handed to the resolver. */
    source?: Size;
}

/**
 * Build a `srcset` value.
 *
 * The resolver is called once per width and gets the matching height too, so a
 * URL template that needs both — most image CDNs do — can have it without
 * recomputing the aspect ratio at every call site.
 */
export function buildSrcset(
    resolve: SrcResolver | string,
    widths: readonly number[],
    options: SrcsetOptions = {},
): string {
    const { descriptor = 'w', baseWidth, source } = options;
    if (!widths.length) return '';

    const resolver: SrcResolver =
        typeof resolve === 'string'
            ? (width, height) => resolve.replace(/\{width\}/g, String(width)).replace(/\{height\}/g, String(height))
            : resolve;

    const ordered = [...widths].sort((a, b) => a - b);
    const base = baseWidth ?? (ordered[0] as number);

    return ordered
        .map((width) => {
            const height = source ? fit(source, { width }).height : Math.round(width * 0.75);
            const url = resolver(width, height);
            if (descriptor === 'x') {
                const density = Math.round((width / base) * 100) / 100;
                return `${url} ${density}x`;
            }
            return `${url} ${width}w`;
        })
        .join(', ');
}

export interface SizesRule {
    /** A media condition, e.g. `(max-width: 640px)`. Omit for the fallback. */
    media?: string;
    /** The laid-out width, e.g. `100vw` or `calc(50vw - 2rem)` or `640px`. */
    size: string;
}

/**
 * Build a `sizes` value. Rules are emitted in order and the first without a
 * media condition becomes the fallback, so put the widest breakpoint first and
 * the default last, the way CSS media queries read.
 */
export function buildSizes(rules: readonly SizesRule[]): string {
    if (!rules.length) return '100vw';
    const parts = rules.map((rule) => (rule.media ? `${rule.media} ${rule.size}` : rule.size));
    // A `sizes` list with no unconditional entry has no fallback, and a browser
    // that matches nothing falls back to 100vw anyway. Make that explicit.
    if (rules.every((rule) => rule.media)) parts.push('100vw');
    return parts.join(', ');
}

export interface DprVariant {
    dpr: number;
    width: number;
    height: number;
}

/**
 * The renditions needed to serve one layout size across device pixel ratios.
 * Three is the usual answer: 1x, 2x, and 3x for phones.
 */
export function dprVariants(size: Size, dprs: readonly number[] = [1, 2, 3]): DprVariant[] {
    return dprs.map((dpr) => ({
        dpr,
        width: Math.round(size.width * dpr),
        height: Math.round(size.height * dpr),
    }));
}

/**
 * Every rendition for a source image: the widths worth generating, each with
 * the height that keeps the aspect ratio. Feed it straight to whatever does
 * the encoding.
 */
export function renditions(source: Size, options: SrcsetWidthOptions = {}): Size[] {
    const widths = srcsetWidths({ ...options, sourceWidth: options.sourceWidth ?? source.width });
    return widths.map((width) => {
        const scaled = fit(source, { width });
        return { width: scaled.width, height: scaled.height };
    });
}
