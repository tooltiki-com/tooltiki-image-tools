/**
 * File helpers, kept apart from the main entry point so that importing this
 * package into a browser bundle never drags `node:fs` in behind it.
 *
 * Import from `@tooltiki/image-tools/node`.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { ImageParseError } from './bits.js';
import { probeImage, tryProbeImage, type ProbeResult } from './probe.js';
import type { Size } from './types.js';

export interface ProbeFileOptions {
    /**
     * How much of the file to read on the first attempt. Every format states
     * its dimensions early, so 256 KB answers almost everything without
     * loading a 40 MB TIFF into memory. If that prefix cannot be parsed and
     * the file is longer, the whole file is read and parsed once more — HEIC
     * in particular is allowed to put its metadata after the image data.
     */
    prefixBytes?: number;
}

const DEFAULT_PREFIX = 256 * 1024;

/** Read a file's header and report what it says. */
export async function probeImageFile(path: string, options: ProbeFileOptions = {}): Promise<ProbeResult> {
    const { prefixBytes = DEFAULT_PREFIX } = options;
    const size = (await stat(path)).size;
    if (size === 0) throw new ImageParseError(`${path} is empty`);

    const handle = await open(path, 'r');
    try {
        const first = Math.min(prefixBytes, size);
        const buffer = Buffer.allocUnsafe(first);
        const { bytesRead } = await handle.read(buffer, 0, first, 0);
        const prefix = buffer.subarray(0, bytesRead);

        const fromPrefix = tryProbeImage(prefix);
        if (fromPrefix) return fromPrefix;
        if (size <= bytesRead) return probeImage(prefix);

        const whole = Buffer.allocUnsafe(size);
        await handle.read(whole, 0, size, 0);
        return probeImage(whole);
    } finally {
        await handle.close();
    }
}

/** The blocking twin, for build scripts and CLIs where async buys nothing. */
export function probeImageFileSync(path: string, options: ProbeFileOptions = {}): ProbeResult {
    const { prefixBytes = DEFAULT_PREFIX } = options;
    const size = statSync(path).size;
    if (size === 0) throw new ImageParseError(`${path} is empty`);

    const descriptor = openSync(path, 'r');
    try {
        const first = Math.min(prefixBytes, size);
        const buffer = Buffer.allocUnsafe(first);
        const bytesRead = readSync(descriptor, buffer, 0, first, 0);
        const prefix = buffer.subarray(0, bytesRead);

        const fromPrefix = tryProbeImage(prefix);
        if (fromPrefix) return fromPrefix;
        if (size <= bytesRead) return probeImage(prefix);

        const whole = Buffer.allocUnsafe(size);
        readSync(descriptor, whole, 0, size, 0);
        return probeImage(whole);
    } finally {
        closeSync(descriptor);
    }
}

/** Dimensions as displayed, orientation already applied. */
export async function imageSizeFile(path: string, options?: ProbeFileOptions): Promise<Size> {
    const probe = await probeImageFile(path, options);
    return { width: probe.displayWidth, height: probe.displayHeight };
}

export function imageSizeFileSync(path: string, options?: ProbeFileOptions): Size {
    const probe = probeImageFileSync(path, options);
    return { width: probe.displayWidth, height: probe.displayHeight };
}

/** `probeImageFile` that returns null rather than throwing on a bad file. */
export async function tryProbeImageFile(path: string, options?: ProbeFileOptions): Promise<ProbeResult | null> {
    try {
        return await probeImageFile(path, options);
    } catch {
        return null;
    }
}

export type { ProbeResult };
