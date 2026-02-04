import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';

const router = Router();

// Apply authentication and role checking
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET all placements
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { batchId } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    // Build count query
    let countQuery = sb.from('placements').select('*', { count: 'exact', head: true });
    if (batchId) countQuery = countQuery.eq('batch_id', batchId);

    // Build data query
    let dataQuery = sb.from('placements').select('*');
    if (batchId) dataQuery = dataQuery.eq('batch_id', batchId);

    // Execute queries in parallel
    const [{ count }, { data, error }] = await Promise.all([
      countQuery,
      applyPagination(
        dataQuery.order('created_at', { ascending: false }),
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

// GET single placement
router.get('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    const { data, error } = await sb
      .from('placements')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST create new placement
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const placementData = req.body;
    
    console.log('[placements] Creating placement:', placementData);
    
    // Use upsert to avoid failing on the unique (student_id, batch_id, company_name) constraint
    const { data, error } = await sb
      .from('placements')
      .upsert([placementData], { onConflict: 'student_id,batch_id,company_name' })
      .select()
      .single();
    
    if (error) {
      console.error('[placements] Insert error:', error);
      throw error;
    }
    
    console.log('[placements] Placement created:', data);
    res.status(201).json({ data });
  } catch (err) {
    console.error('[placements] POST error:', err);
    next(err);
  }
});

// PUT update placement
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('[placements] Updating placement:', id, updateData);
    
    const { data, error } = await sb
      .from('placements')
      .update(updateData)
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('[placements] Update error:', error);
      throw error;
    }
    
    console.log('[placements] Placement updated:', data);

    // Record audit log for placement update (best-effort)
    try {
      const updated = data?.[0];
      if (updated) {
        const { error: auditError } = await sb.from('audit_logs').insert([
          {
            action: 'UPDATE',
            entity_type: 'PLACEMENT',
            entity_id: updated.id,
            entity_name: updated.company_name || 'Placement',
            batch_id: updated.batch_id,
            amount: null,
            details: {
              companyCost: updated.company_cost,
              institutionCost: updated.institution_cost,
              placementLocation: updated.placement_location,
            },
            transaction_date: new Date().toISOString().slice(0,10),
          },
        ]);

        if (auditError) throw auditError;
      }
    } catch (auditError) {
      console.error('[placements] Failed to write audit log:', auditError);
    }
    res.json({ data: data[0] });
  } catch (err) {
    console.error('[placements] PUT error:', err);
    next(err);
  }
});

// DELETE placement
router.delete('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    
    console.log('[placements] Deleting placement:', id);
    
    const { error } = await sb
      .from('placements')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[placements] Delete error:', error);
      throw error;
    }
    
    console.log('[placements] Placement deleted');
    res.json({ message: 'Placement deleted successfully' });
  } catch (err) {
    console.error('[placements] DELETE error:', err);
    next(err);
  }
});

export default router;
