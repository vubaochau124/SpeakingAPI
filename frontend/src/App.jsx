import { useState } from 'react';
import AudioInput from './components/AudioInput';
import AudioPlayer from './components/AudioPlayer';
import Transcript from './components/Transcript';
import CEFRScore from './components/CEFRScore';
import axios from 'axios';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [audioData, setAudioData] = useState(null);

  const handleEvaluate = async (audioFile) => {
    setLoading(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append('audio', audioFile);

    try {
      const response = await axios.post('/api/evaluate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResults(response.data);
      setAudioData(response.data.audio_data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Evaluation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-900 mb-2">
            Speech Evaluation App
          </h1>
          <p className="text-gray-600">
            Record or upload audio to get detailed pronunciation feedback
          </p>
        </div>

        {/* Audio Input */}
        <AudioInput onEvaluate={handleEvaluate} loading={loading} />

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-lg shadow-lg p-8 mt-6 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-gray-600">Analyzing your speech...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mt-6">
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="mt-6 space-y-6">
            {/* Audio Player */}
            {audioData && <AudioPlayer audioData={audioData} />}

            {/* Transcript & Word Analysis */}
            {results.speech_score?.transcript && results.speech_score?.word_score_list && (
              <Transcript
                transcript={results.speech_score.transcript}
                wordList={results.speech_score.word_score_list}
              />
            )}

            {/* CEFR Score */}
            {results.speech_score?.cefr_score && (
              <CEFRScore cefrScore={results.speech_score.cefr_score} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
