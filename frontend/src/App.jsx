import { useState, useEffect } from 'react';
import AudioInput from './components/AudioInput';
import AudioPlayer from './components/AudioPlayer';
import Transcript from './components/Transcript';
import Relevance from './components/Relevance';
import FeedbackDetails from './components/FeedbackDetails';
import ImprovedAnswer from './components/ImprovedAnswer';
import ConversationRolePlay from './components/ConversationRolePlay';
import ConversationResults from './components/ConversationResults';
import Login from './components/Login';
import Register from './components/Register';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
import axios from 'axios';

function MainApp() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('conversation');
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    // Fetch questions for Part 2
    axios.get('/api/questions')
      .then(res => {
        setQuestions(res.data.questions || []);
        setTopics(res.data.topics || []);
      })
      .catch(err => console.error('Failed to load questions:', err));

    // Fetch conversations for Part 1
    axios.get('/api/conversations')
      .then(res => {
        setConversations(res.data.conversations || []);
      })
      .catch(err => console.error('Failed to load conversations:', err));
  }, []);

  // Conversation (Part 1) state
  const [conversationResults, setConversationResults] = useState(null);
  const [conversationTexts, setConversationTexts] = useState([]);
  const [conversationLineAudios, setConversationLineAudios] = useState([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState(null);

  // Unscripted (Part 2) state
  const [unscriptedResults, setUnscriptedResults] = useState(null);
  const [unscriptedLoading, setUnscriptedLoading] = useState(false);
  const [openaiLoading, setOpenaiLoading] = useState(false);  // Separate loading for OpenAI
  const [unscriptedError, setUnscriptedError] = useState(null);
  const [hasQuestion, setHasQuestion] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [processingStep, setProcessingStep] = useState(''); // Track current processing step

  const handleConversationFinish = async (audioFile, texts, options = {}) => {
    setConversationLoading(true);
    setConversationError(null);
    setConversationTexts(texts);
    setConversationLineAudios(options.lineAudios || []);

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('texts', JSON.stringify(texts));
    if (options.conversationId) {
      formData.append('conversation_id', options.conversationId);
    }

    try {
      const response = await axios.post('/api/evaluate-conversation', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders()
        },
      });
      setConversationResults(response.data);
    } catch (err) {
      setConversationError(err.response?.data?.detail || err.message || 'Evaluation failed');
    } finally {
      setConversationLoading(false);
    }
  };

  const handleUnscriptedEvaluate = async (audioFile, question = '', language = 'en-US') => {
    // Start timing from button click
    const startTime = performance.now();
    const logTime = (label) => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`[TIMING] ${elapsed}s - ${label}`);
      return elapsed;
    };

    logTime('🚀 Button clicked - Starting evaluation');

    setUnscriptedLoading(true);
    setOpenaiLoading(true);
    setUnscriptedError(null);
    setUnscriptedResults(null);
    setHasQuestion(!!question.trim());
    setCurrentQuestion(question.trim());
    setProcessingStep('Uploading audio...');

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('language', language);
    if (question.trim()) {
      formData.append('question', question.trim());
    }

    try {
      // Use new unified streaming endpoint for faster progressive results
      setProcessingStep('Connecting...');
      logTime('📤 Sending request to /api/evaluate-stream');

      const authToken = localStorage.getItem('token');
      const response = await fetch('/api/evaluate-stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });

      logTime('📡 Connection established, starting stream');

      if (!response.ok) {
        throw new Error(`Evaluation failed: ${response.statusText}`);
      }

      // Read the SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let partialOpenaiResult = {};
      let currentAzureScores = { pronunciation_band: 5.0, fluency_band: 5.0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          logTime('✅ Stream complete');
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (lines ending with \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6); // Remove 'data: ' prefix

          try {
            const data = JSON.parse(jsonStr);
            logTime(`📥 ${data.type} (server: ${data.elapsed}s)`);

            if (data.type === 'audio_received') {
              // Audio received - show preview immediately
              setProcessingStep('Transcribing speech...');
              setUnscriptedResults(prev => ({
                ...prev,
                audio_data: data.audio_data,
                _loading_openai: true
              }));
            } else if (data.type === 'transcription_complete') {
              // Transcript ready - show it
              setProcessingStep('Analyzing pronunciation...');
              setUnscriptedResults(prev => ({
                ...prev,
                speech_score: { transcript: data.transcript },
                transcript: data.transcript
              }));
              // Main loading done - transcript visible
              setUnscriptedLoading(false);
            } else if (data.type === 'azure_complete') {
              // Azure pronunciation/fluency scores ready
              setProcessingStep('Evaluating content...');
              currentAzureScores = data.azure_scores;
              setUnscriptedResults(prev => ({
                ...prev,
                speech_score: {
                  ...prev?.speech_score,
                  ...data.azure_result?.speech_score,
                  word_score_list: data.azure_result?.speech_score?.word_score_list
                },
                azure_scores: data.azure_scores,
                combined_result: {
                  ...prev?.combined_result,
                  pronunciation: data.azure_scores?.pronunciation_band,
                  fluency: data.azure_scores?.fluency_band
                }
              }));
            } else if (data.type === 'criterion') {
              // OpenAI criterion completed - update progressively
              const criterionNames = {
                'coherence': 'Coherence',
                'lexical_resource': 'Vocabulary',
                'grammar': 'Grammar',
                'topic_relevance': 'Relevance'
              };
              setProcessingStep(`Evaluated: ${criterionNames[data.criterion] || data.criterion}`);
              partialOpenaiResult[data.criterion] = data.result;
              setUnscriptedResults(prev => ({
                ...prev,
                openai_result: { ...partialOpenaiResult },
                combined_result: {
                  ...prev?.combined_result,
                  [data.criterion]: data.result?.band
                }
              }));
            } else if (data.type === 'complete') {
              // All evaluations complete
              setProcessingStep('Generating suggestions...');
              setUnscriptedResults(prev => ({
                ...prev,
                openai_result: data.openai_result,
                combined_result: data.combined_result
              }));
            } else if (data.type === 'improved_answer') {
              // Improved answer arrived (background)
              setProcessingStep('');
              setUnscriptedResults(prev => ({
                ...prev,
                openai_result: {
                  ...prev?.openai_result,
                  improved_answer: data.result
                }
              }));
            } else if (data.type === 'done') {
              // Stream complete
              console.log('[Stream] Complete');
              setProcessingStep('');
              setUnscriptedResults(prev => ({
                ...prev,
                _loading_openai: false
              }));
            } else if (data.type === 'error') {
              console.error('[Stream] Error:', data.message);
              setProcessingStep('');
              setUnscriptedError(data.message);
            }
          } catch (e) {
            console.warn('[Stream] Parse error:', e, jsonStr);
          }
        }
      }

      // Mark loading complete
      setUnscriptedResults(prev => ({
        ...prev,
        _loading_openai: false
      }));

    } catch (err) {
      setUnscriptedError(err.response?.data?.detail || err.message || 'Evaluation failed');
      setUnscriptedLoading(false);
    } finally {
      setOpenaiLoading(false);
    }
  };

  const resetConversation = () => {
    setConversationResults(null);
    setConversationError(null);
    setConversationTexts([]);
    setConversationLineAudios([]);
  };

  const resetUnscripted = () => {
    setUnscriptedResults(null);
    setUnscriptedError(null);
    setOpenaiLoading(false);
    setCurrentQuestion('');
    setHasQuestion(false);
    setProcessingStep('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* User Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
            </div>
            <span className="text-slate-300">Welcome, <span className="text-white font-medium">{user?.username}</span></span>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>

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
            onClick={() => setActiveTab('conversation')}
            className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
              activeTab === 'conversation'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Part 1: Conversation
            </div>
            {conversationResults && <span className="ml-2 text-green-300">✓</span>}
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

        {/* Conversation Tab Content */}
        {activeTab === 'conversation' && (
          <div className="space-y-6">
            {!conversationResults ? (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-700/50">
                <ConversationRolePlay
                  conversations={conversations}
                  onFinish={handleConversationFinish}
                  loading={conversationLoading}
                />
                {conversationError && (
                  <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl">
                    {conversationError}
                  </div>
                )}
              </div>
            ) : (
              <ConversationResults
                results={conversationResults}
                conversationTexts={conversationTexts}
                lineAudios={conversationLineAudios}
                onTryAgain={resetConversation}
              />
            )}

            {conversationLoading && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center shadow-xl border border-slate-700/50">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
                <p className="mt-4 text-slate-300">Analyzing your conversation...</p>
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

                {/* Score & Detailed Feedback */}
                {(unscriptedResults.openai_result || unscriptedResults.combined_result || unscriptedResults._loading_openai) && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <FeedbackDetails
                      openaiResult={unscriptedResults.openai_result}
                      combinedResult={unscriptedResults.combined_result}
                      fluencyMetrics={unscriptedResults.speech_score?.fluency?.overall_metrics}
                      title="Speaking Score"
                      isLoading={unscriptedResults._loading_openai}
                    />
                  </div>
                )}

                {/* Improved Answer Suggestion */}
                {unscriptedResults.openai_result?.improved_answer && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                    <ImprovedAnswer
                      improvedAnswerData={unscriptedResults.openai_result.improved_answer}
                      originalTranscript={unscriptedResults.speech_score?.transcript}
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
                <p className="mt-4 text-slate-300">{processingStep || 'Analyzing your speech...'}</p>
                <div className="mt-3 flex justify-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AppWithAuth() {
  const { isAuthenticated, loading, user } = useAuth();
  const [authView, setAuthView] = useState('login');
  const [studentView, setStudentView] = useState('dashboard'); // 'dashboard' or 'practice'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'login') {
      return <Login onSwitchToRegister={() => setAuthView('register')} />;
    }
    return <Register onSwitchToLogin={() => setAuthView('login')} />;
  }

  // Show different views based on role
  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  if (user?.role === 'teacher') {
    return <TeacherDashboard />;
  }

  // Student view
  if (studentView === 'dashboard') {
    return (
      <StudentDashboard
        onStartPractice={(context) => {
          // Only handle 'practice' type (Practice on My Own)
          if (context?.type === 'practice') {
            setStudentView('practice');
          }
        }}
      />
    );
  }

  // Practice view with back button (for "Practice on My Own")
  return (
    <div>
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => setStudentView('dashboard')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 backdrop-blur-sm text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-cyan-500/50 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
      </div>
      <MainApp />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}

export default App;
