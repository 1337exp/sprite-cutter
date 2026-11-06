import { crc32 } from './crc32';
import { assertImage } from './image';
import type { ImageLike } from './types';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const BYTES_PER_PIXEL = 4;

/**
 * zlib-wrapped deflate, which is exactly what a PNG's IDAT holds. The browser, a worker and Node all have
 * `CompressionStream`, so no compression library is shipped.
 * deflate в обёртке zlib, ровно то, что лежит в IDAT у PNG. `CompressionStream` есть в браузере, воркере и
 * Node, поэтому библиотека сжатия не нужна.
 */
async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);

    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

    return out;
}

function paeth(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Prepends a filter byte to every row. Each row gets whichever of the five PNG filters leaves the smallest
 * sum of absolute differences, the usual heuristic: flat colours and gradients turn into runs of zeros that
 * deflate squeezes hard.
 * Дописывает в начало каждой строки байт фильтра. Каждая строка получает тот из пяти фильтров PNG, после
 * которого сумма модулей наименьшая (обычная эвристика): плоские цвета и градиенты превращаются в серии
 * нулей, которые deflate сжимает сильно.
 */
function filterRows(data: ArrayLike<number>, width: number, height: number): Uint8Array<ArrayBuffer> {
    const stride = width * BYTES_PER_PIXEL;
    const out = new Uint8Array(height * (stride + 1));
    const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));

    for (let y = 0; y < height; y++) {
        const row = y * stride;

        for (let x = 0; x < stride; x++) {
            const raw = data[row + x]!;
            const a = x >= BYTES_PER_PIXEL ? data[row + x - BYTES_PER_PIXEL]! : 0;
            const b = y > 0 ? data[row - stride + x]! : 0;
            const c = x >= BYTES_PER_PIXEL && y > 0 ? data[row - stride + x - BYTES_PER_PIXEL]! : 0;

            candidates[0]![x] = raw;
            candidates[1]![x] = (raw - a) & 255;
            candidates[2]![x] = (raw - b) & 255;
            candidates[3]![x] = (raw - ((a + b) >> 1)) & 255;
            candidates[4]![x] = (raw - paeth(a, b, c)) & 255;
        }

        let best = 0;
        let bestScore = Infinity;
        for (let t = 0; t < 5; t++) {
            let score = 0;
            for (const v of candidates[t]!) score += v < 128 ? v : 256 - v;
            if (score < bestScore) {
                bestScore = score;
                best = t;
            }
        }

        out[y * (stride + 1)] = best;
        out.set(candidates[best]!, y * (stride + 1) + 1);
    }

    return out;
}

/**
 * Encodes an image as a PNG (8-bit RGBA, not interlaced). Pixels are written as they are, so a fully
 * transparent pixel keeps its colour bytes.
 * Кодирует изображение в PNG (8 бит RGBA, без чересстрочности). Пиксели пишутся как есть, поэтому у полностью
 * прозрачного пикселя сохраняются его байты цвета.
 */
export async function encodePng(image: ImageLike): Promise<Uint8Array<ArrayBuffer>> {
    assertImage(image);
    if (image.width === 0 || image.height === 0) throw new RangeError('A PNG needs at least one pixel');

    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, image.width);
    view.setUint32(4, image.height);
    header[8] = 8; // bit depth
    header[9] = 6; // colour type: RGBA

    const idat = await deflate(filterRows(image.data, image.width, image.height));
    const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', header), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];

    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
}
