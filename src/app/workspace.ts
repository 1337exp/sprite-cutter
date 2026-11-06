import { confirm, toast } from '@1337exp/taoui';
import { computed, inject, reactive, ref, shallowRef, watch, type InjectionKey } from 'vue';
import {
    buildArchive,
    cropImage,
    encodePng,
    formatHex,
    guessBackground,
    resolveNames,
    toCss,
    toJson,
    type ExportSprite,
    type Rect,
    type Sprite,
} from '../core';
import { downloadBlob } from '@1337exp/taoux/file';
import { makeExample } from './example';
import { t } from './i18n';
import { DEFAULT_SETTINGS, DEFAULT_TOLERANCE, loadSettings, saveSettings, toDetectOptions, type KeyEntry, type Settings } from './settings';
import { loadSheet, MAX_MEGAPIXELS, SheetError, type LoadedSheet } from './sheet';
import type { WorkerIn, WorkerOut } from './worker/protocol';

/**
 * A found sprite plus what the user did to it. The object lives as long as its rectangle keeps being found,
 * so a name and a checkbox survive a change of the search settings and come back if they are changed back.
 * Найденный спрайт и то, что с ним сделал пользователь. Объект живёт, пока находится его прямоугольник, так что
 * имя и галочка переживают смену настроек поиска и возвращаются, если настройки вернуть.
 */
export interface SpriteEntry {
    key: string;
    rect: Sprite;
    defaultName: string;
    name: string;
    included: boolean;
    /** Added by a click on the picture, not found by the search; the user can remove it. / Добавлен кликом, а не найден поиском. */
    manual?: boolean;
}

/** A GIF sheet is cut by its frames as they are, or searched like any picture. / Лист из GIF режут по кадрам или ищут, как любую картинку. */
export type CutMode = 'frames' | 'search';

const stemOf = (fileName: string): string => fileName.replace(/\.[^.]+$/, '') || 'sheet';

/**
 * Everything the page knows and does: the opened sheet, the search settings and the worker that runs the
 * search, the sprites found, the export. Components take it from `useWorkspace()` and hold no state of their own
 * beyond what is purely visual.
 * Всё, что страница знает и делает: открытый лист, настройки поиска и воркер, который ищет, найденные
 * спрайты, экспорт. Компоненты берут его из `useWorkspace()` и не держат своего состояния, кроме чисто визуального.
 */
