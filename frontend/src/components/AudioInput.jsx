import { useState, useRef, useEffect, useCallback } from 'react';
import QuestionSelector from './QuestionSelector';

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: '🇺🇸 English' },
  { code: 'zh-CN', label: '🇨🇳 中文' },
  { code: 'ja-JP', label: '🇯🇵 日本語' },
  { code: 'ko-KR', label: '🇰🇷 한국어' },
];

// Real-time streaming configuration
const REALTIME_CONFIG = {
  SILENCE_THRESHOLD: -45,      // dB threshold for silence detection
  SILENCE_DURATION: 800,       // ms of silence before sending chunk
  MAX_CHUNK_DURATION: 30000,   // Force chunk after 30s even without silence
  MIN_CHUNK_DURATION: 3000,    // Minimum chunk duration (3s)
  AUDIO_SAMPLE_RATE: 16000,
};

function AudioInput({
  onEvaluate,
  onRealtimeResult,  // Callback for real-time results
  loading,
  buttonText = 'Get Feedback',
  questions = [],
  topics = []
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [language, setLanguage] = useState('en-US');

  // Real-time streaming state
  const [isConnected, setIsConnected] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [realtimeTranscript, setRealtimeTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [processingChunk, setProcessingChunk] = useState(false);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Real-time refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceStartRef = useRef(null);
  const chunkStartTimeRef = useRef(0);
  const pendingChunkRef = useRef([]);
  const animationFrameRef = useRef(null);
  const lastChunkEndRef = useRef(0);
  const recordingStartTimeRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Connect to WebSocket for real-time streaming
  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/evaluate-realtime`;

      console.log('[RT] Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      ws.onopen = () => {
        console.log('[RT] WebSocket connected');
        clearTimeout(timeout);
        setIsConnected(true);
        // Initialize session
        ws.send(JSON.stringify({
          type: 'init',
          language: language,
          question: question
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[RT] Received:', data.type, data);

        if (data.type === 'init_ok') {
          resolve(ws);
        } else if (data.type === 'chunk_received') {
          setProcessingChunk(true);
        } else if (data.type === 'chunk_result') {
          setProcessingChunk(false);
          // Update transcript progressively
          if (data.transcript) {
            setRealtimeTranscript(prev => {
              const newTranscript = prev ? prev + ' ' + data.transcript : data.transcript;
              return newTranscript.trim();
            });
          }
          if (onRealtimeResult) {
            onRealtimeResult({
              type: 'chunk',
              index: data.index,
              transcript: data.transcript,
              scores: data.scores
            });
          }
        } else if (data.type === 'final') {
          setIsConnected(false);
          setRecordStatus('Evaluation complete!');
          // Final result
          if (onRealtimeResult) {
            onRealtimeResult({
              type: 'final',
              ...data
            });
          }
        } else if (data.type === 'error') {
          console.error('[RT] Error:', data.message);
          setIsConnected(false);
          reject(new Error(data.message));
        }
      };

      ws.onerror = (error) => {
        console.error('[RT] WebSocket error:', error);
        clearTimeout(timeout);
        setIsConnected(false);
        reject(error);
      };

      ws.onclose = () => {
        console.log('[RT] WebSocket closed');
        setIsConnected(false);
      };

      wsRef.current = ws;
    });
  }, [language, question, onRealtimeResult]);

  // Send audio chunk to server
  const sendChunk = useCallback(async (audioBlob, startMs, endMs) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[RT] WebSocket not ready, skipping chunk');
      return;
    }

    // Convert blob to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      wsRef.current.send(JSON.stringify({
        type: 'chunk',
        audio: base64,
        start_ms: startMs,
        end_ms: endMs
      }));
      console.log(`[RT] Sent chunk: ${startMs}ms - ${endMs}ms (${audioBlob.size} bytes)`);
    };
    reader.readAsDataURL(audioBlob);
  }, []);

  // Send current chunk
  const sendCurrentChunk = useCallback((reason) => {
    if (pendingChunkRef.current.length === 0) return;

    const audioBlob = new Blob(pendingChunkRef.current, { type: 'audio/webm' });
    const now = Date.now();
    const endMs = now - recordingStartTimeRef.current;
    const startMs = lastChunkEndRef.current;

    console.log(`[RT] Creating chunk (${reason}): ${startMs}ms - ${endMs}ms`);

    sendChunk(audioBlob, startMs, endMs);
    setChunkCount(prev => prev + 1);

    // Reset for next chunk
    pendingChunkRef.current = [];
    lastChunkEndRef.current = endMs;
    chunkStartTimeRef.current = now;
    silenceStartRef.current = null;
  }, [sendChunk]);

  // Analyze audio level for silence detection
  const analyzeAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms / 255);

    setAudioLevel(Math.max(0, (db + 60) / 60 * 100)); // Normalize to 0-100

    const now = Date.now();
    const chunkDuration = now - chunkStartTimeRef.current;

    // Check if we should send chunk
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const isSilent = db < REALTIME_CONFIG.SILENCE_THRESHOLD;

      if (isSilent) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        } else {
          const silenceDuration = now - silenceStartRef.current;

          // Send chunk if silence detected AND minimum duration met
          if (silenceDuration >= REALTIME_CONFIG.SILENCE_DURATION &&
              chunkDuration >= REALTIME_CONFIG.MIN_CHUNK_DURATION &&
              pendingChunkRef.current.length > 0) {
            sendCurrentChunk('silence');
          }
        }
      } else {
        silenceStartRef.current = null;
      }

      // Force send if max duration exceeded
      if (chunkDuration >= REALTIME_CONFIG.MAX_CHUNK_DURATION &&
          pendingChunkRef.current.length > 0) {
        sendCurrentChunk('time');
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudioLevel);
  }, [isRecording, sendCurrentChunk]);

  // Start recording with real-time streaming
  const startRecording = async () => {
    try {
      // Reset state
      setRealtimeTranscript('');
      setChunkCount(0);
      setRecordStatus('Connecting...');

      // Connect to WebSocket first
      try {
        await connectWebSocket();
      } catch (err) {
        console.error('[RT] Failed to connect WebSocket:', err);
        setRecordStatus('Connection failed. Recording offline...');
        // Continue with offline recording
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: REALTIME_CONFIG.AUDIO_SAMPLE_RATE
        }
      });
      streamRef.current = stream;

      // Setup audio analysis for silence detection
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      audioChunksRef.current = [];
      pendingChunkRef.current = [];
      recordingStartTimeRef.current = Date.now();
      chunkStartTimeRef.current = Date.now();
      lastChunkEndRef.current = 0;
      silenceStartRef.current = null;

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          pendingChunkRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        setUploadedFile(null);

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audioBlob));

        stream.getTracks().forEach(track => track.stop());

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Send any remaining audio
          if (pendingChunkRef.current.length > 0) {
            sendCurrentChunk('end');
          }

          // Request final result
          setRecordStatus('Processing final results...');
          wsRef.current.send(JSON.stringify({ type: 'finish' }));
        } else {
          setRecordStatus('Recording complete');
        }
      };

      // Start recording with timeslice for real-time chunks (500ms intervals)
      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      setRecordStatus(isConnected ? '🔴 Recording (real-time)...' : '🔴 Recording...');

      // Start audio analysis
      analyzeAudioLevel();

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Error accessing microphone: ' + err.message);
      setRecordStatus('');
    }
  };

  const stopRecording = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      setRecordedBlob(null);
      setFileName(file.name);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
      setRealtimeTranscript('');
    }
  };

  const handleSubmit = () => {
    const audioFile = recordedBlob
      ? new File([recordedBlob], 'recording.webm', { type: 'audio/webm' })
      : uploadedFile;

    if (!audioFile) {
      alert('Please record or upload audio first');
      return;
    }

    onEvaluate(audioFile, question, language);
  };

  const hasAudio = recordedBlob || uploadedFile;

  return (
    <div className="space-y-6">
      {/* Language Selector */}
      <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
        <label className="block text-slate-300 text-sm font-medium mb-2">
          🌐 Select Language
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={loading || isRecording}
          className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Question Input */}
      <QuestionSelector
        questions={questions}
        topics={topics}
        onQuestionChange={setQuestion}
        disabled={loading || isRecording}
      />

      {/* Audio Input Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Record Audio */}
        <div className={`bg-slate-700/30 border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 ${
          isRecording ? 'border-red-500/70 bg-red-900/10' : 'border-slate-600 hover:border-cyan-500/50'
        }`}>
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500 animate-pulse'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600'
          }`}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-3">
            {isRecording ? 'Recording...' : 'Record Audio'}
          </h3>

          {/* Audio Level Indicator */}
          {isRecording && (
            <div className="mb-3 space-y-2">
              <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Chunks: {chunkCount}</span>
                {processingChunk && <span className="text-cyan-400 animate-pulse">Processing...</span>}
                {isConnected && <span className="text-green-400">⚡ Live</span>}
              </div>
            </div>
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={`font-semibold py-3 px-8 rounded-xl transition-all duration-300 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
          >
            {isRecording ? '⏹ Stop & Evaluate' : '🎙 Start Recording'}
          </button>
          {recordStatus && (
            <p className={`mt-3 text-sm ${
              isRecording ? 'text-red-400' :
              recordStatus.includes('complete') ? 'text-emerald-400' : 'text-slate-400'
            }`}>
              {recordStatus}
            </p>
          )}

          {/* Real-time info */}
          {!isRecording && (
            <p className="mt-2 text-xs text-slate-500">
              ⚡ Real-time evaluation: Get instant feedback while speaking
            </p>
          )}
        </div>

        {/* Upload Audio */}
        <div className="bg-slate-700/30 border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500/50 transition-all duration-300">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-3">Upload Audio</h3>
          <label className={`inline-block font-semibold py-3 px-8 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white cursor-pointer transition-all duration-300 shadow-lg ${
            isRecording ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            📁 Choose File
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              disabled={loading || isRecording}
              className="hidden"
            />
          </label>
          {fileName && (
            <p className="mt-3 text-sm text-emerald-400 truncate">{fileName}</p>
          )}
        </div>
      </div>

      {/* Real-time Transcript Preview */}
      {realtimeTranscript && (
        <div className="bg-slate-700/30 rounded-xl p-4 border border-cyan-500/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-cyan-400 text-sm font-medium">⚡ Live Transcript</span>
            {isRecording && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
          </div>
          <p className="text-white text-sm leading-relaxed">{realtimeTranscript}</p>
        </div>
      )}

      {/* Audio Preview */}
      {audioUrl && !isRecording && (
        <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
          <p className="text-slate-300 text-sm font-medium mb-3">🎧 Preview your recording:</p>
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      {/* Submit Button - Only show for uploaded files (recording auto-evaluates) */}
      {uploadedFile && (
        <button
          onClick={handleSubmit}
          disabled={!hasAudio || loading || isRecording}
          className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-cyan-500/25"
        >
          {buttonText}
        </button>
      )}
    </div>
  );
}

export default AudioInput;
