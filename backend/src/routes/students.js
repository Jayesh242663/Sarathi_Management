import { Router } from 'express';
import { requireSupabase, serviceKeyRole } from '../config/supabase.js';
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
    console.log('[students] serviceKeyRole:', serviceKeyRole);
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
    console.log('[students] serviceKeyRole before insert:', serviceKeyRole);
    // Accept either batch_id or batch (name) and course_id or course (code/name)
    const payload = { ...studentData };

    // Resolve batch if provided by name
    if (!payload.batch_id && payload.batch) {
      const batchName = payload.batch;
      const { data: batchRow, error: batchErr } = await sb
        .from('batches')
        .select('id')
        .eq('batch_name', batchName)
        .maybeSingle();
      if (batchErr) {
        console.error('[students] Batch lookup error:', batchErr);
        throw batchErr;
      }
      if (!batchRow) {
        const msg = `Batch not found: ${batchName}`;
        console.error('[students] ', msg);
        const err = new Error(msg);
        err.status = 400;
        throw err;
      }
      payload.batch_id = batchRow.id;
    }

    // Resolve course if provided by code/name
    if (!payload.course_id && payload.course) {
      const courseKey = payload.course;
      const { data: courseRow, error: courseErr } = await sb
        .from('courses')
        .select('id')
        .or(`course_code.eq.${courseKey},course_name.eq.${courseKey}`)
        .maybeSingle();
      if (courseErr) {
        console.error('[students] Course lookup error:', courseErr);
        throw courseErr;
      }
      if (!courseRow) {
        const msg = `Course not found: ${courseKey}`;
        console.error('[students] ', msg);
        const err = new Error(msg);
        err.status = 400;
        throw err;
      }
      payload.course_id = courseRow.id;
    }

    // Ensure required foreign keys are present
    if (!payload.batch_id) {
      const err = new Error('Missing batch_id for student');
      err.status = 400;
      throw err;
    }
    if (!payload.course_id) {
      const err = new Error('Missing course_id for student');
      err.status = 400;
      throw err;
    }

    // Map some common frontend keys to DB column names if necessary
    // If the client sent snake_case already, these will be no-ops
    const dbPayload = {
      enrollment_number: payload.enrollment_number || payload.enrollmentNumber,
      first_name: payload.first_name || payload.firstName,
      last_name: payload.last_name || payload.lastName,
      email: payload.email,
      phone_number: payload.phone_number || payload.phone || payload.phoneNumber,
      batch_id: payload.batch_id,
      course_id: payload.course_id,
      enrollment_date: payload.enrollment_date || payload.admissionDate || payload.enrollmentDate,
      residential_address: payload.residential_address || payload.address,
      emergency_contact_name: payload.emergency_contact_name || payload.guardianName,
      emergency_contact_phone: payload.emergency_contact_phone || payload.guardianPhone,
      total_fees: payload.total_fees || payload.totalFees,
      discount: payload.discount !== undefined ? payload.discount : (payload.discount_amount || 0),
      status: payload.status || 'active',
      notes: payload.notes || null,
    };

    const { data, error } = await sb
      .from('students')
      .insert([dbPayload])
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
