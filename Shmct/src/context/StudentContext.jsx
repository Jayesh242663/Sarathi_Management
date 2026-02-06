import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StudentService, PaymentService, PlacementInstallmentService, PlacementService } from '../services/apiService';
import { getFromStorage, setToStorage, removeFromStorage, getCurrentAcademicBatch, STORAGE_KEYS } from '../utils/storage';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Helper to get authentication headers (httpOnly cookies are sent automatically)
const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
});

// Helper to ensure cookies are sent with every request
const authFetch = (url, options = {}) => {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
};

const StudentContext = createContext(null);

const mapStudent = (student, batchLookup, courseLookup) => {
  const batch = batchLookup.get(student.batch_id);
  const course = courseLookup.get(student.course_id);
  return {
    id: student.id,
    enrollmentNumber: student.enrollment_number,
    firstName: student.first_name,
    lastName: student.last_name,
    email: student.email,
    phone: student.phone_number,
    course: course?.course_type || course?.course_code || '',
    batchId: student.batch_id,
    batch: batch?.batch_name || '',
    admissionDate: student.enrollment_date,
    address: student.residential_address || '',
    guardianName: student.emergency_contact_name || '',
    guardianPhone: student.emergency_contact_phone || '',
    status: student.status,
    totalFees: Number(student.total_fees || 0),
    discount: Number(student.discount || 0),
    createdAt: student.created_at,
    updatedAt: student.updated_at,
  };
};

const mapPayment = (payment) => ({
  id: payment.id,
  studentId: payment.student_id,
  batchId: payment.batch_id,
  amount: Number(payment.amount || 0),
  paymentDate: payment.payment_date,
  paymentMethod: payment.payment_method,
  bankMoneyReceived: payment.bank_account || null,
  chequeNumber: payment.cheque_number || '',
  receiptNumber: payment.receipt_number || '',
  createdAt: payment.created_at,
  status: payment.status,
  remarks: payment.notes || '',
});

const mapPlacement = (placement, installments, batchLookup) => {
  const placementInstallments = installments.filter((inst) => inst.placement_id === placement.id);
  const countryFromInstallments = placementInstallments.find((inst) => inst.payment_location)?.payment_location;

  return {
    id: placement.id,
    studentId: placement.student_id,
    batch: batchLookup?.get(placement.batch_id)?.batch_name || placement.batch_id,
    company: placement.company_name,
    country: (!placement.placement_location || placement.placement_location === 'TBD')
      ? (countryFromInstallments || '')
      : placement.placement_location,
    companyCosting: Number(placement.company_cost || 0),
    myCosting: Number(placement.institution_cost || 0),
    profit: Number((placement.institution_cost || 0) - (placement.company_cost || 0)),
    placementDate: placement.placement_date,
    installments: placementInstallments.map((inst) => ({
      id: inst.id,
      amount: Number(inst.amount || 0),
      date: inst.payment_date || inst.due_date,
      method: inst.payment_method,
      bankMoneyReceived: inst.bank_account || null,
      chequeNumber: inst.cheque_number || '',
      remarks: inst.notes || '',
      status: inst.status,
      installmentNumber: inst.installment_number,
      paymentLocation: inst.payment_location || null,
    })),
  };
};

const mapAudit = (entry) => ({
  id: entry.id,
  action: entry.action,
  entityType: entry.entity_type,
  entityId: entry.entity_id,
  entityName: entry.entity_name || '',
  details: entry.details || {},
  timestamp: entry.transaction_date,
  batchId: entry.batch_id,
  amount: entry.amount ? Number(entry.amount) : undefined,
});

const mapExpense = (expense) => ({
  id: expense.id,
  name: expense.name,
  date: expense.date,
  paymentMethod: expense.payment_method || expense.paymentMethod,
  bankMoneyReceived: expense.bank_account || expense.bankMoneyReceived || null,
  chequeNumber: expense.cheque_number || expense.chequeNumber || '',
  amount: Number(expense.amount || 0),
  transactionType: expense.transaction_type || expense.transactionType,
  category: expense.category,
  remarks: expense.remarks || '',
  isSelfTransaction: expense.is_self_transaction || expense.isSelfTransaction || false,
  batchId: expense.batch_id || expense.batchId,
  createdAt: expense.created_at || expense.createdAt,
  updatedAt: expense.updated_at || expense.updatedAt,
});

