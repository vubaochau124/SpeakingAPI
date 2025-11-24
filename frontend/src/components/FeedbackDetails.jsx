import { useState } from 'react';

function FeedbackDetails({ grammar, vocab, coherence, fluency, wordList, onShowImprovement }) {
  const [activeTab, setActiveTab] = useState('grammar');

  const getLevelColor = (level) => {
    if (level === 'high') return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
    if (level === 'mid') return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
    if (level === 'low') return 'text-red-400 bg-red-500/20 border-red-500/30';
    return 'text-slate-400 bg-slate-700/20 border-slate-600'; // Neutral color for no level
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 5) return 'text-amber-400';
    return 'text-red-400';
  };

  const MetricCard = ({ name, score, level, message, examples }) => (
    <div className={`p-4 rounded-xl border ${getLevelColor(level)} mb-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium">{name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
          {level && (
            <span className={`text-xs px-2 py-1 rounded-full ${getLevelColor(level)} border`}>
              {level.toUpperCase()}
            </span>
          )}
        </div>
      </div>
      {message && (
        <>
          <p className="text-slate-400 text-sm mt-2">{message}</p>
          {examples && examples.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-slate-500 text-xs">List:</span>
              {examples.map((ex, i) => (
                <span key={i} className="text-xs px-2 py-1 bg-slate-600/50 text-slate-300 rounded">
                  {ex}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const grammarMetrics = grammar?.overall_metrics ? [
    { name: 'Response Length', ...grammar.overall_metrics.length },
    { name: 'Lexical Diversity', ...grammar.overall_metrics.lexical_diversity },
    { name: 'Grammatical Accuracy', ...grammar.overall_metrics.grammatical_accuracy },
    { name: 'Grammatical Range', ...grammar.overall_metrics.grammatical_range },
  ].filter(m => m.score !== undefined) : [];

  const vocabMetrics = vocab?.overall_metrics ? [
    { name: 'Lexical Diversity', ...vocab.overall_metrics.lexical_diversity },
    { name: 'Word Sophistication', ...vocab.overall_metrics.word_sophistication },
    { name: 'Word Specificity', ...vocab.overall_metrics.word_specificity },
    { name: 'Academic Language Use', ...vocab.overall_metrics.academic_language_use },
    { name: 'Collocation Commonality', ...vocab.overall_metrics.collocation_commonality },
    { name: 'Idiomaticity', ...vocab.overall_metrics.idiomaticity },
  ].filter(m => m.score !== undefined) : [];

  const coherenceMetrics = coherence?.overall_metrics ? [
    { name: 'Lexical Density', ...coherence.overall_metrics.lexical_density },
    { name: 'Basic Connectives', ...coherence.overall_metrics.basic_connectives },
    { name: 'Causal Connectives', ...coherence.overall_metrics.causal_connectives },
    { name: 'Negative Connectives', ...coherence.overall_metrics.negative_connectives },
    { name: 'Adverb Diversity', ...coherence.overall_metrics.adverb_diversity },
    { name: 'Verb Diversity', ...coherence.overall_metrics.verb_diversity },
  ].filter(m => m.score !== undefined) : [];

  const fluencyMetrics = fluency?.overall_metrics ? [
    {
      name: 'Speech Rate',
      score: fluency.overall_metrics.speech_rate?.toFixed(2) || 0,
      level: fluency.overall_metrics.speech_rate >= 4.5 ? 'high' : fluency.overall_metrics.speech_rate >= 3.5 ? 'mid' : 'low',
      message: `${fluency.overall_metrics.speech_rate?.toFixed(2)} syllables per second`
    },
    {
      name: 'Words Correct Per Minute',
      score: fluency.overall_metrics.word_correct_per_minute?.toFixed(1) || 0,
      level: fluency.overall_metrics.word_correct_per_minute >= 150 ? 'high' : fluency.overall_metrics.word_correct_per_minute >= 100 ? 'mid' : 'low',
      message: `${fluency.overall_metrics.word_correct_per_minute?.toFixed(1)} correct words per minute`
    },
    {
      name: 'Pause Count',
      score: fluency.overall_metrics.all_pause_count || 0,
      message: `${fluency.overall_metrics.all_pause_count || 0} pauses detected`
    },
    {
      name: 'Pause Duration',
      score: fluency.overall_metrics.all_pause_duration?.toFixed(2) || 0,
      message: `${fluency.overall_metrics.all_pause_duration?.toFixed(2)} seconds total pause time`
    }
  ] : [];

  const grammarErrors = grammar?.errors || [];

  // Function to find which words a pause is between
  const getPauseBetweenWords = (pauseStart, pauseEnd) => {
    if (!wordList || wordList.length === 0) return null;

    let wordBefore = null;
    let wordAfter = null;

    for (let i = 0; i < wordList.length; i++) {
      const word = wordList[i];
      let wordEnd = null;

      // Get word end frame from syllables or phones
      if (word.syllable_score_list && word.syllable_score_list.length > 0) {
        const lastSyllable = word.syllable_score_list[word.syllable_score_list.length - 1];
        wordEnd = lastSyllable.extent[1];
      } else if (word.phone_score_list && word.phone_score_list.length > 0) {
        const lastPhone = word.phone_score_list[word.phone_score_list.length - 1];
        wordEnd = lastPhone.extent[1];
      }

      if (wordEnd && wordEnd <= pauseStart) {
        wordBefore = word.word;
      }

      if (word.syllable_score_list && word.syllable_score_list.length > 0) {
        const wordStart = word.syllable_score_list[0].extent[0];
        if (wordStart >= pauseEnd && !wordAfter) {
          wordAfter = word.word;
          break;
        }
      } else if (word.phone_score_list && word.phone_score_list.length > 0) {
        const wordStart = word.phone_score_list[0].extent[0];
        if (wordStart >= pauseEnd && !wordAfter) {
          wordAfter = word.word;
          break;
        }
      }
    }

    return { wordBefore, wordAfter };
  };

  const tabs = [
    { id: 'grammar', label: 'Grammar', icon: '📝', metrics: grammarMetrics },
    { id: 'vocab', label: 'Vocabulary', icon: '📚', metrics: vocabMetrics },
    { id: 'coherence', label: 'Coherence', icon: '🔗', metrics: coherenceMetrics },
    { id: 'fluency', label: 'Fluency', icon: '🗣️', metrics: fluencyMetrics },
    { id: 'errors', label: 'Errors', icon: '⚠️', count: grammarErrors.length },
  ];

  const currentMetrics = tabs.find(t => t.id === activeTab)?.metrics || [];

  const parseMessage = (message) => {
    // Parse <suggestion>text</suggestion> tags
    return message.replace(/<suggestion>(.*?)<\/suggestion>/g, '<span class="text-emerald-400 font-semibold">$1</span>');
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-4">Detailed Feedback</h3>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-300 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
            {tab.id === 'errors' && tab.count > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Metrics */}
      {activeTab !== 'errors' && activeTab !== 'fluency' && (
        <div className="space-y-3">
          {currentMetrics.length > 0 ? (
            currentMetrics.map((metric, idx) => (
              <MetricCard key={idx} {...metric} />
            ))
          ) : (
            <p className="text-slate-400 text-center py-4">No data available</p>
          )}
        </div>
      )}

      {/* Fluency Tab */}
      {activeTab === 'fluency' && (
        <div className="space-y-4">
          {fluencyMetrics.length > 0 ? (
            <>
              {/* Fluency Metrics */}
              <div className="space-y-3">
                {fluencyMetrics.map((metric, idx) => (
                  <MetricCard key={idx} {...metric} />
                ))}
              </div>

              {/* Pause List - Only show pauses > 0.5s */}
              {fluency?.overall_metrics?.all_pause_list && (() => {
                const notablePauses = fluency.overall_metrics.all_pause_list.filter(pause => {
                  const duration = (pause[1] - pause[0]) / 100;
                  return duration > 0.3;
                });

                return notablePauses.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Notable Pauses ({">"} 0.3s)</h4>
                    <div className="space-y-2">
                      {notablePauses.map((pause, idx) => {
                        const pauseStart = pause[0];
                        const pauseEnd = pause[1];
                        const duration = ((pauseEnd - pauseStart) / 100).toFixed(2);
                        const wordsInfo = getPauseBetweenWords(pauseStart, pauseEnd);

                        return (
                          <div key={idx} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-1 bg-slate-600 text-slate-300 rounded">
                                  Pause {idx + 1}
                                </span>
                                {wordsInfo && (
                                  <div className="flex items-center gap-1 text-slate-300">
                                    {wordsInfo.wordBefore && (
                                      <span className="font-medium text-white">"{wordsInfo.wordBefore}"</span>
                                    )}
                                    <span className="text-slate-500">→</span>
                                    <span className="text-pink-400">⏸ {duration}s</span>
                                    <span className="text-slate-500">→</span>
                                    {wordsInfo.wordAfter && (
                                      <span className="font-medium text-white">"{wordsInfo.wordAfter}"</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="text-slate-400 text-center py-4">No fluency data available</p>
          )}
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <div className="space-y-3">
          {grammarErrors.length > 0 ? (
            <>
              {grammarErrors.map((error, idx) => (
                <div key={idx} className="p-4 rounded-xl border bg-red-500/10 border-red-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs px-2 py-1 bg-red-500/30 text-red-300 rounded-full">
                        {error.category}
                      </span>
                      <p
                        className="text-slate-300 mt-2"
                        dangerouslySetInnerHTML={{ __html: parseMessage(error.message) }}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-red-400 line-through">{error.matched_text}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-400 font-semibold">{error.replacements?.[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {onShowImprovement && (
                <button
                  onClick={() => onShowImprovement(grammarErrors)}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all duration-300"
                >
                  ✨ Show Improvements in Transcript
                </button>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <span className="text-4xl mb-3 block">🎉</span>
              <p className="text-emerald-400 font-medium">No grammar errors found!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FeedbackDetails;
