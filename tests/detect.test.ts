import { describe, expect, it } from 'vitest';
import { analyze, detectSprites, spriteAt } from '../src/core/detect';
import { clipRect } from '../src/core/image';
import type { Sprite } from '../src/core/types';
import { art, blank, setPixel, WHITE } from './helpers/image';
import { mulberry32 } from './helpers/random';

const boxes = (sprites: readonly Sprite[]) => sprites.map(({ x, y, w, h }) => [x, y, w, h]);

describe('detectSprites: what is a sprite', () => {
    it('finds separate sprites, in the reading order of their first pixel', () => {
        const image = art([
            '##....',
            '##..#.',
            '......',
            '.###..',
        ]);

        const { sprites, total } = detectSprites(image);
        expect(total).toBe(3);
        expect(sprites).toEqual([
            { x: 0, y: 0, w: 2, h: 2, pixels: 4 },
            { x: 4, y: 1, w: 1, h: 1, pixels: 1 },
            { x: 1, y: 3, w: 3, h: 1, pixels: 3 },
        ]);
    });

    it('finds nothing in an empty or fully transparent image', () => {
        expect(detectSprites(blank(0, 0))).toEqual({ sprites: [], total: 0 });
        expect(detectSprites(blank(8, 8))).toEqual({ sprites: [], total: 0 });
    });

    it('joins diagonal neighbours: the old 4-way fill cut such a sprite apart', () => {
        const { sprites } = detectSprites(art([
            '#...',
            '.#..',
            '..#.',
        ]));
        expect(sprites).toEqual([{ x: 0, y: 0, w: 3, h: 3, pixels: 3 }]);
    });

    it('joins diagonal neighbours in the other direction too', () => {
        const { sprites } = detectSprites(art([
            '..#',
            '.#.',
            '#..',
        ]));
        expect(sprites).toEqual([{ x: 0, y: 0, w: 3, h: 3, pixels: 3 }]);
    });

    it('joins the two arms of a U that were labelled apart on the way down', () => {
        const { sprites } = detectSprites(art([
            '#...#',
            '#...#',
            '#####',
        ]));
        expect(sprites).toEqual([{ x: 0, y: 0, w: 5, h: 3, pixels: 9 }]);
    });

    it('keeps a sprite that sits inside the box of another: the old code swallowed it', () => {
        const ring = art([
            '#####',
            '#...#',
            '#.#.#',
            '#...#',
            '#####',
        ]);
        const { sprites } = detectSprites(ring);
        expect(sprites).toEqual([
            { x: 0, y: 0, w: 5, h: 5, pixels: 16 },
            { x: 2, y: 2, w: 1, h: 1, pixels: 1 },
        ]);
    });

    it('numbers sprites the same way on every run', () => {
        const image = art(['.#.#', '#...', '..##']);
        expect(detectSprites(image).sprites).toEqual(detectSprites(image).sprites);
    });
});

function fill(image: ReturnType<typeof blank>, x: number, y: number, w: number, h: number): void {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) setPixel(image, col, row, WHITE);
}

describe('detectSprites: order', () => {
    // A row of three sprites whose tops are at 2, 0 and 1, and one sprite in a row below, further left.
    const sheet = () => {
        const image = blank(14, 20);
        fill(image, 0, 2, 2, 6); // A
        fill(image, 5, 0, 2, 6); // B
        fill(image, 10, 1, 2, 6); // C
        fill(image, 2, 12, 2, 3); // D
        return image;
    };

    it('reads a sheet row by row, left to right, whatever the height of each sprite', () => {
        expect(boxes(detectSprites(sheet()).sprites)).toEqual([[0, 2, 2, 6], [5, 0, 2, 6], [10, 1, 2, 6], [2, 12, 2, 3]]);
    });

    it('can list sprites by their topmost pixel instead', () => {
        expect(boxes(detectSprites(sheet(), { order: 'scan' }).sprites)).toEqual([[5, 0, 2, 6], [10, 1, 2, 6], [0, 2, 2, 6], [2, 12, 2, 3]]);
    });

    it('puts a lower row after the upper one even when it starts further left', () => {
        const image = blank(20, 12);
        fill(image, 10, 0, 3, 3);
        fill(image, 0, 8, 3, 3);
        expect(boxes(detectSprites(image).sprites)).toEqual([[10, 0, 3, 3], [0, 8, 3, 3]]);
    });

    it('applies the order inside each region, region by region', () => {
        const region = [{ x: 0, y: 0, w: 14, h: 10 }, { x: 0, y: 10, w: 14, h: 10 }];
        expect(boxes(detectSprites(sheet(), { region }).sprites)).toEqual([[0, 2, 2, 6], [5, 0, 2, 6], [10, 1, 2, 6], [2, 12, 2, 3]]);
    });

    it('lets limit keep the first sprites of the reading order', () => {
        expect(boxes(detectSprites(sheet(), { limit: 2 }).sprites)).toEqual([[0, 2, 2, 6], [5, 0, 2, 6]]);
    });

    it('reads left to right when one sprite is so tall that it holds the rows together', () => {
        const image = blank(20, 30);
        fill(image, 0, 0, 2, 25); // a tall one on the left
        fill(image, 16, 0, 2, 4);
        fill(image, 8, 10, 2, 4);
        fill(image, 12, 18, 2, 4);
        expect(boxes(detectSprites(image).sprites).map(([x]) => x)).toEqual([0, 8, 12, 16]);
    });
});

