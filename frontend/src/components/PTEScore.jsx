function PTEScore({ pteScore, title = "PTE Score", detectedDialect }) {
  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-slate-500';
    if (score >= 66) return 'text-emerald-400'; // Advanced (66-90)
    if (score >= 51) return 'text-blue-400';    // Intermediate (51-65)
    if (score >= 36) return 'text-amber-400';   // Basic (36-50)
    return 'text-red-400';                      // Below Basic (<36)
  };

  const getScoreBg = (score) => {
    if (score === null || score === undefined) return 'bg-slate-700/50';
    if (score >= 66) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 51) return 'bg-blue-500/20 border-blue-500/30';
    if (score >= 36) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Math.round(score);
  };

  const getScoreLevel = (score) => {
    if (score === null || score === undefined) return 'N/A';
    if (score >= 66) return 'Advanced';
    if (score >= 51) return 'Intermediate';
    if (score >= 36) return 'Basic';
    return 'Below Basic';
  };

  // Calculate overall if not provided or is 0
  const calcOverall = () => {
    if (!pteScore) return null;
    if (pteScore.overall && pteScore.overall > 0) return pteScore.overall;
    const scores = [
      pteScore.pronunciation,
      pteScore.fluency,
      pteScore.grammar,
      pteScore.coherence,
      pteScore.vocab
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

  if (!pteScore) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400">No PTE score data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">Scale: 10-90 points</p>
        {detectedDialect && (
          <p className="text-slate-400 text-sm mt-1">
            🌍 Detected dialect: <span className="text-blue-400">{detectedDialect}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {pteScore.pronunciation != null && (
          <ScoreItem label="Pronunciation" value={pteScore.pronunciation} icon="🎯" />
        )}
        {pteScore.fluency != null && (
          <ScoreItem label="Fluency" value={pteScore.fluency} icon="🌊" />
        )}
        {pteScore.grammar != null && (
          <ScoreItem label="Grammar" value={pteScore.grammar} icon="📝" />
        )}
        {pteScore.coherence != null && (
          <ScoreItem label="Coherence" value={pteScore.coherence} icon="🔗" />
        )}
        {pteScore.vocab != null && (
          <ScoreItem label="Vocabulary" value={pteScore.vocab} icon="📚" />
        )}
      </div>

      <div className="mt-4 p-4 bg-slate-700/30 rounded-xl">
        <p className="text-xs text-slate-400">
          <span className="font-semibold">PTE Academic Scoring:</span> Below Basic (10-35) | Basic (36-50) | Intermediate (51-65) | Advanced (66-90)
        </p>
      </div>
    </div>
  );
}

export default PTEScore;
