/**
 * Secure Logging Utility
 * 
 * Prevents sensitive data leakage in logs by:
 * - Masking full data objects in production
 * - Only logging IDs and operation types
 * - Conditional debug logging for development
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug logging - only in development
   * @param {string} message - Log message
   * @param {any} data - Optional data (type only is logged, not content)
   */
  debug: (message, data = null) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, data ? `(Type: ${typeof data})` : '');
    }
  },
  
  /**
   * Info logging - always logged
   * @param {string} message - Log message
   */
  info: (message) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  },
  
  /**
   * Error logging - always logged but sanitized
   * @param {string} message - Error message
   * @param {Error} error - Error object (only message logged, not stack in prod)
   */
  error: (message, error = null) => {
    if (isDev && error?.stack) {
      console.error(`[ERROR] ${message}`, error.stack);
    } else {
      console.error(`[ERROR] ${message}`, error?.message || '');
    }
  },
  
  /**
   * Audit logging - logs actions without sensitive data
   * SECURITY: Only logs operation type, resource ID (truncated), and user ID (truncated)
   * @param {string} action - Action type (CREATE_STUDENT, UPDATE_PAYMENT, etc)
   * @param {string} resourceId - Resource ID
   * @param {string} userId - User ID performing action
   */
  audit: (action, resourceId, userId) => {
    const maskId = (id) => id ? `${id.substring(0, 8)}...` : 'unknown';
    console.log(`[AUDIT] ${new Date().toISOString()} - ${action} - Resource: ${maskId(resourceId)} - User: ${maskId(userId)}`);
  },
  
  /**
   * Warning logging - always logged
   * @param {string} message - Warning message
   */
  warn: (message) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  }
};

export default logger;
