import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

function TeacherDashboard() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classAssignments, setClassAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Class form state
  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', description: '' });

  // Assignment form state
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    class_id: '',
    topic: '',
    question_text: '',
    requirements: '',
    instructions: ''
  });

  // Add student to class
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addStudentClassId, setAddStudentClassId] = useState(null);

  // Class detail view mode: 'students' or 'assignments'
  const [classViewMode, setClassViewMode] = useState('assignments');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, conversationsRes, questionsRes, classesRes, assignmentsRes] = await Promise.all([
        axios.get('/api/teacher/students', { headers: getAuthHeaders() }),
        axios.get('/api/conversations'),
        axios.get('/api/questions'),
        axios.get('/api/classes', { headers: getAuthHeaders() }),
        axios.get('/api/assignments', { headers: getAuthHeaders() })
      ]);
      setStudents(studentsRes.data.students || []);
      setAllStudents(studentsRes.data.students || []);
      setConversations(conversationsRes.data.conversations || []);
      setQuestions(questionsRes.data.questions || []);
      setClasses(classesRes.data.classes || []);
      setAssignments(assignmentsRes.data.assignments || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const viewStudentDetails = async (studentId) => {
    try {
      const res = await axios.get(`/api/teacher/students/${studentId}/results`, {
        headers: getAuthHeaders()
      });
      setStudentDetails(res.data);
      setSelectedStudent(studentId);
    } catch (err) {
      console.error('Failed to load student details:', err);
    }
  };

  const fetchClassDetails = async (classId) => {
    try {
      const [classRes, assignmentsRes] = await Promise.all([
        axios.get(`/api/classes/${classId}`, { headers: getAuthHeaders() }),
        axios.get(`/api/classes/${classId}/assignments`, { headers: getAuthHeaders() })
      ]);
      setSelectedClass(classRes.data);
      setClassAssignments(assignmentsRes.data.assignments || []);
    } catch (err) {
      setError('Failed to load class details');
    }
  };

  const fetchAssignmentSubmissions = async (assignmentId) => {
    try {
      const res = await axios.get(`/api/assignments/${assignmentId}/submissions`, { headers: getAuthHeaders() });
      setAssignmentSubmissions(res.data);
    } catch (err) {
      setError('Failed to load assignment submissions');
    }
  };

  const handleSubmitFeedback = async (assignmentId, submissionId) => {
    if (!feedbackText.trim()) {
      setError('Please enter feedback text');
      return;
    }
    try {
      await axios.post(`/api/assignments/${assignmentId}/submissions/${submissionId}/feedback`, {
        feedback: feedbackText
      }, { headers: getAuthHeaders() });
      setSuccess('Feedback submitted successfully');
      setFeedbackText('');
      setSelectedSubmission(null);
      fetchAssignmentSubmissions(assignmentId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit feedback');
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/classes', {
        ...classForm,
        teacher_id: user.id
      }, { headers: getAuthHeaders() });
      setSuccess('Class created successfully');
      setShowClassForm(false);
      setClassForm({ name: '', description: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create class');
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/assignments', assignmentForm, { headers: getAuthHeaders() });
      setSuccess('Assignment created successfully');
      setShowAssignmentForm(false);
      setAssignmentForm({ class_id: '', topic: '', question_text: '', requirements: '', instructions: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await axios.delete(`/api/assignments/${assignmentId}`, { headers: getAuthHeaders() });
      setSuccess('Assignment deleted');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete assignment');
    }
  };

  const handleAddStudent = async (studentId) => {
    try {
      await axios.post(`/api/classes/${addStudentClassId}/students`, {
        student_id: studentId
      }, { headers: getAuthHeaders() });
      setSuccess('Student added to class');
      setShowAddStudentModal(false);
      fetchClassDetails(addStudentClassId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add student');
    }
  };

  const handleRemoveStudent = async (classId, studentId) => {
    if (!confirm('Remove this student from the class?')) return;
    try {
      await axios.delete(`/api/classes/${classId}/students/${studentId}`, { headers: getAuthHeaders() });
      setSuccess('Student removed from class');
      fetchClassDetails(classId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove student');
    }
  };

  const getScoreColor = (score) => {
    if (!score) return 'text-slate-400';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* User Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'T'}</span>
            </div>
            <div>
              <span className="text-slate-300">Welcome, <span className="text-white font-medium">{user?.username}</span></span>
              <span className="ml-2 px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">Teacher</span>
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

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-rose-400 bg-clip-text text-transparent mb-3">
            Teacher Dashboard
          </h1>
          <p className="text-slate-400 text-lg">Manage classes, assignments, and view student results</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl">
            {error}
            <button onClick={() => setError('')} className="float-right">&times;</button>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-xl">
            {success}
            <button onClick={() => setSuccess('')} className="float-right">&times;</button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex mb-8 bg-slate-800/50 backdrop-blur-sm rounded-2xl p-2 shadow-xl overflow-x-auto">
          <button
            onClick={() => { setActiveTab('students'); setSelectedStudent(null); }}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
              activeTab === 'students'
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Students
          </button>
          <button
            onClick={() => { setActiveTab('classes'); setSelectedClass(null); }}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
              activeTab === 'classes'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Classes
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
              activeTab === 'assignments'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Assignments
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`flex-1 py-4 px-4 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
              activeTab === 'content'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Content
          </button>
        </div>

        {loading ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 text-center shadow-xl border border-slate-700/50">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
            <p className="mt-4 text-slate-300">Loading...</p>
          </div>
        ) : (
          <>
            {/* Students Tab */}
            {activeTab === 'students' && !selectedStudent && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                <h2 className="text-2xl font-bold text-white mb-6">Student Results ({students.length})</h2>
                {students.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No students registered yet</p>
                ) : (
                  <div className="space-y-4">
                    {students.map(student => (
                      <div
                        key={student.id}
                        className="bg-slate-700/30 rounded-xl p-4 border border-slate-600 hover:border-purple-500/50 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-white">{student.username}</h3>
                            <p className="text-slate-400 text-sm">{student.email}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-xs text-slate-400">Part 1</p>
                              {student.results.conversation ? (
                                <p className={`font-bold ${getScoreColor(student.results.conversation.scores?.azure_accuracy)}`}>
                                  {student.results.conversation.scores?.azure_accuracy?.toFixed(0) || '-'}%
                                </p>
                              ) : (
                                <p className="text-slate-500">-</p>
                              )}
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-slate-400">Part 2</p>
                              {student.results.unscripted ? (
                                <p className={`font-bold ${getScoreColor(student.results.unscripted.scores?.azure?.total_score)}`}>
                                  {student.results.unscripted.scores?.azure?.total_score?.toFixed(0) || '-'}%
                                </p>
                              ) : (
                                <p className="text-slate-500">-</p>
                              )}
                            </div>
                            <button
                              onClick={() => viewStudentDetails(student.id)}
                              className="px-4 py-2 bg-purple-500/20 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Student Details View */}
            {activeTab === 'students' && selectedStudent && studentDetails && (
              <div className="space-y-6">
                <button
                  onClick={() => { setSelectedStudent(null); setStudentDetails(null); }}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Students
                </button>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
                  <h2 className="text-2xl font-bold text-white mb-2">{studentDetails.student.username}</h2>
                  <p className="text-slate-400 mb-6">{studentDetails.student.email}</p>

                  {studentDetails.results.length === 0 ? (
                    <p className="text-slate-400">No results yet</p>
                  ) : (
                    <div className="space-y-6">
                      {studentDetails.results.map((result, idx) => (
                        <div key={idx} className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
                          <h3 className="text-lg font-semibold text-white mb-3">
                            {result.part_type === 'conversation' ? 'Part 1: Conversation' : 'Part 2: Answer Question'}
                          </h3>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-slate-400 mb-1">Transcript</p>
                              <p className="text-slate-300 text-sm bg-slate-800/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                                {result.transcript || 'No transcript'}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400 mb-1">Scores</p>
                              <div className="bg-slate-800/50 rounded-lg p-3">
                                {result.scores && (
                                  <pre className="text-xs text-slate-300 overflow-x-auto">
                                    {JSON.stringify(result.scores, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-3">
                            Last updated: {result.updated_at ? new Date(result.updated_at).toLocaleString() : 'Unknown'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Classes Tab */}
            {activeTab === 'classes' && !selectedClass && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">My Classes ({classes.length})</h2>
                  <button
                    onClick={() => setShowClassForm(true)}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:opacity-90"
                  >
                    + New Class
                  </button>
                </div>

                {showClassForm && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h3 className="text-lg font-bold text-white mb-4">Create New Class</h3>
                    <form onSubmit={handleCreateClass} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Class Name</label>
                        <input
                          type="text"
                          value={classForm.name}
                          onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                        <textarea
                          value={classForm.description}
                          onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          rows="2"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg">
                          Create
                        </button>
                        <button type="button" onClick={() => setShowClassForm(false)} className="px-4 py-2 bg-slate-600 text-white rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {classes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => fetchClassDetails(c.id)}
                      className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/50 cursor-pointer transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white">{c.name}</h3>
                          <p className="text-slate-400 text-sm">{c.description || 'No description'}</p>
                        </div>
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 text-sm rounded-lg">
                          {c.student_count} students
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Class Detail View */}
            {activeTab === 'classes' && selectedClass && !selectedAssignment && (
              <div className="space-y-6">
                <button
                  onClick={() => { setSelectedClass(null); setClassAssignments([]); setClassViewMode('assignments'); }}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Classes
                </button>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedClass.name}</h2>
                      <p className="text-slate-400">{selectedClass.description || 'No description'}</p>
                    </div>
                  </div>

                  {/* Sub-tabs: Assignments / Students */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setClassViewMode('assignments')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        classViewMode === 'assignments'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                          : 'bg-slate-700/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      Assignments ({classAssignments.length})
                    </button>
                    <button
                      onClick={() => setClassViewMode('students')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        classViewMode === 'students'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                          : 'bg-slate-700/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      Students ({selectedClass.students?.length || 0})
                    </button>
                  </div>

                  {/* Assignments View */}
                  {classViewMode === 'assignments' && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-white">Class Assignments</h3>
                        <button
                          onClick={() => {
                            setAssignmentForm({ ...assignmentForm, class_id: selectedClass.id });
                            setShowAssignmentForm(true);
                          }}
                          className="px-4 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/30"
                        >
                          + Add Assignment
                        </button>
                      </div>

                      {/* Assignment Form */}
                      {showAssignmentForm && (
                        <div className="bg-slate-700/30 rounded-xl p-4 mb-4 border border-slate-600">
                          <h4 className="text-md font-bold text-white mb-3">New Assignment</h4>
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                              await axios.post('/api/assignments', assignmentForm, { headers: getAuthHeaders() });
                              setSuccess('Assignment created');
                              setShowAssignmentForm(false);
                              setAssignmentForm({ class_id: '', topic: '', question_text: '', requirements: '', instructions: '' });
                              fetchClassDetails(selectedClass.id);
                              fetchData();
                            } catch (err) {
                              setError(err.response?.data?.detail || 'Failed to create assignment');
                            }
                          }} className="space-y-3">
                            <input
                              type="text"
                              placeholder="Topic"
                              value={assignmentForm.topic}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, topic: e.target.value })}
                              required
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm"
                            />
                            <textarea
                              placeholder="Question"
                              value={assignmentForm.question_text}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, question_text: e.target.value })}
                              required
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm"
                              rows="2"
                            />
                            <input
                              type="text"
                              placeholder="Requirements (optional)"
                              value={assignmentForm.requirements}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, requirements: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm"
                            />
                            <div className="flex gap-2">
                              <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm">Create</button>
                              <button type="button" onClick={() => setShowAssignmentForm(false)} className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm">Cancel</button>
                            </div>
                          </form>
                        </div>
                      )}

                      {classAssignments.length === 0 ? (
                        <p className="text-slate-400 text-center py-8">No assignments yet. Create one to get started.</p>
                      ) : (
                        <div className="space-y-3">
                          {classAssignments.map((a) => (
                            <div
                              key={a.id}
                              onClick={() => {
                                setSelectedAssignment(a);
                                fetchAssignmentSubmissions(a.id);
                              }}
                              className="bg-slate-700/30 rounded-xl p-4 border border-slate-600 hover:border-emerald-500/50 cursor-pointer transition-all"
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded">{a.topic}</span>
                                  </div>
                                  <p className="text-white font-medium">{a.question_text}</p>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-xs text-slate-400">Submissions</p>
                                  <p className="text-lg font-bold text-white">
                                    {classAssignments.find(ca => ca.id === a.id)?.submissions_count || 0}/{selectedClass.students?.length || 0}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Students View */}
                  {classViewMode === 'students' && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-white">Enrolled Students</h3>
                        <button
                          onClick={() => {
                            setAddStudentClassId(selectedClass.id);
                            setShowAddStudentModal(true);
                          }}
                          className="px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30"
                        >
                          + Add Student
                        </button>
                      </div>

                      {selectedClass.students?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedClass.students.map((s) => (
                            <div key={s.id} className="flex justify-between items-center bg-slate-700/30 rounded-lg p-3">
                              <div>
                                <span className="text-white">{s.username}</span>
                                <span className="text-slate-400 text-sm ml-2">({s.email})</span>
                              </div>
                              <button
                                onClick={() => handleRemoveStudent(selectedClass.id, s.student_id)}
                                className="px-3 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400">No students in this class</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Add Student Modal */}
                {showAddStudentModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
                      <h3 className="text-lg font-bold text-white mb-4">Add Student to Class</h3>
                      <div className="space-y-2">
                        {allStudents.filter(s =>
                          !selectedClass.students?.some(cs => cs.student_id === s.id)
                        ).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleAddStudent(s.id)}
                            className="w-full text-left bg-slate-700/50 rounded-lg p-3 hover:bg-slate-700 transition-colors"
                          >
                            <span className="text-white">{s.username}</span>
                            <span className="text-slate-400 text-sm ml-2">({s.email})</span>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowAddStudentModal(false)}
                        className="mt-4 w-full px-4 py-2 bg-slate-600 text-white rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assignment Detail View with Submissions */}
            {activeTab === 'classes' && selectedClass && selectedAssignment && (
              <div className="space-y-6">
                <button
                  onClick={() => { setSelectedAssignment(null); setAssignmentSubmissions(null); setSelectedSubmission(null); }}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to {selectedClass.name}
                </button>

                {/* Assignment Info */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded">{selectedAssignment.topic}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Assignment Details</h2>
                  <div className="bg-slate-700/30 rounded-lg p-4 mb-4">
                    <p className="text-white font-medium">{selectedAssignment.question_text}</p>
                    {selectedAssignment.requirements && (
                      <p className="text-slate-400 text-sm mt-2">Requirements: {selectedAssignment.requirements}</p>
                    )}
                  </div>

                  {/* Submission Stats */}
                  {assignmentSubmissions && (
                    <div className="flex gap-4 mb-6">
                      <div className="bg-slate-700/30 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-white">{assignmentSubmissions.submitted_count}</p>
                        <p className="text-sm text-slate-400">Submitted</p>
                      </div>
                      <div className="bg-slate-700/30 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-white">{assignmentSubmissions.total_students - assignmentSubmissions.submitted_count}</p>
                        <p className="text-sm text-slate-400">Pending</p>
                      </div>
                      <div className="bg-slate-700/30 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-white">{assignmentSubmissions.total_students}</p>
                        <p className="text-sm text-slate-400">Total Students</p>
                      </div>
                    </div>
                  )}

                  {/* Student Submissions List */}
                  <h3 className="text-lg font-semibold text-white mb-3">Student Submissions</h3>
                  {assignmentSubmissions?.submissions?.length > 0 ? (
                    <div className="space-y-3">
                      {assignmentSubmissions.submissions.map((sub) => (
                        <div
                          key={sub.student_id}
                          className={`rounded-xl p-4 border transition-all ${
                            sub.status === 'submitted'
                              ? 'bg-slate-700/30 border-slate-600 hover:border-emerald-500/50 cursor-pointer'
                              : 'bg-slate-800/30 border-slate-700/50'
                          }`}
                          onClick={() => sub.status === 'submitted' && setSelectedSubmission(sub)}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                sub.status === 'submitted' ? 'bg-emerald-500/20' : 'bg-slate-700'
                              }`}>
                                <span className="font-bold text-white">{sub.student_name[0]?.toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="text-white font-medium">{sub.student_name}</p>
                                <p className="text-slate-400 text-sm">{sub.student_email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              {sub.status === 'submitted' ? (
                                <>
                                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded">Submitted</span>
                                  {sub.scores?.azure?.total_score && (
                                    <p className={`text-lg font-bold mt-1 ${getScoreColor(sub.scores.azure.total_score)}`}>
                                      {sub.scores.azure.total_score.toFixed(0)}%
                                    </p>
                                  )}
                                  {sub.teacher_feedback && (
                                    <span className="text-xs text-cyan-400 block mt-1">Feedback given</span>
                                  )}
                                </>
                              ) : (
                                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded">Pending</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-4">No students enrolled in this class</p>
                  )}
                </div>

                {/* Submission Detail Modal */}
                {selectedSubmission && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white">{selectedSubmission.student_name}'s Submission</h3>
                          <p className="text-slate-400 text-sm">{selectedSubmission.student_email}</p>
                        </div>
                        <button
                          onClick={() => { setSelectedSubmission(null); setFeedbackText(''); }}
                          className="text-slate-400 hover:text-white"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Scores */}
                      {selectedSubmission.scores && (
                        <div className="bg-slate-700/30 rounded-lg p-4 mb-4">
                          <h4 className="text-sm font-semibold text-slate-300 mb-3">Scores</h4>
                          <div className="grid grid-cols-3 gap-3">
                            {selectedSubmission.scores.azure && (
                              <div className="text-center">
                                <p className="text-xs text-slate-400">Azure</p>
                                <p className={`text-xl font-bold ${getScoreColor(selectedSubmission.scores.azure.total_score)}`}>
                                  {selectedSubmission.scores.azure.total_score?.toFixed(0) || '-'}%
                                </p>
                              </div>
                            )}
                            {selectedSubmission.scores.openai && (
                              <div className="text-center">
                                <p className="text-xs text-slate-400">AI</p>
                                <p className={`text-xl font-bold ${getScoreColor(selectedSubmission.scores.openai.total_score)}`}>
                                  {selectedSubmission.scores.openai.total_score?.toFixed(0) || '-'}%
                                </p>
                              </div>
                            )}
                            {selectedSubmission.scores.combined && (
                              <div className="text-center">
                                <p className="text-xs text-slate-400">Combined</p>
                                <p className={`text-xl font-bold ${getScoreColor(selectedSubmission.scores.combined.combined_score)}`}>
                                  {selectedSubmission.scores.combined.combined_score?.toFixed(0) || '-'}%
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Transcript */}
                      <div className="bg-slate-700/30 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Student's Answer</h4>
                        <p className="text-white leading-relaxed">{selectedSubmission.transcript || 'No transcript available'}</p>
                      </div>

                      {/* Submitted At */}
                      <p className="text-xs text-slate-500 mb-4">
                        Submitted: {selectedSubmission.submitted_at ? new Date(selectedSubmission.submitted_at).toLocaleString() : 'Unknown'}
                      </p>

                      {/* Existing Feedback */}
                      {selectedSubmission.teacher_feedback && (
                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 mb-4">
                          <h4 className="text-sm font-semibold text-cyan-300 mb-2">Your Feedback</h4>
                          <p className="text-white">{selectedSubmission.teacher_feedback}</p>
                          <p className="text-xs text-slate-500 mt-2">
                            Given: {selectedSubmission.feedback_at ? new Date(selectedSubmission.feedback_at).toLocaleString() : ''}
                          </p>
                        </div>
                      )}

                      {/* Feedback Form */}
                      <div className="border-t border-slate-700 pt-4">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">
                          {selectedSubmission.teacher_feedback ? 'Update Feedback' : 'Add Feedback'}
                        </h4>
                        <textarea
                          value={feedbackText || selectedSubmission.teacher_feedback || ''}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white resize-none"
                          rows="4"
                          placeholder="Write your feedback for this student..."
                        />
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleSubmitFeedback(selectedAssignment.id, selectedSubmission.id)}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:opacity-90"
                          >
                            {selectedSubmission.teacher_feedback ? 'Update Feedback' : 'Submit Feedback'}
                          </button>
                          <button
                            onClick={() => { setSelectedSubmission(null); setFeedbackText(''); }}
                            className="px-4 py-2 bg-slate-600 text-white rounded-lg"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assignments Tab */}
            {activeTab === 'assignments' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Assignments ({assignments.length})</h2>
                  <button
                    onClick={() => setShowAssignmentForm(true)}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:opacity-90"
                  >
                    + New Assignment
                  </button>
                </div>

                {showAssignmentForm && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h3 className="text-lg font-bold text-white mb-4">Create New Assignment</h3>
                    <form onSubmit={handleCreateAssignment} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Class</label>
                        <select
                          value={assignmentForm.class_id}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, class_id: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                        >
                          <option value="">Select a class</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Topic</label>
                        <input
                          type="text"
                          value={assignmentForm.topic}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, topic: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          placeholder="e.g., Travel, Education, Technology"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Question</label>
                        <textarea
                          value={assignmentForm.question_text}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, question_text: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          rows="2"
                          placeholder="Enter the speaking question..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Requirements (optional)</label>
                        <input
                          type="text"
                          value={assignmentForm.requirements}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, requirements: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          placeholder="e.g., Speak for at least 1 minute"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Instructions (optional)</label>
                        <textarea
                          value={assignmentForm.instructions}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          rows="2"
                          placeholder="Additional instructions for students..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg">
                          Create
                        </button>
                        <button type="button" onClick={() => setShowAssignmentForm(false)} className="px-4 py-2 bg-slate-600 text-white rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {assignments.map((a) => (
                    <div key={a.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded">
                              {a.topic}
                            </span>
                            <span className="text-slate-500 text-sm">
                              {a.class_name}
                            </span>
                          </div>
                          <p className="text-white">{a.question_text}</p>
                          {a.requirements && (
                            <p className="text-slate-400 text-sm mt-1">Requirements: {a.requirements}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteAssignment(a.id)}
                          className="px-3 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content Tab (View Only) */}
            {activeTab === 'content' && (
              <div className="space-y-6">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                  <h2 className="text-xl font-bold text-white mb-4">Conversations ({conversations.length})</h2>
                  <p className="text-slate-400 text-sm mb-4">Conversations are managed by admins</p>
                  <div className="space-y-2">
                    {conversations.map(conv => (
                      <div key={conv.id} className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                        <h3 className="text-white">{conv.topic}</h3>
                        <p className="text-slate-400 text-sm">{Object.keys(conv.dialogue || {}).length} lines</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                  <h2 className="text-xl font-bold text-white mb-4">Questions ({questions.length})</h2>
                  <p className="text-slate-400 text-sm mb-4">Questions are managed by admins</p>
                  <div className="space-y-2">
                    {questions.map(q => (
                      <div key={q.id} className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                        <span className="text-xs text-cyan-400">{q.topic}</span>
                        <p className="text-white text-sm mt-1">{q.question}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;
