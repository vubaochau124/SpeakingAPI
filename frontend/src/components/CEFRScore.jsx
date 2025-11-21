function CEFRScore({ cefrScore }) {
  const scores = [
    { label: 'Pronunciation', value: cefrScore.pronunciation, color: 'border-blue-500' },
    { label: 'Fluency', value: cefrScore.fluency, color: 'border-green-500' },
    { label: 'Grammar', value: cefrScore.grammar, color: 'border-yellow-500' },
    { label: 'Coherence', value: cefrScore.coherence, color: 'border-purple-500' },
    { label: 'Vocab', value: cefrScore.vocab, color: 'border-pink-500' },
    { label: 'Overall', value: cefrScore.overall, color: 'border-indigo-500' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Score</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {scores.map((score, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border-2 ${score.color} bg-gray-50`}
          >
            <div className="text-sm font-medium text-gray-600 mb-1">
              {score.label}
            </div>
            <div
              className={`text-3xl font-bold ${
                score.value === 'A0' ? 'text-red-500' : 'text-gray-800'
              }`}
            >
              {score.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CEFRScore;
