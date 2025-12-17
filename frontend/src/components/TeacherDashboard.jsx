import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import FeedbackDetails from './FeedbackDetails';
import TeacherClassProgress from './progress/TeacherClassProgress';

function TeacherDashboard({ embedded = false }) {
  const { user, logout, getAuthHeaders } = useAuth();
  const [showProgress, setShowProgress] = useState(false);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classAssignments, setClassAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [teacherScores, setTeacherScores] = useState({
    pronunciation: '',
    pronunciation_comment: '',
    fluency: '',
    fluency_comment: '',
    grammar: '',
    grammar_comment: '',
    vocabulary: '',
    vocabulary_comment: '',
    coherence: '',
    coherence_comment: '',
    overall: '',
    suggestions: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Class form state
  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', description: '' });

  // Assignment form state
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
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

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, classesRes] = await Promise.all([
        axios.get('/api/teacher/students', { headers: getAuthHeaders() }),
        axios.get('/api/classes', { headers: getAuthHeaders() })
      ]);
      setStudents(studentsRes.data.students || []);
      setAllStudents(studentsRes.data.students || []);
      setClasses(classesRes.data.classes || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
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
    // Build teacher scores object (only include non-empty values)
    const scores = {};
    if (teacherScores.pronunciation) scores.pronunciation = parseFloat(teacherScores.pronunciation);
    if (teacherScores.pronunciation_comment) scores.pronunciation_comment = teacherScores.pronunciation_comment;
    if (teacherScores.fluency) scores.fluency = parseFloat(teacherScores.fluency);
    if (teacherScores.fluency_comment) scores.fluency_comment = teacherScores.fluency_comment;
    if (teacherScores.grammar) scores.grammar = parseFloat(teacherScores.grammar);
    if (teacherScores.grammar_comment) scores.grammar_comment = teacherScores.grammar_comment;
    if (teacherScores.vocabulary) scores.vocabulary = parseFloat(teacherScores.vocabulary);
    if (teacherScores.vocabulary_comment) scores.vocabulary_comment = teacherScores.vocabulary_comment;
    if (teacherScores.coherence) scores.coherence = parseFloat(teacherScores.coherence);
    if (teacherScores.coherence_comment) scores.coherence_comment = teacherScores.coherence_comment;
    if (teacherScores.overall) scores.overall = parseFloat(teacherScores.overall);
    if (teacherScores.suggestions) scores.suggestions = teacherScores.suggestions;

    const hasScores = Object.keys(scores).length > 0;
    const hasFeedback = feedbackText.trim().length > 0;

    if (!hasFeedback && !hasScores) {
      setError('Please enter feedback text or scores');
      return;
    }

    try {
      const payload = {};
      if (hasFeedback) payload.feedback = feedbackText;
      if (hasScores) payload.teacher_scores = scores;

      await axios.post(`/api/assignments/${assignmentId}/submissions/${submissionId}/feedback`, payload, { headers: getAuthHeaders() });
      setSuccess('Feedback submitted successfully');
      setFeedbackText('');
      setTeacherScores({
        pronunciation: '', pronunciation_comment: '',
        fluency: '', fluency_comment: '',
        grammar: '', grammar_comment: '',
        vocabulary: '', vocabulary_comment: '',
        coherence: '', coherence_comment: '',
        overall: '', suggestions: ''
      });
      setSelectedSubmission(null);
      fetchAssignmentSubmissions(assignmentId);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit feedback');
    }
  };

  const resetTeacherForm = () => {
    setFeedbackText('');
    setTeacherScores({
      pronunciation: '', pronunciation_comment: '',
      fluency: '', fluency_comment: '',
      grammar: '', grammar_comment: '',
      vocabulary: '', vocabulary_comment: '',
      coherence: '', coherence_comment: '',
      overall: '', suggestions: ''
    });
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
    if (!score) return 'text-gray-500';
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-gray-50"}>
      <div className={embedded ? "py-4" : "container mx-auto px-4 py-8 max-w-6xl"}>
        {/* User Header - only show when not embedded */}
        {!embedded && (
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-lg">{user?.username?.[0]?.toUpperCase() || 'T'}</span>
              </div>
              <div>
                <span className="text-gray-600">Welcome, <span className="text-gray-900 font-medium">{user?.username}</span></span>
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">Teacher</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        )}

        {/* Header - only show when not embedded */}
        {!embedded && (
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold text-blue-600 mb-3">
              Teacher Dashboard
            </h1>
            <p className="text-gray-500 text-lg">Manage your classes and students</p>

            {/* Toggle to Progress View */}
            <button
              onClick={() => setShowProgress(true)}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Class Progress
            </button>
          </div>
        )}

        {/* Progress View - Full Screen */}
        {showProgress ? (
          <TeacherClassProgress onBack={() => setShowProgress(false)} />
        ) : (
        <>
        {/* Messages */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl">
            {error}
            <button onClick={() => setError('')} className="float-right">&times;</button>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-xl">
            {success}
            <button onClick={() => setSuccess('')} className="float-right">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="bg-white shadow-sm rounded-2xl p-8 text-center shadow-xl border border-gray-200">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {/* Classes List */}
            {!selectedClass && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">My Classes ({classes.length})</h2>
                  <button
                    onClick={() => setShowClassForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90"
                  >
                    + New Class
                  </button>
                </div>

                {showClassForm && (
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Class</h3>
                    <form onSubmit={handleCreateClass} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Class Name</label>
                        <input
                          type="text"
                          value={classForm.name}
                          onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                        <textarea
                          value={classForm.description}
                          onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          rows="2"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg">
                          Create
                        </button>
                        <button type="button" onClick={() => setShowClassForm(false)} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg">
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
                      className="bg-white shadow-sm rounded-xl p-4 border border-gray-200 hover:border-blue-500/50 cursor-pointer transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                          <p className="text-gray-500 text-sm">{c.description || 'No description'}</p>
                        </div>
                        <span className="px-3 py-1 bg-blue-100 text-blue-600 text-sm rounded-lg">
                          {c.student_count} students
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Class Detail View */}
            {selectedClass && !selectedAssignment && (
              <div className="space-y-6">
                <button
                  onClick={() => { setSelectedClass(null); setClassAssignments([]); setClassViewMode('assignments'); }}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Classes
                </button>

                <div className="bg-white shadow-sm rounded-2xl p-6 border border-gray-200">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{selectedClass.name}</h2>
                      <p className="text-gray-500">{selectedClass.description || 'No description'}</p>
                    </div>
                  </div>

                  {/* Sub-tabs: Assignments / Students */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setClassViewMode('assignments')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        classViewMode === 'assignments'
                          ? 'bg-emerald-100 text-emerald-600 border border-emerald-300'
                          : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Assignments ({classAssignments.length})
                    </button>
                    <button
                      onClick={() => setClassViewMode('students')}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        classViewMode === 'students'
                          ? 'bg-blue-100 text-blue-600 border border-blue-300'
                          : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Students ({selectedClass.students?.length || 0})
                    </button>
                  </div>

                  {/* Assignments View */}
                  {classViewMode === 'assignments' && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Class Assignments</h3>
                        <button
                          onClick={() => {
                            setAssignmentForm({ ...assignmentForm, class_id: selectedClass.id });
                            setShowAssignmentForm(true);
                          }}
                          className="px-4 py-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200"
                        >
                          + Add Assignment
                        </button>
                      </div>

                      {/* Assignment Form */}
                      {showAssignmentForm && (
                        <div className="bg-gray-100 rounded-xl p-4 mb-4 border border-gray-300">
                          <h4 className="text-md font-bold text-gray-900 mb-3">
                            {editingAssignment ? 'Edit Assignment' : 'New Assignment'}
                          </h4>
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                              if (editingAssignment) {
                                await axios.put(`/api/assignments/${editingAssignment.id}`, assignmentForm, { headers: getAuthHeaders() });
                                setSuccess('Assignment updated');
                              } else {
                                await axios.post('/api/assignments', assignmentForm, { headers: getAuthHeaders() });
                                setSuccess('Assignment created');
                              }
                              setShowAssignmentForm(false);
                              setEditingAssignment(null);
                              setAssignmentForm({ class_id: '', topic: '', question_text: '', requirements: '', instructions: '' });
                              fetchClassDetails(selectedClass.id);
                            } catch (err) {
                              setError(err.response?.data?.detail || 'Failed to save assignment');
                            }
                          }} className="space-y-3">
                            <input
                              type="text"
                              placeholder="Topic"
                              value={assignmentForm.topic}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, topic: e.target.value })}
                              required
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm"
                            />
                            <textarea
                              placeholder="Question"
                              value={assignmentForm.question_text}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, question_text: e.target.value })}
                              required
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm"
                              rows="2"
                            />
                            <input
                              type="text"
                              placeholder="Requirements (optional)"
                              value={assignmentForm.requirements}
                              onChange={(e) => setAssignmentForm({ ...assignmentForm, requirements: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm"
                            />
                            <div className="flex gap-2">
                              <button type="submit" className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm">
                                {editingAssignment ? 'Update' : 'Create'}
                              </button>
                              <button type="button" onClick={() => {
                                setShowAssignmentForm(false);
                                setEditingAssignment(null);
                                setAssignmentForm({ class_id: '', topic: '', question_text: '', requirements: '', instructions: '' });
                              }} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg text-sm">Cancel</button>
                            </div>
                          </form>
                        </div>
                      )}

                      {classAssignments.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No assignments yet. Create one to get started.</p>
                      ) : (
                        <div className="space-y-3">
                          {classAssignments.map((a) => (
                            <div
                              key={a.id}
                              onClick={() => {
                                setSelectedAssignment(a);
                                fetchAssignmentSubmissions(a.id);
                              }}
                              className="bg-gray-100 rounded-xl p-4 border border-gray-300 hover:border-emerald-500/50 cursor-pointer transition-all"
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-xs rounded">{a.topic}</span>
                                  </div>
                                  <p className="text-gray-900 font-medium">{a.question_text}</p>
                                  {a.requirements && (
                                    <p className="text-gray-500 text-sm mt-1">{a.requirements}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500">Submissions</p>
                                    <p className="text-lg font-bold text-gray-900">
                                      {a.submissions_count || 0}/{selectedClass.students?.length || 0}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingAssignment(a);
                                        setAssignmentForm({
                                          class_id: a.class_id,
                                          topic: a.topic,
                                          question_text: a.question_text,
                                          requirements: a.requirements || '',
                                          instructions: a.instructions || ''
                                        });
                                        setShowAssignmentForm(true);
                                      }}
                                      className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs hover:bg-blue-200"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this assignment? This will also delete all submissions.')) {
                                          try {
                                            await axios.delete(`/api/assignments/${a.id}`, { headers: getAuthHeaders() });
                                            setSuccess('Assignment deleted');
                                            fetchClassDetails(selectedClass.id);
                                          } catch (err) {
                                            setError(err.response?.data?.detail || 'Failed to delete assignment');
                                          }
                                        }
                                      }}
                                      className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200"
                                    >
                                      Delete
                                    </button>
                                  </div>
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
                        <h3 className="text-lg font-semibold text-gray-900">Enrolled Students</h3>
                        <button
                          onClick={() => {
                            setAddStudentClassId(selectedClass.id);
                            setShowAddStudentModal(true);
                          }}
                          className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                        >
                          + Add Student
                        </button>
                      </div>

                      {selectedClass.students?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedClass.students.map((s) => (
                            <div key={s.id} className="flex justify-between items-center bg-gray-100 rounded-lg p-3">
                              <div>
                                <span className="text-gray-900">{s.username}</span>
                                <span className="text-gray-500 text-sm ml-2">({s.email})</span>
                              </div>
                              <button
                                onClick={() => handleRemoveStudent(selectedClass.id, s.student_id)}
                                className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No students in this class</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Add Student Modal */}
                {showAddStudentModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Add Student to Class</h3>
                      <div className="space-y-2">
                        {allStudents.filter(s =>
                          !selectedClass.students?.some(cs => cs.student_id === s.id)
                        ).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleAddStudent(s.id)}
                            className="w-full text-left bg-gray-100 rounded-lg p-3 hover:bg-gray-200 transition-colors"
                          >
                            <span className="text-gray-900">{s.username}</span>
                            <span className="text-gray-500 text-sm ml-2">({s.email})</span>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowAddStudentModal(false)}
                        className="mt-4 w-full px-4 py-2 bg-gray-200 text-gray-900 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assignment Detail View with Submissions */}
            {selectedClass && selectedAssignment && (
              <div className="space-y-6">
                <button
                  onClick={() => { setSelectedAssignment(null); setAssignmentSubmissions(null); setSelectedSubmission(null); }}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to {selectedClass.name}
                </button>

                {/* Assignment Info */}
                <div className="bg-white shadow-sm rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded">{selectedAssignment.topic}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Assignment Details</h2>
                  <div className="bg-gray-100 rounded-lg p-4 mb-4">
                    <p className="text-gray-900 font-medium">{selectedAssignment.question_text}</p>
                    {selectedAssignment.requirements && (
                      <p className="text-gray-500 text-sm mt-2">Requirements: {selectedAssignment.requirements}</p>
                    )}
                  </div>

                  {/* Submission Stats */}
                  {assignmentSubmissions && (
                    <div className="flex gap-4 mb-6">
                      <div className="bg-gray-100 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-gray-900">{assignmentSubmissions.submitted_count}</p>
                        <p className="text-sm text-gray-500">Submitted</p>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-gray-900">{assignmentSubmissions.total_students - assignmentSubmissions.submitted_count}</p>
                        <p className="text-sm text-gray-500">Pending</p>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-4 text-center flex-1">
                        <p className="text-3xl font-bold text-gray-900">{assignmentSubmissions.total_students}</p>
                        <p className="text-sm text-gray-500">Total Students</p>
                      </div>
                    </div>
                  )}

                  {/* Student Submissions List */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Student Submissions</h3>
                  {assignmentSubmissions?.submissions?.length > 0 ? (
                    <div className="space-y-3">
                      {assignmentSubmissions.submissions.map((sub) => (
                        <div
                          key={sub.student_id}
                          className={`rounded-xl p-4 border transition-all ${
                            sub.status === 'submitted'
                              ? 'bg-gray-100 border-gray-300 hover:border-emerald-500/50 cursor-pointer'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => sub.status === 'submitted' && setSelectedSubmission(sub)}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                sub.status === 'submitted' ? 'bg-emerald-100' : 'bg-gray-200'
                              }`}>
                                <span className="font-bold text-gray-900">{sub.student_name[0]?.toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="text-gray-900 font-medium">{sub.student_name}</p>
                                <p className="text-gray-500 text-sm">{sub.student_email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              {sub.status === 'submitted' ? (
                                <>
                                  {sub.review_status === 'reviewed' ? (
                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded">Reviewed</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-amber-100 text-amber-600 text-xs rounded">Waiting for Teacher</span>
                                  )}
                                  {sub.scores?.azure?.total_score !== undefined && (
                                    <p className={`text-lg font-bold mt-1 ${getScoreColor(sub.scores.azure.total_score)}`}>
                                      {sub.scores.azure.total_score.toFixed(0)}%
                                    </p>
                                  )}
                                </>
                              ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">Not Submitted</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">No students enrolled in this class</p>
                  )}
                </div>

                {/* Submission Detail Modal */}
                {selectedSubmission && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                      {/* Header with Status */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{selectedSubmission.student_name}'s Submission</h3>
                          <p className="text-gray-500 text-sm">{selectedSubmission.student_email}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {selectedSubmission.review_status === 'reviewed' ? (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded">Reviewed</span>
                            ) : (
                              <span className="px-2 py-1 bg-amber-100 text-amber-600 text-xs rounded">Waiting for Teacher</span>
                            )}
                            <span className="text-xs text-gray-500">
                              Submitted: {selectedSubmission.submitted_at ? new Date(selectedSubmission.submitted_at).toLocaleString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => { setSelectedSubmission(null); resetTeacherForm(); }}
                          className="text-gray-500 hover:text-gray-900"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Audio Player */}
                      {selectedSubmission.audio_url && (
                        <div className="bg-gray-100 rounded-lg p-4 mb-4">
                          <h4 className="text-sm font-semibold text-gray-600 mb-2">Recording</h4>
                          <audio controls className="w-full" src={selectedSubmission.audio_url}>
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      )}

                      {/* Transcript */}
                      <div className="bg-gray-100 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Student's Answer</h4>
                        <p className="text-gray-900 leading-relaxed">{selectedSubmission.transcript || 'No transcript available'}</p>
                      </div>

                      {/* Score & Detailed AI Feedback */}
                      {(selectedSubmission.scores?.openai_result || selectedSubmission.scores?.combined_result) && (
                        <div className="mb-4">
                          <FeedbackDetails
                            openaiResult={selectedSubmission.scores?.openai_result}
                            combinedResult={selectedSubmission.scores?.combined_result}
                            fluencyMetrics={selectedSubmission.scores?.unscripted_result?.speech_score?.fluency?.overall_metrics}
                            title="AI Evaluation"
                          />
                        </div>
                      )}

                      {/* Existing Teacher Feedback & Scores */}
                      {(selectedSubmission.teacher_feedback || selectedSubmission.teacher_scores) && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                          <h4 className="text-lg font-semibold text-blue-600 mb-3">Teacher's Evaluation</h4>

                          {selectedSubmission.teacher_scores && (
                            <div className="space-y-2 mb-3">
                              {/* Scores Grid */}
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                                {selectedSubmission.teacher_scores.pronunciation !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Pronunciation</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.pronunciation)}`}>
                                      {selectedSubmission.teacher_scores.pronunciation}
                                    </p>
                                  </div>
                                )}
                                {selectedSubmission.teacher_scores.fluency !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Fluency</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.fluency)}`}>
                                      {selectedSubmission.teacher_scores.fluency}
                                    </p>
                                  </div>
                                )}
                                {selectedSubmission.teacher_scores.grammar !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Grammar</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.grammar)}`}>
                                      {selectedSubmission.teacher_scores.grammar}
                                    </p>
                                  </div>
                                )}
                                {selectedSubmission.teacher_scores.vocabulary !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Vocabulary</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.vocabulary)}`}>
                                      {selectedSubmission.teacher_scores.vocabulary}
                                    </p>
                                  </div>
                                )}
                                {selectedSubmission.teacher_scores.coherence !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Coherence</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.coherence)}`}>
                                      {selectedSubmission.teacher_scores.coherence}
                                    </p>
                                  </div>
                                )}
                                {selectedSubmission.teacher_scores.overall !== undefined && (
                                  <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-500">Overall</p>
                                    <p className={`text-lg font-bold ${getScoreColor(selectedSubmission.teacher_scores.overall)}`}>
                                      {selectedSubmission.teacher_scores.overall}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Per-category Comments */}
                              {(selectedSubmission.teacher_scores.pronunciation_comment ||
                                selectedSubmission.teacher_scores.fluency_comment ||
                                selectedSubmission.teacher_scores.grammar_comment ||
                                selectedSubmission.teacher_scores.vocabulary_comment ||
                                selectedSubmission.teacher_scores.coherence_comment) && (
                                <div className="bg-white/50 rounded-lg p-3 space-y-2">
                                  <p className="text-xs text-amber-600 font-medium mb-2">Category Comments:</p>
                                  {selectedSubmission.teacher_scores.pronunciation_comment && (
                                    <p className="text-sm text-gray-600"><span className="text-blue-600">Pronunciation:</span> {selectedSubmission.teacher_scores.pronunciation_comment}</p>
                                  )}
                                  {selectedSubmission.teacher_scores.fluency_comment && (
                                    <p className="text-sm text-gray-600"><span className="text-blue-600">Fluency:</span> {selectedSubmission.teacher_scores.fluency_comment}</p>
                                  )}
                                  {selectedSubmission.teacher_scores.grammar_comment && (
                                    <p className="text-sm text-gray-600"><span className="text-pink-600">Grammar:</span> {selectedSubmission.teacher_scores.grammar_comment}</p>
                                  )}
                                  {selectedSubmission.teacher_scores.vocabulary_comment && (
                                    <p className="text-sm text-gray-600"><span className="text-violet-600">Vocabulary:</span> {selectedSubmission.teacher_scores.vocabulary_comment}</p>
                                  )}
                                  {selectedSubmission.teacher_scores.coherence_comment && (
                                    <p className="text-sm text-gray-600"><span className="text-blue-600">Coherence:</span> {selectedSubmission.teacher_scores.coherence_comment}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {selectedSubmission.teacher_scores?.suggestions && (
                            <div className="bg-white/50 rounded-lg p-3 mb-3">
                              <p className="text-xs text-emerald-600 font-medium mb-1">Teacher's Suggestions:</p>
                              <p className="text-sm text-gray-600">{selectedSubmission.teacher_scores.suggestions}</p>
                            </div>
                          )}

                          {selectedSubmission.teacher_feedback && (
                            <div className="bg-white/50 rounded-lg p-3">
                              <p className="text-xs text-blue-600 font-medium mb-1">Teacher's Feedback:</p>
                              <p className="text-sm text-gray-600">{selectedSubmission.teacher_feedback}</p>
                            </div>
                          )}

                          <p className="text-xs text-gray-500 mt-2">
                            Reviewed: {selectedSubmission.feedback_at ? new Date(selectedSubmission.feedback_at).toLocaleString() : ''}
                          </p>
                        </div>
                      )}

                      {/* Teacher Scoring & Feedback Form */}
                      <div className="border-t border-gray-200 pt-4">
                        <h4 className="text-lg font-semibold text-gray-600 mb-4">
                          {selectedSubmission.teacher_feedback || selectedSubmission.teacher_scores ? 'Update Evaluation' : 'Add Your Evaluation'}
                        </h4>

                        {/* Score Inputs with Comments */}
                        <div className="space-y-4 mb-4">
                          {/* Pronunciation */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">🎯</span>
                              <label className="text-sm font-medium text-blue-600">Pronunciation</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.pronunciation}
                                onChange={(e) => setTeacherScores({ ...teacherScores, pronunciation: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                            <input
                              type="text"
                              value={teacherScores.pronunciation_comment}
                              onChange={(e) => setTeacherScores({ ...teacherScores, pronunciation_comment: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                              placeholder="Comment on pronunciation (optional)"
                            />
                          </div>

                          {/* Fluency */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">🗣️</span>
                              <label className="text-sm font-medium text-blue-600">Fluency</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.fluency}
                                onChange={(e) => setTeacherScores({ ...teacherScores, fluency: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                            <input
                              type="text"
                              value={teacherScores.fluency_comment}
                              onChange={(e) => setTeacherScores({ ...teacherScores, fluency_comment: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                              placeholder="Comment on fluency (optional)"
                            />
                          </div>

                          {/* Grammar */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">📝</span>
                              <label className="text-sm font-medium text-pink-600">Grammar</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.grammar}
                                onChange={(e) => setTeacherScores({ ...teacherScores, grammar: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                            <input
                              type="text"
                              value={teacherScores.grammar_comment}
                              onChange={(e) => setTeacherScores({ ...teacherScores, grammar_comment: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                              placeholder="Comment on grammar (optional)"
                            />
                          </div>

                          {/* Vocabulary */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">📚</span>
                              <label className="text-sm font-medium text-violet-600">Vocabulary</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.vocabulary}
                                onChange={(e) => setTeacherScores({ ...teacherScores, vocabulary: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                            <input
                              type="text"
                              value={teacherScores.vocabulary_comment}
                              onChange={(e) => setTeacherScores({ ...teacherScores, vocabulary_comment: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                              placeholder="Comment on vocabulary (optional)"
                            />
                          </div>

                          {/* Coherence */}
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg">🔗</span>
                              <label className="text-sm font-medium text-blue-600">Coherence</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.coherence}
                                onChange={(e) => setTeacherScores({ ...teacherScores, coherence: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                            <input
                              type="text"
                              value={teacherScores.coherence_comment}
                              onChange={(e) => setTeacherScores({ ...teacherScores, coherence_comment: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm"
                              placeholder="Comment on coherence (optional)"
                            />
                          </div>

                          {/* Overall */}
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <span className="text-lg">⭐</span>
                              <label className="text-sm font-medium text-emerald-600">Overall Score</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={teacherScores.overall}
                                onChange={(e) => setTeacherScores({ ...teacherScores, overall: e.target.value })}
                                className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-center"
                                placeholder="0-100"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Suggestions */}
                        <div className="mb-4">
                          <label className="block text-xs text-gray-500 mb-1">Your Suggestions for Improvement</label>
                          <textarea
                            value={teacherScores.suggestions}
                            onChange={(e) => setTeacherScores({ ...teacherScores, suggestions: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 resize-none text-sm"
                            rows="2"
                            placeholder="Specific suggestions to help the student improve..."
                          />
                        </div>

                        {/* General Feedback */}
                        <div className="mb-4">
                          <label className="block text-xs text-gray-500 mb-1">General Feedback</label>
                          <textarea
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 resize-none text-sm"
                            rows="3"
                            placeholder="Overall feedback for the student..."
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSubmitFeedback(selectedAssignment.id, selectedSubmission.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90"
                          >
                            {selectedSubmission.teacher_feedback || selectedSubmission.teacher_scores ? 'Update Evaluation' : 'Submit Evaluation'}
                          </button>
                          <button
                            onClick={() => { setSelectedSubmission(null); resetTeacherForm(); }}
                            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg"
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

          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;
