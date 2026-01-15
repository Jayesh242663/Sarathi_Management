import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { X, Printer, Download } from 'lucide-react';
import ReceiptTemplate from './ReceiptTemplate';
import { downloadReceiptPDF, printReceipt } from '../../services/receiptService';
import '../receipt/ReceiptTemplate.css';

const ReceiptModal = ({ receiptData, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    printReceipt();
  };

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

  return (
    <div className="receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-modal-header no-print">
          <h3 className="receipt-modal-title">Payment Receipt</h3>
          <div className="receipt-modal-actions">
            <button 
              className="receipt-btn receipt-btn-print" 
              onClick={handlePrint}
              title="Print Receipt"
            >
              <Printer size={16} />
              Print
            </button>
            <button 
              className="receipt-btn receipt-btn-download" 
              onClick={handleDownload}
              disabled={isDownloading}
              title="Download as PDF"
            >
              <Download size={16} />
              {isDownloading ? 'Downloading...' : 'Download PDF'}
            </button>
            <button 
              className="receipt-btn receipt-btn-close" 
              onClick={onClose}
              title="Close"
            >
              <X size={16} />
              Close
            </button>
          </div>
        </div>
        <div className="receipt-modal-body">
          <ReceiptTemplate receiptData={receiptData} showWatermark={false} />
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
};

export default ReceiptModal;
