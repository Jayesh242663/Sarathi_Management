// Course options
export const COURSES = [
  { value: 'diploma_hotel_management', label: 'Diploma in Hotel Management' },
];

// Batch options (generate dynamically based on current year)
export const generateBatches = () => {
  const currentYear = new Date().getFullYear();
  const batches = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    const endYear = startYear + 1;
    batches.push({
      value: `${startYear}-${endYear.toString().slice(-2)}`,
      label: `${startYear}-${endYear.toString().slice(-2)}`,
    });
  }
  return batches;
};

// Payment methods
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

// Bank money received (for bank transfers)
export const BANK_MONEY_RECEIVED = [
  { value: 'hdfc_1_shmt', label: 'HDFC-1 (SHMT)' },
  { value: 'india_overseas', label: 'India Overseas' },
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

// Default admin credentials (for demo)
export const DEFAULT_ADMIN = {
  email: 'admin@shmct.edu',
  password: 'admin123',
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
