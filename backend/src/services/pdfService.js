import PDFDocument from 'pdfkit';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Colours & layout constants ──────────────────────────────────────────
const BRAND   = '#3e4095';
const BLACK   = '#000000';
const PAGE_W  = 595.28;   // A4 pt
const PAGE_H  = 841.89;
const M_LEFT  = 40;
const M_RIGHT = 40;
const M_TOP   = 30;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;

// ── Cached assets (loaded once) ─────────────────────────────────────────
let cachedLogo = null;
let cachedSignature = null;

async function loadLogo() {
  if (cachedLogo !== null) return cachedLogo;
  try {
    const logoPath = path.join(__dirname, 'favicon.png');
    cachedLogo = await fs.readFile(logoPath);
    console.log('[PDF] Logo cached from', logoPath);
  } catch {
    console.warn('[PDF] Logo not found — will skip.');
    cachedLogo = false;
  }
  return cachedLogo;
}

async function loadSignature() {
  if (cachedSignature !== null) return cachedSignature;
  try {
    const signatureUrl = process.env.SIGNATURE_PATH;
    if (!signatureUrl) { cachedSignature = false; return cachedSignature; }
    const res = await fetch(signatureUrl);
    if (!res.ok) throw new Error(res.statusText);
    cachedSignature = Buffer.from(await res.arrayBuffer());
    console.log('[PDF] Signature cached from URL');
  } catch (err) {
    console.warn('[PDF] Could not load signature:', err?.message);
    cachedSignature = false;
  }
  return cachedSignature;
}

// ── Institution info ────────────────────────────────────────────────────
const INST = {
  fullName: 'Sarathi School of Management & Catering Technology',
  shortName: 'SHMCT',
  approval: 'Approved By NCVSTE New Delhi, Recognized By Govt. of India',
  address: 'Off. No.: 8th, 3rd Floor, Nehele Apt., Shiv Mandir Road, Dombivli (East) 421 201.',
  phone: '0251-2800090 / 9699129153 / 9029043425',
  email: 'info@sarathishmct.com',
  website: 'www.sarathishmct.com',
  terms: [
    'Fees Once Paid will not be Refunded.',
    'Cheque Bounce Charges are Rs. 1,000/-',
  ],
};

const COURSE_OPTIONS = [
  { id: 1, label: 'BSC in Hotel Management' },
  { id: 2, label: 'Diploma in Hotel Management' },
  { id: 3, label: 'International Diploma in Hotel Management' },
  { id: 4, label: 'Certificate in' },
  { id: 5, label: 'Others' },
];

// ── Helpers ─────────────────────────────────────────────────────────────
function formatAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';
  const [integer, decimal] = num.toFixed(2).split('.');
  const lastThree = integer.substring(integer.length - 3);
  const other = integer.substring(0, integer.length - 3);
  const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (other ? ',' : '') + lastThree;
  return formatted + '.' + decimal;
}

function formatReceiptDate(dateString) {
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function getPaymentMethodLabel(method) {
  const m = { cash: 'Cash', upi: 'Gpay / Phonpay / PTM', cheque: 'Cheque', card: 'Credit/Debit Card', bank_transfer: 'Bank Transfer' };
  return m[method] || method;
}

function getCourseIndex(courseName) {
  if (!courseName) return 5;
  const n = String(courseName)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (n.includes('international diploma hotel management')) return 3;
  if (n.includes('international') && n.includes('diploma')) return 3;
  if (n === 'idhm 001' || n === 'idhm001' || n.includes('idhm')) return 3;

  if (n.includes('bsc') && n.includes('hotel')) return 1;
  if (n.includes('diploma') && n.includes('hotel')) return 2;
  if (n === 'dhm 001' || n === 'dhm001' || n.includes('diploma hotel management')) return 2;
  if (n.includes('certificate')) return 4;
  return 5;
}

function calculateReceiptAmounts({ totalFees, discount, paidAmount, currentPayment }) {
  const total = parseFloat(totalFees) || 0;
  const disc  = parseFloat(discount) || 0;
  const paid  = parseFloat(paidAmount) || 0;
  const curr  = parseFloat(currentPayment) || 0;
  const applicableDiscount = paid === 0 ? disc : 0;
  const netTotal = total - disc;
  return {
    totalFees: total,
    discount: applicableDiscount,
    netTotal,
    previouslyPaid: paid,
    receivedAmount: curr,
    totalPaid: paid + curr,
    balanceAmount: Math.max(0, netTotal - paid - curr),
  };
}

function numberToWords(num) {
  let amount = Math.floor(parseFloat(num));
  if (amount === 0) return 'Zero Rupees Only';

  const ones  = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens  = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n === 0) return '';
    if (n < 10)  return ones[n];
    if (n < 20)  return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
  }

  let words = '';
  if (amount >= 10000000) { words += convert(Math.floor(amount / 10000000)) + ' Crore '; amount %= 10000000; }
  if (amount >= 100000)   { words += convert(Math.floor(amount / 100000))   + ' Lakh ';  amount %= 100000; }
  if (amount >= 1000)     { words += convert(Math.floor(amount / 1000))     + ' Thousand '; amount %= 1000; }
  if (amount > 0)         { words += convert(amount); }
  return words.trim() + ' Rupees Only';
}

