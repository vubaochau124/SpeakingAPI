/**
 * Azure Word Utilities
 * Helper functions to work with raw Azure pronunciation assessment data
 */

// Time conversion constant
// Azure uses 100-nanosecond units (ticks)
const AZURE_TICKS_TO_MS = 10000;

/**
 * Convert Azure offset/duration (100-ns units) to milliseconds
 * @param {number} ticks - Azure time value in 100-nanosecond units
 * @returns {number} - Time in milliseconds
 */
export function ticksToMs(ticks) {
  return Math.round((ticks || 0) / AZURE_TICKS_TO_MS);
}

/**
 * Get word text from Azure word object
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {string} - Word text
 */
export function getWord(wordInfo) {
  return wordInfo?.Word || '';
}

/**
 * Get quality/accuracy score for a word
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {number|null} - Score (0-100), or null if no score available (filler words)
 */
export function getWordScore(wordInfo) {
  // Check for filler words that don't have pronunciation scores
  if (wordInfo?._is_filler || wordInfo?.ErrorType === 'Filler' || wordInfo?.ErrorType === 'NoMatch') {
    return null;
  }
  // Check direct AccuracyScore (from backend mapping)
  if (wordInfo?.AccuracyScore !== undefined && wordInfo?.AccuracyScore !== null) {
    return wordInfo.AccuracyScore;
  }
  // Standard Azure format
  return wordInfo?.PronunciationAssessment?.AccuracyScore ?? null;
}

/**
 * Check if a word is a filler word (no pronunciation score)
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {boolean} - True if filler word
 */
export function isFillerWord(wordInfo) {
  return wordInfo?._is_filler === true ||
         wordInfo?.ErrorType === 'Filler' ||
         wordInfo?.ErrorType === 'NoMatch' ||
         wordInfo?.AccuracyScore === null;
}

/**
 * Get start time in milliseconds for a word
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {number} - Start time in ms
 */
export function getWordStartMs(wordInfo) {
  return ticksToMs(wordInfo?.Offset);
}

/**
 * Get end time in milliseconds for a word
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {number} - End time in ms
 */
export function getWordEndMs(wordInfo) {
  return ticksToMs((wordInfo?.Offset || 0) + (wordInfo?.Duration || 0));
}

/**
 * Get phonemes array from word
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {Array} - Array of phoneme objects
 */
export function getPhonemes(wordInfo) {
  return wordInfo?.Phonemes || [];
}

/**
 * Get phoneme text (with fallback for empty strings)
 * @param {Object} phoneme - Raw Azure phoneme object
 * @returns {string} - Phoneme text
 */
export function getPhonemeText(phoneme) {
  return phoneme?.Phoneme || '?';
}

/**
 * Get phoneme score
 * @param {Object} phoneme - Raw Azure phoneme object
 * @returns {number} - Score (0-100)
 */
export function getPhonemeScore(phoneme) {
  return phoneme?.PronunciationAssessment?.AccuracyScore ?? 0;
}

/**
 * Get phoneme start time in milliseconds
 * @param {Object} phoneme - Raw Azure phoneme object
 * @returns {number} - Start time in ms
 */
export function getPhonemeStartMs(phoneme) {
  return ticksToMs(phoneme?.Offset);
}

/**
 * Get phoneme end time in milliseconds
 * @param {Object} phoneme - Raw Azure phoneme object
 * @returns {number} - End time in ms
 */
export function getPhonemeEndMs(phoneme) {
  return ticksToMs((phoneme?.Offset || 0) + (phoneme?.Duration || 0));
}

/**
 * Get syllables array from word
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {Array} - Array of syllable objects
 */
export function getSyllables(wordInfo) {
  return wordInfo?.Syllables || [];
}

/**
 * Get syllable text (with fallback to word text for empty)
 * @param {Object} syllable - Raw Azure syllable object
 * @param {Object} wordInfo - Parent word object (for fallback)
 * @returns {string} - Syllable text
 */
export function getSyllableText(syllable, wordInfo = null) {
  return syllable?.Syllable || syllable?.Grapheme || wordInfo?.Word || '';
}

/**
 * Get syllable score
 * @param {Object} syllable - Raw Azure syllable object
 * @returns {number} - Score (0-100)
 */
export function getSyllableScore(syllable) {
  return syllable?.PronunciationAssessment?.AccuracyScore ?? 0;
}

/**
 * Get syllable start time in milliseconds
 * @param {Object} syllable - Raw Azure syllable object
 * @returns {number} - Start time in ms
 */
export function getSyllableStartMs(syllable) {
  return ticksToMs(syllable?.Offset);
}

/**
 * Get syllable end time in milliseconds
 * @param {Object} syllable - Raw Azure syllable object
 * @returns {number} - End time in ms
 */
export function getSyllableEndMs(syllable) {
  return ticksToMs((syllable?.Offset || 0) + (syllable?.Duration || 0));
}

/**
 * Get error type (normalized to null for "None")
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {string|null} - Error type or null
 */
export function getErrorType(wordInfo) {
  const errorType = wordInfo?.PronunciationAssessment?.ErrorType;
  if (!errorType || errorType === 'None') return null;
  // Convert PascalCase to snake_case for consistency
  return errorType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Calculate syllable timing for audio playback
 * @param {Object} syllable - Raw Azure syllable object
 * @returns {{startSec: number, durationSec: number}} - Timing info
 */
export function getSyllablePlaybackTiming(syllable) {
  const startMs = getSyllableStartMs(syllable);
  const endMs = getSyllableEndMs(syllable);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return { startSec: 0, durationSec: 0 };
  }

  return {
    startSec: startMs / 1000,
    durationSec: (endMs - startMs) / 1000
  };
}

/**
 * Calculate phoneme timing for audio playback
 * @param {Object} phoneme - Raw Azure phoneme object
 * @returns {{startSec: number, durationSec: number}} - Timing info
 */
export function getPhonemePlaybackTiming(phoneme) {
  const startMs = getPhonemeStartMs(phoneme);
  const endMs = getPhonemeEndMs(phoneme);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return { startSec: 0, durationSec: 0 };
  }

  return {
    startSec: startMs / 1000,
    durationSec: (endMs - startMs) / 1000
  };
}

/**
 * Calculate word timing for audio playback (start/end in seconds)
 * Uses syllables first, then phonemes, then word-level as fallback
 * @param {Object} wordInfo - Raw Azure word object
 * @returns {{startSec: number, durationSec: number}} - Timing info
 */
export function getWordPlaybackTiming(wordInfo) {
  let startMs = null;
  let endMs = null;

  const syllables = getSyllables(wordInfo);
  const phonemes = getPhonemes(wordInfo);

  if (syllables.length > 0) {
    startMs = getSyllableStartMs(syllables[0]);
    endMs = getSyllableEndMs(syllables[syllables.length - 1]);
  } else if (phonemes.length > 0) {
    startMs = getPhonemeStartMs(phonemes[0]);
    endMs = getPhonemeEndMs(phonemes[phonemes.length - 1]);
  } else {
    // Fallback to word-level timing
    startMs = getWordStartMs(wordInfo);
    endMs = getWordEndMs(wordInfo);
  }

  if (startMs === null || endMs === null || endMs <= startMs) {
    return { startSec: 0, durationSec: 0 };
  }

  return {
    startSec: startMs / 1000,
    durationSec: (endMs - startMs) / 1000
  };
}