describe('detectSprites: gap', () => {
    it('joins parts that are at most `gap` empty pixels apart', () => {
        expect(detectSprites(art(['#.#'])).sprites).toHaveLength(2);
        expect(detectSprites(art(['#.#']), { gap: 1 }).sprites).toHaveLength(1);

        expect(detectSprites(art(['#..#']), { gap: 1 }).sprites).toHaveLength(2);
        expect(detectSprites(art(['#..#']), { gap: 2 }).sprites).toHaveLength(1);
    });

    it('counts the gap along both axes at once', () => {
        const image = art([
            '#..',
            '...',
            '..#',
        ]);
        expect(detectSprites(image, { gap: 0 }).sprites).toHaveLength(2);
        expect(detectSprites(image, { gap: 1 }).sprites).toHaveLength(1);
    });

    it('does not stretch the box over the pixels it added to join the parts', () => {
        const { sprites } = detectSprites(art(['#.#']), { gap: 1 });
        expect(sprites).toEqual([{ x: 0, y: 0, w: 3, h: 1, pixels: 2 }]);

        // A lone pixel with a wide gap stays one pixel.
        expect(detectSprites(art(['#..']), { gap: 2 }).sprites).toEqual([{ x: 0, y: 0, w: 1, h: 1, pixels: 1 }]);
    });

    it('measures between pixels, not between boxes', () => {
        // The speck lies inside the box of the L but is 4 empty rows away from its nearest pixel.
        const image = art([
            '#........',
            '#........',
            '#........',
            '#........',
            '#........',
            '#########',
        ]);
        setPixel(image, 6, 0, WHITE);

        expect(detectSprites(image, { gap: 3 }).sprites).toHaveLength(2);
        expect(detectSprites(image, { gap: 4 }).sprites).toHaveLength(1);
    });

    it('treats a missing, negative or NaN gap as 0', () => {
        const image = art(['#.#']);
        expect(detectSprites(image, { gap: -3 }).sprites).toHaveLength(2);
        expect(detectSprites(image, { gap: NaN }).sprites).toHaveLength(2);
    });
});

