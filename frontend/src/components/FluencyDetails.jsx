function FluencyDetails({ fluency }) {
  if (!fluency) {
    return null;
  }

  const MetricCard = ({ label, value, unit, icon, description }) => (
    <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <p className="text-slate-400 text-sm">{label}</p>
          {description && <p className="text-slate-500 text-xs mt-0.5">{description}</p>}
        </div>
      </div>
      <p className="text-3xl font-bold text-white">
        {value !== null && value !== undefined ? value.toFixed(2) : '--'}
        {unit && <span className="text-lg text-slate-400 ml-1">{unit}</span>}
      </p>
    </div>
  );

  const PauseCard = ({ label, count, duration }) => (
    <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
      <p className="text-slate-400 text-sm mb-2">{label}</p>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-2xl font-bold text-white">{count || 0}</p>
          <p className="text-xs text-slate-500">pauses</p>
        </div>
        <div className="h-8 w-px bg-slate-600"></div>
        <div>
          <p className="text-2xl font-bold text-blue-400">
            {duration !== null && duration !== undefined ? duration.toFixed(1) : '0.0'}s
          </p>
          <p className="text-xs text-slate-500">total duration</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>🌊</span> Detailed Fluency Analysis
      </h3>

      {/* Speech & Articulation Rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <MetricCard
          label="Speech Rate"
          value={fluency.speech_rate}
          unit="words/sec"
          icon="🗣️"
          description="Overall speaking speed"
        />
        <MetricCard
          label="Articulation Rate"
          value={fluency.articulation_rate}
          unit="syllables/sec"
          icon="💨"
          description="Speed when actually speaking"
        />
      </div>

      {/* Words & Syllables per Minute */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <MetricCard
          label="Words Correct Per Minute"
          value={fluency.word_correct_per_minute || fluency.syllable_correct_per_minute / 1.5}
          unit="wpm"
          icon="✅"
          description="Correctly pronounced words"
        />
        <MetricCard
          label="Syllables Correct Per Minute"
          value={fluency.syllable_correct_per_minute}
          unit="spm"
          icon="📊"
          description="Correctly pronounced syllables"
        />
      </div>

      {/* Pause Analysis */}
      <div className="mb-4">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>⏸️</span> Pause Analysis
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PauseCard
            label="All Pauses"
            count={fluency.all_pause_count}
            duration={fluency.all_pause_duration}
          />
          {fluency.all_pause_list && fluency.all_pause_list.length > 0 && (
            <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
              <p className="text-slate-400 text-sm mb-2">Pause Locations</p>
              <div className="max-h-24 overflow-y-auto">
                <p className="text-xs text-slate-300">
                  {fluency.all_pause_list.map((pause, i) => {
                    // pause is [start_ms, end_ms], calculate duration in seconds
                    const duration = Array.isArray(pause) ? (pause[1] - pause[0]) / 1000 : pause;
                    return (
                      <span key={i} className="inline-block mr-2 mb-1 px-2 py-1 bg-slate-600/50 rounded">
                        {typeof duration === 'number' ? duration.toFixed(2) : duration}s
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Length of Runs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          label="Mean Length of Run"
          value={fluency.mean_length_run}
          unit="syllables"
          icon="📏"
          description="Average syllables between pauses"
        />
        <MetricCard
          label="Max Length of Run"
          value={fluency.max_length_run}
          unit="syllables"
          icon="🚀"
          description="Longest uninterrupted sequence"
        />
      </div>

      {/* Duration Info */}
      {(fluency.duration || fluency.articulation_length) && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fluency.duration && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-slate-400 text-sm">Total Duration</p>
              <p className="text-2xl font-bold text-blue-400">{fluency.duration.toFixed(2)}s</p>
            </div>
          )}
          {fluency.articulation_length && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <p className="text-slate-400 text-sm">Articulation Length</p>
              <p className="text-2xl font-bold text-cyan-400">{fluency.articulation_length.toFixed(2)}s</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FluencyDetails;
