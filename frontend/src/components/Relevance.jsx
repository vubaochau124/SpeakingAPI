function Relevance({ relevance, scoreIssueList }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold text-indigo-900 mb-4">Relevance Analysis</h2>

      {/* Relevance Score */}
      {relevance && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-700 font-medium">Relevance Score</span>
            <span className="text-2xl font-bold text-indigo-600">{relevance.class}</span>
          </div>
          {relevance.explanation && (
            <p className="text-gray-600 text-sm">{relevance.explanation}</p>
          )}
        </div>
      )}

      {/* Score Issue List */}
      {scoreIssueList && scoreIssueList.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Issues</h3>
          <ul className="space-y-2">
            {scoreIssueList.map((issue, index) => (
              <li key={index} className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                {issue.detail_message && (
                  <p className="text-yellow-700 text-sm mt-1">{issue.detail_message}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!relevance && (!scoreIssueList || scoreIssueList.length === 0) && (
        <p className="text-gray-500">No relevance data available.</p>
      )}
    </div>
  );
}

export default Relevance;
