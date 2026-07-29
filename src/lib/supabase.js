/**
 * Capa de compatibilidad.
 * Las vistas actuales conservan `supabase.from(...)`, pero el cliente real
 * se selecciona desde repositories/client.js.
 *
 * Así el frontend funciona hoy en local y después migra a Supabase sin
 * reescribir las pantallas.
 */
export { dataClient as supabase, resetLocalDatabase } from '../repositories/client'
export { DATA_SOURCE, isLocalMode, isSupabaseMode } from '../config/dataSource'
