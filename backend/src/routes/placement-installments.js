import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, requireAdmin, requireAuditorOrAdmin } from '../middleware/authorize.js';
import { logger } from '../utils/logger.js';

const router = Router();

async function resolveBatchId(sb, { placementId, studentId }) {
  if (placementId) {
    const { data: placementData, error: placementError } = await sb
      .from('placements')
      .select('batch_id, student_id')
      .eq('id', placementId)
      .single();

    if (!placementError && placementData?.batch_id) {
      return placementData.batch_id;
    }

    if (!studentId && placementData?.student_id) {
      studentId = placementData.student_id;
    }
  }

  if (studentId) {
    const { data: studentData, error: studentError } = await sb
      .from('students')
      .select('batch_id')
      .eq('id', studentId)
      .single();

    if (!studentError && studentData?.batch_id) {
      return studentData.batch_id;
    }
  }

  return null;
}

// Apply authentication and role checking
router.use(authenticateToken);
router.use(attachUserRole);
router.use(requireAuditorOrAdmin);

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
    
    logger.audit('CREATE_PLACEMENT_INSTALLMENT', installmentData.placement_id, req.user?.id);
    
    // Check for duplicate placement installment
    // Prevent recording the same installment twice (same placement, amount, date)
    const { data: existingInstallments, error: checkError } = await sb
      .from('placement_installments')
      .select('id, payment_date, created_at')
      .eq('placement_id', installmentData.placement_id)
      .eq('amount', installmentData.amount)
      .eq('payment_date', installmentData.payment_date);

    if (checkError) {
      logger.error('[placement-installments] Error checking for duplicates', checkError);
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
    const created = data?.[0];
    try {
      if (created) {
        console.log('[placement-installments] Starting audit log creation for installment:', created.id);
        console.log('[placement-installments] Created installment data:', JSON.stringify(created, null, 2));
        
        // Fetch batch_id from placement or student
        let batchId = null;
        try {
          batchId = await resolveBatchId(sb, {
            placementId: created.placement_id,
            studentId: created.student_id,
          });

          if (batchId) {
            logger.debug('[placement-installments] Resolved batch_id');
          } else {
            console.warn('[placement-installments] WARNING: Could not find batch_id for installment:', created.id);
          }
        } catch (e) {
          console.warn('[placement-installments] Exception fetching batch_id:', e);
        }

        // Fetch student name for audit log entity_name
        let entityName = 'Placement Payment';
        const installmentType = created.installment_type || 'my_costing'; // Fallback if column doesn't exist
        const isCompanyPayment = installmentType === 'company_costing';
        console.log('[placement-installments] Installment type:', installmentType, 'isCompanyPayment:', isCompanyPayment);
        
        try {
          const { data: studentData, error: studentError } = await sb
            .from('students')
            .select('first_name, last_name')
            .eq('id', created.student_id)
            .single();

          if (!studentError && studentData) {
            const studentName = `${studentData.first_name} ${studentData.last_name}`;
            if (isCompanyPayment) {
              entityName = `${studentName} - Company Payment #${created.installment_number || 1}`;
            } else {
              entityName = `${studentName} - Placement Installment #${created.installment_number || 1}`;
            }
            logger.debug('[placement-installments] Resolved student name for audit log');
          } else {
            console.warn('[placement-installments] Could not fetch student name:', studentError);
          }
        } catch (e) {
          console.warn('[placement-installments] Exception fetching student name:', e);
        }

        const auditPayload = {
          action: isCompanyPayment ? 'COMPANY_PAYMENT_DEBIT' : 'PLACEMENT_PAYMENT',
          entity_type: 'PLACEMENT',
          entity_id: created.placement_id,
          entity_name: entityName,
          batch_id: batchId,
          amount: created.amount,
          details: {
            studentName: entityName.split(' - ')[0], // Extract student name from entity_name
            installmentNumber: created.installment_number,
            paymentMethod: created.payment_method,
            bankMoneyReceived: created.bank_account || null,
            chequeNumber: created.cheque_number || null,
            remarks: created.notes || '',
            studentId: created.student_id,
            installmentType: created.installment_type || 'my_costing',
            transactionType: isCompanyPayment ? 'debit' : 'credit',
          },
          transaction_date: created.payment_date || created.due_date || new Date().toISOString().slice(0,10),
        };
        
        console.log('[placement-installments] Inserting audit log with payload:', JSON.stringify(auditPayload, null, 2));
        
        const { data: auditData, error: auditError } = await sb.from('audit_logs').insert([auditPayload]).select();

        if (auditError) {
          console.error('[placement-installments] Audit log insert error:', auditError);
          console.error('[placement-installments] Audit payload was:', JSON.stringify(auditPayload, null, 2));
          logger.error('[placement-installments] Audit log insert error', auditError);
          // CRITICAL: Roll back installment if audit fails
          await sb.from('placement_installments').delete().eq('id', created.id);
          throw new Error(`Failed to create audit trail - ${auditError.message || 'Unknown error'}`);
        }
        
        logger.debug('[placement-installments] Audit log created successfully');
      }
    } catch (auditError) {
      logger.error('[placement-installments] Failed to write audit log', auditError);
      // CRITICAL: Roll back if audit logging fails
      if (created?.id) {
        await sb.from('placement_installments').delete().eq('id', created.id);
      }
      throw new Error('Failed to create audit trail - installment creation aborted');
    }
    res.status(201).json({ data: data[0] });
  } catch (err) {
    logger.error('[placement-installments] POST error', err);
    next(err);
  }
});

