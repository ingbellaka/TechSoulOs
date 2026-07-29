/**
 * Fuente de datos de TechSoul OS.
 *
 * Desarrollo local: VITE_DATA_SOURCE=local
 * Producción Supabase: VITE_DATA_SOURCE=supabase
 */
const requestedSource = String(import.meta.env.VITE_DATA_SOURCE || 'local').toLowerCase()

export const DATA_SOURCE = requestedSource === 'supabase' ? 'supabase' : 'local'
export const isLocalMode = DATA_SOURCE === 'local'
export const isSupabaseMode = DATA_SOURCE === 'supabase'
