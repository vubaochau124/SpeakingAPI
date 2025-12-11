import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import IELTSScore from './IELTSScore';
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
  getPhonemePlaybackTiming,
  getErrorType
} from '../utils/azureWordUtils';

function ConversationResults({ results, conversationTexts, lineAudios, onTryAgain }) {
  const textScore = results?.text_score;
  const wordList = textScore?.word_score_list || [];
  const [selectedWord, setSelectedWord] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);

  // Get language and determine if phonemes should be shown
  const language = textScore?.detected_dialect?.lang_id || 'en-US';
  const showPhonemes = language?.startsWith('en');

  // Load audio buffer when results change
  useEffect(() => {
    if (results?.audio_data) {
      loadAudioBuffer();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [results?.audio_data]);

  const loadAudioBuffer = async () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const base64Data = results.audio_data.split(',')[1];
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

    const paddedStart = Math.max(0, startSec - 0.03);
    const paddedDuration = durationSec + 0.06;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);

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

  const playPhonemeAudio = (phoneme) => {
    const { startSec, durationSec } = getPhonemePlaybackTiming(phoneme);
    playAudio(startSec, durationSec);
  };

  // Get color class based on quality score
  const getWordColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getWordBgColor = (score) => {
    if (score >= 80) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 60) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const formatScore = (score) => {
    return typeof score === 'number' ? score.toFixed(1) : score;
  };

  // Check if word needs attention (yellow or red)
  const needsAttention = (score) => score < 80;

  // Get word with stress markers
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

  // Map words to lines based on expected text word count
  const mapWordsToLines = () => {
    if (!conversationTexts || conversationTexts.length === 0 || wordList.length === 0) {
      return [];
    }

    const lineWordMappings = [];
    let wordIndex = 0;

    for (let i = 0; i < conversationTexts.length; i++) {
      const expectedText = conversationTexts[i];
      const expectedWordCount = expectedText.split(/\s+/).filter(w => w.length > 0).length;
      const lineWords = wordList.slice(wordIndex, wordIndex + expectedWordCount);
      wordIndex += expectedWordCount;

      lineWordMappings.push({
        lineIndex: i,
        expectedText,
        spokenWords: lineWords,
        audio: lineAudios ? lineAudios[i] : null
      });
    }

    if (wordIndex < wordList.length) {
      const lastMapping = lineWordMappings[lineWordMappings.length - 1];
      if (lastMapping) {
        lastMapping.spokenWords = [...lastMapping.spokenWords, ...wordList.slice(wordIndex)];
      }
    }

    return lineWordMappings;
  };

  const lineMappings = mapWordsToLines();

  const getProblemWords = (words) => {
    return words.filter(w => needsAttention(getWordScore(w)));
  };

  return (
    <div className="space-y-6">
      {/* Speech Score */}
      {textScore?.scores && (
        <IELTSScore
          scores={textScore.scores}
          title="Part 1 Score"
          detectedDialect={textScore?.detected_dialect?.lang_id}
        />
      )}

      {/* Lines with Transcript Mapping */}
      {lineMappings.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg">
              📝
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Line by Line Analysis</h3>
              <p className="text-slate-400 text-sm">Click on yellow/red words for details</p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-6 p-3 bg-slate-700/30 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-slate-300 text-sm">Good (80+)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span className="text-slate-300 text-sm">Needs Work (60-79)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-slate-300 text-sm">Poor (&lt;60)</span>
            </div>
          </div>

          <div className="space-y-6">
            {lineMappings.map((mapping, idx) => {
              const problemWords = getProblemWords(mapping.spokenWords);

              return (
                <div key={idx} className="p-5 rounded-xl bg-slate-700/30 border border-slate-600/30">
                  {/* Line Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                      <span className="text-cyan-400 font-bold text-sm">{idx + 1}</span>
                    </div>
                    <span className="text-slate-400 text-sm">Expected:</span>
                  </div>

                  {/* Expected Text */}
                  <p className="text-slate-300 text-sm mb-4 pl-11 italic">"{mapping.expectedText}"</p>

                  {/* Spoken Words with Colors */}
                  <div className="pl-11 mb-4">
                    <span className="text-slate-400 text-sm block mb-2">You said:</span>
                    <div className="flex flex-wrap gap-1">
                      {mapping.spokenWords.map((word, wordIdx) => {
                        const wordScore = getWordScore(word);
                        const isClickable = needsAttention(wordScore);

                        return (
                          <span
                            key={wordIdx}
                            onClick={() => isClickable && setSelectedWord(word)}
                            className={`px-2 py-1 rounded text-lg font-medium transition-all ${getWordColor(wordScore)} ${
                              isClickable
                                ? 'cursor-pointer hover:scale-105 hover:bg-slate-600/50 underline decoration-dotted'
                                : ''
                            }`}
                          >
                            {getWord(word)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Line Audio */}
                  {mapping.audio && (
                    <div className="pl-11 mt-3">
                      <audio controls src={mapping.audio} className="w-full h-10" />
                    </div>
                  )}

                  {/* Problem Words Summary */}
                  {problemWords.length > 0 && (
                    <div className="pl-11 mt-3 pt-3 border-t border-slate-600/30">
                      <span className="text-slate-400 text-xs">
                        {problemWords.length} word{problemWords.length > 1 ? 's' : ''} need{problemWords.length === 1 ? 's' : ''} practice: {' '}
                        {problemWords.map((w, i) => (
                          <span key={i} className={getWordColor(getWordScore(w))}>
                            {getWord(w)}{i < problemWords.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fluency Analysis */}
      {textScore?.fluency?.overall_metrics && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg">
              🗣️
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Fluency Analysis</h3>
              <p className="text-slate-400 text-sm">Speech rate and pause metrics</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="group p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🚀</span>
                <p className="text-slate-300 text-sm font-medium">Speech Rate</p>
              </div>
              <p className="text-3xl font-bold text-emerald-400">
                {textScore.fluency.overall_metrics.speech_rate?.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">words/second</p>
            </div>

            <div className="group p-5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">💬</span>
                <p className="text-slate-300 text-sm font-medium">Articulation Rate</p>
              </div>
              <p className="text-3xl font-bold text-cyan-400">
                {textScore.fluency.overall_metrics.articulation_rate?.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">syllables/second</p>
            </div>

            <div className="group p-5 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⏱️</span>
                <p className="text-slate-300 text-sm font-medium">Words Per Min</p>
              </div>
              <p className="text-3xl font-bold text-blue-400">
                {textScore.fluency.overall_metrics.word_correct_per_minute?.toFixed(0)}
              </p>
              <p className="text-xs text-slate-400 mt-1">correct wpm</p>
            </div>
          </div>
        </div>
      )}

      {/* Try Again Button */}
      <button
        onClick={onTryAgain}
        className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/25"
      >
        Try Again
      </button>

      {/* Word Detail Modal */}
      {selectedWord && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
            onClick={() => setSelectedWord(null)}
          />

          {/* Popup */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-800 rounded-2xl shadow-2xl p-6 z-[9999] max-w-md w-full mx-4 border border-slate-700 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-700">
              <div>
                <h3 className="text-3xl font-bold text-white">{getWordWithStress(selectedWord)}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Original: {getWord(selectedWord)}</p>
                <p className="text-sm text-slate-400 mt-1">
                  Quality Score:{' '}
                  <span className={`font-semibold ${getScoreColor(getWordScore(selectedWord))}`}>
                    {formatScore(getWordScore(selectedWord))}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSelectedWord(null)}
                className="text-slate-400 hover:text-white text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Error Type */}
            {getErrorType(selectedWord) && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                <span className="text-red-400 font-medium">
                  Issue: {getErrorType(selectedWord).replace(/_/g, ' ')}
                </span>
              </div>
            )}

            {/* Play Button */}
            {results?.audio_data && (
              <button
                onClick={() => playWordAudio(selectedWord)}
                disabled={isPlaying}
                className="w-full mb-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPlaying ? (
                  <>
                    <span className="animate-pulse">🔊</span> Playing...
                  </>
                ) : (
                  <>
                    <span>🔊</span> Hear "{getWord(selectedWord)}"
                  </>
                )}
              </button>
            )}

            {/* Syllables - only show if syllables have text */}
            {getSyllables(selectedWord).filter(syl => getSyllableText(syl)).length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Syllables (click to hear)</h4>
                <div className="flex flex-wrap gap-2">
                  {getSyllables(selectedWord).filter(syl => getSyllableText(syl)).map((syl, i) => {
                    const syllableScore = getSyllableScore(syl);
                    return (
                      <button
                        key={i}
                        onClick={() => results?.audio_data && playSyllableAudio(syl)}
                        disabled={!results?.audio_data || isPlaying}
                        className={`px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${getWordBgColor(syllableScore)}`}
                      >
                        <span className="text-white font-medium">
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
                <h4 className="text-sm font-medium text-slate-400 mb-2">Phonemes (click to hear)</h4>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/50">
                      <th className="text-left py-2 px-3 font-medium text-slate-300 text-sm">Phoneme</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-300 text-sm">Score</th>
                      <th className="text-center py-2 px-3 font-medium text-slate-300 text-sm">Play</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPhonemes(selectedWord).map((phone, index) => (
                      <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 px-3">
                          <span className="text-lg font-bold text-cyan-400">
                            /{getPhonemeText(phone)}/
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-semibold ${getScoreColor(getPhonemeScore(phone))}`}>
                            {formatScore(getPhonemeScore(phone))}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => results?.audio_data && playPhonemeAudio(phone)}
                            disabled={!results?.audio_data || isPlaying}
                            className="p-1 rounded hover:bg-slate-600/50 transition-colors disabled:opacity-50"
                          >
                            🔊
                          </button>
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

export default ConversationResults;
