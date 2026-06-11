// src/lib/editorial/__tests__/tag-variant.test.ts
//
// GAP-03: unit coverage for the pure `tagColorToVariant(hex)` helper. Each
// editorial bucket is asserted plus the fail-safe paths (invalid / empty /
// grey → ink). The helper must NEVER throw.

import { describe, it, expect } from 'vitest'
import { tagColorToVariant } from '../tag-variant'

describe('tagColorToVariant', () => {
  describe('red → rubric', () => {
    it('maps pure red', () => {
      expect(tagColorToVariant('#ff0000')).toBe('rubric')
    })
    it('maps a rose/crimson (~347°, tailwind rose-600)', () => {
      expect(tagColorToVariant('#e11d48')).toBe('rubric')
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

  describe('sky / blue / indigo → indigo', () => {
    it('maps pure blue (~225°)', () => {
      expect(tagColorToVariant('#2563eb')).toBe('indigo')
    })
    it('maps indigo (~243°)', () => {
      expect(tagColorToVariant('#4f46e5')).toBe('indigo')
    })
    it('maps cyan-blue (~200°)', () => {
      expect(tagColorToVariant('#0ea5e9')).toBe('indigo')
    })
    it('maps the DB palette Azul (#3b82f6, ~217°)', () => {
      expect(tagColorToVariant('#3b82f6')).toBe('indigo')
    })
    it('maps the DB palette Indigo (#6366f1, ~239°)', () => {
      expect(tagColorToVariant('#6366f1')).toBe('indigo')
    })
  })

  describe('violet → violet (Vivificación v3)', () => {
    it('maps the DB palette Violeta (#8b5cf6, ~258°)', () => {
      expect(tagColorToVariant('#8b5cf6')).toBe('violet')
    })
    it('maps deep magenta (~318°) into violet', () => {
      expect(tagColorToVariant('#d6219e')).toBe('violet')
    })
  })

  describe('pink / magenta → rose (Vivificación v3)', () => {
    it('maps the DB palette Rosa (#ec4899, ~330°)', () => {
      expect(tagColorToVariant('#ec4899')).toBe('rose')
    })
    it('maps hot pink (~340°)', () => {
      expect(tagColorToVariant('#f43f7a')).toBe('rose')
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
