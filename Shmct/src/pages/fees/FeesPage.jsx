import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, 
  CreditCard, 
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  BookOpen,
  Receipt,
  ArrowRightLeft,
  FileText,
  Building2
} from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, getInitials, getRelativeTime } from '../../utils/formatters';
import { PAYMENT_METHODS, BANK_MONEY_RECEIVED } from '../../utils/constants';
import PaymentForm from './PaymentForm';
import './FeesPage.css';

const FeesPage = () => {
  const { getStudentFeesSummary, getFilteredStudents, getFilteredPayments, currentBatch } = useStudents();
  const { canEdit } = useAuth();
  
  // Get filtered data based on current batch
  const students = getFilteredStudents();
  const payments = getFilteredPayments();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [feeStatusFilter, setFeeStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  const itemsPerPage = 10;

  // Calculate fees for each student
  const studentsWithFees = useMemo(() => {
    return students.map((student) => {
      const summary = getStudentFeesSummary(student.id);
      return {
        ...student,
        feesSummary: summary,
      };
    });
  }, [students, getStudentFeesSummary]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return studentsWithFees.filter((student) => {
      const matchesSearch = 
        student.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.enrollmentNumber.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesFeeStatus = true;
      if (feeStatusFilter !== 'all') {
        matchesFeeStatus = student.feesSummary?.status === feeStatusFilter;
      }
      
      return matchesSearch && matchesFeeStatus;
    });
  }, [studentsWithFees, searchQuery, feeStatusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Summary stats
  const stats = useMemo(() => {
    const totalFees = students.reduce((sum, s) => sum + (s.totalFees || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingFees = Math.max(0, totalFees - totalPaid);
    const paidCount = studentsWithFees.filter((s) => s.feesSummary?.status === 'paid').length;
    const partialCount = studentsWithFees.filter((s) => s.feesSummary?.status === 'partial').length;
    const pendingCount = studentsWithFees.filter((s) => s.feesSummary?.status === 'pending').length;

    return { 
      totalFees, 
      totalPaid, 
      pendingFees, 
      paidCount, 
      partialCount, 
      pendingCount,
      collectionPercentage: totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 0,
    };
  }, [students, payments, studentsWithFees]);

  // Recent payments
  const recentPayments = useMemo(() => {
    return payments
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map((payment) => {
        const student = students.find((s) => s.id === payment.studentId);
        return { ...payment, student };
      });
  }, [payments, students]);

  const getStatusBadge = (status) => {
    if (status === 'paid') {
      return (
        <span className="fees-status-badge status-paid">
          <CheckCircle className="w-3 h-3" />
          Paid
        </span>
      );
    }
    if (status === 'partial') {
      return (
        <span className="fees-status-badge status-partial">
          <Clock className="w-3 h-3" />
          Partial
        </span>
      );
    }
    return (
      <span className="fees-status-badge status-pending">
        <AlertCircle className="w-3 h-3" />
        Pending
      </span>
    );
  };

  return (
    <div className="fees-page">
      {/* Header */}
      <div className="fees-header">
        <div className="fees-header-text">
          <h1>Fee Collection</h1>
          <p>
            {currentBatch === 'all' 
              ? "Showing fee data for all batches" 
              : `Batch ${currentBatch} Fee Management`}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="fees-stats-grid">
        <div className="fees-stat-card">
          <div className="fees-stat-content">
            <div className="fees-stat-icon blue">
              <IndianRupee />
            </div>
            <div>
              <p className="fees-stat-label">Total Fees</p>
              <p className="fees-stat-value">{formatCurrency(stats.totalFees)}</p>
            </div>
          </div>
        </div>

        <div className="fees-stat-card">
          <div className="fees-stat-content">
            <div className="fees-stat-icon green">
              <TrendingUp />
            </div>
            <div>
              <p className="fees-stat-label">Collected</p>
              <p className="fees-stat-value green">{formatCurrency(stats.totalPaid)}</p>
            </div>
          </div>
        </div>

        <div className="fees-stat-card">
          <div className="fees-stat-content">
            <div className="fees-stat-icon red">
              <AlertCircle />
            </div>
            <div>
              <p className="fees-stat-label">Pending</p>
              <p className="fees-stat-value red">{formatCurrency(stats.pendingFees)}</p>
            </div>
          </div>
        </div>

        <div className="fees-stat-card">
          <div className="fees-stat-content">
            <div className="fees-stat-icon purple">
              <CreditCard />
            </div>
            <div>
              <p className="fees-stat-label">Collection Rate</p>
              <p className="fees-stat-value purple">
                {stats.totalFees > 0 ? Math.round((stats.totalPaid / stats.totalFees) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="fees-main-grid">
        {/* Student Fees List */}
        <div className="fees-list-section">
          {/* Filters */}
          <div className="fees-filters-card">
            <div className="fees-filters-wrapper">
              <div className="fees-search-wrapper">
                <Search className="fees-search-icon" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="fees-search-input"
                />
              </div>
              
              <select
                value={feeStatusFilter}
                onChange={(e) => setFeeStatusFilter(e.target.value)}
                className="fees-filter-select"
              >
                <option value="all">All Status</option>
                <option value="paid">Fully Paid ({stats.paidCount})</option>
                <option value="partial">Partial ({stats.partialCount})</option>
                <option value="pending">Pending ({stats.pendingCount})</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="fees-table-card">
            <div className="fees-table-wrapper">
              <table className="fees-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="fees-empty-state">
                        <CreditCard className="fees-empty-icon" />
                        <p className="fees-empty-text">No students found</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map((student) => (
                      <tr key={student.id} className="fees-table-row">
                        <td>
                          <div className="fees-student-cell">
                            <div className="fees-student-avatar">
                              {getInitials(`${student.firstName} ${student.lastName}`)}
                            </div>
                            <div className="fees-student-info">
                              <p className="fees-student-name">{student.firstName} {student.lastName}</p>
                              <p className="fees-student-enrollment">{student.enrollmentNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="fees-amount" data-label="Total">
                          {formatCurrency(student.feesSummary?.totalFees || 0)}
                        </td>
                        <td className="fees-amount paid" data-label="Paid">
                          {formatCurrency(student.feesSummary?.totalPaid || 0)}
                        </td>
                        <td className="fees-amount remaining" data-label="Remaining">
                          {formatCurrency(student.feesSummary?.remaining || 0)}
                        </td>
                        <td data-label="Status">
                          {getStatusBadge(student.feesSummary?.status)}
                        </td>
                        <td data-label="Actions">
                          <div className="fees-action-buttons">
                            <Link
                              to={`/students/${student.id}`}
                              className="fees-action-btn view"
                              title="View Details"
                            >
                              <Eye />
                            </Link>
                            {canEdit() && student.feesSummary?.remaining > 0 && (
                              <button
                                onClick={() => setSelectedStudent(student)}
                                className="fees-action-btn add"
                                title="Record Payment"
                              >
                                <Plus />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="fees-pagination">
                <p className="fees-pagination-info">Page {currentPage} of {totalPages}</p>
                <div className="fees-pagination-buttons">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="fees-pagination-btn"
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="fees-pagination-btn"
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Payments Sidebar - Ledger Style */}
        <div className="fees-recent-sidebar">
          <div className="fees-recent-header">
            <Receipt className="fees-recent-header-icon" />
            <div>
              <h3 className="fees-recent-title">Recent Receipts</h3>
              <p className="fees-recent-subtitle">Latest fee collections</p>
            </div>
          </div>
          
          {recentPayments.length === 0 ? (
            <div className="fees-recent-empty">
              <FileText className="fees-recent-empty-icon" />
              <p>No receipts recorded</p>
            </div>
          ) : (
            <div className="fees-recent-list">
              {recentPayments.map((payment, index) => (
                <div key={payment.id} className="fees-receipt-item">
                  <div className="receipt-serial">#{recentPayments.length - index}</div>
                  <div className="receipt-content">
                    <div className="receipt-header-row">
                      <span className="receipt-number">{payment.receiptNumber}</span>
                      <span className="receipt-date">{formatDate(payment.paymentDate)}</span>
                    </div>
                    <p className="receipt-name">
                      {payment.student?.firstName} {payment.student?.lastName}
                    </p>
                    <div className="receipt-details-row">
                      <div className="receipt-method-group">
                        <span className="receipt-method">
                          {PAYMENT_METHODS.find((m) => m.value === payment.paymentMethod)?.label || 'N/A'}
                        </span>
                        {payment.bankMoneyReceived && (
                          <span className="receipt-bank">
                            <Building2 size={11} />
                            {BANK_MONEY_RECEIVED.find((b) => b.value === payment.bankMoneyReceived)?.label}
                          </span>
                        )}
                      </div>
                      <span className="receipt-amount">
                        <IndianRupee size={12} />
                        {formatCurrency(payment.amount).replace('₹', '')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="fees-recent-footer">
            <div className="fees-recent-summary">
              <span className="summary-label">Today's Collection</span>
              <span className="summary-amount">{formatCurrency(
                recentPayments
                  .filter(p => new Date(p.paymentDate).toDateString() === new Date().toDateString())
                  .reduce((sum, p) => sum + p.amount, 0)
              )}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Form Modal */}
      {selectedStudent && (
        <PaymentForm
          studentId={selectedStudent.id}
          studentName={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
          remainingFees={selectedStudent.feesSummary?.remaining || 0}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
};

export default FeesPage;
