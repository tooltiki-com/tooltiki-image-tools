/**
 * @tooltiki/image-tools
 *
 * Image maths with no dependencies and no decoder: read what a file says about
 * itself, work out what it becomes when you resize it, and size it for a
 * screen or a sheet of paper.
 *
 * The main entry point is runtime-agnostic — it touches no Node built-in, so
 * it runs unchanged in a browser, a worker or an edge function. The file
 * helpers live in `@tooltiki/image-tools/node`.
 *
 * Interactive versions of most of this: https://tooltiki.com
 */

export { ImageParseError, toBytes } from './bits.js';

export type { BinaryInput, Density, ImageFormat, Orientation, Size } from './types.js';

export {
    FORMAT_SUPPORT_LAST_REVIEWED,
    IMAGE_FORMAT_IDS,
    IMAGE_FORMATS,
    extensionFor,
    formatFromExtension,
    formatFromMime,
    formatInfo,
    isLossy,
    losesDataConvertingTo,
    mimeTypeFor,
    replaceExtension,
    supportsAlpha,
    supportsAnimation,
} from './formats.js';
export type { FormatInfo } from './formats.js';

export { detectFormat, imageSize, probeImage, tryProbeImage } from './probe.js';
export type { ProbeResult } from './probe.js';

export {
    TIFF_TAG,
    applyOrientation,
    densityFromTiff,
    findExifTiffStart,
    orientationTransform,
    parseTiff,
    readExifOrientation,
    readTiffDirectory,
    swapsAxes,
} from './exif.js';
export type { ExifData, OrientationTransform, TiffDirectory, TiffField } from './exif.js';

export { clampSize, containBox, cropBox, decodedByteSize, fit, pixelCount, scaleSize } from './fit.js';
export type { CropBox, CropOptions, FitMode, FitOptions, FitResult, FocalPoint, Position, Rounding } from './fit.js';

export {
    NAMED_RATIOS,
    approximateRatio,
    aspectOrientation,
    aspectRatio,
    flipRatio,
    heightForRatio,
    isLandscape,
    isPortrait,
    isSquare,
    megapixels,
    nearestNamedRatio,
    parseRatio,
    ratioValue,
    toRatio,
    widthForRatio,
} from './aspect.js';
export type { AspectOrientation, NamedRatio, NearestRatioMatch, NearestRatioOptions, Ratio, RatioInput } from './aspect.js';

export {
    base64Length,
    dataUriLength,
    estimateBitsPerPixel,
    estimateEncodedSize,
    formatBytes,
    fromBase64,
    parseBytes,
    parseDataUri,
    savingPercent,
    toBase64,
    toDataUri,
} from './bytes.js';
export type {
    EncodeEstimate,
    EncodeEstimateInput,
    FormatBytesOptions,
    ImageContent,
    ParsedDataUri,
} from './bytes.js';

export {
    PAPER_SIZES,
    convertLength,
    effectiveDpi,
    fitsPaper,
    largestPrintAt,
    paperSize,
    pixelsForPrint,
    printQuality,
    printSize,
    screenArea,
    screenDimensions,
    screenPpi,
} from './print.js';
export type { LengthUnit, Paper, PaperFitOptions, PaperFitResult, PhysicalSize, PrintQuality } from './print.js';

export { DEFAULT_WIDTHS, buildSizes, buildSrcset, dprVariants, renditions, srcsetWidths } from './responsive.js';
export type { DprVariant, SizesRule, SrcResolver, SrcsetOptions, SrcsetWidthOptions } from './responsive.js';

export {
    FAVICON_SIZES,
    MASKABLE_ICON_SIZES,
    MASKABLE_SAFE_ZONE,
    PRESETS,
    PRESETS_LAST_REVIEWED,
    PRESET_PLATFORMS,
    findPreset,
    presetsFor,
} from './presets.js';
export type { IconSize, ImagePreset } from './presets.js';
