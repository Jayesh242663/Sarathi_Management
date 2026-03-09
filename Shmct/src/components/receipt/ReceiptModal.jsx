import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Download, Mail as MailIcon } from 'lucide-react';
import ReceiptTemplate from './ReceiptTemplate';
import { downloadReceiptPDF, emailReceipt } from '../../services/receiptService';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import '../receipt/ReceiptTemplate.css';
import '../receipt/ReceiptModal.css';

/** Fixed receipt width — A4 at 96 DPI (210 mm ÷ 25.4 × 96 ≈ 794 px) */
const RECEIPT_FIXED_W = 794;

const ReceiptModal = ({ receiptData, onClose, studentEmail }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [emailAddress, setEmailAddress] = useState(studentEmail || '');
  const [emailError, setEmailError] = useState('');

  const { user } = useAuth();
  const isAuditor = user?.role === 'auditor';

  // ── Chrome PDF-viewer style scaling ──────────────────────────
  // The entire receipt is always visible, centred, never scrollable.
  const receiptLeftRef = useRef(null);
  const receiptInnerRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [receiptNaturalH, setReceiptNaturalH] = useState(1122); // A4 default

  useEffect(() => {
    const computeScale = () => {
      const outer = receiptLeftRef.current;
      const inner = receiptInnerRef.current;
      if (!outer || !inner) return;

      // Available space (entire preview area, no controls to subtract)
      const padX = 48;
      const padY = 48;
      const availableW = outer.clientWidth - padX;
      const availableH = outer.clientHeight - padY;
      if (availableW <= 0 || availableH <= 0) return;

      const naturalW = RECEIPT_FIXED_W;
      const naturalH = inner.scrollHeight || 1122;

      const scaleW = availableW / naturalW;
      const scaleH = availableH / naturalH;
      const s = Math.min(scaleW, scaleH, 1);

      setPreviewScale(s);
      setReceiptNaturalH(naturalH);
    };

    let timer = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(computeScale));
    }, 30);

    const ro = new ResizeObserver(() => requestAnimationFrame(computeScale));
    if (receiptLeftRef.current) ro.observe(receiptLeftRef.current);
    if (receiptInnerRef.current) ro.observe(receiptInnerRef.current);

    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [receiptData, showWatermark]);
  // ─────────────────────────────────────────────────────────────

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
        <div className="receipt-modal-body">
          {/* Left: Preview area — page on dark background, Chrome PDF viewer style */}
          <div className="receipt-left" ref={receiptLeftRef}>
            <div className="receipt-scale-frame">
              {/* Sizing wrapper — its width/height reflect the visual (scaled) size
                  so the flex container can centre it properly. */}
              <div
                className="receipt-scale-wrapper"
                style={{
                  width: Math.ceil(RECEIPT_FIXED_W * previewScale),
                  height: Math.ceil(receiptNaturalH * previewScale),
                }}
              >
                <div
                  className="receipt-left-inner"
                  ref={receiptInnerRef}
                  style={{
                    width: RECEIPT_FIXED_W,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <ReceiptTemplate receiptData={receiptData} showWatermark={showWatermark} />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Chrome-style sidebar */}
          <aside className="receipt-sidebar">
            <div className="sidebar-header">
              <h2 className="sidebar-title">Receipt</h2>
              <span className="sidebar-page-count">{receiptData.receiptNumber} &middot; 1 page</span>
            </div>

            <div className="sidebar-scroll">
              <div className="sidebar-section">
                <span className="sidebar-label">Destination</span>
                <div className="sidebar-control">
                  <div className="sidebar-select-display">
                    <span className="sidebar-select-icon"><Download size={14} /></span>
                    Save as PDF
                  </div>
                </div>
              </div>

              <div className="sidebar-section">
                <div className="sidebar-control sidebar-control-full">
                  <label className="sidebar-checkbox">
                    <input
                      type="checkbox"
                      checked={showWatermark}
                      onChange={(e) => setShowWatermark(e.target.checked)}
                    />
                    <span>Show watermark</span>
                  </label>
                </div>
              </div>

              {!isAuditor && (
                <div className="sidebar-section sidebar-section-stacked">
                  <span className="sidebar-label">Send to</span>
                  <div className="sidebar-control sidebar-control-full">
                    <input
                      type="email"
                      className="sidebar-input"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      placeholder="recipient@example.com"
                      disabled={isEmailing || emailSent}
                    />
                    {emailError && <div className="sidebar-error">{emailError}</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="sidebar-button-strip">
              <button
                className="sidebar-btn sidebar-btn-action"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? 'Saving…' : 'Save'}
              </button>
              {!isAuditor && (
                <button
                  className="sidebar-btn sidebar-btn-accent"
                  onClick={handleSendEmail}
                  disabled={!emailAddress || isEmailing || emailSent}
                >
                  <MailIcon size={14} />
                  <span>{isEmailing ? 'Sending…' : emailSent ? 'Sent ✓' : 'Email'}</span>
                </button>
              )}
              <button className="sidebar-btn sidebar-btn-cancel" onClick={onClose}>
                Cancel
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
