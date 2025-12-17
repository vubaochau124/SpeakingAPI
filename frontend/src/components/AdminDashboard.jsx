import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import AdminProgress from './progress/AdminProgress';

function AdminDashboard() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [aiTopics, setAiTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Role filter state for users tab
  const [roleFilter, setRoleFilter] = useState('all'); // 'all', 'student', 'teacher', 'admin'

  // Class detail view state
  const [selectedClass, setSelectedClass] = useState(null);
  const [classAssignments, setClassAssignments] = useState([]);
  const [classViewMode, setClassViewMode] = useState('assignments'); // 'assignments', 'students', 'teachers'

  // Class form state
  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', description: '', teacher_ids: [] });
  const [editingClassId, setEditingClassId] = useState(null);

  // Assignment form state
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ topic: '', question_text: '', requirements: '', instructions: '', deadline: '' });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);

  // Student add modal
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  // Teacher add modal
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);

  // Conversation form state
  const [showConversationForm, setShowConversationForm] = useState(false);
  const [conversationForm, setConversationForm] = useState({ topic: '', dialogue: [] });

  // Question form state
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionForm, setQuestionForm] = useState({ topic_name: '', question_text: '' });

  // AI Topic form state
  const [showAiTopicForm, setShowAiTopicForm] = useState(false);
  const [aiTopicForm, setAiTopicForm] = useState({
    name: '',
    name_vi: '',
    description: '',
    system_prompt: '',
    opening_message: '',
    language: 'en-US',
    is_active: true
  });
  const [editingAiTopicId, setEditingAiTopicId] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'users') {
        const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() });
        setUsers(res.data.users || []);
      } else if (activeTab === 'classes') {
        const [classRes, teacherRes, studentRes] = await Promise.all([
          axios.get('/api/classes', { headers: getAuthHeaders() }),
          axios.get('/api/admin/teachers', { headers: getAuthHeaders() }),
          axios.get('/api/admin/students', { headers: getAuthHeaders() })
        ]);
        setClasses(classRes.data.classes || []);
        setTeachers(teacherRes.data.teachers || []);
        setStudents(studentRes.data.students || []);
      } else if (activeTab === 'conversations') {
        const res = await axios.get('/api/conversations', { headers: getAuthHeaders() });
        setConversations(res.data.conversations || []);
      } else if (activeTab === 'questions') {
        const res = await axios.get('/api/questions', { headers: getAuthHeaders() });
        setQuestions(res.data.questions || []);
      } else if (activeTab === 'ai-topics') {
        const res = await axios.get('/api/ai-conversation/admin/topics', { headers: getAuthHeaders() });
        setAiTopics(res.data || []);
      }
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
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

  // Filter function for search
  const filterBySearch = (items, fields) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      fields.some(field => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], item);
        return value?.toString().toLowerCase().includes(query);
      })
    );
  };

  // Class management
  const handleCreateClass = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/classes', classForm, { headers: getAuthHeaders() });
      setSuccess('Class created successfully');
      setShowClassForm(false);
      setClassForm({ name: '', description: '', teacher_ids: [] });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create class');
    }
  };

  const handleUpdateClass = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.put(`/api/classes/${editingClassId}`, classForm, { headers: getAuthHeaders() });
      setSuccess('Class updated successfully');
      setShowClassForm(false);
      setClassForm({ name: '', description: '', teacher_ids: [] });
      setEditingClassId(null);
      fetchData();
      if (selectedClass) fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update class');
    }
  };

  const handleDeleteClass = async (classId) => {
    if (!confirm('Are you sure you want to delete this class?')) return;
    try {
      await axios.delete(`/api/classes/${classId}`, { headers: getAuthHeaders() });
      setSuccess('Class deleted successfully');
      setSelectedClass(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete class');
    }
  };

  // Assignment management
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = {
        ...assignmentForm,
        class_id: selectedClass.id,
        deadline: assignmentForm.deadline ? new Date(assignmentForm.deadline).toISOString() : null
      };
      await axios.post('/api/assignments', data, { headers: getAuthHeaders() });
      setSuccess('Assignment created successfully');
      setShowAssignmentForm(false);
      setAssignmentForm({ topic: '', question_text: '', requirements: '', instructions: '', deadline: '' });
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assignment');
    }
  };

  const handleUpdateAssignment = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = {
        ...assignmentForm,
        deadline: assignmentForm.deadline ? new Date(assignmentForm.deadline).toISOString() : null
      };
      await axios.put(`/api/assignments/${editingAssignmentId}`, data, { headers: getAuthHeaders() });
      setSuccess('Assignment updated successfully');
      setShowAssignmentForm(false);
      setAssignmentForm({ topic: '', question_text: '', requirements: '', instructions: '', deadline: '' });
      setEditingAssignmentId(null);
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await axios.delete(`/api/assignments/${assignmentId}`, { headers: getAuthHeaders() });
      setSuccess('Assignment deleted successfully');
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete assignment');
    }
  };

  // Student management
  const handleAddStudent = async (studentId) => {
    try {
      await axios.post(`/api/classes/${selectedClass.id}/students`, { student_id: studentId }, { headers: getAuthHeaders() });
      setSuccess('Student added successfully');
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add student');
    }
  };

  const handleRemoveStudent = async (studentId) => {
    if (!confirm('Remove this student from the class?')) return;
    try {
      await axios.delete(`/api/classes/${selectedClass.id}/students/${studentId}`, { headers: getAuthHeaders() });
      setSuccess('Student removed successfully');
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove student');
    }
  };

  // Teacher management
  const handleAddTeacher = async (teacherId) => {
    try {
      await axios.post(`/api/classes/${selectedClass.id}/teachers`, { teacher_id: teacherId }, { headers: getAuthHeaders() });
      setSuccess('Teacher added successfully');
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add teacher');
    }
  };

  const handleRemoveTeacher = async (teacherId) => {
    if (!confirm('Remove this teacher from the class?')) return;
    try {
      await axios.delete(`/api/classes/${selectedClass.id}/teachers/${teacherId}`, { headers: getAuthHeaders() });
      setSuccess('Teacher removed successfully');
      fetchClassDetails(selectedClass.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove teacher');
    }
  };

  // Conversation management
  const handleCreateConversation = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const dialogueObj = {};
      conversationForm.dialogue.forEach((line, idx) => {
        dialogueObj[`id${idx + 1}`] = { role: line.role, line: line.text };
      });
      const formData = new FormData();
      formData.append('topic', conversationForm.topic);
      formData.append('dialogue', JSON.stringify(dialogueObj));
      await axios.post('/api/admin/conversations', formData, { headers: getAuthHeaders() });
      setSuccess('Conversation created successfully');
      setShowConversationForm(false);
      setConversationForm({ topic: '', dialogue: [] });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create conversation');
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await axios.delete(`/api/admin/conversations/${conversationId}`, { headers: getAuthHeaders() });
      setSuccess('Conversation deleted successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete conversation');
    }
  };

  // Question management
  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('topic_name', questionForm.topic_name);
      formData.append('question_text', questionForm.question_text);
      await axios.post('/api/admin/questions', formData, { headers: getAuthHeaders() });
      setSuccess('Question created successfully');
      setShowQuestionForm(false);
      setQuestionForm({ topic_name: '', question_text: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create question');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await axios.delete(`/api/admin/questions/${questionId}`, { headers: getAuthHeaders() });
      setSuccess('Question deleted successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete question');
    }
  };

  // AI Topic management
  const handleCreateAiTopic = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/ai-conversation/admin/topics', aiTopicForm, { headers: getAuthHeaders() });
      setSuccess('AI Topic created successfully');
      setShowAiTopicForm(false);
      resetAiTopicForm();
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create AI topic');
    }
  };

  const handleUpdateAiTopic = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.put(`/api/ai-conversation/admin/topics/${editingAiTopicId}`, aiTopicForm, { headers: getAuthHeaders() });
      setSuccess('AI Topic updated successfully');
      setShowAiTopicForm(false);
      resetAiTopicForm();
      setEditingAiTopicId(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update AI topic');
    }
  };

  const handleDeleteAiTopic = async (topicId) => {
    if (!confirm('Are you sure you want to deactivate this AI topic?')) return;
    try {
      await axios.delete(`/api/ai-conversation/admin/topics/${topicId}`, { headers: getAuthHeaders() });
      setSuccess('AI Topic deactivated successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to deactivate AI topic');
    }
  };

  const handleToggleAiTopicActive = async (topic) => {
    try {
      await axios.put(`/api/ai-conversation/admin/topics/${topic.id}`, {
        is_active: !topic.is_active
      }, { headers: getAuthHeaders() });
      setSuccess(`AI Topic ${topic.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to toggle AI topic');
    }
  };

  const resetAiTopicForm = () => {
    setAiTopicForm({
      name: '',
      name_vi: '',
      description: '',
      system_prompt: '',
      opening_message: '',
      language: 'en-US',
      is_active: true
    });
  };

  const addDialogueLine = () => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: [...prev.dialogue, { role: 'you', text: '' }]
    }));
  };

  const updateDialogueLine = (index, field, value) => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.map((line, i) => i === index ? { ...line, [field]: value } : line)
    }));
  };

  const removeDialogueLine = (index) => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.filter((_, i) => i !== index)
    }));
  };

  // Render class detail view
  const renderClassDetail = () => (
    <div className="space-y-4">
      {/* Back button and header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setSelectedClass(null)}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-900"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{selectedClass.name}</h2>
          <p className="text-gray-500">{selectedClass.description || 'No description'}</p>
        </div>
        <button
          onClick={() => {
            setClassForm({
              name: selectedClass.name,
              description: selectedClass.description || '',
              teacher_ids: selectedClass.teachers?.map(t => t.teacher_id) || []
            });
            setEditingClassId(selectedClass.id);
            setShowClassForm(true);
          }}
          className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
        >
          Edit Class
        </button>
        <button
          onClick={() => handleDeleteClass(selectedClass.id)}
          className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
        >
          Delete Class
        </button>
      </div>

      {/* Edit Class Form (shown in detail view) */}
      {showClassForm && editingClassId && (
        <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200 mb-4">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Class</h3>
          <form onSubmit={handleUpdateClass} className="space-y-4">
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
              <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90">
                Update
              </button>
              <button type="button" onClick={() => { setShowClassForm(false); setEditingClassId(null); }} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        {['assignments', 'students', 'teachers'].map((mode) => (
          <button
            key={mode}
            onClick={() => setClassViewMode(mode)}
            className={`px-4 py-2 rounded-lg capitalize ${
              classViewMode === mode
                ? 'bg-blue-600 text-gray-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {mode} ({mode === 'assignments' ? classAssignments.length : mode === 'students' ? selectedClass.students?.length || 0 : selectedClass.teachers?.length || 0})
          </button>
        ))}
      </div>

      {/* Assignments view */}
      {classViewMode === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Assignments</h3>
            <button
              onClick={() => {
                setShowAssignmentForm(true);
                setEditingAssignmentId(null);
                setAssignmentForm({ topic: '', question_text: '', requirements: '', instructions: '', deadline: '' });
              }}
              className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90"
            >
              + New Assignment
            </button>
          </div>

          {showAssignmentForm && (
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingAssignmentId ? 'Edit Assignment' : 'Create Assignment'}
              </h4>
              <form onSubmit={editingAssignmentId ? handleUpdateAssignment : handleCreateAssignment} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Topic</label>
                    <input
                      type="text"
                      value={assignmentForm.topic}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, topic: e.target.value })}
                      required
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Deadline</label>
                    <input
                      type="datetime-local"
                      value={assignmentForm.deadline}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, deadline: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Question</label>
                  <textarea
                    value={assignmentForm.question_text}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, question_text: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                    rows="2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Requirements</label>
                  <textarea
                    value={assignmentForm.requirements}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, requirements: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                    rows="2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Instructions</label>
                  <textarea
                    value={assignmentForm.instructions}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                    rows="2"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg">
                    {editingAssignmentId ? 'Update' : 'Create'}
                  </button>
                  <button type="button" onClick={() => setShowAssignmentForm(false)} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-3">
            {classAssignments.map((a) => (
              <div key={a.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-lg font-semibold text-gray-900">{a.topic}</h4>
                      {a.deadline && (
                        <span className={`text-xs px-2 py-1 rounded ${a.is_past_deadline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          {a.is_past_deadline ? 'Past deadline' : `Due: ${new Date(a.deadline).toLocaleString()}`}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm">{a.question_text}</p>
                    <p className="text-gray-400 text-xs mt-1">{a.submissions_count || 0} submissions</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAssignmentForm({
                          topic: a.topic,
                          question_text: a.question_text,
                          requirements: a.requirements || '',
                          instructions: a.instructions || '',
                          deadline: a.deadline ? new Date(a.deadline).toISOString().slice(0, 16) : ''
                        });
                        setEditingAssignmentId(a.id);
                        setShowAssignmentForm(true);
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteAssignment(a.id)}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {classAssignments.length === 0 && (
              <p className="text-gray-500 text-center py-8">No assignments yet</p>
            )}
          </div>
        </div>
      )}

      {/* Students view */}
      {classViewMode === 'students' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Students</h3>
            <button
              onClick={() => setShowAddStudentModal(true)}
              className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90"
            >
              + Add Student
            </button>
          </div>

          <div className="space-y-2">
            {selectedClass.students?.map((s) => (
              <div key={s.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex justify-between items-center">
                <div>
                  <p className="text-gray-900 font-medium">{s.username}</p>
                  <p className="text-gray-500 text-sm">{s.email}</p>
                </div>
                <button
                  onClick={() => handleRemoveStudent(s.student_id)}
                  className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            ))}
            {(!selectedClass.students || selectedClass.students.length === 0) && (
              <p className="text-gray-500 text-center py-8">No students enrolled</p>
            )}
          </div>
        </div>
      )}

      {/* Teachers view */}
      {classViewMode === 'teachers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Teachers</h3>
            <button
              onClick={() => setShowAddTeacherModal(true)}
              className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90"
            >
              + Add Teacher
            </button>
          </div>

          <div className="space-y-2">
            {selectedClass.teachers?.map((t) => (
              <div key={t.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex justify-between items-center">
                <div>
                  <p className="text-gray-900 font-medium">{t.username}</p>
                  <p className="text-gray-500 text-sm">{t.email}</p>
                </div>
                <button
                  onClick={() => handleRemoveTeacher(t.teacher_id)}
                  className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                  disabled={selectedClass.teachers?.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Student</h3>
              <button onClick={() => setShowAddStudentModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <input
              type="text"
              placeholder="Search students..."
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 mb-4"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="space-y-2">
              {students
                .filter(s => !selectedClass.students?.some(cs => cs.student_id === s.id))
                .filter(s => s.username.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((s) => (
                  <div key={s.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                    <div>
                      <p className="text-gray-900">{s.username}</p>
                      <p className="text-gray-500 text-sm">{s.email}</p>
                    </div>
                    <button
                      onClick={() => { handleAddStudent(s.id); setShowAddStudentModal(false); setSearchQuery(''); }}
                      className="px-3 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Teacher Modal */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Teacher</h3>
              <button onClick={() => setShowAddTeacherModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="space-y-2">
              {teachers
                .filter(t => !selectedClass.teachers?.some(ct => ct.teacher_id === t.id))
                .map((t) => (
                  <div key={t.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                    <div>
                      <p className="text-gray-900">{t.username}</p>
                      <p className="text-gray-500 text-sm">{t.email}</p>
                    </div>
                    <button
                      onClick={() => { handleAddTeacher(t.id); setShowAddTeacherModal(false); }}
                      className="px-3 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Get filtered data
  const filteredUsers = filterBySearch(users, ['username', 'email', 'role'])
    .filter(u => roleFilter === 'all' || u.role === roleFilter);
  const filteredClasses = filterBySearch(classes, ['name', 'description']);
  const filteredConversations = filterBySearch(conversations, ['topic']);
  const filteredQuestions = filterBySearch(questions, ['topic', 'question']);
  const filteredAiTopics = filterBySearch(aiTopics, ['name', 'name_vi', 'description', 'language']);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Admin Dashboard</h1>
            <p className="text-gray-500">Manage users, classes, and content</p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-white shadow-sm rounded-xl p-1 overflow-x-auto">
          {['users', 'classes', 'conversations', 'questions', 'ai-topics', 'statistics'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedClass(null); setSearchQuery(''); }}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab === 'ai-topics' ? 'AI Topics' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        {!selectedClass && (
          <div className="mb-6">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

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
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="bg-white shadow-sm rounded-2xl p-6 border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Users ({filteredUsers.length})</h2>
                  <div className="flex gap-2">
                    {['all', 'student', 'teacher', 'admin'].map((role) => (
                      <button
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${
                          roleFilter === role
                            ? 'bg-blue-600 text-gray-900'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {role === 'all' ? 'All' : role + 's'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="pb-3 pr-4">Username</th>
                        <th className="pb-3 pr-4">Email</th>
                        <th className="pb-3 pr-4">Role</th>
                        <th className="pb-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="border-b border-gray-200">
                          <td className="py-3 pr-4 text-gray-900">{u.username}</td>
                          <td className="py-3 pr-4 text-gray-600">{u.email}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              u.role === 'admin' ? 'bg-blue-100 text-blue-600' :
                              u.role === 'teacher' ? 'bg-blue-100 text-blue-600' :
                              'bg-green-100 text-green-600'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 text-gray-500 text-sm">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Classes Tab */}
            {activeTab === 'classes' && (
              selectedClass ? renderClassDetail() : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Classes ({filteredClasses.length})</h2>
                    <button
                      onClick={() => {
                        setShowClassForm(true);
                        setEditingClassId(null);
                        setClassForm({ name: '', description: '', teacher_ids: [] });
                      }}
                      className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90 transition"
                    >
                      + New Class
                    </button>
                  </div>

                  {showClassForm && !editingClassId && (
                    <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">
                        Create New Class
                      </h3>
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
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Teachers (select multiple)</label>
                          <select
                            multiple
                            value={classForm.teacher_ids.map(String)}
                            onChange={(e) => setClassForm({ ...classForm, teacher_ids: Array.from(e.target.selectedOptions, opt => parseInt(opt.value)) })}
                            required
                            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 h-32"
                          >
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.username} ({t.email})</option>
                            ))}
                          </select>
                          <p className="text-gray-500 text-xs mt-1">Hold Ctrl/Cmd to select multiple</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90">
                            Create
                          </button>
                          <button type="button" onClick={() => setShowClassForm(false)} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="grid gap-4">
                    {filteredClasses.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => fetchClassDetails(c.id)}
                        className="bg-white shadow-sm rounded-xl p-4 border border-gray-200 cursor-pointer hover:bg-gray-100 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                            <p className="text-gray-500 text-sm">{c.description || 'No description'}</p>
                            <div className="flex gap-2 mt-2">
                              {c.teachers?.map((t) => (
                                <span key={t.id} className="text-blue-600 text-xs bg-blue-100 px-2 py-1 rounded">
                                  {t.username}
                                </span>
                              ))}
                            </div>
                            <p className="text-gray-400 text-sm mt-1">{c.student_count} students</p>
                          </div>
                          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Conversations Tab */}
            {activeTab === 'conversations' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Conversations ({filteredConversations.length})</h2>
                  <button
                    onClick={() => {
                      setShowConversationForm(true);
                      setConversationForm({ topic: '', dialogue: [{ role: 'you', text: '' }] });
                    }}
                    className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90"
                  >
                    + New Conversation
                  </button>
                </div>

                {showConversationForm && (
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Conversation</h3>
                    <form onSubmit={handleCreateConversation} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Topic</label>
                        <input
                          type="text"
                          value={conversationForm.topic}
                          onChange={(e) => setConversationForm({ ...conversationForm, topic: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          placeholder="e.g., At the restaurant"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">Dialogue Lines</label>
                        {conversationForm.dialogue.map((line, idx) => (
                          <div key={idx} className="flex gap-2 mb-2">
                            <select
                              value={line.role}
                              onChange={(e) => updateDialogueLine(idx, 'role', e.target.value)}
                              className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                            >
                              <option value="you">Partner (You)</option>
                              <option value="me">Student (Me)</option>
                            </select>
                            <input
                              type="text"
                              value={line.text}
                              onChange={(e) => updateDialogueLine(idx, 'text', e.target.value)}
                              className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                              placeholder="Enter line text..."
                            />
                            <button type="button" onClick={() => removeDialogueLine(idx)} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">
                              &times;
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={addDialogueLine} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                          + Add Line
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90">
                          Create
                        </button>
                        <button type="button" onClick={() => setShowConversationForm(false)} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {filteredConversations.map((c) => (
                    <div key={c.id} className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{c.topic}</h3>
                          <p className="text-gray-500 text-sm mt-1">
                            {Object.keys(c.dialogue || {}).length} lines
                          </p>
                        </div>
                        <button onClick={() => handleDeleteConversation(c.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions Tab */}
            {activeTab === 'questions' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Questions ({filteredQuestions.length})</h2>
                  <button
                    onClick={() => {
                      setShowQuestionForm(true);
                      setQuestionForm({ topic_name: '', question_text: '' });
                    }}
                    className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90"
                  >
                    + New Question
                  </button>
                </div>

                {showQuestionForm && (
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Question</h3>
                    <form onSubmit={handleCreateQuestion} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Topic</label>
                        <input
                          type="text"
                          value={questionForm.topic_name}
                          onChange={(e) => setQuestionForm({ ...questionForm, topic_name: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          placeholder="e.g., Travel, Education, Technology"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Question</label>
                        <textarea
                          value={questionForm.question_text}
                          onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          rows="3"
                          placeholder="Enter the question..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:opacity-90">
                          Create
                        </button>
                        <button type="button" onClick={() => setShowQuestionForm(false)} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {filteredQuestions.map((q) => (
                    <div key={q.id} className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded mb-2">
                            {q.topic}
                          </span>
                          <p className="text-gray-900">{q.question}</p>
                        </div>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Topics Tab */}
            {activeTab === 'ai-topics' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">AI Conversation Topics ({filteredAiTopics.length})</h2>
                  <button
                    onClick={() => {
                      setShowAiTopicForm(true);
                      setEditingAiTopicId(null);
                      resetAiTopicForm();
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    + New AI Topic
                  </button>
                </div>

                {showAiTopicForm && (
                  <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {editingAiTopicId ? 'Edit AI Topic' : 'Create New AI Topic'}
                    </h3>
                    <form onSubmit={editingAiTopicId ? handleUpdateAiTopic : handleCreateAiTopic} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Topic Name (English) *</label>
                          <input
                            type="text"
                            value={aiTopicForm.name}
                            onChange={(e) => setAiTopicForm({ ...aiTopicForm, name: e.target.value })}
                            required
                            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                            placeholder="e.g., Travel and Holidays"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Topic Name (Vietnamese)</label>
                          <input
                            type="text"
                            value={aiTopicForm.name_vi}
                            onChange={(e) => setAiTopicForm({ ...aiTopicForm, name_vi: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                            placeholder="e.g., Du lịch và Kỳ nghỉ"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Language *</label>
                          <select
                            value={aiTopicForm.language}
                            onChange={(e) => setAiTopicForm({ ...aiTopicForm, language: e.target.value })}
                            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          >
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                            <option value="zh-CN">Chinese</option>
                            <option value="ja-JP">Japanese</option>
                            <option value="ko-KR">Korean</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                          <select
                            value={aiTopicForm.is_active ? 'active' : 'inactive'}
                            onChange={(e) => setAiTopicForm({ ...aiTopicForm, is_active: e.target.value === 'active' })}
                            className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                        <input
                          type="text"
                          value={aiTopicForm.description}
                          onChange={(e) => setAiTopicForm({ ...aiTopicForm, description: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          placeholder="Brief description of the topic"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Opening Message (AI's First Line) *</label>
                        <textarea
                          value={aiTopicForm.opening_message}
                          onChange={(e) => setAiTopicForm({ ...aiTopicForm, opening_message: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          rows="2"
                          placeholder="e.g., Hi! I'd love to talk about travel with you. Have you been on any exciting trips recently?"
                        />
                        <p className="text-gray-500 text-xs mt-1">This is what the AI will say first when the user selects this topic. Pre-defining this improves UX by avoiding generation delay.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">System Prompt (AI Personality) *</label>
                        <textarea
                          value={aiTopicForm.system_prompt}
                          onChange={(e) => setAiTopicForm({ ...aiTopicForm, system_prompt: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900"
                          rows="4"
                          placeholder="You are a friendly English conversation partner. Help the user practice speaking about travel topics..."
                        />
                        <p className="text-gray-500 text-xs mt-1">Instructions for how the AI should behave during the conversation.</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          {editingAiTopicId ? 'Update' : 'Create'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAiTopicForm(false);
                            setEditingAiTopicId(null);
                            resetAiTopicForm();
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {filteredAiTopics.map((topic) => (
                    <div key={topic.id} className={`bg-white shadow-sm rounded-xl p-4 border ${topic.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-bold text-gray-900">{topic.name}</h3>
                            {topic.name_vi && <span className="text-gray-500">({topic.name_vi})</span>}
                            <span className={`px-2 py-0.5 text-xs rounded ${topic.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                              {topic.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-600">
                              {topic.language}
                            </span>
                          </div>
                          {topic.description && <p className="text-gray-500 text-sm mb-2">{topic.description}</p>}
                          <div className="bg-gray-50 rounded-lg p-3 mb-2">
                            <p className="text-xs text-gray-500 mb-1">Opening Message:</p>
                            <p className="text-gray-700 text-sm italic">"{topic.opening_message}"</p>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleToggleAiTopicActive(topic)}
                            className={`px-3 py-1 rounded text-sm ${topic.is_active ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
                          >
                            {topic.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => {
                              setAiTopicForm({
                                name: topic.name,
                                name_vi: topic.name_vi || '',
                                description: topic.description || '',
                                system_prompt: topic.system_prompt,
                                opening_message: topic.opening_message,
                                language: topic.language,
                                is_active: topic.is_active
                              });
                              setEditingAiTopicId(topic.id);
                              setShowAiTopicForm(true);
                            }}
                            className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 text-sm"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredAiTopics.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <p>No AI topics yet. Create one to get started!</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Statistics Tab */}
            {activeTab === 'statistics' && (
              <AdminProgress onBack={() => setActiveTab('users')} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