export const StudentProvider = ({ children }) => {
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [batches, setBatches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false); // Start as false, will load when authenticated
  const [dataLoadError, setDataLoadError] = useState(null);
  const [loadRetryCount, setLoadRetryCount] = useState(0);
  const [currentBatch, setCurrentBatchState] = useState(() => {
    // Don't use calculated batch initially - will be set when data loads
    return getFromStorage(STORAGE_KEYS.SELECTED_BATCH) || null;
  });
  const [customBatches, setCustomBatchesState] = useState(() => {
    return getFromStorage(STORAGE_KEYS.CUSTOM_BATCHES) || [];
  });

  // Audit log helper function
  const logAuditEvent = useCallback((action, entityType, entityId, details, entityName = '') => {
    const inferredAmount = details && (details.amount !== undefined) ? Number(details.amount) : undefined;
    const inferredBatchId = details && details.studentId
      ? (students.find((s) => s.id === details.studentId)?.batchId)
      : (details && details.batchId) ? details.batchId : undefined;

    const auditEntry = {
      id: uuidv4(),
      action, // 'CREATE', 'UPDATE', 'DELETE', 'PAYMENT'
      entityType, // 'STUDENT', 'PAYMENT', 'BATCH'
      entityId,
      entityName,
      details,
      amount: inferredAmount,
      batchId: inferredBatchId,
      timestamp: new Date().toISOString(),
    };
    setAuditLog((prev) => {
      const newLog = [auditEntry, ...prev];
      setToStorage(STORAGE_KEYS.AUDIT_LOG, newLog);
      return newLog;
    });
    return auditEntry;
  }, [students]);

  // Set current batch and persist to localStorage
  const setCurrentBatch = useCallback((batch) => {
    setCurrentBatchState(batch);
    setToStorage(STORAGE_KEYS.SELECTED_BATCH, batch);
  }, []);

  // Add a new custom batch
  const addCustomBatch = useCallback((batchValue) => {
    setCustomBatchesState((prev) => {
      // Avoid duplicates
      if (prev.some((b) => b.value === batchValue)) {
        return prev;
      }
      const newBatches = [...prev, { value: batchValue, label: batchValue }];
      setToStorage(STORAGE_KEYS.CUSTOM_BATCHES, newBatches);
      return newBatches;
    });
  }, []);

  // Remove a custom batch
  const removeCustomBatch = useCallback((batchValue) => {
    setCustomBatchesState((prev) => {
      const newBatches = prev.filter((b) => b.value !== batchValue);
      setToStorage(STORAGE_KEYS.CUSTOM_BATCHES, newBatches);
      return newBatches;
    });
  }, []);

  const loadSupabaseData = useCallback(async (retryCount = 0) => {
    try {
      // Verify authentication before loading data
      const user = getFromStorage(STORAGE_KEYS.USER);
      
      if (!user) {
        console.warn('[StudentContext] SECURITY: Attempt to load data without authentication blocked.', 'User:', !!user);
        setDataLoadError('Authentication required. Please log in.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setDataLoadError(null);
      console.log('[StudentContext] Loading authenticated data for user:', user.email, `(attempt ${retryCount + 1})`);

      const response = await authFetch(`${API_BASE}/data/snapshot`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[StudentContext] Error response:', response.status, errorText);
        
        // If 401 Unauthorized, the user needs to log in again
        if (response.status === 401) {
          const authError = new Error('Authentication required. Please log in again.');
          authError.isAuthError = true;
          throw authError;
        }
        
        throw new Error(`Failed to fetch data from Supabase: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[StudentContext] Data received:', data);

      const {
        batches = [],
        courses = [],
        students: studentRows = [],
        payments: paymentRows = [],
        placements: placementRows = [],
        placementInstallments = [],
        auditLogs = [],
      } = data;

      // Fetch expenses separately (paginate to load all)
      let expenses = [];
      try {
        const pageSize = 100;
        let page = 1;
        let hasNextPage = true;

        while (hasNextPage) {
          const expensesResponse = await authFetch(`${API_BASE}/expenses?limit=${pageSize}&page=${page}`, {
            method: 'GET',
            headers: getAuthHeaders(),
          });

          if (!expensesResponse.ok) {
            console.warn('[StudentContext] Failed to load expenses:', expensesResponse.status);
            break;
          }

          const expensesData = await expensesResponse.json();
          const pageData = expensesData.data || [];
          const pagination = expensesData.pagination || {};

          expenses = expenses.concat(pageData);
          if (typeof pagination.hasNextPage === 'boolean') {
            hasNextPage = pagination.hasNextPage;
            if (!hasNextPage && pageData.length === pageSize) {
              hasNextPage = true;
            }
          } else {
            hasNextPage = pageData.length === pageSize;
          }
          page += 1;
        }

        console.log('[StudentContext] Expenses loaded:', expenses.length);
      } catch (expenseError) {
        console.warn('[StudentContext] Error loading expenses:', expenseError);
        // Continue loading other data even if expenses fail
      }

      console.log('[StudentContext] Extracted arrays:', {
        batchesCount: batches.length,
        coursesCount: courses.length,
        studentsCount: studentRows.length,
        paymentsCount: paymentRows.length,
        placementsCount: placementRows.length,
        installmentsCount: placementInstallments.length,
        auditLogsCount: auditLogs.length,
        expensesCount: expenses.length,
      });

      if (batches.length === 0) {
        console.warn('[StudentContext] WARNING: No batches returned from backend!');
      }
      if (courses.length === 0) {
        console.warn('[StudentContext] WARNING: No courses returned from backend!');
      }

      const batchLookup = new Map(batches.map((b) => [b.id, b]));
      const courseLookup = new Map(courses.map((c) => [c.id, c]));

      const mappedStudents = (studentRows || []).filter(Boolean).map((s) => mapStudent(s, batchLookup, courseLookup));
      const mappedPayments = (paymentRows || []).filter(Boolean).map(mapPayment);
      const mappedPlacements = (placementRows || []).filter(Boolean).map((p) => mapPlacement(p, placementInstallments, batchLookup));
      const mappedAuditLogs = (auditLogs || []).filter(Boolean).map(mapAudit);

      console.log('[StudentContext] Mapped data:', { mappedStudents, mappedPayments, mappedPlacements, mappedAuditLogs });
      console.log('[StudentContext] Audit logs count:', mappedAuditLogs.length);

      setStudents(mappedStudents);
      setPayments(mappedPayments);
      setPlacements(mappedPlacements);
      
      // Deduplicate expenses by ID
      const uniqueExpenses = Array.from(
        new Map(expenses.map((exp) => [exp.id, exp])).values()
      );
      setExpenses(uniqueExpenses);
      
      setBatches(batches);
      setCourses(courses);
      setAuditLog(mappedAuditLogs);
      setLoadRetryCount(0);

      if (batches.length > 0) {
        const savedBatch = getFromStorage(STORAGE_KEYS.SELECTED_BATCH);
        
        // Check if saved batch exists in database
        const savedBatchExists = savedBatch && batches.find((b) => b.batch_name === savedBatch);
        
        if (savedBatchExists) {
          console.log('[StudentContext] Using saved batch:', savedBatch);
          setCurrentBatchState(savedBatch);
        } else {
          // Saved batch doesn't exist, use active batch or first batch
          const fallbackBatch = batches.find((b) => b.is_active) || batches[0];
          if (fallbackBatch) {
            console.log('[StudentContext] Setting batch to:', fallbackBatch.batch_name);
            setCurrentBatchState(fallbackBatch.batch_name);
            setToStorage(STORAGE_KEYS.SELECTED_BATCH, fallbackBatch.batch_name);
          }
        }
      }

      console.log('[StudentContext] Data loaded successfully');
    } catch (err) {
      console.error('[StudentContext] Error loading data from Supabase:', err);
      console.error('[StudentContext] Stack:', err.stack);
      setDataLoadError(err.message);

      if (err?.isAuthError || /authentication required|session expired/i.test(err?.message || '')) {
        removeFromStorage(STORAGE_KEYS.USER);
        setStudents([]);
        setPayments([]);
        setPlacements([]);
        setBatches([]);
        setCourses([]);
        setAuditLog([]);
        setLoadRetryCount(0);
        setLoading(false);
        return;
      }

      // Retry with exponential backoff (max 3 attempts)
      if (retryCount < 2) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`[StudentContext] Retrying in ${delayMs}ms...`);
        setLoadRetryCount(retryCount + 1);
        setTimeout(() => {
          loadSupabaseData(retryCount + 1);
        }, delayMs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount and when auth token becomes available
  useEffect(() => {
    const user = getFromStorage(STORAGE_KEYS.USER);
    
    if (user) {
      console.log('[StudentContext] Authenticated user detected. Loading data for:', user.email);
      loadSupabaseData();
    } else {
      console.log('[StudentContext] Not authenticated. Skipping data load. User:', !!user);
      setLoading(false);
      setDataLoadError(null);
      // Clear all data if not authenticated
      setStudents([]);
      setPayments([]);
      setPlacements([]);
      setBatches([]);
      setCourses([]);
      setAuditLog([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Listen for storage changes (when user logs in from another tab or after login)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEYS.USER && e.newValue) {
        console.log('[StudentContext] User detected. Reloading data.');
        loadSupabaseData();
      } else if (e.key === STORAGE_KEYS.USER && !e.newValue) {
        console.log('[StudentContext] User removed. Clearing all data.');
        setStudents([]);
        setPayments([]);
        setPlacements([]);
        setBatches([]);
        setCourses([]);
        setAuditLog([]);
        setLoading(false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadSupabaseData]);

  // Student CRUD operations
  const addStudent = useCallback(async (studentData) => {
    if (!batches || batches.length === 0 || !courses || courses.length === 0) {
      console.error('[StudentContext] addStudent failed - missing data:', { 
        batchesCount: batches?.length || 0, 
        coursesCount: courses?.length || 0,
        batchesNull: batches === null,
        coursesNull: courses === null 
      });
      throw new Error('Cannot create student: batches/courses are not loaded from Supabase. Please refresh and try again.');
    }

    // Map UI values to Supabase columns
    const batch = batches.find((b) => b.batch_name === studentData.batch || b.batchName === studentData.batch);
    const course = courses.find((c) =>
      c.course_type === studentData.course ||
      c.course_code === studentData.course ||
      c.course_name === studentData.course
    );

    if (!batch) {
      console.error('[StudentContext] Batch not found:', { 
        searchValue: studentData.batch, 
        availableBatches: batches.map(b => ({ batch_name: b.batch_name, batchName: b.batchName }))
      });
      throw new Error('Batch not found. Please select a valid batch.');
    }
    if (!course) {
      console.error('[StudentContext] Course not found:', { 
        searchValue: studentData.course, 
        availableCourses: courses.map(c => ({ course_type: c.course_type, course_code: c.course_code, course_name: c.course_name }))
      });
      throw new Error('Course not found. Please select a valid course.');
    }

    const payload = {
      enrollment_number: studentData.enrollmentNumber,
      first_name: studentData.firstName,
      last_name: studentData.lastName,
      email: studentData.email,
      phone_number: studentData.phone,
      batch_id: batch.id,
      course_id: course.id,
      enrollment_date: studentData.admissionDate,
      total_fees: studentData.totalFees,
      discount: studentData.discount || 0,
      status: studentData.status || 'active',
      residential_address: studentData.address || null,
      emergency_contact_name: studentData.guardianName || null,
      emergency_contact_phone: studentData.guardianPhone || null,
    };

    const { data } = await StudentService.create(payload);

    // Update local state with freshly created row using lookups
    const batchLookup = new Map(batches.map((b) => [b.id, b]));
    const courseLookup = new Map(courses.map((c) => [c.id, c]));
    const mapped = mapStudent(data, batchLookup, courseLookup);

    setStudents((prev) => [mapped, ...prev]);

    // Ensure a placeholder placement exists for the new student (defensive in case backend hook fails)
    try {
      const placementPayload = {
        student_id: mapped.id,
        batch_id: mapped.batchId,
        company_name: 'TBD',
        placement_location: 'TBD',
        company_cost: 1,
        institution_cost: 1,
        placement_date: new Date().toISOString().slice(0, 10),
        notes: 'Auto-created placeholder. Update with real placement details.',
      };
      const placementResp = await PlacementService.create(placementPayload);
      const createdPlacement = placementResp.data || placementResp;

      setPlacements((prev) => [
        ...prev,
        mapPlacement(createdPlacement, [], new Map(batches.map((b) => [b.id, b]))),
      ]);
    } catch (placementErr) {
      console.warn('[addStudent] Placement placeholder creation failed (non-fatal):', placementErr);
    }

    // Refresh data to ensure placement and related views stay in sync
    setTimeout(() => {
      loadSupabaseData();
    }, 500);

    logAuditEvent(
      'CREATE',
      'STUDENT',
      mapped.id,
      {
        enrollmentNumber: mapped.enrollmentNumber,
        course: mapped.course,
        batch: mapped.batch,
        totalFees: mapped.totalFees,
      },
      `${mapped.firstName} ${mapped.lastName}`
    );

    return mapped;
  }, [batches, courses, logAuditEvent]);

  const updateStudent = useCallback(async (id, studentData) => {
    if (!batches || batches.length === 0 || !courses || courses.length === 0) {
      throw new Error('Cannot update student: batches/courses are not loaded from Supabase. Please refresh and try again.');
    }

    // Map UI values to Supabase columns
    const batch = batches.find((b) => b.batch_name === studentData.batch || b.batchName === studentData.batch);
    const course = courses.find((c) =>
      c.course_type === studentData.course ||
      c.course_code === studentData.course ||
      c.course_name === studentData.course
    );

    if (!batch) throw new Error('Batch not found. Please select a valid batch.');
    if (!course) throw new Error('Course not found. Please select a valid course.');

    const payload = {
      first_name: studentData.firstName,
      last_name: studentData.lastName,
      email: studentData.email,
      phone_number: studentData.phone,
      batch_id: batch.id,
      course_id: course.id,
      enrollment_date: studentData.admissionDate,
      total_fees: studentData.totalFees,
      discount: studentData.discount || 0,
      status: studentData.status,
      residential_address: studentData.address || null,
      emergency_contact_name: studentData.guardianName || null,
      emergency_contact_phone: studentData.guardianPhone || null,
    };

    const { data } = await StudentService.update(id, payload);

    // Update local state with the returned data
    const batchLookup = new Map(batches.map((b) => [b.id, b]));
    const courseLookup = new Map(courses.map((c) => [c.id, c]));
    const mapped = mapStudent(data, batchLookup, courseLookup);

    setStudents((prev) =>
      prev.map((student) => (student.id === id ? mapped : student))
    );

    // Log audit event
    const updatedStudentName = `${studentData.firstName} ${studentData.lastName}`;
    logAuditEvent(
      'UPDATE',
      'STUDENT',
      id,
      {
        updatedFields: Object.keys(studentData),
        ...studentData,
      },
      updatedStudentName
    );

    return mapped;
  }, [batches, courses, logAuditEvent]);

  const deleteStudent = useCallback(async (id) => {
    // Get student info before deleting for audit log
    const studentToDelete = students.find((s) => s.id === id);
    const studentName = studentToDelete ? `${studentToDelete.firstName} ${studentToDelete.lastName}` : 'Unknown';
    
    // Delete from Supabase
    await StudentService.delete(id);
    
    // Update local state
    setStudents((prev) => prev.filter((student) => student.id !== id));
    // Also delete associated payments from local state
    setPayments((prev) => prev.filter((payment) => payment.studentId !== id));
    
    // Log audit event
    logAuditEvent(
      'DELETE',
      'STUDENT',
      id,
      {
        enrollmentNumber: studentToDelete?.enrollmentNumber,
        deletedAt: new Date().toISOString(),
      },
      studentName
    );
  }, [students, logAuditEvent]);

  const getStudentById = useCallback(
    (id) => {
      return students.find((student) => student.id === id);
    },
    [students]
  );

  // Get students filtered by current batch (or all if batch is 'all')
  const getFilteredStudents = useCallback(
    (batch = currentBatch) => {
      if (batch === 'all') return students;
      return students.filter((student) => student.batch === batch);
    },
    [students, currentBatch]
  );

  // Get payments filtered by batch (through student's batch)
  const getFilteredPayments = useCallback(
    (batch = currentBatch) => {
      if (batch === 'all') return payments;
      const batchStudentIds = students
        .filter((s) => s.batch === batch)
        .map((s) => s.id);
      return payments.filter((p) => batchStudentIds.includes(p.studentId));
    },
    [students, payments, currentBatch]
  );

  // Placement helpers
  const getPlacementsByBatch = useCallback(
    (batch = currentBatch) => {
      if (batch === 'all') return placements;
      return placements.filter((placement) => placement.batch === batch);
    },
    [placements, currentBatch]
  );

  // Payment operations
  const addPayment = useCallback(async (paymentData) => {
    const student = students.find((s) => s.id === paymentData.studentId);
    if (!student) {
      throw new Error('Student not found');
    }

    const payload = {
      studentId: paymentData.studentId,
      batchId: paymentData.batchId || student.batchId,
      amount: paymentData.amount,
      paymentDate: paymentData.paymentDate,
      paymentMethod: paymentData.paymentMethod,
      bankMoneyReceived: paymentData.bankMoneyReceived || null,
      chequeNumber: paymentData.chequeNumber || null,
      remarks: paymentData.remarks || '',
      receiptNumber: paymentData.receiptNumber,
    };

    const response = await PaymentService.create(payload);
    const created = response.data || response;
    const mappedPayment = mapPayment(created);

    setPayments((prev) => [...prev, mappedPayment]);

    const studentName = `${student.firstName} ${student.lastName}`;

    logAuditEvent(
      'PAYMENT',
      'PAYMENT',
      mappedPayment.id,
      {
        studentId: mappedPayment.studentId,
        amount: mappedPayment.amount,
        paymentMethod: mappedPayment.paymentMethod,
        bankMoneyReceived: mappedPayment.bankMoneyReceived || null,
        chequeNumber: mappedPayment.chequeNumber || null,
        receiptNumber: mappedPayment.receiptNumber,
        paymentDate: mappedPayment.paymentDate,
        remarks: mappedPayment.remarks,
      },
      studentName
    );

    return mappedPayment;
  }, [students, logAuditEvent]);

  const updatePayment = useCallback(async (id, paymentData) => {
    const response = await PaymentService.update(id, paymentData);
    const updated = response.data || response;
    const mappedPayment = mapPayment(updated);

    setPayments((prev) => prev.map((p) => (p.id === id ? mappedPayment : p)));

    // Log audit event
    const student = students.find((s) => s.id === mappedPayment.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown';

    logAuditEvent(
      'PAYMENT',
      'PAYMENT',
      mappedPayment.id,
      {
        studentId: mappedPayment.studentId,
        amount: mappedPayment.amount,
        paymentMethod: mappedPayment.paymentMethod,
        bankMoneyReceived: mappedPayment.bankMoneyReceived || null,
        receiptNumber: mappedPayment.receiptNumber,
        paymentDate: mappedPayment.paymentDate,
        remarks: mappedPayment.remarks,
        status: mappedPayment.status,
      },
      studentName
    );

    return mappedPayment;
  }, [students, logAuditEvent]);

  // Placement installment operations
  const addPlacementInstallment = useCallback(async (placementId, installmentData) => {
    console.log('addPlacementInstallment called:', { placementId, installmentData });
    
    // Find the placement to get student_id
    const placement = placements.find((p) => p.id === placementId);
    if (!placement) {
      throw new Error('Placement not found');
    }

    // Get the next installment number for this placement
    const existingInstallments = placement.installments || [];
    const nextInstallmentNumber = existingInstallments.length + 1;

    // Prepare payload for API
    const payload = {
      placement_id: placementId,
      student_id: placement.studentId,
      installment_number: nextInstallmentNumber,
      amount: installmentData.amount,
      payment_date: installmentData.date || new Date().toISOString().split('T')[0],
      payment_method: installmentData.method || 'cash',
      bank_account: installmentData.bankMoneyReceived || null,
      cheque_number: installmentData.chequeNumber || null,
      payment_location: installmentData.country || null,
      notes: installmentData.remarks || '',
      status: 'completed',
    };

    // Create installment in Supabase
    const response = await PlacementInstallmentService.create(payload);
    const created = response.data || response;

    // Persist placement country if provided for the first time
    const shouldUpdateCountry = Boolean(installmentData.country) && (!placement.country || placement.country === 'TBD');
    if (shouldUpdateCountry) {
      console.log('[addPlacementInstallment] Persisting placement country:', installmentData.country);
      await PlacementService.update(placementId, { placement_location: installmentData.country });
    }

    // Map the created installment
    const newInstallment = {
      id: created.id,
      amount: Number(created.amount || 0),
      date: created.payment_date || created.due_date,
      method: created.payment_method,
      bankMoneyReceived: created.bank_account || null,
      chequeNumber: created.cheque_number || null,
      remarks: created.notes || '',
      status: created.status,
      installmentNumber: created.installment_number,
      paymentLocation: created.payment_location || installmentData.country || null,
    };

    let placementStudentName = 'Unknown Student';
    
    // Update local state
    setPlacements((prev) => {
      return prev.map((p) => {
        if (p.id !== placementId) return p;
        
        const updatedPlacement = {
          ...p,
          installments: [...(p.installments || []), newInstallment],
          // Update country if it's the first installment
          country: (shouldUpdateCountry || (!p.country || p.country === 'TBD'))
            ? (installmentData.country || p.country)
            : p.country,
        };
        
        const student = students.find((s) => s.id === p.studentId);
        placementStudentName = student ? `${student.firstName} ${student.lastName}` : placementStudentName;
        
        console.log('Updated placement:', updatedPlacement);
        return updatedPlacement;
      });
    });

    // Log audit event for placement payment
    logAuditEvent(
      'PLACEMENT_PAYMENT',
      'PLACEMENT',
      placementId,
      {
        placementId,
        studentId: placement.studentId,
        amount: newInstallment.amount,
        paymentMethod: newInstallment.method,
        bankMoneyReceived: newInstallment.bankMoneyReceived,
        chequeNumber: newInstallment.chequeNumber || null,
        paymentDate: newInstallment.date,
        remarks: newInstallment.remarks,
      },
      placementStudentName
    );

    return newInstallment;
  }, [students, placements, logAuditEvent]);

  const updatePlacementInstallment = useCallback(async (installmentId, installmentData) => {
    const payload = {
      amount: installmentData.amount,
      payment_date: installmentData.date,
      payment_method: installmentData.method,
      bank_account: installmentData.bankMoneyReceived || null,
      cheque_number: installmentData.chequeNumber || null,
      notes: installmentData.remarks || '',
    };

    const response = await PlacementInstallmentService.update(installmentId, payload);
    const updated = response.data || response;

    const mappedInstallment = {
      id: updated.id,
      amount: Number(updated.amount || 0),
      date: updated.payment_date || updated.due_date,
      method: updated.payment_method,
      bankMoneyReceived: updated.bank_account || null,
      chequeNumber: updated.cheque_number || null,
      remarks: updated.notes || '',
      status: updated.status,
      installmentNumber: updated.installment_number,
      paymentLocation: updated.payment_location || null,
    };

    setPlacements((prev) =>
      prev.map((p) => {
        const hasInstallment = (p.installments || []).some((inst) => inst.id === installmentId);
        if (!hasInstallment) return p;

        const updatedInstallments = (p.installments || []).map((inst) =>
          inst.id === installmentId ? { ...inst, ...mappedInstallment } : inst
        );

        return {
          ...p,
          installments: updatedInstallments,
        };
      })
    );

    return mappedInstallment;
  }, []);

  // Update placement costs (Company Costing and My Costing)
  const updatePlacementCosts = useCallback(async (placementId, { country = '', companyCosting, myCosting }) => {
    const placement = placements.find((p) => p.id === placementId);
    if (!placement) {
      throw new Error('Placement not found');
    }

    console.log('[updatePlacementCosts] Updating placement:', placementId, { country, companyCosting, myCosting });

    const payload = {
      company_cost: companyCosting,
      institution_cost: myCosting,
      placement_location: country || 'TBD',
      company_name: placement.company || 'To Be Determined',
    };

    console.log('[updatePlacementCosts] Payload:', payload);

    // Update in Supabase
    const response = await PlacementService.update(placementId, payload);
    const updated = response.data || response;

    console.log('[updatePlacementCosts] Response from Supabase:', updated);

    if (!updated) {
      throw new Error('Failed to update placement in Supabase');
    }

    // Update local state
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id === placementId) {
          const updatedPlacement = {
            ...p,
            country: updated.placement_location || country,
            companyCosting: Number(updated.company_cost || 0),
            myCosting: Number(updated.institution_cost || 0),
            profit: Number((updated.institution_cost || 0) - (updated.company_cost || 0)),
            company: updated.company_name,
          };
          console.log('[updatePlacementCosts] Updated placement in state:', updatedPlacement);
          return updatedPlacement;
        }
        return p;
      })
    );

    // Log audit event
    const student = students.find((s) => s.id === placement.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown';
    
    logAuditEvent(
      'UPDATE',
      'PLACEMENT',
      placementId,
      {
        country,
        companyCosting,
        myCosting,
      },
      studentName
    );

    console.log('[updatePlacementCosts] Update completed successfully');
  }, [placements, students, logAuditEvent]);

  // Get audit log with optional filtering
  const getAuditLog = useCallback((filters = {}) => {
    console.log('[StudentContext] getAuditLog called with filters:', filters, 'auditLog length:', auditLog.length);
    let filteredLog = [...auditLog];
    
    if (filters.action) {
      filteredLog = filteredLog.filter((entry) => entry.action === filters.action);
    }
    if (filters.entityType) {
      filteredLog = filteredLog.filter((entry) => entry.entityType === filters.entityType);
    }
    if (filters.startDate) {
      filteredLog = filteredLog.filter((entry) => new Date(entry.timestamp) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      filteredLog = filteredLog.filter((entry) => new Date(entry.timestamp) <= new Date(filters.endDate));
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredLog = filteredLog.filter((entry) => 
        entry.entityName.toLowerCase().includes(searchLower) ||
        entry.action.toLowerCase().includes(searchLower) ||
        entry.entityType.toLowerCase().includes(searchLower)
      );
    }
    
    console.log('[StudentContext] Final filtered log length:', filteredLog.length);
    return filteredLog;
  }, [auditLog, batches]);

  // Clear audit log (admin function)
  const clearAuditLog = useCallback(() => {
    setAuditLog([]);
    setToStorage(STORAGE_KEYS.AUDIT_LOG, []);
  }, []);

  const getPaymentsByStudentId = useCallback(
    (studentId) => {
      return payments.filter((payment) => payment.studentId === studentId);
    },
    [payments]
  );

  // Expense operations
  const addExpense = useCallback(async (expenseData) => {
    try {
      // Convert batch name to batch ID
      let batchId = null;
      if (currentBatch && currentBatch !== 'all') {
        const batch = batches.find((b) => b.batch_name === currentBatch);
        batchId = batch ? batch.id : null;
      }

      const response = await authFetch(`${API_BASE}/expenses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...expenseData,
          batchId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Handle duplicate entry error specifically
        if (response.status === 409 && errorData.code === 'DUPLICATE_EXPENSE') {
          const error = new Error(errorData.message || 'This expense already exists');
          error.code = 'DUPLICATE_EXPENSE';
          throw error;
        }
        
        throw new Error(errorData.error || `Failed to add expense: ${response.statusText}`);
      }

      const { data } = await response.json();

      // Add the new expense, ensuring no duplicates by ID
      setExpenses((prev) => {
        const expenseIds = new Set(prev.map((e) => e.id));
        if (expenseIds.has(data.id)) {
          // Expense already exists, replace it
          return prev.map((e) => (e.id === data.id ? data : e));
        }
        // New expense, add it
        return [data, ...prev];
      });

      logAuditEvent(
        'CREATE',
        'EXPENSE',
        data.id,
        {
          name: data.name,
          amount: data.amount,
          date: data.date,
          transactionType: data.transaction_type,
        },
        data.name
      );

      return data;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw error;
    }
  }, [currentBatch, batches, logAuditEvent]);

  const updateExpense = useCallback(async (id, expenseData) => {
    try {
      const response = await authFetch(`${API_BASE}/expenses/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(expenseData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update expense: ${response.statusText}`);
      }

      const { data } = await response.json();

      setExpenses((prev) => prev.map((exp) => (exp.id === id ? data : exp)));

      logAuditEvent(
        'UPDATE',
        'EXPENSE',
        id,
        {
          name: data.name,
          amount: data.amount,
          date: data.date,
        },
        data.name
      );

      return data;
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }, [logAuditEvent]);

  const deleteExpense = useCallback(async (id) => {
    try {
      const expense = expenses.find((exp) => exp.id === id);
      if (!expense) return;

      const response = await authFetch(`${API_BASE}/expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete expense: ${response.statusText}`);
      }

      setExpenses((prev) => prev.filter((exp) => exp.id !== id));

      logAuditEvent(
        'DELETE',
        'EXPENSE',
        id,
        { name: expense.name, amount: expense.amount },
        expense.name
      );
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }, [expenses, logAuditEvent]);

  const getFilteredExpenses = useCallback(
    (batch = currentBatch) => {
      if (batch === 'all') return expenses;
      
      // Convert batch name to batch ID
      const batchObj = batches.find((b) => b.batch_name === batch);
      const batchId = batchObj ? batchObj.id : null;
      
      if (!batchId) return [];
      return expenses.filter((exp) => exp.batch_id === batchId);
    },
    [expenses, currentBatch, batches]
  );

  const getStudentFeesSummary = useCallback(
    (studentId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) return null;

      const studentPayments = payments.filter((p) => p.studentId === studentId);
      const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      const netTotal = Math.max(0, (student.totalFees || 0) - (student.discount || 0));
      const remaining = Math.max(0, netTotal - totalPaid);
      const percentage = netTotal > 0 ? Math.round((totalPaid / netTotal) * 100) : 0;

      return {
        totalFees: netTotal,
        totalPaid,
        remaining,
        percentage,
        payments: studentPayments,
        status: remaining === 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'pending',
      };
    },
    [students, payments]
  );

  // Analytics helpers
  const getStats = useCallback((batch = currentBatch) => {
    const filteredStudents = batch === 'all' ? students : students.filter(s => s.batch === batch);
    const filteredPayments = batch === 'all' ? payments : payments.filter(p => {
      const student = students.find(s => s.id === p.studentId);
      return student && (batch === 'all' || student.batch === batch);
    });
    
    // Filter placements by batch
    const filteredPlacements = batch === 'all' ? placements : placements.filter(p => p.batch === batch);
    
    const totalStudents = filteredStudents.length;
    const activeStudents = filteredStudents.filter((s) => s.status === 'active').length;
    
    // Calculate revenue from student fee payments (includes all students)
    const feeRevenue = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate revenue from placement installments
    const placementRevenue = filteredPlacements.reduce((sum, placement) => {
      const installmentTotal = (placement.installments || []).reduce((instSum, inst) => {
        return instSum + (inst.amount || 0);
      }, 0);
      return sum + installmentTotal;
    }, 0);
    
    // Total revenue includes both fee payments and placement installments
    const totalRevenue = feeRevenue + placementRevenue;
    
    // Calculate total fees only from active students (exclude dropped-out)
    const totalFees = filteredStudents
      .filter((s) => s.status !== 'dropped')
      .reduce((sum, s) => sum + Math.max(0, (s.totalFees || 0) - (s.discount || 0)), 0);
    const pendingFees = totalFees - feeRevenue; // Only student fees affect pending fees

    // Recent enrollments (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentEnrollments = filteredStudents.filter(
      (s) => new Date(s.createdAt) >= thirtyDaysAgo
    ).length;

    return {
      totalStudents,
      activeStudents,
      totalRevenue,
      totalFees,
      pendingFees,
      recentEnrollments,
      collectionRate: totalFees > 0 ? Math.round((feeRevenue / totalFees) * 100) : 0,
    };
  }, [students, payments, placements, currentBatch]);

  const value = {
    students,
    payments,
    expenses,
    auditLog,
    loading,
    dataLoadError,
    loadRetryCount,
    currentBatch,
    setCurrentBatch,
    customBatches,
    addCustomBatch,
    removeCustomBatch,
    batches,
    courses,
    addStudent,
    updateStudent,
    deleteStudent,
    getStudentById,
    getFilteredStudents,
    getFilteredPayments,
    addPayment,
    updatePayment,
    getPaymentsByStudentId,
    addExpense,
    updateExpense,
    deleteExpense,
    getFilteredExpenses,
    getStudentFeesSummary,
    getStats,
    getAuditLog,
    clearAuditLog,
    placements,
    getPlacementsByBatch,
    addPlacementInstallment,
    updatePlacementInstallment,
    updatePlacementCosts,
    loadSupabaseData,
  };

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
};

export const useStudents = () => {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error('useStudents must be used within a StudentProvider');
  }
  return context;
};

export default StudentContext;
