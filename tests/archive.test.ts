import { describe, expect, it } from 'vitest';
import { buildArchive } from '../src/core/archive';
import { cropImage } from '../src/core/image';
import { art } from './helpers/image';
import { decodePng } from './helpers/png-decode';
import { readZip } from './helpers/zip-read';

const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;

const image = art(['RR....', 'RR....', '...GGG', '......'], { R: RED, G: GREEN });
const sprites = [
    { name: 'red', x: 0, y: 0, w: 2, h: 2 },
    { name: '', x: 3, y: 2, w: 3, h: 1 },
];
const DATE = new Date(2026, 10, 6, 14, 30, 20);

const base = { image, sprites, imageName: 'sheet.png', date: DATE };
const names = (zip: Uint8Array) => readZip(zip).map((e) => e.name);

describe('buildArchive', () => {
    it('packs the JSON, the CSS and a PNG per sprite, the sprites in a folder', async () => {
        expect(names(await buildArchive(base))).toEqual(['spritesheet.json', 'spritesheet.css', 'sprites/red.png', 'sprites/sprite_1.png']);
    });

    it('puts into each PNG exactly the pixels of its rectangle', async () => {
        const entries = readZip(await buildArchive(base));

        for (const [file, rect] of [['sprites/red.png', sprites[0]!], ['sprites/sprite_1.png', sprites[1]!]] as const) {
            const png = await decodePng(entries.find((e) => e.name === file)!.data);
            const expected = cropImage(image, rect);
            expect([png.width, png.height]).toEqual([expected.width, expected.height]);
            expect(Array.from(png.data)).toEqual(Array.from(expected.data));
        }
    });

    it('names the sprites alike in the JSON, the CSS and the files', async () => {
        const entries = readZip(await buildArchive(base));
        const text = (name: string) => new TextDecoder().decode(entries.find((e) => e.name === name)!.data);

        expect(JSON.parse(text('spritesheet.json')).map((s: { name: string }) => s.name)).toEqual(['red', 'sprite_1']);
        expect(text('spritesheet.css')).toContain('.red {');
        expect(text('spritesheet.css')).toContain('.sprite_1 {');
        expect(text('spritesheet.css')).toContain("url('sheet.png')");
    });

    it('passes the CSS options through', async () => {
        const entries = readZip(await buildArchive({ ...base, basePath: 'img', retina: true }));
        const css = new TextDecoder().decode(entries.find((e) => e.name === 'spritesheet.css')!.data);
        expect(css).toContain("url('img/sheet.png')");
        expect(css).toContain('background-size: 3px 2px;');
    });

    it('adds the sheet itself when asked, under the name the CSS uses', async () => {
        const entries = readZip(await buildArchive({ ...base, includeSheet: true }));
        expect(entries.map((e) => e.name)).toEqual(['spritesheet.json', 'spritesheet.css', 'sheet.png', 'sprites/red.png', 'sprites/sprite_1.png']);

        const png = await decodePng(entries.find((e) => e.name === 'sheet.png')!.data);
        expect(Array.from(png.data)).toEqual(Array.from(image.data));
    });

    it('stamps every file with the given time', async () => {
        const entries = readZip(await buildArchive(base));
        expect(new Set(entries.map((e) => `${e.dosDate}/${e.dosTime}`)).size).toBe(1);
        expect(entries[0]!.dosDate).toBe(((2026 - 1980) << 9) | (11 << 5) | 6);
    });

    it('reports progress after each PNG', async () => {
        const calls: [number, number][] = [];
        await buildArchive({ ...base, onProgress: (done, total) => calls.push([done, total]) });
        expect(calls).toEqual([[1, 2], [2, 2]]);

        calls.length = 0;
        await buildArchive({ ...base, includeSheet: true, onProgress: (done, total) => calls.push([done, total]) });
        expect(calls).toEqual([[1, 3], [2, 3], [3, 3]]);
    });

    it('survives names that are unsafe or equal: files stay inside sprites/ and differ', async () => {
        const result = names(
            await buildArchive({
                ...base,
                sprites: [
                    { name: '../evil', x: 0, y: 0, w: 1, h: 1 },
                    { name: 'Hero', x: 0, y: 0, w: 1, h: 1 },
                    { name: 'hero', x: 0, y: 0, w: 1, h: 1 },
                    { name: 'con', x: 0, y: 0, w: 1, h: 1 },
                ],
            }),
        );
        expect(result.slice(2)).toEqual(['sprites/.._evil.png', 'sprites/Hero.png', 'sprites/hero_2.png', 'sprites/_con.png']);
    });

    it('names the JSON and the CSS after `name`, made safe', async () => {
        expect(names(await buildArchive({ ...base, name: 'my sheet' })).slice(0, 2)).toEqual(['my sheet.json', 'my sheet.css']);
        expect(names(await buildArchive({ ...base, name: '../x' })).slice(0, 2)).toEqual(['.._x.json', '.._x.css']);
        expect(names(await buildArchive({ ...base, name: '' })).slice(0, 2)).toEqual(['spritesheet.json', 'spritesheet.css']);
    });

    it('makes an archive of two small files when there are no sprites', async () => {
        const entries = readZip(await buildArchive({ ...base, sprites: [] }));
        expect(entries.map((e) => e.name)).toEqual(['spritesheet.json', 'spritesheet.css']);
        expect(new TextDecoder().decode(entries[0]!.data)).toBe('[]\n');
    });

    it('refuses a sprite that is not inside the image, and says which', async () => {
        const outside = { name: 'big', x: 4, y: 0, w: 5, h: 1 };
        await expect(buildArchive({ ...base, sprites: [outside] })).rejects.toThrow(RangeError);
        await expect(buildArchive({ ...base, sprites: [outside] })).rejects.toThrow('Sprite "big"');
        await expect(buildArchive({ ...base, sprites: [{ name: 'flat', x: 0, y: 0, w: 0, h: 1 }] })).rejects.toThrow('Sprite "flat"');
    });

    it('refuses to store the sheet under a name that is not a .png', async () => {
        await expect(buildArchive({ ...base, imageName: 'sheet.gif', includeSheet: true })).rejects.toThrow('.png');
        // Without the sheet inside, the name is only what the CSS points to, and may be anything.
        await expect(buildArchive({ ...base, imageName: 'sheet.gif' })).resolves.toBeInstanceOf(Uint8Array);
    });
});
