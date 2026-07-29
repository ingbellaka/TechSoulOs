const KEYS = {
  rates: 'techsoul_tarifario_v1',
  quotes: 'techsoul_cotizaciones_v2',
  costs: 'techsoul_costos_historial_v1',
  settings: 'techsoul_pricing_settings_v2'
}

const screenRows = [
  ['iPhone X','Pantalla','INCELL',749],['iPhone X','Pantalla','OLED',1149],
  ['iPhone XS','Pantalla','INCELL',749],['iPhone XS','Pantalla','OLED',1149],
  ['iPhone XR','Pantalla','INCELL',749],
  ['iPhone XS Max','Pantalla','INCELL',849],['iPhone XS Max','Pantalla','OLED',1349],
  ['iPhone 11','Pantalla','INCELL',799],
  ['iPhone 11 Pro','Pantalla','INCELL',849],['iPhone 11 Pro','Pantalla','OLED',1299],
  ['iPhone 11 Pro Max','Pantalla','INCELL',849],['iPhone 11 Pro Max','Pantalla','OLED',1649],
  ['iPhone 12 Mini','Pantalla','INCELL',1549],
  ['iPhone 12 / 12 Pro','Pantalla','INCELL',1099],['iPhone 12 / 12 Pro','Pantalla','OLED',1799],
  ['iPhone 12 Pro Max','Pantalla','INCELL',1249],['iPhone 12 Pro Max','Pantalla','OLED',2249],
  ['iPhone 13 Mini','Pantalla','INCELL',1149],
  ['iPhone 13','Pantalla','INCELL',1249],['iPhone 13','Pantalla','OLED',1799],
  ['iPhone 13 Pro','Pantalla','INCELL',1549],['iPhone 13 Pro','Pantalla','OLED',2249],
  ['iPhone 13 Pro Max','Pantalla','INCELL',1699],['iPhone 13 Pro Max','Pantalla','OLED',2499],
  ['iPhone 14','Pantalla','INCELL',1750],['iPhone 14','Pantalla','OLED',2249],
  ['iPhone 14 Plus','Pantalla','INCELL',1850],
  ['iPhone 14 Pro','Pantalla','INCELL',1900],['iPhone 14 Pro','Pantalla','OLED',2999],
  ['iPhone 14 Pro Max','Pantalla','INCELL',2249],['iPhone 14 Pro Max','Pantalla','OLED',3449],
  ['iPhone 15','Pantalla','INCELL',1850],['iPhone 15 Plus','Pantalla','INCELL',1900],
  ['iPhone 15 Pro','Pantalla','INCELL',2100],['iPhone 15 Pro','Pantalla','OLED',3449],
  ['iPhone 15 Pro Max','Pantalla','INCELL',2750],['iPhone 15 Pro Max','Pantalla','OLED',3899],
  ['iPhone 16','Pantalla','INCELL',2100],['iPhone 16 Plus','Pantalla','INCELL',2750],
  ['iPhone 16 Pro','Pantalla','INCELL',3250],['iPhone 16 Pro Max','Pantalla','INCELL',3550]
]

const batteryRows = [
  ['iPhone X','Batería','Premium',749],['iPhone XS','Batería','Premium',749],['iPhone XS Max','Batería','Premium',749],['iPhone 11','Batería','Premium',749],['iPhone 11 Pro Max','Batería','Premium',1099],
  ['iPhone 12 Mini','Batería','Alta capacidad',1149],['iPhone 12 / 12 Pro','Batería','Alta capacidad',1099],['iPhone 12 Pro Max','Batería','Alta capacidad',1149],
  ['iPhone 13 Mini','Batería','Alta capacidad',1249],['iPhone 13','Batería','Alta capacidad',1249],['iPhone 13 Pro','Batería','Alta capacidad',1299],['iPhone 13 Pro Max','Batería','Alta capacidad',1399],
  ['iPhone 14','Batería','Alta capacidad',1299],['iPhone 14 Plus','Batería','Alta capacidad',1399],['iPhone 14 Pro Max','Batería','Alta capacidad',1549],
  ['iPhone 15','Batería','Alta capacidad',1349],['iPhone 15 Pro Max','Batería','Alta capacidad',1699],
  ['iPhone 16','Batería','Alta capacidad',1650],['iPhone 16 Pro','Batería','Alta capacidad',1850],['iPhone 16 Pro Max','Batería','Alta capacidad',1900]
]

const seedRates = [...screenRows, ...batteryRows].map((row, index) => ({
  id: `seed-${index + 1}`,
  marca: 'Apple', modelo: row[0], servicio: row[1], calidad: row[2],
  precio_publico: row[3], precio_minimo: Math.ceil(row[3] * .9 / 50) * 50,
  costo_actual: 0, activo: true, origen: 'Tarifario TechSoul', actualizado_en: new Date().toISOString()
}))

export const defaultPricingSettings = {
  gastos: { renta: 3500, luz: 800, internet: 500, publicidad: 500, sueldos: 8000, otros: 2000 },
  costo_operativo_inicial: 180,
  margen_minimo: 30,
  margen_recomendado: 45,
  reserva_garantia: 5,
  redondeo: 50,
  reparaciones_referencia: 80,
  riesgo: { bajo: 0, medio: 120, alto: 250, muy_alto: 450 }
}

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value }
export function getRates() { const rows = load(KEYS.rates, null); if (rows) return rows; return save(KEYS.rates, seedRates) }
export function saveRates(rows) { return save(KEYS.rates, rows) }
export function getQuotes() { return load(KEYS.quotes, []) }
export function saveQuotes(rows) { return save(KEYS.quotes, rows) }
export function getCosts() { return load(KEYS.costs, []) }
export function saveCosts(rows) { return save(KEYS.costs, rows) }
export function getPricingSettings() { return { ...defaultPricingSettings, ...load(KEYS.settings, {}) } }
export function savePricingSettings(value) { return save(KEYS.settings, value) }
export function money(value) { return Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) }
export function normalize(value) { return String(value || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
export function roundTo(value, step = 50) { const safe = Math.max(1, Number(step || 50)); return Math.ceil(Number(value || 0) / safe) * safe }
export function calculateQuote(input, settings = getPricingSettings()) {
  const piece = Number(input.costo_pieza || 0)
  const shipping = Number(input.envio || 0)
  const operation = Number(settings.costo_operativo_inicial || 0)
  const risk = Number(settings.riesgo?.[input.riesgo || 'medio'] || 0)
  const direct = piece + shipping
  const warranty = direct * (Number(settings.reserva_garantia || 0) / 100)
  const realCost = direct + operation + risk + warranty
  const minMargin = Math.min(90, Math.max(0, Number(settings.margen_minimo || 0))) / 100
  const targetMargin = Math.min(90, Math.max(0, Number(settings.margen_recomendado || 0))) / 100
  const minimum = roundTo(realCost / (1 - minMargin), settings.redondeo)
  const recommended = roundTo(realCost / (1 - targetMargin), settings.redondeo)
  return { direct, operation, risk, warranty, realCost, minimum, recommended, profit: recommended - realCost, margin: recommended ? ((recommended - realCost) / recommended) * 100 : 0 }
}
