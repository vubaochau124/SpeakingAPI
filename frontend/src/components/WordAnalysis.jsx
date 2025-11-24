import { useState } from 'react';

function WordAnalysis({ wordList }) {
  const [selectedWord, setSelectedWord] = useState(null);

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/20';
    if (score >= 70) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  };

  const getScoreBorderColor = (score) => {
    if (score >= 90) return 'border-emerald-500/30';
    if (score >= 70) return 'border-amber-500/30';
    return 'border-red-500/30';
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-slate-700/50">
      <h2 className="text-2xl font-bold text-white mb-4">Word Analysis</h2>
      <p className="text-sm text-slate-400 mb-4">
        Click on any word to see detailed phoneme breakdown
      </p>

      {/* Word List */}
      <div className="flex flex-wrap gap-3 mb-6">
        {wordList.map((wordInfo, index) => (
          <div
            key={index}
            onClick={() => setSelectedWord(wordInfo)}
            className={`cursor-pointer px-4 py-2 rounded-xl border-2 transition-all duration-300 hover:scale-105 ${
              selectedWord?.word === wordInfo.word
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-cyan-600/30 bg-cyan-900/20 hover:border-cyan-500/50'
            }`}
          >
            <div className="font-semibold text-lg text-white">
              {wordInfo.word}
            </div>
            <div className={`text-sm ${getScoreColor(wordInfo.quality_score)}`}>
              Score: {wordInfo.quality_score}
            </div>
          </div>
        ))}
      </div>

      {/* Selected Word Details */}
      {selectedWord && (
        <div className="mt-6 border-t border-slate-700/50 pt-6">
          <h3 className="text-xl font-semibold text-white mb-4">
            Phoneme Analysis
          </h3>

          {/* Word Header */}
          <div className="mb-4 pb-4 border-b border-slate-700/50">
            <h4 className="text-2xl font-bold text-white">
              {selectedWord.word}
            </h4>
            <p className="text-sm text-slate-400">
              Overall Quality Score:{' '}
              <span className="font-semibold text-white">{selectedWord.quality_score}</span>
            </p>
          </div>

          {/* Phonemes */}
          <div className="space-y-3">
            {selectedWord.phone_score_list.map((phone, index) => (
              <div
                key={index}
                className={`rounded-xl p-4 border ${getScoreBorderColor(phone.quality_score)} ${getScoreBgColor(phone.quality_score)} hover:translate-x-2 transition-all duration-300`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-sm text-slate-400 mb-1">
                      Phoneme {index + 1}
                    </div>
                    <div className="text-2xl font-bold text-cyan-400 mb-2">
                      /{phone.phone}/
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-400">Score:</span>
                        <span
                          className={`font-semibold ml-1 ${getScoreColor(
                            phone.quality_score
                          )}`}
                        >
                          {phone.quality_score}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Sounds like:</span>
                        <span className="font-semibold text-white ml-1">
                          /{phone.sound_most_like}/
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div
                      className={`w-16 h-16 rounded-full border-2 ${getScoreBorderColor(phone.quality_score)} ${getScoreBgColor(
                        phone.quality_score
                      )} flex items-center justify-center`}
                    >
                      <span
                        className={`text-2xl font-bold ${getScoreColor(
                          phone.quality_score
                        )}`}
                      >
                        {phone.quality_score}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WordAnalysis;
