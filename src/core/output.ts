import { cssClassName, makeUnique, resolveNames } from './names';
import type { Rect } from './types';

export interface ExportSprite extends Rect {
    /**
     * What the user called it; may be empty or unsafe, see `resolveNames`.
     * Как назвал пользователь; может быть пустым или небезопасным, см. `resolveNames`.
     */
    name: string;
}

/**
 * The sprites as a JSON array of `{ name, x, y, w, h }`, with the same names the archive's files have.
 * Спрайты в виде JSON-массива `{ name, x, y, w, h }`, с теми же именами, что у файлов архива.
 */
export function toJson(sprites: readonly ExportSprite[], indent = 4): string {
    const names = resolveNames(sprites.map((s) => s.name));
    const list = sprites.map((s, i) => ({ name: names[i], x: s.x, y: s.y, w: s.w, h: s.h }));
    return JSON.stringify(list, null, indent) + '\n';
}

/**
 * Backslashes become slashes, repeated slashes collapse (but not the `//` of `https://` or of a
 * protocol-relative URL), and a closing slash is added. Empty stays empty.
 * Обратные слэши становятся прямыми, повторы сворачиваются (но не `//` в `https://` и не `//` в URL без
 * протокола), в конец добавляется слэш. Пустое остаётся пустым.
 */
export function normalizeBasePath(path: string): string {
    const clean = path.trim().replace(/\\/g, '/').replace(/([^:])\/{2,}/g, '$1/');
    return clean !== '' && !clean.endsWith('/') ? `${clean}/` : clean;
}

export interface CssOptions {
    /**
     * File name of the sheet the rules cut from, e.g. `hero.png`.
     * Имя файла листа, из которого режут правила, например `hero.png`.
     */
    image: string;
    sheetWidth: number;
    sheetHeight: number;
    /**
     * A folder or URL put in front of `image`.
     * Папка или URL, которые ставятся перед `image`.
     */
    basePath?: string;
    /**
     * The sheet is drawn for a 2x screen: every size and offset is halved and `background-size` is written, so
     * the sprite is sharp on a dense display. Odd sizes give halves (`12.5px`), which are exact at 2x.
     * Лист нарисован для экрана 2x: все размеры и смещения делятся пополам и пишется `background-size`, так что
     * спрайт чёткий на плотном экране. Нечётные размеры дают половинки (`12.5px`), на 2x они точны.
     */
    retina?: boolean;
    /**
     * Position in percent instead of pixels, so the sprite keeps working when its box is scaled.
     * Позиция в процентах вместо пикселей, так что спрайт работает и при масштабировании его блока.
     */
    percent?: boolean;
}

const fmt = (n: number, digits: number): string => Number(n.toFixed(digits)).toString();
const px = (n: number): string => (n === 0 ? '0' : `${fmt(n, 3)}px`);

// A background-position of p% puts the point p% along the image over the point p% along the box. With a box
// exactly the size of the sprite that means p = x / (sheet - sprite). A sprite as big as the sheet has no
// room to move, any value does, and 0% avoids dividing by zero.
// Позиция p% совмещает точку на p% вдоль картинки с точкой на p% вдоль блока. При блоке ровно размером со
// спрайт это p = x / (лист - спрайт). У спрайта размером с лист двигаться некуда, подойдёт любое значение, а
// 0% избавляет от деления на ноль.
const percent = (offset: number, room: number): string => (room > 0 ? `${fmt((offset / room) * 100, 4)}%` : '0%');

const cssUrl = (path: string): string => `'${path.replace(/[\\']/g, '\\$&').replace(/\n/g, '\\a ')}'`;

/**
 * A CSS rule per sprite that shows just that sprite as a background of a box of its size.
 * По правилу CSS на спрайт, которое показывает именно его как фон блока его размера.
 */
export function toCss(sprites: readonly ExportSprite[], options: CssOptions): string {
    const { sheetWidth, sheetHeight, retina = false, percent: inPercent = false } = options;
    const k = retina ? 2 : 1;
    const url = cssUrl(normalizeBasePath(options.basePath ?? '') + options.image);
    const classes = makeUnique(resolveNames(sprites.map((s) => s.name)).map(cssClassName), true);

    const rules = sprites.map((s, i) => {
        const position = inPercent
            ? `${percent(s.x, sheetWidth - s.w)} ${percent(s.y, sheetHeight - s.h)}`
            : `${px(-s.x / k)} ${px(-s.y / k)}`;

        const lines = [`.${classes[i]} {`, `    background: url(${url}) no-repeat ${position};`];
        if (retina) lines.push(`    background-size: ${px(sheetWidth / k)} ${px(sheetHeight / k)};`);
        lines.push(`    width: ${px(s.w / k)};`, `    height: ${px(s.h / k)};`, '}');

        return lines.join('\n');
    });

    return rules.length ? rules.join('\n\n') + '\n' : '';
}
