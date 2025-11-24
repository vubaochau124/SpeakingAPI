function CEFRScore({ cefrScore, title = "CEFR Level", detectedDialect }) {
  const getLevelColor = (level) => {
    if (!level) return 'text-slate-500';
    if (level === 'A0') return 'text-red-400';
    if (level.startsWith('C')) return 'text-emerald-400'; // C1, C2
    if (level.startsWith('B')) return 'text-blue-400';    // B1, B2
    return 'text-amber-400';                               // A1, A2
  };

  const getLevelBg = (level) => {
    if (!level) return 'bg-slate-700/50 border-slate-600/30';
    if (level === 'A0') return 'bg-red-500/20 border-red-500/30';
    if (level.startsWith('C')) return 'bg-emerald-500/20 border-emerald-500/30';
    if (level.startsWith('B')) return 'bg-blue-500/20 border-blue-500/30';
    return 'bg-amber-500/20 border-amber-500/30';
  };

  const ScoreItem = ({ label, value, icon }) => (
    <div className={`p-4 rounded-xl border ${getLevelBg(value)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${getLevelColor(value)}`}>
        {value || '--'}
      </p>
    </div>
  );

  if (!cefrScore) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400">No CEFR level data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">Scale: A0, A1, A2, B1, B2, C1, C2</p>
        {detectedDialect && (
          <p className="text-slate-400 text-sm mt-1">
            🌍 Detected dialect: <span className="text-blue-400">{detectedDialect}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cefrScore.pronunciation != null && (
          <ScoreItem label="Pronunciation" value={cefrScore.pronunciation} icon="🎯" />
        )}
        {cefrScore.fluency != null && (
          <ScoreItem label="Fluency" value={cefrScore.fluency} icon="🌊" />
        )}
        {cefrScore.grammar != null && (
          <ScoreItem label="Grammar" value={cefrScore.grammar} icon="📝" />
        )}
        {cefrScore.coherence != null && (
          <ScoreItem label="Coherence" value={cefrScore.coherence} icon="🔗" />
        )}
        {cefrScore.vocab != null && (
          <ScoreItem label="Vocabulary" value={cefrScore.vocab} icon="📚" />
        )}
      </div>
    </div>
  );
}

export default CEFRScore;