describe('detectSprites: background colours', () => {
    const BLACK = [0, 0, 0, 255] as const;
    const RED = [200, 30, 30, 255] as const;
    const NOISE = [10, 10, 10, 255] as const;
    const GREY = [16, 16, 16, 255] as const;

    const sheet = () => art(['........', '.RR..n..', '.RR.....', '.....g..'], { R: RED, n: NOISE, g: GREY }, BLACK);

    it('ignores pixels of the key colour', () => {
        const { sprites } = detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 0 }] });
        expect(boxes(sprites)).toEqual([[1, 1, 2, 2], [5, 1, 1, 1], [5, 3, 1, 1]]);
    });

    it('lets tolerance eat near-black noise around a black key: it did nothing before', () => {
        // The old tolerance was a share of the key's own channel value, and any share of 0 is 0.
        // (10, 10, 10) is 17.3 away from black, 5% of the black-to-white distance is 22.1.
        const { sprites } = detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 5 }] });
        expect(boxes(sprites)).toEqual([[1, 1, 2, 2], [5, 3, 1, 1]]);
    });

    it('cuts off at a distance: (16, 16, 16) is 27.7 from black, so 6% keeps it and 7% eats it', () => {
        expect(boxes(detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 6 }] }).sprites)).toEqual([[1, 1, 2, 2], [5, 3, 1, 1]]);
        expect(boxes(detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 7 }] }).sprites)).toEqual([[1, 1, 2, 2]]);
    });

    it('uses the same distance for a bright key as for a dark one', () => {
        const image = art(['.n.g.R.'], { n: [245, 245, 245, 255], g: [239, 239, 239, 255], R: RED }, [255, 255, 255, 255]);
        const { sprites } = detectSprites(image, { keys: [{ color: [255, 255, 255], tolerance: 5 }] });
        expect(boxes(sprites)).toEqual([[3, 0, 1, 1], [5, 0, 1, 1]]);
    });

    it('never eats a colour far from the key', () => {
        const { sprites } = detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 20 }] });
        expect(boxes(sprites)).toEqual([[1, 1, 2, 2]]);
    });

    it('takes several keys and 100% takes everything', () => {
        const keys = [{ color: [0, 0, 0] as const, tolerance: 0 }, { color: [200, 30, 30] as const, tolerance: 0 }];
        expect(boxes(detectSprites(sheet(), { keys }).sprites)).toEqual([[5, 1, 1, 1], [5, 3, 1, 1]]);
        expect(detectSprites(sheet(), { keys: [{ color: [0, 0, 0], tolerance: 100 }] }).total).toBe(0);
    });

    it('ignores faint pixels below minAlpha', () => {
        const image = art(['#.h'], { h: [255, 255, 255, 40] });
        expect(detectSprites(image).sprites).toHaveLength(2);
        expect(detectSprites(image, { minAlpha: 128 }).sprites).toHaveLength(1);
        expect(detectSprites(image, { minAlpha: 41 }).sprites).toHaveLength(1);
        expect(detectSprites(image, { minAlpha: 40 }).sprites).toHaveLength(2);
    });
});

describe('detectSprites: regions', () => {
    const row = () => art(['..##..##..']);

    it('searches only inside the region and cuts a sprite at its edge', () => {
        const { sprites } = detectSprites(row(), { region: { x: 3, y: 0, w: 4, h: 1 } });
        expect(boxes(sprites)).toEqual([[3, 0, 1, 1], [6, 0, 1, 1]]);
    });

    it('finds a sprite in a region that starts at x = 0 or y = 0: the old code skipped such zones', () => {
        const image = art(['##..', '##..']);
        expect(detectSprites(image, { region: { x: 0, y: 0, w: 4, h: 2 } }).total).toBe(1);
        expect(detectSprites(image, { region: { x: 0, y: 1, w: 4, h: 1 } }).total).toBe(1);
        expect(detectSprites(image, { region: { x: 1, y: 0, w: 3, h: 2 } }).total).toBe(1);
    });

    it('accepts a rectangle dragged from its bottom-right corner', () => {
        const { sprites } = detectSprites(row(), { region: { x: 7, y: 1, w: -5, h: -1 } });
        expect(boxes(sprites)).toEqual([[2, 0, 2, 1], [6, 0, 1, 1]]);
    });

    it('clips a region that sticks out of the image, and finds nothing outside it', () => {
        expect(boxes(detectSprites(row(), { region: { x: 5, y: -4, w: 100, h: 100 } }).sprites)).toEqual([[6, 0, 2, 1]]);
        expect(detectSprites(row(), { region: { x: 50, y: 50, w: 10, h: 10 } }).total).toBe(0);
        expect(detectSprites(row(), { region: { x: 0, y: 0, w: 0, h: 5 } }).total).toBe(0);
        expect(detectSprites(row(), { region: { x: NaN, y: 0, w: 5, h: 5 } }).total).toBe(0);
    });

    it('searches several regions in turn and lists a sprite found twice once', () => {
        const region = [{ x: 0, y: 0, w: 5, h: 1 }, { x: 0, y: 0, w: 5, h: 1 }, { x: 5, y: 0, w: 5, h: 1 }];
        expect(boxes(detectSprites(row(), { region }).sprites)).toEqual([[2, 0, 2, 1], [6, 0, 2, 1]]);
    });

    it('searches nowhere when the list is empty', () => {
        expect(detectSprites(row(), { region: [] }).total).toBe(0);
    });
});

