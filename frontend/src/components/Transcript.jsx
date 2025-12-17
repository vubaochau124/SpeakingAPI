import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getWord,
  getWordScore,
  getPhonemes,
  getSyllables,
  getPhonemeText,
  getPhonemeScore,
  getSyllableText,
  getSyllableScore,
  getWordPlaybackTiming,
  getSyllablePlaybackTiming,
  isFillerWord
} from '../utils/azureWordUtils';

function Transcript({ transcript, wordList, audioData, language = 'en-US' }) {
  const [selectedWord, setSelectedWord] = useState(null);

  // Only show phonemes for English
  const showPhonemes = language?.startsWith('en');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(0);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);

  // Load available English voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      // Filter for English voices only
      const englishVoices = voices.filter(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('English') || v.lang === 'en-US' || v.lang === 'en-GB')
      );
      // Sort: Google voices first, then Microsoft, then others
      englishVoices.sort((a, b) => {
        if (a.name.includes('Google') && !b.name.includes('Google')) return -1;
        if (!a.name.includes('Google') && b.name.includes('Google')) return 1;
        if (a.name.includes('Microsoft') && !b.name.includes('Microsoft')) return -1;
        return 0;
      });
      setAvailableVoices(englishVoices.length > 0 ? englishVoices : voices.filter(v => v.lang.startsWith('en')));
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Web Speech API TTS - Fast and customizable
  const playTTS = (text) => {
    if (isTTSPlaying || !('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    setIsTTSPlaying(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    utterance.pitch = 1;

    // Use selected voice if available
    if (availableVoices.length > 0 && availableVoices[selectedVoiceIndex]) {
      utterance.voice = availableVoices[selectedVoiceIndex];
    }

    utterance.onend = () => setIsTTSPlaying(false);
    utterance.onerror = () => setIsTTSPlaying(false);
    speechSynthesis.speak(utterance);
  };

  const handleVoiceChange = (e) => {
    setSelectedVoiceIndex(Number(e.target.value));
  };

  // Load audio buffer when audioData changes
  useEffect(() => {
    if (audioData) {
      loadAudioBuffer();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      // Cancel any ongoing speech synthesis
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
    };
  }, [audioData]);

  const loadAudioBuffer = async () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Convert base64 to array buffer
      const base64Data = audioData.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      audioBufferRef.current = audioBuffer;
    } catch (err) {
      console.error('Error loading audio buffer:', err);
    }
  };

  const playAudio = (startSec, durationSec) => {
    if (!audioBufferRef.current || !audioContextRef.current) return;
    if (durationSec <= 0) return;

    // Add small padding for better playback
    const paddedStart = Math.max(0, startSec - 0.03);
    const paddedDuration = durationSec + 0.06;

    // Create source and play
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);

    console.log(`[Play Audio] Start: ${paddedStart.toFixed(3)}s, Duration: ${paddedDuration.toFixed(3)}s`);

    setIsPlaying(true);
    source.start(0, paddedStart, paddedDuration);
    source.onended = () => setIsPlaying(false);
  };

  const playWordAudio = (wordInfo) => {
    const { startSec, durationSec } = getWordPlaybackTiming(wordInfo);
    playAudio(startSec, durationSec);
  };

  const playSyllableAudio = (syllable) => {
    const { startSec, durationSec } = getSyllablePlaybackTiming(syllable);
    playAudio(startSec, durationSec);
  };

  const getWordColor = (score) => {
    // Filler words (no score) get a neutral gray color
    if (score === null || score === undefined) return 'text-gray-500 hover:bg-gray-200';
    if (score >= 90) return 'text-emerald-600 hover:bg-emerald-500/20';
    if (score >= 70) return 'text-amber-600 hover:bg-amber-500/20';
    return 'text-red-600 hover:bg-red-500/20';
  };

  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-gray-500';
    if (score >= 90) return 'text-emerald-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '—';
    return typeof score === 'number' ? score.toFixed(1) : score;
  };

  const getWordWithStress = (wordInfo) => {
    const syllables = getSyllables(wordInfo);
    if (syllables.length < 2) {
      return getWord(wordInfo);
    }

    // Azure raw format doesn't include stress info, just concatenate syllables
    // Don't pass wordInfo to getSyllableText to avoid repeating the word for each empty syllable
    let result = '';
    for (const syllable of syllables) {
      const syllableText = getSyllableText(syllable);
      // Only add if syllable has actual text
      if (syllableText) {
        result += syllableText;
      }
    }
    // If no syllable text was found, return the original word
    return result || getWord(wordInfo);
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-4">Transcript</h3>
      <p className="text-sm text-gray-500 mb-3">Click on any word to see details and hear pronunciation</p>

      {/* Clickable Words */}
      <div className="flex flex-wrap gap-2 items-baseline text-lg">
        {wordList.map((wordInfo, index) => {
          const isFiller = isFillerWord(wordInfo);
          const score = getWordScore(wordInfo);
          return (
            <span key={index} className="inline-flex items-baseline">
              <button
                onClick={() => !isFiller && setSelectedWord(wordInfo)}
                className={`px-2 py-1 rounded-lg transition-all duration-200 font-medium ${getWordColor(score)} ${isFiller ? 'cursor-default italic' : 'cursor-pointer'}`}
                title={isFiller ? 'Filler word (no pronunciation score)' : undefined}
              >
                {getWord(wordInfo)}
              </button>
            </span>
          );
        })}
      </div>

      {/* Popup Modal */}
      {selectedWord && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
            onClick={() => setSelectedWord(null)}
          />

          {/* Popup - Centered and on top */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 z-[9999] max-w-md w-full mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-3xl font-bold text-gray-900">{getWordWithStress(selectedWord)}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Original: {getWord(selectedWord)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Quality Score:{' '}
                  <span className={`font-semibold ${getScoreColor(getWordScore(selectedWord))}`}>
                    {formatScore(getWordScore(selectedWord))}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSelectedWord(null)}
                className="text-gray-500 hover:text-gray-900 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Voice Selector */}
            {availableVoices.length > 1 && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">Voice:</span>
                <select
                  value={selectedVoiceIndex}
                  onChange={handleVoiceChange}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all cursor-pointer border-none outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableVoices.map((voice, index) => (
                    <option key={index} value={index}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Play Buttons */}
            <div className="flex gap-2 mb-4">
              {/* TTS - Correct Pronunciation */}
              <button
                onClick={() => playTTS(getWord(selectedWord))}
                disabled={isTTSPlaying}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                title="Hear correct pronunciation"
              >
                {isTTSPlaying ? (
                  <>
                    <span className="animate-pulse">🎯</span> Playing...
                  </>
                ) : (
                  <>
                    <span>🎯</span> Correct
                  </>
                )}
              </button>

              {/* User Recording */}
              {audioData && (
                <button
                  onClick={() => playWordAudio(selectedWord)}
                  disabled={isPlaying}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                  title="Hear your pronunciation"
                >
                  {isPlaying ? (
                    <>
                      <span className="animate-pulse">🔊</span> Playing...
                    </>
                  ) : (
                    <>
                      <span>🔊</span> Your voice
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Syllables - only show if syllables have text */}
            {getSyllables(selectedWord).filter(syl => getSyllableText(syl)).length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Syllables (click to hear)</h4>
                <div className="flex flex-wrap gap-2">
                  {getSyllables(selectedWord).filter(syl => getSyllableText(syl)).map((syl, i) => {
                    const syllableScore = getSyllableScore(syl);
                    return (
                      <button
                        key={i}
                        onClick={() => audioData && playSyllableAudio(syl)}
                        disabled={!audioData || isPlaying}
                        className={`px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                          syllableScore >= 90
                            ? 'bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30'
                            : syllableScore >= 70
                            ? 'bg-amber-500/20 border-amber-500/30 hover:bg-amber-500/30'
                            : 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30'
                        }`}
                      >
                        <span className="text-gray-900 font-medium">
                          {getSyllableText(syl)}
                        </span>
                        <span className={`ml-2 text-sm ${getScoreColor(syllableScore)}`}>
                          {formatScore(syllableScore)}
                        </span>
                        <span className="ml-2 text-xs">🔊</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phonemes Table - Only for English */}
            {showPhonemes && getPhonemes(selectedWord).length > 0 && (
              <div className="overflow-y-auto max-h-64">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Phonemes</h4>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/50">
                      <th className="text-left py-2 px-3 font-medium text-gray-600 text-sm">Phoneme</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 text-sm">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPhonemes(selectedWord).map((phone, index) => (
                      <tr key={index} className="border-b border-gray-200/50 hover:bg-slate-700/30">
                        <td className="py-2 px-3">
                          <span className="text-lg font-bold text-blue-600">
                            /{getPhonemeText(phone)}/
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-semibold ${getScoreColor(getPhonemeScore(phone))}`}>
                            {formatScore(getPhonemeScore(phone))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default Transcript;
