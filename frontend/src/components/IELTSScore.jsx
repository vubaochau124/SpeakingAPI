function IELTSScore({ scores, title = "Speech Score", detectedDialect }) {
  // Color functions for 0-100 scale
  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-slate-500';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score) => {
    if (score === null || score === undefined) return 'bg-slate-700/50';
    if (score >= 80) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 60) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Number(score).toFixed(1);
  };

  const ScoreItem = ({ label, value, icon }) => (
    <div className={`p-4 rounded-xl border ${getScoreBg(value)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${getScoreColor(value)}`}>
        {formatScore(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">/100</p>
    </div>
  );

  if (!scores) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400">No score data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {detectedDialect && (
          <p className="text-slate-400 text-sm mt-1">
            Detected dialect: <span className="text-blue-400">{detectedDialect}</span>
          </p>
        )}
      </div>

      {/* All Scores (0-100) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {scores.pronunciation != null && (
          <ScoreItem label="Pronunciation" value={scores.pronunciation} icon="🎯" />
        )}
        {scores.fluency != null && (
          <ScoreItem label="Fluency" value={scores.fluency} icon="🌊" />
        )}
        {scores.accuracy != null && (
          <ScoreItem label="Accuracy" value={scores.accuracy} icon="✓" />
        )}
        {scores.grammar != null && (
          <ScoreItem label="Grammar" value={scores.grammar} icon="📝" />
        )}
        {scores.coherence != null && (
          <ScoreItem label="Coherence" value={scores.coherence} icon="🔗" />
        )}
        {scores.vocab != null && (
          <ScoreItem label="Vocabulary" value={scores.vocab} icon="📚" />
        )}
        {scores.completeness != null && (
          <ScoreItem label="Completeness" value={scores.completeness} icon="✅" />
        )}
      </div>
    </div>
  );
}

export default IELTSScore;
