import { Router } from 'express';
import { requireSupabase, serviceKeyRole } from '../config/supabase.js';
import supabase from '../config/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachUserRole, requireAdmin } from '../middleware/authorize.js';
import { logPasswordChange, logRoleChange, logFailedAuth } from '../utils/auditLog.js';
import { logger } from '../utils/logger.js';

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';

// Comma-separated list of super admin emails from environment configuration
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (SUPER_ADMIN_EMAILS.length === 0) {
  console.warn('[AUTH] SUPER_ADMIN_EMAILS environment variable is not configured. Super admin features disabled.');
}

const isSuperAdminEmail = (email = '') => SUPER_ADMIN_EMAILS.includes(email.toLowerCase());

const router = Router();

/**
 * Helper function to get user profile with role
 */
async function getUserProfile(userId) {
  try {
    const sb = requireSupabase();
    const { data: profile, error } = await sb
      .from('user_profiles')
      .select('role, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('[auth] Error fetching user profile', error);
      return null;
    }

    return profile || null;
  } catch (err) {
    logger.error('[auth] Error fetching user profile', err);
    return null;
  }
}
/**
 * Helper function to create or update user profile
 */
async function ensureUserProfile(userId, email, fullName = '', role = 'auditor') {
  try {
    const sb = requireSupabase();
    
    logger.debug('[auth] Ensuring user profile');
    
    // First, check if profile exists
    const { data: existing, error: selectError } = await sb
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = no rows
      logger.error('[auth] Error checking existing profile', selectError);
    }

    if (existing) {
      logger.debug('[auth] Profile exists, updating');
      // User profile already exists, update it
      const { data, error } = await sb
        .from('user_profiles')
        .update({
          full_name: fullName || email.split('@')[0],
          role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        logger.error('[auth] Error updating user profile', error);
        return null;
      }
      logger.debug('[auth] Profile updated successfully');
      return data;
    } else {
      // New user, insert the profile
      logger.debug('[auth] Creating new profile');
      const { data, error } = await sb
        .from('user_profiles')
        .insert({
          id: userId,
          full_name: fullName || email.split('@')[0],
          role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('[auth] Error creating user profile', error);
        // Log full error details for debugging
        logger.error('[auth] Error code: ' + error.code);
        logger.error('[auth] Error details: ' + error.details);
        logger.error('[auth] Error hint: ' + error.hint);
        return null;
      }
      logger.debug('[auth] Profile created successfully');
      return data;
    }
  } catch (err) {
    logger.error('[auth] Exception in ensureUserProfile', err);
    return null;
  }
}

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) logger.debug('[auth] Login attempt');
    
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) logger.error('[auth] Supabase auth error', error);
      
      // Log failed authentication attempt
      await logFailedAuth(req, email, 'supabase_auth_error');
      
      const err = new Error(isDev ? error.message : 'Invalid email or password');
      err.status = 401;
      throw err;
    }

    if (isDev) logger.debug('[auth] User authenticated, fetching profile');
    
    // Get user profile with role
    let profile = await getUserProfile(data.user.id);

    // Auto-promote configured super admin emails
    if (isSuperAdminEmail(email)) {
      if (isDev) logger.debug('[auth] serviceKeyRole during login');
      const ensuredProfile = await ensureUserProfile(
        data.user.id,
        email,
        data.user.user_metadata?.name || '',
        'administrator'
      );
      profile = ensuredProfile || profile;
    }

    if (isDev) logger.info('[auth] Login successful');
    
    // Get full name from multiple sources with fallback
    const fullName = profile?.full_name || 
                     data.user.user_metadata?.name || 
                     data.user.user_metadata?.full_name ||
                     email.split('@')[0];
    
    // Set httpOnly cookies for tokens (secure, not accessible from JavaScript)
    // Access token: short-lived (15 minutes)
    res.cookie('accessToken', data.session.access_token, {
      httpOnly: true,
      secure: isProduction,  // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax',  // 'lax' in dev for cross-port requests
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    // Refresh token: long-lived (7 days)
    res.cookie('refreshToken', data.session.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',  // 'lax' in dev for cross-port requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    // Return user info (no tokens in response body for security)
    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || (isSuperAdminEmail(email) ? 'administrator' : 'auditor'),
        fullName: fullName,
      },
      message: 'Login successful. Session tokens set securely.',
    });
  } catch (err) {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) logger.error('[auth] Login error', err);
    next(err);
  }
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || '',
        },
      },
    });

    if (error) {
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    // Get user profile with role (if user was created)
    let profile = null;
    if (data.user) {
      profile = await getUserProfile(data.user.id);
    }

    res.json({
      success: true,
      user: data.user ? {
        ...data.user,
        role: profile?.role || 'auditor',
        fullName: profile?.full_name,
      } : null,
      session: data.session,
      message: 'Registration successful. Please check your email to confirm your account.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/magic-link
 * Send magic link for passwordless login
 */
router.post('/magic-link', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      const err = new Error('Email is required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { data, error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: process.env.FRONTEND_URL || 'http://localhost:5173',
      },
    });

    if (error) {
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    res.json({
      success: true,
      message: 'Magic link sent to your email. Please check your inbox.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Logout the current user (invalidate session and clear httpOnly cookies)
 */
router.post('/logout', async (req, res, next) => {
  try {
    const sb = requireSupabase();
    const token = req.token; // From auth middleware

    if (token) {
      // Sign out with the provided token
      const { error } = await sb.auth.signOut();
      if (error) {
        logger.error('[logout error]', error);
      }
    }

    // Clear httpOnly cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });

    res.json({ success: true, message: 'Logged out successfully. Cookies cleared.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/session
 * Get current session information
 */
router.get('/session', async (req, res, next) => {
  try {
    const token = req.token;
    if (!token) {
      const err = new Error('No session token provided');
      err.status = 401;
      throw err;
    }

    const sb = requireSupabase();
    const { data: { user }, error } = await sb.auth.getUser(token);

    if (error || !user) {
      const err = new Error('Invalid or expired session');
      err.status = 401;
      throw err;
    }

    // Get user profile with role
    let profile = await getUserProfile(user.id);

    if (isSuperAdminEmail(user.email)) {
      const ensuredProfile = await ensureUserProfile(
        user.id,
        user.email,
        user.user_metadata?.name || '',
        'administrator'
      );
      profile = ensuredProfile || profile;
    }

    const role = profile?.role || (isSuperAdminEmail(user.email) ? 'administrator' : 'auditor');
    
    // Get full name from multiple sources with fallback
    const fullName = profile?.full_name || 
                     user.user_metadata?.name || 
                     user.user_metadata?.full_name ||
                     user.email?.split('@')[0];

    res.json({
      success: true,
      user: {
        ...user,
        role,
        fullName: fullName,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      const err = new Error('Refresh token is required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { data, error } = await sb.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      const err = new Error(error.message);
      err.status = 401;
      throw err;
    }

    // Set httpOnly cookies for refreshed tokens
    res.cookie('accessToken', data.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',  // 'lax' in dev for cross-port requests
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: '/',
    });

    if (data.session.refresh_token) {
      res.cookie('refreshToken', data.session.refresh_token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',  // 'lax' in dev for cross-port requests
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    res.json({
      success: true,
      message: 'Token refreshed successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP for magic link or email verification
 */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, token, type } = req.body;
    if (!email || !token || !type) {
      const err = new Error('Email, token, and type are required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { data, error } = await sb.auth.verifyOtp({
      email,
      token,
      type, // 'email' or 'magiclink'
    });

    if (error) {
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    // Get user profile with role if user exists
    let profile = null;
    if (data.user) {
      profile = await getUserProfile(data.user.id);
    }

    res.json({
      success: true,
      user: data.user ? {
        ...data.user,
        role: profile?.role || 'auditor',
        fullName: profile?.full_name,
      } : null,
      session: data.session,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset email
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      const err = new Error('Email is required');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`,
    });

    if (error) {
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    res.json({
      success: true,
      message: 'Password reset email sent. Please check your inbox.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/update-password
 * Update password (requires valid session)
 */
router.post('/update-password', async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;
    const token = req.token;

    if (!password || !confirmPassword) {
      const err = new Error('Password and confirmation are required');
      err.status = 400;
      throw err;
    }

    if (password !== confirmPassword) {
      const err = new Error('Passwords do not match');
      err.status = 400;
      throw err;
    }

    // Validate password strength
    const MINIMUM_PASSWORD_LENGTH = 12;
    const PASSWORD_REQUIREMENTS = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/;

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      const err = new Error(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`);
      err.status = 400;
      throw err;
    }

    if (!PASSWORD_REQUIREMENTS.test(password)) {
      const err = new Error('Password must contain uppercase, lowercase, number, and special character');
      err.status = 400;
      throw err;
    }

    if (!token) {
      const err = new Error('Authentication required');
      err.status = 401;
      throw err;
    }

    const sb = requireSupabase();
    
    // Verify user first
    const { data: { user }, error: userError } = await sb.auth.getUser(token);
    if (userError || !user) {
      const err = new Error('Invalid session');
      err.status = 401;
      throw err;
    }

    // Update password
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      // Log failed password change
      await logPasswordChange(req, user.id, false);
      const err = new Error(error.message);
      err.status = 400;
      throw err;
    }

    // Log successful password change
    await logPasswordChange(req, user.id, true);

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/users
 * Get all users (administrators only)
 */
router.get('/users', authenticateToken, attachUserRole, requireAdmin, async (req, res, next) => {
  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, role, full_name, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      const err = new Error(error.message);
      err.status = 500;
      throw err;
    }

    res.json({
      success: true,
      users: profiles,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/users
 * Create a new user (administrators only)
 */
router.post('/users', authenticateToken, attachUserRole, requireAdmin, async (req, res, next) => {
  try {
    const { email, password, fullName, role } = req.body;

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.status = 400;
      throw err;
    }

    const normalizedRole = role || 'auditor';
    if (!['administrator', 'auditor'].includes(normalizedRole)) {
      const err = new Error('Role must be either administrator or auditor');
      err.status = 400;
      throw err;
    }

    const sb = requireSupabase();

    // Create Supabase auth user using service role key
    const { data: createdUser, error: createError } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: fullName || email.split('@')[0],
      },
    });

    if (createError) {
      const err = new Error(createError.message || 'Failed to create user');
      err.status = 400;
      throw err;
    }

    // Persist profile and role
    // The service role client should bypass RLS, but let's log if there's an issue
    let profile = null;
    try {
      profile = await ensureUserProfile(
        createdUser.user.id,
        email,
        fullName || email.split('@')[0],
        normalizedRole
      );
    } catch (profileError) {
      console.error('[auth] Error creating profile:', profileError);
      // Don't fail - user was created, profile creation failed
      // Return the user anyway with a warning
    }

    // If profile creation failed, try one more time with a different approach
    if (!profile) {
      try {
        const sb = requireSupabase();
        console.log('[auth] Retrying profile creation with direct insert...');
        const { data: retryProfile, error: retryError } = await sb
          .from('user_profiles')
          .insert({
            id: createdUser.user.id,
            full_name: fullName || email.split('@')[0],
            role: normalizedRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (retryError) {
          console.error('[auth] Retry failed:', retryError);
        } else {
          profile = retryProfile;
        }
      } catch (err) {
        console.error('[auth] Retry error:', err);
      }
    }

      // Fallback: explicitly update role if upsert didn't persist it
      try {
        if (!profile || profile.role !== normalizedRole) {
          const { data: updated, error: updateError } = await sb
            .from('user_profiles')
            .update({
              role: normalizedRole,
              full_name: fullName || email.split('@')[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', createdUser.user.id)
            .select()
            .single();

          if (!updateError && updated) {
            profile = updated;
          }
        }
      } catch (e) {
        console.error('[auth] Failed to enforce role assignment:', e);
      }

    res.json({
      success: true,
      user: {
        id: createdUser.user.id,
        email: createdUser.user.email,
        role: profile?.role || normalizedRole,
        fullName: profile?.full_name || fullName,
        created_at: profile?.created_at,
        updated_at: profile?.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/auth/users/:userId/role
 * Update user role (administrators only)
 */
router.put('/users/:userId/role', authenticateToken, attachUserRole, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['administrator', 'auditor'].includes(role)) {
      const err = new Error('Valid role is required (administrator or auditor)');
      err.status = 400;
      throw err;
    }

    // Get current role for audit log
    const { data: currentUser } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    const currentRole = currentUser?.role;

    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      const err = new Error(error.message);
      err.status = 500;
      throw err;
    }

    // Log role change
    if (currentRole && currentRole !== role) {
      await logRoleChange(req, userId, currentRole, role);
    }

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
