import { useMemo, useState, useEffect } from 'react';
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
  AreaChart,
  Area,
  Line
} from 'recharts';
import MeasuredResponsiveContainer from '../../components/ui/MeasuredResponsiveContainer';
import { useStudents } from '../../context/StudentContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { COURSES, PAYMENT_METHODS } from '../../utils/constants';
import { getResponsiveChartConfig, formatChartLabel, getDynamicYAxisDomain, getAxisConfig, formatMonthShort, getDynamicXAxisConfig, getDynamicCountDomain } from '../../utils/chartHelpers';
import './ReportsPage.css';

const ReportsPage = () => {
  const { getFilteredStudents, getFilteredPayments, currentBatch, placements, expenses, batches } = useStudents();

  // Get filtered data based on current batch
  const students = getFilteredStudents();
  const payments = getFilteredPayments();

  const [dateRange, setDateRange] = useState('year');
  const [reportType, setReportType] = useState('overview');

  // Viewport detection for responsive charts
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chartConfig = useMemo(() => getResponsiveChartConfig(viewportWidth), [viewportWidth]);

  // Compute date window for the selected range (null start = all time)
  const rangeWindow = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    switch (dateRange) {
      case 'week':
        start.setDate(start.getDate() - 6); // include today + previous 6 days
        start.setHours(0, 0, 0, 0);
        return { start, end };
      case 'month':
        start.setMonth(start.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      default:
        return { start: null, end };
    }
  }, [dateRange]);

  // Filter payments by date range
  const filteredPayments = useMemo(() => {
    if (!rangeWindow.start) return payments;
    return payments.filter((p) => {
      if (!p.paymentDate) return false;
      const d = new Date(p.paymentDate);
      return d >= rangeWindow.start && d <= rangeWindow.end;
    });
  }, [payments, rangeWindow]);

  // Stats
  const stats = useMemo(() => {
    const totalCollected = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPayments = filteredPayments.length;
    
    // Add placement installments to stats
    const filteredPlacementInstallments = placements.flatMap((p) => p.installments || []).filter((inst) => {
      if (!inst.date) return false;
      const d = new Date(inst.date);
      return d >= rangeWindow.start && d <= rangeWindow.end;
    });
    
    const totalPlacementCollected = filteredPlacementInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const totalPlacementPayments = filteredPlacementInstallments.length;
    
    const combinedTotal = totalCollected + totalPlacementCollected;
    const combinedPayments = totalPayments + totalPlacementPayments;
    const avgPayment = combinedPayments > 0 ? Math.round(combinedTotal / combinedPayments) : 0;

    const methodBreakdown = {};
    filteredPayments.forEach((p) => {
      if (p.paymentMethod && p.amount) {
        methodBreakdown[p.paymentMethod] = (methodBreakdown[p.paymentMethod] || 0) + p.amount;
      }
    });

    // Add placement payment methods
    filteredPlacementInstallments.forEach((inst) => {
      if (inst.method && inst.amount) {
        methodBreakdown[inst.method] = (methodBreakdown[inst.method] || 0) + inst.amount;
      }
    });

    return { totalCollected: combinedTotal, totalPayments: combinedPayments, avgPayment, methodBreakdown };
  }, [filteredPayments, placements, rangeWindow]);

  // Trend data adapts to range: last 7 days (daily), otherwise monthly; all time groups by batch year names
  const trendData = useMemo(() => {
    // Helper to map student id to batch name
    const studentBatchMap = new Map(students.map((s) => [s.id, s.batch]));

    // Last 7 days: show daily points including today
    if (dateRange === 'week') {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      const days = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const dayKey = cursor.toISOString().slice(0, 10); // YYYY-MM-DD
        const label = cursor.toLocaleDateString('default', { month: 'short', day: 'numeric' });

        const dayPayments = payments.filter(
          (p) => p.paymentDate && p.paymentDate === dayKey
        );
        const paymentRevenue = dayPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // Add placement installments for the day
        const dayPlacementInstallments = placements.flatMap((p) => p.installments || []).filter(
          (inst) => inst.date && inst.date === dayKey
        );
        const placementRevenue = dayPlacementInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);

        const revenue = paymentRevenue + placementRevenue;

        // Calculate expenses debits for the day
        const dayExpenses = (expenses || []).filter(
          (exp) => exp.date === dayKey && exp.transaction_type === 'debit'
        );
        const expensesDebit = dayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        const enrollments = students.filter((s) => s.admissionDate === dayKey).length;

        days.push({
          name: label,
          revenue,
          expenses: expensesDebit,
          payments: dayPayments.length,
          enrollments,
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      return days;
    }

    // All time: group by batch names (e.g., 2022-23)
    if (!rangeWindow.start) {
      const batchNames = Array.from(new Set(students.map((s) => s.batch).filter(Boolean)));
      // Sort batches ascending by start year if parsable
      batchNames.sort((a, b) => {
        const ya = parseInt(String(a).split('-')[0], 10) || 0;
        const yb = parseInt(String(b).split('-')[0], 10) || 0;
        return ya - yb;
      });

      return batchNames.map((batchName) => {
        const batchStudentIds = students.filter((s) => s.batch === batchName).map((s) => s.id);
        const batchPayments = payments.filter((p) => batchStudentIds.includes(p.studentId));
        const paymentRevenue = batchPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        // Add placement installments for the batch
        const batchPlacements = placements.filter((p) => batchStudentIds.includes(p.studentId));
        const batchPlacementInstallments = batchPlacements.flatMap((p) => p.installments || []);
        const placementRevenue = batchPlacementInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
        
        const revenue = paymentRevenue + placementRevenue;
        
        // Calculate expenses debits for the batch
        // Find the batch ID from batch name
        const batchObj = (batches || []).find((b) => b.batch_name === batchName);
        const batchId = batchObj ? batchObj.id : null;
        
        const batchExpenses = (expenses || []).filter(
          (exp) => exp.transaction_type === 'debit' && exp.batch_id === batchId
        );
        const expensesDebit = batchExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        
        const enrollments = batchStudentIds.length;
        return {
          name: batchName,
          revenue,
          expenses: expensesDebit,
          payments: batchPayments.length,
          enrollments,
        };
      });
    }

    // Default: monthly between window start and current month
    const months = [];
    const start = new Date(rangeWindow.start.getFullYear(), rangeWindow.start.getMonth(), 1);
    const end = new Date();
    end.setDate(1);

    const cursor = new Date(start);
    while (cursor <= end) {
      // Always use short month format
      const monthName = cursor.toLocaleString('default', { month: 'short' });
      const year = cursor.getFullYear();
      const monthKey = `${year}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

      const monthPayments = filteredPayments.filter(
        (p) => p.paymentDate && p.paymentDate.startsWith(monthKey)
      );
      const paymentRevenue = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Add placement installments for the month
      const monthPlacementInstallments = placements.flatMap((p) => p.installments || []).filter(
        (inst) => inst.date && inst.date.startsWith(monthKey)
      );
      const placementRevenue = monthPlacementInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);

      const revenue = paymentRevenue + placementRevenue;

      // Calculate expenses debits for the month
      const monthExpenses = (expenses || []).filter(
        (exp) => exp.date && exp.date.startsWith(monthKey) && exp.transaction_type === 'debit'
      );
      const expensesDebit = monthExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      const enrollments = students.filter((s) => {
        if (!s.admissionDate) return false;
        const inMonth = s.admissionDate.startsWith(monthKey);
        return inMonth && (!rangeWindow.start || new Date(s.admissionDate) >= rangeWindow.start);
      }).length;

      months.push({
        name: monthName,
        year: year,
        revenue,
        expenses: expensesDebit,
        payments: monthPayments.length,
        enrollments,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Check if there are duplicate month names (spans multiple years)
    const monthCounts = {};
    months.forEach(m => {
      monthCounts[m.name] = (monthCounts[m.name] || 0) + 1;
    });
    const hasDuplicates = Object.values(monthCounts).some(count => count > 1);
    
    // If duplicates exist, append year to month labels
    if (hasDuplicates) {
      months.forEach(m => {
        m.name = `${m.name} '${String(m.year).slice(-2)}`;
      });
    }

    return months;
  }, [dateRange, filteredPayments, payments, rangeWindow, students, placements]);

  const revenueTrendTitle = useMemo(() => {
    switch (dateRange) {
      case 'week':
        return 'Income vs Expenses (Last 7 Days)';
      case 'quarter':
        return 'Income vs Expenses (Last Quarter)';
      case 'year':
        return 'Income vs Expenses (Last Year)';
      default:
        return 'Income vs Expenses (12 Months)';
    }
  }, [dateRange]);

  // Payment method breakdown for chart
  const paymentMethodData = useMemo(() => {
    return Object.entries(stats.methodBreakdown).map(([method, amount]) => ({
      name: PAYMENT_METHODS.find((m) => m.value === method)?.label || method,
      amount,
    }));
  }, [stats.methodBreakdown]);

  // Calculate axis configurations for all charts (after trendData and paymentMethodData are defined)
  const revenueYAxisDomain = useMemo(() => getDynamicYAxisDomain(trendData, 'revenue', viewportWidth), [trendData, viewportWidth]);
  const revenueXAxisConfig = useMemo(() => getDynamicXAxisConfig(trendData, viewportWidth, dateRange !== 'week'), [trendData, viewportWidth, dateRange]);
  
  const paymentYAxisDomain = useMemo(() => getDynamicYAxisDomain(paymentMethodData, 'amount', viewportWidth), [paymentMethodData, viewportWidth]);
  const paymentXAxisConfig = useMemo(() => getDynamicXAxisConfig(paymentMethodData, viewportWidth, false), [paymentMethodData, viewportWidth]);
  
  const enrollmentYAxisDomain = useMemo(() => getDynamicCountDomain(trendData, 'enrollments'), [trendData]);
  const enrollmentXAxisConfig = useMemo(() => getDynamicXAxisConfig(trendData, viewportWidth, dateRange !== 'week'), [trendData, viewportWidth, dateRange]);

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
      // Only count active students in total fees (exclude dropped-out)
      if (student.status !== 'dropped') {
        courseData[courseName].totalFees += (student.totalFees || 0);
        courseData[courseName].pending += Math.max(0, (student.totalFees || 0) - collected);
      }
      // Collected includes payments from all students (including dropped-out)
      courseData[courseName].collected += collected;
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
            <MeasuredResponsiveContainer minHeight={280}>
              <AreaChart data={trendData} margin={chartConfig.margin}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis
                  dataKey="name"
                  stroke="#666"
                  fontSize={revenueXAxisConfig.fontSize}
                  angle={revenueXAxisConfig.angle}
                  textAnchor={revenueXAxisConfig.textAnchor}
                  height={revenueXAxisConfig.height}
                  tick={{ dy: revenueXAxisConfig.dy }}
                  interval={revenueXAxisConfig.tickInterval}
                  tickFormatter={revenueXAxisConfig.tickFormatter}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={chartConfig.fontSize} 
                  domain={revenueYAxisDomain}
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} 
                />
                <Tooltip
                  formatter={(value, name) => [
                    ['revenue', 'expenses'].includes(name) ? formatCurrency(value) : value,
                    name === 'revenue' ? 'Revenue' : name === 'expenses' ? 'Expenses' : name === 'payments' ? 'Payments' : 'Enrollments'
                  ]}
                  contentStyle={{
                    backgroundColor: '#141414',
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
              </AreaChart>
            </MeasuredResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="reports-chart-card">
          <h3 className="reports-chart-title">Payment Methods</h3>
          <div className="reports-chart-container">
            <MeasuredResponsiveContainer minHeight={280}>
              <BarChart data={paymentMethodData} margin={chartConfig.margin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis
                  dataKey="name"
                  stroke="#666"
                  fontSize={paymentXAxisConfig.fontSize}
                  angle={paymentXAxisConfig.angle}
                  textAnchor={paymentXAxisConfig.textAnchor}
                  height={paymentXAxisConfig.height}
                  tick={{ dy: paymentXAxisConfig.dy }}
                  interval={paymentXAxisConfig.tickInterval}
                  tickFormatter={paymentXAxisConfig.tickFormatter}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={chartConfig.fontSize}
                  domain={paymentYAxisDomain}
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} 
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Amount']}
                  contentStyle={{
                    backgroundColor: '#141414',
                    border: '1px solid #1a1a1a',
                    borderRadius: '8px',
                    color: '#fff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                  }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={chartConfig.barSize} isAnimationActive={false} />
              </BarChart>
            </MeasuredResponsiveContainer>
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
          <MeasuredResponsiveContainer minHeight={240}>
            <BarChart data={trendData} margin={chartConfig.margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis
                dataKey="name"
                stroke="#666"
                fontSize={enrollmentXAxisConfig.fontSize}
                angle={enrollmentXAxisConfig.angle}
                textAnchor={enrollmentXAxisConfig.textAnchor}
                height={enrollmentXAxisConfig.height}
                tick={{ dy: enrollmentXAxisConfig.dy }}
                interval={enrollmentXAxisConfig.tickInterval}
                tickFormatter={enrollmentXAxisConfig.tickFormatter}
              />
              <YAxis 
                stroke="#666" 
                fontSize={chartConfig.fontSize}
                domain={enrollmentYAxisDomain}
              />
              <Tooltip
                formatter={(value) => value}
                contentStyle={{
                  backgroundColor: '#141414',
                  border: '1px solid #1a1a1a',
                  borderRadius: '8px',
                  color: '#fff',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="enrollments" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="New Enrollments" barSize={chartConfig.barSize} isAnimationActive={false} />
            </BarChart>
          </MeasuredResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
