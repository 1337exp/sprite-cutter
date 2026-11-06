import { makeSheet, type LoadedSheet } from './sheet';

type Rgb = readonly [number, number, number];

const PALETTE: Record<string, Rgb> = {
    r: [224, 49, 49],
    R: [255, 140, 140],
    b: [60, 110, 230],
    B: [150, 190, 255],
    g: [70, 190, 90],
    G: [30, 120, 60],
    k: [20, 24, 34],
    w: [255, 255, 255],
    y: [250, 205, 50],
    o: [225, 140, 30],
    n: [140, 90, 50],
    p: [170, 80, 200],
    P: [220, 150, 240],
};

const BACKGROUND: Rgb = [38, 70, 88];

const HEART = ['.rrr..rrr.', 'rRRrrrrrrr', 'rRrrrrrrrr', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....'];
const GEM = ['..bbbb..', '.bBBbbb.', 'bBbbbbbb', 'bbbbbbbb', '.bbbbbb.', '..bbbb..', '...bb...'];
const SLIME = ['...gggg...', '..gggggg..', '.gwkggwkg.', '.gggggggg.', 'gggggggggg', '.GGGGGGGG.'];
const COIN = ['..yyyy..', '.yoooyy.', 'yoyyyoyy', 'yoyyyoyy', 'yoyyyoyy', 'yoyyyoyy', '.yoooyy.', '..yyyy..'];
// Two bubbles float two rows above the cork: they join the bottle only when the gap is 2 or more.
// Два пузырька висят двумя строками выше пробки: к склянке они присоединяются, только если зазор 2 и больше.
const POTION = ['..w..w', '......', '......', '..nn..', '..ww..', '..ww..', '.pppp.', 'pPppPp', 'pppppp', '.pppp.'];

/**
 * A small sheet drawn in code: five sprites on an opaque background, so the whole path (find the
 * background, cut, export) can be tried without a file. Nothing is downloaded, nothing is stored.
 * Небольшой лист, нарисованный кодом: пять спрайтов на непрозрачном фоне, чтобы весь путь (найти фон,
 * нарезать, экспортировать) можно было попробовать без файла. Ничего не скачивается и не хранится.
 */
export function makeExample(): LoadedSheet {
    const art = [HEART, GEM, SLIME, COIN, POTION];
    const margin = 8;
    const gap = 8;
    const floor = 22;

    const width = margin * 2 + gap * (art.length - 1) + art.reduce((sum, a) => sum + a[0]!.length, 0);
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i++) data.set([...BACKGROUND, 255], i * 4);

    let x0 = margin;
    for (const rows of art) {
        const y0 = floor - rows.length;
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const colour = PALETTE[row[x]!];
                if (colour) data.set([...colour, 255], ((y0 + y) * width + x0 + x) * 4);
            }
        });
        x0 += rows[0]!.length + gap;
    }

    return makeSheet({ width, height, data }, { fileName: 'example.png', imageName: 'example.png', includeSheet: true });
}
