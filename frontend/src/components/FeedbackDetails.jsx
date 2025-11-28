import { useState } from "react";

function FeedbackDetails({
  grammar,
  vocab,
  coherence,
  fluency,
  wordList,
}) {
  const [activeTab, setActiveTab] = useState("grammar");
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  // Metric descriptions for tooltip
  const metricDescriptions = {
    // Grammar
    "Grammatical Accuracy": "Measures how correctly you use grammar rules, including verb tenses, subject-verb agreement, and sentence structure.",
    "Grammatical Range": "Evaluates the variety and complexity of grammatical structures you use in your speech.",

    // Vocabulary
    "Lexical Diversity": "Measures the variety of different words you use. Higher diversity indicates richer vocabulary.",
    "Word Sophistication": "Evaluates your use of advanced, academic, or less common vocabulary.",
    "Word Specificity": "Checks if you use precise words instead of vague terms like 'thing', 'stuff', 'nice'.",
    "Academic Language Use": "Measures formal register and academic tone appropriate for professional contexts.",
    "Collocation Commonality": "Evaluates natural word combinations and phrases that native speakers commonly use.",
    "Adverb Diversity": "Measures variety in adverb usage beyond simple time/place words.",
    "Verb Diversity": "Evaluates use of varied verbs beyond basic ones like be/have/do/make/get.",

    // Coherence
    "Response Length": "Assesses if your response is adequately detailed and comprehensive for the question.",
    "Lexical Density": "Ratio of content words (nouns, verbs, adjectives) to total words. Higher density = more informative.",
    "Basic Connectives": "Use of simple linking words: and, but, or, so.",
    "Causal Connectives": "Use of cause-effect words: because, therefore, thus, as a result.",
    "Negative Connectives": "Use of contrast words: however, although, despite, nevertheless.",

    // Fluency
    "Speech Rate": "Words spoken per second. Natural pace is typically 2.5-4 words/sec.",
    "Articulation Rate": "Syllables per second when actually speaking (excluding pauses).",
    "Syllables Correct Per Minute": "Number of correctly pronounced syllables per minute.",
    "Words Correct Per Minute": "Number of correctly pronounced words per minute.",
  };

  const getLevelColor = (level) => {
    if (level === "high")
      return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
    if (level === "mid")
      return "text-amber-400 bg-amber-500/20 border-amber-500/30";
    if (level === "low") return "text-red-400 bg-red-500/20 border-red-500/30";
    return "text-slate-400 bg-slate-700/20 border-slate-600";
  };

  const getScoreColor = (score) => {
    if (score >= 8) return "text-emerald-400";
    if (score >= 5) return "text-amber-400";
    return "text-red-400";
  };

  const getScorePercentage = (score) => {
    return Math.min((score / 10) * 100, 100);
  };

  const getScoreIcon = (score) => {
    if (score >= 8) return "🌟";
    if (score >= 5) return "⭐";
    return "📌";
  };

  const getLevelTextColor = (level) => {
    if (level === "high") return "text-emerald-400";
    if (level === "mid") return "text-amber-400";
    if (level === "low") return "text-red-400";
    return "text-slate-300";
  };

  const MetricCard = ({ name, score, level, message, examples }) => {
    // Use level-based colors for fluency metrics, score-based for others
    const displayColor = level ? getLevelTextColor(level) : getScoreColor(score);

    return (
      <div
        className={`group p-5 rounded-xl border ${getLevelColor(
          level
        )} hover:scale-[1.02] transition-all duration-300 backdrop-blur-sm`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-2xl">{getScoreIcon(score)}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-lg">{name}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-3xl font-bold ${displayColor}`}
                  >
                    {score}
                  </span>
                  {level && (
                    <span
                      className={`text-xs px-3 py-1 rounded-full ${getLevelColor(
                        level
                      )} border font-medium`}
                    >
                      {level.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mt-3 pl-11">
            <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
            {examples && examples.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-slate-500 text-xs font-medium">
                  Examples:
                </span>
                {examples.map((ex, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/20 transition-colors"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const grammarMetrics = grammar?.overall_metrics
    ? [
        {
          name: "Grammatical Accuracy",
          ...grammar.overall_metrics.grammatical_accuracy,
        },
        {
          name: "Grammatical Range",
          ...grammar.overall_metrics.grammatical_range,
        },
      ].filter((m) => m.score !== undefined)
    : [];

  const vocabMetrics = vocab?.overall_metrics || coherence?.overall_metrics
    ? [
        {
          name: "Lexical Diversity",
          ...(vocab?.overall_metrics?.lexical_diversity || {}),
        },
        {
          name: "Word Sophistication",
          ...(vocab?.overall_metrics?.word_sophistication || {}),
        },
        { name: "Word Specificity", ...(vocab?.overall_metrics?.word_specificity || {}) },
        {
          name: "Academic Language Use",
          ...(vocab?.overall_metrics?.academic_language_use || {}),
        },
        {
          name: "Collocation Commonality",
          ...(vocab?.overall_metrics?.collocation_commonality || {}),
        },
        {
          name: "Adverb Diversity",
          ...(coherence?.overall_metrics?.adverb_diversity || {}),
        },
        { name: "Verb Diversity", ...(coherence?.overall_metrics?.verb_diversity || {}) },
      ].filter((m) => m.score !== undefined)
    : [];

  const coherenceMetrics = coherence?.overall_metrics || grammar?.overall_metrics
    ? [
        { name: "Response Length", ...(grammar?.overall_metrics?.length || {}) },
        {
          name: "Lexical Density",
          ...(coherence?.overall_metrics?.lexical_density || {}),
        },
        {
          name: "Basic Connectives",
          ...(coherence?.overall_metrics?.basic_connectives || {}),
        },
        {
          name: "Causal Connectives",
          ...(coherence?.overall_metrics?.causal_connectives || {}),
        },
        {
          name: "Negative Connectives",
          ...(coherence?.overall_metrics?.negative_connectives || {}),
        },
      ].filter((m) => m.score !== undefined)
    : [];

  const fluencyMetrics = fluency?.overall_metrics
    ? [
        {
          name: "Speech Rate",
          score: fluency.overall_metrics.speech_rate?.toFixed(2) || 0,
          level:
            fluency.overall_metrics.speech_rate >= 4.5
              ? "high"
              : fluency.overall_metrics.speech_rate >= 3.5
              ? "mid"
              : "low",
          message: `${fluency.overall_metrics.speech_rate?.toFixed(
            2
          )} words per second`,
        },
        {
          name: "Articulation Rate",
          score: fluency.overall_metrics.articulation_rate?.toFixed(2) || 0,
          level:
            fluency.overall_metrics.articulation_rate >= 4.5
              ? "high"
              : fluency.overall_metrics.articulation_rate >= 3.0
              ? "mid"
              : "low",
          message: `${fluency.overall_metrics.articulation_rate?.toFixed(
            2
          )} syllables per second (when speaking)`,
        },
        {
          name: "Syllables Correct Per Minute",
          score:
            fluency.overall_metrics.syllable_correct_per_minute?.toFixed(1) ||
            0,
          level:
            fluency.overall_metrics.syllable_correct_per_minute >= 200
              ? "high"
              : fluency.overall_metrics.syllable_correct_per_minute >= 150
              ? "mid"
              : "low",
          message: `${fluency.overall_metrics.syllable_correct_per_minute?.toFixed(
            1
          )} correct syllables per minute`,
        },
        {
          name: "Words Correct Per Minute",
          score:
            fluency.overall_metrics.word_correct_per_minute?.toFixed(1) || 0,
          level:
            fluency.overall_metrics.word_correct_per_minute >= 150
              ? "high"
              : fluency.overall_metrics.word_correct_per_minute >= 100
              ? "mid"
              : "low",
          message: `${fluency.overall_metrics.word_correct_per_minute?.toFixed(
            1
          )} correct words per minute`,
        },
      ]
    : [];

  const grammarErrors = grammar?.errors || [];

  const tabs = [
    { id: "grammar", label: "Grammar", icon: "📝", metrics: grammarMetrics },
    { id: "vocab", label: "Vocabulary", icon: "📚", metrics: vocabMetrics },
    {
      id: "coherence",
      label: "Coherence",
      icon: "🔗",
      metrics: coherenceMetrics,
    },
    { id: "fluency", label: "Fluency", icon: "🗣️", metrics: fluencyMetrics },
    { id: "errors", label: "Errors", icon: "⚠️", count: grammarErrors.length },
  ];

  const currentMetrics = tabs.find((t) => t.id === activeTab)?.metrics || [];

  const parseMessage = (message) => {
    return message.replace(
      /<suggestion>(.*?)<\/suggestion>/g,
      '<span class="text-emerald-400 font-semibold">$1</span>'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg">
          📊
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold text-white">Detailed Feedback</h3>
            <div className="relative">
              <button
                onClick={() => setShowInfoTooltip(!showInfoTooltip)}
                onBlur={() => setTimeout(() => setShowInfoTooltip(false), 200)}
                className="w-6 h-6 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 text-sm font-medium"
              >
                i
              </button>
              {showInfoTooltip && (
                <div className="absolute left-0 top-8 z-50 w-96 max-h-96 overflow-y-auto p-4 bg-slate-800 border border-slate-600 rounded-xl shadow-xl text-sm custom-scrollbar">
                  <div className="absolute -top-2 left-2 w-3 h-3 bg-slate-800 border-l border-t border-slate-600 transform rotate-45"></div>

                  {/* Grammar */}
                  <div className="mb-4">
                    <h4 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
                      <span>📝</span> Grammar
                    </h4>
                    <ul className="space-y-1.5 text-slate-300 text-xs">
                      <li><span className="text-white font-medium">Grammatical Accuracy:</span> {metricDescriptions["Grammatical Accuracy"]}</li>
                      <li><span className="text-white font-medium">Grammatical Range:</span> {metricDescriptions["Grammatical Range"]}</li>
                    </ul>
                  </div>

                  {/* Vocabulary */}
                  <div className="mb-4">
                    <h4 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
                      <span>📚</span> Vocabulary
                    </h4>
                    <ul className="space-y-1.5 text-slate-300 text-xs">
                      <li><span className="text-white font-medium">Lexical Diversity:</span> {metricDescriptions["Lexical Diversity"]}</li>
                      <li><span className="text-white font-medium">Word Sophistication:</span> {metricDescriptions["Word Sophistication"]}</li>
                      <li><span className="text-white font-medium">Word Specificity:</span> {metricDescriptions["Word Specificity"]}</li>
                      <li><span className="text-white font-medium">Academic Language:</span> {metricDescriptions["Academic Language Use"]}</li>
                      <li><span className="text-white font-medium">Collocation:</span> {metricDescriptions["Collocation Commonality"]}</li>
                      <li><span className="text-white font-medium">Adverb Diversity:</span> {metricDescriptions["Adverb Diversity"]}</li>
                      <li><span className="text-white font-medium">Verb Diversity:</span> {metricDescriptions["Verb Diversity"]}</li>
                    </ul>
                  </div>

                  {/* Coherence */}
                  <div className="mb-4">
                    <h4 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
                      <span>🔗</span> Coherence
                    </h4>
                    <ul className="space-y-1.5 text-slate-300 text-xs">
                      <li><span className="text-white font-medium">Response Length:</span> {metricDescriptions["Response Length"]}</li>
                      <li><span className="text-white font-medium">Lexical Density:</span> {metricDescriptions["Lexical Density"]}</li>
                      <li><span className="text-white font-medium">Basic Connectives:</span> {metricDescriptions["Basic Connectives"]}</li>
                      <li><span className="text-white font-medium">Causal Connectives:</span> {metricDescriptions["Causal Connectives"]}</li>
                      <li><span className="text-white font-medium">Negative Connectives:</span> {metricDescriptions["Negative Connectives"]}</li>
                    </ul>
                  </div>

                  {/* Fluency */}
                  <div>
                    <h4 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
                      <span>🗣️</span> Fluency
                    </h4>
                    <ul className="space-y-1.5 text-slate-300 text-xs">
                      <li><span className="text-white font-medium">Speech Rate:</span> {metricDescriptions["Speech Rate"]}</li>
                      <li><span className="text-white font-medium">Articulation Rate:</span> {metricDescriptions["Articulation Rate"]}</li>
                      <li><span className="text-white font-medium">Syllables/Min:</span> {metricDescriptions["Syllables Correct Per Minute"]}</li>
                      <li><span className="text-white font-medium">Words/Min:</span> {metricDescriptions["Words Correct Per Minute"]}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            Comprehensive analysis across all categories
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative bg-slate-800/30 backdrop-blur-sm rounded-2xl p-2 border border-slate-700/50">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 scale-105"
                  : "bg-transparent text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === "errors" && tab.count > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold animate-pulse">
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[300px]">
        {/* Grammar/Vocab/Coherence Metrics */}
        {activeTab !== "errors" && activeTab !== "fluency" && (
          <div className="space-y-4">
            {currentMetrics.length > 0 ? (
              currentMetrics.map((metric, idx) => (
                <MetricCard key={idx} {...metric} />
              ))
            ) : (
              <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <span className="text-5xl mb-3 block">📭</span>
                <p className="text-slate-400">
                  No data available for this category
                </p>
              </div>
            )}
          </div>
        )}

        {/* Fluency Tab */}
        {activeTab === "fluency" && (
          <div className="space-y-6">
            {fluencyMetrics.length > 0 ? (
              <>
                {/* Fluency Metrics */}
                <div className="grid md:grid-cols-2 gap-4">
                  {fluencyMetrics.map((metric, idx) => (
                    <MetricCard key={idx} {...metric} />
                  ))}
                </div>

              </>
            ) : (
              <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <span className="text-5xl mb-3 block">📭</span>
                <p className="text-slate-400">No fluency data available</p>
              </div>
            )}
          </div>
        )}

        {/* Errors Tab */}
        {activeTab === "errors" && (
          <div className="space-y-4">
            {grammarErrors.length > 0 ? (
              <>
                <div className="space-y-3">
                  {grammarErrors.map((error, idx) => (
                    <div
                      key={idx}
                      className="group p-5 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 hover:border-red-500/50 hover:from-red-500/15 hover:to-orange-500/15 transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/30 flex-shrink-0">
                          <span className="text-xl">⚠️</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded-full text-xs font-semibold uppercase tracking-wide">
                              {error.category}
                            </span>
                            <span className="text-xs text-slate-500">
                              Error #{idx + 1}
                            </span>
                          </div>

                          <p
                            className="text-slate-200 text-base leading-relaxed mb-3"
                            dangerouslySetInnerHTML={{
                              __html: parseMessage(error.message),
                            }}
                          />

                          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-medium">
                                Original:
                              </span>
                              <span className="px-2 py-1 bg-red-500/20 text-red-300 line-through rounded">
                                {error.matched_text}
                              </span>
                            </div>
                            <svg
                              className="w-4 h-4 text-slate-500 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                              />
                            </svg>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-medium">
                                Suggested:
                              </span>
                              <span className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded font-semibold">
                                {error.replacements?.[0]}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* {onShowImprovement && (
                  <button
                    onClick={() => onShowImprovement(grammarErrors)}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/25 hover:scale-[1.02] flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">✨</span>
                    <span>Show All Improvements in Transcript</span>
                  </button>
                )} */}
              </>
            ) : (
              <div className="text-center py-16 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-xl border border-emerald-500/30">
                <div className="inline-block p-4 bg-emerald-500/20 rounded-full mb-4">
                  <span className="text-6xl">🎉</span>
                </div>
                <h3 className="text-2xl font-bold text-emerald-400 mb-2">
                  Perfect Grammar!
                </h3>
                <p className="text-slate-300">
                  No grammar errors detected in your speech
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbackDetails;
