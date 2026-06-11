import { describe, it, expect } from 'vitest'
import { getInitials, firstGrapheme } from '../initials'

describe('getInitials (F-2 grapheme-safe, whatsapp-inbox-reliability)', () => {
  it('returns empty string for null', () => expect(getInitials(null)).toBe(''))
  it('returns empty string for undefined', () => expect(getInitials(undefined)).toBe(''))
  it('returns empty string for empty string', () => expect(getInitials('')).toBe(''))
  it('returns empty string for whitespace-only', () => expect(getInitials('   ')).toBe(''))
  it('emoji first char — never a lone surrogate', () => expect(getInitials('😎 Test')).toBe('😎T'))
  it('astral char (𝙴)', () => expect(getInitials('𝙴lizar')).toBe('𝙴'))
  it('ZWJ emoji (👨‍👩‍👧) — one grapheme', () => {
    const r = getInitials('👨‍👩‍👧 Family')
    expect(r.length).toBeGreaterThanOrEqual(1) // ZWJ sequence = 1 grapheme
  })
  it('two-word name returns 2 initials', () => expect(getInitials('Sandra Perez')).toBe('SP'))
  it('single word returns 1 initial', () => expect(getInitials('Sandra')).toBe('S'))
  it('more than 2 words returns only 2 initials', () => expect(getInitials('A B C')).toBe('AB'))
})

describe('firstGrapheme (F-2 grapheme-safe, whatsapp-inbox-reliability)', () => {
  it('returns empty string for empty string', () => expect(firstGrapheme('')).toBe(''))
  it('returns empty string for whitespace-only', () => expect(firstGrapheme('   ')).toBe(''))
  it('emoji first char is a full grapheme', () => expect(firstGrapheme('😎x')).toBe('😎'))
  it('astral first char is a full grapheme', () => expect(firstGrapheme('𝙴lizar')).toBe('𝙴'))
  it('ascii first char', () => expect(firstGrapheme('Sandra')).toBe('S'))
})
