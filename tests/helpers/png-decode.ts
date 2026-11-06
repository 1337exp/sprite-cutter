import { crc32 } from '../../src/core/crc32';

export interface DecodedPng {
    width: number;
    height: number;
    /** RGBA, row after row. */
    data: Uint8Array;
    /** Chunk types in file order. */
    chunks: string[];
    /** The filter type each row was stored with. */
    filters: number[];
    bitDepth: number;
    colorType: number;
    interlace: number;
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A PNG reader for tests, written from the specification and not from the encoder: it checks the signature
 * and every chunk's CRC, inflates the data and undoes all five row filters. It reads only 8-bit RGBA.
 */
export async function decodePng(png: Uint8Array): Promise<DecodedPng> {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

    [137, 80, 78, 71, 13, 10, 26, 10].forEach((byte, i) => {
        if (png[i] !== byte) throw new Error('Bad PNG signature');
    });

    const chunks: string[] = [];
    const idat: Uint8Array[] = [];
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;

    let offset = 8;
    while (offset < png.length) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
        const body = png.subarray(offset + 8, offset + 8 + length);

        if (view.getUint32(offset + 8 + length) !== crc32(png.subarray(offset + 4, offset + 8 + length))) {
            throw new Error(`Bad CRC in the ${type} chunk`);
        }

        chunks.push(type);
        if (type === 'IHDR') {
            width = view.getUint32(offset + 8);
            height = view.getUint32(offset + 12);
            bitDepth = body[8]!;
            colorType = body[9]!;
            interlace = body[12]!;
        } else if (type === 'IDAT') {
            idat.push(body);
        }

        offset += 12 + length;
    }
    if (offset !== png.length) throw new Error('Bytes after the last chunk');
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error('Only 8-bit RGBA without interlacing is read here');

    const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of idat) {
        joined.set(part, at);
        at += part.length;
    }

    const raw = await inflate(joined);
    const stride = width * 4;
    if (raw.length !== height * (stride + 1)) throw new Error(`Inflated ${raw.length} bytes, expected ${height * (stride + 1)}`);

    const data = new Uint8Array(height * stride);
    const filters: number[] = [];

    for (let y = 0; y < height; y++) {
        const type = raw[y * (stride + 1)]!;
        filters.push(type);

        for (let x = 0; x < stride; x++) {
            const stored = raw[y * (stride + 1) + 1 + x]!;
            const left = x >= 4 ? data[y * stride + x - 4]! : 0;
            const up = y > 0 ? data[(y - 1) * stride + x]! : 0;
            const upLeft = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0;

            let predicted: number;
            switch (type) {
                case 0:
                    predicted = 0;
                    break;
                case 1:
                    predicted = left;
                    break;
                case 2:
                    predicted = up;
                    break;
                case 3:
                    predicted = Math.floor((left + up) / 2);
                    break;
                case 4: {
                    const p = left + up - upLeft;
                    const pa = Math.abs(p - left);
                    const pb = Math.abs(p - up);
                    const pc = Math.abs(p - upLeft);
                    predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
                    break;
                }
                default:
                    throw new Error(`Unknown filter type ${type}`);
            }

            data[y * stride + x] = (stored + predicted) & 255;
        }
    }

    return { width, height, data, chunks, filters, bitDepth, colorType, interlace };
}
