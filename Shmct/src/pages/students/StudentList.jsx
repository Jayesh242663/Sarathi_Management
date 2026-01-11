import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Eye, 
  Edit, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Download
} from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, getInitials } from '../../utils/formatters';
import { COURSES, STUDENT_STATUS } from '../../utils/constants';
import './StudentList.css';

const StudentList = () => {
  const { payments, deleteStudent, getFilteredStudents, currentBatch } = useStudents();
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  
  // Get students filtered by current batch
  const students = getFilteredStudents();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  // Calculate fees paid for each student
  const studentsWithFees = useMemo(() => {
    return students.map((student) => {
      const studentPayments = payments.filter((p) => p.studentId === student.id);
      const feesPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      const netTotal = Math.max(0, (student.totalFees || 0) - (student.discount || 0));
      return {
        ...student,
        feesPaid,
        feesRemaining: Math.max(0, netTotal - feesPaid),
        netTotal,
      };
    });
  }, [students, payments]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return studentsWithFees.filter((student) => {
      const matchesSearch = 
        student.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.enrollmentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
      const matchesCourse = courseFilter === 'all' || student.course === courseFilter;
      
      return matchesSearch && matchesStatus && matchesCourse;
    });
  }, [studentsWithFees, searchQuery, statusFilter, courseFilter]);

  const handleDelete = async (studentId) => {
    try {
      await deleteStudent(studentId);
      setShowDeleteModal(null);
    } catch (error) {
      console.error('Error deleting student:', error);
      alert(error.message || 'Failed to delete student. Please try again.');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = STUDENT_STATUS.find((s) => s.value === status);
    return (
      <span className={`status-badge ${statusConfig?.color || 'blue'}`}>
        {statusConfig?.label || status}
      </span>
    );
  };

  const getFeeStatus = (remaining, total) => {
    if (remaining <= 0) return <span className="fee-status-paid">Paid</span>;
    if (remaining < total) return <span className="fee-status-partial">Partial</span>;
    return <span className="fee-status-pending">Pending</span>;
  };

  return (
    <div className="students-page">
      {/* Header */}
      <div className="students-header">
        <div className="students-header-text">
          <h1>Students</h1>
          <p>Manage student registrations and records</p>
        </div>
        {canEdit() && (
          <Link to="/students/new" className="btn-add-student">
            <Plus />
            Add Student
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="filters-card">
        <div className="filters-wrapper">
          <div className="search-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, enrollment number, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="filter-selects">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              {STUDENT_STATUS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Courses</option>
              {COURSES.map((course) => (
                <option key={course.value} value={course.value}>{course.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="results-count">
        <p>Showing {filteredStudents.length} students</p>
      </div>

      {/* Table */}
      <div className="students-table-card">
        <div className="table-wrapper">
          <table className="students-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Enrollment No.</th>
                <th>Course</th>
                <th>Status</th>
                <th>Fees Paid</th>
                <th>Remaining</th>
                <th>Fee Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">
                    <Users className="empty-icon" />
                    <p className="empty-text">No students found</p>
                    <p className="empty-subtext">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="table-row">
                    <td data-label="Student">
                      <div className="student-cell">
                        <div className="student-avatar">
                          {getInitials(`${student.firstName} ${student.lastName}`)}
                        </div>
                        <div className="student-info">
                          <p className="student-name">{student.firstName} {student.lastName}</p>
                          <p className="student-email">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Enrollment">
                      <span className="enrollment-number">{student.enrollmentNumber}</span>
                    </td>
                    <td data-label="Course">
                      <span className="course-name">
                        {COURSES.find((c) => c.value === student.course)?.label || student.course}
                      </span>
                    </td>
                    <td data-label="Status">{getStatusBadge(student.status)}</td>
                    <td data-label="Fees Paid" className="fee-amount">
                      {formatCurrency(student.feesPaid)}
                    </td>
                    <td data-label="Remaining" className="fee-amount">
                      {formatCurrency(student.feesRemaining)}
                    </td>
                    <td data-label="Fee Status" className="fee-status-cell">
                      {getFeeStatus(student.feesRemaining, student.netTotal)}
                    </td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button
                          onClick={() => navigate(`/students/${student.id}`)}
                          className="action-btn view"
                          title="View Details"
                        >
                          <Eye />
                        </button>
                        {canEdit() && (
                          <>
                            <button
                              onClick={() => navigate(`/students/${student.id}/edit`)}
                              className="action-btn edit"
                              title="Edit"
                            >
                              <Edit />
                            </button>
                            <button
                              onClick={() => setShowDeleteModal(student)}
                              className="action-btn delete"
                              title="Delete"
                            >
                              <Trash2 />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Delete Student</h3>
            <p className="modal-text">
              Are you sure you want to delete <strong>{showDeleteModal.firstName} {showDeleteModal.lastName}</strong>? 
              This action cannot be undone and will also delete all payment records.
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowDeleteModal(null)} className="btn-cancel">
                Cancel
              </button>
              <button onClick={() => handleDelete(showDeleteModal.id)} className="btn-delete">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentList;
