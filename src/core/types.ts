/**
 * Pixels the way `ImageData` gives them (RGBA, row after row). The core reads nothing else, so it runs
 * in a worker and in Node tests alike, with no DOM.
 * Пиксели в том виде, как их отдаёт `ImageData` (RGBA, строка за строкой). Ядро больше ничего не читает,
 * поэтому работает и в воркере, и в тестах на Node, без DOM.
 */
export interface ImageLike {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray | Uint8Array;
}

/**
 * A rectangle in image pixels: `x`, `y` is the top-left pixel, `w`, `h` count pixels.
 * Прямоугольник в пикселях изображения: `x`, `y` — левый верхний пиксель, `w`, `h` — число пикселей.
 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * A found sprite: its box and how many visible pixels it holds.
 * Найденный спрайт: его рамка и число видимых пикселей в нём.
 */
export interface Sprite extends Rect {
    pixels: number;
}
