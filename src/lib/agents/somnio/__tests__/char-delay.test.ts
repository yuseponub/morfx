import { describe, expect, it } from 'vitest';
import {
  calculateCharDelay,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  CHAR_CAP,
  K,
} from '../char-delay';

describe('calculateCharDelay', () => {
  // -------------------------------------------------------
  // Constants validation
  // -------------------------------------------------------
  describe('exported constants', () => {
    it('MIN_DELAY_MS is 2000', () => {
      expect(MIN_DELAY_MS).toBe(2000);
    });

    it('MAX_DELAY_MS is 12000', () => {
      expect(MAX_DELAY_MS).toBe(12000);
    });

    it('CHAR_CAP is 250', () => {
      expect(CHAR_CAP).toBe(250);
    });

    it('K is 30', () => {
      expect(K).toBe(30);
    });
  });

  // -------------------------------------------------------
  // Logarithmic curve points (tolerance +/- 500ms)
  // Formula: MIN + (MAX - MIN) * ln(1 + chars/K) / ln(1 + CAP/K)
  // With MIN=2000, MAX=12000, CAP=250, K=30
  // -------------------------------------------------------
  describe('curve points', () => {
    const cases: [number, number][] = [
      [10, 3288],
      [50, 6391],
      [80, 7817],
      [100, 8565],
      [150, 10022],
      [200, 11119],
      [250, 12000],
    ];

    it.each(cases)(
      'charCount=%i returns ~%ims (+/- 500ms)',
      (charCount, expected) => {
        const result = calculateCharDelay(charCount);
        expect(result).toBeGreaterThanOrEqual(expected - 500);
        expect(result).toBeLessThanOrEqual(expected + 500);
      }
    );
  });

  // -------------------------------------------------------
  // Logarithmic shape: growth decelerates
  // -------------------------------------------------------
  describe('logarithmic shape', () => {
    it('growth rate decelerates as charCount increases', () => {
      const d50 = calculateCharDelay(50);
      const d100 = calculateCharDelay(100);
      const d150 = calculateCharDelay(150);
      const d200 = calculateCharDelay(200);

      // First 50-char increment should add more delay than later ones
      const delta1 = d100 - d50; // 50->100 increment
      const delta2 = d150 - d100; // 100->150 increment
      const delta3 = d200 - d150; // 150->200 increment

      expect(delta1).toBeGreaterThan(delta2);
      expect(delta2).toBeGreaterThan(delta3);
    });
  });

  // -------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------
  describe('edge cases', () => {
    it('charCount = 0 returns MIN_DELAY_MS (2000)', () => {
      expect(calculateCharDelay(0)).toBe(2000);
    });

    it('charCount = -1 returns MIN_DELAY_MS (2000)', () => {
      expect(calculateCharDelay(-1)).toBe(2000);
    });

    it('charCount = -100 returns MIN_DELAY_MS (2000)', () => {
      expect(calculateCharDelay(-100)).toBe(2000);
    });

    it('charCount = NaN returns MIN_DELAY_MS (2000)', () => {
      expect(calculateCharDelay(NaN)).toBe(2000);
    });
  });

  // -------------------------------------------------------
  // Cap behavior: beyond CHAR_CAP stays at MAX_DELAY_MS
  // -------------------------------------------------------
  describe('cap behavior', () => {
    it('charCount = 250 returns exactly MAX_DELAY_MS (12000)', () => {
      expect(calculateCharDelay(250)).toBe(12000);
    });

    it('charCount = 500 returns MAX_DELAY_MS (beyond cap)', () => {
      expect(calculateCharDelay(500)).toBe(12000);
    });

    it('charCount = 1000 returns MAX_DELAY_MS (far beyond cap)', () => {
      expect(calculateCharDelay(1000)).toBe(12000);
    });
  });

  // -------------------------------------------------------
  // Return type: integer milliseconds
  // -------------------------------------------------------
  describe('return type', () => {
    it('returns an integer (Math.round applied)', () => {
      // Test several values to ensure no floating point leaks
      for (let i = 1; i <= 300; i += 7) {
        const result = calculateCharDelay(i);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('always returns a number (never NaN, Infinity, etc.)', () => {
      const inputs = [0, 1, 10, 100, 250, 500, -1, NaN, Infinity, -Infinity];
      for (const input of inputs) {
        const result = calculateCharDelay(input);
        expect(Number.isFinite(result)).toBe(true);
      }
    });
  });
});
