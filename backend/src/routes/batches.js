import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';

const router = Router();

// Input validation schema
const batchSchema = z.object({
  batch_name: z.string().min(1, 'Batch name is required').max(100),
  start_year: z.number().min(2000).max(2100),
  end_year: z.number().min(2000).max(2100),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

// Apply authentication and role checking to all batch routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { page, limit, offset } = parsePagination(req.query);
    
    // Get total count and data in parallel
    const [{ count }, { data, error }] = await Promise.all([
      sb.from('batches').select('*', { count: 'exact', head: true }),
      applyPagination(
        sb.from('batches').select('*').order('start_year', { ascending: false }),
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

// POST create new batch
router.post('/', async (req, res, next) => {
  try {
    // Validate input
    const validation = batchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }

    const sb = requireSupabase();
    const batchData = validation.data;
    
    console.log('[batches] Creating batch:', batchData);
    
    const { data, error } = await sb
      .from('batches')
      .insert([batchData])
      .select();
    
    if (error) throw error;
    res.status(201).json({ data: data[0] });
  } catch (err) {
    console.error('[batches] POST error:', err);
    next(err);
  }
});

// PUT update batch
router.put('/:id', async (req, res, next) => {
  try {
    // Validate input
    const validation = batchSchema.partial().safeParse(req.body);
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
      return res.status(400).json({ error: 'Invalid batch ID format' });
    }
    
    const { data, error } = await sb
      .from('batches')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    res.json({ data: data[0] });
  } catch (err) {
    console.error('[batches] PUT error:', err);
    next(err);
  }
});

export default router;
