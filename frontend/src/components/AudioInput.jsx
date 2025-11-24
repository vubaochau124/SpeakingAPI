import { useState, useRef, useEffect } from 'react';
import QuestionSelector from './QuestionSelector';

function AudioInput({ onEvaluate, loading, mode = 'unscripted', buttonText = 'Get Feedback', questions = [], topics = [] }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [question, setQuestion] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [dialect, setDialect] = useState('en-us');
  const [strictMode, setStrictMode] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    setRecordedBlob(null);
    setUploadedFile(null);
    setRecordStatus('');
    setFileName('');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }, [mode]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        setUploadedFile(null);
        setRecordStatus('Recording complete');
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordStatus('Recording...');
    } catch (err) {
      alert('Error accessing microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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

    const options = {
      dialect,
      pronunciationScoreMode: strictMode ? 'strict' : 'default'
    };

    if (mode === 'scripted') {
      if (!text.trim()) {
        alert('Please enter the text to read');
        return;
      }
      onEvaluate(audioFile, text.trim(), options);
    } else {
      onEvaluate(audioFile, question, options);
    }
  };

  const hasAudio = recordedBlob || uploadedFile;

  return (
    <div className="space-y-6">
      {/* Text Input for Scripted Mode */}
      {mode === 'scripted' && (
        <div>
          <label className="block text-slate-300 font-medium mb-2">
            Text to Read <span className="text-cyan-400">*</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the paragraph you will read aloud..."
            disabled={loading}
            rows={4}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50 transition-all duration-300"
          />
        </div>
      )}

      {/* Question Input for Unscripted Mode */}
      {mode === 'unscripted' && (
        <QuestionSelector
          questions={questions}
          topics={topics}
          onQuestionChange={setQuestion}
          disabled={loading}
        />
      )}

      {/* Audio Input Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Record Audio */}
        <div className="bg-slate-700/30 border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-cyan-500/50 transition-all duration-300">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-3">Record Audio</h3>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={`font-semibold py-3 px-8 rounded-xl transition-all duration-300 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
          >
            {isRecording ? '⏹ Stop Recording' : '🎙 Start Recording'}
          </button>
          {recordStatus && (
            <p className={`mt-3 text-sm ${isRecording ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {recordStatus}
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
          <label className="inline-block font-semibold py-3 px-8 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white cursor-pointer transition-all duration-300 shadow-lg">
            📁 Choose File
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              disabled={loading}
              className="hidden"
            />
          </label>
          {fileName && (
            <p className="mt-3 text-sm text-emerald-400 truncate">{fileName}</p>
          )}
        </div>
      </div>

      {/* Audio Preview */}
      {audioUrl && (
        <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
          <p className="text-slate-300 text-sm font-medium mb-3">🎧 Preview your recording:</p>
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      {/* Options */}
      <div className={`grid ${mode === 'scripted' ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-4`}>
        {/* Dialect Selection */}
        <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
          <label className="block text-slate-300 text-sm font-medium mb-2">🌍 Dialect</label>
          <div className="flex gap-2">
            <button
              onClick={() => setDialect('en-us')}
              disabled={loading}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                dialect === 'en-us'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
              }`}
            >
              🇺🇸 US English
            </button>
            <button
              onClick={() => setDialect('en-gb')}
              disabled={loading}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                dialect === 'en-gb'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
              }`}
            >
              🇬🇧 UK English
            </button>
          </div>
        </div>

        {/* Strict Mode - Only for unscripted mode */}
        {mode === 'unscripted' && (
          <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
            <label className="block text-slate-300 text-sm font-medium mb-2">⚙️ Scoring Mode</label>
            <button
              onClick={() => setStrictMode(!strictMode)}
              disabled={loading}
              className={`w-full py-2 px-4 rounded-lg font-medium transition-all ${
                strictMode
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
              }`}
            >
              {strictMode ? '🎯 Strict Mode' : '📊 Default Mode'}
            </button>
            <p className="text-slate-500 text-xs mt-2">
              {strictMode ? 'Stricter pronunciation scoring' : 'Standard pronunciation scoring'}
            </p>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!hasAudio || loading || (mode === 'scripted' && !text.trim())}
        className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-cyan-500/25"
      >
        {buttonText}
      </button>
    </div>
  );
}

export default AudioInput;
