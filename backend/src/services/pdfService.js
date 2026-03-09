import puppeteer from 'puppeteer';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PDF generation service using Puppeteer
 * Converts receipt HTML template to PDF for email attachments
 */

/**
 * Generate receipt PDF from HTML template
 * 
 * @param {Object} receiptData - Receipt data to render
 * @returns {Promise<Buffer>} - PDF as buffer
 */
async function generateReceiptPDF(receiptData) {
  let browser = null;

  try {
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Generate HTML content
    const htmlContent = await generateReceiptHTML(receiptData);

    // Set content and wait for rendering
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
    });

    // Choose a scale that keeps content on a single A4 page. Cheque receipts often have extra rows,
    // reduce the scale slightly for cheque mode so the whole receipt fits.
    const pdfScale = receiptData.paymentMethod === 'cheque' ? 0.82 : 0.88;

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      scale: pdfScale,
      margin: {
        top: '8mm',
        right: '8mm',
        bottom: '8mm',
        left: '8mm',
      },
    });

    // Ensure buffer is properly formatted
    if (!pdfBuffer) {
      throw new Error('PDF generation returned empty result');
    }

    // Convert to Buffer if needed (puppeteer may return Uint8Array)
    const finalBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    
    console.log(`[PDF] Generated PDF successfully: ${finalBuffer.length} bytes`);
    return finalBuffer;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate complete HTML for receipt
 * 
 * @param {Object} receiptData - Receipt data
 * @returns {Promise<string>} - Complete HTML string
 */
