import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

function AdminDashboard() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Class form state
  const [showClassForm, setShowClassForm] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', description: '', teacher_id: '' });
  const [editingClassId, setEditingClassId] = useState(null);

  // Conversation form state
  const [showConversationForm, setShowConversationForm] = useState(false);
  const [conversationForm, setConversationForm] = useState({ topic: '', dialogue: [] });
  const [editingConversationId, setEditingConversationId] = useState(null);

  // Question form state
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionForm, setQuestionForm] = useState({ topic_name: '', question_text: '' });
  const [editingQuestionId, setEditingQuestionId] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'users') {
        const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() });
        setUsers(res.data.users || []);
      } else if (activeTab === 'classes') {
        const [classRes, teacherRes] = await Promise.all([
          axios.get('/api/classes', { headers: getAuthHeaders() }),
          axios.get('/api/admin/teachers', { headers: getAuthHeaders() })
        ]);
        setClasses(classRes.data.classes || []);
        setTeachers(teacherRes.data.teachers || []);
      } else if (activeTab === 'conversations') {
        const res = await axios.get('/api/conversations', { headers: getAuthHeaders() });
        setConversations(res.data.conversations || []);
      } else if (activeTab === 'questions') {
        const res = await axios.get('/api/questions', { headers: getAuthHeaders() });
        setQuestions(res.data.questions || []);
      }
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Class management
  const handleCreateClass = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('/api/classes', classForm, { headers: getAuthHeaders() });
      setSuccess('Class created successfully');
      setShowClassForm(false);
      setClassForm({ name: '', description: '', teacher_id: '' });
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
      setClassForm({ name: '', description: '', teacher_id: '' });
      setEditingClassId(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update class');
    }
  };

  const handleDeleteClass = async (classId) => {
    if (!confirm('Are you sure you want to delete this class?')) return;
    try {
      await axios.delete(`/api/classes/${classId}`, { headers: getAuthHeaders() });
      setSuccess('Class deleted successfully');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete class');
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

  const addDialogueLine = () => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: [...prev.dialogue, { role: 'you', text: '' }]
    }));
  };

  const updateDialogueLine = (index, field, value) => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      )
    }));
  };

  const removeDialogueLine = (index) => {
    setConversationForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Admin Dashboard</h1>
            <p className="text-slate-400">Manage users, classes, and content</p>
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

        {/* Tabs */}
        <div className="flex mb-6 bg-slate-800/50 backdrop-blur-sm rounded-xl p-1">
          {['users', 'classes', 'conversations', 'questions'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-xl">
            {success}
            <button onClick={() => setSuccess('')} className="float-right">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                <h2 className="text-xl font-bold text-white mb-4">All Users ({users.length})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-3 pr-4">Username</th>
                        <th className="pb-3 pr-4">Email</th>
                        <th className="pb-3 pr-4">Role</th>
                        <th className="pb-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-slate-700/50">
                          <td className="py-3 pr-4 text-white">{u.username}</td>
                          <td className="py-3 pr-4 text-slate-300">{u.email}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              u.role === 'admin' ? 'bg-purple-500/20 text-purple-300' :
                              u.role === 'teacher' ? 'bg-blue-500/20 text-blue-300' :
                              'bg-green-500/20 text-green-300'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 text-sm">
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
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Classes ({classes.length})</h2>
                  <button
                    onClick={() => {
                      setShowClassForm(true);
                      setEditingClassId(null);
                      setClassForm({ name: '', description: '', teacher_id: '' });
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90 transition"
                  >
                    + New Class
                  </button>
                </div>

                {showClassForm && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h3 className="text-lg font-bold text-white mb-4">
                      {editingClassId ? 'Edit Class' : 'Create New Class'}
                    </h3>
                    <form onSubmit={editingClassId ? handleUpdateClass : handleCreateClass} className="space-y-4">
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
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Teacher</label>
                        <select
                          value={classForm.teacher_id}
                          onChange={(e) => setClassForm({ ...classForm, teacher_id: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                        >
                          <option value="">Select a teacher</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.username} ({t.email})</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90"
                        >
                          {editingClassId ? 'Update' : 'Create'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowClassForm(false)}
                          className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {classes.map((c) => (
                    <div key={c.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white">{c.name}</h3>
                          <p className="text-slate-400 text-sm">{c.description || 'No description'}</p>
                          <p className="text-cyan-400 text-sm mt-1">Teacher: {c.teacher_name}</p>
                          <p className="text-slate-500 text-sm">{c.student_count} students</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setClassForm({ name: c.name, description: c.description || '', teacher_id: c.teacher_id });
                              setEditingClassId(c.id);
                              setShowClassForm(true);
                            }}
                            className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClass(c.id)}
                            className="px-3 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversations Tab */}
            {activeTab === 'conversations' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Conversations ({conversations.length})</h2>
                  <button
                    onClick={() => {
                      setShowConversationForm(true);
                      setConversationForm({ topic: '', dialogue: [{ role: 'you', text: '' }] });
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90"
                  >
                    + New Conversation
                  </button>
                </div>

                {showConversationForm && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h3 className="text-lg font-bold text-white mb-4">Create New Conversation</h3>
                    <form onSubmit={handleCreateConversation} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Topic</label>
                        <input
                          type="text"
                          value={conversationForm.topic}
                          onChange={(e) => setConversationForm({ ...conversationForm, topic: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          placeholder="e.g., At the restaurant"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Dialogue Lines</label>
                        {conversationForm.dialogue.map((line, idx) => (
                          <div key={idx} className="flex gap-2 mb-2">
                            <select
                              value={line.role}
                              onChange={(e) => updateDialogueLine(idx, 'role', e.target.value)}
                              className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                            >
                              <option value="you">Partner (You)</option>
                              <option value="me">Student (Me)</option>
                            </select>
                            <input
                              type="text"
                              value={line.text}
                              onChange={(e) => updateDialogueLine(idx, 'text', e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                              placeholder="Enter line text..."
                            />
                            <button
                              type="button"
                              onClick={() => removeDialogueLine(idx)}
                              className="px-3 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addDialogueLine}
                          className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600"
                        >
                          + Add Line
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConversationForm(false)}
                          className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {conversations.map((c) => (
                    <div key={c.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white">{c.topic}</h3>
                          <p className="text-slate-400 text-sm mt-1">
                            {Object.keys(c.dialogue || {}).length} lines
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteConversation(c.id)}
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

            {/* Questions Tab */}
            {activeTab === 'questions' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Questions ({questions.length})</h2>
                  <button
                    onClick={() => {
                      setShowQuestionForm(true);
                      setQuestionForm({ topic_name: '', question_text: '' });
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90"
                  >
                    + New Question
                  </button>
                </div>

                {showQuestionForm && (
                  <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h3 className="text-lg font-bold text-white mb-4">Create New Question</h3>
                    <form onSubmit={handleCreateQuestion} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Topic</label>
                        <input
                          type="text"
                          value={questionForm.topic_name}
                          onChange={(e) => setQuestionForm({ ...questionForm, topic_name: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          placeholder="e.g., Travel, Education, Technology"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Question</label>
                        <textarea
                          value={questionForm.question_text}
                          onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                          required
                          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                          rows="3"
                          placeholder="Enter the question..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:opacity-90"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowQuestionForm(false)}
                          className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="grid gap-4">
                  {questions.map((q) => (
                    <div key={q.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="inline-block px-2 py-1 bg-cyan-500/20 text-cyan-300 text-xs rounded mb-2">
                            {q.topic}
                          </span>
                          <p className="text-white">{q.question}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
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
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
