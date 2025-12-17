import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line
} from 'recharts';
import StudentProgress from './StudentProgress';

const API_BASE = 'http://localhost:8001';

function TeacherClassProgress({ onBack }) {
  const { getAuthHeaders, user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classProgress, setClassProgress] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchClassProgress(selectedClass);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/classes`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch classes');
      const result = await res.json();
      setClasses(result.classes || []);
      if (result.classes?.length > 0) {
        setSelectedClass(result.classes[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassProgress = async (classId) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/progress/teacher/class/${classId}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch class progress');
      const result = await res.json();
      setClassProgress(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetail = async (studentId) => {
    try {
      const res = await fetch(`${API_BASE}/api/progress/teacher/student/${studentId}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch student progress');
      const result = await res.json();
      setStudentDetail(result);
      setSelectedStudent(studentId);
    } catch (err) {
      setError(err.message);
    }
  };

  const getBandColorClass = (band) => {
    if (band === null || band === undefined) return 'text-gray-500';
    if (band >= 7.0) return 'text-emerald-600';
    if (band >= 5.5) return 'text-blue-600';
    if (band >= 4.0) return 'text-amber-600';
    return 'text-red-600';
  };

  const getBandColor = (band) => {
    if (band === null || band === undefined) return '#64748b';
    if (band >= 7.0) return '#059669';  // emerald-600
    if (band >= 5.5) return '#2563eb';  // blue-600
    if (band >= 4.0) return '#d97706';  // amber-600
    return '#dc2626';                    // red-600
  };

  // If viewing individual student detail
  if (selectedStudent && studentDetail) {
    return (
      <StudentProgress
        onBack={() => {
          setSelectedStudent(null);
          setStudentDetail(null);
        }}
        studentData={studentDetail}
      />
    );
  }

  // Prepare data for bar chart (student comparison)
  const barChartData = classProgress?.students?.map(s => ({
    name: s.student_name?.length > 10 ? s.student_name.substring(0, 10) + '...' : s.student_name,
    fullName: s.student_name,
    average: s.average_band || 0,
    submissions: s.submission_count,
    fill: getBandColor(s.average_band)
  })) || [];

  // Custom tooltip for bar chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 shadow-xl">
          <p className="text-gray-900 font-semibold">{data.fullName}</p>
          <p className="text-gray-600 text-sm">Average: {data.average?.toFixed(1) || '--'}</p>
          <p className="text-gray-500 text-xs">Submissions: {data.submissions}</p>
        </div>
      );
    }
    return null;
  };

  if (loading && !classProgress) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container mx-auto max-w-6xl">
        {onBack && (
          <button onClick={onBack} className="mb-4 text-blue-600 hover:text-blue-500 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        <h1 className="text-3xl font-bold text-gray-900 mb-6">Class Progress</h1>

        {/* Class Selector */}
        {classes.length > 0 && (
          <div className="mb-6">
            <label className="text-gray-500 text-sm mb-2 block">Select Class</label>
            <select
              value={selectedClass || ''}
              onChange={(e) => setSelectedClass(Number(e.target.value))}
              className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-blue-600"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-600">
            {error}
          </div>
        )}

        {classProgress && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Class Name</p>
                <p className="text-2xl font-bold text-gray-900">{classProgress.class_name}</p>
              </div>
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Total Students</p>
                <p className="text-3xl font-bold text-blue-600">{classProgress.total_students}</p>
              </div>
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
                <p className="text-gray-500 text-sm">Class Average</p>
                <p className={`text-3xl font-bold ${getBandColorClass(
                  classProgress.students?.reduce((sum, s) => sum + (s.average_band || 0), 0) /
                  (classProgress.students?.filter(s => s.average_band).length || 1)
                )}`}>
                  {(classProgress.students?.reduce((sum, s) => sum + (s.average_band || 0), 0) /
                    (classProgress.students?.filter(s => s.average_band).length || 1)).toFixed(1) || '--'}
                </p>
              </div>
            </div>

            {/* Student Comparison Bar Chart */}
            {barChartData.length > 0 && (
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Student Comparison</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" domain={[0, 9]} stroke="#94a3b8" ticks={[0, 3, 5, 7, 9]} />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="average" name="Average Band" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Student List */}
            <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Students</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-gray-500 text-sm border-b border-gray-200">
                      <th className="text-left py-3 px-2">Student</th>
                      <th className="text-center py-3 px-2">Submissions</th>
                      <th className="text-center py-3 px-2">Average Band</th>
                      <th className="text-center py-3 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classProgress.students?.map(student => (
                      <tr key={student.student_id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <p className="text-gray-900 font-medium">{student.student_name}</p>
                          <p className="text-gray-400 text-xs">{student.student_email}</p>
                        </td>
                        <td className="py-3 px-2 text-center text-gray-600">
                          {student.submission_count}
                        </td>
                        <td className={`py-3 px-2 text-center font-semibold ${getBandColorClass(student.average_band)}`}>
                          {student.average_band?.toFixed(1) || '--'}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => fetchStudentDetail(student.student_id)}
                            className="text-blue-600 hover:text-blue-500 text-sm underline"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                    {classProgress.students?.length === 0 && (
                      <tr>
                        <td colSpan="4" className="py-8 text-center text-gray-400">
                          No students in this class yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {classes.length === 0 && !loading && (
          <div className="bg-white shadow-sm rounded-xl p-12 border border-gray-200 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Classes</h3>
            <p className="text-gray-500">You don't have any classes assigned yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherClassProgress;
