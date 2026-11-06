/*!
 * GIF decoder.
 *
 * A trimmed fork of omggif (https://github.com/deanm/omggif, MIT): only the decoder is kept. The encoder
 * and the rest were cut because nothing here calls them, and every byte of this file is shipped to the
 * browser. In this repository it was also cleaned up: TypeScript types and camelCase field names, the
 * code style of the project, no console output (a damaged stream is decoded as far as it goes), the
 * loop-count and BGRA output that nothing reads are gone, and a frame that has no palette at all is
 * left empty instead of being read from garbage. The LZW routine and the block parsing follow the original.
 *
 * Форк omggif (https://github.com/deanm/omggif, MIT), урезанный до декодера. Кодировщик и остальное
 * убраны, потому что здесь их никто не зовёт, а каждый байт этого файла уезжает в браузер. В этом
 * репозитории код ещё и приведён в порядок: типы TypeScript и camelCase-имена полей, стиль проекта,
 * никакого вывода в консоль (повреждённый поток декодируется, сколько получится), число повторов и
 * вывод BGRA, которые никто не читает, убраны, а кадр вовсе без палитры остаётся пустым вместо чтения
 * мусора. Разбор LZW и блоков следует оригиналу.
 *
 * The original copyright and permission notice, as the license requires:
 *
 * (c) Dean McNamee <dean@gmail.com>, 2013.
 *
 * https://github.com/deanm/omggif
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/**
 * Whether the bytes start with a GIF header (GIF87a or GIF89a).
 * Начинаются ли байты с заголовка GIF (GIF87a или GIF89a).
 */
export function isValidData(buffer: ArrayLike<number>): boolean {
    let p = 0;
    return !(
        buffer[p++] !== 0x47 ||
        buffer[p++] !== 0x49 ||
        buffer[p++] !== 0x46 ||
        buffer[p++] !== 0x38 ||
        ((buffer[p++]! + 1) & 0xfd) !== 0x38 ||
        buffer[p++] !== 0x61
    );
}

function GifReaderLZWOutputIndexStream(code_stream: Uint8Array, p: number, output: Uint8Array, output_length: number): Uint8Array {
    const min_code_size = code_stream[p++]!;
    const clear_code = 1 << min_code_size;
    const eoi_code = clear_code + 1;

    let next_code = eoi_code + 1;
    let cur_code_size = min_code_size + 1; // Number of bits per code.
    let code_mask = (1 << cur_code_size) - 1;
    let cur_shift = 0;
    let cur = 0;
    let op = 0; // Output pointer.
    let subblock_size = code_stream[p++]!;

    const code_table = new Int32Array(4096); // Can be signed, we only use 20 bits.
    let prev_code = NaN; // Track code-1.

    while (true) {
        while (cur_shift < 16) {
            if (subblock_size === 0) break;

            cur |= code_stream[p++]! << cur_shift;
            cur_shift += 8;

            if (subblock_size === 1) {
                subblock_size = code_stream[p++]!;
            } else {
                --subblock_size;
            }
        }

        if (cur_shift < cur_code_size) break;

        const code = cur & code_mask;
        cur >>= cur_code_size;
        cur_shift -= cur_code_size;

        if (code === clear_code) {
            next_code = eoi_code + 1;
            cur_code_size = min_code_size + 1;
            code_mask = (1 << cur_code_size) - 1;
            prev_code = NaN;
            continue;
        } else if (code === eoi_code) {
            break;
        }

        const chase_code = code < next_code ? code : prev_code;
        let chase_length = 0;
        let chase = chase_code;
        while (chase > clear_code) {
            chase = code_table[chase]! >> 8;
            ++chase_length;
        }

        const k = chase;
        const op_end = op + chase_length + (chase_code !== code ? 1 : 0);

        // The stream is longer than the frame it claims to hold: keep what fits.
        // Поток длиннее кадра, который он обещает: оставляем то, что поместилось.
        if (op_end > output_length) return output;

        output[op++] = k;
        op += chase_length;

        let b = op; // Track pointer, writing backwards.

        if (chase_code !== code) output[op++] = k;

        chase = chase_code;

        let length = chase_length;
        while (length--) {
            chase = code_table[chase]!;
            output[--b] = chase & 0xff;
            chase >>= 8;
        }

        if (!isNaN(prev_code) && next_code < 4096) {
            code_table[next_code++] = (prev_code << 8) | k;
            if (next_code >= code_mask + 1 && cur_code_size < 12) {
                ++cur_code_size;
                code_mask = (code_mask << 1) | 1;
            }
        }

        prev_code = code;
    }

    return output;
}

