import { describe, expect, it } from 'vitest';
import { decodeGif } from '../src/core/frames';
import { GifReader, isValidData } from '../src/core/gif';
import { detectSprites } from '../src/core/detect';
import { balancedGrid, framesToSheet } from '../src/core/sheet';
import { encodeGif } from './helpers/gif-encode';
import { mulberry32 } from './helpers/random';

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;
const YELLOW = [255, 255, 0] as const;
const palette = [RED, GREEN, BLUE, YELLOW];

const px = (c: readonly [number, number, number]) => [...c, 255];
const CLEAR = [0, 0, 0, 0];

describe('isValidData', () => {
    it('accepts GIF87a and GIF89a headers and nothing else', () => {
        const bytes = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
        expect(isValidData(bytes('GIF89a'))).toBe(true);
        expect(isValidData(bytes('GIF87a'))).toBe(true);
        expect(isValidData(bytes('GIF88a'))).toBe(false);
        expect(isValidData(bytes('PNG'))).toBe(false);
        expect(isValidData([])).toBe(false);
    });
});

describe('GifReader', () => {
    it('decodes the pixels of a frame through the palette', () => {
        const gif = encodeGif(2, 2, palette, [{ width: 2, height: 2, indices: [0, 1, 2, 3] }]);
        const reader = new GifReader(gif);
        expect(reader.numFrames()).toBe(1);
        expect([reader.width, reader.height]).toEqual([2, 2]);

        const pixels = new Uint8ClampedArray(2 * 2 * 4);
        reader.decodeAndBlitFrame(0, pixels);
        expect(Array.from(pixels)).toEqual([...px(RED), ...px(GREEN), ...px(BLUE), ...px(YELLOW)]);
    });

    it('leaves the transparent index untouched', () => {
        const gif = encodeGif(2, 1, palette, [{ width: 2, height: 1, indices: [0, 1], transparent: 1 }]);
        const reader = new GifReader(gif);
        const pixels = new Uint8ClampedArray(8);
        reader.decodeAndBlitFrame(0, pixels);
        expect(Array.from(pixels)).toEqual([...px(RED), ...CLEAR]);
    });

    it('reads the frame rectangle, the delay and the disposal', () => {
        const gif = encodeGif(4, 4, palette, [{ x: 1, y: 2, width: 2, height: 1, indices: [0, 0], delay: 7, disposal: 2 }]);
        const info = new GifReader(gif).frameInfo(0);
        expect(info).toMatchObject({ x: 1, y: 2, width: 2, height: 1, delay: 7, disposal: 2, transparentIndex: null, interlaced: false });
    });

    it('drops what does not fit into a too small buffer instead of throwing', () => {
        const reader = new GifReader(encodeGif(2, 2, palette, [{ width: 2, height: 2, indices: [0, 1, 2, 3] }]));
        const tooSmall = new Uint8ClampedArray(2 * 4);
        expect(() => reader.decodeAndBlitFrame(0, tooSmall)).not.toThrow();
        expect(Array.from(tooSmall)).toEqual([...px(RED), ...px(GREEN)]);
    });

    describe('real LZW', () => {
        const decode = (width: number, height: number, indices: readonly number[], extra: { interlaced?: boolean } = {}) => {
            const gif = encodeGif(width, height, palette, [{ width, height, indices, compress: true, ...extra }]);
            const pixels = new Uint8ClampedArray(width * height * 4);
            new GifReader(gif).decodeAndBlitFrame(0, pixels);
            return { gif, pixels: Array.from(pixels) };
        };
        const colours = (indices: readonly number[]) => indices.flatMap((i) => px(palette[i]!));

        it('decodes a dictionary that grows past the 3-bit codes, on a repeating picture', () => {
            const size = 64;
            const indices = Array.from({ length: size * size }, (_, i) => (Math.floor((i % size) / 8) + Math.floor(i / size / 8)) % 4);
            const { gif, pixels } = decode(size, size, indices);

            expect(pixels).toEqual(colours(indices));

            // It really is compressed: far fewer bytes than the plain encoding of the same picture.
            const plain = encodeGif(size, size, palette, [{ width: size, height: size, indices }]);
            expect(gif.length).toBeLessThan(plain.length / 2);
        });

        it('decodes noise that fills the 12-bit table and resets it several times in one frame', () => {
            // Noise of 4 colours adds a table entry per ~5 pixels, so 65 536 pixels refill the 4096 entries more than twice.
            const random = mulberry32(7);
            const size = 256;
            const indices = Array.from({ length: size * size }, () => Math.floor(random() * 4));
            expect(decode(size, size, indices).pixels).toEqual(colours(indices));
        });

        it('tolerates a damaged stream: too long is cut to the frame, too short is padded with palette colour 0 (as omggif does)', () => {
            const decodeFrame = (width: number, height: number, indices: readonly number[]) => {
                const reader = new GifReader(encodeGif(width, height, palette, [{ width, height, indices, compress: true }]));
                const pixels = new Uint8ClampedArray(width * height * 4);
                reader.decodeAndBlitFrame(0, pixels);
                return Array.from(pixels);
            };

            expect(decodeFrame(2, 1, [0, 1, 2, 3, 0, 1])).toEqual([...px(RED), ...px(GREEN)]);
            expect(decodeFrame(2, 2, [1, 2, 3])).toEqual([...px(GREEN), ...px(BLUE), ...px(YELLOW), ...px(RED)]);
        });

        it('decodes a single pixel and a single row', () => {
            expect(decode(1, 1, [2]).pixels).toEqual(colours([2]));
            expect(decode(9, 1, [0, 1, 2, 3, 0, 1, 2, 3, 3]).pixels).toEqual(colours([0, 1, 2, 3, 0, 1, 2, 3, 3]));
        });

        it('puts the rows of an interlaced frame back in order', () => {
            const width = 3;
            const height = 20;
            const indices = Array.from({ length: width * height }, (_, i) => (Math.floor(i / width) * 3 + (i % width) + Math.floor(i / width / 4)) % 4);
            expect(decode(width, height, indices, { interlaced: true }).pixels).toEqual(colours(indices));
        });
    });

    it('refuses bytes that are not a GIF, and a frame that does not exist', () => {
        expect(() => new GifReader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow('Invalid GIF');
        const reader = new GifReader(encodeGif(1, 1, palette, [{ width: 1, height: 1, indices: [0] }]));
        expect(() => reader.frameInfo(1)).toThrow('out of range');
        expect(() => reader.frameInfo(-1)).toThrow('out of range');
    });
});

describe('decodeGif', () => {
    it('composes a frame that stores only the change over the one before', () => {
        const gif = encodeGif(2, 1, palette, [
            { width: 2, height: 1, indices: [0, 1], disposal: 1 },
            { x: 1, width: 1, height: 1, indices: [2] },
        ]);
        const { frames } = decodeGif(gif);
        expect(frames).toHaveLength(2);
        expect(Array.from(frames[0]!.data)).toEqual([...px(RED), ...px(GREEN)]);
        expect(Array.from(frames[1]!.data)).toEqual([...px(RED), ...px(BLUE)]);
    });

    it('clears the previous frame to transparent when it asks for disposal 2', () => {
        const gif = encodeGif(2, 1, palette, [
            { width: 2, height: 1, indices: [0, 1], disposal: 2 },
            { x: 1, width: 1, height: 1, indices: [2] },
        ]);
        const { frames } = decodeGif(gif);
        expect(Array.from(frames[1]!.data)).toEqual([...CLEAR, ...px(BLUE)]);
    });

    it('restores what was under the previous frame when it asks for disposal 3', () => {
        const gif = encodeGif(2, 1, palette, [
            { width: 2, height: 1, indices: [0, 1] },
            { width: 2, height: 1, indices: [2, 2], disposal: 3 },
            { width: 1, height: 1, indices: [3] },
        ]);
        const { frames } = decodeGif(gif);
        expect(Array.from(frames[1]!.data)).toEqual([...px(BLUE), ...px(BLUE)]);
        expect(Array.from(frames[2]!.data)).toEqual([...px(YELLOW), ...px(GREEN)]);
    });

    it('hands out frames that do not share memory', () => {
        const gif = encodeGif(1, 1, palette, [
            { width: 1, height: 1, indices: [0] },
            { width: 1, height: 1, indices: [1] },
        ]);
        const { frames } = decodeGif(gif);
        expect(Array.from(frames[0]!.data)).toEqual(px(RED));
        expect(Array.from(frames[1]!.data)).toEqual(px(GREEN));
    });

    it('carries the delay of each frame', () => {
        const gif = encodeGif(1, 1, palette, [
            { width: 1, height: 1, indices: [0], delay: 5 },
            { width: 1, height: 1, indices: [1], delay: 9 },
        ]);
        expect(decodeGif(gif).frames.map((f) => f.delay)).toEqual([5, 9]);
    });
});

describe('balancedGrid', () => {
    it('picks the most square grid that fits', () => {
        expect(balancedGrid(1)).toEqual([1, 1]);
        expect(balancedGrid(2)).toEqual([2, 1]);
        expect(balancedGrid(4)).toEqual([2, 2]);
        expect(balancedGrid(5)).toEqual([3, 2]);
        expect(balancedGrid(7)).toEqual([3, 3]);
        expect(balancedGrid(10)).toEqual([4, 3]);
    });

    it('is empty for nothing', () => {
        expect(balancedGrid(0)).toEqual([0, 0]);
        expect(balancedGrid(NaN)).toEqual([0, 0]);
    });

    it('always has room for every cell', () => {
        for (let n = 1; n <= 200; n++) {
            const [cols, rows] = balancedGrid(n);
            expect(cols * rows).toBeGreaterThanOrEqual(n);
            expect((rows - 1) * cols).toBeLessThan(n);
        }
    });
});

describe('framesToSheet', () => {
    const solid = (index: number) => ({ width: 2, height: 2, indices: [index, index, index, index] });
    const gif = () => decodeGif(encodeGif(2, 2, palette, [solid(0), solid(1), solid(2)]));

    it('lays frames out on a grid with a transparent gap between them', () => {
        const sheet = framesToSheet(gif(), 1);
        expect([sheet.width, sheet.height, sheet.cols, sheet.rows]).toEqual([5, 5, 2, 2]);
        expect(sheet.cells).toEqual([
            { x: 0, y: 0, w: 2, h: 2 },
            { x: 3, y: 0, w: 2, h: 2 },
            { x: 0, y: 3, w: 2, h: 2 },
        ]);

        const at = (x: number, y: number) => Array.from(sheet.data.subarray((y * sheet.width + x) * 4, (y * sheet.width + x) * 4 + 4));
        expect(at(0, 0)).toEqual(px(RED));
        expect(at(3, 1)).toEqual(px(GREEN));
        expect(at(1, 4)).toEqual(px(BLUE));
        expect(at(2, 0)).toEqual(CLEAR); // the gap
        expect(at(4, 4)).toEqual(CLEAR); // the empty fourth cell
    });

    it('is found back as one sprite per frame', () => {
        const sheet = framesToSheet(gif(), 1);
        const { sprites } = detectSprites(sheet);
        expect(sprites.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(sheet.cells);
    });

    it('makes an empty sheet of an empty list', () => {
        const sheet = framesToSheet({ width: 4, height: 4, frames: [] });
        expect([sheet.width, sheet.height, sheet.cells]).toEqual([0, 0, []]);
    });
});
