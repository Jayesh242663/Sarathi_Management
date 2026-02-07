import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';
import { logger } from '../utils/logger.js';
import { sanitizeDbError } from '../utils/sanitizeError.js';

const router = Router();

// Input validation schemas
const paymentCreateSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  batchId: z.string().uuid().optional(),
  amount: z.number().positive('Amount must be a positive number'),
  paymentDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    'Invalid payment date'
  ),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque'], {
    errorMap: () => ({ message: 'Invalid payment method' })
  }),
  bankMoneyReceived: z.string().max(100).optional().nullable(),
  chequeNumber: z.string().max(50).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
  receiptNumber: z.string().max(100).optional().nullable(),
});

// Secure all payment routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET payments (filterable by student or batch)
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { studentId, batchId } = req.query;
    
    // Validate query parameters
    if (studentId && !z.string().uuid().safeParse(studentId).success) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }
    if (batchId && !z.string().uuid().safeParse(batchId).success) {
      return res.status(400).json({ error: 'Invalid batch ID format' });
    }
    
    // Parse pagination
    const { page, limit, offset } = parsePagination(req.query);

    // Build count query
    let countQuery = sb.from('payments').select('*', { count: 'exact', head: true });
    if (studentId) countQuery = countQuery.eq('student_id', studentId);
    if (batchId) countQuery = countQuery.eq('batch_id', batchId);
    
    // Build data query
    let dataQuery = sb.from('payments').select('*');
    if (studentId) dataQuery = dataQuery.eq('student_id', studentId);
    if (batchId) dataQuery = dataQuery.eq('batch_id', batchId);

    // Execute queries
    const [{ count }, { data, error }] = await Promise.all([
      countQuery,
      applyPagination(
        dataQuery.order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
        offset,
        limit
      )
    ]);

    if (error) throw error;
    res.json(formatPaginatedResponse(data, count || 0, page, limit));
  } catch (err) {
    next(err);
  }
});

const buildReceiptNumber = () => {
  const year = new Date().getFullYear();
  const randomPart = String(Date.now()).slice(-6);
  return `REC-${year}-${randomPart}`;
};

