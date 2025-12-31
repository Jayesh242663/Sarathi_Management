import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const decodeRole = (key) => {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    return payload?.role || null;
  } catch (err) {
    return null;
  }
};

const serviceKeyRole = serviceKey ? decodeRole(serviceKey) : null;

export const isSupabaseConfigured = Boolean(url && serviceKey);

if (!isSupabaseConfigured) {
  console.error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
} else if (serviceKeyRole !== 'service_role') {
  console.error('[supabase] SUPABASE_SERVICE_ROLE_KEY is present but does not have role "service_role". Writes will fail RLS.');
}

export const supabase = isSupabaseConfigured
  ? createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// Export the decoded role for debug checks elsewhere
export { serviceKeyRole };

export function requireSupabase() {
  if (!supabase) {
    const err = new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
    err.status = 500;
    throw err;
  }

  if (serviceKeyRole !== 'service_role') {
    const err = new Error('Supabase service key is not a service_role key. Writes will be blocked by RLS.');
    err.status = 500;
    throw err;
  }

  return supabase;
}

// Default export for backward compatibility
export default supabase;
