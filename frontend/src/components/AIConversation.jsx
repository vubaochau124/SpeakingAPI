import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
];

function AIConversation() {
  const { getAuthHeaders } = useAuth();

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [status, setStatus] = useState('idle'); // 'idle', 'selecting', 'active', 'ended'

  // Messages
  const [messages, setMessages] = useState([]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isAIPlaying, setIsAIPlaying] = useState(false);

  // Topics
  const [topics, setTopics] = useState([]);
  const [customTopic, setCustomTopic] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);

  // Final results
  const [finalResults, setFinalResults] = useState(null);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const currentAudioRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch topics on mount
  useEffect(() => {
    fetchTopics();
  }, [language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsAIPlaying(false);
    };
  }, []);

  const fetchTopics = async () => {
    setLoadingTopics(true);
    try {
      const response = await axios.get(`/api/ai-conversation/topics?language=${language}`, {
        headers: getAuthHeaders()
      });
      setTopics(response.data || []);
    } catch (err) {
      console.error('Failed to load topics:', err);
    } finally {
      setLoadingTopics(false);
    }
  };

  const startSession = async (topicId = null, customTopicText = null) => {
    setIsProcessing(true);
    try {
      const response = await axios.post('/api/ai-conversation/start', {
        topic_id: topicId,
        custom_topic: customTopicText,
        language
      }, {
        headers: getAuthHeaders()
      });

      setSessionId(response.data.session_id);
      setTopic(response.data.topic);
      setStatus('active');

      // Add AI's opening message
      setMessages([{
        role: 'ai',
        text: response.data.ai_message,
        audioUrl: response.data.ai_audio_url
      }]);

      // Auto-play AI audio
      if (response.data.ai_audio_url) {
        playAudio(response.data.ai_audio_url);
      }

    } catch (err) {
      console.error('Failed to start session:', err);
      alert('Failed to start conversation. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = (url, autoPlay = true) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    if (!url) return;

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    // Track AI audio playing state
    audio.onplay = () => setIsAIPlaying(true);
    audio.onended = () => setIsAIPlaying(false);
    audio.onpause = () => setIsAIPlaying(false);
    audio.onerror = () => {
      setIsAIPlaying(false);
      console.log('Audio playback error');
    };

    if (autoPlay) {
      audio.play().catch(err => {
        console.log('Audio autoplay blocked:', err);
        setIsAIPlaying(false);
      });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await submitTurn(audioBlob);
      };

      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Error accessing microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const submitTurn = async (audioBlob) => {
    setIsProcessing(true);

    // Add placeholder for user message
    setMessages(prev => [...prev, {
      role: 'user',
      text: '...',
      isLoading: true
    }]);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await axios.post(`/api/ai-conversation/${sessionId}/turn`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders()
        }
      });

      // Update user message and add AI response
      setMessages(prev => {
        const updated = [...prev];
        // Update last message (user's)
        updated[updated.length - 1] = {
          role: 'user',
          text: response.data.user_transcript,
          isLoading: false
        };
        // Add AI response
        updated.push({
          role: 'ai',
          text: response.data.ai_text,
          audioUrl: response.data.ai_audio_url
        });
        return updated;
      });

      // Auto-play AI response
      if (response.data.ai_audio_url) {
        playAudio(response.data.ai_audio_url);
      }

    } catch (err) {
      console.error('Failed to submit turn:', err);
      // Remove placeholder
      setMessages(prev => prev.slice(0, -1));
      alert('Failed to process your response. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const endSession = async () => {
    setIsProcessing(true);
    try {
      const response = await axios.post(`/api/ai-conversation/${sessionId}/end`, {}, {
        headers: getAuthHeaders()
      });

      setFinalResults(response.data);
      setStatus('ended');

    } catch (err) {
      console.error('Failed to end session:', err);
      alert('Failed to get evaluation. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetConversation = () => {
    setSessionId(null);
    setTopic('');
    setStatus('idle');
    setMessages([]);
    setFinalResults(null);
    setCustomTopic('');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Topic Selection View
  if (status === 'idle' || status === 'selecting') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI Conversation</h2>
            <p className="text-gray-500">Practice speaking with an AI partner</p>
          </div>
        </div>

        {/* Language Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        {/* Topic Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Choose a Topic</h3>

          {loadingTopics ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : (
            <>
              {/* Predefined Topics */}
              {topics.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {topics.map(t => (
                    <button
                      key={t.id}
                      onClick={() => startSession(t.id)}
                      disabled={isProcessing}
                      className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left disabled:opacity-50"
                    >
                      <h4 className="font-semibold text-gray-900">{t.name}</h4>
                      {t.name_vi && <p className="text-sm text-gray-500">{t.name_vi}</p>}
                      {t.description && <p className="text-sm text-gray-600 mt-1">{t.description}</p>}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom Topic */}
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Or enter your own topic</h4>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="e.g., Discuss favorite movies"
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => startSession(null, customTopic)}
                    disabled={!customTopic.trim() || isProcessing}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {isProcessing && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Starting conversation...</p>
          </div>
        )}
      </div>
    );
  }

  // Final Results View
  if (status === 'ended' && finalResults) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Conversation Complete!</h2>
          <p className="text-gray-500">Topic: {topic}</p>
        </div>

        {/* Overall Score */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white text-center">
          <p className="text-lg opacity-90">Overall Band Score</p>
          <p className="text-5xl font-bold my-2">{finalResults.overall_band?.toFixed(1) || '5.0'}</p>
          <p className="text-sm opacity-75">
            {finalResults.turn_count} exchanges
            {finalResults.duration_minutes && ` • ${finalResults.duration_minutes} min`}
          </p>
        </div>

        {/* Summary Feedback */}
        {finalResults.summary && (
          <div className="space-y-4">
            {Object.entries(finalResults.summary).map(([key, value]) => (
              <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 capitalize mb-2">
                  {key === 'communication' ? 'Overall Communication' :
                   key === 'pronunciation' ? 'Pronunciation' :
                   key === 'language' ? 'Vocabulary & Grammar' :
                   'Conversation Skills'}
                </h4>
                <p className="text-gray-600">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Encouragement */}
        {finalResults.encouragement && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-yellow-800 font-medium">{finalResults.encouragement}</p>
          </div>
        )}

        <button
          onClick={resetConversation}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
        >
          Start New Conversation
        </button>
      </div>
    );
  }

  // Active Conversation View
  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{topic}</h3>
            <p className="text-sm text-gray-500">{messages.filter(m => m.role === 'user' && !m.isLoading).length} exchanges</p>
          </div>
        </div>
        <button
          onClick={endSession}
          disabled={isProcessing || isRecording}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          End Conversation
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              ) : (
                <>
                  <p className="leading-relaxed">{msg.text}</p>
                  {msg.audioUrl && msg.role === 'ai' && (
                    <button
                      onClick={() => playAudio(msg.audioUrl)}
                      className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                      Play
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Recording Controls */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
        {isRecording ? (
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-red-600">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
              <span className="font-mono text-lg">{formatTime(recordingTime)}</span>
            </div>
            <button
              onClick={stopRecording}
              className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors flex items-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Stop Recording
            </button>
          </div>
        ) : isProcessing ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Processing...</p>
          </div>
        ) : isAIPlaying ? (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-3 text-blue-600">
              <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <span className="font-medium">AI is speaking... Please wait</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">You can respond after the AI finishes speaking</p>
          </div>
        ) : (
          <button
            onClick={startRecording}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Click to Record Your Response
          </button>
        )}
      </div>
    </div>
  );
}

export default AIConversation;
