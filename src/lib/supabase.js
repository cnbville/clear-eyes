import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL_PLACEHOLDER = 'your-supabase-url'
const SUPABASE_ANON_KEY_PLACEHOLDER = 'your-anon-key'
const FALLBACK_SUPABASE_URL = 'https://placeholder.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'placeholder-anon-key'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

function isRealValue(value, placeholder) {
  return Boolean(value) && value !== placeholder && !value.startsWith('your-')
}

export const isConfigured =
  isRealValue(supabaseUrl, SUPABASE_URL_PLACEHOLDER) &&
  isRealValue(supabaseAnonKey, SUPABASE_ANON_KEY_PLACEHOLDER)

export const supabase = createClient(
  isConfigured ? supabaseUrl : FALLBACK_SUPABASE_URL,
  isConfigured ? supabaseAnonKey : FALLBACK_SUPABASE_ANON_KEY,
)
