// Course options
export const COURSES = [
  { value: 'diploma_hotel_management', label: 'Diploma in Hotel Management' },
];

// Note: Batches are now loaded from Supabase database dynamically
// No longer using hardcoded batch generation

// Payment methods
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

// Bank money received (for bank transfers, UPI, card, cheque)
export const BANK_MONEY_RECEIVED = [
  { value: 'hdfc_1_shmt', label: 'HDFC-1 (SHMT)' },
  { value: 'india_overseas', label: 'India Overseas' },
  { value: 'tgsb', label: 'TGSB' },
];

// Student status options
export const STUDENT_STATUS = [
  { value: 'active', label: 'Active', color: 'green' },
  { value: 'graduated', label: 'Graduated', color: 'blue' },
  { value: 'dropped', label: 'Dropped Out', color: 'red' },
  { value: 'on_leave', label: 'On Leave', color: 'yellow' },
];

// Fee status
export const FEE_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  PENDING: 'pending',
  OVERDUE: 'overdue',
};

// Default admin credentials - REMOVED FOR SECURITY
// Demo credentials should be provided via environment variables
// or configured through a secure admin setup process
// DO NOT hardcode credentials in source code
export const DEFAULT_ADMIN = {
  email: 'admin@example.com',
  password: 'CHANGE_ME_IN_PRODUCTION',
  name: 'Administrator',
  role: 'admin',
};

// Navigation items
export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/students', label: 'Students', icon: 'Users' },
  { path: '/fees', label: 'Fees & Payments', icon: 'CreditCard' },
  { path: '/reports', label: 'Reports', icon: 'FileText' },
];

// Institution information for receipts
export const INSTITUTION_INFO = {
  fullName: 'Sarathi School of Management & Catering Technology',
  shortName: 'SHMCT',
  address: 'Off. No.: 8th, 3rd Floor, Nehele Apt., Shiv Mandir Road, Dombivli (East) 421 201.',
  phone: '0251-2800090 / 9699129153 / 9029043425',
  email: 'info@sarathishmct.com',
  website: 'www.sarathishmct.com',
  logoPath: '/logo.png',
  approvalText: 'Approved By NCVSTE New Delhi, Recognized By Govt. of India',
  terms: [
    'Fees Once Paid will not be Refunded.',
    'Cheque Bounce Charges are Rs. 1,000/-'
  ]
};

// Course options for receipt display
export const COURSE_OPTIONS_RECEIPT = [
  { id: 1, label: 'BSC. in Hotel Management.' },
  { id: 2, label: 'Diploma in Hotel Management' },
  { id: 3, label: 'International Diploma in Hotel Management' },
  { id: 4, label: 'Certificate in' },
  { id: 5, label: 'Other' },
];
