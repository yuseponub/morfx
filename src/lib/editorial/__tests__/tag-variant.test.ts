// src/lib/editorial/__tests__/tag-variant.test.ts
//
// GAP-03: unit coverage for the pure `tagColorToVariant(hex)` helper. Each
// editorial bucket is asserted plus the fail-safe paths (invalid / empty /
// grey → ink). The helper must NEVER throw.

import { describe, it, expect } from 'vitest'
import { tagColorToVariant } from '../tag-variant'

describe('tagColorToVariant', () => {
  describe('red / magenta → rubric', () => {
    it('maps pure red', () => {
      expect(tagColorToVariant('#ff0000')).toBe('rubric')
    })
    it('maps a rose/crimson (tailwind rose-600)', () => {
      expect(tagColorToVariant('#e11d48')).toBe('rubric')
    })
    it('maps deep magenta/pink (~315°) back toward rubric', () => {
      expect(tagColorToVariant('#d6219e')).toBe('rubric')
    })
  })

  describe('amber / yellow → gold', () => {
    it('maps amber (~40°)', () => {
      expect(tagColorToVariant('#f59e0b')).toBe('gold')
    })
    it('maps pure yellow (~60°)', () => {
      expect(tagColorToVariant('#facc15')).toBe('gold')
    })
    it('maps orange (~25°)', () => {
      expect(tagColorToVariant('#f97316')).toBe('gold')
    })
  })

  describe('green → verdigris / success', () => {
    it('maps a saturated true-green (~140°) to success', () => {
      expect(tagColorToVariant('#16a34a')).toBe('success')
    })
    it('maps a muted/olive green (~90°) to verdigris', () => {
      expect(tagColorToVariant('#84a32a')).toBe('verdigris')
    })
    it('maps teal/cyan (~175°) to verdigris', () => {
      expect(tagColorToVariant('#14b8a6')).toBe('verdigris')
    })
  })

  describe('blue / indigo / violet → indigo', () => {
    it('maps pure blue (~240°)', () => {
      expect(tagColorToVariant('#2563eb')).toBe('indigo')
    })
    it('maps indigo (~255°)', () => {
      expect(tagColorToVariant('#4f46e5')).toBe('indigo')
    })
    it('maps violet (~270°)', () => {
      expect(tagColorToVariant('#8b5cf6')).toBe('indigo')
    })
    it('maps cyan-blue (~200°)', () => {
      expect(tagColorToVariant('#0ea5e9')).toBe('indigo')
    })
  })

  describe('grey / black / white → ink', () => {
    it('maps mid grey (low saturation)', () => {
      expect(tagColorToVariant('#808080')).toBe('ink')
    })
    it('maps near-black', () => {
      expect(tagColorToVariant('#0a0a0a')).toBe('ink')
    })
    it('maps near-white', () => {
      expect(tagColorToVariant('#fafafa')).toBe('ink')
    })
    it('maps slate (low chroma)', () => {
      expect(tagColorToVariant('#64748b')).toBe('ink')
    })
  })

  describe('invalid / fail-safe → ink (never throws)', () => {
    it('empty string', () => {
      expect(tagColorToVariant('')).toBe('ink')
    })
    it('null', () => {
      expect(tagColorToVariant(null)).toBe('ink')
    })
    it('undefined', () => {
      expect(tagColorToVariant(undefined)).toBe('ink')
    })
    it('non-hex garbage', () => {
      expect(tagColorToVariant('not-a-color')).toBe('ink')
    })
    it('wrong length', () => {
      expect(tagColorToVariant('#ff00')).toBe('ink')
    })
    it('non-hex chars', () => {
      expect(tagColorToVariant('#gggggg')).toBe('ink')
    })
  })

  describe('format tolerance', () => {
    it('tolerates a missing leading #', () => {
      expect(tagColorToVariant('2563eb')).toBe('indigo')
    })
    it('tolerates 3-digit shorthand', () => {
      expect(tagColorToVariant('#f00')).toBe('rubric')
    })
    it('tolerates surrounding whitespace + uppercase', () => {
      expect(tagColorToVariant('  #F59E0B  ')).toBe('gold')
    })
  })
})
