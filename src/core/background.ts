import type { RGB } from './color';
import { assertImage } from './image';
import type { ImageLike } from './types';

export interface GuessBackgroundOptions {
    /**
     * How much of the image's border one colour must fill to be called the background, 0…1. Default 0.5.
     * Какую долю границы изображения должен занимать один цвет, чтобы считаться фоном, 0…1. По умолчанию 0.5.
     */
    share?: number;
}

/**
 * Guesses the background colour of a sheet from its one-pixel border: the colour that fills at least half of
 * it. Returns null when the border is mostly see-through (the alpha is the background then, no colour is
 * needed) or when no single colour dominates (a photo, a sheet where sprites touch every edge). Only exact
 * matches count, so a JPEG with noisy edges needs the colour picked by hand.
 * Угадывает цвет фона листа по его границе в один пиксель: цвет, который занимает не меньше половины.
 * Возвращает null, если граница в основном прозрачная (тогда фон — это альфа, цвет не нужен) или если
 * ни один цвет не преобладает (фотография, лист, где спрайты упираются во все края). Считаются только точные
 * совпадения, поэтому для JPEG с шумом на краях цвет нужно выбрать руками.
 */
export function guessBackground(image: ImageLike, options: GuessBackgroundOptions = {}): RGB | null {
    assertImage(image);

    const { width, height, data } = image;
    if (width === 0 || height === 0) return null;

    const share = Math.min(1, Math.max(0, options.share ?? 0.5));
    const counts = new Map<number, number>();
    let total = 0;
    let opaque = 0;

    const visit = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        total++;
        if (data[i + 3]! < 255) return;

        opaque++;
        const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    };

    // Every border pixel once, also on images one pixel wide or tall.
    // Каждый пиксель границы по одному разу, в том числе у картинок шириной или высотой в один пиксель.
    for (let x = 0; x < width; x++) {
        visit(x, 0);
        if (height > 1) visit(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
        visit(0, y);
        if (width > 1) visit(width - 1, y);
    }

    if (opaque * 2 < total) return null;

    let best = -1;
    let bestCount = 0;
    for (const [key, count] of counts) {
        if (count > bestCount) {
            best = key;
            bestCount = count;
        }
    }

    if (best < 0 || bestCount < share * total) return null;
    return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}
