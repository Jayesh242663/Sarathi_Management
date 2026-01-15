import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';

const router = Router();

// Apply authentication and role checking
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET installments by placement
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { placementId } = req.query;

    let query = sb.from('placement_installments').select('*');
    if (placementId) {
      query = query.eq('placement_id', placementId);
    }
    query = query.order('payment_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST create new installment
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const installmentData = req.body;
    
    console.log('[placement-installments] Creating installment:', installmentData);
    
    const { data, error } = await sb
      .from('placement_installments')
      .insert([installmentData])
      .select();
    
    if (error) {
      console.error('[placement-installments] Insert error:', error);
      throw error;
    }
    
    console.log('[placement-installments] Installment created:', data);

    // Write audit log for placement payment (best-effort)
    try {
      const created = data?.[0];
      if (created) {
        // Fetch student to get batch_id
        let batchId = null;
        try {
          const { data: studentData, error: studentError } = await sb
            .from('user_profiles')
            .select('batch_id')
            .eq('id', created.student_id)
            .single();
          if (!studentError && studentData) {
            batchId = studentData.batch_id;
          }
        } catch (e) {
          console.warn('[placement-installments] Could not fetch student batch:', e);
        }

        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'PLACEMENT_PAYMENT',
            entity_type: 'PLACEMENT',
            entity_id: created.placement_id,
            entity_name: 'Placement Payment',
            batch_id: batchId,
            amount: created.amount,
            details: {
              installmentNumber: created.installment_number,
              paymentMethod: created.payment_method,
              bankMoneyReceived: created.bank_account || null,
              chequeNumber: created.cheque_number || null,
              remarks: created.notes || '',
              studentId: created.student_id,
            },
            transaction_date: created.payment_date || created.due_date || new Date().toISOString().slice(0,10),
          },
        ]);

        if (auditError) throw auditError;
      }
    } catch (auditError) {
      console.error('[placement-installments] Failed to write audit log:', auditError);
    }
    res.status(201).json({ data: data[0] });
  } catch (err) {
    console.error('[placement-installments] POST error:', err);
    next(err);
  }
});

// PUT update installment
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('[placement-installments] Updating installment:', id, updateData);
    
    // Fetch current installment for batch_id and student_id
    const { data: currentInstallment, error: fetchError } = await sb
      .from('placement_installments')
      .select('student_id, placement_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    
    const { data, error } = await sb
      .from('placement_installments')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('[placement-installments] Update error:', error);
      throw error;
    }
    
    console.log('[placement-installments] Installment updated:', data);

    // Write audit log for installment update (best-effort)
    try {
      const updated = data?.[0];
      if (updated) {
        // Fetch student to get batch_id
        let batchId = null;
        try {
          const { data: studentData, error: studentError } = await sb
            .from('user_profiles')
            .select('batch_id')
            .eq('id', updated.student_id)
            .single();
          if (!studentError && studentData) {
            batchId = studentData.batch_id;
          }
        } catch (e) {
          console.warn('[placement-installments] Could not fetch student batch:', e);
        }

        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'UPDATE',
            entity_type: 'PLACEMENT',
            entity_id: updated.placement_id,
            entity_name: 'Placement Payment',
            batch_id: batchId,
            amount: updated.amount,
            details: {
              installmentNumber: updated.installment_number,
              paymentMethod: updated.payment_method,
              bankMoneyReceived: updated.bank_account || null,
              chequeNumber: updated.cheque_number || null,
              remarks: updated.notes || '',
              studentId: updated.student_id,
              updatedFields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
            },
            transaction_date: updated.payment_date || updated.due_date || new Date().toISOString().slice(0,10),
          },
        ]);

        if (auditError) throw auditError;
      }
    } catch (auditError) {
      console.error('[placement-installments] Failed to write audit log (UPDATE):', auditError);
    }

    res.json({ data: data[0] });
  } catch (err) {
    console.error('[placement-installments] PUT error:', err);
    next(err);
  }
});

// DELETE installment
router.delete('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    console.log('[placement-installments] Deleting installment:', id);

    // Fetch installment details before deletion for audit log
    const { data: installmentToDelete, error: fetchError } = await sb
      .from('placement_installments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    
    const { error } = await sb
      .from('placement_installments')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[placement-installments] Delete error:', error);
      throw error;
    }
    
    console.log('[placement-installments] Installment deleted');

    // Write audit log for installment deletion (best-effort)
    try {
      if (installmentToDelete) {
        // Fetch student to get batch_id
        let batchId = null;
        try {
          const { data: studentData, error: studentError } = await sb
            .from('user_profiles')
            .select('batch_id')
            .eq('id', installmentToDelete.student_id)
            .single();
          if (!studentError && studentData) {
            batchId = studentData.batch_id;
          }
        } catch (e) {
          console.warn('[placement-installments] Could not fetch student batch:', e);
        }

        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'DELETE',
            entity_type: 'PLACEMENT',
            entity_id: installmentToDelete.placement_id,
            entity_name: 'Placement Payment',
            batch_id: batchId,
            amount: installmentToDelete.amount,
            details: {
              installmentNumber: installmentToDelete.installment_number,
              paymentMethod: installmentToDelete.payment_method,
              studentId: installmentToDelete.student_id,
              deletedId: id,
            },
            transaction_date: installmentToDelete.payment_date || installmentToDelete.due_date || new Date().toISOString().slice(0,10),
          },
        ]);

        if (auditError) throw auditError;
      }
    } catch (auditError) {
      console.error('[placement-installments] Failed to write audit log (DELETE):', auditError);
    }

    res.json({ message: 'Installment deleted successfully' });
  } catch (err) {
    console.error('[placement-installments] DELETE error:', err);
    next(err);
  }
});

export default router;