describe('detectSprites: filters', () => {
    const image = art([
        '#..###..#',
        '...###...',
        '...###...',
    ]);

    it('drops sprites smaller than the minimum', () => {
        expect(boxes(detectSprites(image, { minWidth: 2 }).sprites)).toEqual([[3, 0, 3, 3]]);
        expect(boxes(detectSprites(image, { minHeight: 2 }).sprites)).toEqual([[3, 0, 3, 3]]);
        expect(boxes(detectSprites(image, { minPixels: 9 }).sprites)).toEqual([[3, 0, 3, 3]]);
    });

    it('drops sprites larger than the maximum, where 0 means no maximum', () => {
        expect(boxes(detectSprites(image, { maxWidth: 2 }).sprites)).toEqual([[0, 0, 1, 1], [8, 0, 1, 1]]);
        expect(boxes(detectSprites(image, { maxHeight: 2 }).sprites)).toEqual([[0, 0, 1, 1], [8, 0, 1, 1]]);
        expect(detectSprites(image, { maxWidth: 0, maxHeight: 0 }).total).toBe(3);
    });

    it('filters after the parts are joined', () => {
        // Two 1-pixel specks are too small alone, but 3 wide once the gap joins them.
        expect(detectSprites(art(['#.#']), { minWidth: 3 }).total).toBe(0);
        expect(detectSprites(art(['#.#']), { minWidth: 3, gap: 1 }).total).toBe(1);
    });

    it('takes NaN as "not set", the way an empty number field arrives', () => {
        const options = { minWidth: NaN, minHeight: NaN, maxWidth: NaN, maxHeight: NaN, minPixels: NaN, limit: NaN, gap: NaN, minAlpha: NaN };
        expect(detectSprites(image, options).total).toBe(3);
    });

    it('cuts the list at the limit but still counts everything', () => {
        const result = detectSprites(image, { limit: 2 });
        expect(boxes(result.sprites)).toEqual([[0, 0, 1, 1], [3, 0, 3, 3]]);
        expect(result.total).toBe(3);
        expect(detectSprites(image, { limit: 0 })).toEqual({ sprites: [], total: 3 });
    });
});

describe('spriteAt', () => {
    const image = art([
        '.##.',
        '....',
        '....',
        '.##.',
    ]);

    it('returns the sprite under the point, not the nearest one: the old click search ran off to a neighbour', () => {
        const analysis = analyze(image);
        expect(spriteAt(analysis, 1, 3)).toEqual({ x: 1, y: 3, w: 2, h: 1, pixels: 2 });
        expect(spriteAt(analysis, 2, 0)).toEqual({ x: 1, y: 0, w: 2, h: 1, pixels: 2 });
    });

    it('returns null for background and for points outside the image', () => {
        const analysis = analyze(image);
        expect(spriteAt(analysis, 0, 0)).toBeNull();
        expect(spriteAt(analysis, 1, 1)).toBeNull();
        expect(spriteAt(analysis, -1, 0)).toBeNull();
        expect(spriteAt(analysis, 4, 0)).toBeNull();
        expect(spriteAt(analysis, 1, 99)).toBeNull();
    });

    it('does not claim the empty pixels a gap bridged', () => {
        const analysis = analyze(art(['#.#']), { gap: 1 });
        expect(spriteAt(analysis, 0, 0)).toEqual(spriteAt(analysis, 2, 0));
        expect(spriteAt(analysis, 1, 0)).toBeNull();
        expect(Array.from(analysis.ids)).toEqual([1, 0, 1]);
    });

    it('works in the coordinates of the image when only an area was searched', () => {
        const analysis = analyze(image, { area: { x: 0, y: 2, w: 4, h: 2 } });
        expect(analysis.area).toEqual({ x: 0, y: 2, w: 4, h: 2 });
        expect(spriteAt(analysis, 1, 3)).toEqual({ x: 1, y: 3, w: 2, h: 1, pixels: 2 });
        expect(spriteAt(analysis, 1, 0)).toBeNull();
    });
});

