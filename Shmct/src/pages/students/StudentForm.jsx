import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, User, Mail, Phone, BookOpen, Calendar, DollarSign } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { COURSES, STUDENT_STATUS } from '../../utils/constants';
import { generateEnrollmentNumber, formatNumberWithCommas } from '../../utils/formatters';
import './StudentForm.css';

const studentSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.union([z.string().email('Please enter a valid email'), z.literal('')]).nullable().optional().or(z.literal('')),
  phone: z.union([
    z.string().refine(val => val.length >= 10, 'Phone number must be at least 10 digits if provided'),
    z.literal('')
  ]).nullable().optional().or(z.literal('')),
  course: z.string().min(1, 'Please select a course'),
  batch: z.string().min(1, 'Please select a batch'),
  admissionDate: z.string().min(1, 'Admission date is required'),
  status: z.string().min(1, 'Please select a status'),
  totalFees: z.preprocess((v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/,/g, '').trim();
      return cleaned === '' ? NaN : Number(cleaned);
    }
    return v;
  }, z.number().min(1, 'Total fees must be greater than 0')),
  discount: z.preprocess((v) => {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/,/g, '').trim();
      return cleaned === '' ? 0 : Number(cleaned);
    }
    return 0;
  }, z.number().min(0, 'Discount cannot be negative')),
});

const StudentForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addStudent, updateStudent, getStudentById, currentBatch, customBatches, loading, batches, courses, dataLoadError, loadSupabaseData } = useStudents();
  const isEditing = !!id;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      course: '',
      batch: currentBatch !== 'all' ? currentBatch : batches?.[0]?.batch_name || '',
      admissionDate: new Date().toISOString().split('T')[0],
      status: 'active',
      totalFees: 120000,
      discount: 0,
    },
  });

  useEffect(() => {
    if (isEditing) {
      const student = getStudentById(id);
      if (student) {
        reset({
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          phone: student.phone,
          course: student.course,
          batch: student.batch,
          admissionDate: student.admissionDate,
          status: student.status,
          totalFees: student.totalFees,
          discount: student.discount || 0,
        });
      }
    }
  }, [id, isEditing, getStudentById, reset]);

  const watchedTotalFees = watch('totalFees');
  const watchedDiscount = watch('discount');

  const formatPreview = (val) => {
    const raw = (val ?? '').toString().replace(/,/g, '').trim();
    return raw ? formatNumberWithCommas(raw) : '';
  };

  const onSubmit = async (data) => {
    try {
      // Clean numeric values (remove commas)
      const cleanData = {
        ...data,
        totalFees: parseFloat(data.totalFees.toString().replace(/,/g, '')),
        discount: data.discount ? parseFloat(data.discount.toString().replace(/,/g, '')) : 0,
      };

      if (isEditing) {
        await updateStudent(id, cleanData);
      } else {
        await addStudent({
          ...cleanData,
          enrollmentNumber: generateEnrollmentNumber(),
        });
      }
      navigate('/students');
    } catch (error) {
      console.error('Error saving student:', error);
      alert(error.message || 'Failed to save student. Please try again.');
    }
  };

  // Convert Supabase batches to dropdown format
  const supabaseBatches = (batches || []).map((b) => ({
    value: b.batch_name,
    label: b.batch_name,
  }));
  
  // Combine Supabase batches with custom batches, avoiding duplicates
  const displayBatches = [...supabaseBatches];
  customBatches.forEach((cb) => {
    if (!displayBatches.some((b) => b.value === cb.value)) {
      displayBatches.push(cb);
    }
  });
  
  // Sort batches by year (descending)
  displayBatches.sort((a, b) => {
    const yearA = parseInt(a.value.split('-')[0]);
    const yearB = parseInt(b.value.split('-')[0]);
    return yearB - yearA;
  });

  return (
    <div className="student-form-page">
      {/* Header */}
      <div className="form-header">
        <button onClick={() => navigate('/students')} className="btn-back">
          <ArrowLeft />
        </button>
        <div className="form-header-text">
          <h1>{isEditing ? 'Edit Student' : 'Add New Student'}</h1>
          <p>{isEditing ? 'Update student information' : 'Register a new student'}</p>
        </div>
      </div>

      {/* Removed loading/error banners related to Supabase data fetching */}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="student-form">
        {/* Personal Information */}
        <div className="form-section">
          <h2 className="section-title">
            <User className="blue" />
            Personal Information
          </h2>
          
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">First Name *</label>
              <input
                {...register('firstName')}
                className={`form-input ${errors.firstName ? 'error' : ''}`}
                placeholder="Enter first name"
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text && text.trim().includes(' ')) {
                    e.preventDefault();
                    const parts = text.trim().split(/\s+/);
                    const first = parts.shift() || '';
                    const last = parts.join(' ');
                    setValue('firstName', first, { shouldValidate: true, shouldDirty: true });
                    if (last) {
                      setValue('lastName', last, { shouldValidate: true, shouldDirty: true });
                    }
                  }
                }}
              />
              {errors.firstName && (
                <p className="form-error">{errors.firstName.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Last Name *</label>
              <input
                {...register('lastName')}
                className={`form-input ${errors.lastName ? 'error' : ''}`}
                placeholder="Enter last name"
              />
              {errors.lastName && (
                <p className="form-error">{errors.lastName.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">
                <Mail />
                Email <span className="form-optional">(Optional)</span>
              </label>
              <input
                {...register('email')}
                type="email"
                className={`form-input ${errors.email ? 'error' : ''}`}
                placeholder="student@email.com"
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">
                <Phone />
                Phone Number <span className="form-optional">(Optional)</span>
              </label>
              <input
                {...register('phone')}
                className={`form-input ${errors.phone ? 'error' : ''}`}
                placeholder="9876543210"
              />
              {errors.phone && (
                <p className="form-error">{errors.phone.message}</p>
              )}
            </div>

          </div>
        </div>

        {/* Academic Information */}
        <div className="form-section">
          <h2 className="section-title">
            <BookOpen className="purple" />
            Academic Information
          </h2>
          
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Course *</label>
              <select
                {...register('course')}
                className={`form-select ${errors.course ? 'error' : ''}`}
              >
                <option value="">Select a course</option>
                {COURSES.map((course) => (
                  <option key={course.value} value={course.value}>
                    {course.label}
                  </option>
                ))}
              </select>
              {errors.course && (
                <p className="form-error">{errors.course.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Batch *</label>
              <select
                {...register('batch')}
                className={`form-select ${errors.batch ? 'error' : ''}`}
              >
                <option value="">Select a batch</option>
                {displayBatches.map((batch) => (
                  <option key={batch.value} value={batch.value}>
                    {batch.label}
                  </option>
                ))}
              </select>
              {errors.batch && (
                <p className="form-error">{errors.batch.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">
                <Calendar />
                Admission Date *
              </label>
              <input
                {...register('admissionDate')}
                type="date"
                className={`form-input ${errors.admissionDate ? 'error' : ''}`}
              />
              {errors.admissionDate && (
                <p className="form-error">{errors.admissionDate.message}</p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Status *</label>
              <select
                {...register('status')}
                className={`form-select ${errors.status ? 'error' : ''}`}
              >
                {STUDENT_STATUS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {errors.status && (
                <p className="form-error">{errors.status.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Fee Information */}
        <div className="form-section">
          <h2 className="section-title">
            <DollarSign className="yellow" />
            Fee Information
          </h2>
          
          <div className="form-grid">
            <div className="form-field">
              <div className="form-label-row">
                <label className="form-label">Total Course Fees (₹) *</label>
                {formatPreview(watchedTotalFees) && (
                  <span className="form-hint">{formatPreview(watchedTotalFees)}</span>
                )}
              </div>
              <input
                {...register('totalFees')}
                type="text"
                className={`form-input ${errors.totalFees ? 'error' : ''}`}
                placeholder=""
              />
              {errors.totalFees && (
                <p className="form-error">{errors.totalFees.message}</p>
              )}
            </div>

            <div className="form-field">
              <div className="form-label-row">
                <label className="form-label">Discount (₹) (Optional)</label>
                {formatPreview(watchedDiscount) && (
                  <span className="form-hint">{formatPreview(watchedDiscount)}</span>
                )}
              </div>
              <input
                {...register('discount')}
                type="text"
                className={`form-input ${errors.discount ? 'error' : ''}`}
                placeholder=""
                min={0}
              />
              {errors.discount && (
                <p className="form-error">{errors.discount.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button type="button" onClick={() => navigate('/students')} className="btn-cancel">
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting || loading || !batches || batches.length === 0 || !courses || courses.length === 0} 
            className="btn-submit"
          >
            <Save />
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Student' : 'Add Student'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentForm;
