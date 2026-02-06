/**
 * Database Error Sanitization Utility
 * 
 * Prevents database schema leakage by converting technical error messages
 * into user-friendly messages that don't reveal table names, column names,
 * or internal structure.
 */

/**
 * Sanitize database errors to prevent schema information leakage
 * @param {Error|Object|string} error - Database error object
 * @returns {string} - Sanitized error message
 */
export function sanitizeDbError(error) {
  if (!error) return 'Operation failed';
  
  const errorMsg = (error.message || error.toString()).toLowerCase();
  
  // Foreign key constraint violations
  if (errorMsg.includes('foreign key') || errorMsg.includes('violates foreign key constraint')) {
    return 'Invalid reference to related data. Please ensure all related records exist.';
  }
  
  // Unique constraint violations
  if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
    // Try to extract which field is duplicated if safe
    if (errorMsg.includes('enrollment_number')) {
      return 'This enrollment number already exists';
    }
    if (errorMsg.includes('email')) {
      return 'This email address is already registered';
    }
    return 'This record already exists. Please use a different value.';
  }
  
  // Not-null constraint violations
  if (errorMsg.includes('null value') || errorMsg.includes('violates not-null constraint')) {
    return 'Required field is missing. Please fill in all required fields.';
  }
  
  // Row-level security policy violations
  if (errorMsg.includes('permission denied') || errorMsg.includes('policy') || errorMsg.includes('rls')) {
    return 'You do not have permission to perform this action';
  }
  
  // Check constraint violations
  if (errorMsg.includes('check constraint')) {
    return 'Invalid data provided. Please check your input values.';
  }
  
  // Generic database/table/column reference - don't leak schema
  if (errorMsg.includes('table') || 
      errorMsg.includes('column') || 
      errorMsg.includes('relation') ||
      errorMsg.includes('database') ||
      errorMsg.includes('schema')) {
    return 'Database operation failed. Please contact support if the issue persists.';
  }
  
  // Connection/timeout errors
  if (errorMsg.includes('timeout') || errorMsg.includes('connection')) {
    return 'Database connection issue. Please try again in a moment.';
  }
  
  // Default sanitized message for unknown errors
  return 'Operation failed. Please check your input and try again.';
}

/**
 * Sanitize Supabase-specific errors
 * @param {Object} error - Supabase error object
 * @returns {string} - Sanitized error message
 */
export function sanitizeSupabaseError(error) {
  if (!error) return 'Operation failed';
  
  // Check for specific Supabase error codes
  if (error.code === '23505') {
    return 'This record already exists';
  }
  
  if (error.code === '23503') {
    return 'Invalid reference to related data';
  }
  
  if (error.code === '23502') {
    return 'Required field is missing';
  }
  
  if (error.code === '42501') {
    return 'You do not have permission to perform this action';
  }
  
  // Fall back to general sanitization
  return sanitizeDbError(error);
}

export default sanitizeDbError;