// ── PDF drawing helpers ─────────────────────────────────────────────────
function drawLine(doc, x1, y, x2, color = '#000', width = 1) {
  doc.save().lineWidth(width).strokeColor(color).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function drawCheckbox(doc, x, y, checked) {
  const size = 12;
  doc.save().lineWidth(1.5).strokeColor(BLACK).rect(x, y, size, size).stroke().restore();
  if (checked) {
    // Draw a checkmark using lines instead of text (more reliable across environments)
    doc.save()
      .lineWidth(1.5)
      .strokeColor(BLACK)
      .moveTo(x + 2, y + size / 2)
      .lineTo(x + size / 2 - 1, y + size - 3)
      .lineTo(x + size - 2, y + 2)
      .stroke()
      .restore();
  }
}

// ── Main PDF generator ──────────────────────────────────────────────────
/**
 * Generate receipt PDF using PDFKit (native vector PDF, no browser).
 *
 * @param {Object} receiptData - Receipt data to render
 * @returns {Promise<Buffer>} - PDF as buffer
 */
async function generateReceiptPDF(receiptData) {
  // Preload assets in parallel
  const [logo, signature] = await Promise.all([loadLogo(), loadSignature()]);

  const amounts = calculateReceiptAmounts({
    totalFees: receiptData.totalFees,
    discount: receiptData.discount || 0,
    paidAmount: receiptData.previouslyPaid || 0,
    currentPayment: receiptData.amount,
  });

  const isCheque = receiptData.paymentMethod === 'cheque';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: M_TOP, bottom: 30, left: M_LEFT, right: M_RIGHT },
        info: {
          Title: `Receipt ${receiptData.receiptNumber}`,
          Author: INST.shortName,
          Subject: 'Payment Receipt',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[PDF] Generated ${buffer.length} bytes`);
        resolve(buffer);
      });
      doc.on('error', reject);

      let y = M_TOP;

      // ─── WATERMARK ────────────────────────────────────────────────
      if (receiptData.showWatermark) {
        doc.save()
          .translate(PAGE_W / 2, PAGE_H / 2)
          .rotate(-45)
          .fontSize(90)
          .fillColor(BLACK)
          .opacity(0.04)
          .text('COPY', -180, -45, { align: 'center' })
          .restore();
      }

      // ─── LOGO + HEADER ────────────────────────────────────────────
      const logoW = 65;
      const logoH = 65;
      const headerTextX = M_LEFT + logoW + 15;
      const headerTextW = CONTENT_W - logoW - 15;

      if (logo) {
        doc.image(logo, M_LEFT, y, { width: logoW, height: logoH });
      }

      // Institution name
      doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND)
        .text(INST.fullName + ' \u2122', headerTextX, y, { width: headerTextW, align: 'center' });
      y = doc.y + 3;

      // Approval text
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK)
        .text(INST.approval, headerTextX, y, { width: headerTextW, align: 'center' });
      y = doc.y + 2;

      // Address
      doc.font('Helvetica').fontSize(7.5).fillColor(BLACK)
        .text(INST.address, headerTextX, y, { width: headerTextW, align: 'center' });
      y = doc.y + 1;

      // Phone
      doc.text(`Phone : ${INST.phone}`, headerTextX, y, { width: headerTextW, align: 'center' });
      y = doc.y + 1;

      // Email & Website
      doc.text(`Web.: Email : ${INST.email}   Web : ${INST.website}`, headerTextX, y, { width: headerTextW, align: 'center' });

      y = Math.max(doc.y, M_TOP + logoH) + 8;

      // Header underline
      drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, BRAND, 2.5);
      y += 12;

      // ─── RECEIPT TITLE ─────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK)
        .text('RECEIPT', M_LEFT, y, { width: CONTENT_W, align: 'center' });
      y = doc.y + 10;

      // ─── Receipt No & Date ─────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK);
      doc.text(`Receipt No. ${receiptData.receiptNumber}`, M_LEFT, y);
      doc.text(`Date : ${formatReceiptDate(receiptData.paymentDate)}`, M_LEFT, y, { width: CONTENT_W, align: 'right' });
      y = doc.y + 4;
      drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, '#dddddd');
      y += 10;

      // ─── Student Name & Email ──────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
        .text('Student Name :', M_LEFT, y, { continued: true })
        .font('Helvetica').text('  ' + String(receiptData.studentName || '').toUpperCase());

      const emailStr = receiptData.studentEmail || receiptData.email || '';
      if (emailStr) {
        doc.font('Helvetica-Bold').fontSize(10)
          .text('Gmail :', PAGE_W - M_RIGHT - 250, y, { continued: true, width: 250, align: 'right' })
          .font('Helvetica').text('  ' + emailStr);
      }
      y = doc.y + 6;
      drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, '#dddddd');
      y += 12;

      // ─── Course checkboxes ─────────────────────────────────────────
      const selectedCourse = getCourseIndex(receiptData.courseName);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
        .text('Course :', M_LEFT, y);
      y = doc.y + 8;

      COURSE_OPTIONS.forEach((course) => {
        drawCheckbox(doc, M_LEFT + 16, y, course.id === selectedCourse);
        doc.font('Helvetica').fontSize(10).fillColor(BLACK)
          .text(course.label, M_LEFT + 34, y + 1);
        y = doc.y + 6;
      });

      y += 4;
      drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, '#dddddd');
      y += 12;

      // ─── Payment Mode ──────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
        .text('Payment mode : ', M_LEFT, y, { continued: true })
        .font('Helvetica-Bold').fontSize(10)
        .text(getPaymentMethodLabel(receiptData.paymentMethod), { underline: true });
      y = doc.y + 14;

      // ─── Amount Details ────────────────────────────────────────────
      const labelX = M_LEFT;
      const valueX = M_LEFT + 200;
      const lineGap = 22;

      const drawAmountRow = (label, value) => {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BLACK)
          .text(label, labelX, y);
        doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK)
          .text(`${formatAmount(value)}/-`, valueX, y - 1, { width: CONTENT_W - 200, align: 'right' });
        y += lineGap;
      };

      if (amounts.previouslyPaid === 0) {
        drawAmountRow('Total Fees :', amounts.totalFees);
        if (amounts.discount > 0) {
          drawAmountRow('Discount :', amounts.discount);
        }
      } else {
        drawAmountRow('Fees Paid Until Now :', amounts.previouslyPaid);
      }
      drawAmountRow('Received Amount :', amounts.receivedAmount);
      drawAmountRow('Balance Amount :', amounts.balanceAmount);

      y += 4;

      // ─── Amount in words ───────────────────────────────────────────
      const wordsText = numberToWords(amounts.receivedAmount);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
        .text('Payment Received in word : ', M_LEFT, y, { continued: true })
        .font('Helvetica-Oblique').text(wordsText);
      y = doc.y + 12;

      // ─── Cheque details ────────────────────────────────────────────
      if (isCheque) {
        drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, BLACK);
        y += 10;

        const col2X = M_LEFT + CONTENT_W / 2 + 10;
        const chqFieldW = CONTENT_W / 2 - 20;

        const drawChequeField = (label, value, x) => {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
            .text(label, x, y, { continued: true, width: chqFieldW })
            .font('Helvetica').text('  ' + (value || '___________________'));
        };

        drawChequeField('Cheque No. :', receiptData.chequeNumber, M_LEFT);
        drawChequeField('Cheque Amount :', receiptData.chequeNumber ? formatAmount(amounts.receivedAmount) : null, col2X);
        y = doc.y + 8;

        drawChequeField('Cheque Date :', receiptData.chequeNumber ? formatReceiptDate(receiptData.paymentDate) : null, M_LEFT);
        drawChequeField('Bank Name :', receiptData.bankAccount, col2X);
        y = doc.y + 8;

        drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, BLACK);
        y += 12;
      }

      // ─── FOOTER — terms + signature ────────────────────────────────
      // Calculate footer position — keep at bottom of page
      const footerY = Math.max(y + 30, PAGE_H - 170);
      y = footerY;

      drawLine(doc, M_LEFT, y, PAGE_W - M_RIGHT, BLACK, 1.5);
      y += 10;

      // Terms (left column)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
        .text('TERMS :', M_LEFT, y);
      y = doc.y + 4;

      INST.terms.forEach((term) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(BLACK)
          .text(`\u2713  ${term}`, M_LEFT + 4, y);
        y = doc.y + 3;
      });

      // Signature (right column)
      const sigBlockX = PAGE_W - M_RIGHT - 200;
      let sigY = footerY + 10;

      doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
        .text(INST.fullName + '.', sigBlockX, sigY, { width: 200, align: 'center' });
      sigY = doc.y + 6;

      if (signature) {
        doc.image(signature, sigBlockX + 30, sigY, { width: 140, height: 55, fit: [140, 55] });
        sigY += 60;
      } else {
        sigY += 40;
      }

      drawLine(doc, sigBlockX + 20, sigY, sigBlockX + 180, BLACK, 1.5);
      sigY += 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK)
        .text('Authorised Signature', sigBlockX, sigY, { width: 200, align: 'center' });

      // ─── Done ──────────────────────────────────────────────────────
      doc.end();
    } catch (err) {
      reject(new Error(`PDF generation failed: ${err.message}`));
    }
  });
}

export async function generateAndSignReceiptPDF(receiptData) {
  return await generateReceiptPDF(receiptData);
}

export { generateReceiptPDF };
