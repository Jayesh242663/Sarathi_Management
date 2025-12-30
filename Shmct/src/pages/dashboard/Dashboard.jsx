import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  IndianRupee, 
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Clock,
  BookOpen,
  CheckCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { useStudents } from '../../context/StudentContext';
import { formatCurrency, formatDate, getInitials, getRelativeTime } from '../../utils/formatters';
import { COURSES, PAYMENT_METHODS } from '../../utils/constants';
import './Dashboard.css';

const Dashboard = () => {
  const { getStats, getFilteredStudents, getFilteredPayments, currentBatch } = useStudents();
  const stats = getStats();
  
  // Get filtered data based on current batch
  const students = getFilteredStudents();
  const payments = getFilteredPayments();

  // Chart data

  // Show revenue for the whole current year, one entry per month
  const monthlyRevenueData = useMemo(() => {
    const months = [];
    const now = new Date();
    const year = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const date = new Date(year, m, 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;

      const monthPayments = payments.filter((p) => p.paymentDate.startsWith(monthKey));
      const total = monthPayments.reduce((sum, p) => sum + p.amount, 0);

      months.push({
        name: monthName,
        revenue: total,
      });
    }
    return months;
  }, [payments]);

  const courseDistribution = useMemo(() => {
    const courseCount = {};
    students.forEach((student) => {
      const courseName = COURSES.find((c) => c.value === student.course)?.label || student.course;
      courseCount[courseName] = (courseCount[courseName] || 0) + 1;
    });
    
    return Object.entries(courseCount).map(([name, value]) => ({
      name: name.replace('Certificate in ', '').replace('Diploma in ', '').replace('B.Sc in ', ''),
      value,
    }));
  }, [students]);

  const feeStatusData = useMemo(() => {
    let paid = 0, partial = 0, pending = 0;
    
    students.forEach((student) => {
      const studentPayments = payments.filter((p) => p.studentId === student.id);
      const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = student.totalFees - totalPaid;
      
      if (remaining <= 0) paid++;
      else if (totalPaid > 0) partial++;
      else pending++;
    });
    
    return [
      { name: 'Paid', value: paid, color: '#22c55e' },
      { name: 'Partial', value: partial, color: '#f59e0b' },
      { name: 'Pending', value: pending, color: '#ef4444' },
    ];
  }, [students, payments]);

  // Recent activities
  const recentActivities = useMemo(() => {
    const activities = [];
    
    // Add recent payments
    payments.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).forEach((payment) => {
      const student = students.find((s) => s.id === payment.studentId);
      if (student) {
        activities.push({
          id: payment.id,
          type: 'payment',
          title: `${student.firstName} ${student.lastName}`,
          description: `Paid ${formatCurrency(payment.amount)}`,
          time: payment.createdAt,
          icon: IndianRupee,
          iconBg: 'bg-green-500/10',
          iconColor: 'text-green-400',
        });
      }
    });
    
    // Add recent enrollments
    students.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).forEach((student) => {
      activities.push({
        id: student.id,
        type: 'enrollment',
        title: `${student.firstName} ${student.lastName}`,
        description: 'New student enrolled',
        time: student.createdAt,
        icon: UserPlus,
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-400',
      });
    });
    
    return activities.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
  }, [students, payments]);

  // Students with pending fees
  const pendingFeeStudents = useMemo(() => {
    return students
      .map((student) => {
        const studentPayments = payments.filter((p) => p.studentId === student.id);
        const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
        const remaining = student.totalFees - totalPaid;
        return { ...student, remaining };
      })
      .filter((s) => s.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 5);
  }, [students, payments]);

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          {currentBatch === 'all' 
            ? "Showing data for all batches" 
            : `Batch ${currentBatch} Overview`}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon blue">
              <Users />
            </div>
            <div className="stat-info">
              <p className="stat-label">Total Students</p>
              <p className="stat-value">{stats.totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon green">
              <IndianRupee />
            </div>
            <div className="stat-info">
              <p className="stat-label">Total Revenue</p>
              <p className="stat-value green">{formatCurrency(stats.totalRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon red">
              <AlertCircle />
            </div>
            <div className="stat-info">
              <p className="stat-label">Pending Fees</p>
              <p className="stat-value red">{formatCurrency(stats.pendingFees)}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon purple">
              <CheckCircle />
            </div>
            <div className="stat-info">
              <p className="stat-label">Active Students</p>
              <p className="stat-value purple">{stats.activeStudents}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        {/* Revenue Chart */}
        <div className="chart-card">
          <h3 className="chart-title">Revenue Overview</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyRevenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="name" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fee Status Pie Chart */}
        <div className="chart-card">
          <h3 className="chart-title">Fee Collection Status</h3>
          <div className="chart-container chart-container-centered">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={feeStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#666' }}
                >
                  {feeStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {feeStatusData.map((item) => (
              <div key={item.name} className="legend-item">
                <div className="legend-dot" style={{ backgroundColor: item.color }} />
                <span className="legend-text">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Course Distribution */}
      {courseDistribution.length > 0 && (
        <div className="chart-card chart-card-full">
          <h3 className="chart-title">Students by Course</h3>
          <div className="chart-container chart-container-sm">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={courseDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis type="number" stroke="#666" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#666" fontSize={12} width={150} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom Row */}
      <div className="bottom-grid">
        {/* Recent Activity */}
        <div className="section-card">
          <div className="section-header">
            <h3 className="section-title">
              <Clock className="blue" />
              Recent Activity
            </h3>
          </div>
          
          <div className="activity-list">
            {recentActivities.length === 0 ? (
              <div className="empty-state">
                <p>No recent activity</p>
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={`${activity.type}-${activity.id}`} className="activity-item">
                  <div className={`activity-icon ${activity.type === 'payment' ? 'green' : 'blue'}`}>
                    <activity.icon />
                  </div>
                  <div className="activity-content">
                    <p className="activity-title">{activity.title}</p>
                    <p className="activity-description">{activity.description}</p>
                  </div>
                  <span className="activity-time">
                    {getRelativeTime(activity.time)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Fees Alert */}
        <div className="section-card">
          <div className="section-header">
            <h3 className="section-title">
              <AlertCircle className="red" />
              Pending Fee Alerts
            </h3>
            <Link to="/fees" className="section-link">
              View All
            </Link>
          </div>
          
          <div className="pending-list">
            {pendingFeeStudents.length === 0 ? (
              <div className="empty-state">
                <CheckCircle className="green" />
                <p>All fees collected! 🎉</p>
              </div>
            ) : (
              pendingFeeStudents.map((student) => (
                <Link
                  key={student.id}
                  to={`/students/${student.id}`}
                  className="pending-item"
                >
                  <div className="pending-avatar">
                    {getInitials(`${student.firstName} ${student.lastName}`)}
                  </div>
                  <div className="pending-info">
                    <p className="pending-name">
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="pending-id">{student.enrollmentNumber}</p>
                  </div>
                  <div className="pending-amount">
                    <p className="pending-value">{formatCurrency(student.remaining)}</p>
                    <p className="pending-label">pending</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
