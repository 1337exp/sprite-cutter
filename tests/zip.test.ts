import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/core/crc32';
import { createZip } from '../src/core/zip';
import { readZip } from './helpers/zip-read';

const bytes = (text: string) => new TextEncoder().encode(text);
const DATE = new Date(2026, 10, 6, 14, 30, 20);

describe('crc32', () => {
    it('gives the standard check values', () => {
        expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
        expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    it('continues over the next piece', () => {
        const whole = crc32(bytes('hello, world'));
        expect(crc32(bytes(', world'), crc32(bytes('hello')))).toBe(whole);
    });
});

describe('createZip', () => {
    it('stores files byte for byte, with names, flags and a valid directory', () => {
        const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
        const zip = createZip(
            [
                { name: 'a.txt', data: bytes('hello') },
                { name: 'dir/bytes.bin', data: everyByte },
                { name: 'empty', data: new Uint8Array(0) },
            ],
            DATE,
        );

        const entries = readZip(zip);
        expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dir/bytes.bin', 'empty']);
        expect(Array.from(entries[0]!.data)).toEqual(Array.from(bytes('hello')));
        expect(Array.from(entries[1]!.data)).toEqual(Array.from(everyByte));
        expect(entries[2]!.data.length).toBe(0);
        expect(entries.every((e) => e.method === 0)).toBe(true);
    });

    it('writes names as UTF-8 and says so', () => {
        const [entry] = readZip(createZip([{ name: 'sprites/спрайт ё_1.png', data: bytes('x') }], DATE));
        expect(entry!.name).toBe('sprites/спрайт ё_1.png');
        expect(entry!.flags & 0x0800).toBe(0x0800);
    });

    it('writes the time in the DOS format', () => {
        const [entry] = readZip(createZip([{ name: 'a', data: bytes('x') }], DATE));
        expect(entry!.dosDate).toBe(((2026 - 1980) << 9) | (11 << 5) | 6);
        expect(entry!.dosTime).toBe((14 << 11) | (30 << 5) | 10);
    });

    it('does not go before 1980, where the format starts', () => {
        const [entry] = readZip(createZip([{ name: 'a', data: bytes('x') }], new Date(1970, 0, 1)));
        expect(entry!.dosDate >> 9).toBe(0);
    });

    it('makes a valid archive of nothing: just the end record', () => {
        const zip = createZip([], DATE);
        expect(zip.length).toBe(22);
        expect(readZip(zip)).toEqual([]);
    });

    it('refuses names that would climb out of the folder it is unpacked into', () => {
        for (const name of ['', '/abs', '../x', 'a/../b', './x', 'a//b', 'a\\b', 'dir/', 'tab\tname', 'nul\u0000']) {
            expect(() => createZip([{ name, data: new Uint8Array(0) }], DATE), JSON.stringify(name)).toThrow('Unsafe name');
        }
    });

    it('refuses two entries with the same name', () => {
        const entry = { name: 'a', data: new Uint8Array(0) };
        expect(() => createZip([entry, entry], DATE)).toThrow('Duplicate');
    });

    it('takes 65 535 files but not 65 536', () => {
        const files = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) }));
        expect(readZip(createZip(files(65535), DATE))).toHaveLength(65535);
        expect(() => createZip(files(65536), DATE)).toThrow(RangeError);
    });
});
