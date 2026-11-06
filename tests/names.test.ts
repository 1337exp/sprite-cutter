import { describe, expect, it } from 'vitest';
import { cssClassName, fileSafeName, makeUnique, resolveNames } from '../src/core/names';

describe('fileSafeName', () => {
    it('keeps ordinary names, spaces and letters of any language', () => {
        expect(fileSafeName('hero')).toBe('hero');
        expect(fileSafeName('hero walk 01')).toBe('hero walk 01');
        expect(fileSafeName('спрайт ё')).toBe('спрайт ё');
        expect(fileSafeName('敵_1')).toBe('敵_1');
    });

    it('never lets a name become a path', () => {
        expect(fileSafeName('a/b\\c')).toBe('a_b_c');
        expect(fileSafeName('../evil')).toBe('.._evil');
        expect(fileSafeName('///')).toBe('_');
        expect(fileSafeName('a//b')).toBe('a_b');
    });

    it('replaces what Windows forbids, and control characters', () => {
        expect(fileSafeName('a:b*c?d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
        expect(fileSafeName('a\u0000b\tc')).toBe('a_b_c');
    });

    it('trims spaces and trailing dots, which Windows drops silently', () => {
        expect(fileSafeName('  spaced  ')).toBe('spaced');
        expect(fileSafeName('dots...')).toBe('dots');
        expect(fileSafeName('..')).toBe('');
        expect(fileSafeName('   ')).toBe('');
        expect(fileSafeName('')).toBe('');
    });

    it('keeps clear of the names of devices', () => {
        expect(fileSafeName('con')).toBe('_con');
        expect(fileSafeName('NUL.hero')).toBe('_NUL.hero');
        expect(fileSafeName('com1')).toBe('_com1');
        expect(fileSafeName('console')).toBe('console');
        expect(fileSafeName('com10')).toBe('com10');
    });

    it('cuts at 100 characters, counting letters and not UTF-16 halves', () => {
        expect(fileSafeName('a'.repeat(150))).toHaveLength(100);
        expect(Array.from(fileSafeName('😀'.repeat(150)))).toHaveLength(100);
        // The cut must not leave a trailing dot behind.
        expect(fileSafeName('a'.repeat(99) + '.b')).toBe('a'.repeat(99));
    });
});

describe('makeUnique', () => {
    it('numbers the later one of two equal names, ignoring case', () => {
        expect(makeUnique(['a', 'a', 'A', 'a_2'])).toEqual(['a', 'a_2', 'A_3', 'a_2_2']);
    });

    it('can tell Hero from hero when asked to', () => {
        expect(makeUnique(['a', 'a', 'A'], true)).toEqual(['a', 'a_2', 'A']);
    });

    it('leaves different names alone', () => {
        expect(makeUnique(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
    });
});

describe('resolveNames', () => {
    it('fills the empty and the unusable, and separates the equal', () => {
        expect(resolveNames(['', 'x', 'x', '  ', 'con', '..'])).toEqual(['sprite_0', 'x', 'x_2', 'sprite_3', '_con', 'sprite_5']);
    });

    it('takes another prefix for the empty ones', () => {
        expect(resolveNames(['', ''], 'frame_')).toEqual(['frame_0', 'frame_1']);
    });
});

describe('cssClassName', () => {
    it('keeps what a class may contain, letters of any language included', () => {
        expect(cssClassName('hero')).toBe('hero');
        expect(cssClassName('hero_walk-01')).toBe('hero_walk-01');
        expect(cssClassName('спрайт_1')).toBe('спрайт_1');
    });

    it('turns the rest into hyphens, once per run', () => {
        expect(cssClassName('sprite 1')).toBe('sprite-1');
        expect(cssClassName('a..b')).toBe('a-b');
        expect(cssClassName('a. b!c')).toBe('a-b-c');
        expect(cssClassName('  hero  ')).toBe('hero');
    });

    it('does not start with a digit', () => {
        expect(cssClassName('1st')).toBe('_1st');
        expect(cssClassName('2')).toBe('_2');
    });

    it('falls back to "sprite" when nothing is left', () => {
        expect(cssClassName('')).toBe('sprite');
        expect(cssClassName('***')).toBe('sprite');
    });
});