// PUT update installment
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
    logger.audit('UPDATE_PLACEMENT_INSTALLMENT', id, req.user?.id);
    
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
      logger.error('[placement-installments] Update failed', error);
      const sanitized = sanitizeDbError(error);
      throw new Error(sanitized);
    }
    
    logger.audit('INSTALLMENT_UPDATED', id, req.user?.id);

    // Write audit log for installment update (best-effort)
    try {
      const updated = data?.[0];
      if (updated) {
        // Fetch batch_id from placement or student
        let batchId = null;
        try {
          batchId = await resolveBatchId(sb, {
            placementId: updated.placement_id,
            studentId: updated.student_id,
          });
        } catch (e) {
          console.warn('[placement-installments] Could not fetch batch_id:', e);
        }

        // Fetch student name for audit log entity_name
        let entityName = 'Placement Payment';
        try {
          const { data: studentData, error: studentError } = await sb
            .from('students')
            .select('first_name, last_name')
            .eq('id', updated.student_id)
            .single();

          if (!studentError && studentData) {
            const studentName = `${studentData.first_name} ${studentData.last_name}`;
            entityName = `${studentName} - Placement Installment #${updated.installment_number || 1}`;
          }
        } catch (e) {
          console.warn('[placement-installments] Exception fetching student name:', e);
        }

        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'UPDATE',
            entity_type: 'PLACEMENT',
            entity_id: updated.placement_id,
            entity_name: entityName,
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
      logger.error('[placement-installments] Failed to write audit log (UPDATE)', auditError);
      throw new Error('Failed to create audit trail - update aborted');
    }

    res.json({ data: data[0] });
  } catch (err) {
    logger.error('[placement-installments] PUT error', err);
    next(err);
  }
});

// DELETE installment
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    logger.audit('DELETE_PLACEMENT_INSTALLMENT', id, req.user?.id);

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
      logger.error('[placement-installments] Insert failed', error);
      const sanitized = sanitizeDbError(error);
      throw new Error(sanitized);
    }
    
    console.log('[placement-installments] Installment deleted');

    // Write audit log for installment deletion (best-effort)
    try {
      if (installmentToDelete) {
        // Fetch batch_id from placement or student
        let batchId = null;
        try {
          batchId = await resolveBatchId(sb, {
            placementId: installmentToDelete.placement_id,
            studentId: installmentToDelete.student_id,
          });
        } catch (e) {
          console.warn('[placement-installments] Could not fetch batch_id:', e);
        }

        // Fetch student name for audit log entity_name
        let entityName = 'Placement Payment';
        try {
          const { data: studentData, error: studentError } = await sb
            .from('students')
            .select('first_name, last_name')
            .eq('id', installmentToDelete.student_id)
            .single();

          if (!studentError && studentData) {
            const studentName = `${studentData.first_name} ${studentData.last_name}`;
            entityName = `${studentName} - Placement Installment #${installmentToDelete.installment_number || 1}`;
          }
        } catch (e) {
          console.warn('[placement-installments] Exception fetching student name:', e);
        }

        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'DELETE',
            entity_type: 'PLACEMENT',
            entity_id: installmentToDelete.placement_id,
            entity_name: entityName,
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
      logger.error('[placement-installments] Failed to write audit log (DELETE)', auditError);
    }

    res.json({ message: 'Installment deleted successfully' });
  } catch (err) {
    logger.error('[placement-installments] DELETE error', err);
    next(err);
  }
});

export default router;
