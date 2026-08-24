/**
 * Bounds-checked reads over a byte array.
 *
 * Every parser in this package walks untrusted bytes — a truncated upload, a
 * file that lied about its extension, a fuzzer. Reading past the end returns
 * `undefined` in JavaScript and silently poisons the arithmetic downstream
 * (`undefined * 256` is `NaN`, and `NaN` compares false against every bound
 * you might guard with). These helpers throw instead, so a malformed file
 * fails at the read rather than three functions later.
 */
import type { BinaryInput } from './types.js';

/** Thrown when a file cannot be parsed. Carries no partial result on purpose. */
export class ImageParseError extends Error {
    override readonly name = 'ImageParseError';

    constructor(message: string) {
        super(message);
    }
}

/** Normalise anything byte-shaped to a Uint8Array without copying. */
export function toBytes(input: BinaryInput): Uint8Array {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new ImageParseError('Expected a Uint8Array, ArrayBuffer or TypedArray');
}

function need(bytes: Uint8Array, offset: number, length: number): void {
    if (offset < 0 || offset + length > bytes.length) {
        throw new ImageParseError(
            `Truncated file: needed ${length} byte(s) at offset ${offset}, have ${bytes.length}`,
        );
    }
}

export function u8(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 1);
    return bytes[offset] as number;
}

export function u16be(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 2);
    return ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
}

export function u16le(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 2);
    return ((bytes[offset + 1] as number) << 8) | (bytes[offset] as number);
}

export function u24le(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 3);
    return (
        (bytes[offset] as number) |
        ((bytes[offset + 1] as number) << 8) |
        ((bytes[offset + 2] as number) << 16)
    );
}

export function u32be(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 4);
    return (
        (bytes[offset] as number) * 0x1000000 +
        (((bytes[offset + 1] as number) << 16) |
            ((bytes[offset + 2] as number) << 8) |
            (bytes[offset + 3] as number))
    );
}

export function u32le(bytes: Uint8Array, offset: number): number {
    need(bytes, offset, 4);
    return (
        (bytes[offset + 3] as number) * 0x1000000 +
        (((bytes[offset + 2] as number) << 16) |
            ((bytes[offset + 1] as number) << 8) |
            (bytes[offset] as number))
    );
}

/** Signed 32-bit little-endian. BMP writes a negative height for top-down rows. */
export function i32le(bytes: Uint8Array, offset: number): number {
    const value = u32le(bytes, offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
}

/** True when `bytes` starts with `signature` at `offset`. Never throws. */
export function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
    if (offset + signature.length > bytes.length) return false;
    for (let i = 0; i < signature.length; i++) {
        if (bytes[offset + i] !== signature[i]) return false;
    }
    return true;
}

/** ASCII signature comparison, for the many formats that use readable magic. */
export function startsWithAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
    if (offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) {
        if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
}

/** Decode a byte range as Latin-1. Used for magic strings, never for content. */
export function ascii(bytes: Uint8Array, offset: number, length: number): string {
    need(bytes, offset, length);
    let out = '';
    for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] as number);
    return out;
}
