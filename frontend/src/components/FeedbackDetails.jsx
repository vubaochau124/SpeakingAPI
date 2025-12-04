import { useState } from "react";

function FeedbackDetails({ openaiResult, combinedResult, fluencyMetrics, title = "IELTS Score", isLoading = false }) {
  const [activeTab, setActiveTab] = useState("overview");

  // IELTS Band color functions
  const getBandColor = (band) => {
    if (band === null || band === undefined) return 'text-slate-400';
    if (band >= 7.0) return 'text-emerald-400';
    if (band >= 5.5) return 'text-blue-400';
    if (band >= 4.0) return 'text-amber-400';
    return 'text-red-400';
  };

  const getBandBg = (band) => {
    if (band === null || band === undefined) return 'bg-slate-700/50 border-slate-600';
    if (band >= 7.0) return 'bg-emerald-500/20 border-emerald-500/30';
    if (band >= 5.5) return 'bg-blue-500/20 border-blue-500/30';
    if (band >= 4.0) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  const getCEFRLevel = (band) => {
    if (band >= 8.5) return 'C2';
    if (band >= 7.0) return 'C1';
    if (band >= 5.5) return 'B2';
    if (band >= 4.0) return 'B1';
    if (band >= 3.0) return 'A2';
    return 'A1';
  };

  // Extract grammar errors (OpenAI uses "grammar" key, not "grammatical_range_accuracy")
  const grammarErrors = openaiResult?.grammar?.errors || [];

  // Tabs configuration
  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "fluency", label: "Fluency", icon: "🌊" },
    { id: "grammar", label: "Grammar", icon: "📝", count: grammarErrors.length },
    { id: "lexical", label: "Vocabulary", icon: "📚" },
    { id: "coherence", label: "Coherence", icon: "🔗" },
    { id: "relevance", label: "Relevance", icon: "💬" },
  ];

  // Score Card Component
  const ScoreCard = ({ title, band, feedback, icon, showErrors, errors, children }) => (
    <div className={`p-5 rounded-xl border ${getBandBg(band)} transition-all duration-300`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h4 className="text-white font-semibold text-lg">{title}</h4>
            {band && (
              <span className="text-xs text-slate-400">{getCEFRLevel(band)} Level</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-bold ${getBandColor(band)}`}>
            {band?.toFixed(1) || '--'}
          </p>
          <p className="text-xs text-slate-500">/9.0</p>
        </div>
      </div>
      {feedback && (
        <p className="text-slate-300 text-sm leading-relaxed">{feedback}</p>
      )}
      {!feedback && !children && (
        <p className="text-slate-500 text-sm italic">Score provided by Azure Speech API</p>
      )}
      {children}
      {showErrors && errors && errors.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-600/50">
          <p className="text-amber-400 text-sm font-medium mb-3">{errors.length} error(s) found:</p>
          <div className="space-y-3">
            {errors.map((error, idx) => (
              <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs rounded-full font-medium">
                    {error.category}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-red-500/20 text-red-300 line-through rounded text-sm">
                    {error.original}
                  </span>
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-sm font-medium">
                    {error.correction}
                  </span>
                </div>
                {error.explanation && (
                  <p className="text-slate-400 text-xs">{error.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Overview Score Item (compact)
  const OverviewItem = ({ label, band, icon }) => (
    <div className={`p-4 rounded-xl border ${getBandBg(band)} transition-all duration-300`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-slate-400 text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${getBandColor(band)}`}>
          {band?.toFixed(1) || '--'}
        </p>
        <span className="text-xs text-slate-500">/9.0</span>
        {band && <span className="text-xs text-slate-400 ml-auto">{getCEFRLevel(band)}</span>}
      </div>
    </div>
  );

  // Fluency Metric Item
  const FluencyMetricItem = ({ label, value, unit }) => (
    <div className="flex justify-between items-center py-2 border-b border-slate-600/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white font-semibold">
        {value?.toFixed(2) || '--'} <span className="text-slate-500 text-xs font-normal">{unit}</span>
      </span>
    </div>
  );

  // Loading skeleton for score cards
  const LoadingSkeleton = ({ label }) => (
    <div className="animate-pulse">
      <div className="p-5 rounded-xl border border-slate-600 bg-slate-700/50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-600 rounded"></div>
            <div>
              <div className="h-5 w-32 bg-slate-600 rounded mb-2"></div>
              <div className="h-3 w-16 bg-slate-600 rounded"></div>
            </div>
          </div>
          <div className="text-right">
            <div className="h-10 w-16 bg-slate-600 rounded mb-1"></div>
            <div className="h-3 w-8 bg-slate-600 rounded ml-auto"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-600 rounded w-full"></div>
          <div className="h-3 bg-slate-600 rounded w-4/5"></div>
          <div className="h-3 bg-slate-600 rounded w-3/5"></div>
        </div>
        {label && (
          <div className="mt-3 flex items-center gap-2 text-cyan-400 text-sm">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing {label}...
          </div>
        )}
      </div>
    </div>
  );

  // Overview item with loading state
  const OverviewItemWithLoading = ({ label, band, icon, isLoading }) => {
    if (isLoading && (band === null || band === undefined)) {
      return (
        <div className="p-4 rounded-xl border border-slate-600 bg-slate-700/50 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{icon}</span>
            <span className="text-slate-400 text-sm font-medium">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-12 bg-slate-600 rounded"></div>
            <svg className="animate-spin h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        </div>
      );
    }
    return <OverviewItem label={label} band={band} icon={icon} />;
  };

  if (!openaiResult && !combinedResult && !isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400">No feedback data available</p>
      </div>
    );
  }

  const overallBand = combinedResult?.overall_band;

  return (
    <div className="space-y-6">
      {/* Header with Overall Score on the right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg">
            📊
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">{title}</h3>
            <p className="text-slate-400 text-sm">
              IELTS Band Assessment (1.0-9.0)
              {isLoading && (
                <span className="ml-2 inline-flex items-center text-cyan-400">
                  <svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Overall Score - Right side */}
        {overallBand ? (
          <div className={`flex items-center gap-4 px-6 py-3 rounded-xl border ${getBandBg(overallBand)}`}>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Overall Band</p>
              <p className="text-xs text-slate-500">{getCEFRLevel(overallBand)} Level</p>
            </div>
            <div className="text-right">
              <p className={`text-5xl font-bold ${getBandColor(overallBand)}`}>
                {overallBand?.toFixed(1)}
              </p>
              <p className="text-xs text-slate-500 text-right">/9.0</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-4 px-6 py-3 rounded-xl border border-slate-600 bg-slate-700/50 animate-pulse">
            <div className="text-right">
              <div className="h-3 w-16 bg-slate-600 rounded mb-2"></div>
              <div className="h-3 w-12 bg-slate-600 rounded"></div>
            </div>
            <div className="text-right">
              <div className="h-12 w-16 bg-slate-600 rounded mb-1"></div>
              <div className="h-3 w-8 bg-slate-600 rounded ml-auto"></div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Tab Navigation */}
      <div className="relative bg-slate-800/30 backdrop-blur-sm rounded-2xl p-2 border border-slate-700/50">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 scale-105"
                  : "bg-transparent text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[200px]">
        {/* Overview Tab - 6 criteria grid with progressive loading */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <OverviewItem label="Pronunciation" band={combinedResult?.pronunciation} icon="🎯" />
            <OverviewItem label="Fluency" band={combinedResult?.fluency} icon="🌊" />
            <OverviewItemWithLoading
              label="Grammar"
              band={openaiResult?.grammar?.band || combinedResult?.grammar}
              icon="📝"
              isLoading={isLoading}
            />
            <OverviewItemWithLoading
              label="Lexical"
              band={openaiResult?.lexical_resource?.band || combinedResult?.lexical_resource}
              icon="📚"
              isLoading={isLoading}
            />
            <OverviewItemWithLoading
              label="Coherence"
              band={openaiResult?.coherence?.band || combinedResult?.coherence}
              icon="🔗"
              isLoading={isLoading}
            />
            <OverviewItemWithLoading
              label="Relevance"
              band={openaiResult?.topic_relevance?.band || combinedResult?.topic_relevance}
              icon="💬"
              isLoading={isLoading}
            />
          </div>
        )}

        {/* Fluency Tab with Azure Metrics */}
        {activeTab === "fluency" && (
          <ScoreCard
            title="Fluency"
            band={combinedResult?.fluency}
            icon="🌊"
          >
            {fluencyMetrics && (
              <div className="mt-4 pt-4 border-t border-slate-600/50">
                <p className="text-slate-300 text-sm font-medium mb-3">Speech Metrics</p>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <FluencyMetricItem
                    label="Speech Rate"
                    value={fluencyMetrics.speech_rate}
                    unit="words/sec"
                  />
                  <FluencyMetricItem
                    label="Articulation Rate"
                    value={fluencyMetrics.articulation_rate}
                    unit="syllables/sec"
                  />
                  <FluencyMetricItem
                    label="Words Correct/Min"
                    value={fluencyMetrics.word_correct_per_minute}
                    unit="wpm"
                  />
                  <FluencyMetricItem
                    label="Syllables Correct/Min"
                    value={fluencyMetrics.syllable_correct_per_minute}
                    unit="spm"
                  />
                </div>
              </div>
            )}
          </ScoreCard>
        )}

        {/* Grammar Tab with Errors */}
        {activeTab === "grammar" && (
          isLoading && !openaiResult?.grammar ? (
            <LoadingSkeleton label="grammar" />
          ) : (
            <ScoreCard
              title="Grammatical Range & Accuracy"
              band={openaiResult?.grammar?.band || combinedResult?.grammar}
              feedback={openaiResult?.grammar?.feedback}
              icon="📝"
              showErrors={true}
              errors={grammarErrors}
            />
          )
        )}

        {/* Lexical Resource Tab */}
        {activeTab === "lexical" && (
          isLoading && !openaiResult?.lexical_resource ? (
            <LoadingSkeleton label="vocabulary" />
          ) : (
            <ScoreCard
              title="Lexical Resource"
              band={openaiResult?.lexical_resource?.band || combinedResult?.lexical_resource}
              feedback={openaiResult?.lexical_resource?.feedback}
              icon="📚"
            />
          )
        )}

        {/* Coherence Tab */}
        {activeTab === "coherence" && (
          isLoading && !openaiResult?.coherence ? (
            <LoadingSkeleton label="coherence" />
          ) : (
            <ScoreCard
              title="Coherence"
              band={openaiResult?.coherence?.band || combinedResult?.coherence}
              feedback={openaiResult?.coherence?.feedback}
              icon="🔗"
            />
          )
        )}

        {/* Relevance Tab (Topic Relevance / Listening & Response) */}
        {activeTab === "relevance" && (
          isLoading && !openaiResult?.topic_relevance ? (
            <LoadingSkeleton label="relevance" />
          ) : (
            <ScoreCard
              title="Topic Relevance"
              band={openaiResult?.topic_relevance?.band || combinedResult?.topic_relevance}
              feedback={openaiResult?.topic_relevance?.feedback}
              icon="💬"
            />
          )
        )}
      </div>
    </div>
  );
}

export default FeedbackDetails;
