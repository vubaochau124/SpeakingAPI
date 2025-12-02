import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AssignmentPractice from './AssignmentPractice';
import FeedbackDetails from './FeedbackDetails';
import IELTSScore from './IELTSScore';
import Transcript from './Transcript';
import ImprovedAnswer from './ImprovedAnswer';

function StudentDashboard({ onStartPractice }) {
  const { user, token, getAuthHeaders, logout } = useAuth();
  const [view, setView] = useState('main'); // 'main', 'classes', 'class-detail', 'assignment', 'assignment-practice'
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [resultTab, setResultTab] = useState('ai'); // 'ai', 'teacher', 'overall'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (view === 'classes') {
      fetchClasses();
    }
  }, [view]);

  const fetchClasses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/classes', {
        headers: getAuthHeaders()
      });
      setClasses(response.data.classes || []);
    } catch (err) {
      setError('Failed to load classes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassAssignments = async (classId) => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`/api/classes/${classId}/assignments`, {
        headers: getAuthHeaders()
      });
      setAssignments(response.data.assignments || []);
    } catch (err) {
      setError('Failed to load assignments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClassSelect = async (classItem) => {
    setSelectedClass(classItem);
    await fetchClassAssignments(classItem.id);
    setView('class-detail');
  };

  const handleAssignmentSelect = (assignment) => {
    setSelectedAssignment(assignment);
    setView('assignment');
  };

  const handleStartAssignment = () => {
    // Go to assignment practice view
    setView('assignment-practice');
  };

  // Main selection view
  if (view === 'main') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          {/* User Header with Logout */}
          <div className="flex justify-between items-center mb-6 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'S'}</span>
              </div>
              <div>
                <span className="text-slate-300">Welcome, <span className="text-white font-medium">{user?.username}</span></span>
                <span className="ml-2 px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-xs rounded-full">Student</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-sky-400 bg-clip-text text-transparent mb-3">
              Student Dashboard
            </h1>
            <p className="text-slate-400 text-lg">What would you like to do today?</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* See Class Option */}
            <button
              onClick={() => setView('classes')}
              className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-700/50 hover:border-cyan-500/50 transition-all duration-300 text-left group"
            >
              <div className="w-16 h-16 mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">See My Classes</h2>
              <p className="text-slate-400">View your enrolled classes, assignments, and work on teacher-assigned tasks.</p>
            </button>

            {/* Practice on Own Option */}
            <button
              onClick={() => onStartPractice && onStartPractice({ type: 'practice' })}
              className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 text-left group"
            >
              <div className="w-16 h-16 mb-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Practice on My Own</h2>
              <p className="text-slate-400">Practice conversations and answer questions from the general question bank.</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Classes list view
  if (view === 'classes') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header with Logout */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setView('main')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Menu
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          <h1 className="text-3xl font-bold text-white mb-6">My Classes</h1>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
              <p className="mt-4 text-slate-300">Loading classes...</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center border border-slate-700/50">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Classes Yet</h3>
              <p className="text-slate-400">You haven't been enrolled in any classes yet.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {classes.map((classItem) => (
                <button
                  key={classItem.id}
                  onClick={() => handleClassSelect(classItem)}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-slate-700/50 hover:border-cyan-500/50 transition-all text-left"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">{classItem.name}</h3>
                      <p className="text-slate-400 text-sm mb-2">{classItem.description || 'No description'}</p>
                      <p className="text-cyan-400 text-sm">Teacher: {classItem.teacher_name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 text-sm">{classItem.student_count} students</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Class detail view
  if (view === 'class-detail' && selectedClass) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header with Logout */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => {
                setView('classes');
                setSelectedClass(null);
                setAssignments([]);
              }}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Classes
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-slate-700/50">
            <h1 className="text-3xl font-bold text-white mb-2">{selectedClass.name}</h1>
            <p className="text-slate-400 mb-2">{selectedClass.description || 'No description'}</p>
            <p className="text-cyan-400">Teacher: {selectedClass.teacher_name}</p>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">Assignments</h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center border border-slate-700/50">
              <p className="text-slate-400">No assignments yet for this class.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  onClick={() => handleAssignmentSelect(assignment)}
                  className={`bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 shadow-xl border transition-all text-left ${
                    assignment.is_completed
                      ? 'border-green-500/50 hover:border-green-400/70'
                      : 'border-slate-700/50 hover:border-purple-500/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      assignment.is_completed
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                        : 'bg-gradient-to-r from-purple-500 to-pink-600'
                    }`}>
                      {assignment.is_completed ? (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                          {assignment.topic}
                        </span>
                        {assignment.is_completed && (
                          <span className="inline-block px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">
                            Completed
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-white mb-1">{assignment.question_text}</h3>
                      {assignment.requirements && (
                        <p className="text-slate-400 text-sm">Requirements: {assignment.requirements}</p>
                      )}
                      {assignment.is_completed && assignment.result?.scores && (
                        <p className="text-green-400 text-sm mt-2">
                          Score: {assignment.result.scores.azure?.total_score?.toFixed(0) || assignment.result.scores.combined?.combined_score?.toFixed(0) || '-'}%
                        </p>
                      )}
                      {assignment.is_completed && assignment.result?.teacher_feedback && (
                        <p className="text-cyan-400 text-sm mt-1 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          Teacher feedback available
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assignment detail view
  if (view === 'assignment' && selectedAssignment) {
    const isCompleted = selectedAssignment.is_completed;
    const result = selectedAssignment.result;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          {/* Header with Logout */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => {
                setView('class-detail');
                setSelectedAssignment(null);
              }}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Class
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 text-sm rounded-lg">
                {selectedAssignment.topic}
              </span>
              {isCompleted && (
                <span className="inline-block px-3 py-1 bg-green-500/20 text-green-300 text-sm rounded-lg">
                  Completed
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-white mb-4">Assignment</h1>

            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-white mb-2">Question</h2>
              <p className="text-slate-200 text-lg">{selectedAssignment.question_text}</p>
            </div>

            {selectedAssignment.requirements && (
              <div className="mb-6">
                <h3 className="text-md font-semibold text-slate-300 mb-2">Requirements</h3>
                <p className="text-slate-400">{selectedAssignment.requirements}</p>
              </div>
            )}

            {selectedAssignment.instructions && (
              <div className="mb-6">
                <h3 className="text-md font-semibold text-slate-300 mb-2">Instructions</h3>
                <p className="text-slate-400">{selectedAssignment.instructions}</p>
              </div>
            )}

            {isCompleted && result ? (
              /* Show results for completed assignment */
              <div className="space-y-6">
                {/* Transcript */}
                {result.transcript && (
                  <div className="bg-slate-700/30 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Your Answer</h3>
                    <p className="text-slate-300 leading-relaxed">{result.transcript}</p>
                  </div>
                )}

                {/* Tabs Navigation */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-2 border border-slate-700/50">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setResultTab('ai')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'ai'
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      AI Scores
                    </button>
                    <button
                      onClick={() => setResultTab('teacher')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'teacher'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      Teacher Scores
                    </button>
                    <button
                      onClick={() => setResultTab('overall')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'overall'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      Overall
                    </button>
                  </div>
                </div>

                {/* AI Scores Tab */}
                {resultTab === 'ai' && (
                  <div className="space-y-6">
                    {/* IELTS Score Component - Same as Practice Mode */}
                    {(result.scores?.azure || result.azure_result?.speech_score?.scores) && (
                      <IELTSScore
                        scores={{
                          pronunciation: result.scores?.azure?.pronunciation || result.azure_result?.speech_score?.scores?.pronunciation,
                          fluency: result.scores?.azure?.fluency || result.azure_result?.speech_score?.scores?.fluency,
                          accuracy: result.scores?.azure?.accuracy || result.azure_result?.speech_score?.scores?.accuracy,
                          grammar: result.openai_result?.scores?.grammar || result.scores?.openai?.grammar,
                          vocab: result.openai_result?.scores?.vocab || result.scores?.openai?.vocab,
                          coherence: result.openai_result?.scores?.coherence || result.scores?.openai?.coherence
                        }}
                        title="AI Speech Score"
                      />
                    )}

                    {/* Audio Player */}
                    {result.audio_url && (
                      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                        <h3 className="text-xl font-bold text-white mb-4">Your Recording</h3>
                        <audio controls className="w-full" src={result.audio_url}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    {/* Transcript with Word Analysis - Same as Practice Mode */}
                    {(result.transcript || result.azure_result?.speech_score?.transcript) && (
                      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                        {result.azure_result?.speech_score?.word_score_list ? (
                          <Transcript
                            transcript={result.transcript || result.azure_result?.speech_score?.transcript}
                            wordList={result.azure_result.speech_score.word_score_list}
                          />
                        ) : (
                          <div>
                            <h3 className="text-xl font-bold text-white mb-4">Transcript</h3>
                            <p className="text-slate-300 leading-relaxed">{result.transcript || result.azure_result?.speech_score?.transcript}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Detailed AI Feedback using FeedbackDetails component */}
                    {(result.openai_result?.grammar || result.openai_result?.vocab || result.openai_result?.coherence || result.azure_result?.speech_score?.fluency) && (
                      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                        <FeedbackDetails
                          grammar={result.openai_result?.grammar}
                          vocab={result.openai_result?.vocab}
                          coherence={result.openai_result?.coherence}
                          fluency={result.azure_result?.speech_score?.fluency}
                          wordList={result.azure_result?.speech_score?.word_score_list}
                        />
                      </div>
                    )}

                    {/* Improved Answer Suggestion - Same as Practice Mode */}
                    {result.openai_result?.improved_answer && (
                      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                        <ImprovedAnswer
                          improvedAnswerData={
                            typeof result.openai_result.improved_answer === 'string'
                              ? { improved_answer: result.openai_result.improved_answer }
                              : result.openai_result.improved_answer
                          }
                          originalTranscript={result.transcript || result.azure_result?.speech_score?.transcript}
                        />
                      </div>
                    )}

                    {/* Waiting for Teacher Notice */}
                    {!result.teacher_feedback && !result.teacher_scores && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                        <p className="text-amber-300 text-sm">
                          Waiting for teacher review...
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Teacher Scores Tab */}
                {resultTab === 'teacher' && (
                  <div className="space-y-6">
                    {result.teacher_feedback || result.teacher_scores ? (
                      <>
                        {/* Audio Player */}
                        {result.audio_url && (
                          <div className="bg-slate-700/30 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-slate-300 mb-2">Your Recording</h3>
                            <audio controls className="w-full" src={result.audio_url}>
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {/* Teacher Scores - Detailed Cards */}
                        {result.teacher_scores && (
                          <div className="space-y-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                              <span className="text-xl">📋</span>
                              Teacher's Detailed Evaluation
                            </h3>

                            <div className="grid md:grid-cols-2 gap-4">
                              {/* Pronunciation Card */}
                              {result.teacher_scores.pronunciation !== undefined && result.teacher_scores.pronunciation !== '' && (
                                <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🎯</span>
                                      <h4 className="font-semibold text-white">Pronunciation</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-purple-400">{result.teacher_scores.pronunciation}</span>
                                  </div>
                                  <p className="text-slate-400 text-sm">How accurately you pronounced words and sounds</p>
                                  {result.teacher_scores.pronunciation_comment && (
                                    <p className="text-purple-300 text-sm mt-2 italic">"{result.teacher_scores.pronunciation_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Fluency Card */}
                              {result.teacher_scores.fluency !== undefined && result.teacher_scores.fluency !== '' && (
                                <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🗣️</span>
                                      <h4 className="font-semibold text-white">Fluency</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-cyan-400">{result.teacher_scores.fluency}</span>
                                  </div>
                                  <p className="text-slate-400 text-sm">How smoothly and naturally you spoke</p>
                                  {result.teacher_scores.fluency_comment && (
                                    <p className="text-cyan-300 text-sm mt-2 italic">"{result.teacher_scores.fluency_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Grammar Card */}
                              {result.teacher_scores.grammar !== undefined && result.teacher_scores.grammar !== '' && (
                                <div className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 border border-pink-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">📝</span>
                                      <h4 className="font-semibold text-white">Grammar</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-pink-400">{result.teacher_scores.grammar}</span>
                                  </div>
                                  <p className="text-slate-400 text-sm">Correctness of sentence structure and grammar rules</p>
                                  {result.teacher_scores.grammar_comment && (
                                    <p className="text-pink-300 text-sm mt-2 italic">"{result.teacher_scores.grammar_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Vocabulary Card */}
                              {result.teacher_scores.vocabulary !== undefined && result.teacher_scores.vocabulary !== '' && (
                                <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">📚</span>
                                      <h4 className="font-semibold text-white">Vocabulary</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-violet-400">{result.teacher_scores.vocabulary}</span>
                                  </div>
                                  <p className="text-slate-400 text-sm">Range and appropriateness of words used</p>
                                  {result.teacher_scores.vocabulary_comment && (
                                    <p className="text-violet-300 text-sm mt-2 italic">"{result.teacher_scores.vocabulary_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Coherence Card */}
                              {result.teacher_scores.coherence !== undefined && result.teacher_scores.coherence !== '' && (
                                <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🔗</span>
                                      <h4 className="font-semibold text-white">Coherence</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-blue-400">{result.teacher_scores.coherence}</span>
                                  </div>
                                  <p className="text-slate-400 text-sm">How well your ideas flow and connect</p>
                                  {result.teacher_scores.coherence_comment && (
                                    <p className="text-blue-300 text-sm mt-2 italic">"{result.teacher_scores.coherence_comment}"</p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Overall Score - Highlighted */}
                            {result.teacher_scores.overall !== undefined && result.teacher_scores.overall !== '' && (
                              <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-6 text-center">
                                <p className="text-slate-400 text-sm mb-2">Teacher's Overall Score</p>
                                <p className="text-5xl font-bold text-emerald-400">{result.teacher_scores.overall}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Teacher Suggestions */}
                        {result.teacher_scores?.suggestions && (
                          <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                              <span className="text-xl">💡</span>
                              Teacher's Suggestions
                            </h3>
                            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{result.teacher_scores.suggestions}</p>
                          </div>
                        )}

                        {/* Teacher Feedback */}
                        {result.teacher_feedback && (
                          <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                              <span className="text-xl">💬</span>
                              Teacher's Feedback
                            </h3>
                            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{result.teacher_feedback}</p>
                          </div>
                        )}

                        {result.feedback_at && (
                          <p className="text-slate-500 text-sm text-center">
                            Reviewed on {new Date(result.feedback_at).toLocaleString()}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-amber-300 mb-2">Waiting for Teacher</h3>
                        <p className="text-slate-400">Your teacher hasn't reviewed this submission yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Overall Tab */}
                {resultTab === 'overall' && (
                  <div className="space-y-6">
                    {/* Audio Player */}
                    {result.audio_url && (
                      <div className="bg-slate-700/30 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-slate-300 mb-2">Your Recording</h3>
                        <audio controls className="w-full" src={result.audio_url}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl p-6">
                      <h3 className="text-lg font-bold text-white mb-4">Overall Summary</h3>

                      <div className="grid md:grid-cols-2 gap-6">
                        {/* AI Overall */}
                        <div className="bg-slate-800/50 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-blue-400 mb-3">AI Evaluation</h4>
                          <div className="text-center">
                            <p className="text-4xl font-bold text-blue-400 mb-2">
                              {result.scores?.azure?.total_score?.toFixed(0) || result.scores?.combined?.combined_score?.toFixed(0) || '-'}%
                            </p>
                            <p className="text-slate-400 text-sm">Overall AI Score</p>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                            <div>
                              <p className="text-slate-500">Pronunciation</p>
                              <p className="text-white font-semibold">{result.scores?.azure?.pronunciation?.toFixed(0) || result.scores?.azure?.pronunciation_score?.toFixed(0) || '-'}%</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Fluency</p>
                              <p className="text-white font-semibold">{result.scores?.azure?.fluency?.toFixed(0) || result.scores?.azure?.fluency_score?.toFixed(0) || '-'}%</p>
                            </div>
                            {result.openai_result?.scores?.grammar !== undefined && (
                              <div>
                                <p className="text-slate-500">Grammar</p>
                                <p className="text-white font-semibold">{result.openai_result.scores.grammar}</p>
                              </div>
                            )}
                            {result.openai_result?.scores?.vocab !== undefined && (
                              <div>
                                <p className="text-slate-500">Vocabulary</p>
                                <p className="text-white font-semibold">{result.openai_result.scores.vocab}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Teacher Overall */}
                        <div className="bg-slate-800/50 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-cyan-400 mb-3">Teacher Evaluation</h4>
                          {result.teacher_scores?.overall !== undefined && result.teacher_scores?.overall !== '' ? (
                            <>
                              <div className="text-center">
                                <p className="text-4xl font-bold text-cyan-400 mb-2">
                                  {result.teacher_scores.overall}
                                </p>
                                <p className="text-slate-400 text-sm">Overall Teacher Score</p>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                                {result.teacher_scores.pronunciation !== undefined && result.teacher_scores.pronunciation !== '' && (
                                  <div>
                                    <p className="text-slate-500">Pronunciation</p>
                                    <p className="text-white font-semibold">{result.teacher_scores.pronunciation}</p>
                                  </div>
                                )}
                                {result.teacher_scores.fluency !== undefined && result.teacher_scores.fluency !== '' && (
                                  <div>
                                    <p className="text-slate-500">Fluency</p>
                                    <p className="text-white font-semibold">{result.teacher_scores.fluency}</p>
                                  </div>
                                )}
                                {result.teacher_scores.grammar !== undefined && result.teacher_scores.grammar !== '' && (
                                  <div>
                                    <p className="text-slate-500">Grammar</p>
                                    <p className="text-white font-semibold">{result.teacher_scores.grammar}</p>
                                  </div>
                                )}
                                {result.teacher_scores.vocabulary !== undefined && result.teacher_scores.vocabulary !== '' && (
                                  <div>
                                    <p className="text-slate-500">Vocabulary</p>
                                    <p className="text-white font-semibold">{result.teacher_scores.vocabulary}</p>
                                  </div>
                                )}
                                {result.teacher_scores.coherence !== undefined && result.teacher_scores.coherence !== '' && (
                                  <div>
                                    <p className="text-slate-500">Coherence</p>
                                    <p className="text-white font-semibold">{result.teacher_scores.coherence}</p>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-slate-500">Not yet reviewed</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Combined/Final Score */}
                      {result.teacher_scores?.overall !== undefined && result.teacher_scores?.overall !== '' && result.scores?.azure?.total_score !== undefined && (
                        <div className="mt-6 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl p-6 text-center">
                          <p className="text-slate-400 text-sm mb-2">Final Combined Score</p>
                          <p className="text-5xl font-bold text-emerald-400">
                            {((result.scores.azure.total_score + parseFloat(result.teacher_scores.overall)) / 2).toFixed(0)}%
                          </p>
                          <p className="text-slate-500 text-xs mt-2">
                            (AI: {result.scores.azure.total_score?.toFixed(0)}% + Teacher: {result.teacher_scores.overall}) / 2
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Summary of feedback */}
                    {(result.teacher_scores?.suggestions || result.openai_result?.improved_answer) && (
                      <div className="grid md:grid-cols-2 gap-4">
                        {result.openai_result?.improved_answer && (
                          <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-blue-400 mb-2">AI Suggestion</h4>
                            <p className="text-slate-300 text-sm leading-relaxed line-clamp-4">
                              {typeof result.openai_result.improved_answer === 'string'
                                ? result.openai_result.improved_answer
                                : result.openai_result.improved_answer?.improved_answer || ''}
                            </p>
                          </div>
                        )}
                        {result.teacher_scores?.suggestions && (
                          <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border border-cyan-500/30 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-cyan-400 mb-2">Teacher Suggestion</h4>
                            <p className="text-slate-300 text-sm leading-relaxed line-clamp-4">{result.teacher_scores.suggestions}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status */}
                    <div className={`rounded-xl p-4 text-center ${
                      result.teacher_feedback || result.teacher_scores
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : 'bg-amber-500/10 border border-amber-500/30'
                    }`}>
                      <p className={`text-sm ${
                        result.teacher_feedback || result.teacher_scores
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}>
                        {result.teacher_feedback || result.teacher_scores
                          ? 'This assignment has been fully reviewed by your teacher.'
                          : 'Waiting for teacher review to see combined score.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Submission Date */}
                {result.submitted_at && (
                  <p className="text-slate-500 text-sm text-center">
                    Submitted on {new Date(result.submitted_at).toLocaleString()}
                  </p>
                )}

                <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-4 text-center">
                  <p className="text-slate-400 text-sm">
                    This assignment has been submitted and cannot be redone.
                  </p>
                </div>
              </div>
            ) : (
              /* Show start button for pending assignment */
              <button
                onClick={handleStartAssignment}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/25"
              >
                Start Speaking
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle assignment submission callback
  const handleAssignmentSubmitted = async (assignmentId) => {
    // Refresh the assignment list to get updated completion status
    if (selectedClass) {
      await fetchClassAssignments(selectedClass.id);
      // Update the selected assignment with the new data
      const updatedAssignment = assignments.find(a => a.id === assignmentId);
      if (updatedAssignment) {
        setSelectedAssignment({ ...updatedAssignment, is_completed: true });
      }
    }
  };

  // Assignment practice view
  if (view === 'assignment-practice' && selectedAssignment) {
    return (
      <AssignmentPractice
        assignment={selectedAssignment}
        onBack={() => {
          // Refresh assignments when going back after submission
          if (selectedClass) {
            fetchClassAssignments(selectedClass.id);
          }
          setView('class-detail');
          setSelectedAssignment(null);
        }}
        onSubmitted={handleAssignmentSubmitted}
      />
    );
  }

  return null;
}

export default StudentDashboard;
