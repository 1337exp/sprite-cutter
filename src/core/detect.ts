import type { KeyColor } from './color';
import { assertImage, clipRect } from './image';
import { dilate, labelComponents } from './label';
import { buildMask } from './mask';
import type { ImageLike, Rect, Sprite } from './types';

export interface AnalyzeOptions {
    /**
     * Colours to treat as background. Fully transparent pixels are always background (see `minAlpha`).
     * Цвета, которые считаются фоном. Полностью прозрачные пиксели — всегда фон (см. `minAlpha`).
     */
    keys?: readonly KeyColor[];
    /**
     * A pixel fainter than this alpha (0…255) is background. Default 1: only fully transparent pixels are.
     * Raise it to ignore faint halos and soft shadows.
     * Пиксель с альфой ниже этой (0…255) — фон. По умолчанию 1: фон только полностью прозрачные.
     * Поднимите, чтобы не видеть слабые ореолы и мягкие тени.
     */
    minAlpha?: number;
    /**
     * How many empty pixels may lie between two parts of one sprite, in any direction. Default 0: only parts
     * that touch (diagonals included) are one sprite. It is measured between pixels, not between boxes.
     * Сколько пустых пикселей может лежать между двумя частями одного спрайта, в любом направлении.
     * По умолчанию 0: один спрайт — только части, которые касаются (в том числе по диагонали).
     * Меряется между пикселями, а не между рамками.
     */
    gap?: number;
    /**
     * Only this part of the image is searched; a sprite that leaves it is cut at the edge. The whole image by
     * default. Any corner order and sizes outside the image are fine.
     * Ищем только в этой части изображения; спрайт, выходящий за неё, обрезается по краю. По умолчанию всё
     * изображение. Любой порядок углов и размеры за пределами изображения допустимы.
     */
    area?: Rect;
}

export interface Analysis {
    /**
     * The area that was searched, clipped to the image.
     * Область, где искали, обрезанная по изображению.
     */
    readonly area: Rect;
    /**
     * Every sprite found, in the reading order of its first pixel, before any size filter.
     * Все найденные спрайты, в порядке чтения их первого пикселя, до любых фильтров по размеру.
     */
    readonly sprites: readonly Sprite[];
    /**
     * For each pixel of `area` (row after row, `area.w` wide): the 1-based index into `sprites`, or 0 for
     * background. This is what makes finding the sprite under a click instant.
     * Для каждого пикселя `area` (строка за строкой, шириной `area.w`): индекс в `sprites`, считая с 1,
     * или 0 для фона. Благодаря этому спрайт под кликом находится мгновенно.
     */
    readonly ids: Int32Array;
}

const finite = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) ? value : fallback;

/**
 * Finds every sprite in the area: a group of visible pixels that touch each other (or lie within `gap`).
 * Nothing is filtered out here, so the result can be reused while the user changes the size limits; see
 * `detectSprites` for the filtered version and `spriteAt` for the sprite under a point.
 * Находит все спрайты в области: группы видимых пикселей, которые касаются друг друга (или лежат в пределах
 * `gap`). Здесь ничего не отсеивается, поэтому результат можно переиспользовать, пока пользователь меняет
 * ограничения по размеру; отфильтрованный вариант — `detectSprites`, спрайт под точкой — `spriteAt`.
 */
export function analyze(image: ImageLike, options: AnalyzeOptions = {}): Analysis {
    assertImage(image);

    const area = clipRect(image, options.area);
    if (area.w === 0 || area.h === 0) return { area, sprites: [], ids: new Int32Array(0) };

    const { w, h } = area;
    const minAlpha = finite(options.minAlpha, 1);
    const gap = Math.max(0, Math.floor(finite(options.gap, 0)));

    const mask = buildMask(image, area, options.keys ?? [], minAlpha);
    const { labels: ids, count } = labelComponents(gap > 0 ? dilate(mask, w, h, gap) : mask, w, h);

    // The box and the pixel count come from the real pixels only: the pixels the gap added to join parts
    // must not stretch a sprite.
    // Рамка и число пикселей считаются только по настоящим пикселям: пиксели, добавленные зазором ради
    // склейки частей, не должны растягивать спрайт.
    const minX = new Int32Array(count).fill(w);
    const minY = new Int32Array(count).fill(h);
    const maxX = new Int32Array(count).fill(-1);
    const maxY = new Int32Array(count).fill(-1);
    const pixels = new Int32Array(count);

    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
            if (mask[i] === 0) {
                ids[i] = 0;
                continue;
            }

            const c = ids[i]! - 1;
            if (x < minX[c]!) minX[c] = x;
            if (x > maxX[c]!) maxX[c] = x;
            if (y < minY[c]!) minY[c] = y;
            if (y > maxY[c]!) maxY[c] = y;
            pixels[c]!++;
        }
    }

    const sprites: Sprite[] = [];
    for (let c = 0; c < count; c++) {
        sprites.push({
            x: area.x + minX[c]!,
            y: area.y + minY[c]!,
            w: maxX[c]! - minX[c]! + 1,
            h: maxY[c]! - minY[c]! + 1,
            pixels: pixels[c]!,
        });
    }

    return { area, sprites, ids };
}

/**
 * The sprite that owns the pixel (`x`, `y`) of the image, or null for background and for points outside the
 * searched area. Whatever its size: the user pointed at it.
 * Спрайт, которому принадлежит пиксель (`x`, `y`) изображения, или null для фона и для точек вне области
 * поиска. Любого размера: пользователь указал на него сам.
 */