describe('clipRect', () => {
    it('takes the whole image when there is no rectangle', () => {
        expect(clipRect({ width: 7, height: 5 })).toEqual({ x: 0, y: 0, w: 7, h: 5 });
    });

    it('rounds outwards so that a fractional edge keeps its pixel', () => {
        expect(clipRect({ width: 10, height: 10 }, { x: 1.5, y: 2.2, w: 2, h: 2 })).toEqual({ x: 1, y: 2, w: 3, h: 3 });
    });
});

describe('input checks', () => {
    it('refuses pixel data shorter than the size says', () => {
        expect(() => detectSprites({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toThrow(RangeError);
    });

    it('refuses a size that is not a whole number', () => {
        expect(() => detectSprites({ width: 1.5, height: 2, data: new Uint8ClampedArray(64) })).toThrow(RangeError);
        expect(() => detectSprites({ width: -1, height: 2, data: new Uint8ClampedArray(64) })).toThrow(RangeError);
    });

    it('reads plain Uint8Array data as well', () => {
        const data = new Uint8Array(2 * 1 * 4);
        data.set([9, 9, 9, 255], 0);
        expect(detectSprites({ width: 2, height: 1, data }).total).toBe(1);
    });
});

// ---------------------------------------------------------------------------------------------------------
// The same answers from a deliberately naive implementation: every pair of visible pixels is compared.
// Тот же ответ от намеренно наивной реализации: сравниваются все пары видимых пикселей.

function reference(points: readonly (readonly [number, number])[], gap: number): string[] {
    const parent = points.map((_, i) => i);
    const find = (a: number): number => {
        while (parent[a] !== a) a = parent[a]!;
        return a;
    };

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = Math.abs(points[i]![0] - points[j]![0]);
            const dy = Math.abs(points[i]![1] - points[j]![1]);
            if (Math.max(dx, dy) <= gap + 1) parent[find(i)] = find(j);
        }
    }

    const groups = new Map<number, (readonly [number, number])[]>();
    points.forEach((point, i) => {
        const root = find(i);
        groups.set(root, [...(groups.get(root) ?? []), point]);
    });

    return [...groups.values()]
        .map((group) => {
            const xs = group.map((p) => p[0]);
            const ys = group.map((p) => p[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            return `${x},${y},${Math.max(...xs) - x + 1},${Math.max(...ys) - y + 1},${group.length}`;
        })
        .sort();
}

describe('against a naive reference', () => {
    it('agrees on random images, for every gap', () => {
        const random = mulberry32(1337);

        for (let round = 0; round < 250; round++) {
            const width = 1 + Math.floor(random() * 28);
            const height = 1 + Math.floor(random() * 28);
            const density = 0.05 + random() * 0.4;

            const image = blank(width, height);
            const points: [number, number][] = [];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (random() < density) {
                        setPixel(image, x, y, WHITE);
                        points.push([x, y]);
                    }
                }
            }

            for (const gap of [0, 1, 2, 3]) {
                const got = detectSprites(image, { gap }).sprites.map((s) => `${s.x},${s.y},${s.w},${s.h},${s.pixels}`).sort();
                expect(got, `round ${round}, ${width}x${height}, gap ${gap}`).toEqual(reference(points, gap));
            }
        }
    });
});

describe('at scale', () => {
    it('finds thousands of sprites without mixing them up', () => {
        // 64 × 64 blocks of 6 × 6 pixels on an 8-pixel pitch: two clear pixels between neighbours.
        const size = 64 * 8;
        const image = blank(size, size);
        for (let by = 0; by < 64; by++) {
            for (let bx = 0; bx < 64; bx++) {
                for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) setPixel(image, bx * 8 + x, by * 8 + y, WHITE);
            }
        }

        const { sprites, total } = detectSprites(image);
        expect(total).toBe(64 * 64);
        expect(sprites.every((s) => s.w === 6 && s.h === 6 && s.pixels === 36)).toBe(true);
        expect(sprites[1]).toMatchObject({ x: 8, y: 0 });
        expect(sprites[64]).toMatchObject({ x: 0, y: 8 });

        // A gap of 2 bridges the two clear pixels and the whole sheet becomes one sprite.
        expect(detectSprites(image, { gap: 2 }).total).toBe(1);
        expect(detectSprites(image, { gap: 1 }).total).toBe(64 * 64);
    });
});
