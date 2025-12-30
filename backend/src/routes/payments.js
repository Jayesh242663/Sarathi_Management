import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';

const router = Router();

// Secure all payment routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET payments (filterable by student or batch)
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { studentId, batchId, limit } = req.query;
    const pageLimit = Number(limit) > 0 ? Math.min(Number(limit), 200) : 200;

    let query = sb.from('payments').select('*');
    if (studentId) query = query.eq('student_id', studentId);
    if (batchId) query = query.eq('batch_id', batchId);

    const { data, error } = await query
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(pageLimit);

    if (error) throw error;
    res.json({ data });
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
    const sb = requireSupabase();
    const {
      studentId,
      batchId: batchIdFromPayload,
      amount,
      paymentDate,
      paymentMethod,
      bankMoneyReceived,
      remarks,
      receiptNumber,
    } = req.body;

    if (!studentId || !amount || !paymentDate || !paymentMethod) {
      return res.status(400).json({
        error: 'studentId, amount, paymentDate, and paymentMethod are required',
      });
    }

    // Fetch student to derive batch_id and name (and validate existence)
    const { data: student, error: studentError } = await sb
      .from('students')
      .select('id, batch_id, first_name, last_name')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const payload = {
      student_id: studentId,
      batch_id: batchIdFromPayload || student.batch_id,
      amount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      bank_account: bankMoneyReceived || null,
      notes: remarks || '',
      status: 'completed',
      receipt_number: receiptNumber || buildReceiptNumber(),
    };

    const { data, error } = await sb
      .from('payments')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Record audit log (best-effort)
    try {
      await sb.from('audit_logs').insert([
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
            receiptNumber: data.receipt_number,
            remarks: remarks || '',
          },
          transaction_date: paymentDate,
        },
      ]);
    } catch (auditError) {
      // Non-fatal; log and continue
      console.error('[payments] Failed to write audit log:', auditError);
    }

    res.status(201).json({ data });
  } catch (err) {
    console.error('[payments] POST error:', err);
    next(err);
  }
});

// PUT update payment (amount, method, notes, status)
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body || {};

    const { data, error } = await sb
      .from('payments')
      .update({
        amount: updateData.amount,
        payment_date: updateData.paymentDate,
        payment_method: updateData.paymentMethod,
        bank_account: updateData.bankMoneyReceived,
        notes: updateData.remarks,
        status: updateData.status,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[payments] PUT error:', err);
    next(err);
  }
});

export default router;