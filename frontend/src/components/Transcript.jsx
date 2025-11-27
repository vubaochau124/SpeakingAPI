import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

function Transcript({ transcript, wordList, audioData }) {
  const [selectedWord, setSelectedWord] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);

  // Load audio buffer when audioData changes
  useEffect(() => {
    if (audioData) {
      loadAudioBuffer();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
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

  const playWordAudio = (wordInfo) => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    // Get extent from syllables or phones
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

    // Convert milliseconds to seconds (Azure returns offset/duration in milliseconds after backend conversion)
    const startTime = startFrame / 1000;
    const duration = (endFrame - startFrame) / 1000;

    // Add small padding for better playback
    const paddedStart = Math.max(0, startTime - 0.05);
    const paddedDuration = duration + 0.1;

    // Create source and play
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);

    console.log(`[Play Word] Start: ${paddedStart.toFixed(3)}s, Duration: ${paddedDuration.toFixed(3)}s`);

    setIsPlaying(true);
    source.start(0, paddedStart, paddedDuration);
    source.onended = () => setIsPlaying(false);
  };

  const getWordColor = (score) => {
    if (score >= 90) return 'text-emerald-400 hover:bg-emerald-500/20';
    if (score >= 70) return 'text-amber-400 hover:bg-amber-500/20';
    return 'text-red-400 hover:bg-red-500/20';
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const formatScore = (score) => {
    return typeof score === 'number' ? score.toFixed(1) : score;
  };

  const getWordWithStress = (wordInfo) => {
    if (!wordInfo.syllable_score_list || wordInfo.syllable_score_list.length < 2) {
      return wordInfo.word;
    }

    let stressedWord = '';
    for (const syllable of wordInfo.syllable_score_list) {
      const letters = syllable.letters || '';
      const stressLevel = syllable.stress_level || 0;

      // Add IPA stress marker (ˈ) before stressed syllables
      if (stressLevel === 1) {
        stressedWord += 'ˈ' + letters;
      } else {
        stressedWord += letters;
      }
    }

    return stressedWord;
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-4">Transcript</h3>
      <p className="text-sm text-slate-400 mb-3">Click on any word to see details and hear pronunciation</p>

      {/* Clickable Words */}
      <div className="flex flex-wrap gap-2 items-baseline text-lg">
        {wordList.map((wordInfo, index) => (
          <span key={index} className="inline-flex items-baseline">
            <button
              onClick={() => setSelectedWord(wordInfo)}
              className={`cursor-pointer px-2 py-1 rounded-lg transition-all duration-200 font-medium ${getWordColor(wordInfo.quality_score)}`}
            >
              {wordInfo.word}
            </button>
            {wordInfo.ending_punctuation && (
              <span className="text-slate-500 ml-0.5">{wordInfo.ending_punctuation}</span>
            )}
          </span>
        ))}
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

            {/* Play Button */}
            {audioData && (
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
                        className={`px-3 py-2 rounded-lg border ${
                          syl.quality_score >= 90
                            ? 'bg-emerald-500/20 border-emerald-500/30'
                            : syl.quality_score >= 70
                            ? 'bg-amber-500/20 border-amber-500/30'
                            : 'bg-red-500/20 border-red-500/30'
                        }`}
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
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default Transcript;