export function createWorkspace() {
    const sheet = shallowRef<LoadedSheet | null>(null);
    const settings = reactive<Settings>(loadSettings());
    const keys = ref<KeyEntry[]>([]);

    const entries = shallowRef<SpriteEntry[]>([]);
    const total = ref(0);
    const busy = ref(false);
    const hovered = ref<number | null>(null);
    const picking = ref(false);
    const finding = ref(false);
    const cutMode = ref<CutMode>('frames');
    /** Sprites that are cut by GIF frames: only when the sheet has them and the user did not ask to search. */
    const framesMode = computed(() => !!sheet.value?.cells && cutMode.value === 'frames');

    const exportOptions = reactive({ basePath: '', retina: false, percent: false });
    const exporting = reactive({ running: false, done: 0, total: 0 });

    // ---- the search worker ------------------------------------------------------------------------------

    const worker = new Worker(new URL('./worker/detect.worker.ts', import.meta.url), { type: 'module' });
    let requestId = 0;
    let lastRequest = '';
    let timer: number | undefined;
    let memory = new Map<string, SpriteEntry>();
    let spriteCounter = 0;
    let keyCounter = 1;
    let pristineKeys = '[]';
    let detected: Sprite[] = [];
    let manual: Sprite[] = [];
    let frameEntries: SpriteEntry[] = [];

    const keyOf = (rect: Rect): string => `${rect.x},${rect.y},${rect.w},${rect.h}`;

    function entryFor(rect: Sprite, isManual: boolean): SpriteEntry {
        const key = keyOf(rect);
        let entry = memory.get(key);

        if (entry) {
            entry.rect = rect;
        } else {
            entry = reactive<SpriteEntry>({ key, rect, defaultName: `sprite_${spriteCounter++}`, name: '', included: true });
            memory.set(key, entry);
        }

        entry.manual = isManual; // a sprite the search finds later is no longer "by hand"
        return entry;
    }

    /** The found sprites, then the ones the user pointed at (unless the search found them too). */
    function rebuild(): void {
        const list = detected.map((rect) => entryFor(rect, false));
        const seen = new Set(list.map((entry) => entry.key));

        for (const rect of manual) {
            if (!seen.has(keyOf(rect))) list.push(entryFor(rect, true));
        }

        entries.value = list;
        hovered.value = null;
    }

    function applyResult(sprites: Sprite[]): void {
        detected = sprites;
        rebuild();
    }

    // Questions about one point: the worker answers them one by one, the page waits for its own.
    // Вопросы про одну точку: воркер отвечает по очереди, страница ждёт своего ответа.
    const pending = new Map<number, { resolve: (sprite: Sprite | null) => void; reject: (error: Error) => void }>();
    let pointId = 0;

    function askPoint(x: number, y: number): Promise<Sprite | null> {
        return new Promise((resolve, reject) => {
            const id = -++pointId; // negative: never equal to the id of a search request
            pending.set(id, { resolve, reject });
            worker.postMessage({ type: 'at', id, options: toDetectOptions(settings, keys.value), x, y } satisfies WorkerIn);
        });
    }

    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
        const message = event.data;

        const waiting = message.type === 'found' || message.type === 'error' ? pending.get(message.id) : undefined;
        if (waiting) {
            pending.delete(message.id);
            if (message.type === 'found') waiting.resolve(message.sprite);
            else if (message.type === 'error') waiting.reject(new Error(message.message));
            return;
        }

        if (message.type === 'found' || message.id !== requestId) return; // an answer to a question that was already replaced

        busy.value = false;
        if (message.type === 'result') {
            total.value = message.total;
            applyResult(message.sprites);
        } else {
            toast().danger().message(t('sprites.failed', [message.message]));
        }
    };

    worker.onerror = (event) => {
        busy.value = false;
        toast().danger().message(t('sprites.failed', [event.message]));
    };

    function run(): void {
        const current = sheet.value;
        if (!current) return;

        if (framesMode.value) {
            // The frames are known exactly: nothing to search. A search still in flight must not overwrite them.
            // Кадры известны точно: искать нечего. Поиск, ещё идущий, не должен их затереть.
            requestId++;
            lastRequest = '';
            busy.value = false;
            total.value = frameEntries.length;
            entries.value = frameEntries;
            hovered.value = null;
            return;
        }

        const options = toDetectOptions(settings, keys.value);

        // Watchers fire on any touch; the worker is asked only when the question really changed.
        // Наблюдатели срабатывают на любое касание; воркера спрашиваем, только когда вопрос действительно изменился.
        const request = `${current.id}|${JSON.stringify(options)}`;
        if (request === lastRequest) return;
        lastRequest = request;

        busy.value = true;
        worker.postMessage({ type: 'detect', id: ++requestId, options } satisfies WorkerIn);
    }

    function schedule(): void {
        window.clearTimeout(timer);
        timer = window.setTimeout(run, 150);
    }

    watch([settings, keys], schedule, { deep: true });
    watch(cutMode, () => {
        window.clearTimeout(timer);
        run();
    });
    watch(settings, () => saveSettings(settings), { deep: true });

    // ---- opening ----------------------------------------------------------------------------------------

    function setSheet(next: LoadedSheet): void {
        window.clearTimeout(timer);

        sheet.value = next;
        memory = new Map();
        spriteCounter = 0;
        detected = [];
        manual = [];
        entries.value = [];
        total.value = 0;
        hovered.value = null;
        picking.value = false;
        finding.value = false;
        cutMode.value = 'frames';
        for (const waiting of pending.values()) waiting.resolve(null);
        pending.clear();

        frameEntries = (next.cells ?? []).map((rect, i) => {
            const key = keyOf(rect);
            return reactive<SpriteEntry>({ key, rect: { ...rect, pixels: rect.w * rect.h }, defaultName: `frame_${i}`, name: '', included: true });
        });

        // An opaque picture is useless without its background colour, so the first guess is made for the user.
        // Непрозрачная картинка бесполезна без цвета фона, поэтому первую догадку делаем за пользователя.
        const background = guessBackground(next.image);
        keys.value = background ? [{ id: keyCounter++, color: formatHex(background), tolerance: DEFAULT_TOLERANCE }] : [];
        pristineKeys = JSON.stringify(keys.value.map(({ color, tolerance }) => ({ color, tolerance })));

        const copy = next.image.data.slice();
        worker.postMessage({ type: 'image', width: next.image.width, height: next.image.height, buffer: copy.buffer } satisfies WorkerIn, [copy.buffer]);

        run();
    }

    /**
     * Whether opening another sheet would throw away work: a name typed, a sprite unchecked, a background colour changed.
     * Открытие другого листа выбросило бы работу: набранное имя, снятую галочку, изменённый цвет фона.
     */
    function hasWork(): boolean {
        if (!sheet.value) return false;
        const touched = [...memory.values(), ...frameEntries].some((entry) => entry.name !== '' || !entry.included) || manual.length > 0;
        const keysNow = JSON.stringify(keys.value.map(({ color, tolerance }) => ({ color, tolerance })));
        return touched || keysNow !== pristineKeys;
    }

    async function confirmReplace(): Promise<boolean> {
        if (!hasWork()) return true;
        return await confirm().title(t('open.replaceTitle')).message(t('open.replaceMessage')).danger();
    }

    async function openFile(file: File): Promise<void> {
        let loaded: LoadedSheet;
        try {
            loaded = await loadSheet(file); // a file that cannot be read must not cost the user the project
        } catch (error) {
            const message =
                error instanceof SheetError
                    ? error.code === 'tooBig'
                        ? t('open.tooBig', [error.megapixels, MAX_MEGAPIXELS])
                        : t('open.notImage')
                    : t('open.failed');
            toast().danger().message(message);
            return;
        }

        if (await confirmReplace()) setSheet(loaded);
    }

    async function openExample(): Promise<void> {
        if (await confirmReplace()) setSheet(makeExample());
    }

    // ---- background colours -----------------------------------------------------------------------------

    function addKey(color = '#ff00ff'): void {
        if (keys.value.some((key) => key.color.toLowerCase() === color.toLowerCase())) {
            toast().info().message(t('background.exists'));
            return;
        }
        keys.value = [...keys.value, { id: keyCounter++, color, tolerance: DEFAULT_TOLERANCE }];
    }

    function removeKey(id: number): void {
        keys.value = keys.value.filter((key) => key.id !== id);
    }

    function guessKey(): void {
        const current = sheet.value;
        if (!current) return;

        const background = guessBackground(current.image);
        if (background) addKey(formatHex(background));
        else toast().warning().message(t('background.guessFailed'));
    }

    /**
     * The pipette: takes the colour of the pixel the user clicked on the picture.
     * Пипетка: берёт цвет пикселя, по которому пользователь кликнул на картинке.
     */
    function pickColor(x: number, y: number): void {
        const current = sheet.value;
        if (!current || x < 0 || y < 0 || x >= current.image.width || y >= current.image.height) return;

        const i = (y * current.image.width + x) * 4;
        const data = current.image.data;
        picking.value = false;

        if (data[i + 3]! === 0) {
            toast().info().message(t('background.transparentPixel'));
            return;
        }
        addKey(formatHex([data[i]!, data[i + 1]!, data[i + 2]!]));
    }

    // ---- a sprite by a click ----------------------------------------------------------------------------

    /**
     * The "find by click" tool: the sprite under the clicked pixel is added whatever the size limits say, with the
     * current background colours, alpha and gap. The tool stays armed, so several can be added in a row.
     * Инструмент «найти кликом»: спрайт под пикселем добавляется, что бы ни говорили ограничения по размеру, с
     * текущими цветами фона, альфой и зазором. Инструмент остаётся включённым: можно добавить несколько подряд.
     */
    async function findAt(x: number, y: number): Promise<void> {
        const current = sheet.value;
        if (!current || framesMode.value || x < 0 || y < 0 || x >= current.image.width || y >= current.image.height) return;

        let rect: Sprite | null;
        try {
            rect = await askPoint(x, y);
        } catch (error) {
            toast().danger().message(t('sprites.failed', [error instanceof Error ? error.message : String(error)]));
            return;
        }
        if (sheet.value !== current) return; // another sheet was opened while the worker was thinking

        if (!rect) {
            toast().info().short().message(t('find.nothing'));
            return;
        }

        const key = keyOf(rect);
        const known = entries.value.findIndex((entry) => entry.key === key);
        if (known >= 0) {
            hovered.value = known;
            toast().info().short().message(t('find.known'));
            return;
        }

        manual = [...manual, rect];
        rebuild();
        hovered.value = entries.value.findIndex((entry) => entry.key === key);
    }

    function removeManual(entry: SpriteEntry): void {
        manual = manual.filter((rect) => keyOf(rect) !== entry.key);
        memory.delete(entry.key);
        rebuild();
    }

    /** A click on the picture while a tool is armed. / Клик по картинке при включённом инструменте. */
    function clickAt(x: number, y: number): void {
        if (picking.value) pickColor(x, y);
        else if (finding.value) void findAt(x, y);
    }

    // One tool at a time; the frames of a GIF need none.
    // Один инструмент за раз; кадрам GIF они не нужны.
    watch(picking, (on) => {
        if (on) finding.value = false;
    });
    watch(finding, (on) => {
        if (on) picking.value = false;
    });
    watch(framesMode, (on) => {
        if (on) finding.value = false;
    });

    // ---- the sprites ------------------------------------------------------------------------------------

    const selected = computed(() => entries.value.filter((entry) => entry.included));

    function setAll(value: boolean): void {
        for (const entry of entries.value) entry.included = value;
    }

    function toggle(index: number): void {
        const entry = entries.value[index];
        if (entry) entry.included = !entry.included;
    }

    function setHovered(index: number | null): void {
        hovered.value = index;
    }

    const nameOf = (entry: SpriteEntry): string => resolveNames([entry.name || entry.defaultName])[0]!;

    async function spritePng(entry: SpriteEntry) {
        return encodePng(cropImage(sheet.value!.image, entry.rect));
    }

    async function downloadSprite(entry: SpriteEntry): Promise<void> {
        downloadBlob(`${nameOf(entry)}.png`, await spritePng(entry), 'image/png');
    }

    async function copySprite(entry: SpriteEntry): Promise<void> {
        try {
            const png = await spritePng(entry);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
            toast().success().short().message(t('sprites.copied'));
        } catch {
            toast().danger().message(t('sprites.copyFailed'));
        }
    }

    // ---- the export -------------------------------------------------------------------------------------

    const exportSprites = computed<ExportSprite[]>(() =>
        selected.value.map((entry) => ({ name: entry.name || entry.defaultName, x: entry.rect.x, y: entry.rect.y, w: entry.rect.w, h: entry.rect.h })),
    );

    const json = computed(() => (exportSprites.value.length ? toJson(exportSprites.value) : ''));

    const css = computed(() => {
        const current = sheet.value;
        if (!current || !exportSprites.value.length) return '';

        return toCss(exportSprites.value, {
            image: current.imageName,
            sheetWidth: current.image.width,
            sheetHeight: current.image.height,
            basePath: exportOptions.basePath,
            retina: exportOptions.retina,
            percent: exportOptions.percent,
        });
    });

    async function downloadZip(): Promise<void> {
        const current = sheet.value;
        if (!current || exporting.running || !exportSprites.value.length) return;

        exporting.running = true;
        exporting.done = 0;
        exporting.total = exportSprites.value.length + (current.includeSheet ? 1 : 0);

        try {
            const bytes = await buildArchive({
                image: current.image,
                sprites: exportSprites.value,
                imageName: current.imageName,
                includeSheet: current.includeSheet,
                basePath: exportOptions.basePath,
                retina: exportOptions.retina,
                percent: exportOptions.percent,
                onProgress: (done, count) => {
                    exporting.done = done;
                    exporting.total = count;
                },
            });
            downloadBlob(`${stemOf(current.fileName)}-sprites.zip`, bytes, 'application/zip');
            toast().success().message(t('export.ready'));
        } catch (error) {
            toast().danger().message(t('export.failed', [error instanceof Error ? error.message : String(error)]));
        } finally {
            exporting.running = false;
        }
    }

    function resetSettings(): void {
        Object.assign(settings, DEFAULT_SETTINGS);
    }

    function dispose(): void {
        window.clearTimeout(timer);
        worker.terminate();
    }

    return {
        sheet,
        settings,
        keys,
        entries,
        selected,
        total,
        busy,
        hovered,
        picking,
        finding,
        cutMode,
        framesMode,
        exportOptions,
        exporting,
        json,
        css,
        clickAt,
        removeManual,
        openFile,
        openExample,
        addKey,
        removeKey,
        guessKey,
        pickColor,
        setAll,
        toggle,
        setHovered,
        downloadSprite,
        copySprite,
        downloadZip,
        resetSettings,
        dispose,
    };
}

export type Workspace = ReturnType<typeof createWorkspace>;

export const WORKSPACE: InjectionKey<Workspace> = Symbol('workspace');

export function useWorkspace(): Workspace {
    const workspace = inject(WORKSPACE);
    if (!workspace) throw new Error('useWorkspace() was called outside of the app');
    return workspace;
}
