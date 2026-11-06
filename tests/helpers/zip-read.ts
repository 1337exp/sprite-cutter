import { crc32 } from '../../src/core/crc32';

export interface ReadEntry {
    name: string;
    data: Uint8Array;
    flags: number;
    method: number;
    dosTime: number;
    dosDate: number;
}

/**
 * A ZIP reader for tests, written from the specification and strict where an unzip tool would only complain:
 * the end record, the central directory and every local header must agree with each other, the names must be
 * valid UTF-8 and the CRC of every file must match its data.
 */
export function readZip(zip: Uint8Array): ReadEntry[] {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const decoder = new TextDecoder('utf-8', { fatal: true });

    const end = zip.length - 22;
    if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('No end-of-archive record');

    const count = view.getUint16(end + 10, true);
    if (view.getUint16(end + 8, true) !== count) throw new Error('Entry counts disagree');
    if (view.getUint16(end + 20, true) !== 0) throw new Error('Unexpected archive comment');

    const centralSize = view.getUint32(end + 12, true);
    const centralStart = view.getUint32(end + 16, true);
    if (centralStart + centralSize !== end) throw new Error('The central directory does not end where the end record starts');

    const entries: ReadEntry[] = [];
    let p = centralStart;

    for (let i = 0; i < count; i++) {
        if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`Bad central header #${i}`);

        const flags = view.getUint16(p + 8, true);
        const method = view.getUint16(p + 10, true);
        const dosTime = view.getUint16(p + 12, true);
        const dosDate = view.getUint16(p + 14, true);
        const crc = view.getUint32(p + 16, true);
        const compressed = view.getUint32(p + 20, true);
        const size = view.getUint32(p + 24, true);
        const nameLength = view.getUint16(p + 28, true);
        const extraLength = view.getUint16(p + 30, true);
        const commentLength = view.getUint16(p + 32, true);
        const localOffset = view.getUint32(p + 42, true);
        const name = decoder.decode(zip.subarray(p + 46, p + 46 + nameLength));

        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Bad local header for ${name}`);
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        if (decoder.decode(zip.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== name) {
            throw new Error(`The local header names ${name} differently`);
        }
        if (view.getUint32(localOffset + 14, true) !== crc) throw new Error(`The headers of ${name} disagree on the CRC`);
        if (view.getUint16(localOffset + 6, true) !== flags) throw new Error(`The headers of ${name} disagree on the flags`);
        if (compressed !== size) throw new Error(`${name} is not stored as it is`);

        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = zip.slice(start, start + size);
        if (crc32(data) !== crc) throw new Error(`The CRC of ${name} does not match its data`);

        entries.push({ name, data, flags, method, dosTime, dosDate });
        p += 46 + nameLength + extraLength + commentLength;
    }

    if (p !== end) throw new Error('Central directory entries do not fill the directory');
    return entries;
}
