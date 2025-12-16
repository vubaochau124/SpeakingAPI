import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AssignmentPractice from './AssignmentPractice';
import FeedbackDetails from './FeedbackDetails';
import Transcript from './Transcript';
import ImprovedAnswer from './ImprovedAnswer';
import StudentProgress from './progress/StudentProgress';

function StudentDashboard({ onStartPractice, embedded = false }) {
  const { user, token, getAuthHeaders, logout } = useAuth();
  // When embedded, start with 'classes' view instead of 'main'
  const [view, setView] = useState(embedded ? 'classes' : 'main'); // 'main', 'classes', 'class-detail', 'assignment', 'assignment-practice', 'progress'
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
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="container mx-auto max-w-4xl">
          {/* User Header with Logout */}
          <div className="flex justify-between items-center mb-6 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'S'}</span>
              </div>
              <div>
                <span className="text-gray-600">Welcome, <span className="text-gray-900 font-medium">{user?.username}</span></span>
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">Student</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-gray-700 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-blue-600 mb-3">
              Student Dashboard
            </h1>
            <p className="text-gray-500 text-lg">What would you like to do today?</p>
          </div>

          <div className="flex flex-col gap-4">
            {/* See Class Option */}
            <button
              onClick={() => setView('classes')}
              className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200 hover:border-blue-500/50 transition-all duration-300 text-left group"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">See My Classes</h2>
              </div>
              <p className="text-gray-500 text-sm ml-16">View your enrolled classes, assignments, and work on teacher-assigned tasks.</p>
            </button>

            {/* Practice on Own Option */}
            <button
              onClick={() => onStartPractice && onStartPractice({ type: 'practice' })}
              className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200 hover:border-blue-500/50 transition-all duration-300 text-left group"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Practice on My Own</h2>
              </div>
              <p className="text-gray-500 text-sm ml-16">Practice conversations and answer questions from the general question bank.</p>
            </button>

            {/* View Progress Option */}
            <button
              onClick={() => setView('progress')}
              className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200 hover:border-blue-500/50 transition-all duration-300 text-left group"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">View My Progress</h2>
              </div>
              <p className="text-gray-500 text-sm ml-16">Track your scores over time, see improvement trends, and analyze your performance.</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Progress view
  if (view === 'progress') {
    return <StudentProgress onBack={() => setView('main')} />;
  }

  // Classes list view
  if (view === 'classes') {
    return (
      <div className={embedded ? "p-4" : "min-h-screen bg-gray-50 p-4"}>
        <div className="container mx-auto max-w-4xl">
          {/* Header - only show back/logout when not embedded */}
          {!embedded && (
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Menu
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-gray-700 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}

          <h1 className="text-3xl font-bold text-gray-900 mb-6">My Classes</h1>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-600 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Loading classes...</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-white shadow-sm rounded-2xl p-8 text-center border border-gray-200">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Classes Yet</h3>
              <p className="text-gray-500">You haven't been enrolled in any classes yet.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {classes.map((classItem) => (
                <button
                  key={classItem.id}
                  onClick={() => handleClassSelect(classItem)}
                  className="bg-white shadow-sm rounded-xl p-6 shadow-xl border border-gray-200 hover:border-blue-500/50 transition-all text-left"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{classItem.name}</h3>
                      <p className="text-gray-500 text-sm mb-2">{classItem.description || 'No description'}</p>
                      <p className="text-blue-600 text-sm">Teacher: {classItem.teacher_name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400 text-sm">{classItem.student_count} students</span>
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
      <div className={embedded ? "p-4" : "min-h-screen bg-gray-50 p-4"}>
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => {
                setView('classes');
                setSelectedClass(null);
                setAssignments([]);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Classes
            </button>
            {!embedded && (
              <button
                onClick={logout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-gray-700 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            )}
          </div>

          <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-gray-200">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{selectedClass.name}</h1>
            <p className="text-gray-500 mb-2">{selectedClass.description || 'No description'}</p>
            <p className="text-blue-600">Teacher: {selectedClass.teacher_name}</p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-4">Assignments</h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-600 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white shadow-sm rounded-2xl p-8 text-center border border-gray-200">
              <p className="text-gray-500">No assignments yet for this class.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  onClick={() => handleAssignmentSelect(assignment)}
                  className={`bg-white shadow-sm rounded-xl p-6 shadow-xl border transition-all text-left ${
                    assignment.is_completed
                      ? 'border-green-500/50 hover:border-green-400/70'
                      : 'border-gray-200 hover:border-blue-500/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      assignment.is_completed
                        ? 'bg-blue-600'
                        : 'bg-blue-600'
                    }`}>
                      {assignment.is_completed ? (
                        <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                          {assignment.topic}
                        </span>
                        {assignment.is_completed && (
                          <span className="inline-block px-2 py-1 bg-green-500/20 text-green-600 text-xs rounded">
                            Completed
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{assignment.question_text}</h3>
                      {assignment.requirements && (
                        <p className="text-gray-500 text-sm">Requirements: {assignment.requirements}</p>
                      )}
                      {assignment.is_completed && assignment.result?.scores && (
                        <p className="text-green-600 text-sm mt-2">
                          Score: {assignment.result.scores.azure?.total_score?.toFixed(0) || assignment.result.scores.combined?.combined_score?.toFixed(0) || '-'}%
                        </p>
                      )}
                      {assignment.is_completed && assignment.result?.teacher_feedback && (
                        <p className="text-blue-600 text-sm mt-1 flex items-center gap-1">
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
      <div className={embedded ? "p-4" : "min-h-screen bg-gray-50 p-4"}>
        <div className="container mx-auto max-w-4xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => {
                setView('class-detail');
                setSelectedAssignment(null);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Class
            </button>
            {!embedded && (
              <button
                onClick={logout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-gray-700 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            )}
          </div>

          <div className="bg-white shadow-sm rounded-2xl p-8 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-600 text-sm rounded-lg">
                {selectedAssignment.topic}
              </span>
              {isCompleted && (
                <span className="inline-block px-3 py-1 bg-green-500/20 text-green-600 text-sm rounded-lg">
                  Completed
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">Assignment</h1>

            <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Question</h2>
              <p className="text-gray-700 text-lg">{selectedAssignment.question_text}</p>
            </div>

            {selectedAssignment.requirements && (
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-600 mb-2">Requirements</h3>
                <p className="text-gray-500">{selectedAssignment.requirements}</p>
              </div>
            )}

            {selectedAssignment.instructions && (
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-600 mb-2">Instructions</h3>
                <p className="text-gray-500">{selectedAssignment.instructions}</p>
              </div>
            )}

            {isCompleted && result ? (
              /* Show results for completed assignment */
              <div className="space-y-6">
                {/* Transcript */}
                {result.transcript && (
                  <div className="bg-gray-100 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Answer</h3>
                    <p className="text-gray-600 leading-relaxed">{result.transcript}</p>
                  </div>
                )}

                {/* Tabs Navigation */}
                <div className="bg-white shadow-sm rounded-2xl p-2 border border-gray-200">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setResultTab('ai')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'ai'
                          ? 'bg-blue-600 text-gray-900 shadow-lg'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      AI Scores
                    </button>
                    <button
                      onClick={() => setResultTab('teacher')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'teacher'
                          ? 'bg-blue-600 text-gray-900 shadow-lg'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Teacher Scores
                    </button>
                    <button
                      onClick={() => setResultTab('overall')}
                      className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                        resultTab === 'overall'
                          ? 'bg-blue-600 text-gray-900 shadow-lg'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Overall
                    </button>
                  </div>
                </div>

                {/* AI Scores Tab */}
                {resultTab === 'ai' && (
                  <div className="space-y-6">
                    {/* Audio Player */}
                    {result.audio_url && (
                      <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Your Recording</h3>
                        <audio controls className="w-full" src={result.audio_url}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    {/* Transcript with Word Analysis - Same as Practice Mode */}
                    {(result.transcript || result.azure_result?.speech_score?.transcript) && (
                      <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                        {result.azure_result?.speech_score?.word_score_list ? (
                          <Transcript
                            transcript={result.transcript || result.azure_result?.speech_score?.transcript}
                            wordList={result.azure_result.speech_score.word_score_list}
                            language={result.azure_result?.speech_score?.detected_dialect?.lang_id}
                          />
                        ) : (
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Transcript</h3>
                            <p className="text-gray-600 leading-relaxed">{result.transcript || result.azure_result?.speech_score?.transcript}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Score & Detailed AI Feedback */}
                    {(result.scores?.openai_result || result.scores?.combined_result) && (
                      <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                        <FeedbackDetails
                          openaiResult={result.scores?.openai_result}
                          combinedResult={result.scores?.combined_result}
                          fluencyMetrics={result.scores?.unscripted_result?.speech_score?.fluency?.overall_metrics || result.azure_result?.speech_score?.fluency?.overall_metrics}
                          title="AI Speech Score"
                        />
                      </div>
                    )}

                    {/* Improved Answer Suggestion */}
                    {(result.scores?.openai_result?.improved_answer || result.openai_result?.improved_answer) && (
                      <div className="bg-white shadow-sm rounded-2xl p-6 shadow-xl border border-gray-200">
                        <ImprovedAnswer
                          improvedAnswerData={result.scores?.openai_result?.improved_answer || result.openai_result?.improved_answer}
                          originalTranscript={result.transcript}
                        />
                      </div>
                    )}

                    {/* Waiting for Teacher Notice */}
                    {!result.teacher_feedback && !result.teacher_scores && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                        <p className="text-amber-600 text-sm">
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
                          <div className="bg-gray-100 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-gray-600 mb-2">Your Recording</h3>
                            <audio controls className="w-full" src={result.audio_url}>
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {/* Teacher Scores - Detailed Cards */}
                        {result.teacher_scores && (
                          <div className="space-y-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                              <span className="text-xl">📋</span>
                              Teacher's Detailed Evaluation
                            </h3>

                            <div className="grid md:grid-cols-2 gap-4">
                              {/* Pronunciation Card */}
                              {result.teacher_scores.pronunciation !== undefined && result.teacher_scores.pronunciation !== '' && (
                                <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🎯</span>
                                      <h4 className="font-semibold text-gray-900">Pronunciation</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-blue-600">{result.teacher_scores.pronunciation}</span>
                                  </div>
                                  <p className="text-gray-500 text-sm">How accurately you pronounced words and sounds</p>
                                  {result.teacher_scores.pronunciation_comment && (
                                    <p className="text-blue-600 text-sm mt-2 italic">"{result.teacher_scores.pronunciation_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Fluency Card */}
                              {result.teacher_scores.fluency !== undefined && result.teacher_scores.fluency !== '' && (
                                <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🗣️</span>
                                      <h4 className="font-semibold text-gray-900">Fluency</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-blue-600">{result.teacher_scores.fluency}</span>
                                  </div>
                                  <p className="text-gray-500 text-sm">How smoothly and naturally you spoke</p>
                                  {result.teacher_scores.fluency_comment && (
                                    <p className="text-blue-600 text-sm mt-2 italic">"{result.teacher_scores.fluency_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Grammar Card */}
                              {result.teacher_scores.grammar !== undefined && result.teacher_scores.grammar !== '' && (
                                <div className="bg-blue-50 border border-pink-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">📝</span>
                                      <h4 className="font-semibold text-gray-900">Grammar</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-pink-600">{result.teacher_scores.grammar}</span>
                                  </div>
                                  <p className="text-gray-500 text-sm">Correctness of sentence structure and grammar rules</p>
                                  {result.teacher_scores.grammar_comment && (
                                    <p className="text-pink-600 text-sm mt-2 italic">"{result.teacher_scores.grammar_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Vocabulary Card */}
                              {result.teacher_scores.vocabulary !== undefined && result.teacher_scores.vocabulary !== '' && (
                                <div className="bg-blue-50 border border-violet-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">📚</span>
                                      <h4 className="font-semibold text-gray-900">Vocabulary</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-violet-600">{result.teacher_scores.vocabulary}</span>
                                  </div>
                                  <p className="text-gray-500 text-sm">Range and appropriateness of words used</p>
                                  {result.teacher_scores.vocabulary_comment && (
                                    <p className="text-violet-600 text-sm mt-2 italic">"{result.teacher_scores.vocabulary_comment}"</p>
                                  )}
                                </div>
                              )}

                              {/* Coherence Card */}
                              {result.teacher_scores.coherence !== undefined && result.teacher_scores.coherence !== '' && (
                                <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-5">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl">🔗</span>
                                      <h4 className="font-semibold text-gray-900">Coherence</h4>
                                    </div>
                                    <span className="text-3xl font-bold text-blue-600">{result.teacher_scores.coherence}</span>
                                  </div>
                                  <p className="text-gray-500 text-sm">How well your ideas flow and connect</p>
                                  {result.teacher_scores.coherence_comment && (
                                    <p className="text-blue-600 text-sm mt-2 italic">"{result.teacher_scores.coherence_comment}"</p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Overall Score - Highlighted */}
                            {result.teacher_scores.overall !== undefined && result.teacher_scores.overall !== '' && (
                              <div className="bg-blue-50 border border-emerald-500/30 rounded-xl p-6 text-center">
                                <p className="text-gray-500 text-sm mb-2">Teacher's Overall Score</p>
                                <p className="text-5xl font-bold text-emerald-600">{result.teacher_scores.overall}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Teacher Suggestions */}
                        {result.teacher_scores?.suggestions && (
                          <div className="bg-gray-100 border border-amber-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <span className="text-xl">💡</span>
                              Teacher's Suggestions
                            </h3>
                            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{result.teacher_scores.suggestions}</p>
                          </div>
                        )}

                        {/* Teacher Feedback */}
                        {result.teacher_feedback && (
                          <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <span className="text-xl">💬</span>
                              Teacher's Feedback
                            </h3>
                            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{result.teacher_feedback}</p>
                          </div>
                        )}

                        {result.feedback_at && (
                          <p className="text-gray-400 text-sm text-center">
                            Reviewed on {new Date(result.feedback_at).toLocaleString()}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-amber-600 mb-2">Waiting for Teacher</h3>
                        <p className="text-gray-500">Your teacher hasn't reviewed this submission yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Overall Tab */}
                {resultTab === 'overall' && (
                  <div className="space-y-6">
                    {/* Audio Player */}
                    {result.audio_url && (
                      <div className="bg-gray-100 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-gray-600 mb-2">Your Recording</h3>
                        <audio controls className="w-full" src={result.audio_url}>
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-emerald-500/30 rounded-xl p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Overall Summary</h3>

                      <div className="grid md:grid-cols-2 gap-6">
                        {/* AI Overall */}
                        <div className="bg-white rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-blue-600 mb-3">AI Evaluation</h4>
                          <div className="text-center">
                            <p className="text-4xl font-bold text-blue-600 mb-2">
                              {result.scores?.azure?.total_score?.toFixed(0) || result.scores?.combined?.combined_score?.toFixed(0) || '-'}%
                            </p>
                            <p className="text-gray-500 text-sm">Overall AI Score</p>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                            <div>
                              <p className="text-gray-400">Pronunciation</p>
                              <p className="text-gray-900 font-semibold">{result.scores?.azure?.pronunciation?.toFixed(0) || result.scores?.azure?.pronunciation_score?.toFixed(0) || '-'}%</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Fluency</p>
                              <p className="text-gray-900 font-semibold">{result.scores?.azure?.fluency?.toFixed(0) || result.scores?.azure?.fluency_score?.toFixed(0) || '-'}%</p>
                            </div>
                            {result.openai_result?.scores?.grammar !== undefined && (
                              <div>
                                <p className="text-gray-400">Grammar</p>
                                <p className="text-gray-900 font-semibold">{result.openai_result.scores.grammar}</p>
                              </div>
                            )}
                            {result.openai_result?.scores?.vocab !== undefined && (
                              <div>
                                <p className="text-gray-400">Vocabulary</p>
                                <p className="text-gray-900 font-semibold">{result.openai_result.scores.vocab}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Teacher Overall */}
                        <div className="bg-white rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-blue-600 mb-3">Teacher Evaluation</h4>
                          {result.teacher_scores?.overall !== undefined && result.teacher_scores?.overall !== '' ? (
                            <>
                              <div className="text-center">
                                <p className="text-4xl font-bold text-blue-600 mb-2">
                                  {result.teacher_scores.overall}
                                </p>
                                <p className="text-gray-500 text-sm">Overall Teacher Score</p>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                                {result.teacher_scores.pronunciation !== undefined && result.teacher_scores.pronunciation !== '' && (
                                  <div>
                                    <p className="text-gray-400">Pronunciation</p>
                                    <p className="text-gray-900 font-semibold">{result.teacher_scores.pronunciation}</p>
                                  </div>
                                )}
                                {result.teacher_scores.fluency !== undefined && result.teacher_scores.fluency !== '' && (
                                  <div>
                                    <p className="text-gray-400">Fluency</p>
                                    <p className="text-gray-900 font-semibold">{result.teacher_scores.fluency}</p>
                                  </div>
                                )}
                                {result.teacher_scores.grammar !== undefined && result.teacher_scores.grammar !== '' && (
                                  <div>
                                    <p className="text-gray-400">Grammar</p>
                                    <p className="text-gray-900 font-semibold">{result.teacher_scores.grammar}</p>
                                  </div>
                                )}
                                {result.teacher_scores.vocabulary !== undefined && result.teacher_scores.vocabulary !== '' && (
                                  <div>
                                    <p className="text-gray-400">Vocabulary</p>
                                    <p className="text-gray-900 font-semibold">{result.teacher_scores.vocabulary}</p>
                                  </div>
                                )}
                                {result.teacher_scores.coherence !== undefined && result.teacher_scores.coherence !== '' && (
                                  <div>
                                    <p className="text-gray-400">Coherence</p>
                                    <p className="text-gray-900 font-semibold">{result.teacher_scores.coherence}</p>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-gray-400">Not yet reviewed</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Combined/Final Score */}
                      {result.teacher_scores?.overall !== undefined && result.teacher_scores?.overall !== '' && result.scores?.azure?.total_score !== undefined && (
                        <div className="mt-6 bg-blue-50 rounded-xl p-6 text-center">
                          <p className="text-gray-500 text-sm mb-2">Final Combined Score</p>
                          <p className="text-5xl font-bold text-emerald-600">
                            {((result.scores.azure.total_score + parseFloat(result.teacher_scores.overall)) / 2).toFixed(0)}%
                          </p>
                          <p className="text-gray-400 text-xs mt-2">
                            (AI: {result.scores.azure.total_score?.toFixed(0)}% + Teacher: {result.teacher_scores.overall}) / 2
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Summary of feedback */}
                    {(result.teacher_scores?.suggestions || result.openai_result?.improved_answer) && (
                      <div className="grid md:grid-cols-2 gap-4">
                        {result.openai_result?.improved_answer && (
                          <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-blue-600 mb-2">AI Suggestion</h4>
                            <p className="text-gray-600 text-sm leading-relaxed line-clamp-4">
                              {typeof result.openai_result.improved_answer === 'string'
                                ? result.openai_result.improved_answer
                                : result.openai_result.improved_answer?.improved_answer || ''}
                            </p>
                          </div>
                        )}
                        {result.teacher_scores?.suggestions && (
                          <div className="bg-blue-50 border border-blue-500/30 rounded-xl p-4">
                            <h4 className="text-sm font-semibold text-blue-600 mb-2">Teacher Suggestion</h4>
                            <p className="text-gray-600 text-sm leading-relaxed line-clamp-4">{result.teacher_scores.suggestions}</p>
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
                          ? 'text-emerald-600'
                          : 'text-amber-600'
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
                  <p className="text-gray-400 text-sm text-center">
                    Submitted on {new Date(result.submitted_at).toLocaleString()}
                  </p>
                )}

                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 text-center">
                  <p className="text-gray-500 text-sm">
                    This assignment has been submitted and cannot be redone.
                  </p>
                </div>
              </div>
            ) : (
              /* Show start button for pending assignment */
              <button
                onClick={handleStartAssignment}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25"
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
