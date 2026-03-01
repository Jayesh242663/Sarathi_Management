import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatReceiptDate } from '../utils/receiptHelpers';

const waitForReceiptImages = async (rootElement, timeoutMs = 3000) => {
  const images = Array.from(rootElement.querySelectorAll('img'));
  if (!images.length) return;

  const waiters = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const cleanup = () => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      };
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        resolve();
      };

      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    });
  });

  await Promise.race([
    Promise.all(waiters),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

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

    await waitForReceiptImages(receiptElement);

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

    // Add image to PDF (download) - use JPEG for smaller file size while keeping good quality
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

    // Signature is embedded in HTML (via DOM)

    // Generate filename (include timestamp to avoid stale cached files)
    const sanitizedStudentName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Receipt_${receiptNumber}_${sanitizedStudentName}_${timestamp}.pdf`;

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
  // Handle both database field names and camelCase properties
  const studentName = studentData.firstName && studentData.lastName
    ? `${studentData.firstName} ${studentData.lastName}`
    : studentData.first_name && studentData.last_name
    ? `${studentData.first_name} ${studentData.last_name}`
    : studentData.name || 'N/A';

  const courseName = studentData.course 
    ? studentData.course
    : studentData.courseName 
    ? studentData.courseName
    : studentData.course_name || 'Diploma in Hotel Management';

  const totalFees = studentData.totalFees 
    ? parseFloat(studentData.totalFees)
    : parseFloat(studentData.total_fees || 0);

  const discount = parseFloat(studentData.discount || 0);

  return {
    receiptNumber: paymentData.receipt_number || paymentData.receiptNumber,
    paymentId: paymentData.id || paymentData.payment_id || null,
    paymentDate: paymentData.payment_date || paymentData.paymentDate || new Date().toISOString(),
    studentName: studentName,
    // Support multiple possible email field names coming from different data sources
    studentEmail: studentData.email || studentData.studentEmail || studentData.email_address || studentData.emailAddress || '',
    enrollmentNumber: studentData.enrollment_number || studentData.enrollmentNumber,
    courseName: courseName,
    batchName: studentData.batch || studentData.batch_name || studentData.batchName,
    paymentMethod: paymentData.payment_method || paymentData.paymentMethod,
    amount: parseFloat(paymentData.amount),
    totalFees: totalFees,
    discount: discount,
    previouslyPaid: parseFloat(studentData.paid_amount || studentData.paidAmount || 0),
    bankAccount: paymentData.bank_account || paymentData.bankAccount,
    chequeNumber: paymentData.cheque_number || paymentData.chequeNumber,
    remarks: paymentData.notes || paymentData.remarks,
  };
};
/**
 * Email receipt via backend API
 * @param {string} email - Recipient email
 * @param {Object} receiptData - Receipt data
 * @returns {Promise<Object>} - Email send result
 */
export const emailReceipt = async (email, receiptData) => {
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address format');
    }

    // Validate receipt data
    if (!receiptData || !receiptData.receiptNumber) {
      throw new Error('Invalid receipt data');
    }

    // Get API base URL from environment or use default
    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

    // Generate PDF client-side with captured HTML elements
    const receiptElement = document.querySelector('.receipt-container');
    if (!receiptElement) throw new Error('Receipt element not found for email generation');

    // Hide any no-print elements temporarily
    const noPrintElements = receiptElement.querySelectorAll('.no-print');
    noPrintElements.forEach(el => { el.style.display = 'none'; });

    await waitForReceiptImages(receiptElement);

    const canvas = await html2canvas(receiptElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Restore no-print elements
    noPrintElements.forEach(el => { el.style.display = ''; });

    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    // For emailed PDF use higher compression: export as JPEG with lower quality
    const imgData = canvas.toDataURL('image/jpeg', 0.7);
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

    // Get base64 PDF (without data URI prefix) and send to server
    const pdfDataUri = pdf.output('datauristring'); // data:application/pdf;base64,...
    const pdfBase64 = pdfDataUri.includes(',') ? pdfDataUri.split(',')[1] : pdfDataUri;

    // Make API request to send email with client-generated PDF
    const response = await fetch(`${apiBaseUrl}/payments/email-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('shmct_auth_token') && {
          'Authorization': `Bearer ${localStorage.getItem('shmct_auth_token')}`
        })
      },
      credentials: 'include',
      body: JSON.stringify({
        recipientEmail: email,
        receiptData: {
          receiptNumber: receiptData.receiptNumber,
          paymentDate: receiptData.paymentDate,
          studentName: receiptData.studentName,
          courseName: receiptData.courseName,
          paymentMethod: receiptData.paymentMethod,
          amount: parseFloat(receiptData.amount),
          totalFees: parseFloat(receiptData.totalFees),
          discount: receiptData.discount ? parseFloat(receiptData.discount) : 0,
          previouslyPaid: receiptData.previouslyPaid ? parseFloat(receiptData.previouslyPaid) : 0,
          bankAccount: receiptData.bankAccount || undefined,
          chequeNumber: receiptData.chequeNumber || undefined,
          showWatermark: receiptData.showWatermark || false,
        },
        pdfBase64: pdfBase64,
        paymentId: receiptData.paymentId || undefined,
      }),
    });

    // Parse response
    const result = await response.json();

    // Handle errors
    if (!response.ok) {
      throw new Error(result.message || result.error || 'Failed to send email');
    }

    return {
      success: true,
      message: result.message || 'Receipt sent successfully',
      recipient: email,
      receiptNumber: receiptData.receiptNumber,
    };
  } catch (error) {
    console.error('Error sending email receipt:', error);
    throw error;
  }
};