export interface FrameInfo {
    /** Where the frame sits on the logical screen. / Где кадр лежит на экране. */
    x: number;
    y: number;
    width: number;
    height: number;
    hasLocalPalette: boolean;
    /** Byte offset of the palette (local, else global); null when the file has none. / Смещение палитры; null, если её нет. */
    paletteOffset: number | null;
    paletteSize: number | null;
    dataOffset: number;
    dataLength: number;
    /** Palette index that is see-through, or null. / Индекс палитры, который прозрачен, либо null. */
    transparentIndex: number | null;
    interlaced: boolean;
    /** Hundredths of a second. / Сотые доли секунды. */
    delay: number;
    /** What to do with the frame before the next one: 0-1 leave it, 2 clear it, 3 restore what was under it. / Что сделать с кадром перед следующим: 0-1 оставить, 2 стереть, 3 вернуть то, что было под ним. */
    disposal: number;
}

export class GifReader {
    readonly width: number;
    readonly height: number;

    private readonly data: Uint8Array;
    private readonly frames: FrameInfo[] = [];

    constructor(buffer: Uint8Array) {
        if (!isValidData(buffer)) throw new Error('Invalid GIF 87a/89a header');

        let p = 6; // header - skip

        this.width = buffer[p++]! | (buffer[p++]! << 8);
        this.height = buffer[p++]! | (buffer[p++]! << 8);
        this.data = buffer;

        const pf0 = buffer[p++]!;
        const global_palette_flag = pf0 >> 7;
        const num_global_colors_pow2 = pf0 & 0x7;
        const num_global_colors = 1 << (num_global_colors_pow2 + 1);

        p++; // background colour index
        p++; // pixel aspect ratio

        let global_palette_offset: number | null = null;
        let global_palette_size: number | null = null;

        if (global_palette_flag) {
            global_palette_offset = p;
            global_palette_size = num_global_colors;
            p += num_global_colors * 3;
        }

        let no_eof = true;
        let delay = 0;
        let transparent_index: number | null = null;
        let disposal = 0;

        while (no_eof && p < buffer.length) {
            switch (buffer[p++]) {
                case 0x21: // extension
                    switch (buffer[p++]) {
                        case 0xff: // application extension
                            if (
                                buffer[p] === 0x0b &&
                                buffer[p + 1] === 0x4e && buffer[p + 2] === 0x45 && buffer[p + 3] === 0x54 &&
                                buffer[p + 4] === 0x53 && buffer[p + 5] === 0x43 && buffer[p + 6] === 0x41 &&
                                buffer[p + 7] === 0x50 && buffer[p + 8] === 0x45 && buffer[p + 9] === 0x32 &&
                                buffer[p + 10] === 0x2e && buffer[p + 11] === 0x30 &&
                                buffer[p + 12] === 0x03 && buffer[p + 13] === 0x01 && buffer[p + 16] === 0
                            ) {
                                p += 17; // NETSCAPE2.0 loop count: not used, skipped
                            } else {
                                p += 12;
                                while (true) {
                                    const block_size = buffer[p++]!;
                                    if (block_size <= 0) break;
                                    p += block_size;
                                }
                            }
                            break;

                        case 0xf9: { // graphics control
                            if (buffer[p++] !== 0x04 || buffer[p + 4] !== 0) throw new Error('Invalid graphics extension block');

                            const pf1 = buffer[p++]!;
                            delay = buffer[p++]! | (buffer[p++]! << 8);
                            transparent_index = buffer[p++]!;
                            if ((pf1 & 1) === 0) transparent_index = null;
                            disposal = (pf1 >> 2) & 0x7;
                            p++;
                            break;
                        }

                        case 0x01: // plain text
                        case 0xfe: // comment
                            while (true) {
                                const block_size = buffer[p++]!;
                                if (block_size <= 0) break;
                                p += block_size;
                            }
                            break;

                        default:
                            throw new Error('Unknown graphic control label: 0x' + buffer[p - 1]!.toString(16));
                    }
                    break;

                case 0x2c: { // image
                    const x = buffer[p++]! | (buffer[p++]! << 8);
                    const y = buffer[p++]! | (buffer[p++]! << 8);
                    const w = buffer[p++]! | (buffer[p++]! << 8);
                    const h = buffer[p++]! | (buffer[p++]! << 8);
                    const pf2 = buffer[p++]!;
                    const local_palette_flag = pf2 >> 7;
                    const interlace_flag = (pf2 >> 6) & 1;
                    const num_local_colors_pow2 = pf2 & 0x7;
                    const num_local_colors = 1 << (num_local_colors_pow2 + 1);
                    let palette_offset = global_palette_offset;
                    let palette_size = global_palette_size;
                    let has_local_palette = false;

                    if (local_palette_flag) {
                        has_local_palette = true;
                        palette_offset = p;
                        palette_size = num_local_colors;
                        p += num_local_colors * 3;
                    }

                    const data_offset = p;
                    p++;
                    while (true) {
                        const block_size = buffer[p++]!;
                        if (block_size <= 0) break;
                        p += block_size;
                    }

                    this.frames.push({
                        x, y, width: w, height: h,
                        hasLocalPalette: has_local_palette,
                        paletteOffset: palette_offset,
                        paletteSize: palette_size,
                        dataOffset: data_offset,
                        dataLength: p - data_offset,
                        transparentIndex: transparent_index,
                        interlaced: !!interlace_flag,
                        delay,
                        disposal,
                    });
                    break;
                }

                case 0x3b: // trailer
                    no_eof = false;
                    break;

                default:
                    throw new Error('Unknown gif block: 0x' + buffer[p - 1]!.toString(16));
            }
        }
    }

