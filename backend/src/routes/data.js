import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';

const router = Router();

console.log('[data] Data router initialized');

// Test endpoint to verify Supabase connection
router.get('/test', async (req, res, next) => {
  try {
    console.log('[data] /test endpoint called');
    const sb = requireSupabase();
    console.log('[data] Supabase instance obtained');
    
    // Try to fetch batches with detailed logging
    const { data, error, status, statusText } = await sb
      .from('batches')
      .select('*')
      .limit(1);
    
    console.log('[data] Query result:', {
      status,
      statusText,
      error: error ? { message: error.message, details: error.details } : null,
      dataCount: data?.length || 0,
      data: data ? data.slice(0, 1) : null
    });
    
    if (error) {
      return res.status(400).json({
        error: 'Query failed',
        details: error,
        url: process.env.SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
    }
    
    res.json({
      success: true,
      message: 'Supabase connection OK',
      batchesCount: data?.length || 0,
      sample: data?.[0] || null
    });
  } catch (err) {
    console.error('[data] test error:', err);
    res.status(500).json({
      error: err.message,
      type: err.constructor.name,
      url: process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    });
  }
});

// Public endpoint - no auth required for initial data load
router.get('/snapshot', async (req, res, next) => {
  try {
    console.log('[data] /snapshot requested at:', new Date().toISOString());
    const sb = requireSupabase();
    console.log('[data] Supabase instance obtained');

    console.log('[data] Fetching batches...');
    const batchesResult = await sb.from('batches').select('*').order('start_year', { ascending: false });
    console.log('[data] Batches result:', { error: batchesResult.error?.message, count: batchesResult.data?.length });

    console.log('[data] Fetching courses...');
    const coursesResult = await sb.from('courses').select('*').order('course_name', { ascending: true });
    console.log('[data] Courses result:', { error: coursesResult.error?.message, count: coursesResult.data?.length });

    console.log('[data] Fetching students...');
    const studentsResult = await sb.from('students').select('*').order('created_at', { ascending: false });
    console.log('[data] Students result:', { error: studentsResult.error?.message, count: studentsResult.data?.length });

    console.log('[data] Fetching payments...');
    const paymentsResult = await sb.from('payments').select('*').order('payment_date', { ascending: false });
    console.log('[data] Payments result:', { error: paymentsResult.error?.message, count: paymentsResult.data?.length });

    console.log('[data] Fetching placements...');
    const placementsResult = await sb.from('placements').select('*').order('placement_date', { ascending: false });
    console.log('[data] Placements result:', { error: placementsResult.error?.message, count: placementsResult.data?.length });

    console.log('[data] Fetching placement_installments...');
    const installmentsResult = await sb.from('placement_installments').select('*').order('payment_date', { ascending: false });
    console.log('[data] Installments result:', { error: installmentsResult.error?.message, count: installmentsResult.data?.length });

    console.log('[data] Fetching audit_logs...');
    const auditResult = await sb.from('audit_logs').select('*').order('transaction_date', { ascending: false });
    console.log('[data] Audit logs result:', { error: auditResult.error?.message, count: auditResult.data?.length });

    const results = [
      { name: 'batches', ...batchesResult },
      { name: 'courses', ...coursesResult },
      { name: 'students', ...studentsResult },
      { name: 'payments', ...paymentsResult },
      { name: 'placements', ...placementsResult },
      { name: 'installments', ...installmentsResult },
      { name: 'audit_logs', ...auditResult },
    ];

    for (const result of results) {
      if (result.error) {
        console.error(`[data] Error fetching ${result.name}:`, result.error);
        throw result.error;
      }
    }

    console.log('[data] snapshot data fetched successfully:', {
      batches: batchesResult.data?.length || 0,
      courses: coursesResult.data?.length || 0,
      students: studentsResult.data?.length || 0,
      payments: paymentsResult.data?.length || 0,
      placements: placementsResult.data?.length || 0,
      installments: installmentsResult.data?.length || 0,
      auditLogs: auditResult.data?.length || 0,
    });

    res.json({
      batches: batchesResult.data || [],
      courses: coursesResult.data || [],
      students: studentsResult.data || [],
      payments: paymentsResult.data || [],
      placements: placementsResult.data || [],
      placementInstallments: installmentsResult.data || [],
      auditLogs: auditResult.data || [],
    });
  } catch (err) {
    console.error('[data] snapshot error:', err.message || err);
    next(err);
  }
});

export default router;
