/**
 * CSRF Protection Middleware
 * Provides CSRF token generation and validation using csrf-csrf
 */
import { doubleCsrf } from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';

// Configure CSRF protection
const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

// CSRF protection middleware
export const csrfProtection = doubleCsrfProtection;

/**
 * Middleware to generate and attach CSRF token to response
 * Call this for endpoints that need to provide CSRF tokens
 */
export const generateCsrfToken = (req, res) => {
  const token = generateToken(req, res);
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
