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
    
    // Check for duplicate placement installment
    // Prevent recording the same installment twice (same placement, amount, date)
    const { data: existingInstallments, error: checkError } = await sb
      .from('placement_installments')
      .select('id, payment_date, created_at')
      .eq('placement_id', installmentData.placement_id)
      .eq('amount', installmentData.amount)
      .eq('payment_date', installmentData.payment_date);

    if (checkError) {
      console.error('[placement-installments] Error checking for duplicates:', checkError);
      // Don't fail entirely due to duplicate check error
    } else if (existingInstallments && existingInstallments.length > 0) {
      // Duplicate found
      const existingInstallment = existingInstallments[0];
      console.warn(`[placement-installments] Duplicate installment detected: placement=${installmentData.placement_id}, amount=${installmentData.amount}, date=${installmentData.payment_date}`);
      return res.status(409).json({
        error: 'A placement installment with the same amount on the same date already exists',
        details: {
          message: 'Duplicate installment payment prevented',
          existingInstallmentId: existingInstallment.id,
          existingPaymentDate: existingInstallment.payment_date,
          existingCreatedAt: existingInstallment.created_at,
          placementId: installmentData.placement_id,
          amount: installmentData.amount,
          paymentDate: installmentData.payment_date,
        },
      });
    }
    
    const { data, error } = await sb
      .from('placement_installments')
      .insert([installmentData])
      .select();
    
    if (error) {
      console.error('[placement-installments] Insert error:', error);
      // Handle unique constraint violation
      if (error.code === '23505' || error.message.includes('unique')) {
        console.warn(`[placement-installments] Unique constraint violation: ${error.message}`);
        return res.status(409).json({
          error: 'A placement installment with these details already exists (duplicate)',
          details: {
            message: 'This installment payment has already been recorded',
            placementId: installmentData.placement_id,
            amount: installmentData.amount,
            paymentDate: installmentData.payment_date,
          },
        });
      }
      throw error;
    }
    
    console.log('[placement-installments] Installment created:', data);

    // Write audit log for placement payment (best-effort)
    try {
      const created = data?.[0];
      if (created) {
        console.log('[placement-installments] Starting audit log creation for installment:', created.id);
        
        // Fetch student to get batch_id - CRITICAL: Always populate batch_id
        let batchId = null;
        try {
          const { data: studentData, error: studentError } = await sb
            .from('user_profiles')
            .select('batch_id')
            .eq('id', created.student_id)
            .single();
          
          if (!studentError && studentData && studentData.batch_id) {
            batchId = studentData.batch_id;
            console.log('[placement-installments] Found batch_id from user_profiles:', batchId);
          } else {
            console.warn('[placement-installments] No batch_id in user_profiles, trying placement record');
            
            // Fallback: Get batch_id from placement via its student's batch
            const { data: placementData, error: placementError } = await sb
              .from('placements')
              .select('student_id')
              .eq('id', created.placement_id)
              .single();
            
            if (!placementError && placementData) {
              const { data: student2, error: student2Error } = await sb
                .from('user_profiles')
                .select('batch_id')
                .eq('id', placementData.student_id)
                .single();
              
              if (!student2Error && student2 && student2.batch_id) {
                batchId = student2.batch_id;
                console.log('[placement-installments] Found batch_id from placement student:', batchId);
              }
            }
          }
          
          if (!batchId) {
            console.warn('[placement-installments] WARNING: Could not find batch_id for student:', created.student_id);
          }
        } catch (e) {
          console.warn('[placement-installments] Exception fetching batch_id:', e);
        }

        const auditPayload = {
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
        };
        
        console.log('[placement-installments] Inserting audit log with payload:', JSON.stringify(auditPayload, null, 2));
        
        const { data: auditData, error: auditError } = await sb.from('audit_logs').insert([auditPayload]).select();

        if (auditError) {
          console.error('[placement-installments] Audit log insert error:', auditError);
          throw auditError;
        }
        
        console.log('[placement-installments] Audit log created successfully:', auditData);
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
