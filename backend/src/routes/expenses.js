import { Router } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, restrictWriteToAdmin } from '../middleware/authorize.js';
import { parsePagination, formatPaginatedResponse, applyPagination } from '../utils/pagination.js';

const router = Router();

// Secure all expense routes
router.use(authenticateToken);
router.use(attachUserRole);
router.use(restrictWriteToAdmin);

// GET expenses (filterable by batch)
router.get('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { batchId } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    // Build count query
    let countQuery = sb.from('expenses').select('*', { count: 'exact', head: true });
    if (batchId && batchId !== 'all') {
      countQuery = countQuery.eq('batch_id', batchId);
    }

    // Build data query
    let dataQuery = sb.from('expenses').select('*');
    if (batchId && batchId !== 'all') {
      dataQuery = dataQuery.eq('batch_id', batchId);
    }

    // Execute queries in parallel
    const [{ count }, { data, error }] = await Promise.all([
      countQuery,
      applyPagination(
        dataQuery.order('date', { ascending: false }).order('created_at', { ascending: false }),
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

// GET single expense by ID
router.get('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;

    const { data, error } = await sb
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Expense not found' });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST create new expense
router.post('/', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const {
      name,
      date,
      amount,
      paymentMethod,
      bankMoneyReceived,
      chequeNumber,
      transactionType,
      remarks,
      isSelfTransaction,
      batchId,
    } = req.body;

    // Validation
    if (!name || !date || !amount || !paymentMethod || !transactionType) {
      return res.status(400).json({
        error: 'Missing required fields: name, date, amount, paymentMethod, transactionType',
      });
    }

    if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
      return res.status(400).json({ error: 'Name must be between 1 and 255 characters' });
    }

    if (!['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    if (paymentMethod === 'cheque' && (!chequeNumber || chequeNumber.length === 0)) {
      return res.status(400).json({ error: 'Cheque number is required for cheque payments' });
    }

    if (chequeNumber && chequeNumber.length > 50) {
      return res.status(400).json({ error: 'Cheque number must be less than 50 characters' });
    }

    if (remarks && remarks.length > 1000) {
      return res.status(400).json({ error: 'Remarks must be less than 1000 characters' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    if (!['debit', 'credit'].includes(transactionType)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Check for duplicate entries
    // Duplicates are defined as: same name, date, amount, and payment method in the same batch
    let duplicateQuery = sb
      .from('expenses')
      .select('id')
      .eq('name', name)
      .eq('date', date)
      .eq('amount', Number(amount))
      .eq('payment_method', paymentMethod);

    // Handle batch_id matching (including null)
    if (batchId) {
      duplicateQuery = duplicateQuery.eq('batch_id', batchId);
    } else {
      duplicateQuery = duplicateQuery.is('batch_id', null);
    }

    const { data: existingExpense, error: checkError } = await duplicateQuery
      .limit(1)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') throw checkError;

    if (existingExpense) {
      return res.status(409).json({
        error: 'Duplicate expense entry',
        message: 'An expense with the same name, date, amount, and payment method already exists for this batch. Please check before adding.',
        code: 'DUPLICATE_EXPENSE'
      });
    }

    const expense = {
      name,
      date,
      amount: Number(amount),
      payment_method: paymentMethod,
      bank_money_received: bankMoneyReceived || null,
      cheque_number: chequeNumber || null,
      transaction_type: transactionType,
      remarks: remarks || null,
      is_self_transaction: Boolean(isSelfTransaction),
      batch_id: batchId || null,
    };

    const { data, error } = await sb
      .from('expenses')
      .insert([expense])
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (error code 23505)
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Duplicate expense entry',
          message: 'An expense with the same name, date, amount, and payment method already exists for this batch. Please check before adding.',
          code: 'DUPLICATE_EXPENSE'
        });
      }
      throw error;
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT update expense
router.put('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;
    const {
      name,
      date,
      amount,
      paymentMethod,
      bankMoneyReceived,
      chequeNumber,
      transactionType,
      remarks,
      isSelfTransaction,
      batchId,
    } = req.body;

    // Validation
    if (name !== undefined && (typeof name !== 'string' || name.length === 0 || name.length > 255)) {
      return res.status(400).json({ error: 'Name must be between 1 and 255 characters' });
    }

    if (paymentMethod && !['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    if (paymentMethod === 'cheque' && (!chequeNumber || chequeNumber.length === 0)) {
      return res.status(400).json({ error: 'Cheque number is required for cheque payments' });
    }

    if (chequeNumber && chequeNumber.length > 50) {
      return res.status(400).json({ error: 'Cheque number must be less than 50 characters' });
    }

    if (remarks && remarks.length > 1000) {
      return res.status(400).json({ error: 'Remarks must be less than 1000 characters' });
    }

    if (amount !== undefined && amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    if (transactionType && !['debit', 'credit'].includes(transactionType)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (date !== undefined) updates.date = date;
    if (amount !== undefined) updates.amount = Number(amount);
    if (paymentMethod !== undefined) updates.payment_method = paymentMethod;
    if (bankMoneyReceived !== undefined) updates.bank_money_received = bankMoneyReceived || null;
    if (chequeNumber !== undefined) updates.cheque_number = chequeNumber || null;
    if (transactionType !== undefined) updates.transaction_type = transactionType;
    if (remarks !== undefined) updates.remarks = remarks || null;
    if (isSelfTransaction !== undefined) updates.is_self_transaction = Boolean(isSelfTransaction);
    if (batchId !== undefined) updates.batch_id = batchId || null;

    const { data, error } = await sb
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Expense not found' });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE expense
router.delete('/:id', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const { id } = req.params;

    const { error } = await sb.from('expenses').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
