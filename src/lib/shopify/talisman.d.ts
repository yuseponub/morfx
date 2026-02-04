/**
 * Type declarations for talisman phonetics module.
 * Talisman is a comprehensive phonetics library but lacks TypeScript types.
 */
declare module 'talisman/phonetics/double-metaphone' {
  /**
   * Double Metaphone phonetic encoding algorithm.
   * Returns an array of two codes: [primary, alternate].
   * The alternate code handles cases where a name could be pronounced multiple ways.
   *
   * @param input - String to encode
   * @returns [primaryCode, alternateCode] - Phonetic codes for the input
   *
   * @example
   * doubleMetaphone("Schmidt") // ["XMT", "SMT"]
   * doubleMetaphone("Smith")   // ["SM0", "XMT"]
   */
  function doubleMetaphone(input: string): [string, string]
  export default doubleMetaphone
}
