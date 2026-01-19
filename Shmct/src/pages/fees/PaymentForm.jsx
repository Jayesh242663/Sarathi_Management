import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, IndianRupee, Calendar, CreditCard, FileText, Receipt, Building2 } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { PAYMENT_METHODS, BANK_MONEY_RECEIVED } from '../../utils/constants';
import { formatCurrency, formatNumberWithCommas } from '../../utils/formatters';
import ReceiptModal from '../../components/receipt/ReceiptModal';
import PaymentErrorModal from '../../components/payment/PaymentErrorModal';
import { generateReceiptData } from '../../services/receiptService';
import './PaymentForm.css';

const amountSchema = z
  .string()
  .transform((val) => {
    const cleaned = (val ?? '').toString().replace(/,/g, '').trim();
    return cleaned === '' ? NaN : Number(cleaned);
  })
  .refine((num) => Number.isFinite(num) && num > 0, {
    message: 'Amount must be greater than 0',
  });

const paymentSchema = z.object({
  amount: amountSchema,
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.string().min(1, 'Please select a payment method'),
  bankMoneyReceived: z.string().nullable().optional().or(z.literal('')),
  chequeNumber: z.string().nullable().optional().or(z.literal('')),
  remarks: z.string().nullable().optional().or(z.literal('')),
}).refine((data) => data.paymentMethod !== 'cheque' || (data.chequeNumber && data.chequeNumber.trim().length > 0), {
  path: ['chequeNumber'],
  message: 'Cheque number is required for cheque payments',
});

