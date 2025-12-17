import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar
} from 'recharts';

const API_BASE = 'http://localhost:8001';

function StudentProgress({ onBack, studentData = null }) {
  const { getAuthHeaders, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // If studentData is passed, we're viewing as teacher
  const isTeacherView = !!studentData;

  useEffect(() => {
    if (studentData) {
      setData(studentData);
      setLoading(false);
    } else {
      fetchProgress();
    }
  }, [studentData]);

  const fetchProgress = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/progress/student`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch progress');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Color functions matching IELTSScore.jsx
  const getBandColor = (band) => {
    if (band === null || band === undefined) return '#64748b';
    if (band >= 7.0) return '#059669';  // emerald-600
    if (band >= 5.5) return '#2563eb';  // blue-600
    if (band >= 4.0) return '#d97706';  // amber-600
    return '#dc2626';                    // red-600
  };

  const getBandColorClass = (band) => {
    if (band === null || band === undefined) return 'text-gray-500';
    if (band >= 7.0) return 'text-emerald-600';
    if (band >= 5.5) return 'text-blue-600';
    if (band >= 4.0) return 'text-amber-600';
    return 'text-red-600';
  };

  const getCEFRLevel = (band) => {
    if (!band) return '--';
    if (band >= 8.5) return 'C2';
    if (band >= 7.0) return 'C1';
    if (band >= 5.5) return 'B2';
    if (band >= 4.0) return 'B1';
    if (band >= 3.0) return 'A2';
    return 'A1';
  };

  // Transform data for line chart (oldest first for proper trend)
  const chartData = data?.results?.slice().reverse().map(r => ({
    date: r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '',
    fullDate: r.date ? new Date(r.date).toLocaleString() : '',
    type: r.type,
    overall: r.scores?.overall_band,
    pronunciation: r.scores?.pronunciation,
    fluency: r.scores?.fluency,
    coherence: r.scores?.coherence,
    lexical: r.scores?.lexical_resource,
    grammar: r.scores?.grammatical_range_accuracy
  })).filter(r => r.overall !== null && r.overall !== undefined) || [];

  // Transform data for radar chart (averages)
  const radarData = data?.averages ? [
    { skill: 'Pronunciation', value: data.averages.pronunciation || 0, fullMark: 9 },
    { skill: 'Fluency', value: data.averages.fluency || 0, fullMark: 9 },
    { skill: 'Coherence', value: data.averages.coherence || 0, fullMark: 9 },
    { skill: 'Vocabulary', value: data.averages.lexical_resource || 0, fullMark: 9 },
    { skill: 'Grammar', value: data.averages.grammatical_range_accuracy || 0, fullMark: 9 },
    { skill: 'Understanding', value: data.averages.understanding || 0, fullMark: 9 }
  ].filter(d => d.value > 0) : [];

  // Custom tooltip for line chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0]?.payload;
      return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 shadow-xl">
          <p className="text-gray-600 text-sm mb-2">{item?.fullDate}</p>
          <p className="text-xs text-gray-500 mb-2">Type: {item?.type}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value?.toFixed(1) || '--'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center" style={{ minHeight: '50vh' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="container mx-auto max-w-6xl">
          {onBack && (
            <button onClick={onBack} className="mb-4 text-blue-600 hover:text-blue-500 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600">
            Error loading progress: {error}
          </div>
        </div>
      </div>
    );
  }

  const totalSessions = (data?.total_practice || 0) + (data?.total_assignments || 0);

  return (
    <div className="p-4">
      <div className="container mx-auto max-w-6xl">
        {onBack && (
          <button onClick={onBack} className="mb-4 text-blue-600 hover:text-blue-500 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isTeacherView ? `Progress: ${studentData?.student?.username}` : 'My Progress'}
        </h1>
        {isTeacherView && studentData?.student?.email && (
          <p className="text-gray-500 mb-6">{studentData.student.email}</p>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Total Sessions</p>
            <p className="text-3xl font-bold text-gray-900">{totalSessions}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Average Band</p>
            <p className={`text-3xl font-bold ${getBandColorClass(data?.averages?.overall_band)}`}>
              {data?.averages?.overall_band?.toFixed(1) || '--'}
            </p>
            <p className="text-xs text-gray-400 mt-1">{getCEFRLevel(data?.averages?.overall_band)}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Practice Sessions</p>
            <p className="text-3xl font-bold text-blue-600">{data?.total_practice || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Assignments</p>
            <p className="text-3xl font-bold text-blue-600">{data?.total_assignments || 0}</p>
          </div>
        </div>

        {chartData.length > 0 ? (
          <>
            {/* Score Trend Chart */}
            <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Score Trends</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 9]} stroke="#94a3b8" ticks={[0, 3, 5, 7, 9]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Line type="monotone" dataKey="overall" stroke="#34d399" name="Overall" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pronunciation" stroke="#f472b6" name="Pronunciation" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="fluency" stroke="#60a5fa" name="Fluency" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="grammar" stroke="#fbbf24" name="Grammar" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Skill Radar Chart */}
            {radarData.length > 0 && (
              <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Skill Overview (Averages)</h2>
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="skill" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 9]} tick={{ fill: '#94a3b8' }} tickCount={4} />
                    <Radar
                      name="Average Score"
                      dataKey="value"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white shadow-sm rounded-xl p-12 border border-gray-200 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Data Yet</h3>
            <p className="text-gray-500">Complete some practice sessions or assignments to see your progress here.</p>
          </div>
        )}

        {/* Recent Results */}
        {data?.results?.length > 0 && (
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Results</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-gray-500 text-sm border-b border-gray-200">
                    <th className="text-left py-3 px-2">Date</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-center py-3 px-2">Overall</th>
                    <th className="text-center py-3 px-2">Pronunciation</th>
                    <th className="text-center py-3 px-2">Fluency</th>
                    <th className="text-center py-3 px-2">Grammar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.slice(0, 10).map((r, i) => (
                    <tr key={r.id || i} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-3 px-2 text-gray-600 text-sm">
                        {r.date ? new Date(r.date).toLocaleDateString('en-GB') : '--'}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          r.type === 'assignment'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {r.type}
                        </span>
                      </td>
                      <td className={`py-3 px-2 text-center font-semibold ${getBandColorClass(r.scores?.overall_band)}`}>
                        {r.scores?.overall_band?.toFixed(1) || '--'}
                      </td>
                      <td className={`py-3 px-2 text-center ${getBandColorClass(r.scores?.pronunciation)}`}>
                        {r.scores?.pronunciation?.toFixed(1) || '--'}
                      </td>
                      <td className={`py-3 px-2 text-center ${getBandColorClass(r.scores?.fluency)}`}>
                        {r.scores?.fluency?.toFixed(1) || '--'}
                      </td>
                      <td className={`py-3 px-2 text-center ${getBandColorClass(r.scores?.grammatical_range_accuracy)}`}>
                        {r.scores?.grammatical_range_accuracy?.toFixed(1) || '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentProgress;
