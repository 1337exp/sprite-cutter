import { assertImage, cropImage } from './image';
import { fileSafeName, resolveNames } from './names';
import { toCss, toJson, type CssOptions, type ExportSprite } from './output';
import { encodePng } from './png';
import type { ImageLike } from './types';
import { createZip, type ZipEntry } from './zip';

export interface ArchiveOptions extends Pick<CssOptions, 'basePath' | 'retina' | 'percent'> {
    /**
     * The sheet the sprite rectangles refer to.
     * Лист, к которому относятся прямоугольники спрайтов.
     */
    image: ImageLike;
    sprites: readonly ExportSprite[];
    /**
     * File name of the sheet that the CSS points to, e.g. `hero.png`.
     * Имя файла листа, на который ссылается CSS, например `hero.png`.
     */
    imageName: string;
    /**
     * Put the sheet into the archive too, under `imageName` (which must end in `.png`). Needed when the sheet
     * was built here, from a GIF: the user has no such file, and the JSON and CSS would point at nothing.
     * Положить в архив и сам лист, под именем `imageName` (оно должно кончаться на `.png`). Нужно, когда лист
     * собран здесь, из GIF: такого файла у пользователя нет, и JSON с CSS указывали бы в пустоту.
     */
    includeSheet?: boolean;
    /**
     * Base name of the `.json` and `.css` files. Default `spritesheet`.
     * Базовое имя файлов `.json` и `.css`. По умолчанию `spritesheet`.
     */
    name?: string;
    /**
     * Modification time written for the files. Now by default.
     * Время изменения, которое пишется у файлов. По умолчанию текущее.
     */
    date?: Date;
    /**
     * Called after each PNG is made, so a long export can show progress.
     * Вызывается после каждого готового PNG, чтобы долгий экспорт мог показывать прогресс.
     */
    onProgress?: (done: number, total: number) => void;
}

/**
 * Builds the ZIP the user downloads: `<name>.json`, `<name>.css`, every sprite as `sprites/<name>.png` and,
 * if asked, the sheet itself. Everything is made in memory, here, with no DOM and no libraries.
 * Собирает ZIP, который скачивает пользователь: `<name>.json`, `<name>.css`, каждый спрайт как
 * `sprites/<name>.png` и, если попросили, сам лист. Всё делается в памяти, здесь, без DOM и библиотек.
 */
export async function buildArchive(options: ArchiveOptions): Promise<Uint8Array<ArrayBuffer>> {
    const { image, sprites, imageName, includeSheet = false, date, onProgress } = options;
    const base = fileSafeName(options.name ?? '') || 'spritesheet';

    assertImage(image);
    if (includeSheet && !/\.png$/i.test(imageName)) {
        throw new RangeError(`The sheet is stored as PNG, so imageName must end in .png, got "${imageName}"`);
    }

    const names = resolveNames(sprites.map((s) => s.name));
    const encoder = new TextEncoder();
    const total = sprites.length + (includeSheet ? 1 : 0);
    let done = 0;

    const entries: ZipEntry[] = [
        { name: `${base}.json`, data: encoder.encode(toJson(sprites)) },
        {
            name: `${base}.css`,
            data: encoder.encode(
                toCss(sprites, {
                    image: imageName,
                    sheetWidth: image.width,
                    sheetHeight: image.height,
                    basePath: options.basePath,
                    retina: options.retina,
                    percent: options.percent,
                }),
            ),
        },
    ];

    if (includeSheet) {
        entries.push({ name: imageName, data: await encodePng(image) });
        onProgress?.(++done, total);
    }

    for (let i = 0; i < sprites.length; i++) {
        let piece: ImageLike;
        try {
            piece = cropImage(image, sprites[i]!);
        } catch (error) {
            throw new RangeError(`Sprite "${names[i]}": ${(error as Error).message}`);
        }

        entries.push({ name: `sprites/${names[i]}.png`, data: await encodePng(piece) });
        onProgress?.(++done, total);
    }

    return createZip(entries, date);
}
