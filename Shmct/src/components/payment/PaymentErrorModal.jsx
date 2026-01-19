import { X, AlertCircle, Receipt } from 'lucide-react';
import './PaymentErrorModal.css';

const PaymentErrorModal = ({ error, existingReceipt, onClose, onViewExisting }) => {
  if (!error) return null;

  const isDuplicateError = error.includes('duplicate') || error.includes('already exists');

  return (
    <div className="payment-error-overlay" onClick={onClose}>
      <div className="payment-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="payment-error-header">
          <div className="payment-error-icon-wrapper">
            <AlertCircle className="payment-error-icon" />
          </div>
          <button onClick={onClose} className="payment-error-close">
            <X />
          </button>
        </div>

        <div className="payment-error-content">
          <h3 className="payment-error-title">
            {isDuplicateError ? 'Duplicate Payment Detected' : 'Payment Error'}
          </h3>
          
          <p className="payment-error-message">{error}</p>

          {isDuplicateError && existingReceipt && (
            <div className="payment-error-existing">
              <div className="payment-error-existing-header">
                <Receipt size={18} />
                <span>Existing Payment</span>
              </div>
              <div className="payment-error-existing-body">
                <p className="payment-error-existing-label">Receipt Number:</p>
                <p className="payment-error-existing-value">{existingReceipt}</p>
              </div>
            </div>
          )}

          {isDuplicateError && (
            <div className="payment-error-info">
              <p className="payment-error-info-title">💡 What you can do:</p>
              <ul className="payment-error-info-list">
                <li>Verify if this payment was already recorded</li>
                <li>Check the existing receipt number above</li>
                <li>Modify the amount or date if this is a different payment</li>
                <li>Contact support if you believe this is an error</li>
              </ul>
            </div>
          )}
        </div>

        <div className="payment-error-actions">
          {isDuplicateError && onViewExisting && existingReceipt && (
            <button onClick={onViewExisting} className="payment-error-btn payment-error-btn-secondary">
              <Receipt size={16} />
              View Existing Payment
            </button>
          )}
          <button onClick={onClose} className="payment-error-btn payment-error-btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentErrorModal;
