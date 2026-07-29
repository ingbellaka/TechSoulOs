import { normalize } from './pricing'

const SERVICE_ALIASES = {
  pantalla: ['pantalla', 'display', 'lcd', 'oled', 'incell', 'display completo'],
  bateria: ['bateria', 'battery', 'pila'],
  tapa: ['tapa', 'tapa trasera', 'back glass', 'cristal trasero'],
  carga: ['centro de carga', 'puerto de carga', 'conector de carga', 'carga'],
  camara: ['camara', 'cámara', 'cristal de camara', 'lente'],
  diagnostico: ['diagnostico', 'diagnóstico', 'revision', 'revisión']
}

const QUALITY_ALIASES = {
  incell: ['incell'],
  oled: ['oled'],
  'soft oled': ['soft oled', 'oled flexible'],
  premium: ['premium', 'tipo original', 'original'],
  'alta capacidad': ['alta capacidad', 'high capacity']
}

const normalizeKey = (value) => normalize(value).replace(/\s+/g, ' ').trim()

export function uniqueRates(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    if (row.activo === false) return false
    const key = [row.marca, row.modelo, row.servicio, row.calidad, Number(row.precio_publico || 0)]
      .map(normalizeKey)
      .join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function containsAlias(text, aliases) {
  const n = normalizeKey(text)
  return aliases.some((alias) => n.includes(normalizeKey(alias)))
}

export function detectIntent(text, rates = []) {
  const n = normalizeKey(text)
  const cleanRates = uniqueRates(rates)
  const models = [...new Set(cleanRates.map((r) => r.modelo).filter(Boolean))]
    .sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
  const brands = [...new Set(cleanRates.map((r) => r.marca).filter(Boolean))]
    .sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)

  const model = models.find((value) => n.includes(normalizeKey(value))) || ''
  const brand = brands.find((value) => n.includes(normalizeKey(value))) || ''

  let service = ''
  for (const [canonical, aliases] of Object.entries(SERVICE_ALIASES)) {
    if (containsAlias(n, aliases)) {
      service = canonical
      break
    }
  }

  let quality = ''
  for (const [canonical, aliases] of Object.entries(QUALITY_ALIASES)) {
    if (containsAlias(n, aliases)) {
      quality = canonical
      break
    }
  }

  const followUp = /(seguimiento|pendiente|presupuesto)/.test(n)
  const samsungOverview = n.includes('samsung') && /(precio|tarifa|tengo|lista)/.test(n)

  return { raw: text, normalized: n, model, brand, service, quality, followUp, samsungOverview }
}

function sameService(rateService, requestedService) {
  if (!requestedService) return true
  const service = normalizeKey(rateService)
  const requested = normalizeKey(requestedService)
  if (service === requested) return true
  return service.includes(requested) || requested.includes(service)
}

function sameQuality(rateQuality, requestedQuality) {
  if (!requestedQuality) return true
  const quality = normalizeKey(rateQuality)
  const requested = normalizeKey(requestedQuality)
  if (quality === requested) return true
  return quality.includes(requested) || requested.includes(quality)
}

function updatedTimestamp(rate) {
  const value = Date.parse(rate.actualizado_en || rate.updated_at || rate.created_at || '')
  return Number.isFinite(value) ? value : 0
}

/**
 * Agrupa coincidencias por marca + modelo + servicio + calidad.
 * Cuando existen tarifas contradictorias, conserva una sola opción:
 * 1) registro actualizado más recientemente;
 * 2) si no hay fechas útiles, el precio mayor para evitar cotizar una tarifa vieja demasiado baja.
 */
export function consolidateRates(rows = []) {
  const groups = new Map()
  uniqueRates(rows).forEach((rate) => {
    const key = [rate.marca, rate.modelo, rate.servicio, rate.calidad].map(normalizeKey).join('|')
    const current = groups.get(key)
    if (!current) {
      groups.set(key, rate)
      return
    }

    const currentDate = updatedTimestamp(current)
    const candidateDate = updatedTimestamp(rate)
    if (candidateDate > currentDate) {
      groups.set(key, rate)
      return
    }
    if (candidateDate === currentDate && Number(rate.precio_publico || 0) > Number(current.precio_publico || 0)) {
      groups.set(key, rate)
    }
  })
  return [...groups.values()]
}

