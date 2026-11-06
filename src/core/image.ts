import type { ImageLike, Rect } from './types';

/**
 * Throws a RangeError when the size is not a whole non-negative number or the data is too short for it.
 * Бросает RangeError, если размер не целое неотрицательное число или данных для него не хватает.
 */
export function assertImage(image: ImageLike): void {
    const { width, height, data } = image;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
        throw new RangeError(`Image size must be whole and not negative, got ${width}x${height}`);
    }
    if (data.length < width * height * 4) {
        throw new RangeError(`Image data is too short: ${data.length} bytes for ${width}x${height}`);
    }
}

/**
 * Clips `rect` to the image; the whole image when there is no `rect`. Accepts a rectangle dragged in any
 * direction (negative `w`, `h`) and returns an empty one when nothing is left.
 * Обрезает `rect` по изображению; без `rect` — всё изображение. Принимает прямоугольник, протянутый в любую
 * сторону (отрицательные `w`, `h`), а если ничего не осталось — возвращает пустой.
 */
export function clipRect(image: Pick<ImageLike, 'width' | 'height'>, rect?: Rect): Rect {
    if (!rect) return { x: 0, y: 0, w: image.width, h: image.height };
    if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return { x: 0, y: 0, w: 0, h: 0 };

    const x0 = Math.min(image.width, Math.max(0, Math.floor(Math.min(rect.x, rect.x + rect.w))));
    const x1 = Math.min(image.width, Math.max(0, Math.ceil(Math.max(rect.x, rect.x + rect.w))));
    const y0 = Math.min(image.height, Math.max(0, Math.floor(Math.min(rect.y, rect.y + rect.h))));
    const y1 = Math.min(image.height, Math.max(0, Math.ceil(Math.max(rect.y, rect.y + rect.h))));

    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Copies the pixels of `rect` into a new image. Unlike `clipRect` it is strict: the rectangle must be at
 * least one pixel big, whole, and lie entirely inside the image, because a cut that quietly came out
 * smaller than its coordinates say would put a wrong picture into an archive.
 * Копирует пиксели `rect` в новое изображение. В отличие от `clipRect` строгая: прямоугольник должен быть
 * не меньше пикселя, целым и целиком лежать внутри изображения, потому что вырез, молча получившийся
 * меньше своих координат, положил бы в архив не ту картинку.
 */
export function cropImage(image: ImageLike, rect: Rect): ImageLike {
    assertImage(image);

    const { x, y, w, h } = rect;
    const whole = [x, y, w, h].every(Number.isInteger);
    if (!whole || w < 1 || h < 1 || x < 0 || y < 0 || x + w > image.width || y + h > image.height) {
        throw new RangeError(`Cannot cut ${w}x${h} at ${x},${y} out of a ${image.width}x${image.height} image`);
    }

    const data = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
        const from = ((y + row) * image.width + x) * 4;
        data.set(image.data.subarray(from, from + w * 4), row * w * 4);
    }

    return { width: w, height: h, data };
}
