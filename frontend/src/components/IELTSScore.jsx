function IELTSScore({ scores, title = "IELTS Score", detectedDialect, combinedResult }) {
  // Use combinedResult if provided (new format), otherwise fall back to scores (legacy)
  const displayScores = combinedResult || scores;

  // Check if using new IELTS band format (1.0-9.0) or legacy (0-100)
  const isIELTSFormat = combinedResult ||
    (displayScores?.overall_band !== undefined) ||
    (displayScores?.coherence !== undefined && displayScores?.coherence <= 9) ||
    (displayScores?.fluency !== undefined && displayScores?.fluency <= 9);

  // Color functions for IELTS bands (1.0-9.0)
  const getBandColor = (band) => {
    if (band === null || band === undefined) return 'text-slate-500';
    if (band >= 7.0) return 'text-emerald-400';  // C1-C2
    if (band >= 5.5) return 'text-blue-400';     // B2
    if (band >= 4.0) return 'text-amber-400';    // B1
    return 'text-red-400';                        // A1-A2
  };

  const getBandBg = (band) => {
    if (band === null || band === undefined) return 'bg-slate-700/50';
    if (band >= 7.0) return 'bg-emerald-500/20 border-emerald-500/30';
    if (band >= 5.5) return 'bg-blue-500/20 border-blue-500/30';
    if (band >= 4.0) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  // Legacy color functions for 0-100 scale
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

  const formatBand = (band) => {
    if (band === null || band === undefined) return '--';
    return Number(band).toFixed(1);
  };

  const formatScore = (score) => {
    if (score === null || score === undefined) return '--';
    return Number(score).toFixed(1);
  };

  // Get CEFR level from IELTS band
  const getCEFRLevel = (band) => {
    if (band >= 8.5) return 'C2';
    if (band >= 7.0) return 'C1';
    if (band >= 5.5) return 'B2';
    if (band >= 4.0) return 'B1';
    if (band >= 3.0) return 'A2';
    return 'A1';
  };

  // IELTS Band Score Item
  const BandItem = ({ label, value, icon }) => (
    <div className={`p-4 rounded-xl border ${getBandBg(value)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${getBandColor(value)}`}>
        {formatBand(value)}
      </p>
      <div className="flex justify-between items-center mt-1">
        <p className="text-xs text-slate-500">/9.0</p>
        {value && <span className="text-xs text-slate-400">{getCEFRLevel(value)}</span>}
      </div>
    </div>
  );

  // Legacy Score Item (0-100)
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

  // Overall Band with larger display
  const OverallBand = ({ band }) => (
    <div className={`p-6 rounded-xl border ${getBandBg(band)} transition-all duration-300 col-span-2 md:col-span-1`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🏆</span>
        <span className="text-slate-300 font-semibold">Overall Band</span>
      </div>
      <div className="flex items-baseline gap-3">
        <p className={`text-5xl font-bold ${getBandColor(band)}`}>
          {formatBand(band)}
        </p>
        <div className="flex flex-col">
          <span className="text-slate-500 text-sm">/9.0</span>
          {band && <span className={`text-lg font-semibold ${getBandColor(band)}`}>{getCEFRLevel(band)}</span>}
        </div>
      </div>
    </div>
  );

  if (!displayScores) {
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
        {isIELTSFormat && (
          <p className="text-slate-500 text-xs mt-1">IELTS Band Scores (1.0-9.0)</p>
        )}
      </div>

      {isIELTSFormat ? (
        /* New IELTS Band Format (1.0-9.0) */
        <div className="space-y-4">
          {/* Overall Band - Prominent Display */}
          {displayScores.overall_band != null && (
            <div className="mb-6">
              <OverallBand band={displayScores.overall_band} />
            </div>
          )}

          {/* 6 Criteria Bands */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {displayScores.fluency != null && (
              <BandItem label="Fluency" value={displayScores.fluency} icon="🌊" />
            )}
            {displayScores.coherence != null && (
              <BandItem label="Coherence" value={displayScores.coherence} icon="🔗" />
            )}
            {displayScores.lexical_resource != null && (
              <BandItem label="Lexical Resource" value={displayScores.lexical_resource} icon="📚" />
            )}
            {displayScores.grammatical_range_accuracy != null && (
              <BandItem label="Grammar" value={displayScores.grammatical_range_accuracy} icon="📝" />
            )}
            {displayScores.pronunciation != null && (
              <BandItem label="Pronunciation" value={displayScores.pronunciation} icon="🎯" />
            )}
            {displayScores.topic_relevance != null && (
              <BandItem label="Topic Relevance" value={displayScores.topic_relevance} icon="💬" />
            )}
          </div>
        </div>
      ) : (
        /* Legacy Format (0-100) - Backward Compatibility */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {displayScores.pronunciation != null && (
            <ScoreItem label="Pronunciation" value={displayScores.pronunciation} icon="🎯" />
          )}
          {displayScores.fluency != null && (
            <ScoreItem label="Fluency" value={displayScores.fluency} icon="🌊" />
          )}
          {displayScores.accuracy != null && (
            <ScoreItem label="Accuracy" value={displayScores.accuracy} icon="✓" />
          )}
          {displayScores.grammar != null && (
            <ScoreItem label="Grammar" value={displayScores.grammar} icon="📝" />
          )}
          {displayScores.coherence != null && (
            <ScoreItem label="Coherence" value={displayScores.coherence} icon="🔗" />
          )}
          {displayScores.vocab != null && (
            <ScoreItem label="Vocabulary" value={displayScores.vocab} icon="📚" />
          )}
          {displayScores.completeness != null && (
            <ScoreItem label="Completeness" value={displayScores.completeness} icon="✅" />
          )}
        </div>
      )}
    </div>
  );
}

export default IELTSScore;
