function SpeechAceScore({ speechaceScore, title = "SpeechAce Score", detectedDialect }) {
  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-slate-500';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score) => {
    if (score === null || score === undefined) return 'bg-slate-700/50';
    if (score >= 80) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 60) return 'bg-blue-500/20 border-blue-500/30';
    if (score >= 40) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Math.round(score);
  };

  // Calculate overall if not provided
  const calcOverall = () => {
    if (!speechaceScore) return null;
    if (speechaceScore.overall && speechaceScore.overall > 0) return speechaceScore.overall;
    const scores = [
      speechaceScore.pronunciation,
      speechaceScore.fluency,
      speechaceScore.grammar,
      speechaceScore.coherence,
      speechaceScore.vocab
    ].filter(s => s != null && s !== undefined);
    if (scores.length === 0) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
  };

  const overall = calcOverall();

  const CircularProgress = ({ value, label, icon }) => {
    const percentage = value || 0;
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className={`p-4 rounded-xl border ${getScoreBg(value)} transition-all duration-300 flex flex-col items-center`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{icon}</span>
          <span className="text-slate-400 text-sm font-medium">{label}</span>
        </div>
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="45"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-slate-700"
            />
            <circle
              cx="48"
              cy="48"
              r="45"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={`transition-all duration-1000 ${getScoreColor(value)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(value)}`}>
              {formatScore(value)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (!speechaceScore) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400">No SpeechAce score data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-slate-400 text-sm mt-1">Proprietary scoring: 0-100 scale</p>
          {detectedDialect && (
            <p className="text-slate-400 text-sm mt-1">
              🌍 Detected dialect: <span className="text-blue-400">{detectedDialect}</span>
            </p>
          )}
        </div>
        <div className={`px-6 py-3 rounded-xl border ${getScoreBg(overall)}`}>
          <span className="text-slate-400 text-sm mr-2">Overall</span>
          <span className={`text-3xl font-bold ${getScoreColor(overall)}`}>
            {formatScore(overall)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {speechaceScore.pronunciation != null && (
          <CircularProgress label="Pronunciation" value={speechaceScore.pronunciation} icon="🗣️" />
        )}
        {speechaceScore.fluency != null && (
          <CircularProgress label="Fluency" value={speechaceScore.fluency} icon="💬" />
        )}
        {speechaceScore.grammar != null && (
          <CircularProgress label="Grammar" value={speechaceScore.grammar} icon="📝" />
        )}
        {speechaceScore.coherence != null && (
          <CircularProgress label="Coherence" value={speechaceScore.coherence} icon="🔗" />
        )}
        {speechaceScore.vocab != null && (
          <CircularProgress label="Vocabulary" value={speechaceScore.vocab} icon="📚" />
        )}
      </div>

      <div className="mt-4 p-4 bg-slate-700/30 rounded-xl">
        <p className="text-xs text-slate-400">
          <span className="font-semibold">Score Ranges:</span> Poor (0-40) | Fair (40-60) | Good (60-80) | Excellent (80-100)
        </p>
      </div>
    </div>
  );
}

export default SpeechAceScore;
