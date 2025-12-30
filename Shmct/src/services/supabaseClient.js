import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for common operations

/**
 * Get all students for a batch
 */
export async function getStudentsByBatch(batchId) {
  const { data, error } = await supabase
    .from('students')
    .select(`
      *,
      batch:batches(batch_name),
      course:courses(course_name, course_code)
    `)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get student with payment information
 */
export async function getStudentWithPayments(studentId) {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select(`
      *,
      batch:batches(batch_name),
      course:courses(course_name, course_code),
      payments(*)
    `)
    .eq('id', studentId)
    .single();

  if (studentError) throw studentError;

  // Calculate fees information
  const paid = student.payments
    ?.filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0) || 0;

  return {
    ...student,
    feesPaid: paid,
    feesRemaining: Math.max(0, student.total_fees - paid),
    feeStatus: paid === 0 ? 'pending' : paid >= student.total_fees ? 'paid' : 'partial'
  };
}

/**
 * Get placement details with installments
 */
export async function getPlacementWithInstallments(placementId) {
  const { data, error } = await supabase
    .from('placements')
    .select(`
      *,
      student:students(first_name, last_name, enrollment_number),
      batch:batches(batch_name),
      placement_installments(*)
    `)
    .eq('id', placementId)
    .single();

  if (error) throw error;

  // Calculate installment information
  const installmentsReceived = data.placement_installments
    ?.filter(i => i.status === 'completed')
    .reduce((sum, i) => sum + i.amount, 0) || 0;

  const profit = data.institution_cost - data.company_cost;

  return {
    ...data,
    profit,
    amountReceived: installmentsReceived,
    amountRemaining: Math.max(0, data.institution_cost - installmentsReceived)
  };
}

/**
 * Get audit logs for a batch
 */
export async function getAuditLogsByBatch(batchId, filters = {}) {
  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('batch_id', batchId);

  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.startDate) query = query.gte('transaction_date', filters.startDate);
  if (filters.endDate) query = query.lte('transaction_date', filters.endDate);

  const { data, error } = await query.order('transaction_date', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Calculate batch financial summary
 */
export async function getBatchFinancialSummary(batchId) {
  // Get opening balance
  const { data: openingBalance } = await supabase
    .from('opening_balances')
    .select('opening_balance')
    .eq('batch_id', batchId)
    .single();

  // Get total payments received
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('batch_id', batchId)
    .eq('status', 'completed');

  // Get total placement payments received
  const { data: placementInstallments } = await supabase
    .from('placement_installments')
    .select('placement_installments(amount)')
    .eq('batch_id', batchId)
    .eq('status', 'completed');

  const totalPayments = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const totalPlacementPayments = placementInstallments?.reduce((sum, p) => sum + p.amount, 0) || 0;
  const openingBal = openingBalance?.opening_balance || 0;

  return {
    openingBalance: openingBal,
    totalFeesCollected: totalPayments,
    totalPlacementCollected: totalPlacementPayments,
    totalCollection: totalPayments + totalPlacementPayments,
    closingBalance: openingBal + totalPayments + totalPlacementPayments
  };
}

/**
 * Get payment statistics for a batch
 */
export async function getPaymentStatistics(batchId) {
  const { data: payments } = await supabase
    .from('payments')
    .select('payment_method, amount, status')
    .eq('batch_id', batchId);

  const stats = {
    totalAmount: 0,
    byMethod: {},
    byStatus: {}
  };

  payments?.forEach(p => {
    stats.totalAmount += p.amount;

    if (!stats.byMethod[p.payment_method]) {
      stats.byMethod[p.payment_method] = 0;
    }
    stats.byMethod[p.payment_method] += p.amount;

    if (!stats.byStatus[p.status]) {
      stats.byStatus[p.status] = 0;
    }
    stats.byStatus[p.status] += p.amount;
  });

  return stats;
}

/**
 * Get placement statistics for a batch
 */
export async function getPlacementStatistics(batchId) {
  const { data: placements } = await supabase
    .from('placements')
    .select('*')
    .eq('batch_id', batchId);

  const stats = {
    totalPlacements: placements?.length || 0,
    totalProfit: 0,
    averageProfit: 0,
    companyCostTotal: 0,
    institutionCostTotal: 0
  };

  placements?.forEach(p => {
    stats.totalProfit += p.institution_cost - p.company_cost;
    stats.companyCostTotal += p.company_cost;
    stats.institutionCostTotal += p.institution_cost;
  });

  if (stats.totalPlacements > 0) {
    stats.averageProfit = stats.totalProfit / stats.totalPlacements;
  }

  return stats;
}

/**
 * Create a new payment record and add audit log
 */
export async function createPayment(paymentData) {
  // Create payment
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert([paymentData])
    .select()
    .single();

  if (paymentError) throw paymentError;

  // Create audit log
  const { data: student } = await supabase
    .from('students')
    .select('first_name, last_name')
    .eq('id', paymentData.student_id)
    .single();

  await supabase.from('audit_logs').insert([
    {
      action: 'PAYMENT',
      entity_type: 'PAYMENT',
      entity_id: payment.id,
      entity_name: `${student.first_name} ${student.last_name} - Payment`,
      batch_id: paymentData.batch_id,
      amount: paymentData.amount,
      transaction_date: paymentData.payment_date,
      details: {
        student_id: paymentData.student_id,
        method: paymentData.payment_method,
        receipt: paymentData.receipt_number
      }
    }
  ]);

  return payment;
}

/**
 * Create placement installment and add audit log
 */
export async function createPlacementInstallment(installmentData) {
  // Create installment
  const { data: installment, error: installmentError } = await supabase
    .from('placement_installments')
    .insert([installmentData])
    .select()
    .single();

  if (installmentError) throw installmentError;

  // Create audit log if payment is completed
  if (installmentData.status === 'completed') {
    const { data: student } = await supabase
      .from('students')
      .select('first_name, last_name')
      .eq('id', installmentData.student_id)
      .single();

    await supabase.from('audit_logs').insert([
      {
        action: 'PLACEMENT_PAYMENT',
        entity_type: 'PLACEMENT_INSTALLMENT',
        entity_id: installment.id,
        entity_name: `${student.first_name} ${student.last_name} - Placement Payment`,
        batch_id: (await supabase.from('placements').select('batch_id').eq('id', installmentData.placement_id).single()).data.batch_id,
        amount: installmentData.amount,
        transaction_date: installmentData.payment_date,
        details: {
          placement_id: installmentData.placement_id,
          installment_number: installmentData.installment_number,
          method: installmentData.payment_method
        }
      }
    ]);
  }

  return installment;
}
