import type { GifFrames } from './frames';
import type { ImageLike, Rect } from './types';

/**
 * Columns and rows of the most square grid that holds `count` cells.
 * Столбцы и строки самой «квадратной» сетки, в которую помещается `count` ячеек.
 */
export function balancedGrid(count: number): [cols: number, rows: number] {
    if (!(count > 0)) return [0, 0];

    let cols = Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);

    while (cols * rows < count) {
        cols++;
        rows = Math.ceil(count / cols);
    }

    return [cols, rows];
}

export interface Sheet extends ImageLike {
    cols: number;
    rows: number;
    /**
     * Where each frame sits on the sheet, in frame order.
     * Где каждый кадр лежит на листе, в порядке кадров.
     */
    cells: Rect[];
}

/**
 * Lays the frames of a GIF out on one sheet, `gap` transparent pixels apart so that the search finds each
 * frame as a sprite of its own. There is no gap on the outer edges.
 * Раскладывает кадры GIF на один лист, на расстоянии `gap` прозрачных пикселей, чтобы поиск находил каждый
 * кадр отдельным спрайтом. По внешним краям зазора нет.
 */
export function framesToSheet(gif: GifFrames, gap = 10): Sheet {
    const [cols, rows] = balancedGrid(gif.frames.length);
    const { width: fw, height: fh } = gif;

    const width = cols > 0 ? cols * fw + (cols - 1) * gap : 0;
    const height = rows > 0 ? rows * fh + (rows - 1) * gap : 0;
    const data = new Uint8ClampedArray(width * height * 4);
    const cells: Rect[] = [];

    gif.frames.forEach((frame, i) => {
        const x = (i % cols) * (fw + gap);
        const y = Math.floor(i / cols) * (fh + gap);
        cells.push({ x, y, w: fw, h: fh });

        for (let row = 0; row < fh; row++) {
            data.set(frame.data.subarray(row * fw * 4, (row + 1) * fw * 4), ((y + row) * width + x) * 4);
        }
    });

    return { width, height, data, cols, rows, cells };
}
