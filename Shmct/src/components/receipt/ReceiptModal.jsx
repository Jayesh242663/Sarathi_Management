import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X, Download, Mail as MailIcon } from 'lucide-react';
import ReceiptTemplate from './ReceiptTemplate';
import { downloadReceiptPDF, emailReceipt } from '../../services/receiptService';
import { useStudents } from '../../context/StudentContext';
import '../receipt/ReceiptTemplate.css';
import '../receipt/ReceiptModal.css';

const ReceiptModal = ({ receiptData, onClose, studentEmail }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [emailAddress, setEmailAddress] = useState(studentEmail || '');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    setEmailAddress(studentEmail || '');
    setEmailError('');
    setEmailSent(false);
  }, [studentEmail, receiptData]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadReceiptPDF(receiptData.receiptNumber, receiptData.studentName);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert('Failed to download receipt. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const { markPaymentEmailSent } = useStudents();

  const handleSendEmail = async () => {
    // basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailAddress || !emailRegex.test(emailAddress)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailError('');
    setIsEmailing(true);
    try {
      const result = await emailReceipt(emailAddress, { ...receiptData, showWatermark });
      setEmailSent(true);
      // Update local payment state immediately if paymentId returned
      const paymentId = result.paymentId || receiptData.paymentId || null;
      const emailSentAt = result.emailSentAt || new Date().toISOString();
      if (paymentId) markPaymentEmailSent(paymentId, emailSentAt);
      alert(result.message || `Receipt emailed successfully to ${emailAddress}`);
    } catch (error) {
      console.error('Error emailing receipt:', error);
      alert(error.message || 'Failed to send email.');
    } finally {
      setIsEmailing(false);
    }
  };

  return (
    <div className="receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-modal-header no-print">
          <h3 className="receipt-modal-title">Payment Receipt</h3>
          <button className="btn btn-icon receipt-close-icon" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="receipt-modal-body">
          {/* Left: Preview */}
          <div className="receipt-left">
            <div className="receipt-preview-controls">
              <label className="receipt-watermark-toggle">
                <input
                  type="checkbox"
                  checked={showWatermark}
                  onChange={(e) => setShowWatermark(e.target.checked)}
                />
                <span>Show Watermark</span>
              </label>
            </div>
            <div className="receipt-left-inner">
              <ReceiptTemplate receiptData={receiptData} showWatermark={showWatermark} />
            </div>
          </div>

          {/* Right: Actions */}
          <aside className="receipt-right">
            <div className="receipt-actions-header">
              <h4>Actions</h4>
              <p className="muted">Download or send this receipt</p>
            </div>

            <div className="receipt-actions">
              <button
                className="btn btn-primary action-btn"
                onClick={handleDownload}
                disabled={isDownloading}
                title="Download as PDF"
              >
                <Download size={16} />
                <span>{isDownloading ? 'Downloading...' : 'Download PDF'}</span>
              </button>

              {/* Print removed per request */}

              <div className="recipient-block">
                <label className="recipient-label">Send to</label>
                <div className="recipient-email">
                  <input
                    type="email"
                    className="recipient-input"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="recipient@example.com"
                    disabled={isEmailing || emailSent}
                  />
                  {emailError && <div className="recipient-error">{emailError}</div>}
                </div>
              </div>

              <button
                className="btn btn-accent action-btn"
                onClick={handleSendEmail}
                disabled={!emailAddress || isEmailing || emailSent}
                title={emailAddress ? 'Send receipt by email' : 'Email not available'}
              >
                <MailIcon size={16} />
                <span>{isEmailing ? 'Sending...' : emailSent ? 'Sent' : 'Send Email'}</span>
              </button>

              <button className="btn btn-ghost action-btn close-action" onClick={onClose} title="Close preview">
                Close Preview
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

ReceiptModal.propTypes = {
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
  onClose: PropTypes.func.isRequired,
  studentEmail: PropTypes.string,
};

export default ReceiptModal;
