import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/core/png';
import type { ImageLike } from '../src/core/types';
import { art, blank } from './helpers/image';
import { decodePng } from './helpers/png-decode';
import { mulberry32 } from './helpers/random';

type Pixel = [number, number, number, number];

function paint(width: number, height: number, pixel: (x: number, y: number) => Pixel): ImageLike {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
    }
    return { width, height, data };
}

const random = mulberry32(3);
const images: Record<string, ImageLike> = {
    'one opaque pixel': paint(1, 1, () => [10, 20, 30, 255]),
    'one see-through pixel that keeps its colour bytes': paint(1, 1, () => [12, 34, 56, 0]),
    'noise with every alpha': paint(33, 17, () => [(random() * 256) | 0, (random() * 256) | 0, (random() * 256) | 0, (random() * 256) | 0]),
    'horizontal gradient': paint(64, 8, (x) => [x * 4, 0, 0, 255]),
    'vertical gradient': paint(8, 64, (_x, y) => [0, y * 4, 0, 255]),
    'diagonal gradient': paint(40, 40, (x, y) => [0, 0, (x + y) * 3, 255]),
    'flat colour': paint(50, 50, () => [200, 100, 50, 255]),
    'pixel art': art(['.##.', '#..#', '.##.']),
    'wide strip': paint(500, 1, (x) => [x & 255, 7, 7, 255]),
    'tall strip': paint(1, 500, (_x, y) => [7, y & 255, 7, 255]),
};

describe('encodePng', () => {
    it.each(Object.entries(images))('round-trips %s', async (_name, image) => {
        const png = await encodePng(image);
        const decoded = await decodePng(png);

        expect([decoded.width, decoded.height]).toEqual([image.width, image.height]);
        expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
    });

    it('writes an 8-bit RGBA PNG with the three chunks a PNG needs, in order', async () => {
        const decoded = await decodePng(await encodePng(images['pixel art']!));
        expect(decoded.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
        expect([decoded.bitDepth, decoded.colorType, decoded.interlace]).toEqual([8, 6, 0]);
    });

    it('picks different row filters where they pay off, and the result still decodes', async () => {
        const used = new Set<number>();
        for (const image of Object.values(images)) {
            for (const filter of (await decodePng(await encodePng(image))).filters) used.add(filter);
        }
        expect(used.size).toBeGreaterThanOrEqual(3);
    });

    it('compresses: a flat 100 x 100 picture is a few hundred bytes, not forty thousand', async () => {
        // deflate cuts a run into pieces of 258 bytes at most, which is why it is ~300 and not ~30.
        const flat = paint(100, 100, () => [200, 100, 50, 255]);
        expect((await encodePng(flat)).length).toBeLessThan(500);
    });

    it('takes plain Uint8Array data as well', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const decoded = await decodePng(await encodePng({ width: 2, height: 1, data }));
        expect(Array.from(decoded.data)).toEqual(Array.from(data));
    });

    it('refuses an image with no pixels, and data that is too short', async () => {
        await expect(encodePng(blank(0, 0))).rejects.toThrow(RangeError);
        await expect(encodePng(blank(0, 5))).rejects.toThrow(RangeError);
        await expect(encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).rejects.toThrow(RangeError);
    });
});
