import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, CreditCard, IndianRupee, User, DollarSign, FileText, Save, X } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { PAYMENT_METHODS, BANK_MONEY_RECEIVED } from '../../utils/constants';
import { formatNumberWithCommas } from '../../utils/formatters';
import './Expenses.css';

const SELF_TRANSACTION_NAMES = [
  { value: 'priti_personal', label: 'Priti Personal' },
  { value: 'sushant_personal', label: 'Sushant Personal' },
];

const amountSchema = z
  .string()
  .transform((val) => {
    const cleaned = (val ?? '').toString().replace(/,/g, '').trim();
    return cleaned === '' ? NaN : Number(cleaned);
  })
  .refine((num) => Number.isFinite(num) && num > 0, {
    message: 'Amount must be greater than 0',
  });

const expenseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  date: z.string().min(1, 'Date is required'),
  paymentMethod: z.string().min(1, 'Please select a payment method'),
  bankMoneyReceived: z.string().nullable().optional().or(z.literal('')),
  chequeNumber: z.string().max(50, 'Cheque number must be less than 50 characters').nullable().optional().or(z.literal('')),
  amount: amountSchema,
  transactionType: z.enum(['debit', 'credit'], { errorMap: () => ({ message: 'Select transaction type' }) }),
  remarks: z.string().max(1000, 'Remarks must be less than 1000 characters').nullable().optional().or(z.literal('')),
  isSelfTransaction: z.boolean().optional().default(false),
}).refine((data) => data.paymentMethod !== 'cheque' || (data.chequeNumber && data.chequeNumber.trim().length > 0), {
  path: ['chequeNumber'],
  message: 'Cheque number is required for cheque payments',
});