async function generateReceiptHTML(receiptData) {
  // Load logo as base64
  let logoHTML = '<div style="width: 80px; height: 80px; background: #f0f0f0; border: 2px solid #3e4095; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0;"><div style="text-align: center; font-size: 12px; font-weight: bold; color: #3e4095;">SHMCT<br/>LOGO</div></div>';
  
  try {
    // Try to load the actual favicon from services directory
    const faviconPath = path.join(__dirname, 'favicon.png');
    const logoBuffer = await fs.readFile(faviconPath);
    const base64Logo = logoBuffer.toString('base64');
    logoHTML = `<img src="data:image/png;base64,${base64Logo}" alt="SHMCT Logo" style="width: 80px; height: 80px; object-fit: contain; border-radius: 4px;" />`;
    console.log('[PDF] Logo loaded successfully from:', faviconPath);
  } catch (error) {
    console.warn('[PDF] Could not load favicon, using placeholder:', error.message);
    // Keep default placeholder
  }

  // Load signature image from URL and embed as base64
  let signatureHTML = '';
  try {
    const signatureUrl = process.env.SIGNATURE_PATH;
    if (!signatureUrl) {
      console.warn('[PDF] SIGNATURE_PATH env var not set');
      signatureHTML = '';
    } else {
      const response = await fetch(signatureUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch signature: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const signatureBuffer = Buffer.from(arrayBuffer);
      const base64Signature = signatureBuffer.toString('base64');
      signatureHTML = `<img src="data:image/png;base64,${base64Signature}" alt="Signature" style="max-width: 150px; height: auto;" />`;
      console.log('[PDF] Signature loaded from SIGNATURE_PATH URL');
    }
  } catch (err) {
    console.warn('[PDF] Could not load signature from URL, continuing without signature:', err?.message);
    signatureHTML = '';
  }

  // Calculate amounts
  const amounts = calculateReceiptAmounts({
    totalFees: receiptData.totalFees,
    discount: receiptData.discount || 0,
    paidAmount: receiptData.previouslyPaid || 0,
    currentPayment: receiptData.amount,
  });

  // Helper functions
  const formatAmount = (amount) => {
    return parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatReceiptDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      cash: 'Cash',
      upi: 'Gpay / Phonpay / PTM',
      cheque: 'Cheque',
      card: 'Credit/Debit Card',
      bank_transfer: 'Bank Transfer',
    };
    return labels[method] || method;
  };

  const getCourseCheckboxIndex = (courseName) => {
    if (!courseName) return 5;
    const normalized = String(courseName).toLowerCase();
    if (normalized.includes('bsc') && normalized.includes('hotel')) return 1;
    if (normalized.includes('diploma') && normalized.includes('hotel')) return 2;
    if (normalized.includes('international') && normalized.includes('diploma')) return 3;
    if (normalized.includes('certificate')) return 4;
    return 5;
  };

  const amountInWords = numberToWords(amounts.receivedAmount);
  const courseIndex = getCourseCheckboxIndex(receiptData.courseName);
  const courseOptions = [
    { id: 1, label: 'BSC in Hotel Management' },
    { id: 2, label: 'Diploma in Hotel Management' },
    { id: 3, label: 'International Diploma in Hotel Management' },
    { id: 4, label: 'Certificate in' },
    { id: 5, label: 'Others' },
  ];

  // Read CSS file
  const cssPath = path.join(__dirname, 'receiptTemplate.css');
  let cssContent = '';
  try {
    cssContent = await fs.readFile(cssPath, 'utf-8');
  } catch (error) {
    console.warn('Could not load CSS file, using embedded styles');
    cssContent = getEmbeddedCSS();
  }

  // Institution info
  const institutionInfo = {
    fullName: 'Sarathi School of Management & Catering Technology',
    shortName: 'SHMCT',
    address: 'Off. No.: 8th, 3rd Floor, Nehele Apt., Shiv Mandir Road, Dombivli (East) 421 201.',
    phone: '0251-2800090 / 9699129153 / 9029043425',
    email: 'info@sarathishmct.com',
    website: 'www.sarathishmct.com',
    approvalText: 'Approved By NCVSTE New Delhi, Recognized By Govt. of India',
    terms: [
      'Fees Once Paid will not be Refunded.',
      'Cheque Bounce Charges are Rs. 1,000/-',
    ],
  };

  // Generate HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${receiptData.receiptNumber}</title>
  <style>
    ${cssContent}
  </style>
</head>
<body>
  <div class="receipt-container${receiptData.paymentMethod === 'cheque' ? ' cheque-mode' : ''}">
    ${receiptData.showWatermark ? '<div class="receipt-watermark">COPY</div>' : ''}
    
    <div class="receipt-content">
      <!-- Header -->
      <div class="receipt-header">
        ${logoHTML}
        <div class="receipt-institution-info">
          <h1 class="receipt-institution-name">${institutionInfo.fullName}<sup>™</sup></h1>
          <div class="receipt-approval">${institutionInfo.approvalText}</div>
          <div class="receipt-address">${institutionInfo.address}</div>
          <div class="receipt-contact">Phone : ${institutionInfo.phone}</div>
          <div class="receipt-contact">Web.: Email : ${institutionInfo.email} &nbsp; Web : ${institutionInfo.website}</div>
        </div>
      </div>

      <!-- Receipt Title -->
      <div class="receipt-title">RECEIPT</div>

      <!-- Receipt Number and Date -->
      <div class="receipt-info-row">
        <div class="receipt-number" style="font-size: 14px; font-weight: 700; color: #000;">
          Receipt No. ${receiptData.receiptNumber}
        </div>
        <div class="receipt-date" style="font-size: 14px; font-weight: 700;">
          Date : ${formatReceiptDate(receiptData.paymentDate)}
        </div>
      </div>

      <!-- Student Details: Name and Email on same line (remove phone) -->
      <div class="student-details-row">
        <div class="student-detail">
          <span class="receipt-label">Student Name :</span>
          <span class="receipt-value">${String(receiptData.studentName || '').toUpperCase()}</span>
        </div>
        <div class="student-detail student-email">
          <span class="receipt-label">Email :</span>
          <span class="receipt-value">${receiptData.studentEmail || receiptData.email || ''}</span>
        </div>
      </div>

      <!-- Course Selection -->
      <div class="receipt-course-section">
        <div class="receipt-course-title">Course :</div>
        <div class="receipt-course-list">
          ${courseOptions.map((course) => {
            const isSelected = course.id === courseIndex;
            return `
          <div class="receipt-course-item">
            <div class="receipt-checkbox ${isSelected ? 'checked' : ''}">${isSelected ? '✓' : ''}</div>
            <span>${course.label}</span>
          </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Payment Mode -->
      <div class="receipt-payment-mode">
        <strong>Payment mode :</strong>
        <span class="receipt-payment-methods">
          <span class="receipt-payment-method selected">${getPaymentMethodLabel(receiptData.paymentMethod)}</span>
        </span>
      </div>

      <!-- Amount Details -->
      <div class="receipt-amounts">
        ${receiptData.previouslyPaid === 0 ? `
        <!-- Show Total Fees and Discount only on first payment -->
        <!-- Total Fees -->
        <div class="receipt-amount-row">
          <span class="receipt-amount-label">Total Fees :</span>
          <div class="receipt-amount-box">${formatAmount(amounts.totalFees)}/-</div>
        </div>

        ${amounts.discount > 0 ? `
        <!-- Discount -->
        <div class="receipt-amount-row">
          <span class="receipt-amount-label">Discount :</span>
          <div class="receipt-amount-box">${formatAmount(amounts.discount)}/-</div>
        </div>
        ` : ''}
        ` : `
        <!-- Show Fees Paid Until Now on subsequent payments -->
        <div class="receipt-amount-row">
          <span class="receipt-amount-label">Fees Paid Until Now :</span>
          <div class="receipt-amount-box">${formatAmount(amounts.previouslyPaid)}/-</div>
        </div>
        `}

        <!-- Received Amount -->
        <div class="receipt-amount-row">
          <span class="receipt-amount-label">Received Amount :</span>
          <div class="receipt-amount-box">${formatAmount(amounts.receivedAmount)}/-</div>
        </div>

        <!-- Balance Amount -->
        <div class="receipt-amount-row">
          <span class="receipt-amount-label">Balance Amount :</span>
          <div class="receipt-amount-box">${formatAmount(amounts.balanceAmount)}/-</div>
        </div>
      </div>

      <!-- Payment in Words -->
      <div class="receipt-amount-words">
        <strong>Payment Received in word : </strong>
        <span class="receipt-amount-words-value">${amountInWords}</span>
      </div>

      ${receiptData.paymentMethod === 'cheque' ? `
      <!-- Cheque Details -->
      <div class="receipt-cheque-section">
        <div class="receipt-cheque-row">
          <div class="receipt-cheque-field">
            <strong>Cheque No. :</strong>
            <span>${receiptData.chequeNumber || '___________________'}</span>
          </div>
          <div class="receipt-cheque-field">
            <strong>Cheque Amount :</strong>
            <span>${receiptData.chequeNumber ? formatAmount(amounts.receivedAmount) : '___________________'}</span>
          </div>
        </div>
        <div class="receipt-cheque-row">
          <div class="receipt-cheque-field">
            <strong>Cheque Date :</strong>
            <span>${receiptData.chequeNumber ? formatReceiptDate(receiptData.paymentDate) : '___________________'}</span>
          </div>
          <div class="receipt-cheque-field">
            <strong>Bank Name :</strong>
            <span>${receiptData.bankAccount || '___________________'}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Footer -->
      <div class="receipt-footer">
        <!-- Terms -->
        <div class="receipt-terms">
          <div class="receipt-terms-title">TERMS :</div>
          <ul class="receipt-terms-list">
            ${institutionInfo.terms.map(term => `<li>${term}</li>`).join('\n            ')}
          </ul>
        </div>

        <!-- Signature -->
        <div class="receipt-signature-section">
          <div class="receipt-institution-footer">${institutionInfo.fullName}.</div>
          <div class="receipt-signature-image">${signatureHTML}</div>
          <div class="receipt-signature-line">Authorised Signature</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Calculate receipt amounts
 */
function calculateReceiptAmounts({ totalFees, discount, paidAmount, currentPayment }) {
  const total = parseFloat(totalFees);
  const disc = parseFloat(discount);
  const paid = parseFloat(paidAmount);
  const current = parseFloat(currentPayment);

  // Apply discount only on first payment (when paidAmount is 0) for display purposes
  const applicableDiscount = paid === 0 ? disc : 0;

  // Always subtract discount from total to calculate net amount owed
  const netTotal = total - disc;
  const totalPaid = paid + current;
  const balance = netTotal - totalPaid;

  return {
    totalFees: total,
    discount: applicableDiscount,
    netTotal: netTotal,
    previouslyPaid: paid,
    receivedAmount: current,
    totalPaid: totalPaid,
    balanceAmount: Math.max(0, balance),
  };
}

/**
 * Convert number to words (Indian numbering system)
 */
function numberToWords(num) {
  let amount = Math.floor(parseFloat(num));

  if (amount === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanThousand(n) {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
  }

  let words = '';

  // Crores
  if (amount >= 10000000) {
    words += convertLessThanThousand(Math.floor(amount / 10000000)) + ' Crore ';
    amount %= 10000000;
  }

  // Lakhs
  if (amount >= 100000) {
    words += convertLessThanThousand(Math.floor(amount / 100000)) + ' Lakh ';
    amount %= 100000;
  }

  // Thousands
  if (amount >= 1000) {
    words += convertLessThanThousand(Math.floor(amount / 1000)) + ' Thousand ';
    amount %= 1000;
  }

  // Hundreds, tens, and ones
  if (amount > 0) {
    words += convertLessThanThousand(amount);
  }

  return words.trim() + ' Rupees Only';
}

/**
 * Get embedded CSS (fallback if file not found)
 */
function getEmbeddedCSS() {
  return `
    @page { size: A4; margin: 10mm; }
    /* Global printing and layout safety for embedded fallback */
    html, body { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-text-size-adjust: 100%; }
    *, *::before, *::after { box-sizing: inherit; }
    /* Neutralize automatic link/phone/email detection in renderers */
    a, a:link, a:visited, a[href] { color: inherit !important; text-decoration: none !important; cursor: default; }
    a[href^="tel"], a[href^="mailto"] { pointer-events: none; }
    body { margin: 0; padding: 0 0 120px 0; font-family: Arial, sans-serif; }
    .receipt-container { background: white; max-width: 760px; margin: 0 auto; padding: 12px; color: #000; position: relative; }
    .receipt-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; font-weight: bold; color: rgba(0, 0, 0, 0.03); pointer-events: none; z-index: 0; white-space: nowrap; }
    .receipt-content { position: relative; z-index: 1; margin-bottom: 110px; }
    .receipt-header { border-bottom: 3px solid #3e4095; padding-bottom: 10px; margin-bottom: 20px; display: flex; align-items: center; gap: 20px; }
    .receipt-logo-placeholder { width: 80px; height: 80px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; flex-shrink: 0; }
    .receipt-institution-info { flex: 1; text-align: center; }
    .receipt-institution-name { color: #3e4095; font-size: 18px; font-weight: bold; margin: 0 0 5px 0; }\n    .receipt-institution-name sup { font-size: 0.6em; margin-left: 2px; }
    .receipt-approval { font-size: 12px; font-weight: bold; margin: 5px 0; }
    .receipt-address { font-size: 11px; margin: 5px 0; line-height: 1.4; }
    .receipt-contact { font-size: 11px; margin: 3px 0; }
    .receipt-title { text-align: center; font-size: 20px; font-weight: bold; margin: 15px 0; letter-spacing: 2px; }
    .receipt-info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
    .receipt-number, .receipt-date { font-size: 14px !important; font-weight: 700 !important; color: #000 !important; line-height: 1.4 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }
    .receipt-field { display: flex; margin-bottom: 10px; font-size: 14px; }
    .receipt-label { font-weight: bold; min-width: 150px; }
    .receipt-value { flex: 1; padding-left: 10px; }
    /* Improve layout stability for PDF rendering */
    .receipt-value, .receipt-amount-box, .receipt-cheque-field span { word-break: break-word; white-space: normal; }
    .receipt-container img, .receipt-content img { max-width: 100%; height: auto; }
    .student-details-row { display: flex; gap: 60px; align-items: center; margin-bottom: 10px; }
    .student-detail { display: flex; align-items: center; }
    .student-detail .receipt-label { min-width: 60px; }
    .student-detail .receipt-value { padding-left: 6px; }
    /* Align email block to the right */
    .student-detail.student-email { margin-left: auto; }
    .student-detail.student-email .receipt-label { min-width: 60px; }
    .receipt-course-section { margin: 20px 0; }
    .receipt-course-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; }
    .receipt-course-list { display: flex; flex-direction: column; gap: 8px; padding-left: 20px; }
    .receipt-course-item { display: flex; align-items: center; gap: 10px; font-size: 14px; }
    .receipt-checkbox { width: 20px; height: 20px; border: 2px solid #000; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .receipt-checkbox.checked { background: transparent; font-size: 18px; font-weight: bold; color: #000; line-height: 1; }
    .receipt-payment-mode { margin: 20px 0; font-size: 14px; }
    .receipt-payment-method.selected { text-decoration: underline; font-weight: bold; }
    .receipt-amounts { margin: 30px 0; display: flex; flex-direction: column; gap: 15px; }
    .receipt-amount-row { display: flex; align-items: center; font-size: 14px; }
    .receipt-amount-label { font-weight: bold; min-width: 180px; }
    .receipt-amount-box { min-width: 200px; text-align: right; font-size: 16px; font-weight: bold; }
    .receipt-amount-words { margin: 20px 0; padding-bottom: 15px; font-size: 14px; }
    .receipt-amount-words-value { font-style: italic; }
    .receipt-cheque-section { margin: 20px 0; padding: 15px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; page-break-inside: avoid; }
    .receipt-cheque-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 10px; }
    .receipt-cheque-field { display: flex; font-size: 13px; }
    .receipt-cheque-field strong { min-width: 120px; }
    .receipt-cheque-field span { flex: 1; padding-left: 10px; }
    .receipt-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; padding-top: 20px; border-top: 2px solid #000; page-break-inside: avoid; position: fixed; left: 10mm; right: 10mm; bottom: 8mm; width: calc(100% - 20mm); background: #fff; box-sizing: border-box; padding: 12px 16px 10px 16px; }
    .receipt-terms { font-size: 12px; }
    .receipt-terms-title { font-weight: bold; margin-bottom: 10px; }
    .receipt-terms-list { list-style: none; padding: 0; margin: 0; }
    .receipt-terms-list li { margin-bottom: 5px; position: relative; padding-left: 15px; }
    .receipt-terms-list li::before { content: '✓'; position: absolute; left: 0; font-weight: bold; }
    .receipt-signature-section { text-align: center; }
    .receipt-institution-footer { font-weight: bold; font-size: 13px; margin-bottom: 10px; padding-bottom: 0; }
    .receipt-signature-image { display:flex; justify-content:center; align-items:center; margin-top:10px; }
    .signature-image { max-width:160px; max-height:80px; object-fit:contain; }
    .receipt-signature-line { border-top: 2px solid #000; padding-top: 5px; font-weight: bold; font-size: 12px; }
    /* Cheque mode: tighter spacing and slightly smaller fonts to ensure fit on A4 */
    .cheque-mode { }
    .cheque-mode .receipt-container { max-width: 720px; padding: 8px; }
    .cheque-mode body { font-size: 12px; }
    .cheque-mode .receipt-institution-name { font-size: 16px; }
    .cheque-mode .receipt-title { font-size: 18px; }
    .cheque-mode .receipt-header { gap: 12px; padding-bottom: 6px; margin-bottom: 12px; }
    .cheque-mode .receipt-logo-placeholder, .cheque-mode img { width: 68px; height: 68px; }
    .cheque-mode .student-details-row { gap: 24px; }
    .cheque-mode .receipt-course-list { gap: 6px; }
    .cheque-mode .receipt-amount-row { gap: 8px; }
    .cheque-mode .receipt-amount-label { min-width: 140px; }
    .cheque-mode .receipt-amount-box { min-width: 160px; font-size: 14px; }
    .cheque-mode .receipt-cheque-row { gap: 12px; }
    .cheque-mode .receipt-footer { position: static; width: auto; padding: 8px 10px; box-sizing: border-box; }
    .cheque-mode .receipt-terms { font-size: 11px; }
    .cheque-mode .receipt-amount-words { font-size: 13px; }
  `;
}

// Signature is embedded in the HTML template via base64
export async function generateAndSignReceiptPDF(receiptData) {
  return await generateReceiptPDF(receiptData);
}

export { generateReceiptPDF };
