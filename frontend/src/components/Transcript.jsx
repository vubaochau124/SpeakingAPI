import { useState } from 'react';

function Transcript({ transcript, wordList }) {
  const [selectedWord, setSelectedWord] = useState(null);

  const getWordColor = (score) => {
    if (score >= 90) return 'text-green-600 hover:bg-green-50';
    if (score >= 70) return 'text-yellow-600 hover:bg-yellow-50';
    return 'text-red-600 hover:bg-red-50';
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatScore = (score) => {
    return typeof score === 'number' ? score.toFixed(1) : score;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 relative">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Transcript</h2>

      {/* Clickable Words */}
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-3">Click on any word to see phoneme details</p>
        <div className="flex flex-wrap gap-2 items-baseline text-xl">
          {wordList.map((wordInfo, index) => (
            <span key={index} className="inline-flex items-baseline">
              <button
                onClick={() => setSelectedWord(wordInfo)}
                className={`cursor-pointer px-2 py-1 rounded transition-all duration-200 font-medium ${getWordColor(wordInfo.quality_score)}`}
              >
                {wordInfo.word}
              </button>
              {wordInfo.ending_punctuation && (
                <span className="text-gray-700 ml-0.5">{wordInfo.ending_punctuation}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Popup Modal */}
      {selectedWord && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSelectedWord(null)}
          />

          {/* Popup */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl p-6 z-50 max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b">
              <div>
                <h3 className="text-2xl font-bold text-gray-800">{selectedWord.word}</h3>
                <p className="text-sm text-gray-600">
                  Quality Score:{' '}
                  <span className={`font-semibold ${getScoreColor(selectedWord.quality_score)}`}>
                    {formatScore(selectedWord.quality_score)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSelectedWord(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Table */}
            <div className="overflow-y-auto max-h-96">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Phoneme</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Score</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Sounds Like</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWord.phone_score_list.map((phone, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <span className="text-lg font-bold text-indigo-600">
                          /{phone.phone}/
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-semibold ${getScoreColor(phone.quality_score)}`}>
                          {formatScore(phone.quality_score)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-gray-700">
                          /{phone.sound_most_like}/
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Transcript;
