import { createSavedStorage } from '@1337exp/taoux/storage';
import { parseColor, type DetectOptions, type KeyColor } from '../core';

/**
 * What the user can tune about the search. `null` is an empty field: not set.
 * Что пользователь может настроить в поиске. `null` — пустое поле: не задано.
 */
export interface Settings {
    minWidth: number | null;
    minHeight: number | null;
    maxWidth: number | null;
    maxHeight: number | null;
    gap: number | null;
    minAlpha: number | null;
    limit: number | null;
}

/**
 * A background colour in the list; `color` is the hex the colour field edits.
 * Цвет фона в списке; `color` — hex, который правит поле цвета.
 */
export interface KeyEntry {
    id: number;
    color: string;
    tolerance: number;
}

export const DEFAULT_TOLERANCE = 3;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
    minWidth: 5,
    minHeight: 5,
    maxWidth: null,
    maxHeight: null,
    gap: 0,
    minAlpha: 1,
    limit: 300,
};

const storage = createSavedStorage('sprite-cutter.settings');

const numberOrNull = (value: unknown, fallback: number | null): number | null =>
    value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * The saved settings, each field checked: a broken or old file never gets in, the default stands in.
 * Сохранённые настройки, каждое поле проверено: сломанный или старый файл не пройдёт, встанет значение по умолчанию.
 */
export function loadSettings(): Settings {
    const settings: Settings = { ...DEFAULT_SETTINGS };
    const text = storage.read();
    if (!text) return settings;

    try {
        const saved = JSON.parse(text) as Record<string, unknown>;
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
            if (key in saved) settings[key] = numberOrNull(saved[key], DEFAULT_SETTINGS[key]);
        }
    } catch {
        storage.backupBroken(text);
    }

    return settings;
}

export function saveSettings(settings: Settings): void {
    storage.write(JSON.stringify(settings));
}

/**
 * Plain options for the core. Plain on purpose: they travel to a worker, and a reactive proxy cannot.
 * Простые параметры для ядра. Именно простые: они едут в воркер, а реактивный прокси не поедет.
 */
export function toDetectOptions(settings: Settings, keys: readonly KeyEntry[]): DetectOptions {
    const keyColors: KeyColor[] = [];
    for (const key of keys) {
        const color = parseColor(key.color);
        if (color) keyColors.push({ color: [color[0], color[1], color[2]], tolerance: key.tolerance });
    }

    const set = (value: number | null) => value ?? undefined;

    return {
        keys: keyColors,
        minWidth: set(settings.minWidth),
        minHeight: set(settings.minHeight),
        maxWidth: set(settings.maxWidth),
        maxHeight: set(settings.maxHeight),
        gap: set(settings.gap),
        minAlpha: set(settings.minAlpha),
        limit: set(settings.limit),
    };
}
