import { useAuth } from '../../context/AuthContext';
import StudentProgress from './StudentProgress';
import TeacherClassProgress from './TeacherClassProgress';
import AdminProgress from './AdminProgress';

function ProgressDashboard({ onBack }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Please log in to view progress</p>
      </div>
    );
  }

  if (user.role === 'admin') {
    return <AdminProgress onBack={onBack} />;
  }

  if (user.role === 'teacher') {
    return <TeacherClassProgress onBack={onBack} />;
  }

  // Default to student view (also works for students)
  return <StudentProgress onBack={onBack} />;
}

export default ProgressDashboard;
