import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';

const router = Router();

// Apply authentication and role checking to all batch routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('batches')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
// POST create new batch
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const batchData = req.body;
    
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
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
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
