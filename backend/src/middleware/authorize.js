import supabase, { requireSupabase } from '../config/supabase.js';

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (SUPER_ADMIN_EMAILS.length === 0) {
  console.warn('[AUTH] SUPER_ADMIN_EMAILS environment variable is not configured. Super admin features disabled.');
}

const isSuperAdminEmail = (email = '') => SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
const normalizeRole = (role = '') => role.toString().trim().toLowerCase();
const APP_METADATA_ROLES = new Set(['administrator', 'auditor']);

/**
 * Middleware to check user role from user_profiles table
 * Adds user role to req.user object
 */
export const attachUserRole = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Allow configured super admin emails to bypass lookup and enforce administrator role
    if (req.user.email && isSuperAdminEmail(req.user.email)) {
      req.user.role = 'administrator';
      req.user.fullName = req.user.user_metadata?.name || req.user.email;

      // Ensure a profile row exists for consistency
      try {
        const sb = requireSupabase();
        await sb
          .from('user_profiles')
          .upsert({
            id: req.user.id,
            full_name: req.user.fullName,
            role: 'administrator',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (upsertError) {
        console.error('Error ensuring super admin profile:', upsertError);
      }

      return next();
    }

    const appMetadataRole = normalizeRole(req.user.app_metadata?.role);
    if (APP_METADATA_ROLES.has(appMetadataRole)) {
      req.user.role = appMetadataRole;
      req.user.fullName = req.user.user_metadata?.name || req.user.email;

      // Ensure a profile row exists for consistency
      try {
        const sb = requireSupabase();
        await sb
          .from('user_profiles')
          .upsert({
            id: req.user.id,
            full_name: req.user.fullName,
            role: appMetadataRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (upsertError) {
        console.error('Error ensuring app metadata role profile:', upsertError);
      }

      return next();
    }

    // Fetch user profile with role
    try {
      const sb = requireSupabase();
      const { data: profile, error } = await sb
        .from('user_profiles')
        .select('role, full_name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user profile:', error);
        return res.status(500).json({ error: 'Failed to fetch user profile' });
      }

      if (!profile) {
        // Auto-create profile for users that don't have one
        // This handles cases where the database trigger didn't run
        console.log('[authorize] No profile found for user, creating default profile:', req.user.id);
        
        try {
          const { data: newProfile, error: insertError } = await sb
            .from('user_profiles')
            .insert({
              id: req.user.id,
              full_name: req.user.user_metadata?.name || req.user.email?.split('@')[0] || 'User',
              role: 'auditor',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertError) {
            console.error('[authorize] Error creating user profile:', insertError);
            return res.status(500).json({ error: 'Failed to create user profile' });
          }

          console.log('[authorize] Profile created successfully for:', req.user.id);
          req.user.role = newProfile.role;
          req.user.fullName = newProfile.full_name;
        } catch (createErr) {
          console.error('[authorize] Exception creating profile:', createErr);
          return res.status(500).json({ error: 'Failed to create user profile' });
        }
      } else {
        // Attach role and profile info to req.user
        req.user.role = profile.role;
        req.user.fullName = profile.full_name;
      }

      return next();
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
    
  } catch (error) {
    console.error('Error in attachUserRole middleware:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check if user has administrator role
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  if (req.user.role !== 'administrator') {
    return res.status(403).json({ 
      error: 'Access denied. Administrator privileges required.' 
    });
  }

  next();
};

/**
 * Middleware to check if user has either administrator or auditor role
 */
export const requireAuditorOrAdmin = (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  if (req.user.role !== 'administrator' && req.user.role !== 'auditor') {
    return res.status(403).json({ 
      error: 'Access denied. Insufficient privileges.' 
    });
  }

  next();
};

/**
 * Middleware to restrict write operations (POST, PUT, PATCH, DELETE) to administrators only
 * Allows GET requests for all authenticated users
 */
export const restrictWriteToAdmin = (req, res, next) => {
  const writeOperations = ['POST', 'PUT', 'PATCH', 'DELETE'];
  
  // If it's a write operation, require admin role
  if (writeOperations.includes(req.method)) {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (req.user.role !== 'administrator') {
      return res.status(403).json({ 
        error: 'Access denied. Only administrators can perform this action.' 
      });
    }
  }

  next();
};

/**
 * Create a middleware that requires specific roles
 * @param {string[]} roles - Array of allowed roles
 */
export const requireRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required roles: ${roles.join(', ')}` 
      });
    }

    next();
  };
};

export default {
  attachUserRole,
  requireAdmin,
  requireAuditorOrAdmin,
  restrictWriteToAdmin,
  requireRoles
};
