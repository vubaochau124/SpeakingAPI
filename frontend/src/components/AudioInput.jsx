import { useState, useRef } from 'react';

function AudioInput({ onEvaluate, loading }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  const [fileName, setFileName] = useState('');

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
        setRecordStatus('Recording stopped. Click "Evaluate Speech" to analyze.');
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
    }
  };

  const handleSubmit = () => {
    const audioFile = recordedBlob
      ? new File([recordedBlob], 'recording.webm', { type: 'audio/webm' })
      : uploadedFile;

    if (audioFile) {
      onEvaluate(audioFile);
    } else {
      alert('Please record or upload audio first');
    }
  };

  const hasAudio = recordedBlob || uploadedFile;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Record Audio */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-indigo-500 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Record Audio</h3>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={`font-semibold py-2 px-6 rounded-lg transition duration-200 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 recording-pulse'
                : 'bg-indigo-600 hover:bg-indigo-700'
            } text-white disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <p className="mt-2 text-sm text-gray-500">{recordStatus}</p>
        </div>

        {/* Upload Audio */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-indigo-500 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Upload Audio</h3>
          <label
            htmlFor="audioFile"
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg cursor-pointer inline-block transition duration-200"
          >
            Choose File
          </label>
          <input
            type="file"
            id="audioFile"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={loading}
            className="hidden"
          />
          <p className="mt-2 text-sm text-gray-500">{fileName}</p>
        </div>
      </div>

      {/* Submit Button */}
      <div className="mt-6 text-center">
        <button
          onClick={handleSubmit}
          disabled={!hasAudio || loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
        >
          Evaluate Speech
        </button>
      </div>
    </div>
  );
}

export default AudioInput;
