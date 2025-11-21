import { useState } from 'react';

function WordAnalysis({ wordList }) {
  const [selectedWord, setSelectedWord] = useState(null);

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score) => {
    if (score >= 90) return 'bg-green-100';
    if (score >= 70) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Word Analysis</h2>
      <p className="text-sm text-gray-600 mb-4">
        Click on any word to see detailed phoneme breakdown
      </p>

      {/* Word List */}
      <div className="flex flex-wrap gap-3 mb-6">
        {wordList.map((wordInfo, index) => (
          <div
            key={index}
            onClick={() => setSelectedWord(wordInfo)}
            className={`cursor-pointer px-4 py-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              selectedWord?.word === wordInfo.word
                ? 'border-indigo-500 bg-indigo-100'
                : 'border-indigo-300 bg-indigo-50'
            }`}
          >
            <div className="font-semibold text-lg text-gray-800">
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
        <div className="mt-6 border-t pt-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            Phoneme Analysis
          </h3>

          {/* Word Header */}
          <div className="mb-4 pb-4 border-b">
            <h4 className="text-2xl font-bold text-gray-800">
              {selectedWord.word}
            </h4>
            <p className="text-sm text-gray-600">
              Overall Quality Score:{' '}
              <span className="font-semibold">{selectedWord.quality_score}</span>
            </p>
          </div>

          {/* Phonemes */}
          <div className="space-y-3">
            {selectedWord.phone_score_list.map((phone, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:translate-x-2 transition-transform duration-200"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">
                      Phoneme {index + 1}
                    </div>
                    <div className="text-2xl font-bold text-indigo-600 mb-2">
                      /{phone.phone}/
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Score:</span>
                        <span
                          className={`font-semibold ml-1 ${getScoreColor(
                            phone.quality_score
                          )}`}
                        >
                          {phone.quality_score}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Sounds like:</span>
                        <span className="font-semibold text-gray-800 ml-1">
                          /{phone.sound_most_like}/
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div
                      className={`w-16 h-16 rounded-full ${getScoreBgColor(
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
