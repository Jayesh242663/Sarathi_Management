import { requireSupabase } from '../config/supabase.js';

/**
 * Log security-sensitive operations to audit_logs table
 */
export async function logAuditEvent(req, {
  action,
  resourceType,
  resourceId,
  changes = null,
  status = 'success'
}) {
  try {
    const sb = requireSupabase();
    const userId = req.user?.id || 'system';

    const logEntry = {
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      changes: changes ? JSON.stringify(changes) : null,
      status,
      ip_address: req.ip || req.connection?.remoteAddress || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString(),
    };

    await sb.from('audit_logs').insert([logEntry]);
  } catch (err) {
    // Don't throw errors from audit logging - log to console instead
    // eslint-disable-next-line no-console
    console.error('[auditLog] Failed to log audit event:', err.message);
  }
}

/**
 * Log password change
 */
export async function logPasswordChange(req, userId, success = true) {
  await logAuditEvent(req, {
    action: 'PASSWORD_CHANGE',
    resourceType: 'user',
    resourceId: userId,
    status: success ? 'success' : 'failure',
    changes: { passwordChanged: true }
  });
}

/**
 * Log user role change
 */
export async function logRoleChange(req, userId, oldRole, newRole) {
  await logAuditEvent(req, {
    action: 'ROLE_CHANGE',
    resourceType: 'user',
    resourceId: userId,
    status: 'success',
    changes: { oldRole, newRole }
  });
}

/**
 * Log admin operations (create, update, delete)
 */
export async function logAdminOperation(req, action, resourceType, resourceId, changes = null) {
  await logAuditEvent(req, {
    action,
    resourceType,
    resourceId,
    status: 'success',
    changes
  });
}

/**
 * Log failed authentication attempts
 */
export async function logFailedAuth(req, email, reason = 'invalid_credentials') {
  try {
    const sb = requireSupabase();
    await sb.from('audit_logs').insert([{
      user_id: null,
      action: 'FAILED_LOGIN',
      resource_type: 'auth',
      resource_id: email,
      changes: JSON.stringify({ reason }),
      status: 'failure',
      ip_address: req.ip || req.connection?.remoteAddress || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString(),
    }]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auditLog] Failed to log auth attempt:', err.message);
  }
}
