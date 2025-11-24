function Relevance({ relevance, scoreIssueList }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>🎯</span> Relevance Analysis
      </h3>

      {/* Relevance Score */}
      {relevance && (
        <div className="mb-6 p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-300 font-medium">Relevance Score</span>
            <span className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {relevance.class}
            </span>
          </div>
          {relevance.explanation && (
            <p className="text-slate-400 text-sm leading-relaxed">{relevance.explanation}</p>
          )}
        </div>
      )}

      {/* Score Issue List */}
      {scoreIssueList && scoreIssueList.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span>⚠️</span> Issues Detected
          </h4>
          <ul className="space-y-3">
            {scoreIssueList.map((issue, index) => (
              <li
                key={index}
                className="bg-amber-500/10 border-l-4 border-amber-500 p-4 rounded-lg hover:bg-amber-500/20 transition-colors"
              >
                {issue.detail_message && (
                  <p className="text-amber-200 text-sm leading-relaxed">{issue.detail_message}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!relevance && (!scoreIssueList || scoreIssueList.length === 0) && (
        <div className="text-center py-8">
          <span className="text-4xl mb-3 block">✓</span>
          <p className="text-slate-400">No relevance data available</p>
        </div>
      )}
    </div>
  );
}

export default Relevance;
