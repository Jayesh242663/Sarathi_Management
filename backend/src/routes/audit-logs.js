import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, requireAdmin } from '../middleware/authorize.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Apply authentication and role checking
router.use(authenticateToken);
router.use(attachUserRole);

// GET all audit logs (with optional filters)
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { batchId, action, startDate, endDate, entityType, limit } = req.query;

    let query = sb.from('audit_logs').select('*');
    
    if (batchId) {
      query = query.eq('batch_id', batchId);
    }
    if (action) {
      query = query.eq('action', action);
    }
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }
    
    query = query.order('transaction_date', { ascending: false });
    
    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const { data, error } = await query;
    
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    logger.error('[audit-logs] GET error', err);
    next(err);
  }
});

// DELETE bulk audit logs (admin only)
router.delete('/bulk', requireAdmin, async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request. Please provide an array of audit log IDs to delete.' 
      });
    }

    logger.audit('BULK_DELETE_AUDIT_LOGS', `Deleting ${ids.length} audit logs`, req.user?.id);

    // Note: audit_logs table has a constraint that prevents updates but allows deletes
    // We need to delete them individually due to the constraint
    const { data, error } = await sb
      .from('audit_logs')
      .delete()
      .in('id', ids)
      .select();

    if (error) {
      logger.error('[audit-logs] Bulk delete failed', error);
      throw error;
    }

    logger.info(`[audit-logs] Bulk deleted ${ids.length} audit log entries`);
    
    res.json({ 
      message: `Successfully deleted ${ids.length} audit log entries`,
      deletedCount: data?.length || 0,
      deletedIds: ids
    });
  } catch (err) {
    logger.error('[audit-logs] Bulk DELETE error', err);
    next(err);
  }
});

// DELETE single audit log (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;

    logger.audit('DELETE_AUDIT_LOG', id, req.user?.id);

    const { error } = await sb
      .from('audit_logs')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('[audit-logs] Delete failed', error);
      throw error;
    }

    logger.info(`[audit-logs] Deleted audit log: ${id}`);
    res.json({ message: 'Audit log deleted successfully' });
  } catch (err) {
    logger.error('[audit-logs] DELETE error', err);
    next(err);
  }
});

export default router;
