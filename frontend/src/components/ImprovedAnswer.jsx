import React, { useState } from 'react';

const ImprovedAnswer = ({ improvedAnswerData, originalTranscript }) => {
  const [showImprovedAnswer, setShowImprovedAnswer] = useState(false);

  if (!improvedAnswerData) {
    return null;
  }

  const { improved_answer, improvements_made, estimated_ielts } = improvedAnswerData;

  return (
    <div className="my-6 w-full">
      <button
        className="w-full py-3.5 px-7 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/40 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
        onClick={() => setShowImprovedAnswer(!showImprovedAnswer)}
      >
        {showImprovedAnswer ? '✕ Hide Answer Suggestion' : '💡 Show Answer Suggestion'}
      </button>

      {showImprovedAnswer && (
        <div className="mt-5 p-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl animate-fadeIn">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              📝 Improved Answer Suggestion
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              This is an AI-generated improved version of your answer with grammar corrections,
              better vocabulary, and enhanced coherence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 mb-6 items-center">
            <div className="bg-slate-900/50 rounded-xl p-5 shadow-lg border-l-4 border-red-500">
              <h4 className="text-base font-semibold text-slate-300 mb-3">Your Original Answer</h4>
              <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {originalTranscript}
              </div>
            </div>

            <div className="hidden md:block text-3xl text-purple-400 font-bold text-center">
              →
            </div>

            <div className="bg-slate-900/50 rounded-xl p-5 shadow-lg border-l-4 border-green-500">
              <h4 className="text-base font-semibold text-slate-300 mb-3">Improved Version</h4>
              <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                {improved_answer}
              </div>
            </div>
          </div>

          {estimated_ielts && (
            <div className="bg-slate-900/50 rounded-xl p-5 mb-5 shadow-lg border border-slate-700/50">
              <h4 className="text-base font-semibold text-slate-300 mb-4">Estimated IELTS Scores (Improved Version)</h4>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col items-center bg-gradient-to-br from-purple-500 to-indigo-600 px-6 py-4 rounded-xl min-w-[120px] shadow-lg">
                  <span className="text-white/90 text-xs font-medium uppercase tracking-wider mb-2">Grammar</span>
                  <span className="text-white text-3xl font-bold">{estimated_ielts.grammar}</span>
                </div>
                <div className="flex flex-col items-center bg-gradient-to-br from-purple-500 to-indigo-600 px-6 py-4 rounded-xl min-w-[120px] shadow-lg">
                  <span className="text-white/90 text-xs font-medium uppercase tracking-wider mb-2">Vocabulary</span>
                  <span className="text-white text-3xl font-bold">{estimated_ielts.vocab}</span>
                </div>
                <div className="flex flex-col items-center bg-gradient-to-br from-purple-500 to-indigo-600 px-6 py-4 rounded-xl min-w-[120px] shadow-lg">
                  <span className="text-white/90 text-xs font-medium uppercase tracking-wider mb-2">Coherence</span>
                  <span className="text-white text-3xl font-bold">{estimated_ielts.coherence}</span>
                </div>
              </div>
            </div>
          )}

          {improvements_made && improvements_made.length > 0 && (
            <div className="bg-slate-900/50 rounded-xl p-5 mb-5 shadow-lg border border-slate-700/50">
              <h4 className="text-base font-semibold text-slate-300 mb-4 flex items-center gap-2">
                ✨ Key Improvements Made
              </h4>
              <ul className="ml-6 space-y-3">
                {improvements_made.map((improvement, index) => (
                  <li key={index} className="text-slate-300 text-sm leading-relaxed list-disc">
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-200/90 text-sm leading-relaxed">
              <strong className="font-semibold">Note:</strong> This suggestion is meant for learning purposes.
              Use it to understand how to improve your English speaking skills.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImprovedAnswer;
