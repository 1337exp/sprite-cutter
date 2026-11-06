const UNSAFE = /[\x00-\x1f\x7f\\/:*?"<>|]+/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_LENGTH = 100;

/**
 * Turns what the user typed into something every file system accepts: no slashes (a name must not become a
 * path), none of the characters Windows forbids, no trailing dot or space, no device names like `con`, at most
 * 100 characters. Letters of any language stay. May return an empty string.
 * Превращает то, что набрал пользователь, в имя, которое примет любая файловая система: без слэшей (имя не
 * должно стать путём), без символов, запрещённых в Windows, без точки или пробела в конце, без имён устройств
 * вроде `con`, не длиннее 100 символов. Буквы любого языка остаются. Может вернуть пустую строку.
 */
export function fileSafeName(name: string): string {
    const trimEnd = (s: string) => s.replace(/[. ]+$/, '');

    let result = trimEnd(name.replace(UNSAFE, '_').trim());
    result = trimEnd(Array.from(result).slice(0, MAX_LENGTH).join(''));

    // Windows treats `con.anything` as the device too, so only the part before the first dot counts.
    // Windows считает устройством и `con.что-угодно`, поэтому смотрим только на часть до первой точки.
    if (RESERVED.test(result.split('.')[0]!)) result = `_${result}`;

    return result;
}

/**
 * Makes every name different by adding `_2`, `_3`… to the later ones. Case is ignored by default, because
 * Windows and macOS would write `Hero.png` and `hero.png` into the same file.
 * Делает все имена разными, добавляя `_2`, `_3`… поздним. Регистр по умолчанию не учитывается, потому что
 * Windows и macOS записали бы `Hero.png` и `hero.png` в один файл.
 */
export function makeUnique(names: readonly string[], caseSensitive = false): string[] {
    const key = (s: string) => (caseSensitive ? s : s.toLowerCase());
    const seen = new Set<string>();

    return names.map((base) => {
        let name = base;
        let n = 2;
        while (seen.has(key(name))) name = `${base}_${n++}`;
        seen.add(key(name));
        return name;
    });
}

/**
 * The names sprites get in the archive and in the JSON: safe for a file system, never empty, all different.
 * An empty one becomes `sprite_<position>`.
 * Имена, которые спрайты получают в архиве и в JSON: безопасные для файловой системы, не пустые, все разные.
 * Пустое становится `sprite_<позиция>`.
 */
export function resolveNames(names: readonly string[], fallbackPrefix = 'sprite_'): string[] {
    return makeUnique(names.map((raw, i) => fileSafeName(raw) || `${fallbackPrefix}${i}`));
}

/**
 * A valid CSS class name from a sprite name. Letters and digits of any language are kept, anything else
 * becomes `-`; a name that would start with a digit gets a `_` in front, and nothing left becomes `sprite`.
 * Корректное имя CSS-класса из имени спрайта. Буквы и цифры любого языка остаются, остальное становится `-`;
 * имя, которое началось бы с цифры, получает впереди `_`, а если ничего не осталось — `sprite`.
 */
export function cssClassName(name: string): string {
    let result = name.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
    if (result === '') result = 'sprite';
    if (/^\d/.test(result)) result = `_${result}`;
    return result;
}
