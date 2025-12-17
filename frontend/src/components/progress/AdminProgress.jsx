import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const API_BASE = 'http://localhost:8001';

function AdminProgress({ onBack }) {
  const { getAuthHeaders } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/progress/admin/stats`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch admin stats');
      const result = await res.json();
      setStats(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getBandColorClass = (band) => {
    if (band === null || band === undefined) return 'text-gray-500';
    if (band >= 7.0) return 'text-emerald-600';
    if (band >= 5.5) return 'text-blue-600';
    if (band >= 4.0) return 'text-amber-600';
    return 'text-red-600';
  };

  // Prepare activity chart data
  const activityData = [];
  if (stats?.daily_activity) {
    // Combine practice and submissions by date
    const dateMap = new Map();

    stats.daily_activity.practice?.forEach(d => {
      if (!dateMap.has(d.date)) {
        dateMap.set(d.date, { date: d.date, practice: 0, submissions: 0 });
      }
      dateMap.get(d.date).practice = d.count;
    });

    stats.daily_activity.submissions?.forEach(d => {
      if (!dateMap.has(d.date)) {
        dateMap.set(d.date, { date: d.date, practice: 0, submissions: 0 });
      }
      dateMap.get(d.date).submissions = d.count;
    });

    // Sort by date and format
    [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, data]) => {
        activityData.push({
          ...data,
          displayDate: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        });
      });
  }

  // Prepare user distribution pie chart data
  const userDistribution = stats?.users ? [
    { name: 'Students', value: stats.users.students, color: '#3b82f6' },
    { name: 'Teachers', value: stats.users.teachers, color: '#3bf68cff' },
    { name: 'Admins', value: stats.users.admins, color: '#f59e0b' }
  ].filter(d => d.value > 0) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600">
            Error loading stats: {error}
          </div>
        </div>
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

        <h1 className="text-3xl font-bold text-gray-900 mb-6">System Statistics</h1>

        {/* User Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Total Users</p>
            <p className="text-3xl font-bold text-gray-900">{stats?.users?.total || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Students</p>
            <p className="text-3xl font-bold text-blue-600">{stats?.users?.students || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Teachers</p>
            <p className="text-3xl font-bold text-blue-600">{stats?.users?.teachers || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">System Avg Band</p>
            <p className={`text-3xl font-bold ${getBandColorClass(stats?.average_overall_band)}`}>
              {stats?.average_overall_band?.toFixed(1) || '--'}
            </p>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Practice Sessions</p>
            <p className="text-3xl font-bold text-emerald-600">{stats?.activity?.total_practice_sessions || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Assignments</p>
            <p className="text-3xl font-bold text-amber-600">{stats?.activity?.total_assignments || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Submissions</p>
            <p className="text-3xl font-bold text-blue-600">{stats?.activity?.total_submissions || 0}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
            <p className="text-gray-500 text-sm">Classes</p>
            <p className="text-3xl font-bold text-pink-600">{stats?.activity?.total_classes || 0}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Activity Chart */}
          {activityData.length > 0 && (
            <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Daily Activity (Last 30 Days)</h2>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="displayDate" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="practice"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Practice"
                  />
                  <Area
                    type="monotone"
                    dataKey="submissions"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Submissions"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* User Distribution Pie Chart */}
          {userDistribution.length > 0 && (
            <div className="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">User Distribution</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={userDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {userDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* No Activity Message */}
        {activityData.length === 0 && userDistribution.length === 0 && (
          <div className="bg-white shadow-sm rounded-xl p-12 border border-gray-200 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Activity Data</h3>
            <p className="text-gray-500">There's no activity data to display yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminProgress;
