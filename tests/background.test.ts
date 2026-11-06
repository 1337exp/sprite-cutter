import { describe, expect, it } from 'vitest';
import { guessBackground } from '../src/core/background';
import { blank, setPixel, WHITE } from './helpers/image';
import { mulberry32 } from './helpers/random';

const TEAL = [20, 90, 100, 255] as const;

describe('guessBackground', () => {
    it('finds the colour a sheet is painted on', () => {
        const image = blank(20, 20, TEAL);
        for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) setPixel(image, x, y, WHITE);
        expect(guessBackground(image)).toEqual([20, 90, 100]);
    });

    it('says nothing about a see-through border: the alpha is the background', () => {
        expect(guessBackground(blank(20, 20))).toBeNull();

        const image = blank(20, 20);
        setPixel(image, 0, 0, TEAL);
        expect(guessBackground(image)).toBeNull();
    });

    it('does not count faint pixels as a colour', () => {
        expect(guessBackground(blank(8, 8, [20, 90, 100, 200]))).toBeNull();
    });

    it('still finds the colour when a sprite touches the edge', () => {
        const image = blank(20, 20, TEAL);
        for (let x = 0; x < 6; x++) setPixel(image, x, 0, WHITE);
        expect(guessBackground(image)).toEqual([20, 90, 100]);
    });

    it('gives up when no colour fills half of the border', () => {
        const random = mulberry32(5);
        const image = blank(30, 30);
        for (let y = 0; y < 30; y++) {
            for (let x = 0; x < 30; x++) setPixel(image, x, y, [(random() * 256) | 0, (random() * 256) | 0, (random() * 256) | 0, 255]);
        }
        expect(guessBackground(image)).toBeNull();
    });

    it('gives up when no colour fills half of the border, even if one leads', () => {
        // The 36 border pixels: 16 teal, 10 white along the top, 10 red along the bottom.
        const image = blank(10, 10, TEAL);
        for (let x = 0; x < 10; x++) {
            setPixel(image, x, 0, WHITE);
            setPixel(image, x, 9, [200, 30, 30, 255]);
        }
        expect(guessBackground(image)).toBeNull();
    });

    it('takes a colour that covers the whole border for the background: it cannot tell a big sprite from it', () => {
        expect(guessBackground(blank(10, 10, WHITE))).toEqual([255, 255, 255]);
    });

    it('takes a different share when asked', () => {
        // 10 of the 36 border pixels are white, the other 26 (72%) are teal.
        const image = blank(10, 10, TEAL);
        for (let x = 0; x < 10; x++) setPixel(image, x, 0, WHITE);
        expect(guessBackground(image)).toEqual([20, 90, 100]);
        expect(guessBackground(image, { share: 0.7 })).toEqual([20, 90, 100]);
        expect(guessBackground(image, { share: 0.8 })).toBeNull();
    });

    it('copes with images one pixel wide or tall, and with nothing', () => {
        expect(guessBackground(blank(1, 1, TEAL))).toEqual([20, 90, 100]);
        expect(guessBackground(blank(1, 7, TEAL))).toEqual([20, 90, 100]);
        expect(guessBackground(blank(7, 1, TEAL))).toEqual([20, 90, 100]);
        expect(guessBackground(blank(0, 0))).toBeNull();
    });

    it('refuses data that is too short', () => {
        expect(() => guessBackground({ width: 4, height: 4, data: new Uint8ClampedArray(8) })).toThrow(RangeError);
    });
});