export function findRateConflicts(rows = []) {
  const groups = new Map()
  uniqueRates(rows).forEach((rate) => {
    const key = [rate.marca, rate.modelo, rate.servicio, rate.calidad].map(normalizeKey).join('|')
    const list = groups.get(key) || []
    list.push(rate)
    groups.set(key, list)
  })
  return [...groups.values()]
    .filter((group) => new Set(group.map((rate) => Number(rate.precio_publico || 0))).size > 1)
    .map((group) => ({
      marca: group[0].marca,
      modelo: group[0].modelo,
      servicio: group[0].servicio,
      calidad: group[0].calidad,
      precios: [...new Set(group.map((rate) => Number(rate.precio_publico || 0)))].sort((a, b) => a - b),
      cantidad: group.length
    }))
}

export function matchRates(intent, rates = []) {
  const cleanRates = uniqueRates(rates)
  const requestedModel = normalizeKey(intent.model)
  const requestedBrand = normalizeKey(intent.brand)

  const filtered = cleanRates.filter((rate) => {
    const model = normalizeKey(rate.modelo)
    const brand = normalizeKey(rate.marca)

    // Reglas estrictas: si se detectó modelo o marca, deben coincidir exactamente.
    // iPhone 13 nunca puede mezclar iPhone 13 Pro, Pro Max, mini u otros modelos.
    if (requestedModel && model !== requestedModel) return false
    if (requestedBrand && brand !== requestedBrand) return false
    if (!sameService(rate.servicio, intent.service)) return false
    if (!sameQuality(rate.calidad, intent.quality)) return false

    // Si no se detectó modelo, solo aceptar un modelo que aparezca literalmente en la solicitud.
    if (!requestedModel && intent.normalized && model && !intent.normalized.includes(model)) return false
    return true
  })

  return consolidateRates(filtered)
    .sort((a, b) => {
      const serviceCompare = normalizeKey(a.servicio).localeCompare(normalizeKey(b.servicio), 'es')
      if (serviceCompare) return serviceCompare
      const qualityCompare = normalizeKey(a.calidad).localeCompare(normalizeKey(b.calidad), 'es')
      if (qualityCompare) return qualityCompare
      return Number(a.precio_publico || 0) - Number(b.precio_publico || 0)
    })
}

export function warrantyFor(rate) {
  const service = normalizeKey(rate.servicio)
  const quality = normalizeKey(rate.calidad)
  if (service.includes('bateria') && quality.includes('alta capacidad')) return '6 meses de garantía'
  if (service.includes('bateria')) return '2 meses de garantía'
  if (service.includes('pantalla') && quality.includes('oled')) return '3 meses de garantía en touch'
  if (service.includes('pantalla')) return '2 meses de garantía en touch'
  return 'Garantía sujeta al servicio realizado'
}

export function buildClientMessage(matches, business, money) {
  if (!matches.length) return ''
  const cleanMatches = consolidateRates(matches)
  const first = cleanMatches[0]
  const options = cleanMatches.map((rate) => {
    const label = [rate.servicio, rate.calidad].filter(Boolean).join(' ')
    return `• ${label}: ${money(rate.precio_publico)}\n  ${warrantyFor(rate)}`
  }).join('\n\n')
  return `Hola 😊 Para ${first.marca} ${first.modelo} tenemos estas opciones:\n\n${options}\n\nLos precios incluyen instalación. En pantallas también incluye cristal completo de regalo. ¿Qué opción te interesa?\n\n${business.nombre} · ${business.telefono}`
}

export function buildBudgetDraft(matches, business) {
  if (!matches.length) return null
  const cleanMatches = consolidateRates(matches)
  const first = cleanMatches[0]
  return {
    cliente: '',
    telefono: '',
    equipo: [first.marca, first.modelo].filter(Boolean).join(' '),
    vigencia: Number(business.validez_presupuesto || 7),
    notas: 'Precios sujetos a diagnóstico físico del equipo. Instalación incluida.',
    estado: 'Borrador',
    conceptos: cleanMatches.map((rate) => ({
      descripcion: [rate.servicio, rate.calidad].filter(Boolean).join(' '),
      cantidad: 1,
      precio: Number(rate.precio_publico || 0),
      garantia: warrantyFor(rate)
    }))
  }
}
