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
  const signatureUrl = import.meta.env.VITE_SIGNATURE_PATH || '/test_sign.png'; // Fallback to test_sign if env not set

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
    <div className={`receipt-container ${receiptData.paymentMethod === 'cheque' ? 'cheque-mode' : ''}`}>
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
              {INSTITUTION_INFO.fullName}<sup>™</sup>
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
        <div className="receipt-title">RECEIPT</div>

        {/* Receipt Number and Date */}
        <div className="receipt-info-row">
          <div className="receipt-number" style={{ fontSize: '14px', fontWeight: '700', color: '#000' }}>
            Receipt No. {receiptData.receiptNumber}
          </div>
          <div className="receipt-date" style={{ fontSize: '14px', fontWeight: '700' }}>
            Date : {formatReceiptDate(receiptData.paymentDate)}
          </div>
        </div>

        {/* Student Details: name on left, email (Gmail: ...) aligned to the right */}
        <div className="student-details-row">
          <div className="student-detail full-name">
            <span className="receipt-label">Student Name :</span>
            <span className="receipt-value">{String(receiptData.studentName || '').toUpperCase()}</span>
          </div>

          <div className="student-detail student-email-right">
            <span className="receipt-label">Gmail :</span>
            <span className="receipt-value">
              {receiptData.studentEmail || receiptData.email || <span className="muted">Email not available</span>}
            </span>
          </div>
        </div>

        {/* Divider after student contact info */}
        <div className="receipt-divider" />

        {/* Course Selection */}
        <div className="receipt-course-section">
          <div className="receipt-course-title">Course :</div>
          <div className="receipt-course-list">
            {COURSE_OPTIONS_RECEIPT.map((course) => {
              const isSelected = course.id === courseIndex;
              return (
                <div key={course.id} className="receipt-course-item">
                  <div className={`receipt-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </div>
                  <span>{course.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider after course section */}
        <div className="receipt-divider" />

        {/* Payment Mode */}
        <div className="receipt-payment-mode">
          <strong>Payment mode :</strong>
          <span className="receipt-payment-methods">
            {receiptData.paymentMethod === 'upi' && <span className="receipt-payment-method selected">Gpay / Phonpay / PTM</span>}
            {receiptData.paymentMethod === 'cash' && <span className="receipt-payment-method selected">Cash</span>}
            {receiptData.paymentMethod === 'cheque' && <span className="receipt-payment-method selected">Cheque</span>}
          </span>
        </div>

        {/* Amount Details */}
        <div className="receipt-amounts">
          {/* Show Total Fees and Discount only on first payment */}
          {amounts.previouslyPaid === 0 ? (
            <>
              {/* Total Fees */}
              <div className="receipt-amount-row">
                <span className="receipt-amount-label">Total Fees :</span>
                <div className="receipt-amount-box">
                  {formatAmount(amounts.totalFees)}/-
                </div>
              </div>

              {/* Discount (if applicable) */}
              {amounts.discount > 0 && (
                <div className="receipt-amount-row">
                  <span className="receipt-amount-label">Discount :</span>
                  <div className="receipt-amount-box">
                    {formatAmount(amounts.discount)}/-
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Show Fees Paid Until Now on subsequent payments */}
              <div className="receipt-amount-row">
                <span className="receipt-amount-label">Fees Paid Until Now :</span>
                <div className="receipt-amount-box">
                  {formatAmount(amounts.previouslyPaid)}/-
                </div>
              </div>
            </>
          )}

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
          <strong>Payment Received in word : </strong>
          <span className="receipt-amount-words-value">{amountInWords}</span>
        </div>

        {/* Cheque Details - Only show when payment method is cheque */}
        {receiptData.paymentMethod === 'cheque' && (
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
          </div>
        )}

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
            {/* Digital Signature */}
            <div className="receipt-signature-image">
              {signatureUrl ? (
                <img
                  src={signatureUrl}
                  alt="Authorized Signature"
                  className="signature-image"
                  onLoad={() => console.log('[ReceiptTemplate] Signature image loaded successfully')}
                  onError={(e) => { 
                    console.error('[ReceiptTemplate] Signature image failed to load, src was:', e.currentTarget.src);
                    e.target.style.display = 'none'; 
                  }}
                />
              ) : <div style={{color: '#999', fontSize: '12px'}}>Loading signature...</div>}
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
    studentEmail: PropTypes.string,
    studentPhone: PropTypes.string,
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
