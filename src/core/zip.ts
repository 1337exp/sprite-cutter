import { crc32 } from './crc32';

export interface ZipEntry {
    /**
     * Path inside the archive, with `/` as the separator, e.g. `sprites/hero.png`.
     * Путь внутри архива, разделитель `/`, например `sprites/hero.png`.
     */
    name: string;
    data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_ARCHIVE = 0x06054b50;
const VERSION = 20; // 2.0: the lowest that every unzip tool understands
const UTF8_NAMES = 0x0800;
const STORED = 0;

/**
 * A path that would climb out of the folder it is unpacked into (`../x`, `/etc/x`, `a\..\x`) is how a ZIP
 * overwrites files it should not touch, so such names never get in.
 * Путь, который выбрался бы из папки распаковки (`../x`, `/etc/x`, `a\..\x`), — это способ ZIP затереть то, что
 * ему трогать нельзя, поэтому такие имена внутрь не попадают.
 */
function assertName(name: string): void {
    const unsafe =
        name === '' ||
        name.startsWith('/') ||
        name.includes('\\') ||
        /[\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some((part) => part === '' || part === '.' || part === '..');

    if (unsafe) throw new Error(`Unsafe name for a ZIP entry: ${JSON.stringify(name)}`);
}

/**
 * Writes a ZIP archive. Files are stored as they are, without compression: what goes in here is PNG, which is
 * compressed already, plus a few small text files. Names are UTF-8. No ZIP64, so up to 65 535 files and 4 GiB.
 * Пишет ZIP-архив. Файлы кладутся как есть, без сжатия: сюда идут PNG, которые уже сжаты, и несколько
 * маленьких текстов. Имена в UTF-8. Без ZIP64: до 65 535 файлов и 4 ГиБ.
 */
export function createZip(entries: readonly ZipEntry[], date: Date = new Date()): Uint8Array<ArrayBuffer> {
    if (entries.length > 0xffff) throw new RangeError(`${entries.length} files do not fit into a ZIP without ZIP64`);

    const encoder = new TextEncoder();
    const seen = new Set<string>();
    const names = entries.map(({ name }) => {
        assertName(name);
        if (seen.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
        seen.add(name);
        return encoder.encode(name);
    });

    // DOS date and time, in local time, as the format wants them. The format starts in 1980.
    // Дата и время DOS, местные, как того требует формат. Формат начинается с 1980 года.
    const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);

    let total = 22;
    entries.forEach((entry, i) => {
        total += 30 + names[i]!.length + entry.data.length + 46 + names[i]!.length;
    });
    if (total > 0xffffffff) throw new RangeError('The archive is bigger than a ZIP without ZIP64 can hold');

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    const crcs: number[] = [];
    const offsets: number[] = [];
    let p = 0;

    entries.forEach((entry, i) => {
        const name = names[i]!;
        const crc = crc32(entry.data);
        crcs.push(crc);
        offsets.push(p);

        view.setUint32(p, LOCAL_HEADER, true);
        view.setUint16(p + 4, VERSION, true);
        view.setUint16(p + 6, UTF8_NAMES, true);
        view.setUint16(p + 8, STORED, true);
        view.setUint16(p + 10, dosTime, true);
        view.setUint16(p + 12, dosDate, true);
        view.setUint32(p + 14, crc, true);
        view.setUint32(p + 18, entry.data.length, true);
        view.setUint32(p + 22, entry.data.length, true);
        view.setUint16(p + 26, name.length, true);
        view.setUint16(p + 28, 0, true);
        out.set(name, p + 30);
        out.set(entry.data, p + 30 + name.length);
        p += 30 + name.length + entry.data.length;
    });

    const centralStart = p;
    entries.forEach((entry, i) => {
        const name = names[i]!;

        view.setUint32(p, CENTRAL_HEADER, true);
        view.setUint16(p + 4, VERSION, true);
        view.setUint16(p + 6, VERSION, true);
        view.setUint16(p + 8, UTF8_NAMES, true);
        view.setUint16(p + 10, STORED, true);
        view.setUint16(p + 12, dosTime, true);
        view.setUint16(p + 14, dosDate, true);
        view.setUint32(p + 16, crcs[i]!, true);
        view.setUint32(p + 20, entry.data.length, true);
        view.setUint32(p + 24, entry.data.length, true);
        view.setUint16(p + 28, name.length, true);
        // extra field, comment, disk number, internal and external attributes: all zero
        view.setUint32(p + 42, offsets[i]!, true);
        out.set(name, p + 46);
        p += 46 + name.length;
    });

    view.setUint32(p, END_OF_ARCHIVE, true);
    view.setUint16(p + 8, entries.length, true);
    view.setUint16(p + 10, entries.length, true);
    view.setUint32(p + 12, p - centralStart, true);
    view.setUint32(p + 16, centralStart, true);

    return out;
}
