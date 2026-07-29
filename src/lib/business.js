const KEYS = {
  budgets: 'techsoul_budgets_v2',
  settings: 'techsoul_business_settings_v2',
  automations: 'techsoul_automations_v2',
  users: 'techsoul_users_v2'
}

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch (_) { return fallback }
}
export function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value }
export const businessKeys = KEYS
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
export const mxn = value => Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export function getBusinessSettings() {
  return readLocal(KEYS.settings, {
    nombre: 'TechSoul', telefono: '667 748 7373', direccion: 'Blvd. Jardín de las Orquídeas 2584-B, Santa Fe, Culiacán',
    validez_presupuesto: 7, anticipo_sugerido: 50,
    campos: { fotos: false, imei: false, serie: false, contrasena: false, accesorios: false, firma: false, correo: false }
  })
}
export function saveBusinessSettings(value) { return writeLocal(KEYS.settings, value) }
export function getBudgets() { return readLocal(KEYS.budgets, []) }
export function saveBudgets(value) { return writeLocal(KEYS.budgets, value) }
