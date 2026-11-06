import { describe, expect, it } from 'vitest';
import { normalizeBasePath, toCss, toJson } from '../src/core/output';

const hero = { name: 'hero', x: 10, y: 20, w: 30, h: 40 };
const sheet = { image: 'sheet.png', sheetWidth: 100, sheetHeight: 200 };

describe('toJson', () => {
    it('lists name, position and size of every sprite', () => {
        const json = toJson([hero, { name: 'tree', x: 0, y: 1, w: 2, h: 3 }]);
        expect(JSON.parse(json)).toEqual([
            { name: 'hero', x: 10, y: 20, w: 30, h: 40 },
            { name: 'tree', x: 0, y: 1, w: 2, h: 3 },
        ]);
    });

    it('indents by four spaces and ends with a newline', () => {
        expect(toJson([hero])).toBe('[\n    {\n        "name": "hero",\n        "x": 10,\n        "y": 20,\n        "w": 30,\n        "h": 40\n    }\n]\n');
    });

    it('is an empty array for no sprites', () => {
        expect(toJson([])).toBe('[]\n');
    });

    it('uses the names the files get: safe, filled in, all different', () => {
        const names = JSON.parse(toJson([{ ...hero, name: 'a/b' }, { ...hero, name: '' }, { ...hero, name: 'A_B' }, { ...hero, name: 'a_b' }])).map(
            (s: { name: string }) => s.name,
        );
        expect(names).toEqual(['a_b', 'sprite_1', 'A_B_2', 'a_b_3']);
    });

    it('ignores what a detected sprite carries besides its box', () => {
        expect(JSON.parse(toJson([{ ...hero, pixels: 99 } as typeof hero]))[0]).not.toHaveProperty('pixels');
    });
});

describe('normalizeBasePath', () => {
    it('makes a folder out of whatever was typed', () => {
        expect(normalizeBasePath('')).toBe('');
        expect(normalizeBasePath('   ')).toBe('');
        expect(normalizeBasePath('img')).toBe('img/');
        expect(normalizeBasePath('img/')).toBe('img/');
        expect(normalizeBasePath('assets\\img')).toBe('assets/img/');
        expect(normalizeBasePath('a//b///c')).toBe('a/b/c/');
        expect(normalizeBasePath('/')).toBe('/');
    });

    it('leaves the // of a URL alone', () => {
        expect(normalizeBasePath('https://cdn.example.com//x')).toBe('https://cdn.example.com/x/');
        expect(normalizeBasePath('//cdn.example.com/x')).toBe('//cdn.example.com/x/');
    });
});

describe('toCss', () => {
    it('cuts a sprite out of the sheet with a negative offset and the size of the sprite', () => {
        expect(toCss([hero], sheet)).toBe(
            ".hero {\n    background: url('sheet.png') no-repeat -10px -20px;\n    width: 30px;\n    height: 40px;\n}\n",
        );
    });

    it('separates rules with an empty line', () => {
        const css = toCss([hero, { ...hero, name: 'tree' }], sheet);
        expect(css.split('\n\n')).toHaveLength(2);
        expect(css.endsWith('}\n')).toBe(true);
    });

    it('is empty for no sprites', () => {
        expect(toCss([], sheet)).toBe('');
    });

    it('writes zero without a unit, and no minus zero', () => {
        expect(toCss([{ name: 'a', x: 0, y: 0, w: 5, h: 6 }], sheet)).toContain('no-repeat 0 0;');
    });

    it('halves everything for a 2x sheet and sets background-size', () => {
        expect(toCss([hero], { ...sheet, retina: true })).toBe(
            ".hero {\n    background: url('sheet.png') no-repeat -5px -10px;\n    background-size: 50px 100px;\n    width: 15px;\n    height: 20px;\n}\n",
        );
    });

    it('keeps the halves of odd sizes, which a 2x screen draws exactly', () => {
        const css = toCss([{ name: 'odd', x: 11, y: 21, w: 25, h: 5 }], { ...sheet, retina: true });
        expect(css).toContain('-5.5px -10.5px');
        expect(css).toContain('width: 12.5px;');
        expect(css).toContain('height: 2.5px;');
    });

    it('can position in percent, as offset over the room the sprite has to move in', () => {
        const css = toCss([hero], { ...sheet, percent: true });
        // 10 / (100 - 30) and 20 / (200 - 40)
        expect(css).toContain('no-repeat 14.2857% 12.5%;');
        expect(css).toContain('width: 30px;');
    });

    it('does not divide by zero for a sprite as big as the sheet', () => {
        const css = toCss([{ name: 'all', x: 0, y: 0, w: 100, h: 200 }], { ...sheet, percent: true });
        expect(css).toContain('no-repeat 0% 0%;');
        expect(css).not.toMatch(/NaN|Infinity/);
    });

    it('gives percent and 2x together the same percentages and the halved size', () => {
        const css = toCss([hero], { ...sheet, percent: true, retina: true });
        expect(css).toContain('no-repeat 14.2857% 12.5%;');
        expect(css).toContain('background-size: 50px 100px;');
        expect(css).toContain('width: 15px;');
    });

    it('puts the base path in front of the file name', () => {
        expect(toCss([hero], { ...sheet, basePath: 'assets\\img' })).toContain("url('assets/img/sheet.png')");
    });

    it('escapes a quote or backslash in the path, so it cannot break out of the url', () => {
        expect(toCss([hero], { ...sheet, image: "it's.png" })).toContain("url('it\\'s.png')");
        expect(toCss([hero], { ...sheet, image: "x');}body{display:none;}/*" })).toContain("url('x\\');}body{display:none;}/*')");
    });

    it('makes class names valid and different', () => {
        const css = toCss(
            [
                { ...hero, name: 'a b' },
                { ...hero, name: 'a-b' },
                { ...hero, name: '1st' },
                { ...hero, name: 'спрайт_1' },
                { ...hero, name: '' },
            ],
            sheet,
        );
        const classes = [...css.matchAll(/^\.(\S+) \{$/gm)].map((m) => m[1]);
        expect(classes).toEqual(['a-b', 'a-b_2', '_1st', 'спрайт_1', 'sprite_4']);
    });
});
