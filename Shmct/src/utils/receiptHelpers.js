/**
 * Receipt helper functions for calculations and formatting
 */

/**
 * Convert number to words (Indian numbering system)
 * @param {number} num - The number to convert
 * @returns {string} - Number in words
 */
export const numberToWords = (num) => {
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const convertLessThanThousand = (n) => {
    if (n === 0) return '';

    if (n < 10) return ones[n];

    if (n < 20) return teens[n - 10];

    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
    }

    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertLessThanThousand(remainder) : '');
  };

  // Handle decimal places
  const [integerPart, decimalPart] = num.toString().split('.');
  const numInt = parseInt(integerPart, 10);

  if (numInt === 0) return 'Zero';

  let result = '';

  // Crore (10,000,000)
  if (numInt >= 10000000) {
    const crore = Math.floor(numInt / 10000000);
    result += convertLessThanThousand(crore) + ' Crore ';
  }

  // Lakh (100,000)
  const lakh = Math.floor((numInt % 10000000) / 100000);
  if (lakh > 0) {
    result += convertLessThanThousand(lakh) + ' Lakh ';
  }

  // Thousand
  const thousand = Math.floor((numInt % 100000) / 1000);
  if (thousand > 0) {
    result += convertLessThanThousand(thousand) + ' Thousand ';
  }

  // Remainder
  const remainder = numInt % 1000;
  if (remainder > 0) {
    result += convertLessThanThousand(remainder);
  }

  result = result.trim() + ' Rupees';

  // Add paisa if decimal part exists
  if (decimalPart && parseInt(decimalPart, 10) > 0) {
    const paisa = parseInt(decimalPart.padEnd(2, '0').substring(0, 2), 10);
    result += ' and ' + convertLessThanThousand(paisa) + ' Paisa';
  }

  return result + ' Only';
};

/**
 * Calculate receipt amounts
 * @param {Object} data - Student and payment data
 * @returns {Object} - Calculated amounts
 */
export const calculateReceiptAmounts = (data) => {
  const totalFees = parseFloat(data.totalFees || 0);
  const discount = parseFloat(data.discount || 0);
  const paidAmount = parseFloat(data.paidAmount || 0);
  const currentPayment = parseFloat(data.currentPayment || 0);

  // Calculate net fees after discount
  const netFees = totalFees - discount;

  // Calculate outstanding amount (before current payment)
  const outstandingAmount = netFees - paidAmount;

  // Received amount is the current payment
  const receivedAmount = currentPayment;

  // Calculate balance amount (after current payment)
  const balanceAmount = outstandingAmount - receivedAmount;

  return {
    totalFees,
    discount,
    netFees,
    previouslyPaid: paidAmount,
    outstandingAmount,
    receivedAmount,
    balanceAmount,
  };
};

/**
 * Format date for receipt display (DD/MM/YYYY)
 * @param {string|Date} date - The date to format
 * @returns {string} - Formatted date
 */
export const formatReceiptDate = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
};

/**
 * Format amount with comma separators (Indian style)
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted amount
 */
export const formatAmount = (amount) => {
  if (amount === null || amount === undefined) return '0.00';
  
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';
  
  // Format with 2 decimal places
  const formatted = num.toFixed(2);
  
  // Add comma separators (Indian style)
  const [integer, decimal] = formatted.split('.');
  const lastThree = integer.substring(integer.length - 3);
  const otherNumbers = integer.substring(0, integer.length - 3);
  
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (otherNumbers ? ',' : '') + lastThree;
  
  return formattedInteger + '.' + decimal;
};

/**
 * Get payment method display label
 * @param {string} method - Payment method code
 * @returns {string} - Display label
 */
export const getPaymentMethodLabel = (method) => {
  const methods = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Credit/Debit Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
  };
  
  return methods[method] || method;
};

/**
 * Get course display name for receipt
 * @param {string} courseName - Course name from database
 * @returns {number} - Course index for checkbox (1-5)
 */
export const getCourseCheckboxIndex = (courseName) => {
  const courseMap = {
    'BSC. in Hotel Management': 1,
    'BSC in Hotel Management': 1,
    'Diploma in Hotel Management': 2,
    'International Diploma in Hotel Management': 3,
  };
  
  return courseMap[courseName] || 5; // Default to "Other"
};