export function spriteAt(analysis: Analysis, x: number, y: number): Sprite | null {
    const { area } = analysis;
    const px = Math.floor(x) - area.x;
    const py = Math.floor(y) - area.y;
    if (px < 0 || py < 0 || px >= area.w || py >= area.h) return null;

    const id = analysis.ids[py * area.w + px]!;
    return id === 0 ? null : analysis.sprites[id - 1]!;
}

export interface DetectOptions extends Omit<AnalyzeOptions, 'area'> {
    /**
     * Where to search: one rectangle or several, each searched on its own. Undefined searches the whole
     * image; an empty list searches nothing.
     * Где искать: один прямоугольник или несколько, каждый ищется отдельно. Без значения — всё изображение;
     * пустой список — не искать нигде.
     */
    region?: Rect | readonly Rect[];
    /**
     * Size limits on a sprite's box, in pixels. `min*` default to 1; a `max*` of 0 (or none) means no limit.
     * NaN counts as not set, so an empty number field can be passed as it is.
     * Ограничения на рамку спрайта, в пикселях. `min*` по умолчанию 1; `max*` равный 0 (или не заданный) —
     * без ограничения. NaN считается незаданным, поэтому пустое числовое поле можно передавать как есть.
     */
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    /**
     * Drops specks: sprites with fewer visible pixels than this. Default 0.
     * Отбрасывает крупинки: спрайты, у которых видимых пикселей меньше этого. По умолчанию 0.
     */
    minPixels?: number;
    /**
     * Keep at most this many sprites (the first ones in reading order). `total` still counts them all.
     * Оставить не больше стольких спрайтов (первых в порядке чтения). `total` всё равно считает все.
     */
    limit?: number;
    /**
     * `rows` (default) lists sprites row by row, left to right, as one reads a sheet: the numbering of frames
     * of an animation then follows the animation. `scan` lists them by their topmost pixel, which is what
     * the search finds first. The order is applied inside each region.
     * `rows` (по умолчанию) перечисляет спрайты строка за строкой, слева направо, как читают лист: нумерация
     * кадров анимации тогда идёт в порядке анимации. `scan` перечисляет по самому верхнему пикселю, это то,
     * что поиск находит первым. Порядок применяется внутри каждой области.
     */
    order?: 'rows' | 'scan';
}

export interface DetectResult {
    sprites: Sprite[];
    /**
     * How many sprites passed the filters, before `limit` cut the list.
     * Сколько спрайтов прошло фильтры, до того как `limit` обрезал список.
     */
    total: number;
}

/**
 * Finds the sprites of an image that pass the size filters. Sprites from several regions are listed region
 * by region; a sprite found twice with the same box is listed once.
 * Находит спрайты изображения, прошедшие фильтры по размеру. Спрайты из нескольких областей идут область за
 * областью; спрайт, найденный дважды с одной и той же рамкой, указан один раз.
 */
export function detectSprites(image: ImageLike, options: DetectOptions = {}): DetectResult {
    const minWidth = Math.max(1, finite(options.minWidth, 1));
    const minHeight = Math.max(1, finite(options.minHeight, 1));
    const maxWidth = finite(options.maxWidth, 0);
    const maxHeight = finite(options.maxHeight, 0);
    const minPixels = finite(options.minPixels, 0);

    const regions: readonly (Rect | undefined)[] =
        options.region === undefined ? [undefined] : 'w' in options.region ? [options.region] : options.region;

    const seen = new Set<string>();
    const found: Sprite[] = [];

    for (const area of regions) {
        const { sprites } = analyze(image, { keys: options.keys, minAlpha: options.minAlpha, gap: options.gap, area });

        for (const s of options.order === 'scan' ? sprites : inRows(sprites)) {
            if (s.w < minWidth || s.h < minHeight || s.pixels < minPixels) continue;
            if ((maxWidth > 0 && s.w > maxWidth) || (maxHeight > 0 && s.h > maxHeight)) continue;

            const key = `${s.x},${s.y},${s.w},${s.h}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push(s);
        }
    }

    const limit = options.limit === undefined ? Infinity : Math.max(0, Math.floor(finite(options.limit, Infinity)));
    return { sprites: found.slice(0, limit), total: found.length };
}

/**
 * Reading order: sprites are sorted from the top, and a sprite joins the current row while its centre lies
 * above the lowest edge seen in that row; otherwise it starts the next row. Each row then goes left to right.
 * A sprite much taller than its neighbours stretches the row it is in, which can pull the next row into it;
 * such a sheet reads left to right, which is also what a human would make of it.
 * Порядок чтения: спрайты сортируются сверху, и спрайт входит в текущую строку, пока его центр лежит выше
 * самого нижнего края, замеченного в этой строке; иначе он начинает следующую. Каждая строка идёт слева
 * направо. Спрайт много выше соседей растягивает свою строку, и в неё может втянуться следующая; такой лист
 * читается слева направо, как его прочёл бы и человек.
 */
function inRows(sprites: readonly Sprite[]): Sprite[] {
    const sorted = [...sprites].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: Sprite[][] = [];
    let bottom = -Infinity;

    for (const sprite of sorted) {
        if (rows.length === 0 || sprite.y + sprite.h / 2 >= bottom) {
            rows.push([sprite]);
            bottom = sprite.y + sprite.h;
        } else {
            rows[rows.length - 1]!.push(sprite);
            bottom = Math.max(bottom, sprite.y + sprite.h);
        }
    }

    return rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.y - b.y));
}
