import React from 'react';
import PropTypes from 'prop-types';
import { INSTITUTION_INFO, COURSE_OPTIONS_RECEIPT } from '../../utils/constants';
import { 
  numberToWords, 
  calculateReceiptAmounts, 
  formatReceiptDate, 
  formatAmount,
  getPaymentMethodLabel,
  getCourseCheckboxIndex 
} from '../../utils/receiptHelpers';
import './ReceiptTemplate.css';

const ReceiptTemplate = ({ receiptData, showWatermark = false }) => {
  // Calculate all amounts
  const amounts = calculateReceiptAmounts({
    totalFees: receiptData.totalFees,
    discount: receiptData.discount || 0,
    paidAmount: receiptData.previouslyPaid || 0,
    currentPayment: receiptData.amount,
  });

  // Get payment method display
  const paymentMethod = getPaymentMethodLabel(receiptData.paymentMethod);

  // Get course checkbox index
  const courseIndex = getCourseCheckboxIndex(receiptData.courseName);

  // Format payment in words
  const amountInWords = numberToWords(amounts.receivedAmount);

  return (
    <div className="receipt-container">
      {showWatermark && <div className="receipt-watermark">COPY</div>}
      
      <div className="receipt-content">
        {/* Header */}
        <div className="receipt-header">
          <img 
            src={INSTITUTION_INFO.logoPath} 
            alt={INSTITUTION_INFO.shortName} 
            className="receipt-logo"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="receipt-institution-info">
            <h1 className="receipt-institution-name">
              {INSTITUTION_INFO.fullName}
            </h1>
            <div className="receipt-approval">{INSTITUTION_INFO.approvalText}</div>
            <div className="receipt-address">{INSTITUTION_INFO.address}</div>
            <div className="receipt-contact">Phone : {INSTITUTION_INFO.phone}</div>
            <div className="receipt-contact">
              Web.: Email : {INSTITUTION_INFO.email} &nbsp; Web : {INSTITUTION_INFO.website}
            </div>
          </div>
        </div>

        {/* Receipt Title */}
        <div className="receipt-title-box">
          <h2 className="receipt-title">RECEIPT</h2>
        </div>

        {/* Receipt Number and Date */}
        <div className="receipt-info-row">
          <div className="receipt-number">Receipt No. {receiptData.receiptNumber}</div>
          <div className="receipt-date">Date : {formatReceiptDate(receiptData.paymentDate)}</div>
        </div>

        {/* Student Name */}
        <div className="receipt-field">
          <span className="receipt-label">Student Name :</span>
          <span className="receipt-value">{receiptData.studentName}</span>
        </div>

        {/* Course Selection */}
        <div className="receipt-course-section">
          <div className="receipt-course-title">Course :</div>
          <div className="receipt-course-list">
            {COURSE_OPTIONS_RECEIPT.map((course) => (
              <div key={course.id} className="receipt-course-item">
                <div className={`receipt-checkbox ${course.id === courseIndex ? 'checked' : ''}`}>
                  {course.id === courseIndex && ''}
                </div>
                <span>{course.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Mode */}
        <div className="receipt-payment-mode">
          <strong>Payment mode :</strong>
          <span className="receipt-payment-methods">
            <span className={`receipt-payment-method ${receiptData.paymentMethod === 'upi' ? 'selected' : ''}`}>Gpay / Phonpay / PTM</span>
            <span> / </span>
            <span className={`receipt-payment-method ${receiptData.paymentMethod === 'cash' ? 'selected' : ''}`}>Cash</span>
            <span> / </span>
            <span className={`receipt-payment-method ${receiptData.paymentMethod === 'cheque' ? 'selected' : ''}`}>Cheque</span>
          </span>
        </div>

        {/* Amount Details */}
        <div className="receipt-amounts">
          {/* Outstanding Amount */}
          <div className="receipt-amount-row">
            <span className="receipt-amount-label">Outstanding Amount :</span>
            <div className="receipt-amount-box">
              {formatAmount(amounts.outstandingAmount)}/-
            </div>
            {amounts.discount > 0 && (
              <span className="receipt-discount-note">
                (₹{formatAmount(amounts.totalFees)} - Discount ₹{formatAmount(amounts.discount)})
              </span>
            )}
          </div>

          {/* Received Amount */}
          <div className="receipt-amount-row">
            <span className="receipt-amount-label">Received Amount :</span>
            <div className="receipt-amount-box">
              {formatAmount(amounts.receivedAmount)}/-
            </div>
          </div>

          {/* Balance Amount */}
          <div className="receipt-amount-row">
            <span className="receipt-amount-label">Balance Amount :</span>
            <div className="receipt-amount-box">
              {formatAmount(amounts.balanceAmount)}/-
            </div>
          </div>
        </div>

        {/* Payment in Words */}
        <div className="receipt-amount-words">
          <div className="receipt-amount-words-label">Payment Received in word :</div>
          <div className="receipt-amount-words-value">{amountInWords}</div>
        </div>

        {/* Cheque Details */}
        <div className="receipt-cheque-section">
          <div className="receipt-cheque-row">
            <div className="receipt-cheque-field">
              <strong>Cheque No. :</strong>
              <span>{receiptData.chequeNumber || '___________________'}</span>
            </div>
            <div className="receipt-cheque-field">
              <strong>Cheque Amount :</strong>
              <span>{receiptData.chequeNumber ? formatAmount(amounts.receivedAmount) : '___________________'}</span>
            </div>
          </div>
          <div className="receipt-cheque-row">
            <div className="receipt-cheque-field">
              <strong>Cheque Date :</strong>
              <span>{receiptData.chequeNumber ? formatReceiptDate(receiptData.paymentDate) : '___________________'}</span>
            </div>
            <div className="receipt-cheque-field">
              <strong>Bank Name :</strong>
              <span>{receiptData.bankAccount || '___________________'}</span>
            </div>
          </div>
          <div className="receipt-cheque-row">
            <div className="receipt-cheque-field">
              <strong>Transaction ID. :</strong>
              <span>{'___________________'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="receipt-footer">
          {/* Terms */}
          <div className="receipt-terms">
            <div className="receipt-terms-title">TERMS :</div>
            <ul className="receipt-terms-list">
              {INSTITUTION_INFO.terms.map((term, index) => (
                <li key={index}>{term}</li>
              ))}
            </ul>
          </div>

          {/* Signature */}
          <div className="receipt-signature-section">
            <div className="receipt-institution-footer">
              {INSTITUTION_INFO.fullName}.
            </div>
            <div className="receipt-signature-line">Authorised Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
};

ReceiptTemplate.propTypes = {
  receiptData: PropTypes.shape({
    receiptNumber: PropTypes.string.isRequired,
    paymentDate: PropTypes.string.isRequired,
    studentName: PropTypes.string.isRequired,
    courseName: PropTypes.string.isRequired,
    paymentMethod: PropTypes.string.isRequired,
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    totalFees: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    discount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    previouslyPaid: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    bankAccount: PropTypes.string,
    chequeNumber: PropTypes.string,
  }).isRequired,
  showWatermark: PropTypes.bool,
};

export default ReceiptTemplate;
