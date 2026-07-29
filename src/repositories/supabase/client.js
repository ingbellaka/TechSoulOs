import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'TechSoul OS está configurado para Supabase, pero faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY.'
  )
}

export const supabaseClient = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
