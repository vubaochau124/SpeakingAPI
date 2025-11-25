import { useState, useEffect } from 'react';
import AudioInput from './components/AudioInput';
import AudioPlayer from './components/AudioPlayer';
import Transcript from './components/Transcript';
import Relevance from './components/Relevance';
import IELTSScore from './components/IELTSScore';
import FeedbackDetails from './components/FeedbackDetails';
import ImprovedAnswer from './components/ImprovedAnswer';
import axios from 'axios';

function App() {
  const [activeTab, setActiveTab] = useState('scripted');
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    axios.get('/api/questions')
      .then(res => {
        setQuestions(res.data.questions || []);
        setTopics(res.data.topics || []);
      })
      .catch(err => console.error('Failed to load questions:', err));
  }, []);

  // Scripted (Part 1) state
  const [scriptedResults, setScriptedResults] = useState(null);
  const [scriptedLoading, setScriptedLoading] = useState(false);
  const [scriptedError, setScriptedError] = useState(null);

  // Unscripted (Part 2) state
  const [unscriptedResults, setUnscriptedResults] = useState(null);
  const [unscriptedLoading, setUnscriptedLoading] = useState(false);
  const [unscriptedError, setUnscriptedError] = useState(null);
  const [hasQuestion, setHasQuestion] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [showImprovedTranscript, setShowImprovedTranscript] = useState(false);

  const handleScriptedEvaluate = async (audioFile, text, options = {}) => {
    setScriptedLoading(true);
    setScriptedError(null);

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('text', text);
    formData.append('dialect', options.dialect || 'en-us');

    try {
      const response = await axios.post('/api/evaluate-scripted', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setScriptedResults(response.data);
    } catch (err) {
      setScriptedError(err.response?.data?.detail || err.message || 'Evaluation failed');
    } finally {
      setScriptedLoading(false);
    }
  };

  const handleUnscriptedEvaluate = async (audioFile, question = '', options = {}) => {
    setUnscriptedLoading(true);
    setUnscriptedError(null);
    setHasQuestion(!!question.trim());
    setCurrentQuestion(question.trim());

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('dialect', options.dialect || 'en-us');
    formData.append('pronunciation_score_mode', options.pronunciationScoreMode || 'default');
    if (question.trim()) {
      formData.append('question', question.trim());
    }

    try {
      const response = await axios.post('/api/evaluate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUnscriptedResults(response.data);
    } catch (err) {
      setUnscriptedError(err.response?.data?.detail || err.message || 'Evaluation failed');
    } finally {
      setUnscriptedLoading(false);
    }
  };

  const resetScripted = () => {
    setScriptedResults(null);
    setScriptedError(null);
  };

  const resetUnscripted = () => {
    setUnscriptedResults(null);
    setUnscriptedError(null);
    setCurrentQuestion('');
    setHasQuestion(false);
    setShowImprovedTranscript(false);
  };

  const handleShowImprovement = () => {
    setShowImprovedTranscript(true);
  };

  // Apply grammar corrections to transcript
  const getImprovedTranscript = () => {
    if (!unscriptedResults?.speech_score?.transcript || !unscriptedResults?.speech_score?.grammar?.errors) {
      return unscriptedResults?.speech_score?.transcript || '';
    }

    let transcript = unscriptedResults.speech_score.transcript;
    const errors = [...unscriptedResults.speech_score.grammar.errors].sort((a, b) => b.span[0] - a.span[0]);

    for (const error of errors) {
      if (error.replacements?.[0] && error.span) {
        const before = transcript.slice(0, error.span[0]);
        const after = transcript.slice(error.span[1]);
        transcript = before + error.replacements[0] + after;
      }
    }
    return transcript;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-sky-400 bg-clip-text text-transparent mb-3">
            Speech Evaluation
          </h1>
          <p className="text-slate-400 text-lg">IELTS Speaking Practice & Assessment</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex mb-8 bg-slate-800/50 backdrop-blur-sm rounded-2xl p-2 shadow-xl">
          <button
            onClick={() => setActiveTab('scripted')}
            className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
              activeTab === 'scripted'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Part 1: Read Aloud
            </div>
            {scriptedResults && <span className="ml-2 text-green-300">✓</span>}
          </button>
          <button
            onClick={() => setActiveTab('unscripted')}
            className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
              activeTab === 'unscripted'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Part 2: Answer Question
            </div>
            {unscriptedResults && <span className="ml-2 text-green-300">✓</span>}
          </button>
        </div>

        {/* Scripted Tab Content */}
        {activeTab === 'scripted' && (
          <div className="space-y-6">
            {!scriptedResults ? (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-700/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Read Aloud</h2>
                    <p className="text-slate-400">Enter a paragraph and read it aloud</p>
                  </div>
                </div>
                <AudioInput
                  onEvaluate={handleScriptedEvaluate}
                  loading={scriptedLoading}
                  mode="scripted"
                  buttonText="Get Feedback"
                />
                {scriptedError && (
                  <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl">
                    {scriptedError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* IELTS Score */}
                {scriptedResults.text_score?.ielts_score && (
                  <IELTSScore
                    ieltsScore={scriptedResults.text_score.ielts_score}
                    title="Part 1 Score"
                    detectedDialect={scriptedResults.text_score?.detected_dialect?.lang_id}
                  />
                )}

                {/* Audio & Transcript */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                  <h3 className="text-xl font-bold text-white mb-4">Your Recording</h3>
                  {scriptedResults.audio_data && <AudioPlayer audioData={scriptedResults.audio_data} />}
                </div>

                {scriptedResults.text_score?.word_score_list && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <Transcript
                      transcript={scriptedResults.text_score.word_score_list.map(w => w.word).join(' ')}
                      wordList={scriptedResults.text_score.word_score_list}
                      audioData={scriptedResults.audio_data}
                    />
                  </div>
                )}

                {/* Fluency Details for Part 1 */}
                {scriptedResults.text_score?.fluency?.overall_metrics && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50 space-y-6">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg">
                        🗣️
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">Fluency Analysis</h3>
                        <p className="text-slate-400 text-sm">Speech rate and pause metrics</p>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Speech Rate */}
                      <div className="group p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">🚀</span>
                          <p className="text-slate-300 text-sm font-medium">Speech Rate</p>
                        </div>
                        <p className="text-3xl font-bold text-emerald-400">
                          {scriptedResults.text_score.fluency.overall_metrics.speech_rate?.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">words/second</p>
                      </div>

                      {/* Articulation Rate */}
                      <div className="group p-5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">💬</span>
                          <p className="text-slate-300 text-sm font-medium">Articulation Rate</p>
                        </div>
                        <p className="text-3xl font-bold text-cyan-400">
                          {scriptedResults.text_score.fluency.overall_metrics.articulation_rate?.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">syllables/second</p>
                      </div>

                      {/* Syllables Per Min */}
                      <div className="group p-5 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">📊</span>
                          <p className="text-slate-300 text-sm font-medium">Syllables Per Min</p>
                        </div>
                        <p className="text-3xl font-bold text-blue-400">
                          {scriptedResults.text_score.fluency.overall_metrics.syllable_correct_per_minute?.toFixed(0)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">correct spm</p>
                      </div>

                      {/* Words Per Min */}
                      <div className="group p-5 rounded-xl bg-sky-500/10 border border-sky-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">⏱️</span>
                          <p className="text-slate-300 text-sm font-medium">Words Per Min</p>
                        </div>
                        <p className="text-3xl font-bold text-sky-400">
                          {scriptedResults.text_score.fluency.overall_metrics.word_correct_per_minute?.toFixed(0)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">correct wpm</p>
                      </div>

                      {/* Pause Count */}
                      <div className="group p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">⏸️</span>
                          <p className="text-slate-300 text-sm font-medium">Pause Count</p>
                        </div>
                        <p className="text-3xl font-bold text-amber-400">
                          {scriptedResults.text_score.fluency.overall_metrics.all_pause_count || 0}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">total pauses</p>
                      </div>

                      {/* Pause Duration */}
                      <div className="group p-5 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:scale-[1.02] transition-all duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">⏳</span>
                          <p className="text-slate-300 text-sm font-medium">Pause Duration</p>
                        </div>
                        <p className="text-3xl font-bold text-orange-400">
                          {scriptedResults.text_score.fluency.overall_metrics.all_pause_duration?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">total seconds</p>
                      </div>
                    </div>

                    {/* Notable Pauses */}
                    {scriptedResults.text_score.fluency.overall_metrics.all_pause_list && (() => {
                      const notablePauses = scriptedResults.text_score.fluency.overall_metrics.all_pause_list.filter(pause => {
                        const duration = (pause[1] - pause[0]) / 100;
                        return duration > 0.3;
                      });

                      return notablePauses.length > 0 && (
                        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                          <button
                            onClick={() => {
                              const el = document.getElementById('scripted-pauses');
                              if (el) el.classList.toggle('hidden');
                            }}
                            className="w-full flex items-center justify-between p-5 hover:bg-slate-700/30 transition-all duration-300 group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-cyan-500/20">
                                <span className="text-xl">📁</span>
                              </div>
                              <div className="text-left">
                                <h4 className="text-lg font-bold text-white">Notable Pauses</h4>
                                <p className="text-sm text-slate-400">
                                  {notablePauses.length} pauses longer than 0.3s detected
                                </p>
                              </div>
                            </div>
                            <svg className="w-5 h-5 text-slate-400 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          <div id="scripted-pauses" className="hidden p-5 pt-0 space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                            {notablePauses.map((pause, idx) => {
                              const pauseStart = pause[0];
                              const pauseEnd = pause[1];
                              const duration = ((pauseEnd - pauseStart) / 100).toFixed(2);

                              return (
                                <div key={idx} className="group p-4 rounded-lg bg-gradient-to-r from-slate-700/30 to-slate-700/10 border border-slate-600/30 hover:border-cyan-500/30 hover:from-cyan-500/5 hover:to-blue-500/5 transition-all duration-300">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-sm">
                                      {idx + 1}
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
                                      <span className="text-cyan-400 font-bold text-base">⏸</span>
                                      <span className="text-cyan-300 font-bold">{duration}s</span>
                                    </div>
                                    <span className="text-slate-400 text-sm">pause detected</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <button
                  onClick={resetScripted}
                  className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/25"
                >
                  Try Again
                </button>
              </div>
            )}

            {scriptedLoading && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center shadow-xl border border-slate-700/50">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
                <p className="mt-4 text-slate-300">Analyzing your speech...</p>
              </div>
            )}
          </div>
        )}

        {/* Unscripted Tab Content */}
        {activeTab === 'unscripted' && (
          <div className="space-y-6">
            {!unscriptedResults ? (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-700/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Answer a Question</h2>
                    <p className="text-slate-400">Speak freely to answer the question</p>
                  </div>
                </div>
                <AudioInput
                  onEvaluate={handleUnscriptedEvaluate}
                  loading={unscriptedLoading}
                  mode="unscripted"
                  buttonText="Get Feedback"
                  questions={questions}
                  topics={topics}
                />
                {unscriptedError && (
                  <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl">
                    {unscriptedError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Question Display */}
                {currentQuestion && (
                  <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <span className="text-2xl">❓</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-2">Question</h3>
                        <p className="text-slate-200 leading-relaxed">{currentQuestion}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* IELTS Score */}
                {unscriptedResults.speech_score?.ielts_score && (
                  <IELTSScore
                    ieltsScore={unscriptedResults.speech_score.ielts_score}
                    title="Part 2 Score"
                    detectedDialect={unscriptedResults.speech_score?.detected_dialect?.lang_id}
                  />
                )}

                {/* Audio */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                  <h3 className="text-xl font-bold text-white mb-4">Your Recording</h3>
                  {unscriptedResults.audio_data && <AudioPlayer audioData={unscriptedResults.audio_data} />}
                </div>


                {/* Relevance */}
                {hasQuestion && (unscriptedResults.speech_score?.relevance || unscriptedResults.speech_score?.score_issue_list) && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <Relevance
                      relevance={unscriptedResults.speech_score.relevance}
                      scoreIssueList={unscriptedResults.speech_score.score_issue_list}
                    />
                  </div>
                )}

                {/* Transcript */}
                {unscriptedResults.speech_score?.transcript && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                      <>
                        {unscriptedResults.speech_score?.word_score_list ? (
                          <Transcript
                            transcript={unscriptedResults.speech_score.transcript}
                            wordList={unscriptedResults.speech_score.word_score_list}
                            audioData={unscriptedResults.audio_data}
                          />
                        ) : (
                          <div>
                            <h3 className="text-xl font-bold text-white mb-4">Transcript</h3>
                            <p className="text-slate-300 leading-relaxed">{unscriptedResults.speech_score.transcript}</p>
                          </div>
                        )}
                      </>
                  </div>
                )}

                {/* Detailed Feedback */}
                {(unscriptedResults.speech_score?.grammar || unscriptedResults.speech_score?.vocab || unscriptedResults.speech_score?.coherence || unscriptedResults.speech_score?.fluency) && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <FeedbackDetails
                      grammar={unscriptedResults.speech_score.grammar}
                      vocab={unscriptedResults.speech_score.vocab}
                      coherence={unscriptedResults.speech_score.coherence}
                      fluency={unscriptedResults.speech_score.fluency}
                      wordList={unscriptedResults.speech_score.word_score_list}
                      onShowImprovement={handleShowImprovement}
                    />
                  </div>
                )}

                {/* Improved Answer Suggestion */}
                {unscriptedResults.speech_score?.improved_answer && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <ImprovedAnswer
                      improvedAnswerData={unscriptedResults.speech_score.improved_answer}
                      originalTranscript={unscriptedResults.speech_score.transcript}
                    />
                  </div>
                )}

                <button
                  onClick={resetUnscripted}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25"
                >
                  Try Again
                </button>
              </div>
            )}

            {unscriptedLoading && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center shadow-xl border border-slate-700/50">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="mt-4 text-slate-300">Analyzing your speech...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
