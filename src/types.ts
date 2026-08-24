/**
 * Types shared across the package. Kept in one file so a consumer can import
 * `Size` without pulling in a module they do not otherwise use.
 */

/** Formats this package can identify from a header. */
export type ImageFormat =
    | 'png'
    | 'jpeg'
    | 'gif'
    | 'webp'
    | 'bmp'
    | 'ico'
    | 'cur'
    | 'tiff'
    | 'avif'
    | 'heic'
    | 'svg'
    | 'qoi';

/** A pixel rectangle. Width and height are always positive integers. */
export interface Size {
    width: number;
    height: number;
}

/**
 * A resolution a file *claims*, which is metadata and not a property of the
 * pixels. `aspect` is JFIF's units=0 case, where the two numbers are a pixel
 * aspect ratio rather than a physical density.
 */
export interface Density {
    x: number;
    y: number;
    unit: 'dpi' | 'dpcm' | 'aspect';
}

/** EXIF orientation, 1-8. 1 is "already the right way up". */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Bytes in, in any of the shapes Node and the web hand them to you. */
export type BinaryInput = Uint8Array | ArrayBuffer | ArrayBufferView;
