import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, IndianRupee, Calendar, CreditCard, FileText, Receipt, Building2 } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { PAYMENT_METHODS, BANK_MONEY_RECEIVED } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import './PaymentForm.css';

const paymentSchema = z.object({
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.string().min(1, 'Please select a payment method'),
  bankMoneyReceived: z.string().optional(),
  remarks: z.string().optional(),
});

const PaymentForm = ({ studentId, studentName, remainingFees, onClose }) => {
  const { addPayment, getFilteredPayments } = useStudents();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Generate next receipt number
  const payments = getFilteredPayments();
  const receiptCount = payments.length + 1;
  const receiptNumber = `RCT-${new Date().getFullYear()}-${String(receiptCount).padStart(4, '0')}`;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: remainingFees > 0 ? Math.min(remainingFees, 50000) : 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'upi',
      bankMoneyReceived: '',
      remarks: '',
    },
  });

  const paymentMethod = watch('paymentMethod');

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await addPayment({
        studentId,
        amount: data.amount,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        bankMoneyReceived: data.bankMoneyReceived || null,
        remarks: data.remarks || '',
        receiptNumber,
      });
      onClose();
    } catch (error) {
      console.error('Error adding payment:', error);
      setSubmitError(error.message || 'Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on ESC for better device accessibility
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleOverlayClick = useCallback((e) => {
    // Close if user clicks outside the modal content
    if (e.target && e.target.classList && e.target.classList.contains('payment-modal-overlay')) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className="payment-modal-overlay" onClick={handleOverlayClick}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <div className="payment-modal-title-section">
            <Receipt className="payment-modal-icon" />
            <div>
              <h3 className="payment-modal-title">Fee Receipt</h3>
              <p className="payment-modal-subtitle">{studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="payment-modal-close">
            <X />
          </button>
        </div>

        {/* Receipt Info Box */}
        <div className="payment-receipt-info">
          <div className="payment-receipt-row">
            <span className="payment-receipt-label">Receipt No.</span>
            <span className="payment-receipt-value">{receiptNumber}</span>
          </div>
          <div className="payment-receipt-row">
            <span className="payment-receipt-label">Outstanding Amount</span>
            <span className="payment-receipt-amount">{formatCurrency(remainingFees)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="payment-form">
          <div className="payment-field">
            <label className="payment-label">
              <IndianRupee />
              Amount *
            </label>
            <input
              {...register('amount')}
              type="number"
              className={`payment-input ${errors.amount ? 'error' : ''}`}
              placeholder="Enter amount"
              inputMode="decimal"
              min={1}
              step="0.01"
              enterKeyHint="done"
              autoComplete="off"
            />
            {errors.amount && (
              <p className="payment-error">{errors.amount.message}</p>
            )}
          </div>

          <div className="payment-field">
            <label className="payment-label">
              <Calendar />
              Payment Date *
            </label>
            <input
              {...register('paymentDate')}
              type="date"
              className={`payment-input ${errors.paymentDate ? 'error' : ''}`}
              autoComplete="off"
            />
            {errors.paymentDate && (
              <p className="payment-error">{errors.paymentDate.message}</p>
            )}
          </div>

          <div className="payment-field">
            <label className="payment-label">
              <CreditCard />
              Payment Method *
            </label>
            <select
              {...register('paymentMethod')}
              className={`payment-select ${errors.paymentMethod ? 'error' : ''}`}
              autoComplete="off"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
            {errors.paymentMethod && (
              <p className="payment-error">{errors.paymentMethod.message}</p>
            )}
          </div>

          {(paymentMethod === 'bank_transfer' || paymentMethod === 'upi' || paymentMethod === 'card' || paymentMethod === 'cheque') && (
            <div className="payment-field">
              <label className="payment-label">
                <Building2 />
                Bank Account *
              </label>
              <select
                {...register('bankMoneyReceived')}
                className={`payment-select ${errors.bankMoneyReceived ? 'error' : ''}`}
                autoComplete="off"
              >
                <option value="">-- Select Bank Account --</option>
                {BANK_MONEY_RECEIVED.map((bank) => (
                  <option key={bank.value} value={bank.value}>
                    {bank.label}
                  </option>
                ))}
              </select>
              {errors.bankMoneyReceived && (
                <p className="payment-error">{errors.bankMoneyReceived.message}</p>
              )}
            </div>
          )}

          <div className="payment-field full-width">
            <label className="payment-label">
              <FileText />
              Remarks (Optional)
            </label>
            <textarea
              {...register('remarks')}
              rows={2}
              className="payment-textarea"
              placeholder="Add any notes about this payment..."
              autoComplete="off"
            />
          </div>

          <div className="payment-actions">
            {submitError && <p className="payment-error" aria-live="polite">{submitError}</p>}
            <button type="button" onClick={onClose} className="payment-btn payment-btn-cancel">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="payment-btn payment-btn-submit"
            >
              <Receipt size={16} />
              {isSubmitting ? 'Recording...' : 'Issue Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;
