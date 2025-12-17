import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AudioPlayer from './AudioPlayer';
import Transcript from './Transcript';
import Relevance from './Relevance';
import FeedbackDetails from './FeedbackDetails';
import ImprovedAnswer from './ImprovedAnswer';

function AssignmentPractice({ assignment, onBack, onSubmitted }) {
  const { getAuthHeaders } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      setError('');

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError('Could not access microphone. Please allow microphone access.');
      console.error('Microphone error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setResults(null);
    setError('');
  };

  const submitRecording = async () => {
    if (!audioBlob) return;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('question', assignment.question_text);

    try {
      const response = await axios.post(`/api/assignments/${assignment.id}/submit`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders()
        }
      });
      setResults(response.data);
      setIsSubmitted(true);
      // Notify parent component that assignment was submitted
      if (onSubmitted) {
        onSubmitted(assignment.id);
      }
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.detail === 'Assignment already submitted') {
        setError('You have already submitted this assignment. You can only submit once.');
      } else {
        setError(err.response?.data?.detail || 'Submission failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Assignment
        </button>

        {!results ? (
          <>
            {/* Assignment Info */}
            <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded mb-1">
                    {assignment.topic}
                  </span>
                  <h1 className="text-xl font-bold text-gray-900">Assignment</h1>
                </div>
              </div>

              {/* Question */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Question</h2>
                <p className="text-gray-700 text-lg leading-relaxed">{assignment.question_text}</p>
              </div>

              {/* Requirements & Instructions */}
              {(assignment.requirements || assignment.instructions) && (
                <div className="grid md:grid-cols-2 gap-4">
                  {assignment.requirements && (
                    <div className="bg-gray-100 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-amber-600 mb-2">Requirements</h3>
                      <p className="text-gray-600 text-sm">{assignment.requirements}</p>
                    </div>
                  )}
                  {assignment.instructions && (
                    <div className="bg-gray-100 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-blue-600 mb-2">Instructions</h3>
                      <p className="text-gray-600 text-sm">{assignment.instructions}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recording Section */}
            <div className="bg-white shadow-sm rounded-2xl p-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 text-center mb-6">Record Your Answer</h2>

              {error && (
                <div className="mb-6 bg-red-500/20 border border-red-500/50 text-red-600 px-4 py-3 rounded-xl text-center">
                  {error}
                </div>
              )}

              {/* Recording Controls */}
              <div className="flex flex-col items-center">
                {!audioBlob ? (
                  <>
                    {/* Record Button */}
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={loading}
                      className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isRecording
                          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                          : 'bg-blue-600 hover:bg-blue-700'
                      } shadow-2xl`}
                    >
                      {isRecording ? (
                        <svg className="w-12 h-12 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      ) : (
                        <svg className="w-12 h-12 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      )}
                    </button>

                    {/* Recording Timer */}
                    <div className="mt-4 text-center">
                      {isRecording ? (
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                          <span className="text-2xl font-mono text-gray-900">{formatTime(recordingTime)}</span>
                        </div>
                      ) : (
                        <p className="text-gray-600">Click to start recording</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Preview Recording */}
                    <div className="w-full mb-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 text-center">Your Recording</h3>
                      <audio src={audioUrl} controls className="w-full" />
                      <p className="text-gray-600 text-sm text-center mt-2">
                        Duration: {formatTime(recordingTime)}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                      <button
                        onClick={resetRecording}
                        disabled={loading}
                        className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        Record Again
                      </button>
                      <button
                        onClick={submitRecording}
                        disabled={loading}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-gray-900 font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {loading ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            Evaluating...
                          </>
                        ) : (
                          <>
                            Submit Answer
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Tips */}
              <div className="mt-8 p-4 bg-gray-100 rounded-xl">
                <h4 className="text-sm font-semibold text-gray-600 mb-2">Tips for a good answer:</h4>
                <ul className="text-gray-600 text-sm space-y-1">
                  <li>- Speak clearly and at a natural pace</li>
                  <li>- Answer the question directly, then expand with details</li>
                  <li>- Use varied vocabulary and sentence structures</li>
                  <li>- Aim for at least 30-60 seconds of speaking</li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          /* Results View */
          <div className="space-y-6">
            {/* Assignment Question Reminder */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                  <span className="text-2xl">📝</span>
                </div>
                <div className="flex-1">
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded mb-2">
                    {assignment.topic}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Assignment Question</h3>
                  <p className="text-gray-700 leading-relaxed">{assignment.question_text}</p>
                </div>
              </div>
            </div>

            {/* Audio */}
            <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Your Recording</h3>
              {results.audio_data && <AudioPlayer audioData={results.audio_data} />}
            </div>

            {/* Relevance */}
            {(results.speech_score?.relevance || results.speech_score?.score_issue_list) && (
              <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                <Relevance
                  relevance={results.speech_score.relevance}
                  scoreIssueList={results.speech_score.score_issue_list}
                />
              </div>
            )}

            {/* Transcript */}
            {results.speech_score?.transcript && (
              <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                {results.speech_score?.word_score_list ? (
                  <Transcript
                    transcript={results.speech_score.transcript}
                    wordList={results.speech_score.word_score_list}
                    audioData={results.audio_data}
                    language={results.speech_score?.detected_dialect?.lang_id}
                  />
                ) : (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Transcript</h3>
                    <p className="text-gray-600 leading-relaxed">{results.speech_score.transcript}</p>
                  </div>
                )}
              </div>
            )}

            {/* Score & Detailed Feedback */}
            {(results.openai_result || results.combined_result) && (
              <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                <FeedbackDetails
                  openaiResult={results.openai_result}
                  combinedResult={results.combined_result}
                  fluencyMetrics={results.speech_score?.fluency?.overall_metrics}
                  title="Assignment Score"
                />
              </div>
            )}

            {/* Improved Answer - Check both new and legacy locations */}
            {(results.openai_result?.improved_answer || results.speech_score?.improved_answer) && (
              <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                <ImprovedAnswer
                  improvedAnswerData={results.openai_result?.improved_answer || results.speech_score?.improved_answer}
                  originalTranscript={results.speech_score?.transcript}
                />
              </div>
            )}

            {/* Submission Success Message */}
            {isSubmitted && (
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-xl font-bold text-green-600">Assignment Submitted Successfully!</h3>
                </div>
                <p className="text-gray-600">Your response has been recorded and evaluated. You can view your results anytime from the class page.</p>
              </div>
            )}

            {/* Action Button */}
            <div className="flex justify-center">
              <button
                onClick={onBack}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-gray-900 font-bold rounded-xl transition-all duration-300 shadow-lg"
              >
                Back to Class
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentPractice;
