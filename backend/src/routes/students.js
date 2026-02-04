import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, serviceKeyRole } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';

const router = Router();

// Input validation schemas
const studentCreateSchema = z.object({
  enrollment_number: z.string().min(1, 'Enrollment number is required'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email().optional().nullable(),
  phone_number: z.string().max(20).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  phoneNumber: z.string().max(20).optional().nullable(),
  batch_id: z.string().uuid().optional(),
  batch: z.string().optional(),
  course_id: z.string().uuid().optional(),
  course: z.string().optional(),
  enrollment_date: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    'Invalid enrollment date'
  ).optional(),
  admissionDate: z.string().optional(),
  enrollmentDate: z.string().optional(),
  residential_address: z.string().max(500).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergency_contact_name: z.string().max(100).optional().nullable(),
  guardianName: z.string().max(100).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  guardianPhone: z.string().max(20).optional().nullable(),
  total_fees: z.number().nonnegative('Total fees must be non-negative').optional(),
  totalFees: z.number().optional(),
  discount: z.number().nonnegative('Discount must be non-negative').optional(),
  discount_amount: z.number().optional(),
  status: z.enum(['active', 'inactive', 'graduated']).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// Apply authentication and role checking to all student routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET all students
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    console.log('[students] serviceKeyRole:', serviceKeyRole);
    const { batchId } = req.query;
    
    // Validate query parameters
    if (batchId && !z.string().uuid().safeParse(batchId).success) {
      return res.status(400).json({ error: 'Invalid batch ID format' });
    }
    
    // Parse pagination parameters
    const { page, limit, offset } = parsePagination(req.query);

    let query = sb.from('students').select('*', { count: 'exact' });
    if (batchId) query = query.eq('batch_id', batchId);
    query = query.order('created_at', { ascending: false });
    
    // Apply pagination
    const { data, count, error } = await applyPagination(query, offset, limit);

    if (error) throw error;
    
    res.json(formatPaginatedResponse(data, count || 0, page, limit));
  } catch (err) {
    next(err);
  }
});

// GET single student
router.get('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    // Validate ID format
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }
    
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
    // Validate input
    const validation = studentCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }

    const sb = requireSupabase();
    const studentData = validation.data;
    
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
        .or(`course_code.eq.${encodeURIComponent(courseKey)},course_name.eq.${encodeURIComponent(courseKey)}`)
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

    // Validate total fees
    const totalFees = payload.total_fees || payload.totalFees;
    if (totalFees && totalFees > 10000000) {
      const err = new Error('Total fees exceeds maximum allowed value (10,000,000)');
      err.status = 400;
      throw err;
    }

    // Map some common frontend keys to DB column names if necessary
    // If the client sent snake_case already, these will be no-ops
    const phone = payload.phone_number || payload.phone || payload.phoneNumber || '';
    const dbPayload = {
      enrollment_number: payload.enrollment_number,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email || null,
      phone_number: phone ? phone : null, // Convert empty string to null
      batch_id: payload.batch_id,
      course_id: payload.course_id,
      enrollment_date: payload.enrollment_date || payload.admissionDate || payload.enrollmentDate,
      residential_address: payload.residential_address || payload.address || null,
      emergency_contact_name: payload.emergency_contact_name || payload.guardianName || null,
      emergency_contact_phone: payload.emergency_contact_phone || payload.guardianPhone || null,
      total_fees: totalFees,
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
        const { error: auditError } = await sb.from('audit_logs').insert([
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

        if (auditError) throw auditError;
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
    
    // Map frontend keys to database column names for update
    const dbUpdatePayload = {};
    
    // Map phone field to phone_number, converting empty string to null
    if ('phone' in updateData) {
      dbUpdatePayload.phone_number = updateData.phone ? updateData.phone : null;
    } else if ('phone_number' in updateData) {
      dbUpdatePayload.phone_number = updateData.phone_number ? updateData.phone_number : null;
    }
    
    // Map other fields with underscore notation
    if ('firstName' in updateData) dbUpdatePayload.first_name = updateData.firstName;
    if ('lastName' in updateData) dbUpdatePayload.last_name = updateData.lastName;
    if ('admissionDate' in updateData) dbUpdatePayload.enrollment_date = updateData.admissionDate;
    if ('totalFees' in updateData) dbUpdatePayload.total_fees = updateData.totalFees;
    
    // Pass through other fields as-is (already in snake_case)
    Object.keys(updateData).forEach(key => {
      if (!['phone', 'firstName', 'lastName', 'admissionDate', 'totalFees'].includes(key)) {
        if (!(key in dbUpdatePayload)) {
          dbUpdatePayload[key] = updateData[key];
        }
      }
    });
    
    const { data, error } = await sb
      .from('students')
      .update(dbUpdatePayload)
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
        const { error: auditError } = await sb.from('audit_logs').insert([
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

        if (auditError) throw auditError;
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
    // First remove dependent placement records to satisfy FK RESTRICT
    try {
      const { error: placementsError } = await sb
        .from('placements')
        .delete()
        .eq('student_id', id);
      if (placementsError) {
        console.error('[students] Failed to delete placements for student:', id, placementsError);
        // Surface a clearer error rather than raw 500
        const err = new Error('Cannot delete student because placements exist or deletion is not permitted');
        err.status = 409;
        throw err;
      }
    } catch (depErr) {
      // If RLS or other issues block deletion, stop early
      return next(depErr);
    }
    
    const { error } = await sb
      .from('students')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[students] Delete error:', error);
      // Map FK/RLS errors to a friendlier status code
      const err = new Error(error.message || 'Failed to delete student');
      err.status = /foreign key/i.test(error.message || '') ? 409 : 500;
      throw err;
    }
    
    console.log('[students] Student deleted:', id);

    // Write audit log for student delete (best-effort)
    try {
      const { error: auditError } = await sb.from('audit_logs').insert([
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

      if (auditError) throw auditError;
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
