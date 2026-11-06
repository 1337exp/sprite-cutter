export interface EncodedFrame {
    x?: number;
    y?: number;
    width: number;
    height: number;
    /** Palette indices 0…3, row after row, top to bottom. */
    indices: readonly number[];
    transparent?: number;
    disposal?: number;
    delay?: number;
    /** Real LZW with a growing dictionary instead of a clear code before every pixel. */
    compress?: boolean;
    /** Store the rows in the 4-pass interlaced order. */
    interlaced?: boolean;
}

type Rgb = readonly [number, number, number];

class BitWriter {
    private readonly bytes: number[] = [];
    private acc = 0;
    private bits = 0;

    put(code: number, width: number): void {
        this.acc |= code << this.bits;
        this.bits += width;
        while (this.bits >= 8) {
            this.bytes.push(this.acc & 255);
            this.acc >>= 8;
            this.bits -= 8;
        }
    }

    finish(): number[] {
        if (this.bits > 0) this.bytes.push(this.acc & 255);
        return this.bytes;
    }
}

const MIN_CODE_SIZE = 2; // four colours: clear = 4, end = 5

/**
 * No compression at all: a clear code before every pixel keeps the dictionary empty, so every code is 3 bits.
 * Никакого сжатия: код очистки перед каждым пикселем держит словарь пустым, и каждый код занимает 3 бита.
 */
function lzwPlain(indices: readonly number[]): number[] {
    const out = new BitWriter();
    for (const index of indices) {
        out.put(1 << MIN_CODE_SIZE, MIN_CODE_SIZE + 1);
        out.put(index, MIN_CODE_SIZE + 1);
    }
    out.put((1 << MIN_CODE_SIZE) + 1, MIN_CODE_SIZE + 1);
    return out.finish();
}

/**
 * The textbook GIF LZW: the dictionary grows with every code written, the code width grows with it up to 12
 * bits, and a full table is reset with a clear code. This is what real files contain.
 * Учебный LZW из GIF: словарь растёт с каждым записанным кодом, разрядность кодов растёт вместе с ним до
 * 12 бит, а полная таблица сбрасывается кодом очистки. Именно это лежит в настоящих файлах.
 */
function lzwCompress(indices: readonly number[]): number[] {
    const clear = 1 << MIN_CODE_SIZE;
    const eoi = clear + 1;
    const out = new BitWriter();

    let size = MIN_CODE_SIZE + 1;
    let next = eoi + 1;
    let table = new Map<number, number>();

    out.put(clear, size);
    let prefix = indices[0]!;

    for (let i = 1; i < indices.length; i++) {
        const k = indices[i]!;
        const key = (prefix << 8) | k;
        const known = table.get(key);

        if (known !== undefined) {
            prefix = known;
            continue;
        }

        out.put(prefix, size);
        if (next === 4096) {
            out.put(clear, size);
            table = new Map();
            next = eoi + 1;
            size = MIN_CODE_SIZE + 1;
        } else {
            if (next >= 1 << size) size++;
            table.set(key, next++);
        }
        prefix = k;
    }

    out.put(prefix, size);
    out.put(eoi, size);
    return out.finish();
}

/**
 * Row order of an interlaced image: every 8th row from 0, every 8th from 4, every 4th from 2, every 2nd from 1.
 */
function interlacedRows(height: number): number[] {
    const rows: number[] = [];
    for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
        for (let y = start; y < height; y += step) rows.push(y);
    }
    return rows;
}

/**
 * A tiny GIF89a writer for tests, with a 4-colour global palette. It is not a general encoder (the decoder
 * is the thing under test); it only has to produce files that are valid GIFs.
 * Крошечный писатель GIF89a для тестов, с глобальной палитрой из 4 цветов. Не универсальный кодировщик
 * (проверяется декодер); ему достаточно выдавать корректные GIF.
 */
export function encodeGif(width: number, height: number, palette: readonly Rgb[], frames: readonly EncodedFrame[]): Uint8Array {
    const out: number[] = [];
    const push16 = (v: number) => out.push(v & 255, (v >> 8) & 255);

    for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
    push16(width);
    push16(height);
    out.push(0x80 | (7 << 4) | 1, 0, 0); // global palette of 4 colours, background 0, no aspect ratio
    for (let i = 0; i < 4; i++) out.push(...(palette[i] ?? [0, 0, 0]));

    for (const frame of frames) {
        const hasTransparent = frame.transparent !== undefined;

        out.push(0x21, 0xf9, 0x04, ((frame.disposal ?? 0) << 2) | (hasTransparent ? 1 : 0));
        push16(frame.delay ?? 0);
        out.push(frame.transparent ?? 0, 0);

        out.push(0x2c);
        push16(frame.x ?? 0);
        push16(frame.y ?? 0);
        push16(frame.width);
        push16(frame.height);
        out.push(frame.interlaced ? 0x40 : 0); // no local palette

        const stored = frame.interlaced
            ? interlacedRows(frame.height).flatMap((y) => frame.indices.slice(y * frame.width, (y + 1) * frame.width))
            : frame.indices;
        const bytes = frame.compress ? lzwCompress(stored) : lzwPlain(stored);

        out.push(MIN_CODE_SIZE);
        for (let i = 0; i < bytes.length; i += 255) {
            const chunk = bytes.slice(i, i + 255);
            out.push(chunk.length, ...chunk);
        }
        out.push(0);
    }

    out.push(0x3b);
    return Uint8Array.from(out);
}
