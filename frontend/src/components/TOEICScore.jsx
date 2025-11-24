function TOEICScore({ toeicScore, title = "TOEIC Score", detectedDialect }) {
  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-slate-500';
    if (score >= 160) return 'text-emerald-400'; // Advanced (160-200)
    if (score >= 120) return 'text-amber-400';   // Intermediate (120-160)
    return 'text-red-400';                        // Basic (10-120)
  };

  const getScoreBg = (score) => {
    if (score === null || score === undefined) return 'bg-slate-700/50';
    if (score >= 160) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 120) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Math.round(score);
  };

  const getScoreLevel = (score) => {
    if (score === null || score === undefined) return 'N/A';
    if (score >= 160) return 'Advanced';
    if (score >= 120) return 'Intermediate';
    return 'Basic';
  };

  // Calculate overall if not provided or is 0
  const calcOverall = () => {
    if (!toeicScore) return null;
    if (toeicScore.overall && toeicScore.overall > 0) return toeicScore.overall;
    const scores = [
      toeicScore.pronunciation,
      toeicScore.fluency,
      toeicScore.grammar,
      toeicScore.coherence,
      toeicScore.vocab
    ].filter(s => s != null && s !== undefined);
    if (scores.length === 0) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
  };

  const overall = calcOverall();

  const ScoreItem = ({ label, value, icon }) => (
    <div className={`p-4 rounded-xl border ${getScoreBg(value)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${getScoreColor(value)}`}>
        {formatScore(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">{getScoreLevel(value)}</p>
    </div>
  );

  if (!toeicScore) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400">No TOEIC score data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">Scale: 10-200 points</p>
        {detectedDialect && (
          <p className="text-slate-400 text-sm mt-1">
            🌍 Detected dialect: <span className="text-blue-400">{detectedDialect}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {toeicScore.pronunciation != null && (
          <ScoreItem label="Pronunciation" value={toeicScore.pronunciation} icon="🎯" />
        )}
        {toeicScore.fluency != null && (
          <ScoreItem label="Fluency" value={toeicScore.fluency} icon="🌊" />
        )}
        {toeicScore.grammar != null && (
          <ScoreItem label="Grammar" value={toeicScore.grammar} icon="📝" />
        )}
        {toeicScore.coherence != null && (
          <ScoreItem label="Coherence" value={toeicScore.coherence} icon="🔗" />
        )}
        {toeicScore.vocab != null && (
          <ScoreItem label="Vocabulary" value={toeicScore.vocab} icon="📚" />
        )}
      </div>

      <div className="mt-4 p-4 bg-slate-700/30 rounded-xl">
        <p className="text-xs text-slate-400">
          <span className="font-semibold">TOEIC Speaking Scoring:</span> Basic (10-120) | Intermediate (120-160) | Advanced (160-200)
        </p>
      </div>
    </div>
  );
}

export default TOEICScore;
