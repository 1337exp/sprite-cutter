import { GifReader } from './gif';

export interface GifFrame {
    /**
     * The whole picture at this moment (RGBA, `width` × `height`), earlier frames already composed in.
     * Вся картинка в этот момент (RGBA, `width` × `height`), прежние кадры уже наложены.
     */
    data: Uint8ClampedArray;
    /** Hundredths of a second. / Сотые доли секунды. */
    delay: number;
}

export interface GifFrames {
    width: number;
    height: number;
    frames: GifFrame[];
}

/**
 * Decodes every frame of a GIF into a full picture. Optimised GIFs store only what changed from the
 * previous frame, so each frame is drawn over the running picture after the previous frame's disposal
 * (leave, clear to transparent, or restore what was under it) is applied.
 * Декодирует каждый кадр GIF в полную картинку. Оптимизированные GIF хранят только изменения относительно
 * прошлого кадра, поэтому каждый кадр рисуется поверх текущей картинки после применения способа удаления
 * прошлого кадра (оставить, стереть в прозрачное или вернуть то, что было под ним).
 */
export function decodeGif(buffer: Uint8Array): GifFrames {
    const reader = new GifReader(buffer);
    const { width, height } = reader;

    const canvas = new Uint8ClampedArray(width * height * 4);
    const frames: GifFrame[] = [];

    let previous: ReturnType<GifReader['frameInfo']> | null = null;
    let backup: Uint8ClampedArray | null = null;

    for (let i = 0; i < reader.numFrames(); i++) {
        const info = reader.frameInfo(i);

        if (previous?.disposal === 2) {
            const x0 = Math.min(width, previous.x);
            const x1 = Math.min(width, previous.x + previous.width);
            const y1 = Math.min(height, previous.y + previous.height);
            for (let y = Math.min(height, previous.y); y < y1; y++) canvas.fill(0, (y * width + x0) * 4, (y * width + x1) * 4);
        } else if (previous?.disposal === 3 && backup) {
            canvas.set(backup);
        }

        backup = info.disposal === 3 ? canvas.slice() : null;

        reader.decodeAndBlitFrame(i, canvas);
        frames.push({ data: canvas.slice(), delay: info.delay });
        previous = info;
    }

    return { width, height, frames };
}
