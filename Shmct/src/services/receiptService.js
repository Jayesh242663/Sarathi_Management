import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatReceiptDate } from '../utils/receiptHelpers';
import { COURSES } from '../utils/constants';

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
 * Generate and download PDF receipt from HTML element.
 *
 * The receipt DOM may be displayed inside a scaled modal preview, so we clone
 * it into an off-screen container at a fixed A4 width (794 px ≈ 210 mm @ 96 DPI),
 * let it lay out naturally, capture that clone, and fit it onto one A4 page.
 * This guarantees the PDF always renders at full size regardless of the preview.
 *
 * @param {string} receiptNumber - Receipt number for filename
 * @param {string} studentName - Student name for filename
 * @returns {Promise<void>}
 */
const A4_WIDTH_PX = 794;   // 210 mm at 96 DPI
const A4_MM_W     = 210;
const A4_MM_H     = 297;

export const downloadReceiptPDF = async (receiptNumber, studentName) => {
  let offscreen = null;

  try {
    // ── 1. Find the live receipt element ──────────────────────────────
    const receiptElement = document.querySelector('.receipt-container');
    if (!receiptElement) throw new Error('Receipt element not found');

    // ── 2. Clone it into an off-screen wrapper at a fixed A4 width ───
    offscreen = document.createElement('div');
    offscreen.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:0',
      `width:${A4_WIDTH_PX}px`,
      'background:#fff',
      'z-index:-1',
      'overflow:visible',
      'pointer-events:none',
    ].join(';');

    const clone = receiptElement.cloneNode(true);
    // Remove any inline width/transform the preview may have set
    clone.style.transform = 'none';
    clone.style.transformOrigin = '';
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';

    // Remove no-print elements from the clone
    clone.querySelectorAll('.no-print').forEach(el => el.remove());

    offscreen.appendChild(clone);
    document.body.appendChild(offscreen);

    // Wait for images inside the clone to finish loading
    await waitForReceiptImages(clone);

    // Small paint delay so the browser lays out the clone
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // ── 3. Capture the clone at 2× resolution ───────────────────────
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
    });

    // ── 4. Build the PDF ─────────────────────────────────────────────
    // Map the captured pixels to A4 mm, then scale to fit one page.
    let imgW = A4_MM_W;
    let imgH = (canvas.height * A4_MM_W) / canvas.width;
    let x = 0;
    let y = 0;

    // If taller than A4, scale the whole image down to fit one page
    if (imgH > A4_MM_H) {
      const ratio = A4_MM_H / imgH;
      imgW *= ratio;
      imgH  = A4_MM_H;
      x = (A4_MM_W - imgW) / 2; // centre horizontally
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Use PNG — lossless, crisp text on receipts
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);

    // ── 5. Download ──────────────────────────────────────────────────
    const safeName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    pdf.save(`Receipt_${receiptNumber}_${safeName}_${ts}.pdf`);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    // Always clean up the off-screen clone
    if (offscreen && offscreen.parentNode) {
      offscreen.parentNode.removeChild(offscreen);
    }
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

  const rawCourseValue =
    studentData.course ||
    studentData.courseType ||
    studentData.course_type ||
    studentData.courseCode ||
    studentData.course_code ||
    '';

  const mappedCourseLabel = COURSES.find((c) => c.value === rawCourseValue)?.label;

  const courseName =
    studentData.courseName ||
    studentData.course_name ||
    mappedCourseLabel ||
    rawCourseValue ||
    'Diploma in Hotel Management';

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

    // Let the backend generate a crisp vector PDF with PDFKit instead of
    // sending a rasterised client-side capture.

    // Make API request to send email (backend will generate the PDF)
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
          studentEmail: receiptData.studentEmail || email,
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
