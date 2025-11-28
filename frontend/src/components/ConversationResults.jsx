import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import IELTSScore from './IELTSScore';

function ConversationResults({ results, conversationTexts, lineAudios, onTryAgain }) {
  const textScore = results?.text_score;
  const wordList = textScore?.word_score_list || [];
  const [selectedWord, setSelectedWord] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);

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

  const playWordAudio = (wordInfo) => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    let startFrame = null;
    let endFrame = null;

    if (wordInfo.syllable_score_list && wordInfo.syllable_score_list.length > 0) {
      startFrame = wordInfo.syllable_score_list[0].extent[0];
      endFrame = wordInfo.syllable_score_list[wordInfo.syllable_score_list.length - 1].extent[1];
    } else if (wordInfo.phone_score_list && wordInfo.phone_score_list.length > 0) {
      startFrame = wordInfo.phone_score_list[0].extent[0];
      endFrame = wordInfo.phone_score_list[wordInfo.phone_score_list.length - 1].extent[1];
    }

    if (startFrame === null || endFrame === null) return;

    const startTime = startFrame / 1000;
    const duration = (endFrame - startFrame) / 1000;
    const paddedStart = Math.max(0, startTime - 0.05);
    const paddedDuration = duration + 0.1;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);

    setIsPlaying(true);
    source.start(0, paddedStart, paddedDuration);
    source.onended = () => setIsPlaying(false);
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
    if (!wordInfo.syllable_score_list || wordInfo.syllable_score_list.length < 2) {
      return wordInfo.word;
    }

    let stressedWord = '';
    for (const syllable of wordInfo.syllable_score_list) {
      const letters = syllable.letters || '';
      const stressLevel = syllable.stress_level || 0;
      if (stressLevel === 1) {
        stressedWord += 'ˈ' + letters;
      } else {
        stressedWord += letters;
      }
    }
    return stressedWord;
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
    return words.filter(w => needsAttention(w.quality_score));
  };

  return (
    <div className="space-y-6">
      {/* IELTS Score */}
      {textScore?.ielts_score && (
        <IELTSScore
          ieltsScore={textScore.ielts_score}
          title="Part 1 Score"
          detectedDialect={textScore?.detected_dialect?.lang_id}
          azureScores={textScore?.azure_scores}
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
                        const isClickable = needsAttention(word.quality_score);

                        return (
                          <span
                            key={wordIdx}
                            onClick={() => isClickable && setSelectedWord(word)}
                            className={`px-2 py-1 rounded text-lg font-medium transition-all ${getWordColor(word.quality_score)} ${
                              isClickable
                                ? 'cursor-pointer hover:scale-105 hover:bg-slate-600/50 underline decoration-dotted'
                                : ''
                            }`}
                          >
                            {word.word}
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
                          <span key={i} className={getWordColor(w.quality_score)}>
                            {w.word}{i < problemWords.length - 1 ? ', ' : ''}
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

      {/* Word Detail Modal (same as Part 2) */}
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
                <p className="text-xs text-slate-500 mt-0.5">Original: {selectedWord.word}</p>
                <p className="text-sm text-slate-400 mt-1">
                  Quality Score:{' '}
                  <span className={`font-semibold ${getScoreColor(selectedWord.quality_score)}`}>
                    {formatScore(selectedWord.quality_score)}
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
            {selectedWord.error_type && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                <span className="text-red-400 font-medium">
                  Issue: {selectedWord.error_type.replace(/_/g, ' ')}
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
                    <span>🔊</span> Hear "{selectedWord.word}"
                  </>
                )}
              </button>
            )}

            {/* Syllables */}
            {selectedWord.syllable_score_list && selectedWord.syllable_score_list.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Syllables</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedWord.syllable_score_list.map((syl, i) => {
                    const isStressed = syl.stress_level === 1;
                    const showStress = selectedWord.syllable_score_list.length >= 2;
                    return (
                      <div
                        key={i}
                        className={`px-3 py-2 rounded-lg border ${getWordBgColor(syl.quality_score)}`}
                      >
                        <span className="text-white font-medium">
                          {showStress && isStressed && <span className="text-blue-400">ˈ</span>}
                          {syl.letters}
                        </span>
                        <span className={`ml-2 text-sm ${getScoreColor(syl.quality_score)}`}>
                          {formatScore(syl.quality_score)}
                        </span>
                        {showStress && isStressed && (
                          <span className="ml-2 text-xs text-blue-400" title="Stressed syllable">●</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phonemes Table */}
            {selectedWord.phone_score_list && selectedWord.phone_score_list.length > 0 && (
              <div className="overflow-y-auto max-h-64">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Phonemes</h4>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/50">
                      <th className="text-left py-2 px-3 font-medium text-slate-300 text-sm">Phoneme</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-300 text-sm">Score</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-300 text-sm">Sounds Like</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWord.phone_score_list.map((phone, index) => (
                      <tr key={index} className="border-b border-slate-700/50">
                        <td className="py-2 px-3">
                          <span className="text-lg font-bold text-cyan-400">
                            /{phone.phone}/
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-semibold ${getScoreColor(phone.quality_score)}`}>
                            {formatScore(phone.quality_score)}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium text-slate-300">
                            /{phone.sound_most_like}/
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

export default ConversationResults;