const PaymentForm = ({ studentId, studentName, remainingFees, onClose, payment, studentData }) => {
  const { addPayment, updatePayment, getFilteredPayments, students } = useStudents();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [existingReceiptNumber, setExistingReceiptNumber] = useState('');
  const [displayAmount, setDisplayAmount] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const isEditing = Boolean(payment);

  // Generate next receipt number
  const payments = getFilteredPayments();
  const receiptCount = payments.length + 1;
  const defaultReceiptNumber = `RCT-${new Date().getFullYear()}-${String(receiptCount).padStart(4, '0')}`;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: payment?.amount ?? (isEditing ? '' : ''),
      paymentDate: payment?.paymentDate ?? (isEditing ? '' : ''),
      paymentMethod: payment?.paymentMethod ?? 'upi',
      bankMoneyReceived: payment?.bankMoneyReceived ?? '',
      chequeNumber: payment?.chequeNumber ?? '',
      remarks: payment?.remarks ?? '',
    },
  });

  const amountValue = watch('amount');
  const paymentMethod = watch('paymentMethod');
  const formattedAmountPreview = (() => {
    const raw = (amountValue ?? '').toString().replace(/,/g, '').trim();
    if (!raw) return '';
    return formatNumberWithCommas(raw);
  })();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      // Clean amount value (remove commas)
      const cleanAmount = parseFloat(data.amount.toString().replace(/,/g, ''));
      
      const paymentData = {
        amount: cleanAmount,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        bankMoneyReceived: data.bankMoneyReceived || null,
        chequeNumber: data.chequeNumber || null,
        remarks: data.remarks || '',
        receiptNumber: payment?.receiptNumber || defaultReceiptNumber,
      };
      
      if (isEditing) {
        await updatePayment(payment.id, {
          ...paymentData,
          status: payment.status || 'completed',
        });
      } else {
        // Check for duplicate payment on the same date with same amount
        const existingPayment = payments.find(
          p => 
            p.studentId === studentId && 
            p.amount === cleanAmount && 
            p.paymentDate === data.paymentDate &&
            p.status === 'completed'
        );

        if (existingPayment) {
          setSubmitError(
            `A payment of ${formatCurrency(cleanAmount)} on ${data.paymentDate} already exists for this student. ` +
            `Receipt: ${existingPayment.receiptNumber}. Please verify if this is a duplicate before creating a new entry.`
          );
          setShowErrorModal(true);
          setIsSubmitting(false);
          return;
        }

        await addPayment({
          ...paymentData,
          studentId,
        });
      }
      
      // Get student data for receipt
      const student = studentData || students.find(s => s.id === studentId);
      if (!student) {
        onClose();
        return;
      }
      
      // Calculate previously paid amount
      const studentPayments = getFilteredPayments().filter(p => p.studentId === studentId);
      const previouslyPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0) - cleanAmount;
      
      // Generate receipt data
      const receipt = generateReceiptData(
        {
          ...paymentData,
          payment_date: data.paymentDate,
          payment_method: data.paymentMethod,
          receipt_number: payment?.receiptNumber || defaultReceiptNumber,
          bank_account: data.bankMoneyReceived,
          cheque_number: data.chequeNumber,
        },
        {
          first_name: student.firstName,
          last_name: student.lastName,
          enrollment_number: student.enrollmentNumber,
          course_name: student.course,
          batch_name: student.batch,
          total_fees: student.totalFees,
          discount: student.discount,
          paidAmount: previouslyPaid,
        }
      );
      
      // Show receipt modal
      setReceiptData(receipt);
      setShowReceipt(true);
    } catch (error) {
      console.error('Error adding/updating payment:', error);
      
      // Handle duplicate payment error (409 Conflict)
      if (error.response?.status === 409) {
        const duplicateDetails = error.response?.data?.details;
        if (duplicateDetails?.existingReceiptNumber) {
          setSubmitError(
            `Duplicate payment detected! A payment of ${formatCurrency(duplicateDetails.amount)} ` +
            `on ${duplicateDetails.paymentDate} already exists (Receipt: ${duplicateDetails.existingReceiptNumber}). ` +
            `Please verify if this is intentional.`
          );
          setExistingReceiptNumber(duplicateDetails.existingReceiptNumber);
        } else {
          setSubmitError(error.response?.data?.error || 'A payment with these details already exists. Please check existing payments.');
        }
        setShowErrorModal(true);
      } else {
        setSubmitError(error.message || 'Failed to save payment. Please try again.');
        setShowErrorModal(true);
      }
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

  // Handle receipt modal close
  const handleReceiptClose = () => {
    setShowReceipt(false);
    setReceiptData(null);
    onClose(); // Close payment form after receipt is closed
  };

  // Handle error modal close
  const handleErrorClose = () => {
    setShowErrorModal(false);
    setSubmitError('');
    setExistingReceiptNumber('');
  };

  // If showing receipt, render receipt modal
  if (showReceipt && receiptData) {
    return <ReceiptModal receiptData={receiptData} onClose={handleReceiptClose} />;
  }

  // If showing error, render error modal
  if (showErrorModal && submitError) {
    return (
      <PaymentErrorModal
        error={submitError}
        existingReceipt={existingReceiptNumber}
        onClose={handleErrorClose}
      />
    )
  };

  // If showing receipt, render receipt modal
  if (showReceipt && receiptData) {
    return <ReceiptModal receiptData={receiptData} onClose={handleReceiptClose} />;
  }

  return (
    <div className="payment-modal-wrapper">
      <div className="payment-modal">
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
              <span className="payment-receipt-value">{payment?.receiptNumber || defaultReceiptNumber}</span>
          </div>
          <div className="payment-receipt-row">
            <span className="payment-receipt-label">Outstanding Amount</span>
            <span className="payment-receipt-amount">{formatCurrency(remainingFees)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="payment-form">
          <div className="payment-field">
            <div className="payment-label-row">
              <label className="payment-label">
                <IndianRupee />
                Amount *
              </label>
              {formattedAmountPreview && (
                <div className="payment-hint">{formattedAmountPreview}</div>
              )}
            </div>
            <input
              {...register('amount')}
              type="text"
              className={`payment-input ${errors.amount ? 'error' : ''}`}
              placeholder={isEditing ? '' : ''}
              inputMode="decimal"
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

          {paymentMethod === 'cheque' && (
            <div className="payment-field">
              <label className="payment-label">
                <FileText />
                Cheque Number *
              </label>
              <input
                {...register('chequeNumber')}
                type="text"
                className={`payment-input ${errors.chequeNumber ? 'error' : ''}`}
                placeholder=""
                autoComplete="off"
              />
              {errors.chequeNumber && (
                <p className="payment-error">{errors.chequeNumber.message}</p>
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
              placeholder={isEditing ? '' : ''}
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
              {isSubmitting ? (isEditing ? 'Updating...' : 'Recording...') : (isEditing ? 'Update Payment' : 'Issue Receipt')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentForm;
