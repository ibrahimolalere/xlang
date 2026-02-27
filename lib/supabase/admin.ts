import { createClient } from '@supabase/supabase-js';

function isPlaceholder(value: string) {
  return (
    value.includes('your-project-id') ||
    value.includes('your-anon-key') ||
    value.includes('your-service-role-key')
  );
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables.');
  }

  if (isPlaceholder(supabaseUrl) || isPlaceholder(serviceRoleKey)) {
    throw new Error(
      'Supabase admin env vars are placeholders. Set real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