const ExpenseForm = ({ onClose, expense, onSubmitSuccess }) => {
  const { addExpense, updateExpense } = useStudents();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isEditing = Boolean(expense);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
  } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      name: expense?.name ?? '',
      date: expense?.date ?? '',
      paymentMethod: expense?.paymentMethod ?? 'cash',
      bankMoneyReceived: expense?.bankMoneyReceived ?? '',
      chequeNumber: expense?.chequeNumber ?? '',
      amount: expense?.amount ?? '',
      transactionType: expense?.transactionType ?? 'debit',
      remarks: expense?.remarks ?? '',
      isSelfTransaction: expense?.isSelfTransaction ?? false,
    },
  });

  const amountValue = watch('amount');
  const paymentMethod = watch('paymentMethod');
  const isSelfTransaction = watch('isSelfTransaction');

  const formattedAmountPreview = (() => {
    const raw = (amountValue ?? '').toString().replace(/,/g, '').trim();
    if (!raw) return '';
    return formatNumberWithCommas(raw);
  })();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const cleanAmount = parseFloat(data.amount.toString().replace(/,/g, ''));

      const expenseData = {
        name: isSelfTransaction ? data.name : data.name,
        date: data.date,
        paymentMethod: data.paymentMethod,
        bankMoneyReceived: data.bankMoneyReceived || null,
        chequeNumber: data.chequeNumber || null,
        amount: cleanAmount,
        transactionType: data.transactionType,
        remarks: data.remarks || '',
        isSelfTransaction: isSelfTransaction,
      };

      if (isEditing) {
        await updateExpense(expense.id, expenseData);
      } else {
        await addExpense(expenseData);
      }

      reset();
      onSubmitSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error submitting expense:', error);
      setSubmitError(error.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="expense-modal-overlay" onClick={onClose}>
      <div className="expense-modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="expense-modal-header">
          <h2 className="expense-modal-title">
            {isEditing ? 'Edit Expense' : 'Add Expense'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="expense-modal-close"
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit(onSubmit)} className="expense-form-wide">
          {submitError && (
            <div className="expense-error-banner">
              {submitError}
            </div>
          )}

          {/* Basic Information Section */}
          <div className="expense-form-section">
            <div className="expense-section-title">
              <FileText className="w-5 h-5" />
              Basic Information
            </div>

            <div className="expense-form-grid">
              {/* Name / Person */}
              <div className="expense-form-field">
                <label className="expense-form-label">
                  <User className="w-4 h-4" />
                  {isSelfTransaction ? 'Person' : 'Vendor Name'}
                </label>
                {isSelfTransaction ? (
                  <select
                    {...register('name')}
                    className={`expense-form-input ${errors.name ? 'error' : ''}`}
                  >
                    <option value="">Select Person</option>
                    {SELF_TRANSACTION_NAMES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="Enter vendor or person name"
                    className={`expense-form-input ${errors.name ? 'error' : ''}`}
                  />
                )}
                {errors.name && <p className="expense-form-error">{errors.name.message}</p>}
              </div>

              {/* Date */}
              <div className="expense-form-field">
                <label className="expense-form-label">
                  <Calendar className="w-4 h-4" />
                  Date
                </label>
                <input
                  type="date"
                  {...register('date')}
                  className={`expense-form-input ${errors.date ? 'error' : ''}`}
                />
                {errors.date && <p className="expense-form-error">{errors.date.message}</p>}
              </div>

              {/* Self Transaction Checkbox */}
              <div className="expense-form-field full-width">
                <label className="expense-checkbox-label-new">
                  <input
                    type="checkbox"
                    {...register('isSelfTransaction')}
                    className="expense-checkbox-new"
                  />
                  <span>This is a personal account transaction</span>
                </label>
              </div>
            </div>
          </div>

          {/* Transaction Details Section */}
          <div className="expense-form-section">
            <div className="expense-section-title">
              <DollarSign className="w-5 h-5" />
              Transaction Details
            </div>

            <div className="expense-form-grid">
              {/* Amount */}
              <div className="expense-form-field">
                <label className="expense-form-label">
                  <IndianRupee className="w-4 h-4" />
                  Amount
                </label>
                <input
                  type="text"
                  {...register('amount')}
                  placeholder="0.00"
                  className={`expense-form-input ${errors.amount ? 'error' : ''}`}
                />
                {formattedAmountPreview && (
                  <p className="expense-amount-hint">₹{formattedAmountPreview}</p>
                )}
                {errors.amount && <p className="expense-form-error">{errors.amount.message}</p>}
              </div>

              {/* Transaction Type */}
              <div className="expense-form-field">
                <label className="expense-form-label">Transaction Type</label>
                <div className="expense-type-buttons">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setValue('transactionType', 'debit');
                    }}
                    className={`expense-type-button ${watch('transactionType') === 'debit' ? 'active' : ''}`}
                  >
                    Debit (Out)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setValue('transactionType', 'credit');
                    }}
                    className={`expense-type-button ${watch('transactionType') === 'credit' ? 'active' : ''}`}
                  >
                    Credit (In)
                  </button>
                </div>
                <input
                  type="hidden"
                  {...register('transactionType')}
                />
                {errors.transactionType && (
                  <p className="expense-form-error">{errors.transactionType.message}</p>
                )}
              </div>

              {/* Payment Method */}
              <div className="expense-form-field">
                <label className="expense-form-label">
                  <CreditCard className="w-4 h-4" />
                  Payment Method
                </label>
                <select
                  {...register('paymentMethod')}
                  className={`expense-form-input ${errors.paymentMethod ? 'error' : ''}`}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                {errors.paymentMethod && (
                  <p className="expense-form-error">{errors.paymentMethod.message}</p>
                )}
              </div>

              {/* Bank Selection - Conditional */}
              {['bank_transfer', 'upi', 'card'].includes(paymentMethod) && (
                <div className="expense-form-field">
                  <label className="expense-form-label">Bank / Account</label>
                  <select
                    {...register('bankMoneyReceived')}
                    className="expense-form-input"
                  >
                    <option value="">Select Bank (Optional)</option>
                    {BANK_MONEY_RECEIVED.map((bank) => (
                      <option key={bank.value} value={bank.value}>
                        {bank.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cheque Number - Conditional */}
              {paymentMethod === 'cheque' && (
                <div className="expense-form-field">
                  <label className="expense-form-label">Cheque Number</label>
                  <input
                    type="text"
                    {...register('chequeNumber')}
                    placeholder="Enter cheque number"
                    className={`expense-form-input ${errors.chequeNumber ? 'error' : ''}`}
                  />
                  {errors.chequeNumber && (
                    <p className="expense-form-error">{errors.chequeNumber.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Remarks Section */}
          <div className="expense-form-section">
            <div className="expense-section-title">
              <FileText className="w-5 h-5" />
              Additional Information
            </div>

            <div className="expense-form-grid">
              <div className="expense-form-field full-width">
                <label className="expense-form-label">Remarks / Notes</label>
                <textarea
                  {...register('remarks')}
                  placeholder="Add any additional notes about this transaction (optional)"
                  rows={3}
                  className="expense-form-textarea"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="expense-form-actions-wide">
            <button
              type="button"
              onClick={onClose}
              className="expense-btn-cancel-wide"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="expense-btn-submit-wide"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Expense' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseForm;
