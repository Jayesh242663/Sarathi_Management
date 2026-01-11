import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Edit, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  BookOpen,
  User,
  CreditCard,
  Plus,
  IndianRupee,
  TrendingUp,
  Clock,
  Building2,
  Pencil
} from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, getRelativeTime, getInitials } from '../../utils/formatters';
import { COURSES, STUDENT_STATUS, PAYMENT_METHODS, BANK_MONEY_RECEIVED } from '../../utils/constants';
import PaymentForm from '../fees/PaymentForm';
import './StudentDetail.css';

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getStudentById, getStudentFeesSummary, getPaymentsByStudentId } = useStudents();
  const { canEdit } = useAuth();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  
  const student = getStudentById(id);
  const feesSummary = getStudentFeesSummary(id);
  const payments = getPaymentsByStudentId(id);

  if (!student) {
    return (
      <div className="empty-state">
        <p className="empty-text">Student not found</p>
        <button onClick={() => navigate('/students')} className="btn-back-link">
          Back to Students
        </button>
      </div>
    );
  }

  const courseName = COURSES.find((c) => c.value === student.course)?.label || student.course;
  const statusInfo = STUDENT_STATUS.find((s) => s.value === student.status);

  const getFeeStatusColor = () => {
    if (feesSummary?.status === 'paid') return 'green';
    if (feesSummary?.status === 'partial') return 'yellow';
    return 'red';
  };

  return (
    <div className="student-detail-page">
      {/* Header */}
      <div className="detail-header">
        <div className="detail-header-left">
          <button onClick={() => navigate('/students')} className="btn-back">
            <ArrowLeft />
          </button>
          <div className="detail-header-text">
            <h1>Student Details</h1>
            <p>View and manage student information</p>
          </div>
        </div>
        {canEdit() && (
          <Link to={`/students/${id}/edit`} className="btn-edit">
            <Edit />
            Edit
          </Link>
        )}
      </div>

      <div className="detail-grid">
        {/* Main Info */}
        <div className="detail-main">
          {/* Profile Card */}
          <div className="profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {getInitials(`${student.firstName} ${student.lastName}`)}
              </div>
              <div className="profile-info">
                <div className="profile-name-row">
                  <h2 className="profile-name">
                    {student.firstName} {student.lastName}
                  </h2>
                  <span className={`profile-status ${statusInfo?.color}`}>
                    {statusInfo?.label}
                  </span>
                </div>
                <p className="profile-enrollment">{student.enrollmentNumber}</p>
                
                <div className="profile-details">
                  <div className="profile-detail-item">
                    <Mail />
                    <span>{student.email}</span>
                  </div>
                  <div className="profile-detail-item">
                    <Phone />
                    <span>{student.phone}</span>
                  </div>
                  <div className="profile-detail-item">
                    <BookOpen />
                    <span>{courseName}</span>
                  </div>
                  <div className="profile-detail-item">
                    <Calendar />
                    <span>Batch: {student.batch}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment History */}
          <div className="info-card">
            <div className="payment-history-header">
              <h3 className="info-card-title">
                <CreditCard className="purple" />
                Payment History
              </h3>
              {canEdit() && (
                <button onClick={() => setShowPaymentForm(true)} className="btn-record-payment">
                  <Plus />
                  Record Payment
                </button>
              )}
            </div>
            
              {payments.length === 0 ? (
              <div className="empty-state">
                <CreditCard className="empty-icon" />
                <p className="empty-text">No payments recorded yet</p>
              </div>
            ) : (
              <div className="payment-list">
                {payments
                  .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                  .map((payment) => (
                    <div key={payment.id} className="payment-item">
                      <div className="payment-item-left">
                        <div className="payment-icon">
                          <IndianRupee />
                        </div>
                        <div>
                          <p className="payment-amount">
                            {formatCurrency(payment.amount)}
                          </p>
                          <p className="payment-method">
                            {PAYMENT_METHODS.find((m) => m.value === payment.paymentMethod)?.label} • {payment.receiptNumber}
                          </p>
                          {payment.bankMoneyReceived && (
                            <p className="payment-bank">
                              <Building2 size={12} />
                              {BANK_MONEY_RECEIVED.find((b) => b.value === payment.bankMoneyReceived)?.label}
                            </p>
                          )}
                        </div>
                      </div>
                        <div className="payment-item-right">
                        <p className="payment-date">{formatDate(payment.paymentDate)}</p>
                        <p className="payment-time">{getRelativeTime(payment.createdAt)}</p>
                          {canEdit() && (
                            <button
                              className="payment-edit-btn"
                              onClick={() => {
                                setEditingPayment(payment);
                                setShowPaymentForm(true);
                              }}
                              title="Edit payment"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Fee Summary */}
        <div className="detail-sidebar">
          {/* Fee Summary Card */}
          <div className="info-card">
            <h3 className="info-card-title">
              <TrendingUp className="blue" />
              Fee Summary
            </h3>
            
            <div className="fee-summary">
              <div className="fee-row">
                <span className="fee-label">Total Fees</span>
                <span className="fee-value">
                  {formatCurrency(feesSummary?.totalFees || 0)}
                </span>
              </div>
              <div className="fee-row">
                <span className="fee-label">Paid</span>
                <span className="fee-value green">
                  {formatCurrency(feesSummary?.totalPaid || 0)}
                </span>
              </div>
              <div className="fee-row">
                <span className="fee-label">Remaining</span>
                <span className={`fee-value ${getFeeStatusColor()}`}>
                  {formatCurrency(feesSummary?.remaining || 0)}
                </span>
              </div>
              
              <div className="fee-progress">
                <div className="fee-progress-header">
                  <span className="fee-progress-label">Collection Progress</span>
                  <span className="fee-progress-value">
                    {feesSummary?.percentage || 0}%
                  </span>
                </div>
                <div className="fee-progress-bar">
                  <div
                    className="fee-progress-fill"
                    style={{ width: `${feesSummary?.percentage || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="info-card">
            <h3 className="info-card-title">
              <Clock />
              Quick Info
            </h3>
            
            <div className="quick-info">
              <div className="quick-info-row">
                <span className="quick-info-label">Admission Date</span>
                <span className="quick-info-value">
                  {formatDate(student.admissionDate)}
                </span>
              </div>
              <div className="quick-info-row">
                <span className="quick-info-label">Total Payments</span>
                <span className="quick-info-value">
                  {payments.length}
                </span>
              </div>
              <div className="quick-info-row">
                <span className="quick-info-label">Last Updated</span>
                <span className="quick-info-value">
                  {getRelativeTime(student.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <PaymentForm
          studentId={id}
          studentName={`${student.firstName} ${student.lastName}`}
          remainingFees={feesSummary?.remaining || 0}
          payment={editingPayment}
          onClose={() => setShowPaymentForm(false)}
        />
      )}
    </div>
  );
};

export default StudentDetail;
