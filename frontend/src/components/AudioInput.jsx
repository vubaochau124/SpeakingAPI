import { useState, useRef } from 'react';
import QuestionSelector from './QuestionSelector';

function AudioInput({ onEvaluate, loading, buttonText = 'Get Feedback', questions = [], topics = [] }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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

    onEvaluate(audioFile, question);
  };

  const hasAudio = recordedBlob || uploadedFile;

  return (
    <div className="space-y-6">
      {/* Question Input */}
      <QuestionSelector
        questions={questions}
        topics={topics}
        onQuestionChange={setQuestion}
        disabled={loading}
      />

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

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!hasAudio || loading}
        className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-cyan-500/25"
      >
        {buttonText}
      </button>
    </div>
  );
}

export default AudioInput;
