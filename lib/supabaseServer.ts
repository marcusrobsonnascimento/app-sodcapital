import { createClient } from '@supabase/supabase-js'

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY! // NUNCA expor no client
  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  })
}
