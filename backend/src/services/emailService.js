import nodemailer from 'nodemailer';

/**
 * Email service for sending receipt PDFs via email
 * Uses nodemailer with Gmail SMTP or any other SMTP provider
 */

// Create reusable transporter
let transporter = null;

/**
 * Initialize email transporter with SMTP configuration
 */
function getTransporter() {
  if (!transporter) {
    // Check if email configuration is provided
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email configuration not found in environment variables. Email functionality will be disabled.');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log('Email transporter initialized successfully');
  }

  return transporter;
}

/**
 * Send receipt email with PDF attachment
 * 
 * @param {string} recipientEmail - Email address to send to
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {Object} receiptData - Receipt data for email content
 * @returns {Promise<Object>} - Email send result
 */
async function sendReceiptEmail(recipientEmail, pdfBuffer, receiptData) {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    throw new Error('Email service is not configured. Please set SMTP environment variables.');
  }

  // Validate email address
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    throw new Error('Invalid email address provided');
  }

  // Validate PDF buffer
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('Invalid PDF buffer provided');
  }

  // Email subject and body
  const subject = `Payment Receipt - ${receiptData.receiptNumber}`;
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: #3e4095;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border: 1px solid #ddd;
          border-top: none;
          border-radius: 0 0 5px 5px;
        }
        .details {
          background: white;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #3e4095;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
        }
        .label {
          font-weight: bold;
          color: #555;
        }
        .value {
          color: #000;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #777;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background: #3e4095;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Payment Receipt</h1>
        <p>Sarathi School of Management & Catering Technology</p>
      </div>
      <div class="content">
        <p>Dear ${receiptData.studentName},</p>
        <p>Thank you for your payment. Please find your payment receipt attached to this email.</p>
        
        <div class="details">
          <h3 style="margin-top: 0;">Payment Details:</h3>
          <div class="details-row">
            <span class="label">Receipt Number:</span>
            <span class="value">${receiptData.receiptNumber}</span>
          </div>
          <div class="details-row">
            <span class="label">Date:</span>
            <span class="value">${new Date(receiptData.paymentDate).toLocaleDateString('en-IN', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </div>
          <div class="details-row">
            <span class="label">Amount Paid:</span>
            <span class="value">₹${parseFloat(receiptData.amount).toLocaleString('en-IN')}/-</span>
          </div>
          <div class="details-row">
            <span class="label">Payment Method:</span>
            <span class="value">${receiptData.paymentMethod.toUpperCase()}</span>
          </div>
          <div class="details-row">
            <span class="label">Course:</span>
            <span class="value">${receiptData.courseName}</span>
          </div>
        </div>

        <p>The attached PDF receipt contains complete payment details. Please keep this receipt for your records.</p>
        
        <p style="margin-top: 30px;">
          <strong>Note:</strong> This is an auto-generated email. Please do not reply to this email.
          For any queries, please contact our office.
        </p>

        <div class="footer">
          <p><strong>Sarathi School of Management & Catering Technology (SHMCT)</strong></p>
          <p>Off. No.: 8th, 3rd Floor, Nehele Apt., Shiv Mandir Road, Dombivli (East) 421 201</p>
          <p>Phone: 0251-2800090 / 9699129153 / 9029043425</p>
          <p>Email: info@sarathishmct.com | Website: www.sarathishmct.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Payment Receipt - ${receiptData.receiptNumber}

Dear ${receiptData.studentName},

Thank you for your payment. Please find your payment receipt attached to this email.

Payment Details:
- Receipt Number: ${receiptData.receiptNumber}
- Date: ${new Date(receiptData.paymentDate).toLocaleDateString('en-IN')}
- Amount Paid: ₹${parseFloat(receiptData.amount).toLocaleString('en-IN')}/-
- Payment Method: ${receiptData.paymentMethod.toUpperCase()}
- Course: ${receiptData.courseName}

The attached PDF receipt contains complete payment details. Please keep this receipt for your records.

---
Sarathi School of Management & Catering Technology (SHMCT)
Off. No.: 8th, 3rd Floor, Nehele Apt., Shiv Mandir Road, Dombivli (East) 421 201
Phone: 0251-2800090 / 9699129153 / 9029043425
Email: info@sarathishmct.com | Website: www.sarathishmct.com
  `.trim();

  // Email options
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'SHMCT Receipts'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipientEmail,
    subject: subject,
    text: textBody,
    html: htmlBody,
    attachments: [
      {
        filename: `Receipt_${receiptData.receiptNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      recipient: recipientEmail,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Verify email configuration and connection
 * 
 * @returns {Promise<boolean>} - True if connection is successful
 */
async function verifyEmailConfig() {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    return false;
  }

  try {
    await emailTransporter.verify();
    console.log('Email server connection verified successfully');
    return true;
  } catch (error) {
    console.error('Email verification failed:', error);
    return false;
  }
}

export {
  sendReceiptEmail,
  verifyEmailConfig,
  getTransporter,
};
