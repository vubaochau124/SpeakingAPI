function IELTSScore({ ieltsScore, title = "IELTS Score", detectedDialect, azureScores }) {
  const getScoreColor = (band) => {
    if (band === null || band === undefined) return 'text-slate-500';
    if (band >= 7) return 'text-emerald-400';
    if (band >= 5.5) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (band) => {
    if (band === null || band === undefined) return 'bg-slate-700/50';
    if (band >= 7) return 'bg-emerald-500/20 border-emerald-500/30';
    if (band >= 5.5) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  // For Azure 0-100 scores
  const getAzureScoreColor = (score) => {
    if (score === null || score === undefined) return 'text-slate-500';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getAzureScoreBg = (score) => {
    if (score === null || score === undefined) return 'bg-slate-700/50';
    if (score >= 80) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 60) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Number(score).toFixed(1);
  };

  // Calculate overall if not provided or is 0
  const calcOverall = () => {
    if (!ieltsScore) return null;
    if (ieltsScore.overall && ieltsScore.overall > 0) return ieltsScore.overall;
    const scores = [
      ieltsScore.pronunciation,
      ieltsScore.fluency,
      ieltsScore.grammar,
      ieltsScore.coherence,
      ieltsScore.vocab,
      ieltsScore.prosody
    ].filter(s => s != null && s !== undefined);
    if (scores.length === 0) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg * 2) / 2;
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
    </div>
  );

  const AzureScoreItem = ({ label, value, icon }) => (
    <div className={`p-4 rounded-xl border ${getAzureScoreBg(value)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${getAzureScoreColor(value)}`}>
        {formatScore(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">/100</p>
    </div>
  );

  if (!ieltsScore) {
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

      {/* IELTS Band Scores (0-9) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {ieltsScore.pronunciation != null && (
          <ScoreItem label="Pronunciation" value={ieltsScore.pronunciation} icon="🎯" />
        )}
        {ieltsScore.fluency != null && (
          <ScoreItem label="Fluency" value={ieltsScore.fluency} icon="🌊" />
        )}
        {ieltsScore.prosody != null && (
          <ScoreItem label="Prosody" value={ieltsScore.prosody} icon="🎵" />
        )}
        {ieltsScore.grammar != null && (
          <ScoreItem label="Grammar" value={ieltsScore.grammar} icon="📝" />
        )}
        {ieltsScore.coherence != null && (
          <ScoreItem label="Coherence" value={ieltsScore.coherence} icon="🔗" />
        )}
        {ieltsScore.vocab != null && (
          <ScoreItem label="Vocabulary" value={ieltsScore.vocab} icon="📚" />
        )}
        {ieltsScore.completeness != null && (
          <ScoreItem label="Completeness" value={ieltsScore.completeness} icon="✅" />
        )}
      </div>

      {/* Azure Raw Scores (0-100) - Only show if available */}
      {azureScores && (
        <div className="mt-6 pt-6 border-t border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Azure Speech Assessment (0-100)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {azureScores.accuracy != null && (
              <AzureScoreItem label="Accuracy" value={azureScores.accuracy} icon="🎯" />
            )}
            {azureScores.fluency != null && (
              <AzureScoreItem label="Fluency" value={azureScores.fluency} icon="🌊" />
            )}
            {azureScores.prosody != null && (
              <AzureScoreItem label="Prosody" value={azureScores.prosody} icon="🎵" />
            )}
            {azureScores.completeness != null && (
              <AzureScoreItem label="Completeness" value={azureScores.completeness} icon="✅" />
            )}
            {azureScores.pronunciation != null && (
              <AzureScoreItem label="Overall" value={azureScores.pronunciation} icon="📊" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default IELTSScore;
