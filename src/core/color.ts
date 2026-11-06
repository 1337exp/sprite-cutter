export type RGB = readonly [r: number, g: number, b: number];

/**
 * A colour to treat as background. `tolerance` is a percent, 0…100, of the longest possible distance
 * between two RGB colours (black to white): 0 matches the colour exactly, 100 matches everything.
 * Цвет, который считается фоном. `tolerance` — проценты, 0…100, от самого длинного расстояния между двумя
 * RGB-цветами (от чёрного до белого): 0 — только этот цвет, 100 — любой.
 */
export interface KeyColor {
    color: RGB;
    tolerance: number;
}

/**
 * Squared distance between black and white in RGB.
 * Квадрат расстояния между чёрным и белым в RGB.
 */
export const MAX_DISTANCE_SQ = 3 * 255 * 255;

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/;
const RGB_FN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
const RGBA_FN = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(?:0|1|0?\.\d+|1\.0+)\s*\)$/;

function channels(match: RegExpExecArray): RGB | null {
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return r <= 255 && g <= 255 && b <= 255 ? [r, g, b] : null;
}

/**
 * Reads `#rgb`, `#rrggbb` (the `#` is optional), `rgb(r, g, b)` and `rgba(r, g, b, a)`; the alpha is ignored.
 * Читает `#rgb`, `#rrggbb` (`#` необязателен), `rgb(r, g, b)` и `rgba(r, g, b, a)`; альфа игнорируется.
 */
export function parseColor(input: string): RGB | null {
    const text = input.trim().toLowerCase();

    const hex = HEX.exec(text);
    if (hex) {
        const h = hex[1]!;
        const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
        return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    }

    const fn = RGB_FN.exec(text) ?? RGBA_FN.exec(text);
    return fn ? channels(fn) : null;
}

/**
 * `#rrggbb`, lower case.
 * `#rrggbb` в нижнем регистре.
 */
export function formatHex(color: RGB): string {
    return '#' + color.map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function sameColor(a: RGB, b: RGB): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * The squared RGB distance a pixel may be from the key and still count as background.
 * Квадрат RGB-расстояния, на которое пиксель может отличаться от ключа и всё ещё считаться фоном.
 */
export function toleranceToLimitSq(tolerance: number): number {
    const t = Math.min(100, Math.max(0, Number.isFinite(tolerance) ? tolerance : 0)) / 100;
    return t * t * MAX_DISTANCE_SQ;
}
