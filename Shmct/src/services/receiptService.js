import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatReceiptDate } from '../utils/receiptHelpers';

/**
 * Generate and download PDF receipt from HTML element
 * @param {string} receiptNumber - Receipt number for filename
 * @param {string} studentName - Student name for filename
 * @returns {Promise<void>}
 */
export const downloadReceiptPDF = async (receiptNumber, studentName) => {
  try {
    // Get the receipt container element
    const receiptElement = document.querySelector('.receipt-container');
    
    if (!receiptElement) {
      throw new Error('Receipt element not found');
    }

    // Hide any no-print elements temporarily
    const noPrintElements = receiptElement.querySelectorAll('.no-print');
    noPrintElements.forEach(el => {
      el.style.display = 'none';
    });

    // Convert HTML to canvas
    const canvas = await html2canvas(receiptElement, {
      scale: 2, // Higher quality
      useCORS: true, // Allow loading images from other domains
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Restore no-print elements
    noPrintElements.forEach(el => {
      el.style.display = '';
    });

    // Calculate dimensions for A4 size
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: imgHeight > imgWidth ? 'portrait' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Add image to PDF
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

    // Generate filename
    const sanitizedStudentName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Receipt_${receiptNumber}_${sanitizedStudentName}.pdf`;

    // Download PDF
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Print receipt directly
 * @returns {void}
 */
export const printReceipt = () => {
  window.print();
};

/**
 * Generate receipt data object for display
 * @param {Object} paymentData - Payment data from form/database
 * @param {Object} studentData - Student information
 * @returns {Object} - Formatted receipt data
 */
export const generateReceiptData = (paymentData, studentData) => {
  return {
    receiptNumber: paymentData.receipt_number || paymentData.receiptNumber,
    paymentDate: paymentData.payment_date || paymentData.paymentDate || new Date().toISOString(),
    studentName: studentData.first_name && studentData.last_name 
      ? `${studentData.first_name} ${studentData.last_name}`
      : studentData.name || 'N/A',
    enrollmentNumber: studentData.enrollment_number || studentData.enrollmentNumber,
    courseName: studentData.course_name || studentData.courseName || 'N/A',
    batchName: studentData.batch_name || studentData.batchName,
    paymentMethod: paymentData.payment_method || paymentData.paymentMethod,
    amount: parseFloat(paymentData.amount),
    totalFees: parseFloat(studentData.total_fees || studentData.totalFees || 0),
    discount: parseFloat(studentData.discount || 0),
    previouslyPaid: parseFloat(studentData.paid_amount || studentData.paidAmount || 0),
    bankAccount: paymentData.bank_account || paymentData.bankAccount,
    chequeNumber: paymentData.cheque_number || paymentData.chequeNumber,
    remarks: paymentData.notes || paymentData.remarks,
  };
};

/**
 * Email receipt (future implementation)
 * @param {string} email - Recipient email
 * @param {Object} receiptData - Receipt data
 * @returns {Promise<void>}
 */
export const emailReceipt = async (email, receiptData) => {
  // TODO: Implement email functionality with backend API
  console.log('Email receipt to:', email, receiptData);
  throw new Error('Email functionality not yet implemented');
};
