import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// When env vars are missing, Supabase is effectively disabled.
// This prevents runtime errors and lets the app work without a backend.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
        },
      })
    : null

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Disabled – VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Using local/mock data instead.'
  )
}

