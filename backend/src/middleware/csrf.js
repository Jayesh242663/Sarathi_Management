/**
 * CSRF Protection Middleware
 * Provides CSRF token generation and validation using csrf-csrf
 */
import { doubleCsrf } from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';
const csrfCookieName = isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

// CRITICAL: Validate CSRF_SECRET is set in production
if (isProduction && !process.env.CSRF_SECRET) {
  console.error('[SECURITY] FATAL: CSRF_SECRET environment variable is not set in production');
  console.error('[SECURITY] CSRF protection is DISABLED. This is a critical security issue.');
  console.error('[SECURITY] Set CSRF_SECRET environment variable and restart the application.');
  throw new Error(
    'CSRF_SECRET environment variable is required in production. '
    + 'Set CSRF_SECRET to a random 32-byte base64-encoded string: '
    + 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

// Configure CSRF protection
const {
  generateCsrfToken: generateCsrfTokenInternal,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'dev-csrf-secret-only-for-development-change-me',
  getSessionIdentifier: (req) => req.user?.id || req.ip || 'anonymous',
  cookieName: csrfCookieName,
  cookieOptions: {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'strict',  // 'none' in production for cross-origin requests
    secure: isProduction,
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

// CSRF protection middleware
export const csrfProtection = doubleCsrfProtection;

/**
 * Middleware to generate and attach CSRF token to response
 * Call this for endpoints that need to provide CSRF tokens
 */
export const generateCsrfToken = (req, res) => {
  const token = generateCsrfTokenInternal(req, res);
  res.json({ csrfToken: token });
};

/**
 * Custom error handler for CSRF errors
 */
export const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message?.includes('CSRF')) {
    // Add CORS headers for cross-origin requests
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // CSRF token errors should result in a 403
    res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'The security token is invalid. Please try again.'
    });
  } else {
    // Pass the error to the default error handler
    next(err);
  }
};
