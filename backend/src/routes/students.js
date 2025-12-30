import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';

const router = Router();

// Apply authentication and role checking to all student routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET all students
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { batchId, limit } = req.query;
    const pageLimit = Number(limit) > 0 ? Math.min(Number(limit), 100) : 50;

    let query = sb.from('students').select('*');
    if (batchId) query = query.eq('batch_id', batchId);
    query = query.order('created_at', { ascending: false }).range(0, pageLimit - 1);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET single student
router.get('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    const { data, error } = await sb
      .from('students')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST create new student
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const studentData = req.body;
    
    console.log('[students] Creating student:', studentData);
    
    const { data, error } = await sb
      .from('students')
      .insert([studentData])
      .select();
    
    if (error) {
      console.error('[students] Insert error:', error);
      throw error;
    }
    
    const createdStudent = data?.[0];
    console.log('[students] Student created:', createdStudent);

    // Auto-create a placeholder placement row so the student appears in placements views
    if (createdStudent) {
      try {
        const placeholderPayload = {
          student_id: createdStudent.id,
          batch_id: createdStudent.batch_id,
          company_name: 'TBD',
          placement_location: 'TBD',
          company_cost: 1, // must be > 0 per constraint; update later with real value
          institution_cost: 1, // must be > 0 per constraint; update later with real value
          placement_date: new Date().toISOString().slice(0, 10),
          notes: 'Auto-created placeholder. Update with real placement details.',
        };

        const { error: placementError } = await sb
          .from('placements')
          .insert([placeholderPayload]);

        if (placementError) {
          console.warn('[students] Placement placeholder insert failed (non-fatal):', placementError);
        }
      } catch (placementCatchErr) {
        console.warn('[students] Placement placeholder creation threw (non-fatal):', placementCatchErr);
      }
    }

    // Write audit log for student creation (best-effort)
    try {
      if (createdStudent) {
        await sb.from('audit_logs').insert([
          {
            action: 'CREATE',
            entity_type: 'STUDENT',
            entity_id: createdStudent.id,
            entity_name: `${createdStudent.first_name} ${createdStudent.last_name}`,
            batch_id: createdStudent.batch_id,
            amount: null,
            details: {
              enrollmentNumber: createdStudent.enrollment_number,
              totalFees: createdStudent.total_fees,
            },
            transaction_date: new Date().toISOString().slice(0,10),
          },
        ]);
      }
    } catch (auditError) {
      console.error('[students] Failed to write audit log (CREATE):', auditError);
    }

    res.status(201).json({ data: createdStudent });
  } catch (err) {
    console.error('[students] POST error:', err);
    next(err);
  }
});

// PUT update student
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('[students] Updating student:', id, updateData);
    
    const { data, error } = await sb
      .from('students')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('[students] Update error:', error);
      throw error;
    }
    
    console.log('[students] Student updated:', data);

    // Write audit log for student update (best-effort)
    try {
      const updated = data?.[0];
      if (updated) {
        await sb.from('audit_logs').insert([
          {
            action: 'UPDATE',
            entity_type: 'STUDENT',
            entity_id: updated.id,
            entity_name: `${updated.first_name} ${updated.last_name}`,
            batch_id: updated.batch_id,
            amount: null,
            details: updateData,
            transaction_date: new Date().toISOString().slice(0,10),
          },
        ]);
      }
    } catch (auditError) {
      console.error('[students] Failed to write audit log (UPDATE):', auditError);
    }
    res.json({ data: data[0] });
  } catch (err) {
    console.error('[students] PUT error:', err);
    next(err);
  }
});

// DELETE student
router.delete('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    console.log('[students] Deleting student:', id);
    
    const { error } = await sb
      .from('students')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[students] Delete error:', error);
      throw error;
    }
    
    console.log('[students] Student deleted:', id);

    // Write audit log for student delete (best-effort)
    try {
      await sb.from('audit_logs').insert([
        {
          action: 'DELETE',
          entity_type: 'STUDENT',
          entity_id: id,
          entity_name: 'Student',
          batch_id: null,
          amount: null,
          details: {},
          transaction_date: new Date().toISOString().slice(0,10),
        },
      ]);
    } catch (auditError) {
      console.error('[students] Failed to write audit log (DELETE):', auditError);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[students] DELETE error:', err);
    next(err);
  }
});

export default router;
