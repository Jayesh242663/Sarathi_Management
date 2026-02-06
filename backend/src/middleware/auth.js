import { supabase } from '../config/supabase.js';

/**
 * Basic auth middleware - extracts bearer token from headers OR httpOnly cookies
 * Priority: Authorization header > httpOnly cookie
 */
export default function auth(req, res, next) {
  // Try Authorization header first
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.token = authHeader.slice('Bearer '.length);
  } 
  // Fall back to httpOnly cookie
  else if (req.cookies && req.cookies.accessToken) {
    req.token = req.cookies.accessToken;
  }
  next();
}

/**
 * Require authenticated user - verifies JWT and attaches user to req
 * Use this middleware on protected routes that need authentication
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.token;
    if (!token) {
      const err = new Error('Authentication required');
      err.status = 401;
      throw err;
    }

    if (!supabase) {
      const err = new Error('Authentication service unavailable');
      err.status = 503;
      throw err;
    }

    // Verify token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const err = new Error('Invalid or expired token');
      err.status = 401;
      throw err;
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth - extracts user if token is present but doesn't fail if missing
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = req.token;
    if (token && supabase) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    // Silently fail for optional auth
    next();
  }
}

// Alias for backward compatibility
export const authenticateToken = requireAuth;
