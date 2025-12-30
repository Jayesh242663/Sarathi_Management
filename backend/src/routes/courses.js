import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';

const router = Router();

// Apply authentication and role checking to all course routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET all courses
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { data, error } = await sb
      .from('courses')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST create new course
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const courseData = req.body;
    
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
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
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
