import { useState, useEffect } from 'react';
import AudioInput from './components/AudioInput';
import AudioPlayer from './components/AudioPlayer';
import Transcript from './components/Transcript';
import Relevance from './components/Relevance';
import FeedbackDetails from './components/FeedbackDetails';
import ImprovedAnswer from './components/ImprovedAnswer';
import ConversationRolePlay from './components/ConversationRolePlay';
import ConversationResults from './components/ConversationResults';
import AIConversation from './components/AIConversation';
import Login from './components/Login';
import Register from './components/Register';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';
import StudentProgress from './components/progress/StudentProgress';
import axios from 'axios';

function MainApp({ embedded = false }) {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('read-aloud');
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

  const handleUnscriptedEvaluate = async (audioFile, question = '', language = 'en-US', transcript = '') => {
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
    if (transcript && transcript.trim()) {
      formData.append('transcript', transcript.trim());
      logTime('📝 Using pre-transcribed text from realtime API');
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
                'understanding': 'Understanding'
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
    <div className={embedded ? "" : "min-h-screen bg-gray-50"}>
      <div className={`container mx-auto px-4 max-w-5xl ${embedded ? 'py-4' : 'py-8'}`}>
        {/* Header - only show when not embedded */}
        {!embedded && (
          <>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-gray-900 font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                </div>
                <span className="text-gray-600">Welcome, <span className="text-gray-900 font-medium">{user?.username}</span></span>
              </div>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </>
        )}

        {/* Title Header - only show when not embedded */}
        {!embedded && (
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold text-blue-600 mb-3">
              Speech Evaluation
            </h1>
            <p className="text-gray-500 text-lg">IELTS Speaking Practice & Assessment</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex mb-8 bg-white shadow-sm rounded-2xl p-2 shadow-xl">
          <button
            onClick={() => setActiveTab('read-aloud')}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold text-base transition-all duration-300 ${
              activeTab === 'read-aloud'
                ? 'bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="hidden sm:inline"></span> Read Aloud
            </div>
            {conversationResults && <span className="ml-2 text-green-600">✓</span>}
          </button>
          <button
            onClick={() => setActiveTab('ai-conversation')}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold text-base transition-all duration-300 ${
              activeTab === 'ai-conversation'
                ? 'bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden sm:inline"></span> AI Chat
            </div>
          </button>
          <button
            onClick={() => setActiveTab('unscripted')}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold text-base transition-all duration-300 ${
              activeTab === 'unscripted'
                ? 'bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="hidden sm:inline"></span> Question
            </div>
            {unscriptedResults && <span className="ml-2 text-green-600">✓</span>}
          </button>
        </div>

        {/* Read Aloud Tab Content (formerly Conversation) */}
        {activeTab === 'read-aloud' && (
          <div className="space-y-6">
            {!conversationResults ? (
              <div className="bg-white shadow-sm rounded-2xl p-8 shadow-xl border border-gray-200">
                <ConversationRolePlay
                  conversations={conversations}
                  onFinish={handleConversationFinish}
                  loading={conversationLoading}
                />
                {conversationError && (
                  <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-600 px-4 py-3 rounded-xl">
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
              <div className="bg-white shadow-sm rounded-2xl p-8 text-center shadow-xl border border-gray-200">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="mt-4 text-gray-600">Analyzing your reading...</p>
              </div>
            )}
          </div>
        )}

        {/* AI Conversation Tab Content */}
        {activeTab === 'ai-conversation' && (
          <div className="bg-white shadow-sm rounded-2xl p-8 shadow-xl border border-gray-200">
            <AIConversation />
          </div>
        )}

        {/* Unscripted Tab Content */}
        {activeTab === 'unscripted' && (
          <div className="space-y-6">
            {!unscriptedResults ? (
              <div className="bg-white shadow-sm rounded-2xl p-8 shadow-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Answer a Question</h2>
                    <p className="text-gray-500">Speak freely to answer the question</p>
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
                  <div className="mt-4 bg-red-500/20 border border-red-500/50 text-red-600 px-4 py-3 rounded-xl">
                    {unscriptedError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Question Display */}
                {currentQuestion && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                        <span className="text-2xl">❓</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Question</h3>
                        <p className="text-gray-700 leading-relaxed">{currentQuestion}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Audio */}
                <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Your Recording</h3>
                  {unscriptedResults.audio_data && <AudioPlayer audioData={unscriptedResults.audio_data} />}
                </div>


                {/* Relevance */}
                {hasQuestion && (unscriptedResults.speech_score?.relevance || unscriptedResults.speech_score?.score_issue_list) && (
                  <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                    <Relevance
                      relevance={unscriptedResults.speech_score.relevance}
                      scoreIssueList={unscriptedResults.speech_score.score_issue_list}
                    />
                  </div>
                )}

                {/* Transcript */}
                {unscriptedResults.speech_score?.transcript && (
                  <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                      <>
                        {unscriptedResults.speech_score?.word_score_list ? (
                          <Transcript
                            transcript={unscriptedResults.speech_score.transcript}
                            wordList={unscriptedResults.speech_score.word_score_list}
                            audioData={unscriptedResults.audio_data}
                            language={unscriptedResults.speech_score?.detected_dialect?.lang_id}
                          />
                        ) : (
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Transcript</h3>
                            <p className="text-gray-600 leading-relaxed">{unscriptedResults.speech_score.transcript}</p>
                          </div>
                        )}
                      </>
                  </div>
                )}

                {/* Score & Detailed Feedback */}
                {(unscriptedResults.openai_result || unscriptedResults.combined_result || unscriptedResults._loading_openai) && (
                  <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
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
                  <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                    <ImprovedAnswer
                      improvedAnswerData={unscriptedResults.openai_result.improved_answer}
                      originalTranscript={unscriptedResults.speech_score?.transcript}
                    />
                  </div>
                )}

                <button
                  onClick={resetUnscripted}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-gray-900 font-bold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25"
                >
                  Try Again
                </button>
              </div>
            )}

            {unscriptedLoading && (
              <div className="bg-white shadow-sm rounded-2xl p-8 text-center shadow-xl border border-gray-200">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="mt-4 text-gray-600">{processingStep || 'Analyzing your speech...'}</p>
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

function UserLayout() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('practice'); // 'practice', 'classes', 'progress'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed Header Navigation */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="flex items-center py-3 gap-4">
            {/* Logo/Title - fixed width */}
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-blue-600 hidden sm:block">Speech Evaluation</h1>
              <h1 className="text-lg font-bold text-blue-600 sm:hidden">Speech</h1>
            </div>

            {/* Navigation Tabs - fill remaining space */}
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-full max-w-md">
                <button
                  onClick={() => setActiveTab('practice')}
                  className={`flex-1 px-2 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'practice'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span className="hidden sm:inline">Practice</span>
                </button>
                <button
                  onClick={() => setActiveTab('classes')}
                  className={`flex-1 px-2 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'classes'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="hidden sm:inline">My Classes</span>
                </button>
                <button
                  onClick={() => setActiveTab('progress')}
                  className={`flex-1 px-2 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'progress'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="hidden sm:inline">Progress</span>
                </button>
              </div>
            </div>

            {/* User & Logout - fixed width */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                </div>
                <span className="text-gray-700 text-sm">{user?.username}</span>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'practice' && <MainApp embedded />}
      {activeTab === 'classes' && <StudentDashboard embedded />}
      {activeTab === 'progress' && <StudentProgress />}
    </div>
  );
}

function AppWithAuth() {
  const { isAuthenticated, loading, user } = useAuth();
  const [authView, setAuthView] = useState('login');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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

  // Unified view for all users (can be both student and teacher)
  return <UserLayout />;
}

function App() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}

export default App;
