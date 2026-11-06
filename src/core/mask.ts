import { toleranceToLimitSq, type KeyColor } from './color';
import type { ImageLike, Rect } from './types';

/**
 * Marks the visible pixels of `area`: 1 is a pixel that may belong to a sprite, 0 is background.
 * A pixel is background when it is fainter than `minAlpha`, or when it is within the tolerance of any key.
 * `area` must lie inside the image. The mask is `area.w` wide and is stored row after row.
 * Отмечает видимые пиксели области `area`: 1 — пиксель может быть частью спрайта, 0 — фон.
 * Фон — это пиксель слабее `minAlpha` или в пределах допуска от любого из ключей.
 * `area` должна лежать внутри изображения. Маска шириной `area.w`, строка за строкой.
 */
export function buildMask(image: ImageLike, area: Rect, keys: readonly KeyColor[], minAlpha: number): Uint8Array {
    const { data, width } = image;
    const count = keys.length;

    // The keys are unpacked once: the loop below touches every pixel, so it must not parse anything.
    // Ключи раскладываются один раз: цикл ниже проходит по каждому пикселю, поэтому разбирать там нечего.
    const kr = new Int32Array(count);
    const kg = new Int32Array(count);
    const kb = new Int32Array(count);
    const limit = new Float64Array(count);
    keys.forEach((key, i) => {
        kr[i] = key.color[0];
        kg[i] = key.color[1];
        kb[i] = key.color[2];
        limit[i] = toleranceToLimitSq(key.tolerance);
    });

    const isKey = (r: number, g: number, b: number): boolean => {
        for (let k = 0; k < count; k++) {
            const dr = r - kr[k]!;
            const dg = g - kg[k]!;
            const db = b - kb[k]!;
            if (dr * dr + dg * dg + db * db <= limit[k]!) return true;
        }
        return false;
    };

    const mask = new Uint8Array(area.w * area.h);

    // Neighbouring pixels are usually the same colour (flat fills), so the last answer is reused.
    // Соседние пиксели чаще всего одного цвета (плоская заливка), поэтому последний ответ переиспользуется.
    let lastR = -1;
    let lastG = -1;
    let lastB = -1;
    let lastIsKey = false;

    for (let y = 0; y < area.h; y++) {
        let src = ((area.y + y) * width + area.x) * 4;
        let dst = y * area.w;

        for (let x = 0; x < area.w; x++, src += 4, dst++) {
            if (data[src + 3]! < minAlpha) continue;

            const r = data[src]!;
            const g = data[src + 1]!;
            const b = data[src + 2]!;

            if (r !== lastR || g !== lastG || b !== lastB) {
                lastR = r;
                lastG = g;
                lastB = b;
                lastIsKey = isKey(r, g, b);
            }

            if (!lastIsKey) mask[dst] = 1;
        }
    }

    return mask;
}