    numFrames(): number {
        return this.frames.length;
    }

    frameInfo(frameNum: number): FrameInfo {
        const frame = this.frames[frameNum];
        if (frameNum < 0 || !frame) throw new Error('Frame index out of range');
        return frame;
    }

    /**
     * Draws the frame into `pixels` (RGBA, the size of the logical screen). Only the frame's own opaque
     * pixels are written, so the rest of `pixels` stays as it was: keeping the earlier frames under it and
     * applying `disposal` is the caller's job (see `decodeGif`).
     * Рисует кадр в `pixels` (RGBA, размером с экран). Пишутся только собственные непрозрачные пиксели
     * кадра, остальное в `pixels` не меняется: хранить прежние кадры под ним и применять `disposal` должен
     * вызывающий (см. `decodeGif`).
     */
    decodeAndBlitFrame(frameNum: number, pixels: Uint8Array | Uint8ClampedArray): void {
        const buffer = this.data;
        const frame = this.frameInfo(frameNum);

        const palette_offset = frame.paletteOffset;
        if (palette_offset === null) return;

        const num_pixels = frame.width * frame.height;
        const index_stream = new Uint8Array(num_pixels);

        GifReaderLZWOutputIndexStream(buffer, frame.dataOffset, index_stream, num_pixels);

        const trans = frame.transparentIndex === null ? 256 : frame.transparentIndex;

        const framewidth = frame.width;
        const framestride = this.width - framewidth;
        let xleft = framewidth;

        const opbeg = (frame.y * this.width + frame.x) * 4;
        const opend = ((frame.y + frame.height) * this.width + frame.x) * 4;
        let op = opbeg;

        let scanstride = framestride * 4;

        // Use scanstride to skip past the rows when interlacing.
        // This is skipping 7 rows for the first two passes, then 3 then 1.
        if (frame.interlaced) scanstride += this.width * 4 * 7;

        let interlaceskip = 8;

        for (let i = 0, il = index_stream.length; i < il; ++i) {
            const index = index_stream[i]!;

            if (xleft === 0) {
                op += scanstride;
                xleft = framewidth;

                if (op >= opend) {
                    scanstride = framestride * 4 + this.width * 4 * (interlaceskip - 1);
                    op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
                    interlaceskip >>= 1;
                }
            }

            if (index === trans) {
                op += 4;
            } else {
                pixels[op++] = buffer[palette_offset + index * 3]!;
                pixels[op++] = buffer[palette_offset + index * 3 + 1]!;
                pixels[op++] = buffer[palette_offset + index * 3 + 2]!;
                pixels[op++] = 255;
            }

            --xleft;
        }
    }
}
