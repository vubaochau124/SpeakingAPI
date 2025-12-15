import { useState, useRef, useEffect } from 'react';
import QuestionSelector from './QuestionSelector';
import ChunkedAudioRecorder from './ChunkedAudioRecorder';

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
  const [audioLevel, setAudioLevel] = useState(0);
  const [useChunkedRecording, setUseChunkedRecording] = useState(true);
  const [chunkedTranscripts, setChunkedTranscripts] = useState([]);

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

  // Simple recording - no WebSocket
  const startRecording = async () => {
    try {
      setRecordStatus('Starting...');

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
        setRecordStatus('Sending for evaluation...');

        // Auto submit - same as upload file
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        onEvaluate(audioFile, question, language);
      };

      mediaRecorderRef.current.start(500);
      setIsRecording(true);
      setRecordStatus('🔴 Recording...');

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

  // Chunked recording handlers
  const handleChunkTranscribed = (chunkIndex, transcript, startTime, endTime) => {
    console.log(`Chunk ${chunkIndex} transcribed:`, transcript);
    setChunkedTranscripts(prev => [...prev, { chunkIndex, transcript, startTime, endTime }]);
  };

  const handleChunkedRecordingComplete = (allChunks, fullAudioBlob, transcripts) => {
    console.log('Recording complete with', allChunks.length, 'chunks,', transcripts.length, 'transcripts');
    setRecordedBlob(fullAudioBlob);
    setUploadedFile(null);

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(fullAudioBlob));

    setRecordStatus('Processing complete! Sending for final evaluation...');

    // Use transcripts passed directly from ChunkedAudioRecorder (already sorted)
    const chunkTranscriptsData = transcripts.map(ct => ({
      transcript: ct.transcript,
      startTime: ct.startTime,
      endTime: ct.endTime
    }));

    console.log('Sending chunk transcripts:', chunkTranscriptsData);

    // Auto submit with the full audio and pre-transcribed chunks
    const audioFile = new File([fullAudioBlob], 'recording.webm', { type: 'audio/webm' });
    onEvaluate(audioFile, question, language, chunkTranscriptsData);
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

      {/* Recording Mode Toggle */}
      <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-slate-300 text-sm font-medium">⚡ Real-time Processing</span>
            <p className="text-xs text-slate-500 mt-1">
              {useChunkedRecording
                ? 'Transcribes every 5 seconds while recording (faster results)'
                : 'Transcribes after recording ends (traditional mode)'}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={useChunkedRecording}
              onChange={(e) => setUseChunkedRecording(e.target.checked)}
              disabled={loading || isRecording}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
          </div>
        </label>
      </div>

      {/* Audio Input Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Record Audio - Use chunked or traditional based on toggle */}
        {useChunkedRecording ? (
          <ChunkedAudioRecorder
            onChunkTranscribed={handleChunkTranscribed}
            onRecordingComplete={handleChunkedRecordingComplete}
            chunkDuration={5}
            language={language}
            apiEndpoint="/api/transcribe-chunk"
            disabled={loading}
          />
        ) : (
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
              <div className="mb-3">
                <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
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
          </div>
        )}

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
