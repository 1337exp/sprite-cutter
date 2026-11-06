import { describe, expect, it } from 'vitest';
import { formatHex, MAX_DISTANCE_SQ, parseColor, sameColor, toleranceToLimitSq } from '../src/core/color';

describe('parseColor', () => {
    it('reads hex with and without #, short and long, in any case', () => {
        expect(parseColor('#ff8000')).toEqual([255, 128, 0]);
        expect(parseColor('ff8000')).toEqual([255, 128, 0]);
        expect(parseColor('#F80')).toEqual([255, 136, 0]);
        expect(parseColor('  #00FF7f ')).toEqual([0, 255, 127]);
    });

    it('reads rgb() and rgba(), ignoring the alpha', () => {
        expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
        expect(parseColor('rgb(1,2,3)')).toEqual([1, 2, 3]);
        expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
        expect(parseColor('rgba(10, 20, 30, 1)')).toEqual([10, 20, 30]);
    });

    it('refuses what is not a colour', () => {
        expect(parseColor('')).toBeNull();
        expect(parseColor('#12')).toBeNull();
        expect(parseColor('#12345')).toBeNull();
        expect(parseColor('red')).toBeNull();
        expect(parseColor('rgb(256, 0, 0)')).toBeNull();
        expect(parseColor('rgb(1, 2)')).toBeNull();
        expect(parseColor('rgba(1, 2, 3)')).toBeNull();
    });
});

describe('formatHex', () => {
    it('is the inverse of parseColor', () => {
        expect(formatHex([255, 128, 0])).toBe('#ff8000');
        expect(formatHex([0, 0, 0])).toBe('#000000');
        expect(parseColor(formatHex([12, 34, 56]))).toEqual([12, 34, 56]);
    });

    it('clamps and rounds', () => {
        expect(formatHex([300, -5, 127.6])).toBe('#ff0080');
    });
});

describe('sameColor', () => {
    it('compares the three channels', () => {
        expect(sameColor([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(sameColor([1, 2, 3], [1, 2, 4])).toBe(false);
    });
});

describe('toleranceToLimitSq', () => {
    it('runs from an exact match to everything', () => {
        expect(toleranceToLimitSq(0)).toBe(0);
        expect(toleranceToLimitSq(100)).toBe(MAX_DISTANCE_SQ);
        expect(toleranceToLimitSq(50)).toBeCloseTo(MAX_DISTANCE_SQ / 4);
    });

    it('keeps bad input in range', () => {
        expect(toleranceToLimitSq(-10)).toBe(0);
        expect(toleranceToLimitSq(1000)).toBe(MAX_DISTANCE_SQ);
        expect(toleranceToLimitSq(NaN)).toBe(0);
    });
});
