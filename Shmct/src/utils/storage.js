// Storage keys
// NOTE: Tokens stored in localStorage are vulnerable to XSS attacks.
// Future improvement: Migrate to HttpOnly cookies for better security.
// This requires backend changes to support cookie-based auth.
const STORAGE_KEYS = {
  STUDENTS: 'shmct_students',
  PAYMENTS: 'shmct_payments',
  USER: 'shmct_user',
  AUTH_TOKEN: 'shmct_auth_token',
  REFRESH_TOKEN: 'shmct_refresh_token',
  SELECTED_BATCH: 'shmct_selected_batch',
  CUSTOM_BATCHES: 'shmct_custom_batches',
  AUDIT_LOG: 'shmct_audit_log',
  PLACEMENTS: 'shmct_placements',
};

// Get current academic batch based on date (academic year starts in July)
export const getCurrentAcademicBatch = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  
  // If before July (month < 6), we're in the previous academic year
  const startYear = currentMonth < 6 ? currentYear - 1 : currentYear;
  const endYear = startYear + 1;
  
  return `${startYear}-${endYear.toString().slice(-2)}`;
};

// Helper functions
export const getFromStorage = (key) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error reading from localStorage: ${key}`, error);
    return null;
  }
};

export const setToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing to localStorage: ${key}`, error);
    return false;
  }
};

export const removeFromStorage = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing from localStorage: ${key}`, error);
    return false;
  }
};

export { STORAGE_KEYS };
