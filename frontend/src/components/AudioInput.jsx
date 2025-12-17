import { useState, useRef, useEffect } from 'react';
import QuestionSelector from './QuestionSelector';
import useRealtimeTranscription from '../hooks/useRealtimeTranscription';

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: '🇺🇸 English' },
  { code: 'zh-CN', label: '🇨🇳 中文' },
  { code: 'ja-JP', label: '🇯🇵 日本語' },
  { code: 'ko-KR', label: '🇰🇷 한국어' },
];

function AudioInput({
  onEvaluate,
  loading,
  buttonText = 'Get Feedback',
  questions = [],
  topics = [],
  enableRealtimeTranscription = true, // Enable live transcription by default
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [audioLevel, setAudioLevel] = useState(0);
  const [useRealtime, setUseRealtime] = useState(enableRealtimeTranscription);
  const [liveTranscript, setLiveTranscript] = useState('');

  // Realtime transcription hook
  const {
    isConnected: rtConnected,
    isRecording: rtRecording,
    isSpeaking,
    error: rtError,
    startRecording: startRealtimeRecording,
    stopRecording: stopRealtimeRecording,
    reset: resetRealtime,
  } = useRealtimeTranscription({
    language,
    onTranscript: (text, fullTranscript) => {
      setLiveTranscript(fullTranscript || text);
    },
    onFinalTranscript: (finalTranscript) => {
      setLiveTranscript(finalTranscript);
    },
  });

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Audio level visualizer only (no chunking logic)
  const analyzeAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms / 255);

    setAudioLevel(Math.max(0, (db + 60) / 60 * 100));

    animationFrameRef.current = requestAnimationFrame(analyzeAudioLevel);
  };

  // Start recording with optional realtime transcription
  const startRecording = async () => {
    try {
      setRecordStatus('Starting...');
      setLiveTranscript('');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;

      // Setup audio analysis for visualizer
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

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        setUploadedFile(null);

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audioBlob));

        stream.getTracks().forEach(track => track.stop());
        setRecordStatus('Recording complete. Click "Evaluate" when ready.');
      };

      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      setRecordStatus(useRealtime ? '🔴 Recording with live transcription...' : '🔴 Recording...');

      // Start realtime transcription if enabled
      if (useRealtime) {
        try {
          await startRealtimeRecording();
        } catch (err) {
          console.warn('Realtime transcription failed to start:', err);
          // Continue recording even if realtime fails
        }
      }

      analyzeAudioLevel();

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Error accessing microphone: ' + err.message);
      setRecordStatus('');
    }
  };

  const stopRecording = async () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop realtime transcription first
    if (useRealtime && rtRecording) {
      try {
        await stopRealtimeRecording();
      } catch (err) {
        console.warn('Error stopping realtime transcription:', err);
      }
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

    // Pass live transcript if available (skips Whisper transcription in backend)
    onEvaluate(audioFile, question, language, useRealtime ? liveTranscript : '');
  };

  const hasAudio = recordedBlob || uploadedFile;

  return (
    <div className="space-y-6">
      {/* Language Selector */}
      <div className="bg-gray-100 rounded-xl p-4 border border-gray-200">
        <label className="block text-gray-600 text-sm font-medium mb-2">
          🌐 Select Language
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={loading || isRecording}
          className="w-full bg-white text-gray-900 border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
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

      {/* Realtime Transcription Toggle */}
      {enableRealtimeTranscription && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-700">Live transcription</span>
            <span className="text-xs text-gray-500">(see text as you speak)</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useRealtime}
              onChange={(e) => setUseRealtime(e.target.checked)}
              disabled={isRecording}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
          </label>
        </div>
      )}

      {/* Audio Input Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Record Audio */}
        <div className={`bg-gray-100 border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 ${
          isRecording ? 'border-red-500/70 bg-red-900/10' : 'border-gray-200 hover:border-blue-500/50'
        }`}>
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? useRealtime && isSpeaking
                ? 'bg-green-500 animate-pulse'
                : 'bg-red-500 animate-pulse'
              : 'bg-blue-600'
          }`}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {isRecording
              ? useRealtime && isSpeaking
                ? 'Speaking...'
                : 'Listening...'
              : 'Record Audio'}
          </h3>

          {/* Audio Level Indicator */}
          {isRecording && (
            <div className="mb-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          )}

          {/* Speaking/Connection status */}
          {isRecording && useRealtime && (
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className={`w-2 h-2 rounded-full ${rtConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-xs text-gray-500">
                {rtConnected ? (isSpeaking ? 'Voice detected' : 'Waiting for speech') : 'Connecting...'}
              </span>
            </div>
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={`font-semibold py-3 px-8 rounded-xl transition-all duration-300 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
          >
            {isRecording ? '⏹ Stop Recording' : '🎙 Start Recording'}
          </button>
          {recordStatus && (
            <p className={`mt-3 text-sm ${
              isRecording ? 'text-red-600' :
              recordStatus.includes('complete') ? 'text-emerald-600' : 'text-gray-500'
            }`}>
              {recordStatus}
            </p>
          )}
          {rtError && useRealtime && (
            <p className="mt-2 text-xs text-orange-600">{rtError}</p>
          )}
        </div>

        {/* Upload Audio */}
        <div className="bg-gray-100 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-500/50 transition-all duration-300">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Upload Audio</h3>
          <label className={`inline-block font-semibold py-3 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-gray-900 cursor-pointer transition-all duration-300 shadow-lg ${
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
            <p className="mt-3 text-sm text-emerald-600 truncate">{fileName}</p>
          )}
        </div>
      </div>

      {/* Live Transcript */}
      {useRealtime && (isRecording || liveTranscript) && (
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Live Transcript
            </h4>
            {isRecording && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Recording
              </span>
            )}
          </div>
          <div className="min-h-[60px] max-h-[150px] overflow-y-auto text-gray-800 leading-relaxed">
            {liveTranscript || (
              <span className="text-gray-400 italic">
                {isRecording ? 'Start speaking... transcript appears after pauses' : 'No transcript yet'}
              </span>
            )}
          </div>
          {liveTranscript && !isRecording && (
            <button
              onClick={() => {
                setLiveTranscript('');
                resetRealtime();
              }}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear transcript
            </button>
          )}
        </div>
      )}

      {/* Audio Preview */}
      {audioUrl && !isRecording && (
        <div className="bg-gray-100 rounded-xl p-4 border border-gray-200">
          <p className="text-gray-600 text-sm font-medium mb-3">🎧 Preview your recording:</p>
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      {/* Submit Button - Show for both recorded and uploaded audio */}
      {hasAudio && !isRecording && (
        <button
          onClick={handleSubmit}
          disabled={!hasAudio || loading || isRecording}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-gray-900 font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-blue-500/25"
        >
          {loading ? '⏳ Evaluating...' : `✨ ${buttonText}`}
        </button>
      )}
    </div>
  );
}

export default AudioInput;