// POST create new payment
router.post('/', async (req, res, next) => {
  try {
    // Validate input
    const validation = paymentCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }

    const {
      studentId,
      batchId: batchIdFromPayload,
      amount,
      paymentDate,
      paymentMethod,
      bankMoneyReceived,
      chequeNumber,
      remarks,
      receiptNumber,
    } = validation.data;

    // Additional validation: amount should not exceed 10 million
    if (amount > 10000000) {
      return res.status(400).json({
        error: 'Amount exceeds maximum allowed value (10,000,000)'
      });
    }

    // Validate payment date is not in the future
    const paymentDateObj = new Date(paymentDate);
    if (paymentDateObj > new Date()) {
      return res.status(400).json({
        error: 'Payment date cannot be in the future'
      });
    }

    const sb = requireSupabase();

    // Fetch student to derive batch_id and name (and validate existence)
    const { data: student, error: studentError } = await sb
      .from('students')
      .select('id, batch_id, first_name, last_name')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check for duplicate payments (same student, amount, and date)
    const { data: existingPayments, error: checkError } = await sb
      .from('payments')
      .select('id, receipt_number, created_at')
      .eq('student_id', studentId)
      .eq('amount', amount)
      .eq('payment_date', paymentDate)
      .eq('status', 'completed');

    if (checkError) {
      logger.error('[payments] Error checking for duplicates', checkError);
      // Don't fail the entire request due to duplicate check error
    } else if (existingPayments && existingPayments.length > 0) {
      // Duplicate found
      const existingPayment = existingPayments[0];
      console.warn(`[payments] Duplicate payment detected: student=${studentId}, amount=${amount}, date=${paymentDate}`);
      return res.status(409).json({
        error: 'A payment with the same amount on the same date already exists for this student',
        details: {
          message: 'Duplicate payment prevented',
          existingPaymentId: existingPayment.id,
          existingReceiptNumber: existingPayment.receipt_number,
          existingCreatedAt: existingPayment.created_at,
          studentId,
          amount,
          paymentDate,
        },
      });
    }

    const payload = {
      student_id: studentId,
      batch_id: batchIdFromPayload || student.batch_id,
      amount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      bank_account: bankMoneyReceived || null,
      cheque_number: chequeNumber || null,
      notes: remarks || '',
      status: 'completed',
      receipt_number: receiptNumber || buildReceiptNumber(),
    };

    const { data, error } = await sb
      .from('payments')
      .insert([payload])
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation specifically
      if (error.code === '23505' || error.message.includes('unique')) {
        console.warn(`[payments] Unique constraint violation: ${error.message}`);
        return res.status(409).json({
          error: 'A payment with these details already exists (duplicate)',
          details: {
            message: 'This payment has already been recorded',
            studentId,
            amount,
            paymentDate,
          },
        });
      }
      throw error;
    }

    // Record audit log (best-effort)
    try {
      const { error: auditError } = await sb.from('audit_logs').insert([
        {
          action: 'PAYMENT',
          entity_type: 'PAYMENT',
          entity_id: data.id,
          entity_name: `${student.first_name} ${student.last_name}`,
          batch_id: data.batch_id,
          amount: data.amount,
          details: {
            paymentMethod,
            bankMoneyReceived: bankMoneyReceived || null,
            chequeNumber: chequeNumber || null,
            receiptNumber: data.receipt_number,
            remarks: remarks || '',
          },
          transaction_date: paymentDate,
        },
      ]);

      if (auditError) throw auditError;
    } catch (auditError) {
      // Non-fatal; log and continue
      logger.error('[payments] Failed to write audit log', auditError);
      // CRITICAL: Roll back payment if audit fails
      await sb.from('payments').delete().eq('id', created.id);
      throw new Error('Failed to create audit trail - payment creation aborted');
    }

    res.status(201).json({ data });
  } catch (err) {
    logger.error('[payments] POST error', err);
    next(err);
  }
});

// PUT update payment (amount, method, notes, status)
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body || {};

    // Fetch current payment for student info
    const { data: currentPayment, error: fetchError } = await sb
      .from('payments')
      .select('student_id, batch_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await sb
      .from('payments')
      .update({
        amount: updateData.amount,
        payment_date: updateData.paymentDate,
        payment_method: updateData.paymentMethod,
        bank_account: updateData.bankMoneyReceived,
        cheque_number: updateData.chequeNumber || null,
        notes: updateData.remarks,
        status: updateData.status,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Record audit log for payment update (best-effort)
    try {
      // Get student name
      const { data: student } = await sb
        .from('students')
        .select('first_name, last_name')
        .eq('id', currentPayment.student_id)
        .single();

      const { error: auditError } = await sb.from('audit_logs').insert([
        {
          action: 'UPDATE',
          entity_type: 'PAYMENT',
          entity_id: id,
          entity_name: student ? `${student.first_name} ${student.last_name}` : 'Payment',
          batch_id: currentPayment.batch_id,
          amount: data.amount,
          details: {
            updatedFields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
            paymentMethod: data.payment_method,
            bankMoneyReceived: data.bank_account || null,
            chequeNumber: data.cheque_number || null,
            receiptNumber: data.receipt_number,
            remarks: data.notes || '',
          },
          transaction_date: data.payment_date,
        },
      ]);

      if (auditError) throw auditError;
    } catch (auditError) {
      logger.error('[payments] Failed to write audit log (UPDATE)', auditError);
      // CRITICAL: Updates must be audited
      throw new Error('Failed to create audit trail - update aborted');
    }

    res.json({ data });
  } catch (err) {
    logger.error('[payments] PUT error', err);
    next(err);
  }
});

export default router;