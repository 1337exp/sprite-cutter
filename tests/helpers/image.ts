import type { ImageLike } from '../../src/core/types';

export type Pixel = readonly [r: number, g: number, b: number, a: number];

export const CLEAR: Pixel = [0, 0, 0, 0];
export const WHITE: Pixel = [255, 255, 255, 255];

export function blank(width: number, height: number, pixel: Pixel = CLEAR): ImageLike {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set(pixel, i * 4);
    return { width, height, data };
}

export function setPixel(image: ImageLike, x: number, y: number, pixel: Pixel): void {
    (image.data as Uint8ClampedArray).set(pixel, (y * image.width + x) * 4);
}

/**
 * Draws an image from text. `.` is the background, `#` is white, any other character is looked up in
 * `colors`. Rows may be shorter than the widest one; the rest is background.
 * Рисует изображение из текста. `.` — фон, `#` — белый, любой другой символ ищется в `colors`.
 * Строки могут быть короче самой широкой; остальное — фон.
 */
export function art(rows: readonly string[], colors: Record<string, Pixel> = {}, background: Pixel = CLEAR): ImageLike {
    const width = Math.max(0, ...rows.map((row) => row.length));
    const image = blank(width, rows.length, background);

    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const ch = row[x]!;
            if (ch === '.') continue;

            const pixel = colors[ch] ?? (ch === '#' ? WHITE : undefined);
            if (!pixel) throw new Error(`art(): no colour for "${ch}"`);
            setPixel(image, x, y, pixel);
        }
    });

    return image;
}
