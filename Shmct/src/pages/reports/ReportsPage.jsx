import { useMemo, useState } from 'react';
import { 
  FileText, 
  Download, 
  Calendar,
  IndianRupee,
  Users,
  TrendingUp,
  Filter,
  Printer
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { useStudents } from '../../context/StudentContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { COURSES, PAYMENT_METHODS } from '../../utils/constants';
import './ReportsPage.css';

const ReportsPage = () => {
  const { getFilteredStudents, getFilteredPayments, currentBatch } = useStudents();
  
  // Get filtered data based on current batch
  const students = getFilteredStudents();
  const payments = getFilteredPayments();
  
  const [dateRange, setDateRange] = useState('all');
  const [reportType, setReportType] = useState('overview');

  // Compute start date for selected range (null = all time)
  const rangeStartDate = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'week':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      case 'month':
        return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case 'quarter':
        return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      case 'year':
        return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      default:
        return null;
    }
  }, [dateRange]);

  // Filter payments by date range
  const filteredPayments = useMemo(() => {
    if (!rangeStartDate) return payments;
    return payments.filter((p) => new Date(p.paymentDate) >= rangeStartDate);
  }, [payments, rangeStartDate]);

  // Stats
  const stats = useMemo(() => {
    const totalCollected = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPayments = filteredPayments.length;
    const avgPayment = totalPayments > 0 ? Math.round(totalCollected / totalPayments) : 0;
    
    const methodBreakdown = {};
    filteredPayments.forEach((p) => {
      if (p.paymentMethod && p.amount) {
        methodBreakdown[p.paymentMethod] = (methodBreakdown[p.paymentMethod] || 0) + p.amount;
      }
    });

    return { totalCollected, totalPayments, avgPayment, methodBreakdown };
  }, [filteredPayments]);

  // Monthly trend data
  const monthlyTrend = useMemo(() => {
    const months = [];
    const start = new Date(rangeStartDate || new Date());
    // Default to 12 months when no range selected
    if (!rangeStartDate) {
      start.setMonth(start.getMonth() - 11);
    }
    start.setDate(1);

    const end = new Date();
    end.setDate(1);

    const cursor = new Date(start);
    while (cursor <= end) {
      const monthName = cursor.toLocaleString('default', { month: 'short' });
      const year = cursor.getFullYear();
      const monthKey = `${year}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

      const monthPayments = filteredPayments.filter(
        (p) => p.paymentDate && p.paymentDate.startsWith(monthKey)
      );
      const total = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const count = monthPayments.length;

      // Count new students this month (respecting range start if set)
      const newStudents = students.filter((s) => {
        if (!s.admissionDate) return false;
        const inMonth = s.admissionDate.startsWith(monthKey);
        if (!rangeStartDate) return inMonth;
        return inMonth && new Date(s.admissionDate) >= rangeStartDate;
      }).length;

      months.push({
        name: `${monthName} ${year.toString().slice(-2)}`,
        revenue: total,
        payments: count,
        enrollments: newStudents,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }, [filteredPayments, students, rangeStartDate]);

  const revenueTrendTitle = useMemo(() => {
    switch (dateRange) {
      case 'week':
        return 'Revenue Trend (Last 7 Days)';
      case 'month':
        return 'Revenue Trend (Last Month)';
      case 'quarter':
        return 'Revenue Trend (Last Quarter)';
      case 'year':
        return 'Revenue Trend (Last Year)';
      default:
        return 'Revenue Trend (12 Months)';
    }
  }, [dateRange]);

  // Payment method breakdown for chart
  const paymentMethodData = useMemo(() => {
    return Object.entries(stats.methodBreakdown).map(([method, amount]) => ({
      name: PAYMENT_METHODS.find((m) => m.value === method)?.label || method,
      amount,
    }));
  }, [stats.methodBreakdown]);

  // Course-wise fee collection
  const courseWiseCollection = useMemo(() => {
    const courseData = {};
    
    students.forEach((student) => {
      const courseName = COURSES.find((c) => c.value === student.course)?.label || student.course;
      const studentPayments = payments.filter((p) => p.studentId === student.id);
      const collected = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      if (!courseData[courseName]) {
        courseData[courseName] = { 
          name: courseName, 
          totalFees: 0, 
          collected: 0, 
          pending: 0,
          students: 0 
        };
      }
      courseData[courseName].totalFees += (student.totalFees || 0);
      courseData[courseName].collected += collected;
      courseData[courseName].pending += Math.max(0, (student.totalFees || 0) - collected);
      courseData[courseName].students += 1;
    });
    
    return Object.values(courseData).map(course => ({
      ...course,
      percentage: course.totalFees > 0 ? Math.round((course.collected / course.totalFees) * 100) : 0,
    }));
  }, [students, payments]);

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-header">
        <div className="reports-header-text">
          <h1>Reports & Analytics</h1>
          <p>
            {currentBatch === 'all' 
              ? "Showing reports for all batches" 
              : `Batch ${currentBatch} Analytics`}
          </p>
        </div>
        <div className="reports-header-actions">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="reports-filter-select"
          >
            <option value="all">All Time</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
          </select>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="reports-stats-grid">
        <div className="reports-stat-card">
          <div className="reports-stat-content">
            <div className="reports-stat-icon green">
              <IndianRupee />
            </div>
            <div className="reports-stat-info">
              <p className="reports-stat-label">Total Collected</p>
              <p className="reports-stat-value green">{formatCurrency(stats.totalCollected)}</p>
            </div>
          </div>
        </div>

        <div className="reports-stat-card">
          <div className="reports-stat-content">
            <div className="reports-stat-icon blue">
              <FileText />
            </div>
            <div className="reports-stat-info">
              <p className="reports-stat-label">Total Payments</p>
              <p className="reports-stat-value blue">{stats.totalPayments}</p>
            </div>
          </div>
        </div>

        <div className="reports-stat-card">
          <div className="reports-stat-content">
            <div className="reports-stat-icon purple">
              <TrendingUp />
            </div>
            <div className="reports-stat-info">
              <p className="reports-stat-label">Avg. Payment</p>
              <p className="reports-stat-value purple">{formatCurrency(stats.avgPayment)}</p>
            </div>
          </div>
        </div>

        <div className="reports-stat-card">
          <div className="reports-stat-content">
            <div className="reports-stat-icon yellow">
              <Users />
            </div>
            <div className="reports-stat-info">
              <p className="reports-stat-label">Total Students</p>
              <p className="reports-stat-value yellow">{students.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="reports-charts-grid">
        {/* Revenue Trend */}
        <div className="reports-chart-card">
          <h3 className="reports-chart-title">{revenueTrendTitle}</h3>
          <div className="reports-chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="name" stroke="#666" fontSize={10} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'revenue' ? formatCurrency(value) : value,
                    name === 'revenue' ? 'Revenue' : name === 'payments' ? 'Payments' : 'Enrollments'
                  ]}
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="reports-chart-card">
          <h3 className="reports-chart-title">Payment Methods</h3>
          <div className="reports-chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={paymentMethodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="name" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), 'Amount']}
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Course-wise Collection Table */}
      <div className="reports-table-card">
        <h3 className="reports-table-title">Course-wise Fee Collection</h3>
        <div className="reports-table-wrapper">
          <table className="reports-table">
            <thead>
              <tr>
                <th className="left">Course</th>
                <th className="center">Students</th>
                <th className="right">Total Fees</th>
                <th className="right">Collected</th>
                <th className="right">Pending</th>
                <th className="right">Collection %</th>
              </tr>
            </thead>
            <tbody>
              {courseWiseCollection.map((course) => {
                const pending = course.total - course.collected;
                const percentage = course.total > 0 ? Math.round((course.collected / course.total) * 100) : 0;
                return (
                  <tr key={course.name}>
                    <td className="left reports-course-name">{course.name}</td>
                    <td className="center reports-students-count">{course.students}</td>
                    <td className="right reports-total-fees">{formatCurrency(course.total)}</td>
                    <td className="right reports-collected">{formatCurrency(course.collected)}</td>
                    <td className="right reports-pending">{formatCurrency(pending)}</td>
                    <td className="right">
                      <div className="reports-progress-cell">
                        <div className="reports-progress-bar">
                          <div
                            className="reports-progress-fill"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="reports-progress-text">{percentage}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enrollments Trend */}
      <div className="reports-chart-card">
        <h3 className="reports-chart-title">Enrollment Trend</h3>
        <div className="reports-chart-container small">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="name" stroke="#666" fontSize={10} angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#141414', 
                  border: '1px solid #1a1a1a',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Bar dataKey="enrollments" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="New Enrollments" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
