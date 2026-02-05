/**
 * CSRF Protection Middleware
 * Provides CSRF token generation and validation using csrf-csrf
 */
import { doubleCsrf } from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';
const csrfCookieName = isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

// Configure CSRF protection
const {
  generateCsrfToken: generateCsrfTokenInternal,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  getSessionIdentifier: (req) => req.user?.id || req.ip || 'anonymous',
  cookieName: csrfCookieName,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
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
