function SegmentAnalysis({ segmentMetrics }) {
  if (!segmentMetrics || segmentMetrics.length === 0) {
    return null;
  }

  const getScoreColor = (score) => {
    if (score >= 7) return 'bg-emerald-500';
    if (score >= 5.5) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score) => {
    if (score >= 7) return 'text-emerald-400';
    if (score >= 5.5) return 'text-amber-400';
    return 'text-red-400';
  };

  // Calculate total duration for timeline visualization
  const totalDuration = segmentMetrics.reduce((sum, seg) => sum + (seg.duration || 0), 0);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>=�</span> Segment-by-Segment Analysis
      </h3>

      {/* Timeline Visualization */}
      <div className="mb-6">
        <div className="flex items-center gap-1 h-12 rounded-lg overflow-hidden border border-slate-700">
          {segmentMetrics.map((segment, index) => {
            const widthPercent = ((segment.duration || 1) / totalDuration) * 100;
            // Calculate average IELTS score from segment
            const getSegmentScore = () => {
              if (segment.ielts_score) {
                const scores = [
                  segment.ielts_score.pronunciation,
                  segment.ielts_score.fluency,
                  segment.ielts_score.grammar,
                  segment.ielts_score.coherence,
                  segment.ielts_score.vocab
                ].filter(s => s != null);
                return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
              }
              return 0;
            };
            const score = getSegmentScore();

            return (
              <div
                key={index}
                className={`h-full ${getScoreColor(score)} transition-all hover:opacity-80 cursor-pointer relative group`}
                style={{ width: `${widthPercent}%` }}
                title={`Segment ${index + 1}: ${score.toFixed(1)}`}
              >
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                  Seg {index + 1}: {score.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>0s</span>
          <span>{totalDuration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Segment List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {segmentMetrics.map((segment, index) => {
          // Calculate average IELTS score from segment
          const getSegmentScore = () => {
            if (segment.ielts_score) {
              const scores = [
                segment.ielts_score.pronunciation,
                segment.ielts_score.fluency,
                segment.ielts_score.grammar,
                segment.ielts_score.coherence,
                segment.ielts_score.vocab
              ].filter(s => s != null);
              return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            }
            return 0;
          };
          const score = getSegmentScore();

          return (
            <div
              key={index}
              className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30 hover:border-slate-500/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">Segment {index + 1}</p>
                    <p className="text-xs text-slate-500">
                      {segment.duration ? `${segment.duration.toFixed(2)}s` : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${getScoreTextColor(score)}`}>
                    {score.toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-500">Score</p>
                </div>
              </div>

              {/* Additional Metrics if available */}
              {segment.ielts_score && (
                <div className="mt-3 pt-3 border-t border-slate-600/30">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {segment.ielts_score.pronunciation != null && (
                      <div>
                        <p className="text-slate-500">Pronunciation</p>
                        <p className="text-white font-medium">{segment.ielts_score.pronunciation.toFixed(1)}</p>
                      </div>
                    )}
                    {segment.ielts_score.fluency != null && (
                      <div>
                        <p className="text-slate-500">Fluency</p>
                        <p className="text-white font-medium">{segment.ielts_score.fluency.toFixed(1)}</p>
                      </div>
                    )}
                    {segment.ielts_score.grammar != null && (
                      <div>
                        <p className="text-slate-500">Grammar</p>
                        <p className="text-white font-medium">{segment.ielts_score.grammar.toFixed(1)}</p>
                      </div>
                    )}
                    {segment.ielts_score.coherence != null && (
                      <div>
                        <p className="text-slate-500">Coherence</p>
                        <p className="text-white font-medium">{segment.ielts_score.coherence.toFixed(1)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-400 p-3 bg-slate-700/20 rounded-lg">
        <span className="font-semibold">Score Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Good (e7.0)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span> Fair (5.5-7.0)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500"></span> Needs Work (&lt;5.5)
        </span>
      </div>
    </div>
  );
}

export default SegmentAnalysis;
