import { decodeGif, framesToSheet, isGif } from '../core';

export interface Pixels {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}

/**
 * An opened picture, ready to look at and to cut.
 * Открытая картинка, готовая к просмотру и нарезке.
 */
export interface LoadedSheet {
    /** Changes with every opening, so watchers can tell one sheet from the next. / Меняется при каждом открытии. */
    id: number;
    image: Pixels;
    /** The same pixels as a canvas: what is shown, and what thumbnails are cut from. / Те же пиксели холстом. */
    canvas: HTMLCanvasElement;
    /** What the user opened. / Что открыл пользователь. */
    fileName: string;
    /** The file the CSS points to. / Файл, на который ссылается CSS. */
    imageName: string;
    /** The sheet is not a file of the user's (a GIF, the example): the archive must carry it. / Листа нет в файлах пользователя: архив должен его нести. */
    includeSheet: boolean;
    /** How many GIF frames were laid out, 0 for a picture. / Сколько кадров GIF разложено, 0 для картинки. */
    gifFrames: number;
}

export type SheetErrorCode = 'notImage' | 'tooBig';

export class SheetError extends Error {
    constructor(
        readonly code: SheetErrorCode,
        readonly megapixels = 0,
    ) {
        super(code);
    }
}

/**
 * A sheet is held three times (pixels, canvas, the worker's copy), 4 bytes each pixel.
 * Лист держится трижды (пиксели, холст, копия воркера), по 4 байта на пиксель.
 */
export const MAX_MEGAPIXELS = 32;

const GIF_GAP = 10;
let nextId = 1;

export function canvasFor(image: Pixels): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d')!;
    const copy = context.createImageData(image.width, image.height);
    copy.data.set(image.data);
    context.putImageData(copy, 0, 0);

    return canvas;
}

export function makeSheet(
    image: Pixels,
    meta: Pick<LoadedSheet, 'fileName' | 'imageName' | 'includeSheet'> & { gifFrames?: number; canvas?: HTMLCanvasElement },
): LoadedSheet {
    return {
        id: nextId++,
        image,
        canvas: meta.canvas ?? canvasFor(image),
        fileName: meta.fileName,
        imageName: meta.imageName,
        includeSheet: meta.includeSheet,
        gifFrames: meta.gifFrames ?? 0,
    };
}

function assertSize(width: number, height: number): void {
    const megapixels = (width * height) / 1_000_000;
    if (megapixels > MAX_MEGAPIXELS) throw new SheetError('tooBig', Math.round(megapixels));
}

/**
 * Opens a file. A GIF with several frames is laid out frame by frame on a sheet, so every frame can be cut
 * like any other sprite; every other format goes through the browser's own decoder, unconverted.
 * Открывает файл. GIF с несколькими кадрами раскладывается по кадрам на лист, чтобы каждый кадр можно было
 * вырезать как любой другой спрайт; остальные форматы идут через декодер браузера, без преобразований.
 */
export async function loadSheet(file: File): Promise<LoadedSheet> {
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isGif(bytes)) {
        let gif;
        try {
            gif = decodeGif(bytes);
        } catch {
            throw new SheetError('notImage');
        }
        if (gif.frames.length === 0) throw new SheetError('notImage');

        if (gif.frames.length > 1) {
            const sheet = framesToSheet(gif, GIF_GAP);
            assertSize(sheet.width, sheet.height);
            const stem = file.name.replace(/\.[^.]+$/, '') || 'sheet';
            const pixels = { width: sheet.width, height: sheet.height, data: new Uint8ClampedArray(sheet.data) };
            return makeSheet(pixels, { fileName: file.name, imageName: `${stem}.png`, includeSheet: true, gifFrames: gif.frames.length });
        }

        // One frame is a picture like any other, and the user keeps the file the CSS points to.
        // Один кадр — картинка, как любая другая, и файл, на который указывает CSS, остаётся у пользователя.
        assertSize(gif.width, gif.height);
        const pixels = { width: gif.width, height: gif.height, data: new Uint8ClampedArray(gif.frames[0]!.data) };
        return makeSheet(pixels, { fileName: file.name, imageName: file.name, includeSheet: false });
    }

    let bitmap: ImageBitmap;
    try {
        // No colour conversion: a sprite must keep the exact RGB the artist painted.
        // Без преобразования цвета: спрайт должен сохранить тот RGB, что нарисовал художник.
        bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } catch {
        throw new SheetError('notImage');
    }

    try {
        assertSize(bitmap.width, bitmap.height);

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        return makeSheet(pixels, { fileName: file.name, imageName: file.name, includeSheet: false, canvas });
    } finally {
        bitmap.close();
    }
}
