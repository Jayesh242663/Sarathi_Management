import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';

const router = Router();

// Input validation schema
const courseSchema = z.object({
  course_code: z.string().min(1, 'Course code is required').max(50),
  course_name: z.string().min(1, 'Course name is required').max(255),
  description: z.string().max(1000).optional().nullable(),
  duration_months: z.number().nonnegative('Duration must be non-negative').optional(),
  fees: z.number().nonnegative('Fees must be non-negative').optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// Apply authentication and role checking to all course routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET all courses
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { page, limit, offset } = parsePagination(req.query);
    
    // Get total count and data in parallel
    const [{ count }, { data, error }] = await Promise.all([
      sb.from('courses').select('*', { count: 'exact', head: true }),
      applyPagination(
        sb.from('courses').select('*').order('course_name', { ascending: true }),
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

// POST create new course
router.post('/', async (req, res, next) => {
  try {
    // Validate input
    const validation = courseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }

    const sb = requireSupabase();
    const courseData = validation.data;
    
    console.log('[courses] Creating course:', courseData);
    
    const { data, error } = await sb
      .from('courses')
      .insert([courseData])
      .select();
    
    if (error) throw error;
    res.status(201).json({ data: data[0] });
  } catch (err) {
    console.error('[courses] POST error:', err);
    next(err);
  }
});

// PUT update course
router.put('/:id', async (req, res, next) => {
  try {
    // Validate input
    const validation = courseSchema.partial().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }

    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = validation.data;
    
    // Validate ID format
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid course ID format' });
    }
    
    const { data, error } = await sb
      .from('courses')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    res.json({ data: data[0] });
  } catch (err) {
    console.error('[courses] PUT error:', err);
    next(err);
  }
});

export default router;
